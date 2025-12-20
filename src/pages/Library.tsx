import { useState, useEffect, useRef, useCallback } from 'react'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { LibraryTabs } from '../components/library/LibraryTabs'
import { LibraryActions, SortOption } from '../components/library/LibraryActions'
import { SearchInput } from '../components/library/SearchInput'
import { MediaGrid } from '../components/library/MediaGrid'
import { HistoryList } from '../components/library/HistoryList'
import { UnscannedFiles } from '../components/library/UnscannedFiles'
import { Movie, TVShow, UnscannedFile, HistoryItem, CombinedItem } from '../types/library'

export default function LibraryPage() {
    const [movies, setMovies] = useState<Movie[]>([])
    const [tvShows, setTvShows] = useState<TVShow[]>([])
    const [unscannedFiles, setUnscannedFiles] = useState<UnscannedFile[]>([])
    const [history, setHistory] = useState<HistoryItem[]>([])
    const [searchExpanded, setSearchExpanded] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState<SortOption>(() => {
        return (localStorage.getItem('library_sort_by') as SortOption) || 'name-asc'
    })
    const [activeTab, setActiveTab] = useState<'all' | 'movies' | 'tv' | 'history'>(() => {
        return (sessionStorage.getItem('library_active_tab') as 'all' | 'movies' | 'tv' | 'history') || 'all'
    })
    const [loading, setLoading] = useState(false)
    const [showTitlesOnPosters, setShowTitlesOnPosters] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    // Keyboard shortcuts
    const handleSearchShortcut = useCallback(() => {
        setSearchExpanded(true)
    }, [])

    const handleEscapeShortcut = useCallback(() => {
        if (searchExpanded) {
            setSearchExpanded(false)
            setSearchQuery('')
        }
    }, [searchExpanded])

    useKeyboardShortcuts({
        onSearch: handleSearchShortcut,
        onEscape: handleEscapeShortcut
    })

    useEffect(() => {
        sessionStorage.setItem('library_active_tab', activeTab)
    }, [activeTab])

    useEffect(() => {
        localStorage.setItem('library_sort_by', sortBy)
    }, [sortBy])

    // Ensure arrow keys work for scrolling after navigation
    useEffect(() => {
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
        }
    }, [])

    const fetchData = async () => {
        setLoading(true)
        try {
            const moviesData = await window.electron.ipcRenderer.invoke('get-movies')
            setMovies(moviesData)

            const tvData = await window.electron.ipcRenderer.invoke('get-tv-shows')
            setTvShows(tvData)

            const unscannedData = await window.electron.ipcRenderer.invoke('get-unscanned-files')
            setUnscannedFiles(unscannedData)

            const historyData = await window.electron.ipcRenderer.invoke('get-history')
            setHistory(historyData)
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()

        window.electron.ipcRenderer.invoke('get-settings').then((data: any) => {
            setShowTitlesOnPosters(data.showTitlesOnPosters || false)
        })
    }, [])

    useEffect(() => {
        const container = scrollRef.current
        if (!container) return
        const savedScroll = sessionStorage.getItem('library_scroll')
        if (savedScroll && !loading) {
            container.scrollTop = parseInt(savedScroll, 10)
        }
        const handleScroll = () => {
            sessionStorage.setItem('library_scroll', container.scrollTop.toString())
        }
        container.addEventListener('scroll', handleScroll)
        return () => container.removeEventListener('scroll', handleScroll)
    }, [loading])

    const filteredMovies = searchQuery
        ? movies.filter(movie => movie.title.toLowerCase().includes(searchQuery.toLowerCase()))
        : movies

    const filteredTvShows = searchQuery
        ? tvShows.filter(show => show.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : tvShows

    const filteredHistory = searchQuery
        ? history.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()))
        : history

    const sortedMovies = [...filteredMovies].sort((a, b) => {
        switch (sortBy) {
            case 'name-asc':
                return a.title.localeCompare(b.title)
            case 'name-desc':
                return b.title.localeCompare(a.title)
            case 'date-desc':
                return (b.releaseDate || '').localeCompare(a.releaseDate || '')
            case 'date-asc':
                return (a.releaseDate || '').localeCompare(b.releaseDate || '')
            case 'rating-desc':
                return (b.imdbVotes || 0) - (a.imdbVotes || 0)
            case 'imdb-rating-desc':
                return (b.imdbRating || 0) - (a.imdbRating || 0)
            default:
                return 0
        }
    })

    const sortedTvShows = [...filteredTvShows].sort((a, b) => {
        switch (sortBy) {
            case 'name-asc':
                return a.name.localeCompare(b.name)
            case 'name-desc':
                return b.name.localeCompare(a.name)
            case 'date-desc':
                return (b.firstAirDate || '').localeCompare(a.firstAirDate || '')
            case 'date-asc':
                return (a.firstAirDate || '').localeCompare(b.firstAirDate || '')
            case 'rating-desc':
                return (b.imdbVotes || 0) - (a.imdbVotes || 0)
            case 'imdb-rating-desc':
                return (b.imdbRating || 0) - (a.imdbRating || 0)
            default:
                return 0
        }
    })

    const combinedItems: CombinedItem[] = [
        ...sortedMovies.map(m => ({ ...m, type: 'movie' as const, sortKey: m.title, sortDate: m.releaseDate })),
        ...sortedTvShows.map(s => ({ ...s, type: 'tv' as const, sortKey: s.name, sortDate: s.firstAirDate }))
    ].sort((a, b) => {
        switch (sortBy) {
            case 'name-asc':
                return a.sortKey.localeCompare(b.sortKey)
            case 'name-desc':
                return b.sortKey.localeCompare(a.sortKey)
            case 'date-desc':
                return (b.sortDate || '').localeCompare(a.sortDate || '')
            case 'date-asc':
                return (a.sortDate || '').localeCompare(b.sortDate || '')
            case 'rating-desc':
                return (b.imdbVotes || 0) - (a.imdbVotes || 0)
            case 'imdb-rating-desc':
                return (b.imdbRating || 0) - (a.imdbRating || 0)
            default:
                return 0
        }
    })

    const handleDeleteHistory = async (id: string) => {
        await window.electron.ipcRenderer.invoke('delete-history-item', id)
        setHistory(prev => prev.filter(h => h.id !== id))
    }

    return (
        <div className="h-full flex flex-col">
            <div ref={scrollRef} className="library-scroll-container flex-1 overflow-auto pt-12 px-8 pb-8">
                <div className="mb-8">
                    <div className="relative flex flex-wrap md:flex-nowrap items-center justify-between gap-y-4">
                        <h2 className="text-3xl font-bold ml-[5px] font-['Montserrat'] text-white/50 order-1">Vishel</h2>

                        <div className="order-3 md:order-2 w-full md:w-auto">
                            <LibraryTabs activeTab={activeTab} onTabChange={setActiveTab} />
                        </div>

                        <div className="order-2 md:order-3">
                            <LibraryActions
                                sortBy={sortBy}
                                onSortChange={setSortBy}
                                onSearchToggle={() => setSearchExpanded(!searchExpanded)}
                            />
                        </div>
                    </div>
                </div>

                <SearchInput
                    value={searchQuery}
                    onChange={setSearchQuery}
                    onClose={() => setSearchExpanded(false)}
                    visible={searchExpanded}
                />

                {loading ? (
                    <div className="text-center text-gray-400 mt-20">Loading library...</div>
                ) : (
                    <>
                        {activeTab === 'all' && (
                            <>
                                <MediaGrid
                                    items={combinedItems}
                                    showTitlesOnPosters={showTitlesOnPosters}
                                    emptyMessage={
                                        searchQuery ? (
                                            <>
                                                <p className="text-xl mb-2">No results found</p>
                                                <p>Try adjusting your search terms.</p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-xl mb-2">No content found</p>
                                                <p>Configure your data sources and click Scan to start.</p>
                                            </>
                                        )
                                    }
                                />
                                <UnscannedFiles files={unscannedFiles} onRefresh={fetchData} />
                            </>
                        )}

                        {activeTab === 'movies' && (
                            <MediaGrid
                                items={sortedMovies}
                                showTitlesOnPosters={showTitlesOnPosters}
                                type="movie"
                                emptyMessage={
                                    searchQuery ? (
                                        <>
                                            <p className="text-xl mb-2">No movies found</p>
                                            <p>Try adjusting your search terms.</p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-xl mb-2">No movies found</p>
                                            <p>Configure your data sources and click Scan to start.</p>
                                        </>
                                    )
                                }
                            />
                        )}

                        {activeTab === 'tv' && (
                            <MediaGrid
                                items={sortedTvShows}
                                showTitlesOnPosters={showTitlesOnPosters}
                                type="tv"
                                emptyMessage={
                                    searchQuery ? (
                                        <>
                                            <p className="text-xl mb-2">No TV shows found</p>
                                            <p>Try adjusting your search terms.</p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-xl mb-2">No TV shows found</p>
                                            <p>Ensure your files are named with SxxExx format (e.g. S01E01).</p>
                                        </>
                                    )
                                }
                            />
                        )}

                        {activeTab === 'history' && (
                            <HistoryList
                                items={filteredHistory}
                                onDelete={handleDeleteHistory}
                                emptyMessage={
                                    searchQuery ? (
                                        <>
                                            <p className="text-xl mb-2">No history found</p>
                                            <p>Try adjusting your search terms.</p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-xl mb-2">No history found</p>
                                            <p>Start watching movies or TV shows to see them here.</p>
                                        </>
                                    )
                                }
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
