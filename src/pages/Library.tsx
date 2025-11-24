import { useState, useEffect, useRef } from 'react'
import { Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface Movie {
    id: number
    title: string
    posterPath: string
    releaseDate: string
}

interface TVShow {
    id: number
    name: string
    posterPath: string
    firstAirDate: string
}

export default function LibraryPage() {
    const [movies, setMovies] = useState<Movie[]>([])
    const [tvShows, setTvShows] = useState<TVShow[]>([])
    const [activeTab, setActiveTab] = useState<'all' | 'movies' | 'tv'>(() => {
        return (sessionStorage.getItem('library_active_tab') as 'all' | 'movies' | 'tv') || 'all'
    })
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        sessionStorage.setItem('library_active_tab', activeTab)
    }, [activeTab])

    const fetchData = async () => {
        setLoading(true)
        try {
            // @ts-ignore
            const moviesData = await window.electron.ipcRenderer.invoke('get-movies')
            setMovies(moviesData)

            // @ts-ignore
            const tvData = await window.electron.ipcRenderer.invoke('get-tv-shows')
            setTvShows(tvData)
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
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

    return (
        <div className="h-full flex flex-col">
            {/* Main Content */}
            <div ref={scrollRef} className="flex-1 overflow-auto p-8">
                <div className="relative flex items-center justify-between mb-8">
                    <h2 className="text-3xl font-bold ml-[5px]">Vishel</h2>

                    <div className="absolute left-1/2 -translate-x-1/2 flex bg-neutral-800 rounded-full p-1">
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
                    </div>

                    <button
                        onClick={() => navigate('/settings')}
                        className="p-2 rounded-full text-gray-400 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                        <Settings className="w-6 h-6" />
                    </button>
                </div>

                {loading ? (
                    <div className="text-center text-gray-400 mt-20">Loading library...</div>
                ) : (
                    <>
                        {activeTab === 'all' && (
                            (movies.length === 0 && tvShows.length === 0) ? (
                                <div className="text-center text-gray-400 mt-20">
                                    <p className="text-xl mb-2">No content found</p>
                                    <p>Configure your data sources and click Scan to start.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                                    {movies.map(movie => (
                                        <div
                                            key={`movie-${movie.id}`}
                                            onClick={() => navigate(`/movie/${movie.id}`)}
                                            className="group relative bg-neutral-800 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer"
                                        >
                                            <div className="aspect-[2/3] relative">
                                                {movie.posterPath ? (
                                                    <img
                                                        src={`https://image.tmdb.org/t/p/w500${movie.posterPath}`}
                                                        alt={movie.title}
                                                        className="w-full h-full object-cover transition-all duration-[100ms] group-hover:blur-sm"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-neutral-700 text-neutral-500">
                                                        No Poster
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-300 delay-[50ms] flex items-center justify-center p-4 opacity-0 group-hover:opacity-100">
                                                    <h3 className="font-bold text-white text-center text-lg">{movie.title}</h3>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {tvShows.map(show => (
                                        <div
                                            key={`tv-${show.id}`}
                                            onClick={() => navigate(`/tv/${show.id}`)}
                                            className="group relative bg-neutral-800 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer"
                                        >
                                            <div className="aspect-[2/3] relative">
                                                {show.posterPath ? (
                                                    <img
                                                        src={`https://image.tmdb.org/t/p/w500${show.posterPath}`}
                                                        alt={show.name}
                                                        className="w-full h-full object-cover transition-all duration-[50ms] group-hover:blur-sm"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-neutral-700 text-neutral-500">
                                                        No Poster
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-300 delay-[50ms] flex items-center justify-center p-4 opacity-0 group-hover:opacity-100">
                                                    <h3 className="font-bold text-white text-center text-lg">{show.name}</h3>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {activeTab === 'movies' && (
                            movies.length === 0 ? (
                                <div className="text-center text-gray-400 mt-20">
                                    <p className="text-xl mb-2">No movies found</p>
                                    <p>Configure your data sources and click Scan to start.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                                    {movies.map(movie => (
                                        <div
                                            key={movie.id}
                                            onClick={() => navigate(`/movie/${movie.id}`)}
                                            className="group relative bg-neutral-800 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer"
                                        >
                                            <div className="aspect-[2/3] relative">
                                                {movie.posterPath ? (
                                                    <img
                                                        src={`https://image.tmdb.org/t/p/w500${movie.posterPath}`}
                                                        alt={movie.title}
                                                        className="w-full h-full object-cover transition-all duration-300 group-hover:blur-sm"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-neutral-700 text-neutral-500">
                                                        No Poster
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-300 delay-[50ms] flex items-center justify-center p-4 opacity-0 group-hover:opacity-100">
                                                    <h3 className="font-bold text-white text-center text-lg">{movie.title}</h3>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {activeTab === 'tv' && (
                            tvShows.length === 0 ? (
                                <div className="text-center text-gray-400 mt-20">
                                    <p className="text-xl mb-2">No TV shows found</p>
                                    <p>Ensure your files are named with SxxExx format (e.g. S01E01).</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                                    {tvShows.map(show => (
                                        <div
                                            key={show.id}
                                            onClick={() => navigate(`/tv/${show.id}`)}
                                            className="group relative bg-neutral-800 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer"
                                        >
                                            <div className="aspect-[2/3] relative">
                                                {show.posterPath ? (
                                                    <img
                                                        src={`https://image.tmdb.org/t/p/w500${show.posterPath}`}
                                                        alt={show.name}
                                                        className="w-full h-full object-cover transition-all duration-300 group-hover:blur-sm"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-neutral-700 text-neutral-500">
                                                        No Poster
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all duration-300 delay-[50ms] flex items-center justify-center p-4 opacity-0 group-hover:opacity-100">
                                                    <h3 className="font-bold text-white text-center text-lg">{show.name}</h3>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
