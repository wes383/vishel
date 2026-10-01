import store, { getSources, setSources, DataSource, ExternalLinkConfig, Settings } from './store'

export const KEEP_SECRET = '__KEEP__'

/** Keys the renderer may write. Anything else in an incoming payload is dropped. */
const WRITABLE_KEYS: (keyof Settings)[] = [
    'tmdbApiKey',
    'playerPath',
    'customPlayerPath',
    'hideEpisodeSpoilers',
    'showTitlesOnPosters',
    'posterTitleMode',
    'minimizeToTray',
    'autoMarkWatchedEnabled',
    'autoMarkWatchedScope',
    'useFormattedTitle',
    'showImdbRating',
    'preferTextTitle',
    'posterSize',
    'probeVideoMetadataEnabled',
    'language',
    'preferEnglishLogo',
    'preferEnglishPoster',
    'movieExternalLinks',
    'tvExternalLinks',
    'sources'
]

/** Every whitelisted key except the two that carry credentials. */
const NON_SECRET_KEYS: Exclude<keyof Settings, 'tmdbApiKey' | 'sources'>[] = [
    'playerPath',
    'customPlayerPath',
    'hideEpisodeSpoilers',
    'showTitlesOnPosters',
    'posterTitleMode',
    'minimizeToTray',
    'autoMarkWatchedEnabled',
    'autoMarkWatchedScope',
    'useFormattedTitle',
    'showImdbRating',
    'preferTextTitle',
    'posterSize',
    'probeVideoMetadataEnabled',
    'language',
    'preferEnglishLogo',
    'preferEnglishPoster',
    'movieExternalLinks',
    'tvExternalLinks'
]

export interface RedactedSource extends Omit<DataSource, 'config'> {
    config: Omit<DataSource['config'], 'password'> & { hasPassword: boolean }
}

/** A source as the settings page sends it back: password only present when the user typed one. */
export type WritableSource = Omit<DataSource, 'config'> & {
    config: DataSource['config'] & { hasPassword?: boolean }
}

/** Shape of the payload the renderer is allowed to read. */
export interface RendererSettings {
    playerPath: string
    customPlayerPath: string
    hideEpisodeSpoilers: boolean
    showTitlesOnPosters: boolean
    posterTitleMode: Settings['posterTitleMode']
    minimizeToTray: boolean
    autoMarkWatchedEnabled: boolean
    autoMarkWatchedScope: Settings['autoMarkWatchedScope']
    useFormattedTitle: boolean
    showImdbRating: boolean
    preferTextTitle: boolean
    posterSize: Settings['posterSize']
    probeVideoMetadataEnabled: boolean
    language: Settings['language']
    preferEnglishLogo: boolean
    preferEnglishPoster: boolean
    movieExternalLinks: ExternalLinkConfig[]
    tvExternalLinks: ExternalLinkConfig[]
    /** Masked: the renderer never sees the real TMDB key. */
    tmdbApiKey: string
    hasTmdbApiKey: boolean
    sources: RedactedSource[]
}

export type RendererSettingsPatch =
    Partial<Pick<RendererSettings, Exclude<keyof RendererSettings, 'tmdbApiKey' | 'sources' | 'hasTmdbApiKey'>>> & {
    tmdbApiKey?: string
    sources?: WritableSource[]
}

export const maskSecret = (value: string): string => {
    if (!value) return ''
    if (value.length <= 8) return '*'.repeat(value.length)
    return `${value.slice(0, 4)}${'*'.repeat(8)}${value.slice(-4)}`
}

const looksMasked = (value: unknown): boolean =>
    typeof value === 'string' && (value.includes('*') || value === KEEP_SECRET)

const redactSource = (source: DataSource): RedactedSource => {
    const { password, ...config } = source.config || {}
    return {
        ...source,
        config: { ...config, hasPassword: Boolean(password) }
    }
}

const ALL_KEYS = NON_SECRET_KEYS as unknown as (keyof Settings)[]

/** Settings for renderer consumption: credentials are never included. */
export const getRedactedSettings = (): RendererSettings => {
    const all = store.store as unknown as Record<string, unknown>
    const safe: Record<string, unknown> = {}

    for (const key of ALL_KEYS) {
        safe[key] = all[key]
    }

    const apiKey = (store.get('tmdbApiKey') as string) || ''
    safe.tmdbApiKey = maskSecret(apiKey)
    safe.hasTmdbApiKey = apiKey.length > 0
    safe.sources = getSources().map(redactSource)

    return safe as unknown as RendererSettings
}

/** Merge renderer-supplied sources with the stored secrets the renderer never saw. */
const resolveSourceSecrets = (incoming: WritableSource[]): DataSource[] => {
    const storedById = new Map(getSources().map(source => [source.id, source]))

    return incoming.map(source => {
        const password = source?.config?.password
        const stored = storedById.get(source?.id)

        if (looksMasked(password) || password === undefined) {
            return {
                ...source,
                config: { ...source?.config, password: stored?.config?.password || '' }
            }
        }
        return source
    })
}

export const saveSettings = (patch: RendererSettingsPatch): boolean => {
    if (!patch || typeof patch !== 'object') return false

    for (const key of Object.keys(patch) as (keyof RendererSettingsPatch)[]) {
        if (!WRITABLE_KEYS.includes(key)) {
            console.warn(`[settings] Ignored write to non-whitelisted key: ${String(key)}`)
            continue
        }

        const value = patch[key]

        if (key === 'tmdbApiKey') {
            // The renderer only ever receives a masked form; never persist that back.
            if (looksMasked(value)) continue
            store.set('tmdbApiKey', (value as string) || '')
            continue
        }

        if (key === 'sources') {
            const sources = value as WritableSource[] | undefined
            setSources(resolveSourceSecrets(Array.isArray(sources) ? sources : []))
            continue
        }

        // Must stay a method call: electron-store's `set` reads `this` internally.
        store.set(key as keyof Settings, value as never)
    }

    return true
}

/** Credentials for a single source, resolved in the main process only. */
export const getSourceById = (sourceId?: string): DataSource | undefined => {
    const sources = getSources()
    if (!sourceId) return undefined
    return sources.find(source => source.id === sourceId)
}

/**
 * Connection tests and browsing are triggered from the renderer, which no longer holds
 * passwords. Refill secrets for a known source id; leave newly typed values untouched.
 * Every field of the incoming config is untrusted, so nothing is read without narrowing.
 */
export const hydrateSourceConfig = (config: Record<string, unknown> = {}, sourceId?: string) => {
    const merged: Record<string, unknown> = { ...config }
    const incomingId = typeof config?.id === 'string' ? config.id : undefined
    const stored = getSourceById(sourceId || incomingId)

    if (stored && (merged.password === undefined || looksMasked(merged.password))) {
        merged.password = stored.config?.password || ''
    }

    if (!stored && (merged.password === undefined || looksMasked(merged.password))) {
        merged.password = ''
    }

    return merged as unknown as DataSource['config'] & { type?: DataSource['type'], id?: string }
}
