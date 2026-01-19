import { createClient, FileStat } from 'webdav'
import { DataSource } from './store'

export const getWebDAVClient = (config: DataSource['config']) => {
    if (!config.url) return null

    return createClient(config.url, {
        username: config.username,
        password: config.password
    })
}

export const testConnection = async (config: DataSource['config']): Promise<boolean> => {
    const client = getWebDAVClient(config)
    if (!client) return false
    try {
        await client.getDirectoryContents('/')
        return true
    } catch (error) {
        console.error('Connection failed:', error)
        return false
    }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const withRetry = async <T>(
    fn: () => Promise<T>,
    retries: number = 3,
    delay: number = 1000,
    operationName: string = 'Operation'
): Promise<T> => {
    let lastError: any

    for (let i = 0; i < retries; i++) {
        try {
            return await fn()
        } catch (error) {
            lastError = error
            console.warn(`${operationName} failed (attempt ${i + 1}/${retries}). Retrying in ${delay}ms...`, error)
            if (i < retries - 1) {
                await sleep(delay)
            }
        }
    }

    throw lastError
}

export const listDirectory = async (config: DataSource['config'], path: string = '/'): Promise<FileStat[]> => {
    const client = getWebDAVClient(config)
    if (!client) throw new Error('WebDAV not configured')

    try {
        const items = await withRetry(
            () => client.getDirectoryContents(path) as Promise<FileStat[]>,
            3,
            2000,
            `WebDAV listing ${path}`
        )
        return items
    } catch (error) {
        console.error(`WebDAV Error listing ${path}:`, error)
        throw error
    }
}
