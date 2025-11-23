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

export const listDirectory = async (config: DataSource['config'], path: string = '/'): Promise<FileStat[]> => {
    const client = getWebDAVClient(config)
    if (!client) throw new Error('WebDAV not configured')

    try {
        const items = await client.getDirectoryContents(path) as FileStat[]
        return items
    } catch (error) {
        console.error(`WebDAV Error listing ${path}:`, error)
        throw error
    }
}
