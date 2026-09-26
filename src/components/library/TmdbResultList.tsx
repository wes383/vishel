import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type KeyboardEvent
} from 'react'
import { Film, Loader2, Search, Tv } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../contexts/ToastContext'
import type { EpisodeMatchInfo, MatchResult, MediaType } from '../../types/ipc'
import type { TmdbSearchResult } from '../../../electron/tmdbService'

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w185'
const SEARCH_DEBOUNCE_MS = 350
const MAX_EPISODE_NUMBER = 10000

const INPUT_CLASSES =
    'w-full bg-black/10 border border-gray-900/20 rounded-xl px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900'

/** A TMDB hit reduced to what the result card can actually render. */
export interface TmdbSearchItem {
    id: number
    title?: string
    name?: string
    posterPath: string | null
    releaseDate?: string
    firstAirDate?: string
    overview: string
    mediaType: MediaType
}

/**
 * `search-tmdb` rejects on rate limit / bad key / network failure, so a thrown error always
 * means "the request failed" and an empty array means "TMDB found nothing". The payload comes
 * from TMDB with an open-ended shape, hence the per-field narrowing instead of a cast.
 */
export const toSearchItems = (results: TmdbSearchResult[], mediaType: MediaType): TmdbSearchItem[] =>
    results
        .filter(result => typeof result.id === 'number')
        .map(result => ({
            id: result.id,
            title: typeof result.title === 'string' ? result.title : undefined,
            name: typeof result.name === 'string' ? result.name : undefined,
            posterPath: typeof result.poster_path === 'string' ? result.poster_path : null,
            releaseDate: typeof result.release_date === 'string' ? result.release_date : undefined,
            firstAirDate: typeof result.first_air_date === 'string' ? result.first_air_date : undefined,
            overview: typeof result.overview === 'string' ? result.overview : '',
            mediaType
        }))

export const tmdbErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error && error.message) return error.message
    if (typeof error === 'string' && error) return error
    return fallback
}

/**
 * The match channels are typed `MatchResult | void` in `IpcRequestMap`, while the main process
 * resolves `true` and only reports failure by rejecting. Anything that cannot positively confirm
 * the write - no payload, `false`, or `success: false` - keeps the dialog open, so a failed match
 * never looks like a closed success.
 */
export const confirmMatchOutcome = (payload: MatchResult | void | true): MatchResult | null => {
    if (typeof payload === 'boolean') return payload ? { success: true } : null
    if (payload == null) return null
    return payload.success === false ? null : payload
}

interface SearchState {
    items: TmdbSearchItem[]
    page: number
    totalPages: number
}

const EMPTY_STATE: SearchState = { items: [], page: 1, totalPages: 1 }

export interface TmdbSearchController {
    query: string
    mediaType: MediaType
    items: TmdbSearchItem[]
    searching: boolean
    loadingMore: boolean
    hasMore: boolean
    statusMessage: string
    statusTone: 'info' | 'error'
    setQuery: (value: string) => void
    setMediaType: (value: MediaType) => void
    /** Skip the debounce and search now - used by the Search button and Enter. */
    submit: () => void
    loadMore: () => void
}

/**
 * Owns the `search-tmdb` plumbing both modals need: debounced search-as-you-type, paging,
 * stale-response rejection and a user-visible error instead of a silently empty list.
 */
export function useTmdbSearch(initialQuery: string, initialMediaType: MediaType): TmdbSearchController {
    const { t } = useTranslation(['match', 'common'])
    const { showToast } = useToast()
    const [query, setQuery] = useState(initialQuery)
    const [mediaType, setMediaType] = useState<MediaType>(initialMediaType)
    const [state, setState] = useState<SearchState>(EMPTY_STATE)
    const [searching, setSearching] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const mounted = useRef(true)
    /** Only the newest request may write; older TMDB responses arrive out of order. */
    const requestId = useRef(0)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastRequest = useRef<{ query: string; mediaType: MediaType } | null>(null)

    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])

    const run = useCallback(
        async (rawQuery: string, type: MediaType, page: number) => {
            const trimmed = rawQuery.trim()
            const id = ++requestId.current

            if (!trimmed) {
                lastRequest.current = null
                setState(EMPTY_STATE)
                setError(null)
                return
            }

            lastRequest.current = { query: trimmed, mediaType: type }
            setError(null)
            if (page === 1) {
                setSearching(true)
                setState(EMPTY_STATE)
            } else {
                setLoadingMore(true)
            }

            try {
                const response = await window.electron.ipcRenderer.invoke('search-tmdb', {
                    query: trimmed,
                    type,
                    page
                })
                if (!mounted.current || id !== requestId.current) return

                const items = toSearchItems(response.results, type)
                setState(current => ({
                    items: page === 1 ? items : [...current.items, ...items],
                    page: response.page || page,
                    totalPages: response.totalPages || 1
                }))
            } catch (caught) {
                if (!mounted.current || id !== requestId.current) return
                const message = tmdbErrorMessage(caught, t('match:tmdbSearchFailed'))
                setError(message)
                showToast(message, 'error')
                if (page === 1) setState(EMPTY_STATE)
            } finally {
                if (mounted.current && id === requestId.current) {
                    setSearching(false)
                    setLoadingMore(false)
                }
            }
        },
        [showToast, t]
    )

    useEffect(() => {
        const trimmed = query.trim()
        if (!trimmed) {
            requestId.current++
            lastRequest.current = null
            setState(EMPTY_STATE)
            setError(null)
            return
        }

        const pending = setTimeout(() => {
            timer.current = null
            void run(trimmed, mediaType, 1)
        }, SEARCH_DEBOUNCE_MS)
        timer.current = pending

        return () => {
            clearTimeout(pending)
            if (timer.current === pending) timer.current = null
        }
    }, [query, mediaType, run])

    const submit = useCallback(() => {
        if (timer.current) {
            clearTimeout(timer.current)
            timer.current = null
        }
        void run(query, mediaType, 1)
    }, [query, mediaType, run])

    const loadMore = useCallback(() => {
        const pending = lastRequest.current
        if (!pending || searching || loadingMore) return
        if (state.page >= state.totalPages) return
        void run(pending.query, pending.mediaType, state.page + 1)
    }, [searching, loadingMore, state.page, state.totalPages, run])

    /** A type switch keeps the previous type's cards on screen until the new request lands. */
    const items = useMemo(
        () => state.items.filter(item => item.mediaType === mediaType),
        [state.items, mediaType]
    )
    const hasMore = items.length > 0 && state.page < state.totalPages
    const statusMessage = error
        ? error
        : searching
            ? t('match:searchingTmdb')
            : items.length > 0
                ? t('match:resultCount', { count: items.length })
                : ''

    return {
        query,
        mediaType,
        items,
        searching,
        loadingMore,
        hasMore,
        statusMessage,
        statusTone: error ? 'error' : 'info',
        setQuery,
        setMediaType,
        submit,
        loadMore
    }
}

interface TmdbSearchControlsProps {
    query: string
    mediaType: MediaType
    searching: boolean
    statusMessage: string
    statusTone?: 'info' | 'error'
    onQueryChange: (value: string) => void
    onMediaTypeChange: (value: MediaType) => void
    onSubmit: () => void
}

/** Module-scope, so only translation keys live here — the labels are resolved per render. */
const TYPES: { value: MediaType; labelKey: 'match:movieType' | 'match:tvType' }[] = [
    { value: 'movie', labelKey: 'match:movieType' },
    { value: 'tv', labelKey: 'match:tvType' }
]

export function TmdbSearchControls({
    query,
    mediaType,
    searching,
    statusMessage,
    statusTone = 'info',
    onQueryChange,
    onMediaTypeChange,
    onSubmit
}: TmdbSearchControlsProps) {
    const { t } = useTranslation(['match', 'common'])
    const typeGroupId = useId()
    const inputId = useId()

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault()
            onSubmit()
        }
    }

    return (
        <div>
            <div className="flex flex-wrap gap-3">
                <div role="group" aria-labelledby={typeGroupId} className="flex gap-2">
                    <span id={typeGroupId} className="sr-only">
                        {t('match:mediaType')}
                    </span>
                    {TYPES.map(type => (
                        <button
                            key={type.value}
                            type="button"
                            aria-pressed={mediaType === type.value}
                            onClick={() => onMediaTypeChange(type.value)}
                            className={`px-4 py-2 rounded-xl font-medium transition-colors whitespace-nowrap ${
                                mediaType === type.value
                                    ? 'bg-neutral-800 text-white'
                                    : 'bg-black/10 text-gray-900 hover:bg-black/20'
                            }`}
                        >
                            {t(type.labelKey)}
                        </button>
                    ))}
                </div>

                <div className="flex-1 relative min-w-[12rem]">
                    <label htmlFor={inputId} className="sr-only">
                        {mediaType === 'movie' ? t('match:searchTmdbMovie') : t('match:searchTmdbTvShow')}
                    </label>
                    <Search
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600"
                        aria-hidden="true"
                    />
                    <input
                        id={inputId}
                        data-autofocus=""
                        type="text"
                        value={query}
                        aria-busy={searching}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => onQueryChange(event.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={mediaType === 'movie' ? t('match:searchMoviePlaceholder') : t('match:searchTvShowPlaceholder')}
                        className={`${INPUT_CLASSES} pl-10 pr-4 py-3`}
                    />
                </div>

                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={searching || !query.trim()}
                    className="bg-neutral-800 hover:bg-neutral-700 text-white px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                >
                    {searching && <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />}
                    {searching ? t('match:searching') : t('common:search')}
                </button>
            </div>

            <p
                aria-live="polite"
                className={`text-sm mt-2 ${statusTone === 'error' ? 'text-red-600' : 'text-gray-600'}`}
            >
                {statusMessage}
            </p>
        </div>
    )
}

interface TmdbResultListProps {
    items: TmdbSearchItem[]
    mediaType: MediaType
    selectedId: number | null
    searching: boolean
    emptyMessage: string
    loadingMore?: boolean
    hasMore?: boolean
    onLoadMore?: () => void
    onSelect: (item: TmdbSearchItem) => void
    className?: string
}

const POSTER_PLACEHOLDER = { movie: Film, tv: Tv } as const

/** Presentational only: the shared result cards, poster fallback and end-of-page paging. */
export function TmdbResultList({
    items,
    mediaType,
    selectedId,
    searching,
    emptyMessage,
    loadingMore = false,
    hasMore = false,
    onLoadMore,
    onSelect,
    className = ''
}: TmdbResultListProps) {
    const { t } = useTranslation(['match', 'common'])
    const scrollRef = useRef<HTMLDivElement>(null)
    const sentinelRef = useRef<HTMLDivElement>(null)
    const Placeholder = POSTER_PLACEHOLDER[mediaType]

    useEffect(() => {
        if (!onLoadMore || !hasMore) return

        const root = scrollRef.current
        const sentinel = sentinelRef.current
        if (!root || !sentinel) return

        const observer = new IntersectionObserver(
            entries => {
                if (entries.some(entry => entry.isIntersecting)) onLoadMore()
            },
            { root, rootMargin: '120px' }
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [onLoadMore, hasMore, items.length, loadingMore])

    return (
        <div
            ref={scrollRef}
            aria-busy={searching}
            className={`min-h-0 flex-1 overflow-y-auto episode-selector-scroll ${className}`}
        >
            {items.length === 0 ? (
                <div className="text-center text-gray-600 py-12">
                    <Search className="w-12 h-12 mx-auto mb-3 opacity-50" aria-hidden="true" />
                    <p>{emptyMessage}</p>
                </div>
            ) : (
                <>
                    <ul className="space-y-3" aria-label={t('match:tmdbResultsLabel')}>
                        {items.map(item => {
                            const title = item.title || item.name || t('common:unknown')
                            const year = (item.releaseDate || item.firstAirDate || '').split('-')[0]
                            const selected = item.id === selectedId

                            return (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() => onSelect(item)}
                                        aria-pressed={selected}
                                        className={`w-full text-left flex gap-4 p-4 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                                            selected
                                                ? 'bg-black/20 border-2 border-gray-900'
                                                : 'bg-black/10 hover:bg-black/20 border-2 border-transparent'
                                        }`}
                                    >
                                        {item.posterPath ? (
                                            <img
                                                src={`${TMDB_IMAGE_BASE}${item.posterPath}`}
                                                alt={t('match:posterAlt', { title })}
                                                loading="lazy"
                                                className="w-16 h-24 object-cover rounded shrink-0"
                                            />
                                        ) : (
                                            <span
                                                aria-hidden="true"
                                                className="w-16 h-24 bg-black/20 rounded flex items-center justify-center text-gray-600 shrink-0"
                                            >
                                                <Placeholder className="w-8 h-8" />
                                            </span>
                                        )}
                                        <span className="flex-1 min-w-0">
                                            <span className="block font-bold text-lg truncate text-gray-900">
                                                {title}
                                                {year && <span className="text-gray-900"> ({year})</span>}
                                            </span>
                                            <span className="block text-sm text-gray-900 line-clamp-2 mt-1">
                                                {item.overview || t('match:noDescription')}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>

                    {hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-1" />}

                    {loadingMore && (
                        <p role="status" className="flex items-center justify-center gap-2 py-4 text-gray-600">
                            <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
                            {t('match:loadingMore')}
                        </p>
                    )}

                    {!hasMore && !loadingMore && (
                        <p className="text-center py-4 text-gray-600 text-sm">{t('match:noMoreResults')}</p>
                    )}
                </>
            )}
        </div>
    )
}

interface EpisodeFieldsProps {
    value: EpisodeMatchInfo
    onChange: (value: EpisodeMatchInfo) => void
}

const clampNumber = (raw: string): number => {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isNaN(parsed)) return 1
    return Math.min(Math.max(parsed, 1), MAX_EPISODE_NUMBER)
}

export function EpisodeFields({ value, onChange }: EpisodeFieldsProps) {
    const { t } = useTranslation(['match', 'common'])
    const groupId = useId()
    const seasonId = `${groupId}-season`
    const episodeId = `${groupId}-episode`

    return (
        <div>
            <h3 id={groupId} className="font-semibold mb-3 text-gray-900">
                {t('match:episodeInformation')}
            </h3>
            <div className="flex gap-4" role="group" aria-labelledby={groupId}>
                <div className="flex-1">
                    <label className="block text-sm text-gray-600 mb-1" htmlFor={seasonId}>
                        {t('match:season')}
                    </label>
                    <input
                        id={seasonId}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_EPISODE_NUMBER}
                        value={value.season}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            onChange({ ...value, season: clampNumber(event.target.value) })
                        }
                        className={INPUT_CLASSES}
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-sm text-gray-600 mb-1" htmlFor={episodeId}>
                        {t('match:episode')}
                    </label>
                    <input
                        id={episodeId}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_EPISODE_NUMBER}
                        value={value.episode}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            onChange({ ...value, episode: clampNumber(event.target.value) })
                        }
                        className={INPUT_CLASSES}
                    />
                </div>
            </div>
        </div>
    )
}
