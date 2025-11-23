import SMB2 from '@marsaud/smb2'
import { DataSource } from './store'

export const getSMBClient = (config: DataSource['config']) => {
    if (!config.share) return null

    let sharePath = config.share.replace(/\//g, '\\')

    const smbConfig: any = {
        share: sharePath,
        domain: config.domain || 'WORKGROUP',
        username: config.username || 'guest',
        password: config.password || ''
    }

    return new SMB2(smbConfig)
}

export const testConnection = async (config: DataSource['config']): Promise<boolean> => {
    try {
        const client = getSMBClient(config)
        if (!client) {
            console.error('SMB: Failed to create client')
            return false
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.error('SMB: Connection timeout')
                try {
                    client.disconnect()
                } catch (e) {
                    console.error('SMB: Error disconnecting:', e)
                }
                resolve(false)
            }, 10000)

            try {
                client.readdir('', (err?: Error) => {
                    clearTimeout(timeout)
                    if (err) {
                        console.error('SMB Connection failed:', err.message)
                        resolve(false)
                    } else {
                        resolve(true)
                    }
                    try {
                        client.disconnect()
                    } catch (e) {
                        console.error('SMB: Error disconnecting:', e)
                    }
                })
            } catch (e: any) {
                clearTimeout(timeout)
                console.error('SMB: Exception during readdir:', e.message)
                resolve(false)
            }
        })
    } catch (e: any) {
        console.error('SMB: Exception in testConnection:', e.message)
        return false
    }
}

export interface SMBFileStat {
    name: string
    type: 'file' | 'directory'
    size: number
    lastModified: Date
}

export const listDirectory = async (config: DataSource['config'], path: string = ''): Promise<SMBFileStat[]> => {
    const client = getSMBClient(config)
    if (!client) throw new Error('SMB not configured')

    let smbPath = path === '/' ? '' : path.replace(/^\//, '')

    return new Promise((resolve, reject) => {
        client.readdir(smbPath, (err?: Error, files?: any[]) => {
            if (err) {
                console.error(`SMB Error listing ${smbPath}:`, err)
                client.disconnect()
                reject(err)
                return
            }

            const stats: SMBFileStat[] = (files || []).map((filename: string) => {
                const isDirectory = !filename.includes('.')

                return {
                    name: filename,
                    type: isDirectory ? 'directory' : 'file',
                    size: 0,
                    lastModified: new Date()
                }
            })

            client.disconnect()
            resolve(stats)
        })
    })
}

export const streamFile = (config: DataSource['config'], path: string): Promise<Buffer> => {
    const client = getSMBClient(config)
    if (!client) throw new Error('SMB not configured')

    return new Promise((resolve, reject) => {
        client.readFile(path, (err?: Error, data?: Buffer) => {
            if (err || !data) {
                console.error(`SMB Error reading ${path}:`, err)
                client.disconnect()
                reject(err || new Error('No data received'))
                return
            }

            client.disconnect()
            resolve(data)
        })
    })
}
