import fs from 'node:fs/promises'
import path from 'node:path'
import { DataSource } from './store'

export interface LocalFileStat {
    filename: string
    basename: string
    lastmod: string
    size: number
    type: 'file' | 'directory'
}

export const testLocalConnection = async (config: DataSource['config']): Promise<boolean> => {
    if (!config.path) return false
    try {
        await fs.access(config.path)
        const stat = await fs.stat(config.path)
        return stat.isDirectory()
    } catch (error) {
        return false
    }
}

export const listLocalDirectory = async (config: DataSource['config'], dirPath: string = '/'): Promise<LocalFileStat[]> => {
    if (!config.path) throw new Error('Local path not configured')
    let fullPath = dirPath
    if (dirPath === '/' || dirPath === '\\') {
        fullPath = config.path
    } else {
        if (path.isAbsolute(dirPath)) {
            fullPath = dirPath
        } else {
            fullPath = path.join(config.path, dirPath)
        }
    }

    try {
        const dirents = await fs.readdir(fullPath, { withFileTypes: true })

        const items: LocalFileStat[] = await Promise.all(dirents.map(async (dirent) => {
            const itemPath = path.join(fullPath, dirent.name)
            const stats = await fs.stat(itemPath)

            return {
                filename: itemPath,
                basename: dirent.name,
                lastmod: stats.mtime.toISOString(),
                size: stats.size,
                type: dirent.isDirectory() ? 'directory' : 'file'
            }
        }))

        return items
    } catch (error) {
        console.error(`Error listing local directory ${fullPath}:`, error)
        throw error
    }
}
