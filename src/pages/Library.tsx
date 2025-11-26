import { useState, useEffect, useRef } from 'react'
import { Settings, ChevronDown, Search, X, ArrowUpDown, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface Movie {
    id: number
    title: string
    posterPath: string
    releaseDate: string
    voteAverage?: number
    popularity?: number
    imdbVotes?: number
    imdbRating?: number
}

interface TVShow {
    id: number
    name: string
    posterPath: string
    firstAirDate: string
    voteAverage?: number
    popularity?: number
    imdbVotes?: number
    imdbRating?: number
}

interface UnscannedFile {
    id: string
    name: string
    filePath: string
    sourceName?: string
    webdavUrl?: string
}

interface HistoryItem {
    id: string
    mediaId: number
    mediaType: 'movie' | 'tv'
    title: string
    posterPath: string
    filePath: string
    timestamp: number
    seasonNumber?: number
    episodeNumber?: number
    episodeName?: string
}

export default function LibraryPage() {
    const [movies, setMovies] = useState<Movie[]>([])
    const [tvShows, setTvShows] = useState<TVShow[]>([])
    const [unscannedFiles, setUnscannedFiles] = useState<UnscannedFile[]>([])
    const [history, setHistory] = useState<HistoryItem[]>([])
    const [unscannedExpanded, setUnscannedExpanded] = useState(false)
    const [searchExpanded, setSearchExpanded] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [filterMenuOpen, setFilterMenuOpen] = useState(false)
    const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'date-desc' | 'date-asc' | 'rating-desc' | 'imdb-rating-desc'>(() => {
        return (localStorage.getItem('library_sort_by') as 'name-asc' | 'name-desc' | 'date-desc' | 'date-asc' | 'rating-desc' | 'imdb-rating-desc') || 'name-asc'
    })
    const [activeTab, setActiveTab] = useState<'all' | 'movies' | 'tv' | 'history'>(() => {
        return (sessionStorage.getItem('library_active_tab') as 'all' | 'movies' | 'tv' | 'history') || 'all'
    })
    const [loading, setLoading] = useState(false)
    const [showTitlesOnPosters, setShowTitlesOnPosters] = useState(false)
    const navigate = useNavigate()
    const scrollRef = useRef<HTMLDivElement>(null)
    const filterMenuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        sessionStorage.setItem('library_active_tab', activeTab)
    }, [activeTab])

    useEffect(() => {
        localStorage.setItem('library_sort_by', sortBy)
    }, [sortBy])

    const fetchData = async () => {
        setLoading(true)
        try {
            // @ts-ignore
            const moviesData = await window.electron.ipcRenderer.invoke('get-movies')
            setMovies(moviesData)

            // @ts-ignore
            const tvData = await window.electron.ipcRenderer.invoke('get-tv-shows')
            setTvShows(tvData)

            // @ts-ignore
            const unscannedData = await window.electron.ipcRenderer.invoke('get-unscanned-files')
            setUnscannedFiles(unscannedData)

            // @ts-ignore
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

        // Fetch display settings
        // @ts-ignore
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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
                setFilterMenuOpen(false)
            }
        }
        if (filterMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [filterMenuOpen])

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

    type CombinedItem = (Movie & { type: 'movie', sortKey: string, sortDate: string }) | (TVShow & { type: 'tv', sortKey: string, sortDate: string })

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

    return (
        <div className="h-full flex flex-col">
            {/* Main Content */}
            <div ref={scrollRef} className="flex-1 overflow-auto p-8">
                <div className="mb-8">
                    <div className="relative flex items-center justify-between">
                        <h2 className="text-3xl font-bold ml-[5px]">Vishel</h2>

                        <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 bg-neutral-800 rounded-full p-1">
                            <button
                                onClick={() => setActiveTab('all')}
                                className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all ${activeTab === 'all' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setActiveTab('movies')}
                                className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all ${activeTab === 'movies' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
                            >
                                Movies
                            </button>
                            <button
                                onClick={() => setActiveTab('tv')}
                                className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all ${activeTab === 'tv' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
                            >
                                TV Shows
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all ${activeTab === 'history' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
                            >
                                History
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="relative" ref={filterMenuRef}>
                                <button
                                    onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                                    className="p-2 rounded-full text-gray-400 hover:bg-neutral-800 hover:text-white transition-colors"
                                >
                                    <ArrowUpDown className="w-6 h-6" />
                                </button>
                                {filterMenuOpen && (
                                    <div className="absolute right-0 mt-2 w-56 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700 py-2 z-50">
                                        <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Sort By</div>
                                        {[
                                            { value: 'name-asc', label: 'Name (A-Z)' },
                                            { value: 'name-desc', label: 'Name (Z-A)' },
                                            { value: 'date-desc', label: 'Date (Newest)' },
                                            { value: 'date-asc', label: 'Date (Oldest)' },
                                            { value: 'rating-desc', label: 'Popularity (Highest)' },
                                            { value: 'imdb-rating-desc', label: 'IMDb Rating' },
                                        ].map(option => (
                                            <button
                                                key={option.value}
                                                onClick={() => {
                                                    setSortBy(option.value as any)
                                                    setFilterMenuOpen(false)
                                                }}
                                                className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-700 transition-colors flex items-center justify-between"
                                            >
                                                <span className="text-white">{option.label}</span>
                                                {sortBy === option.value && <Check className="w-4 h-4 text-white" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => setSearchExpanded(!searchExpanded)}
                                className="p-2 rounded-full text-gray-400 hover:bg-neutral-800 hover:text-white transition-colors"
                            >
                                <Search className="w-6 h-6" />
                            </button>
                            <button
                                onClick={() => navigate('/settings')}
                                className="p-2 rounded-full text-gray-400 hover:bg-neutral-800 hover:text-white transition-colors"
                            >
                                <Settings className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    <div className="flex md:hidden justify-center mt-4">
                        <div className="flex bg-neutral-800 rounded-full p-1 text-sm">
                            <button
                                onClick={() => setActiveTab('all')}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-full transition-all ${activeTab === 'all' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setActiveTab('movies')}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-full transition-all ${activeTab === 'movies' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
                            >
                                Movies
                            </button>
                            <button
                                onClick={() => setActiveTab('tv')}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-full transition-all ${activeTab === 'tv' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
                            >
                                TV Shows
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-full transition-all ${activeTab === 'history' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
                            >
                                History
                            </button>
                        </div>
                    </div>
                </div>

                {searchExpanded && (
                    <div className="mb-6 relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onBlur={() => {
                                if (!searchQuery) {
                                    setTimeout(() => {
                                        setSearchExpanded(false)
                                    }, 100)
                                }
                            }}
                            placeholder="Search movies and TV shows..."
                            className="w-full bg-neutral-800 text-white px-4 py-3 pr-10 rounded-full focus:outline-none focus:ring-2 focus:ring-white/20"
                            autoFocus
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                )
                }

                {
                    loading ? (
                        <div className="text-center text-gray-400 mt-20" > Loading library...</div>
                    ) : (
                        <>
                            {activeTab === 'all' && (
                                (combinedItems.length === 0) ? (
                                    <div className="text-center text-gray-400 mt-20">
                                        {searchQuery ? (
                                            <>
                                                <p className="text-xl mb-2">No results found</p>
                                                <p>Try adjusting your search terms.</p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-xl mb-2">No content found</p>
                                                <p>Configure your data sources and click Scan to start.</p>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                                        {combinedItems.map(item => (
                                            <div key={`${item.type}-${item.id}`} className="group">
                                                <div className={`relative rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${showTitlesOnPosters ? 'group-hover:-translate-y-1' : ''}`}>
                                                    <div
                                                        onClick={() => navigate(item.type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`)}
                                                        className="aspect-[2/3] relative cursor-pointer bg-neutral-800"
                                                    >
                                                        {item.posterPath ? (
                                                            <img
                                                                src={`https://image.tmdb.org/t/p/w500${item.posterPath}`}
                                                                alt={item.type === 'movie' ? (item as Movie).title : (item as TVShow).name}
                                                                className={`w-full h-full object-cover ${showTitlesOnPosters ? '' : 'group-hover:blur-sm transition-all duration-[100ms]'}`}
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center bg-neutral-700 text-neutral-500">
                                                                No Poster
                                                            </div>
                                                        )}
                                                        {!showTitlesOnPosters && (
                                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-300 delay-[50ms] flex items-center justify-center p-4 opacity-0 group-hover:opacity-100">
                                                                <h3 className="font-bold text-white text-center text-lg">
                                                                    {item.type === 'movie' ? (item as Movie).title : (item as TVShow).name}
                                                                </h3>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {showTitlesOnPosters && (
                                                    <div
                                                        onClick={() => navigate(item.type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`)}
                                                        className="mt-2 cursor-pointer transition-transform duration-300 group-hover:-translate-y-1"
                                                    >
                                                        <h3 className="font-bold text-white text-base text-center px-1">
                                                            {item.type === 'movie' ? (item as Movie).title : (item as TVShow).name}
                                                        </h3>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )
                            )}

                            {activeTab === 'all' && unscannedFiles.length > 0 && (
                                <div className="mt-12 mb-8">
                                    <div
                                        className="flex items-center justify-between mb-4 cursor-pointer group"
                                        onClick={() => setUnscannedExpanded(!unscannedExpanded)}
                                    >
                                        <h3 className="text-xl font-semibold text-gray-400 group-hover:text-gray-300 transition-colors">
                                            Unscanned Files ({unscannedFiles.length})
                                        </h3>
                                        <ChevronDown className={`w-5 h-5 text-gray-400 group-hover:text-gray-300 transition-all ${unscannedExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                    {unscannedExpanded && (
                                        <div className="bg-neutral-800 rounded-xl overflow-hidden">
                                            {unscannedFiles.map(file => (
                                                <div
                                                    key={file.id}
                                                    className="p-4 border-b border-neutral-700 last:border-0 flex items-center justify-between hover:bg-neutral-700/50 transition-colors cursor-pointer group/item"
                                                    onClick={() => {
                                                        if (file.webdavUrl) {
                                                            // @ts-ignore
                                                            window.electron.ipcRenderer.invoke('play-video', {
                                                                url: file.webdavUrl,
                                                                title: file.name
                                                            })
                                                        }
                                                    }}
                                                >
                                                    <div className="overflow-hidden">
                                                        <p className="font-medium text-white truncate">{file.name}</p>
                                                        <p className="text-sm text-gray-500 truncate">
                                                            {file.sourceName ? <span>{file.sourceName}</span> : null}
                                                            {file.sourceName ? ' - ' : ''}
                                                            {file.filePath}
                                                        </p>
                                                    </div>
                                                    <div className="text-xs text-neutral-500 px-2 py-1 bg-neutral-900 rounded whitespace-nowrap">
                                                        Unidentified
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'movies' && (
                                sortedMovies.length === 0 ? (
                                    <div className="text-center text-gray-400 mt-20">
                                        {searchQuery ? (
                                            <>
                                                <p className="text-xl mb-2">No movies found</p>
                                                <p>Try adjusting your search terms.</p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-xl mb-2">No movies found</p>
                                                <p>Configure your data sources and click Scan to start.</p>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                                        {sortedMovies.map(movie => (
                                            <div key={movie.id} className="group">
                                                <div className={`relative rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${showTitlesOnPosters ? 'group-hover:-translate-y-1' : ''}`}>
                                                    <div
                                                        onClick={() => navigate(`/movie/${movie.id}`)}
                                                        className="aspect-[2/3] relative cursor-pointer bg-neutral-800"
                                                    >
                                                        {movie.posterPath ? (
                                                            <img
                                                                src={`https://image.tmdb.org/t/p/w500${movie.posterPath}`}
                                                                alt={movie.title}
                                                                className={`w-full h-full object-cover ${showTitlesOnPosters ? '' : 'group-hover:blur-sm transition-all duration-300'}`}
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center bg-neutral-700 text-neutral-500">
                                                                No Poster
                                                            </div>
                                                        )}
                                                        {!showTitlesOnPosters && (
                                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-300 delay-[50ms] flex items-center justify-center p-4 opacity-0 group-hover:opacity-100">
                                                                <h3 className="font-bold text-white text-center text-lg">{movie.title}</h3>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {showTitlesOnPosters && (
                                                    <div
                                                        onClick={() => navigate(`/movie/${movie.id}`)}
                                                        className="mt-2 cursor-pointer transition-transform duration-300 group-hover:-translate-y-1"
                                                    >
                                                        <h3 className="font-bold text-white text-base text-center px-1">{movie.title}</h3>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )
                            )}

                            {activeTab === 'tv' && (
                                sortedTvShows.length === 0 ? (
                                    <div className="text-center text-gray-400 mt-20">
                                        {searchQuery ? (
                                            <>
                                                <p className="text-xl mb-2">No TV shows found</p>
                                                <p>Try adjusting your search terms.</p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-xl mb-2">No TV shows found</p>
                                                <p>Ensure your files are named with SxxExx format (e.g. S01E01).</p>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                                        {sortedTvShows.map(show => (
                                            <div key={show.id} className="group">
                                                <div className={`relative rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${showTitlesOnPosters ? 'group-hover:-translate-y-1' : ''}`}>
                                                    <div
                                                        onClick={() => navigate(`/tv/${show.id}`)}
                                                        className="aspect-[2/3] relative cursor-pointer bg-neutral-800"
                                                    >
                                                        {show.posterPath ? (
                                                            <img
                                                                src={`https://image.tmdb.org/t/p/w500${show.posterPath}`}
                                                                alt={show.name}
                                                                className={`w-full h-full object-cover ${showTitlesOnPosters ? '' : 'group-hover:blur-sm transition-all duration-300'}`}
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center bg-neutral-700 text-neutral-500">
                                                                No Poster
                                                            </div>
                                                        )}
                                                        {!showTitlesOnPosters && (
                                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-300 delay-[50ms] flex items-center justify-center p-4 opacity-0 group-hover:opacity-100">
                                                                <h3 className="font-bold text-white text-center text-lg">{show.name}</h3>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {showTitlesOnPosters && (
                                                    <div
                                                        onClick={() => navigate(`/tv/${show.id}`)}
                                                        className="mt-2 cursor-pointer transition-transform duration-300 group-hover:-translate-y-1"
                                                    >
                                                        <h3 className="font-bold text-white text-base text-center px-1">{show.name}</h3>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )
                            )}

                            {activeTab === 'history' && (
                                filteredHistory.length === 0 ? (
                                    <div className="text-center text-gray-400 mt-20">
                                        {searchQuery ? (
                                            <>
                                                <p className="text-xl mb-2">No history found</p>
                                                <p>Try adjusting your search terms.</p>
                                            </>
                                        ) : (
                                            <>
                                                <p className="text-xl mb-2">No history found</p>
                                                <p>Start watching movies or TV shows to see them here.</p>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                                        {filteredHistory.map(item => (
                                            <div key={item.id} className="group">
                                                <div className={`relative rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ${showTitlesOnPosters ? 'group-hover:-translate-y-1' : ''}`}>
                                                    <div
                                                        className="aspect-[2/3] relative cursor-pointer bg-neutral-800"
                                                        onClick={() => navigate(item.mediaType === 'movie' ? `/movie/${item.mediaId}` : `/tv/${item.mediaId}`)}
                                                    >
                                                        {item.posterPath ? (
                                                            <img
                                                                src={`https://image.tmdb.org/t/p/w500${item.posterPath}`}
                                                                alt={item.title}
                                                                className={`w-full h-full object-cover ${showTitlesOnPosters ? '' : 'group-hover:blur-sm transition-all duration-300'}`}
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center bg-neutral-700 text-neutral-500">
                                                                No Poster
                                                            </div>
                                                        )}
                                                        {!showTitlesOnPosters && (
                                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-300 delay-[50ms] flex flex-col items-center justify-center p-4 opacity-0 group-hover:opacity-100">
                                                                <h3 className="font-bold text-white text-center text-lg mb-1">{item.title}</h3>
                                                                {item.mediaType === 'tv' && item.seasonNumber && item.episodeNumber && (
                                                                    <p className="text-gray-300 text-sm mb-1">
                                                                        S{item.seasonNumber}E{item.episodeNumber}
                                                                    </p>
                                                                )}
                                                                <p className="text-gray-400 text-xs">
                                                                    {new Date(item.timestamp).toLocaleDateString()}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            // @ts-ignore
                                                            window.electron.ipcRenderer.invoke('delete-history-item', item.id).then(() => {
                                                                setHistory(prev => prev.filter(h => h.id !== item.id))
                                                            })
                                                        }}
                                                        className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-red-500 rounded-full transition-colors z-10 opacity-0 group-hover:opacity-100"
                                                        title="Remove from history"
                                                    >
                                                        <X className="w-4 h-4 text-white" />
                                                    </button>
                                                </div>
                                                {showTitlesOnPosters && (
                                                    <div
                                                        onClick={() => navigate(item.mediaType === 'movie' ? `/movie/${item.mediaId}` : `/tv/${item.mediaId}`)}
                                                        className="mt-2 cursor-pointer text-center transition-transform duration-300 group-hover:-translate-y-1"
                                                    >
                                                        <h3 className="font-bold text-white text-base px-1">{item.title}</h3>
                                                        {item.mediaType === 'tv' && item.seasonNumber && item.episodeNumber && (
                                                            <p className="text-gray-400 text-xs mt-1">
                                                                S{item.seasonNumber}E{item.episodeNumber}
                                                            </p>
                                                        )}
                                                        <p className="text-gray-500 text-xs mt-1">
                                                            {new Date(item.timestamp).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )
                            )}
                        </>
                    )
                }
            </div >
        </div >
    )
}
