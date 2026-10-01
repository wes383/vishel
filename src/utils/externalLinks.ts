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
    { label: 'IMDb', template: 'https://www.imdb.com/title/{imdbId}/' },
    { label: 'TMDB', template: 'https://www.themoviedb.org/movie/{tmdbId}' },
    { label: 'Letterboxd', template: 'https://letterboxd.com/tmdb/{tmdbId}' },
    { label: 'Kino', template: 'https://kino.wesluma.com/movie/{tmdbId}' }
]

export const defaultTvExternalLinks: ExternalLinkConfig[] = [
    { label: 'IMDb', template: 'https://www.imdb.com/title/{imdbId}/' },
    { label: 'TMDB', template: 'https://www.themoviedb.org/tv/{tmdbId}' },
    { label: 'Kino', template: 'https://kino.wesluma.com/tv/{tmdbId}' }
]

/**
 * The link labels are plain user data now: they render as typed, in every locale, and are edited
 * verbatim in the settings table. These are the pre-rename copies of the defaults, so a stored
 * library follows the new wording without touching anything the user wrote themselves.
 */
const LEGACY_DEFAULT_LABELS = new Map<string, string>([
    ['View on IMDb', 'IMDb'],
    ['View on TMDB', 'TMDB'],
    ['View on Letterboxd', 'Letterboxd'],
    ['View Detailed Info', 'Kino']
])

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
                label: LEGACY_DEFAULT_LABELS.get(candidate.label.trim()) ?? candidate.label,
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
