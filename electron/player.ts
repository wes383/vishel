import { spawn } from 'node:child_process'
import store, { getSources } from './store'
import { maskUrl } from './redact'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

/** Player title text: drop control characters and filesystem-hostile punctuation. */
const sanitizeTitle = (value: string): string => value
    .split('')
    .filter(char => {
        const code = char.codePointAt(0) || 0
        return code >= 0x20 && code !== 0x7f
    })
    .join('')
    .replace(/[/:*?"<>|]/g, '')
    .trim()

/** Options merged into the URL-resolution probe; only set when the matched source has credentials. */
interface ResolveRequestConfig {
    auth?: { username: string, password: string }
    maxRedirects?: number
    validateStatus?: (status: number) => boolean
    headers?: Record<string, string>
}

export const playVideo = async (fileUrl: string, title?: string) => {
    const playerPath = store.get('playerPath') as string
    const sources = getSources()

    if (!playerPath) {
        throw new Error('Player path not configured')
    }

    // Check if player executable exists
    if (path.isAbsolute(playerPath) && !fs.existsSync(playerPath)) {
        throw new Error(`Player executable not found at: ${playerPath}`)
    }

    let username = ''
    let password = ''

    if (sources && Array.isArray(sources)) {
        const sortedSources = [...sources].sort((a, b) => {
            const urlA = a.config?.url || ''
            const urlB = b.config?.url || ''
            return urlB.length - urlA.length
        })

        for (const source of sortedSources) {
            if (source.config?.url && fileUrl.startsWith(source.config.url)) {
                username = source.config.username || ''
                password = source.config.password || ''
                console.log(`Found matching source: ${source.name}`)
                break
            }
        }
    }

    let authUrl = fileUrl
    let authConfig: ResolveRequestConfig = {}

    if (username && password) {
        try {
            const urlObj = new URL(fileUrl)
            urlObj.username = username
            urlObj.password = password
            authUrl = urlObj.toString()

            authConfig = {
                auth: {
                    username,
                    password
                },
                maxRedirects: 0,
                validateStatus: (status: number) => status >= 200 && status < 400
            }
        } catch (e) {
            console.error('Failed to construct auth URL', e)
        }
    }

    let finalUrl = authUrl
    let resolveAttempts = 0
    const maxResolveAttempts = 2

    while (resolveAttempts < maxResolveAttempts) {
        try {
            console.log(`Resolving URL: ${fileUrl} (attempt ${resolveAttempts + 1})`)
            const resolved = await axios.get(fileUrl, {
                ...authConfig,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Range': 'bytes=0-0',
                    ...(authConfig.headers || {})
                },
                maxRedirects: 5,
                timeout: 5000,
                validateStatus: (status) => status >= 200 && status < 400
            })

            if (resolved.request.res.responseUrl && resolved.request.res.responseUrl !== fileUrl) {
                console.log(`Resolved redirect: ${maskUrl(resolved.request.res.responseUrl)}`)
                finalUrl = resolved.request.res.responseUrl
            }
            break
        } catch (error: unknown) {
            resolveAttempts++
            const reason = error instanceof Error ? error.message : String(error)
            console.warn(`Failed to resolve redirect (attempt ${resolveAttempts}): ${reason}`)
            if (resolveAttempts >= maxResolveAttempts) {
                console.log('Max resolve attempts reached, falling back to direct URL')
                finalUrl = authUrl
            }
        }
    }

    // finalUrl may embed credentials: only ever log it masked.
    console.log(`Launching player: ${playerPath} with ${maskUrl(finalUrl)}`)

    const args = [finalUrl]

    const useFormattedTitle = store.get('useFormattedTitle') as boolean

    if (title) {
        let displayTitle: string
        if (useFormattedTitle) {
            displayTitle = sanitizeTitle(title)
        } else {
            displayTitle = sanitizeTitle(path.basename(fileUrl))
        }

        const playerFilename = path.basename(playerPath).toLowerCase()

        if (playerFilename.includes('vlc')) {
            args.unshift(`--meta-title=${displayTitle}`)
        } else if (playerFilename.includes('mpv')) {
            args.push(`--force-media-title=${displayTitle}`)
        } else if (playerFilename.includes('iina')) {
            args.push(`--mpv-force-media-title=${displayTitle}`)
        } else if (playerFilename.includes('potplayer')) {
            args[0] = `${finalUrl}\\${displayTitle}`
        }
    }

    const child = spawn(playerPath, args, {
        detached: true,
        stdio: 'ignore'
    })

    return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            child.unref()
            resolve()
        }, 2000)

        child.on('error', (err) => {
            clearTimeout(timeout)
            reject(err)
        })

        child.on('close', (code) => {
            clearTimeout(timeout)
            if (code !== 0) {
                reject(new Error(`Player exited immediately with code ${code}`))
            } else {
                resolve()
            }
        })
    })
}
