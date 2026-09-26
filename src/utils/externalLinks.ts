export interface ExternalLinkConfig {
    label: string
    template: string
}

export interface ExternalLink {
    label: string
    url: string
}

export interface ExternalLinkContext {
    tmdbId: number
    imdbId?: string
    title: string
}

export const defaultMovieExternalLinks: ExternalLinkConfig[] = [
    { label: 'View on IMDb', template: 'https://www.imdb.com/title/{imdbId}/' },
    { label: 'View on TMDB', template: 'https://www.themoviedb.org/movie/{tmdbId}' },
    { label: 'View on Letterboxd', template: 'https://letterboxd.com/tmdb/{tmdbId}' },
    { label: 'View Detailed Info', template: 'https://kino.wesluma.com/movie/{tmdbId}' }
]

export const defaultTvExternalLinks: ExternalLinkConfig[] = [
    { label: 'View on IMDb', template: 'https://www.imdb.com/title/{imdbId}/' },
    { label: 'View on TMDB', template: 'https://www.themoviedb.org/tv/{tmdbId}' },
    { label: 'View Detailed Info', template: 'https://kino.wesluma.com/tv/{tmdbId}' }
]

/**
 * The link configs themselves stay untranslated data: they are read and written by the settings
 * editor. Only the built-in labels are recognised here, so the render site can localise them while
 * anything a user typed themselves passes through untouched.
 */
const DEFAULT_LINK_LABEL_KEYS: Record<string, string> = {
    'View on IMDb': 'detail:externalLinkImdb',
    'View on TMDB': 'detail:externalLinkTmdb',
    'View on Letterboxd': 'detail:externalLinkLetterboxd',
    'View Detailed Info': 'detail:externalLinkDetailedInfo'
}

export const getExternalLinkLabelKey = (label: string): string | undefined =>
    DEFAULT_LINK_LABEL_KEYS[label.trim()]

const cloneLinks = (links: ExternalLinkConfig[]): ExternalLinkConfig[] => links.map(link => ({ ...link }))

export const normalizeExternalLinks = (value: unknown, defaults: ExternalLinkConfig[]): ExternalLinkConfig[] => {
    if (!Array.isArray(value)) {
        return cloneLinks(defaults)
    }
    const normalized = value
        .map((item) => {
            if (!item || typeof item !== 'object') return null
            const candidate = item as { label?: unknown; template?: unknown }
            if (typeof candidate.label !== 'string' || typeof candidate.template !== 'string') return null
            return {
                label: candidate.label,
                template: candidate.template
            }
        })
        .filter((item): item is ExternalLinkConfig => item !== null)
    return normalized
}

export const buildExternalLinks = (
    configs: ExternalLinkConfig[],
    context: ExternalLinkContext
): ExternalLink[] => {
    return configs
        .map((config) => {
            const label = config.label.trim()
            const template = config.template.trim()
            if (!label || !template) {
                return null
            }
            const migratedTemplate = template.replace(/\{query\}/g, '{title}')
            const url = migratedTemplate.replace(/\{(tmdbId|imdbId|title)\}/g, (_, token: string) => {
                if (token === 'tmdbId') return String(context.tmdbId)
                if (token === 'imdbId') return context.imdbId || ''
                if (token === 'title') return encodeURIComponent(context.title)
                return ''
            })
            if (!url || !/^https?:\/\//i.test(url)) {
                return null
            }
            if (template.includes('{imdbId}') && !context.imdbId) {
                return null
            }
            return { label, url }
        })
        .filter((item): item is ExternalLink => item !== null)
}
