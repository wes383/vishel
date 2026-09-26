import SMB2 from '@marsaud/smb2'
import { createHash } from 'node:crypto'
import type { DataSource } from './store'

/**
 * One session per share instead of connect/list/disconnect per directory: a deep tree
 * used to open a new SMB2 session for every folder it walked.
 */
const clientPool = new Map<string, SMB2>()

const poolKey = (share: string, config: DataSource['config']) => {
    const fingerprint = createHash('sha256')
        .update(`${config.domain || ''}|${config.username || ''}|${config.password || ''}`)
        .digest('hex')
        .slice(0, 12)
    return `${share}|${fingerprint}`
}

const getClient = (config: DataSource['config']): SMB2 | null => {
    if (!config.share) return null

    const sharePath = config.share.replace(/\//g, '\\')
    const key = poolKey(sharePath, config)

    const cached = clientPool.get(key)
    if (cached) return cached

    const client = new SMB2({
        share: sharePath,
        domain: config.domain || 'WORKGROUP',
        username: config.username || 'guest',
        password: config.password || '',
        autoCloseTimeout: 30000
    })
    clientPool.set(key, client)
    return client
}

const evictClient = (config: DataSource['config']) => {
    if (!config.share) return
    const key = poolKey(config.share.replace(/\//g, '\\'), config)
    const client = clientPool.get(key)
    if (!client) return
    clientPool.delete(key)
    try {
        client.disconnect()
    } catch (error) {
        console.error('SMB: Error disconnecting:', error)
    }
}

export const testConnection = async (config: DataSource['config']): Promise<boolean> => {
    const client = getClient(config)
    if (!client) {
        console.error('SMB: Failed to create client')
        return false
    }

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.error('SMB: Connection timeout')
            evictClient(config)
            resolve(false)
        }, 10000)

        client.readdir('', (err?: Error) => {
            clearTimeout(timeout)
            if (err) {
                console.error('SMB Connection failed:', err.message)
                evictClient(config)
            }
            resolve(!err)
        })
    })
}

export interface SMBFileStat {
    name: string
    type: 'file' | 'directory'
    size: number
    lastModified: Date
}

/**
 * A readdir entry with `stats: true`. The members are optional because the bundled
 * @marsaud/smb2 declarations describe only part of them, so every access stays guarded.
 */
interface SmbStatEntry {
    name: string
    size?: number
    mtime?: unknown
    isDirectory?: () => boolean
}

/** readdir reports bare names when it cannot stat an entry. */
type SmbReadEntry = SmbStatEntry | string

const toSmbFileStat = (entry: SmbReadEntry): SMBFileStat => {
    if (typeof entry === 'string') {
        return { name: entry, type: 'file', size: 0, lastModified: new Date() }
    }

    const isDirectory = typeof entry.isDirectory === 'function' && entry.isDirectory()
    return {
        name: entry?.name,
        type: isDirectory ? 'directory' : 'file',
        size: Number(entry?.size || 0),
        lastModified: entry?.mtime instanceof Date ? entry.mtime : new Date()
    }
}

export const listDirectory = async (config: DataSource['config'], path: string = ''): Promise<SMBFileStat[]> => {
    const client = getClient(config)
    if (!client) throw new Error('SMB not configured')

    const smbPath = path === '/' ? '' : path.replace(/^\//, '')

    return new Promise((resolve, reject) => {
        // `stats: true` reports the real entry type; guessing from a dot in the name
        // made every folder such as "Season 1.5" invisible to the scanner.
        client.readdir(smbPath, { stats: true }, (err?: Error, files?: SmbReadEntry[]) => {
            if (err) {
                console.error(`SMB Error listing ${smbPath}:`, err.message)
                evictClient(config)
                reject(err)
                return
            }

            resolve((files || []).map(toSmbFileStat))
        })
    })
}
