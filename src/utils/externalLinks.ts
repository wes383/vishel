export interface ExternalLinkConfig {
    label: string
    template: string
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
    { label: 'View Detailed Info', template: 'https://screen-lookup.wesluma.com/movie/{tmdbId}' }
]

export const defaultTvExternalLinks: ExternalLinkConfig[] = [
    { label: 'View on IMDb', template: 'https://www.imdb.com/title/{imdbId}/' },
    { label: 'View on TMDB', template: 'https://www.themoviedb.org/tv/{tmdbId}' },
    { label: 'View Detailed Info', template: 'https://screen-lookup.wesluma.com/tv/{tmdbId}' }
]

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
): { label: string; url: string }[] => {
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
        .filter((item): item is { label: string; url: string } => item !== null)
}
