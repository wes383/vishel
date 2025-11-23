import { spawn } from 'node:child_process'
import store from './store'
import axios from 'axios'

export const playVideo = async (fileUrl: string, title?: string) => {
    const playerPath = store.get('playerPath') as string
    const username = store.get('username') as string
    const password = store.get('password') as string

    if (!playerPath) {
        throw new Error('Player path not configured')
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
        const resolved = await axios.head(fileUrl, {
            ...authConfig,
            maxRedirects: 5
        })

        if (resolved.request.res.responseUrl && resolved.request.res.responseUrl !== fileUrl) {
            console.log(`Resolved redirect: ${resolved.request.res.responseUrl}`)
            finalUrl = resolved.request.res.responseUrl
        }
    } catch (error: any) {
        console.warn('Failed to resolve redirect, falling back to direct WebDAV URL', error.message)
    }

    console.log(`Launching player: ${playerPath} with ${finalUrl}`)

    const args = [finalUrl]

    if (playerPath.toLowerCase().includes('mpv') && title) {
        args.push(`--force-media-title=${title}`)
    }

    const child = spawn(playerPath, args, {
        detached: true,
        stdio: 'ignore'
    })

    child.unref()
}
