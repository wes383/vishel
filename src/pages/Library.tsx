import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { usePersistedState } from '../hooks/usePersistedState'
import { LibraryTabs, LIBRARY_TAB_IDS } from '../components/library/LibraryTabs'
import { LibraryActions, SortOption, FilterOption, FILTER_VALUES } from '../components/library/LibraryActions'
import { SearchInput } from '../components/library/SearchInput'
import { MediaGrid } from '../components/library/MediaGrid'
import { HistoryList } from '../components/library/HistoryList'
import { UnscannedFiles } from '../components/library/UnscannedFiles'
import ScanProgressBar from '../components/ScanProgressBar'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import { LoadingPanel } from '../components/ui/Feedback'
import { AlertTriangle } from 'lucide-react'
import { UnscannedFile, HistoryItem, GridItem } from '../types/library'
import type { Movie as MovieRecord, TVShow as TVShowRecord } from '../../electron/db'
import { matchesCastSearch, matchesNameListSearch, matchesSearch, normalizeGenres } from '../utils/searchMatch'
import { displayPoster } from '../utils/formatMediaInfo'
import { useSettings } from '../contexts/SettingsContext'
import { useMediaStatus, mediaKey } from '../contexts/MediaStatusContext'
import { useScan } from '../contexts/ScanContext'
import type { LibraryTab } from '../types/ipc'

const isTab = (value: string | null): value is LibraryTab =>
    value !== null && (LIBRARY_TAB_IDS as readonly string[]).includes(value)

/** Detail pages, settings and the Escape shortcut all return to `/` with no param. */
const readStoredTab = (): LibraryTab => {
    const stored = sessionStorage.getItem('library_tab')
    return isTab(stored) ? stored : 'all'
}

/** What the grid needs to order an entry, kept separate so the sort is memo-friendly. */
interface Sortable {
    type: 'movie' | 'tv'
    id: number
    sortKey: string
    sortDate: string
    popularity?: number
    createdAt?: number
    name: string
}

const SORT_MIGRATION: Record<string, SortOption> = {
    'rating-desc': 'popularity-desc',
    'added-desc': 'recently-added'
}

export default function LibraryPage() {
    const { t } = useTranslation(['library', 'common'])
    const [searchParams, setSearchParams] = useSearchParams()
    const { settings } = useSettings()
    const { isFavorite, watchStatus, statusTimestamp } = useMediaStatus()
    const { scanning, addFinishListener } = useScan()

    const [movies, setMovies] = useState<MovieRecord[]>([])
    const [tvShows, setTvShows] = useState<TVShowRecord[]>([])
    const [unscannedFiles, setUnscannedFiles] = useState<UnscannedFile[]>([])
    const [history, setHistory] = useState<HistoryItem[]>([])
    const [loadError, setLoadError] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const [sortBy, setSortBy] = usePersistedState<SortOption>('local', 'library_sort_by', 'name-asc')
    const [filterBy, setFilterBy] = usePersistedState<FilterOption>('local', 'library_filter_by', 'all')
    const [genreFilter, setGenreFilter] = usePersistedState<string>('local', 'library_genre_filter', 'all')
    const [searchExpanded, setSearchExpanded] = usePersistedState<boolean>('session', 'library_search_expanded', false)
    const [searchQuery, setSearchQuery] = usePersistedState<string>('session', 'library_search_query', '')

    const scrollRef = useRef<HTMLDivElement>(null)
    const restoredScroll = useRef(false)

    // The URL stays the authority - it is what the tray menu writes - and the stored tab only
    // speaks on a bare `/`, which is how the detail pages, settings and the shortcuts come
    // back. Every click writes its param, `all` included: dropping the param for All would
    // make `setActiveTab('all')` look like an arrival and let the stored tab overrule it.
    const activeTab: LibraryTab = isTab(searchParams.get('tab')) ? searchParams.get('tab') as LibraryTab : readStoredTab()

    useEffect(() => {
        sessionStorage.setItem('library_tab', activeTab)
    }, [activeTab])

    const setActiveTab = useCallback((tab: LibraryTab) => {
        setSearchParams({ tab }, { replace: true })
    }, [setSearchParams])

    // A persisted legacy value must not leave the library unsorted.
    useEffect(() => {
        const migrated = SORT_MIGRATION[sortBy]
        if (migrated) setSortBy(migrated)
    }, [sortBy, setSortBy])

    // Favorites became a tab, so a persisted 'favorites' filter would leave the Filter button
    // looking engaged while applying nothing.
    useEffect(() => {
        if (!(FILTER_VALUES as readonly string[]).includes(filterBy)) setFilterBy('all')
    }, [filterBy, setFilterBy])

    const handleSearchShortcut = useCallback(() => {
        setSearchExpanded(true)
    }, [setSearchExpanded])

    const handleClearFilters = useCallback(() => {
        setFilterBy('all')
        setGenreFilter('all')
    }, [setFilterBy, setGenreFilter])

    const handleEscapeShortcut = useCallback(() => {
        if (searchExpanded) {
            setSearchExpanded(false)
            setSearchQuery('')
            return
        }
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }, [searchExpanded, setSearchExpanded, setSearchQuery])

    useKeyboardShortcuts({
        onSearch: handleSearchShortcut,
        onEscape: handleEscapeShortcut
    })

    const fetchData = useCallback(async () => {
        try {
            const [moviesData, tvData, unscannedData, historyData] = await Promise.all([
                window.electron.ipcRenderer.invoke('get-movies'),
                window.electron.ipcRenderer.invoke('get-tv-shows'),
                window.electron.ipcRenderer.invoke('get-unscanned-files'),
                window.electron.ipcRenderer.invoke('get-history')
            ])

            setMovies(moviesData || [])
            setTvShows(tvData || [])
            setUnscannedFiles(unscannedData || [])
            setHistory(historyData || [])
            setLoadError(null)
        } catch (error) {
            // An IPC failure used to render as an empty library, hiding the real problem.
            console.error('Failed to fetch library data:', error)
            setLoadError(error instanceof Error ? error.message : t('library:loadLibraryFailed'))
        } finally {
            setLoading(false)
        }
    }, [t])

    useEffect(() => {
        void fetchData()
    }, [fetchData])

    useEffect(() => addFinishListener(() => void fetchData()), [addFinishListener, fetchData])

    useEffect(() => {
        if (activeTab === 'history') {
            window.electron.ipcRenderer.invoke('get-history')
                .then(historyData => setHistory(historyData || []))
                .catch(error => console.error('Failed to refresh history:', error))
        }
    }, [activeTab])

    useEffect(() => {
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
        }
    }, [])

    // Search matching is the expensive part; the deferred value keeps typing responsive
    // while the grid still reflects the query a frame later.
    const deferredQuery = useDeferredValue(searchQuery)

    const matchedMovies = useMemo(() => {
        if (!deferredQuery) return movies
        return movies.filter(movie =>
            matchesSearch(movie?.title || '', deferredQuery) ||
            matchesCastSearch(movie.cast, deferredQuery) ||
            matchesNameListSearch(movie.director, deferredQuery)
        )
    }, [movies, deferredQuery])

    const matchedTvShows = useMemo(() => {
        if (!deferredQuery) return tvShows
        return tvShows.filter(show =>
            matchesSearch(show?.name || '', deferredQuery) ||
            matchesCastSearch(show.cast, deferredQuery) ||
            matchesNameListSearch(show.createdBy, deferredQuery)
        )
    }, [tvShows, deferredQuery])

    /** The tab narrows the collection and the status filter narrows what the tab left. */
    const statusFilteredMovies = useMemo(() => {
        let list = matchedMovies
        if (activeTab === 'favorites') list = list.filter(movie => isFavorite('movie', movie.id))
        if (filterBy === 'watched') list = list.filter(movie => watchStatus[mediaKey('movie', movie.id)]?.watched)
        if (filterBy === 'unwatched') list = list.filter(movie => !watchStatus[mediaKey('movie', movie.id)]?.watched)
        return list
    }, [matchedMovies, activeTab, filterBy, isFavorite, watchStatus])

    const statusFilteredTvShows = useMemo(() => {
        let list = matchedTvShows
        if (activeTab === 'favorites') list = list.filter(show => isFavorite('tv', show.id))
        if (filterBy === 'watched') list = list.filter(show => watchStatus[mediaKey('tv', show.id)]?.watched)
        if (filterBy === 'unwatched') list = list.filter(show => !watchStatus[mediaKey('tv', show.id)]?.watched)
        return list
    }, [matchedTvShows, activeTab, filterBy, isFavorite, watchStatus])

    const genreFilteredMovies = useMemo(
        () => statusFilteredMovies.filter(movie => genreFilter === 'all' || normalizeGenres(movie.genres).includes(genreFilter)),
        [statusFilteredMovies, genreFilter]
    )

    const genreFilteredTvShows = useMemo(
        () => statusFilteredTvShows.filter(show => genreFilter === 'all' || normalizeGenres(show.genres).includes(genreFilter)),
        [statusFilteredTvShows, genreFilter]
    )

    const compare = useCallback((a: Sortable, b: Sortable) => {
        switch (sortBy) {
            case 'name-asc':
                return a.sortKey.localeCompare(b.sortKey)
            case 'name-desc':
                return b.sortKey.localeCompare(a.sortKey)
            case 'date-desc':
                return b.sortDate.localeCompare(a.sortDate)
            case 'date-asc':
                return a.sortDate.localeCompare(b.sortDate)
            case 'popularity-desc': {
                // Movie and TV popularity live on different scales; weight movies so the mixed
                // "All" tab does not always put every movie first.
                const aWeighted = (a.popularity || 0) * (a.type === 'movie' ? 3 : 1)
                const bWeighted = (b.popularity || 0) * (b.type === 'movie' ? 3 : 1)
                return bWeighted - aWeighted
            }
            case 'recently-added': {
                // On the Favorites tab and under the watched filter the interesting recency is
                // when the title was marked, not when it was scanned in.
                if (filterBy === 'watched' || activeTab === 'favorites') {
                    return statusTimestamp(b.type, b.id) - statusTimestamp(a.type, a.id)
                }
                return (b.createdAt || 0) - (a.createdAt || 0)
            }
            default:
                return 0
        }
    }, [sortBy, filterBy, activeTab, statusTimestamp])

    const toSortable = useCallback((record: MovieRecord | TVShowRecord, type: 'movie' | 'tv'): Sortable => ({
        type,
        id: record.id,
        sortKey: 'title' in record ? record.title || '' : record.name || '',
        sortDate: 'releaseDate' in record ? record.releaseDate || '' : record.firstAirDate || '',
        popularity: record.popularity,
        createdAt: record.createdAt,
        name: 'title' in record ? record.title : record.name
    }), [])

    const sortedWith = useCallback(<T extends MovieRecord | TVShowRecord>(records: T[], type: 'movie' | 'tv') =>
        [...records]
            .map(record => ({ record, sortable: toSortable(record, type) }))
            .sort((a, b) => compare(a.sortable, b.sortable))
            .map(entry => ({
                id: entry.record.id,
                type,
                title: entry.sortable.name,
                posterPath: displayPoster(entry.record, settings) ?? ''
            })),
        [compare, toSortable, settings])

    const movieGridItems = useMemo<GridItem[]>(
        () => sortedWith(genreFilteredMovies, 'movie'),
        [sortedWith, genreFilteredMovies]
    )

    const tvGridItems = useMemo<GridItem[]>(
        () => sortedWith(genreFilteredTvShows, 'tv'),
        [sortedWith, genreFilteredTvShows]
    )

    const combinedGridItems = useMemo<GridItem[]>(() => {
        const entries: Array<Sortable & { poster: string; title: string }> = [
            ...genreFilteredMovies.map(movie => ({ ...toSortable(movie, 'movie'), poster: displayPoster(movie, settings) ?? '', title: movie.title })),
            ...genreFilteredTvShows.map(show => ({ ...toSortable(show, 'tv'), poster: displayPoster(show, settings) ?? '', title: show.name }))
        ]

        return entries
            .sort((a, b) => compare(a, b))
            .map(entry => ({ id: entry.id, type: entry.type, title: entry.title, posterPath: entry.poster }))
    }, [genreFilteredMovies, genreFilteredTvShows, toSortable, compare, settings])

    const filteredHistory = useMemo(
        () => deferredQuery ? history.filter(item => matchesSearch(item?.title || '', deferredQuery)) : history,
        [history, deferredQuery]
    )

    const genreOptions = useMemo(() => {
        const allGenres = [
            ...movies.flatMap(movie => normalizeGenres(movie.genres)),
            ...tvShows.flatMap(show => normalizeGenres(show.genres))
        ]
        return Array.from(new Set(allGenres)).sort((a, b) => {
            if (a === 'Other') return 1
            if (b === 'Other') return -1
            return a.localeCompare(b)
        })
    }, [movies, tvShows])

    useEffect(() => {
        if (loading) return
        if (genreOptions.length === 0) return
        if (genreFilter !== 'all' && !genreOptions.includes(genreFilter)) {
            setGenreFilter('all')
        }
    }, [loading, genreFilter, genreOptions, setGenreFilter])

    // Restore the scroll position once after the first paint of the data, not on every keystroke.
    useEffect(() => {
        if (loading || restoredScroll.current) return
        restoredScroll.current = true

        const container = scrollRef.current
        const saved = sessionStorage.getItem('library_scroll')
        if (!container || !saved) return

        requestAnimationFrame(() => {
            container.scrollTop = parseInt(saved, 10)
        })
    }, [loading])

    useEffect(() => {
        const container = scrollRef.current
        if (!container) return

        let frame = 0
        const handleScroll = () => {
            if (frame) return
            frame = requestAnimationFrame(() => {
                frame = 0
                sessionStorage.setItem('library_scroll', String(container.scrollTop))
            })
        }

        container.addEventListener('scroll', handleScroll, { passive: true })
        return () => {
            container.removeEventListener('scroll', handleScroll)
            if (frame) cancelAnimationFrame(frame)
        }
    }, [])

    const handleDeleteHistory = async (id: string) => {
        try {
            await window.electron.ipcRenderer.invoke('delete-history-item', id)
            setHistory(prev => prev.filter(item => item.id !== id))
        } catch (error) {
            console.error('Failed to delete history item:', error)
        }
    }

    const posterTitleMode = settings?.posterTitleMode || 'hover'
    const posterSize = settings?.posterSize || 'medium'

    const emptyMessage = (label: string, hint: React.ReactNode) => (
        searchQuery ? (
            <>
                <p className="mb-1">{t('library:noResultsFound')}</p>
                <p className="text-sm">{hint}</p>
            </>
        ) : (
            <p>{label}</p>
        )
    )

    return (
        <div className="h-full flex flex-col">
            {/* The class name is load-bearing: useKeyboardShortcuts queries it to scroll home on Escape. */}
            <div ref={scrollRef} className="library-scroll-container flex-1 overflow-auto pt-12 px-8 lg:px-[72px] pb-8">
                <div className="titlebar-fade fixed top-0 left-0 right-0 h-8 z-[99] pointer-events-none" />
                <div className="mb-8">
                    <div className="flex flex-wrap items-center gap-y-4">
                        <LibraryTabs activeTab={activeTab} onTabChange={setActiveTab} />

                        <LibraryActions
                            sortBy={sortBy}
                            onSortChange={setSortBy}
                            onSearchToggle={() => setSearchExpanded(!searchExpanded)}
                            searchExpanded={searchExpanded}
                            activeTab={activeTab}
                            filterBy={filterBy}
                            onFilterChange={setFilterBy}
                            genreFilter={genreFilter}
                            genreOptions={genreOptions}
                            onGenreFilterChange={setGenreFilter}
                            onClearFilters={handleClearFilters}
                        />
                    </div>
                </div>

                {scanning && <ScanProgressBar />}

                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    onClose={() => setSearchExpanded(false)}
                    visible={searchExpanded}
                    placeholder={activeTab === 'history'
                        ? t('library:searchHistoryPlaceholder')
                        : t('library:librarySearchPlaceholder')}
                />

                {loadError ? (
                    <div role="alert">
                        <EmptyState
                            className="mt-20"
                            icon={AlertTriangle}
                            title={t('library:couldNotLoadLibrary')}
                            hint={<span className="break-all">{loadError}</span>}
                        >
                            <Button
                                onClick={() => {
                                    setLoading(true)
                                    void fetchData()
                                }}
                            >
                                {t('library:tryAgain')}
                            </Button>
                        </EmptyState>
                    </div>
                ) : loading ? (
                    <LoadingPanel label={t('library:loadingLibrary')} className="mt-20" />
                ) : (
                    <>
                        {(activeTab === 'all' || activeTab === 'favorites') && (
                            <>
                                <MediaGrid
                                    items={combinedGridItems}
                                    posterTitleMode={posterTitleMode}
                                    posterSize={posterSize}
                                    onChanged={fetchData}
                                    emptyMessage={emptyMessage(
                                        activeTab === 'favorites' ? t('library:noFavoritesFound') : t('library:noContentFound'),
                                        t('library:tryAdjustingSearch')
                                    )}
                                />
                                {activeTab === 'all' && <UnscannedFiles files={unscannedFiles} onRefresh={fetchData} />}
                            </>
                        )}

                        {activeTab === 'movies' && (
                            <MediaGrid
                                items={movieGridItems}
                                posterTitleMode={posterTitleMode}
                                posterSize={posterSize}
                                onChanged={fetchData}
                                emptyMessage={emptyMessage(t('library:noMoviesFound'), t('library:tryAdjustingSearch'))}
                            />
                        )}

                        {activeTab === 'tv' && (
                            <MediaGrid
                                items={tvGridItems}
                                posterTitleMode={posterTitleMode}
                                posterSize={posterSize}
                                onChanged={fetchData}
                                emptyMessage={emptyMessage(t('library:noTvShowsFound'), t('library:tryAdjustingSearch'))}
                            />
                        )}

                        {activeTab === 'history' && (
                            <HistoryList
                                items={filteredHistory}
                                onDelete={handleDeleteHistory}
                                emptyMessage={searchQuery ? (
                                    <>
                                        <p className="text-xl mb-2">{t('library:noHistoryFound')}</p>
                                        <p>{t('library:tryAdjustingSearch')}</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-xl mb-2">{t('library:noHistoryYet')}</p>
                                        <p>{t('library:noHistoryHint')}</p>
                                    </>
                                )}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
