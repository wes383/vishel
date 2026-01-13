import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Play, Calendar, Clock, User, X, Loader2, ChevronLeft, Heart } from 'lucide-react'


import { DataSource } from '../../electron/store'
import { formatVoteCount } from '../utils/formatNumber'

interface Cast {
    name: string
    character: string
    profilePath: string
}

interface VideoFile {
    id: string
    name: string
    filePath: string
    webdavUrl: string
    sourceId: string
}

interface Movie {
    id: number
    title: string
    logoPath?: string
    posterPath: string
    backdropPath: string
    overview: string
    releaseDate: string
    videoFiles: VideoFile[]
    genres?: string[]
    runtime?: number
    voteAverage?: number
    imdbRating?: number
    imdbVotes?: number
    tagline?: string
    status?: string
    cast?: Cast[]
    director?: { name: string, profilePath: string | null }[]
    externalIds?: {
        imdb_id?: string
        tvdb_id?: number
    }
}

export default function MovieDetail() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [movie, setMovie] = useState<Movie | null>(null)
    const [loading, setLoading] = useState(true)
    const [showVersionSelector, setShowVersionSelector] = useState(false)
    const [sources, setSources] = useState<DataSource[]>([])
    const [playing, setPlaying] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isFavorited, setIsFavorited] = useState(false)

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Escape - close modal or go back
            if (e.key === 'Escape') {
                if (showVersionSelector) {
                    setShowVersionSelector(false)
                } else {
                    navigate('/')
                }
                e.preventDefault()
            }

            if (e.key === ' ' && !showVersionSelector && movie && !playing) {
                e.preventDefault()
            }

            // Ctrl/Cmd + , - Open settings
            if ((e.ctrlKey || e.metaKey) && e.key === ',') {
                navigate('/settings')
                e.preventDefault()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [navigate, showVersionSelector, movie, playing])

    useEffect(() => {
        const fetchMovie = async () => {
            if (!id) return
            try {
                const data = await window.electron.ipcRenderer.invoke('get-movie', parseInt(id))
                setMovie(data)
            } catch (error) {
                console.error('Failed to fetch movie:', error)
            } finally {
                setLoading(false)
            }
        }
        fetchMovie()

        window.electron.ipcRenderer.invoke('get-settings').then((data: any) => {
            setSources(data.sources || [])
        })

        // Check favorite status
        if (id) {
            window.electron.ipcRenderer.invoke('is-favorite', { mediaId: parseInt(id), mediaType: 'movie' })
                .then(setIsFavorited)
        }
    }, [id])

    const handlePlayClick = () => {
        if (!movie || !movie.videoFiles || movie.videoFiles.length === 0) return

        if (movie.videoFiles.length === 1) {
            playVideo(movie.videoFiles[0])
        } else {
            setShowVersionSelector(true)
        }
    }

    const playVideo = async (file: VideoFile) => {
        if (!movie) return
        setPlaying(true)
        setError(null)
        try {
            setShowVersionSelector(false)
            await window.electron.ipcRenderer.invoke('play-video', {
                url: file.webdavUrl,
                title: movie.title,
                history: {
                    mediaId: movie.id,
                    mediaType: 'movie',
                    title: movie.title,
                    posterPath: movie.posterPath,
                    filePath: file.filePath
                }
            })
        } catch (err: any) {
            setError(err?.message || 'Failed to launch player')
            setTimeout(() => setError(null), 5000)
        } finally {
            setPlaying(false)
        }
    }

    const openExternal = (url: string) => {
        window.electron.ipcRenderer.invoke('open-external', url)
    }

    const getSourceName = (sourceId: string): string => {
        const source = sources.find(s => s.id === sourceId)
        return source ? source.name : 'Unknown'
    }


    if (loading) {
        return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>
    }

    if (!movie) {
        return (
            <div className="flex flex-col items-center justify-center h-screen text-gray-400">
                <p className="text-xl mb-4">Movie not found</p>
                <button onClick={() => navigate('/')} className="p-2 hover:bg-neutral-800 rounded-full transition-colors">
                    <X className="w-6 h-6" />
                </button>
            </div>
        )
    }

    const formatRuntime = (minutes?: number) => {
        if (!minutes) return ''
        const h = Math.floor(minutes / 60)
        const m = minutes % 60
        return `${h}h ${m}m`
    }

    return (
        <div className="relative min-h-screen bg-neutral-900 text-white">
            {/* Error Message */}
            {error && (
                <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-50 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
                    <X className="w-5 h-5" />
                    <span>{error}</span>
                </div>
            )}
            {/* Backdrop Image */}
            <div className="absolute inset-0 h-[70vh] w-full overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-neutral-900/60 to-neutral-900 z-10" />
                {movie.backdropPath && (
                    <>
                        <img
                            src={`https://image.tmdb.org/t/p/w300${movie.backdropPath}`}
                            alt={movie.title}
                            className="absolute inset-0 w-full h-full object-cover object-top opacity-50 blur-md"
                        />
                        <img
                            src={`https://image.tmdb.org/t/p/original${movie.backdropPath}`}
                            alt={movie.title}
                            className="absolute inset-0 w-full h-full object-cover object-top opacity-0 transition-opacity duration-700 ease-in-out"
                            onLoad={(e) => e.currentTarget.classList.remove('opacity-0')}
                        />
                    </>
                )}
            </div>

            <button
                onClick={() => navigate('/')}
                className="absolute top-12 left-8 z-40 p-2 hover:bg-white/10 rounded-full transition-colors"
            >
                <ChevronLeft className="w-6 h-6" />
            </button>

            {/* Content */}
            <div className="relative z-20 container mx-auto px-8 pt-[45vh] pb-20">

                <div className="pt-4">
                    {movie.logoPath ? (
                        <img
                            src={`https://image.tmdb.org/t/p/original${movie.logoPath}`}
                            alt={movie.title}
                            className="max-w-[400px] max-h-[150px] object-contain mb-6 origin-left"
                        />
                    ) : (
                        <h1 className="text-5xl font-bold mb-2 leading-tight">{movie.title}</h1>
                    )}
                    {movie.tagline && (
                        <p className="text-xl text-gray-400 italic mb-6">{movie.tagline}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-6 text-gray-300 mb-8 text-sm md:text-base">
                        {movie.releaseDate && (
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-gray-400" />
                                <span>{movie.releaseDate.split('-')[0]}</span>
                            </div>
                        )}
                        {movie.runtime && (
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-gray-400" />
                                <span>{formatRuntime(movie.runtime)}</span>
                            </div>
                        )}
                        {/* Ratings */}
                        {(movie.voteAverage || movie.imdbRating) && (
                            <div className="flex gap-3">
                                {movie.voteAverage && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
                                        <span className="text-[#01b4e4] font-bold text-sm">TMDb</span>
                                        <span className="font-semibold">{movie.voteAverage.toFixed(1)}</span>
                                    </div>
                                )}
                                {movie.imdbRating && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
                                        <span className="text-[#f5c518] font-bold text-sm">IMDb</span>
                                        <span className="font-semibold">{movie.imdbRating.toFixed(1)}</span>
                                        {movie.imdbVotes && (
                                            <span className="text-xs text-gray-200">({formatVoteCount(movie.imdbVotes)})</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                        {movie.genres && movie.genres.length > 0 && (
                            <div className="flex gap-2">
                                {movie.genres.map(g => (
                                    <span key={g} className="bg-white/10 px-2 py-1 rounded text-xs">{g}</span>
                                ))}
                            </div>
                        )}
                        {/* Favorite Button */}
                        <button
                            onClick={async () => {
                                if (isFavorited) {
                                    await window.electron.ipcRenderer.invoke('remove-favorite', { mediaId: movie.id, mediaType: 'movie' })
                                    setIsFavorited(false)
                                } else {
                                    await window.electron.ipcRenderer.invoke('add-favorite', {
                                        mediaId: movie.id,
                                        mediaType: 'movie',
                                        title: movie.title,
                                        posterPath: movie.posterPath
                                    })
                                    setIsFavorited(true)
                                }
                            }}
                            className="p-2 rounded-full hover:bg-white/10 transition-colors"
                        >
                            <Heart className={`w-5 h-5 ${isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                        </button>
                    </div>

                    <p className="text-lg text-gray-300 leading-relaxed max-w-3xl mb-6">
                        {movie.overview}
                    </p>

                    {/* External Links */}
                    <div className="flex flex-wrap gap-4 mb-10">
                        {movie.externalIds?.imdb_id && (
                            <>
                                <button
                                    onClick={() => openExternal(`https://www.imdb.com/title/${movie.externalIds!.imdb_id}/`)}
                                    className="text-gray-400 hover:text-white transition-colors text-sm border-b border-transparent hover:border-white"
                                >
                                    View on IMDb
                                </button>
                                <button
                                    onClick={() => openExternal(`https://www.imdb.com/title/${movie.externalIds!.imdb_id}/parentalguide`)}
                                    className="text-gray-400 hover:text-white transition-colors text-sm border-b border-transparent hover:border-white"
                                >
                                    Parental Guide
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => openExternal(`https://www.themoviedb.org/movie/${movie.id}`)}
                            className="text-gray-400 hover:text-white transition-colors text-sm border-b border-transparent hover:border-white"
                        >
                            View on TMDb
                        </button>
                        <button
                            onClick={() => openExternal(`https://letterboxd.com/tmdb/${movie.id}`)}
                            className="text-gray-400 hover:text-white transition-colors text-sm border-b border-transparent hover:border-white"
                        >
                            View on Letterboxd
                        </button>
                        <button
                            onClick={() => openExternal(`https://www.douban.com/search?cat=1002&q=${encodeURIComponent(movie.title)}`)}
                            className="text-gray-400 hover:text-white transition-colors text-sm border-b border-transparent hover:border-white"
                        >
                            View on douban
                        </button>
                        <button
                            onClick={() => openExternal(`https://screen-info-lookup.vercel.app/movie/${movie.id}`)}
                            className="text-gray-400 hover:text-white transition-colors text-sm border-b border-transparent hover:border-white"
                        >
                            View Detailed Info
                        </button>
                    </div>

                    <div className="flex flex-col gap-8 mb-10">
                        {movie.director && Array.isArray(movie.director) && movie.director.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Director{movie.director.length > 1 ? 's' : ''}</h3>
                                <div className="flex flex-wrap gap-4">
                                    {movie.director.map((director, index) => (
                                        <div key={index} className="flex items-center gap-2 bg-white/5 pl-3 pr-5 py-2 rounded-full w-fit">
                                            {director.profilePath ? (
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w185${director.profilePath}`}
                                                    alt={director.name}
                                                    className="w-6 h-6 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-6 h-6 rounded-full bg-neutral-700 flex items-center justify-center">
                                                    <User className="w-3 h-3 text-gray-500" />
                                                </div>
                                            )}
                                            <span className="font-medium">{director.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {movie.cast && movie.cast.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Top Cast</h3>
                                <div className="flex flex-wrap gap-4">
                                    {movie.cast.map((actor, index) => (
                                        <div key={index} className="flex items-center gap-3 bg-white/5 pl-3 pr-5 py-2 rounded-full">
                                            {actor.profilePath ? (
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w185${actor.profilePath}`}
                                                    alt={actor.name}
                                                    className="w-10 h-10 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-neutral-700 flex items-center justify-center">
                                                    <User className="w-5 h-5 text-gray-500" />
                                                </div>
                                            )}
                                            <div className="overflow-hidden">
                                                <p className="font-medium text-sm truncate">{actor.name}</p>
                                                <p className="text-xs text-gray-400 truncate">{actor.character}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={handlePlayClick}
                            disabled={playing}
                            className="bg-white hover:bg-gray-200 px-10 py-4 rounded-full transition-colors shadow-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {playing ? (
                                <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                            ) : (
                                <Play className="w-5 h-5 text-gray-500 fill-current ml-1" />
                            )}
                        </button>
                        {movie.videoFiles && movie.videoFiles.length > 0 && (
                            <span className="text-gray-400 text-sm">
                                {sources.find(s => s.id === movie.videoFiles[0].sourceId)?.name || 'Unknown Source'} – {movie.videoFiles[0].filePath}
                            </span>
                        )}
                    </div>
                </div>
            </div>


            {/* Version Selector Modal */}
            {
                showVersionSelector && movie.videoFiles && movie.videoFiles.length > 1 && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                        <div className="bg-neutral-800 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold">Select Version</h2>
                                <button
                                    onClick={() => setShowVersionSelector(false)}
                                    className="p-2 hover:bg-neutral-700 rounded-full transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="space-y-3">
                                {movie.videoFiles.map((file) => (
                                    <button
                                        key={file.id}
                                        onClick={() => playVideo(file)}
                                        className="w-full text-left p-4 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-colors flex items-center gap-3"
                                    >
                                        <Play className="w-5 h-5 text-white" />
                                        <div className="flex-1">
                                            <p className="font-medium">{file.name}</p>
                                            <p className="text-sm text-gray-400">{getSourceName(file.sourceId)} - {file.filePath}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    )
}
