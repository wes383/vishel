import { spawn } from 'node:child_process'
import store from './store'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

export const playVideo = async (fileUrl: string, title?: string) => {
    const playerPath = store.get('playerPath') as string
    const sources = store.get('sources') as any[]

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
    let authConfig = {}

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

    try {
        console.log(`Resolving URL: ${fileUrl}`)
        const resolved = await axios.get(fileUrl, {
            ...authConfig,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Range': 'bytes=0-0',
                ...((authConfig as any).headers || {})
            },
            maxRedirects: 5,
            timeout: 5000,
            validateStatus: (status) => status >= 200 && status < 400
        })

        if (resolved.request.res.responseUrl && resolved.request.res.responseUrl !== fileUrl) {
            console.log(`Resolved redirect: ${resolved.request.res.responseUrl}`)
            finalUrl = resolved.request.res.responseUrl
        }
    } catch (error: any) {
        console.warn('Failed to resolve redirect, falling back to direct URL', error.message)
    }

    console.log(`Launching player: ${playerPath} with ${finalUrl}`)

    const args = [finalUrl]

    if (title) {
        const sanitizedTitle = title.replace(/[\x00-\x1F\x7F]/g, '')
        const lowerPath = playerPath.toLowerCase()

        if (lowerPath.includes('mpv')) {
            args.push(`--force-media-title=${sanitizedTitle}`)
        } else if (lowerPath.includes('vlc')) {
            args.push(`--meta-title=${sanitizedTitle}`)
        } else if (lowerPath.includes('iina')) {
            args.push(`--mpv-force-media-title=${sanitizedTitle}`)
        } else if (lowerPath.includes('potplayer')) {
            args[0] = `${finalUrl}\\${sanitizedTitle}`
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
