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

export interface ExternalLinkConfig {
    label: string
    template: string
}

interface Settings {
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
