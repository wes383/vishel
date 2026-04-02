import { spawn } from 'node:child_process'
import store, { type DataSource } from './store'

interface ProbePayload {
    url: string
    sourceId?: string
}

interface FfprobeStream {
    codec_type?: string
    width?: number
    height?: number
    codec_name?: string
    color_transfer?: string
    color_space?: string
    color_primaries?: string
    bits_per_raw_sample?: string
    pix_fmt?: string
    side_data_list?: Array<{ side_data_type?: string }>
    r_frame_rate?: string
    bit_rate?: string
    channels?: number
}

interface FfprobeFormat {
    duration?: string
    size?: string
    bit_rate?: string
}

interface FfprobeOutput {
    streams?: FfprobeStream[]
    format?: FfprobeFormat
}

export interface VideoProbeMetadata {
    width: number | null
    height: number | null
    codec: string | null
    isHdr: boolean | null
    hdrType: string | null
    bitDepth: number | null
    frameRate: number | null
    duration: number | null
    fileSize: number | null
    bitrate: number | null
    audioCodec: string | null
    audioChannels: number | null
}

const probeCache = new Map<string, VideoProbeMetadata | null>()
const pendingProbes = new Map<string, Promise<VideoProbeMetadata | null>>()

const parseBitDepth = (stream: FfprobeStream): number | null => {
    if (stream.bits_per_raw_sample) {
        const parsed = parseInt(stream.bits_per_raw_sample, 10)
        if (!Number.isNaN(parsed) && parsed > 0) {
            return parsed
        }
    }
    const pixFmt = stream.pix_fmt || ''
    const match = pixFmt.match(/p(\d{2})(?:le|$)/)
    if (match) {
        const parsed = parseInt(match[1], 10)
        if (!Number.isNaN(parsed) && parsed > 0) {
            return parsed
        }
    }
    return null
}

const detectHdrType = (stream: FfprobeStream): { isHdr: boolean | null; hdrType: string | null } => {
    const transfer = (stream.color_transfer || '').toLowerCase()
    const sideDataTypes = (stream.side_data_list || []).map(item => (item.side_data_type || '').toLowerCase())

    if (transfer === 'smpte2084') {
        if (sideDataTypes.some(type => type.includes('dovi') || type.includes('dolby vision'))) {
            return { isHdr: true, hdrType: 'Dolby Vision' }
        }
        if (sideDataTypes.some(type => type.includes('hdr10+') || type.includes('dynamic hdr') || type.includes('hdr dynamic'))) {
            return { isHdr: true, hdrType: 'HDR10+' }
        }
        return { isHdr: true, hdrType: 'HDR10' }
    }

    if (transfer === 'arib-std-b67') {
        return { isHdr: true, hdrType: 'HLG' }
    }

    if (sideDataTypes.some(type => type.includes('mastering display') || type.includes('content light level'))) {
        return { isHdr: true, hdrType: 'HDR' }
    }

    if (transfer && transfer !== 'bt709') {
        return { isHdr: true, hdrType: 'HDR' }
    }

    if (transfer === 'bt709' || transfer === '') {
        return { isHdr: false, hdrType: null }
    }

    return { isHdr: null, hdrType: null }
}

const parseFrameRate = (frameRateStr?: string): number | null => {
    if (!frameRateStr) return null
    const match = frameRateStr.match(/(\d+)\/(\d+)/)
    if (match) {
        const num = parseInt(match[1], 10)
        const den = parseInt(match[2], 10)
        if (den !== 0) {
            return Math.round((num / den) * 100) / 100
        }
    }
    return null
}

const getAuthUrl = (url: string, sourceId?: string): string => {
    const sources = (store.get('sources') as DataSource[]) || []
    let matchedSource: DataSource | undefined
    if (sourceId) {
        matchedSource = sources.find((source) => source.id === sourceId)
    }
    if (!matchedSource) {
        matchedSource = [...sources]
            .sort((a, b) => (b.config?.url || '').length - (a.config?.url || '').length)
            .find((source) => source.config?.url && url.startsWith(source.config.url))
    }
    const username = matchedSource?.config?.username || ''
    const password = matchedSource?.config?.password || ''
    if (!username || !password) {
        return url
    }
    try {
        const urlObj = new URL(url)
        urlObj.username = username
        urlObj.password = password
        return urlObj.toString()
    } catch {
        return url
    }
}

const runFfprobe = (target: string): Promise<FfprobeOutput> => {
    return new Promise((resolve, reject) => {
        const args = ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', target]
        console.log(`[probeVideoMetadata] Running ffprobe command: ffprobe ${args.join(' ')}`)
        const child = spawn('ffprobe', args, { windowsHide: true })
        let stdout = ''
        let stderr = ''
        const timer = setTimeout(() => {
            console.warn(`[probeVideoMetadata] ffprobe timeout for: ${target}`)
            child.kill()
            reject(new Error('ffprobe timeout'))
        }, 8000)

        child.stdout.on('data', (data) => {
            stdout += data.toString()
        })
        child.stderr.on('data', (data) => {
            stderr += data.toString()
        })
        child.on('error', (error) => {
            clearTimeout(timer)
            console.error(`[probeVideoMetadata] ffprobe spawn error: ${error.message}`)
            reject(error)
        })
        child.on('close', (code) => {
            clearTimeout(timer)
            if (code !== 0) {
                console.warn(`[probeVideoMetadata] ffprobe exit code ${code}, stderr: ${stderr}`)
                reject(new Error(stderr || `ffprobe exit code ${code}`))
                return
            }
            try {
                resolve(JSON.parse(stdout) as FfprobeOutput)
            } catch (error) {
                console.error(`[probeVideoMetadata] ffprobe JSON parse error: ${(error as Error).message}`)
                reject(error)
            }
        })
    })
}

export const probeVideoMetadata = async ({ url, sourceId }: ProbePayload): Promise<VideoProbeMetadata | null> => {
    const authUrl = getAuthUrl(url, sourceId)
    const cacheKey = `${sourceId || 'none'}|${authUrl}`
    if (probeCache.has(cacheKey)) {
        console.log(`[probeVideoMetadata] Cache hit for: ${url}`)
        return probeCache.get(cacheKey) || null
    }
    if (pendingProbes.has(cacheKey)) {
        console.log(`[probeVideoMetadata] Waiting for pending probe: ${url}`)
        return pendingProbes.get(cacheKey) || null
    }
    const doProbe = async (): Promise<VideoProbeMetadata | null> => {
        try {
            console.log(`[probeVideoMetadata] Probing URL: ${url}`)
            console.log(`[probeVideoMetadata] Auth URL: ${authUrl}`)
            let result: FfprobeOutput
            try {
                console.log(`[probeVideoMetadata] Running ffprobe with auth URL...`)
                result = await runFfprobe(authUrl)
                console.log(`[probeVideoMetadata] ffprobe succeeded with auth URL`)
            } catch (error) {
                console.warn(`[probeVideoMetadata] ffprobe failed with auth URL: ${(error as Error).message}`)
                if (authUrl !== url) {
                    console.log(`[probeVideoMetadata] Retrying with original URL...`)
                    result = await runFfprobe(url)
                } else {
                    throw error
                }
            }
            const videoStream = (result.streams || []).find((stream) => stream.codec_type === 'video')
            if (!videoStream) {
                console.warn(`[probeVideoMetadata] No video stream found for: ${url}`)
                probeCache.set(cacheKey, null)
                return null
            }

            const audioStream = (result.streams || []).find((stream) => stream.codec_type === 'audio')
            const hdrInfo = detectHdrType(videoStream)

            const metadata: VideoProbeMetadata = {
                width: typeof videoStream.width === 'number' ? videoStream.width : null,
                height: typeof videoStream.height === 'number' ? videoStream.height : null,
                codec: videoStream.codec_name || null,
                isHdr: hdrInfo.isHdr,
                hdrType: hdrInfo.hdrType,
                bitDepth: parseBitDepth(videoStream),
                frameRate: parseFrameRate(videoStream.r_frame_rate),
                duration: result.format?.duration ? parseFloat(result.format.duration) : null,
                fileSize: result.format?.size ? parseInt(result.format.size, 10) : null,
                bitrate: result.format?.bit_rate ? parseInt(result.format.bit_rate, 10) : null,
                audioCodec: audioStream?.codec_name || null,
                audioChannels: audioStream?.channels || null
            }
            console.log(`[probeVideoMetadata] Success for ${url}:`, metadata)
            probeCache.set(cacheKey, metadata)
            return metadata
        } catch (error) {
            console.error(`[probeVideoMetadata] Failed for ${url}: ${(error as Error).message}`)
            probeCache.set(cacheKey, null)
            return null
        } finally {
            pendingProbes.delete(cacheKey)
        }
    }
    const probePromise = doProbe()
    pendingProbes.set(cacheKey, probePromise)
    return probePromise
}