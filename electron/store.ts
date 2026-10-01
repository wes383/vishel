import Store from 'electron-store'
import { safeStorage } from 'electron'

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

export interface ExternalLinkConfig {
    label: string
    template: string
}

export interface Settings {
    tmdbApiKey: string
    playerPath: string
    customPlayerPath: string
    hideEpisodeSpoilers: boolean
    showTitlesOnPosters: boolean
    posterTitleMode: 'hover' | 'below' | 'hidden'
    minimizeToTray: boolean
    autoMarkWatchedEnabled: boolean
    autoMarkWatchedScope: 'movies' | 'all'
    useFormattedTitle: boolean
    showImdbRating: boolean
    preferTextTitle: boolean
    posterSize: 'small' | 'medium' | 'large'
    probeVideoMetadataEnabled: boolean
    /** UI locale and the metadata language TMDB is asked for. */
    language: 'en' | 'zh'
    /** Only meaningful when `language` is 'zh': show the English logo instead of the localized one. */
    preferEnglishLogo: boolean
    movieExternalLinks: ExternalLinkConfig[]
    tvExternalLinks: ExternalLinkConfig[]
    sources: DataSource[]
}

const defaultMovieExternalLinks: ExternalLinkConfig[] = [
    { label: 'View on IMDb', template: 'https://www.imdb.com/title/{imdbId}/' },
    { label: 'View on TMDB', template: 'https://www.themoviedb.org/movie/{tmdbId}' },
    { label: 'View on Letterboxd', template: 'https://letterboxd.com/tmdb/{tmdbId}' },
    { label: 'View Detailed Info', template: 'https://kino.wesluma.com/movie/{tmdbId}' }
]

const defaultTvExternalLinks: ExternalLinkConfig[] = [
    { label: 'View on IMDb', template: 'https://www.imdb.com/title/{imdbId}/' },
    { label: 'View on TMDB', template: 'https://www.themoviedb.org/tv/{tmdbId}' },
    { label: 'View Detailed Info', template: 'https://kino.wesluma.com/tv/{tmdbId}' }
]

const schema = {
    tmdbApiKey: { type: 'string', default: '' },
    playerPath: { type: 'string', default: '' },
    customPlayerPath: { type: 'string', default: '' },
    hideEpisodeSpoilers: { type: 'boolean', default: false },
    showTitlesOnPosters: { type: 'boolean', default: false },
    posterTitleMode: { type: 'string', default: 'hover', enum: ['hover', 'below', 'hidden'] },
    minimizeToTray: { type: 'boolean', default: false },
    autoMarkWatchedEnabled: { type: 'boolean', default: false },
    autoMarkWatchedScope: { type: 'string', default: 'movies', enum: ['movies', 'all'] },
    useFormattedTitle: { type: 'boolean', default: true },
    showImdbRating: { type: 'boolean', default: true },
    preferTextTitle: { type: 'boolean', default: false },
    posterSize: { type: 'string', default: 'medium', enum: ['small', 'medium', 'large'] },
    probeVideoMetadataEnabled: { type: 'boolean', default: true },
    language: { type: 'string', default: 'en', enum: ['en', 'zh'] },
    preferEnglishLogo: { type: 'boolean', default: true },
    movieExternalLinks: {
        type: 'array',
        default: defaultMovieExternalLinks,
        items: {
            type: 'object',
            properties: {
                label: { type: 'string' },
                template: { type: 'string' }
            }
        }
    },
    tvExternalLinks: {
        type: 'array',
        default: defaultTvExternalLinks,
        items: {
            type: 'object',
            properties: {
                label: { type: 'string' },
                template: { type: 'string' }
            }
        }
    },
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
                        path: { type: 'string' },
                        share: { type: 'string' },
                        username: { type: 'string' },
                        password: { type: 'string' },
                        domain: { type: 'string' }
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

/**
 * Data source passwords live in %APPDATA%/vishel/config.json. When the OS keystore is
 * available they are written encrypted through safeStorage; the prefix marks which
 * entries still predate that.
 */
const SECRET_PREFIX = 'enc:v1:'

const canEncrypt = (): boolean => {
    try {
        return safeStorage.isEncryptionAvailable()
    } catch {
        return false
    }
}

const encryptSecret = (plain: string): string => {
    if (!plain || plain.startsWith(SECRET_PREFIX)) return plain
    if (!canEncrypt()) {
        console.warn('[store] OS keystore unavailable, saving data source password without at-rest encryption')
        return plain
    }
    return SECRET_PREFIX + safeStorage.encryptString(plain).toString('base64')
}

const decryptSecret = (stored?: string): string => {
    if (!stored) return ''
    if (!stored.startsWith(SECRET_PREFIX)) return stored
    try {
        return safeStorage.decryptString(Buffer.from(stored.slice(SECRET_PREFIX.length), 'base64'))
    } catch (error) {
        console.error('[store] Failed to decrypt data source password, re-save the source:', error)
        return ''
    }
}

const mapSourceSecret = (source: DataSource, fn: (value: string) => string): DataSource => ({
    ...source,
    config: { ...source?.config, password: fn(source?.config?.password || '') }
})

/** Plaintext credentials for main-process use only - never expose these to the renderer. */
export const getSources = (): DataSource[] => {
    const raw = (store.get('sources') as DataSource[]) || []
    return raw.map(source => mapSourceSecret(source, decryptSecret))
}

export const setSources = (sources: DataSource[]) => {
    store.set('sources', (sources || []).map(source => mapSourceSecret(source, encryptSecret)))
}

/** One-off upgrade of passwords that were previously written in clear text. */
export const migrateStoredSecrets = () => {
    if (!canEncrypt()) return

    const raw = (store.get('sources') as DataSource[]) || []
    let changed = false

    const next = raw.map(source => {
        const password = source?.config?.password
        if (password && !password.startsWith(SECRET_PREFIX)) {
            changed = true
            return mapSourceSecret(source, encryptSecret)
        }
        return source
    })

    if (changed) {
        store.set('sources', next)
        console.log('[store] Encrypted previously plain-text data source passwords')
    }
}
