import Store from 'electron-store'

export interface DataSource {
    id: string
    type: 'webdav' | 'local' | 'smb'
    name: string
    config: {
        url?: string // For WebDAV
        path?: string // For Local
        share?: string // For SMB
        username?: string
        password?: string
        domain?: string // For SMB
    }
    paths: string[]
}

interface Settings {
    tmdbApiKey: string
    playerPath: string
    hideEpisodeSpoilers: boolean
    showTitlesOnPosters: boolean
    minimizeToTray: boolean
    sources: DataSource[]
}

const schema = {
    tmdbApiKey: { type: 'string', default: '' },
    playerPath: { type: 'string', default: '' },
    hideEpisodeSpoilers: { type: 'boolean', default: false },
    showTitlesOnPosters: { type: 'boolean', default: false },
    minimizeToTray: { type: 'boolean', default: false },
    sources: {
        type: 'array',
        default: [],
        items: {
            type: 'object',
            properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                name: { type: 'string' },
                config: {
                    type: 'object',
                    properties: {
                        url: { type: 'string' },
                        username: { type: 'string' },
                        password: { type: 'string' }
                    }
                },
                paths: {
                    type: 'array',
                    items: { type: 'string' }
                }
            }
        }
    }
} as const

// @ts-ignore - Schema typing with electron-store can be tricky
const store = new Store<Settings>({ schema })

export default store
