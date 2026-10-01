import type { VideoProbeMetadata } from '../../electron/mediaProbe'

export const formatDuration = (seconds: number | null): string | null => {
    if (!seconds) return null
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m}:${s.toString().padStart(2, '0')}`
}

export const formatFileSize = (bytes: number | null): string | null => {
    if (!bytes) return null
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export const formatBitrate = (bps: number | null): string | null => {
    if (!bps) return null
    const mbps = bps / 1000000
    if (mbps >= 1) return `${mbps.toFixed(1)} Mbps`
    return `${(bps / 1000).toFixed(0)} Kbps`
}

const AUDIO_CODEC_NAMES: Record<string, string> = {
    aac: 'AAC',
    aaclatm: 'AAC',
    ac3: 'DD',
    eac3: 'DDP',
    ddp: 'DDP',
    truehd: 'TrueHD',
    mlp: 'TrueHD',
    dts: 'DTS',
    dtshd: 'DTS-HD',
    dtshdma: 'DTS-HD MA',
    dtshdhra: 'DTS-HD HRA',
    dtsx: 'DTS:X',
    flac: 'FLAC',
    alac: 'ALAC',
    opus: 'Opus',
    vorbis: 'Vorbis',
    mp3: 'MP3',
    mp2: 'MP2',
    pcm: 'PCM',
    pcms16le: 'PCM',
    pcms24le: 'PCM',
    pcmbluray: 'PCM',
    wmapro: 'WMA Pro',
    wmav2: 'WMA'
}

const AUDIO_LAYOUTS: Record<number, string> = {
    1: 'mono',
    2: 'stereo',
    3: '2.1',
    4: '3.1',
    5: '5.0',
    6: '5.1',
    7: '6.1',
    8: '7.1',
    9: '7.1.2',
    10: '7.1.2',
    12: '7.1.4'
}

export const formatAudioCodecName = (codec: string): string => {
    const key = codec.toLowerCase().replace(/[_\s-]/g, '')
    return AUDIO_CODEC_NAMES[key] || codec.toUpperCase()
}

export const formatAudioChannels = (codec: string, channels: number): string => {
    const layout = AUDIO_LAYOUTS[channels] || `${channels}ch`
    return `${formatAudioCodecName(codec)}.${layout}`
}

export const formatVideoInfo = (metadata: VideoProbeMetadata | null | undefined): string[] => {
    if (!metadata) return []
    const parts: string[] = []

    const duration = formatDuration(metadata.duration)
    if (duration) parts.push(duration)

    const size = formatFileSize(metadata.fileSize)
    if (size) parts.push(size)

    const bitrate = formatBitrate(metadata.bitrate)
    if (bitrate) parts.push(bitrate)

    if (metadata.hdrType) parts.push(metadata.hdrType)
    else if (metadata.isHdr === false) parts.push('SDR')

    if (metadata.bitDepth) parts.push(`${metadata.bitDepth}bit`)
    if (metadata.codec) parts.push(metadata.codec.toUpperCase())
    if (metadata.frameRate) parts.push(`${metadata.frameRate}fps`)
    if (metadata.width && metadata.height) parts.push(`${metadata.width}×${metadata.height}`)
    if (metadata.audioCodec) parts.push(formatAudioChannels(metadata.audioCodec, metadata.audioChannels || 0))

    return parts
}

/**
 * Runtime wording is UI text, and this module is imported outside React, so it only hands the
 * numbers over. The render site localises them through `detail:runtimeHoursMinutes`.
 */
export const getRuntimeParts = (minutes?: number): { hours: number, minutes: number } | null => {
    if (!minutes) return null
    return { hours: Math.floor(minutes / 60), minutes: minutes % 60 }
}

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'

export const tmdbImage = (path: string | null | undefined, size: string) =>
    path ? `${TMDB_IMAGE_BASE}/${size}${path}` : ''

/**
 * Which of the two stored logos to draw. A missing localized logo is never replaced with the
 * English one: the detail page then falls back to the title as text, which is the whole point of
 * the preference. English UI reads `logoPath`, which the fetch fills with the English logo.
 */
export const displayLogo = (
    media: { logoPath?: string, logoPathEn?: string },
    settings: { language?: 'en' | 'zh', preferEnglishLogo?: boolean } | null | undefined
): string | undefined =>
    settings?.language === 'zh' && settings.preferEnglishLogo ? media.logoPathEn : media.logoPath
