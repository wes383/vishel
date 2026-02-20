import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Play, Calendar, User, X, Loader2, ChevronLeft, Heart } from 'lucide-react'


import { DataSource } from '../../electron/store'
import { formatVoteCount } from '../utils/formatNumber'

interface VideoFile {
    id: string
    name: string
    filePath: string
    webdavUrl: string
    sourceId: string
}

interface Episode {
    id: number
    name: string
    episodeNumber: number
    seasonNumber: number
    overview: string
    stillPath: string
    videoFiles: VideoFile[]
}

interface Season {
    seasonNumber: number
    name: string
    episodes: Episode[]
}

interface TVShow {
    id: number
    name: string
    logoPath?: string
    posterPath: string
    backdropPath: string
    overview: string
    firstAirDate: string
    genres?: string[]
    voteAverage?: number
    imdbRating?: number
    imdbVotes?: number
    cast?: { name: string, character: string, profilePath: string }[]
    createdBy?: { name: string, profilePath: string }[]
    seasons: Season[]
    externalIds?: {
        imdb_id?: string
        tvdb_id?: number
    }
}

export default function TVDetail() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [show, setShow] = useState<TVShow | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeSeason, setActiveSeason] = useState<number>(1)
    const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null)
    const [sources, setSources] = useState<DataSource[]>([])
    const [hideSpoilers, setHideSpoilers] = useState(false)
    const [revealedEpisodes, setRevealedEpisodes] = useState<Set<number>>(new Set())
    const [playingEpisodeId, setPlayingEpisodeId] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isFavorited, setIsFavorited] = useState(false)
    const [imdbRating, setImdbRating] = useState<{ rating: number, votes: number } | null>(null)
    const [loadingImdb, setLoadingImdb] = useState(false)

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Escape - close modal or go back
            if (e.key === 'Escape') {
                if (selectedEpisode) {
                    setSelectedEpisode(null)
                } else {
                    navigate('/')
                }
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
    }, [navigate, selectedEpisode])

    useEffect(() => {
        const fetchShow = async () => {
            if (!id) return
            try {
                const data = await window.electron.ipcRenderer.invoke('get-tv-show', parseInt(id))
                if (!data) {
                    console.warn(`TV show ${id} not found, redirecting to home`)
                    navigate('/')
                    return
                }
                setShow(data)
                if (data && data.seasons.length > 0) {
                    setActiveSeason(data.seasons[0].seasonNumber)
                }
                
                // Fetch IMDb rating if available
                if (data.externalIds?.imdb_id) {
                    fetchImdbRating(data.externalIds.imdb_id)
                }
            } catch (error) {
                console.error('Failed to fetch TV show:', error)
                navigate('/')
            } finally {
                setLoading(false)
            }
        }
        fetchShow()

        window.electron.ipcRenderer.invoke('get-settings').then((data: any) => {
            setSources(data.sources || [])
            setHideSpoilers(data.hideEpisodeSpoilers || false)
        })

        // Check favorite status
        if (id) {
            window.electron.ipcRenderer.invoke('is-favorite', { mediaId: parseInt(id), mediaType: 'tv' })
                .then(setIsFavorited)
        }
    }, [id, navigate])

    const fetchImdbRating = async (imdbId: string) => {
        setLoadingImdb(true)
        try {
            const response = await fetch(`https://imdb-ratings-ten.vercel.app/api/rating?imdbId=${imdbId}`)
            if (response.ok) {
                const data = await response.json()
                if (data.rating && data.numVotes) {
                    setImdbRating({
                        rating: parseFloat(data.rating),
                        votes: parseInt(data.numVotes.toString().replace(/,/g, ''))
                    })
                }
            }
        } catch (error) {
            console.error('Failed to fetch IMDb rating:', error)
        } finally {
            setLoadingImdb(false)
        }
    }

    const handlePlayClick = (episode: Episode) => {
        if (!episode.videoFiles || episode.videoFiles.length === 0) return

        if (episode.videoFiles.length === 1) {
            playVideo(episode.videoFiles[0], episode)
        } else {
            setSelectedEpisode(episode)
        }
    }

    const openExternal = (url: string) => {
        window.electron.ipcRenderer.invoke('open-external', url)
    }

    const getSourceName = (sourceId: string): string => {
        const source = sources.find(s => s.id === sourceId)
        return source ? source.name : 'Unknown'
    }


    const playVideo = async (file: VideoFile, episode: Episode) => {
        if (!show) return
        setPlayingEpisodeId(episode.id)
        setError(null)
        try {
            setSelectedEpisode(null)
            await window.electron.ipcRenderer.invoke('play-video', {
                url: file.webdavUrl,
                title: `${show.name} - S${episode.seasonNumber}E${episode.episodeNumber} - ${episode.name}`,
                history: {
                    mediaId: show.id,
                    mediaType: 'tv',
                    title: show.name,
                    posterPath: show.posterPath,
                    filePath: file.filePath,
                    seasonNumber: episode.seasonNumber,
                    episodeNumber: episode.episodeNumber,
                    episodeName: episode.name
                }
            })
        } catch (err: any) {
            setError(err?.message || 'Failed to launch player')
            setTimeout(() => setError(null), 5000)
        } finally {
            setPlayingEpisodeId(null)
        }
    }

    const toggleSpoiler = (episodeId: number) => {
        if (!hideSpoilers) return
        setRevealedEpisodes(prev => {
            const newSet = new Set(prev)
            if (newSet.has(episodeId)) {
                newSet.delete(episodeId)
            } else {
                newSet.add(episodeId)
            }
            return newSet
        })
    }

    if (loading) {
        return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>
    }

    if (!show) {
        return (
            <div className="flex flex-col items-center justify-center h-screen text-gray-400">
                <p className="text-xl mb-4">TV Show not found</p>
                <button onClick={() => navigate('/')} className="p-2 hover:bg-neutral-800 rounded-full transition-colors">
                    <X className="w-6 h-6" />
                </button>
            </div>
        )
    }

    const currentSeason = show.seasons.find(s => s.seasonNumber === activeSeason)

    return (
        <div className="relative min-h-screen bg-neutral-900 text-white">
            {/* Error Message */}
            {error && (
                <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
                    <X className="w-5 h-5" />
                    <span>{error}</span>
                </div>
            )}
            {/* Backdrop Image */}
            <div className="absolute inset-0 h-[80vh] w-full overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-neutral-900/60 to-neutral-900 z-10" />
                {show.backdropPath && (
                    <>
                        <img
                            src={`https://image.tmdb.org/t/p/w300${show.backdropPath}`}
                            alt={show.name}
                            className="absolute inset-0 w-full h-full object-cover object-top opacity-50 blur-md"
                        />
                        <img
                            src={`https://image.tmdb.org/t/p/original${show.backdropPath}`}
                            alt={show.name}
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
            <div className="relative z-20 container mx-auto px-8 pt-[55vh] pb-8">

                <div className="mb-12 pt-4">
                    {show.logoPath ? (
                        <img
                            src={`https://image.tmdb.org/t/p/original${show.logoPath}`}
                            alt={show.name}
                            className="max-w-[400px] max-h-[150px] object-contain mb-6 origin-left"
                        />
                    ) : (
                        <h1 className="text-5xl font-bold mb-4 leading-tight">{show.name}</h1>
                    )}

                    <div className="flex flex-wrap items-center gap-6 text-gray-300 mb-8">
                        {show.firstAirDate && (
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-gray-400" />
                                <span>{show.firstAirDate.split('-')[0]}</span>
                            </div>
                        )}
                        {/* Ratings */}
                        {(show.voteAverage || imdbRating) && (
                            <div className="flex gap-3">
                                {show.voteAverage && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
                                        <span className="text-[#01b4e4] font-bold text-sm">TMDb</span>
                                        <span className="font-semibold">{show.voteAverage.toFixed(1)}</span>
                                    </div>
                                )}
                                {imdbRating && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
                                        <span className="text-[#f5c518] font-bold text-sm">IMDb</span>
                                        <span className="font-semibold">{imdbRating.rating.toFixed(1)}</span>
                                        {imdbRating.votes && (
                                            <span className="text-xs text-gray-200">({formatVoteCount(imdbRating.votes)})</span>
                                        )}
                                    </div>
                                )}
                                {loadingImdb && !imdbRating && show.externalIds?.imdb_id && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
                                        <span className="text-[#f5c518] font-bold text-sm">IMDb</span>
                                        <span className="text-gray-400 text-sm">Loading...</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {show.genres && show.genres.length > 0 && (
                            <div className="flex gap-2">
                                {show.genres.map(g => (
                                    <span key={g} className="bg-white/10 px-2 py-1 rounded text-xs">{g}</span>
                                ))}
                            </div>
                        )}
                        {/* Favorite Button */}
                        <button
                            onClick={async () => {
                                if (isFavorited) {
                                    await window.electron.ipcRenderer.invoke('remove-favorite', { mediaId: show.id, mediaType: 'tv' })
                                    setIsFavorited(false)
                                } else {
                                    await window.electron.ipcRenderer.invoke('add-favorite', {
                                        mediaId: show.id,
                                        mediaType: 'tv',
                                        title: show.name,
                                        posterPath: show.posterPath
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
                        {show.overview}
                    </p>

                    {/* External Links */}
                    <div className="flex flex-wrap gap-4 mb-10">
                        {show.externalIds?.imdb_id && (
                            <>
                                <button
                                    onClick={() => openExternal(`https://www.imdb.com/title/${show.externalIds!.imdb_id}/`)}
                                    className="text-gray-400 hover:text-white transition-colors text-sm border-b border-transparent hover:border-white"
                                >
                                    View on IMDb
                                </button>
                                <button
                                    onClick={() => openExternal(`https://www.imdb.com/title/${show.externalIds!.imdb_id}/parentalguide`)}
                                    className="text-gray-400 hover:text-white transition-colors text-sm border-b border-transparent hover:border-white"
                                >
                                    Parental Guide
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => openExternal(`https://www.themoviedb.org/tv/${show.id}`)}
                            className="text-gray-400 hover:text-white transition-colors text-sm border-b border-transparent hover:border-white"
                        >
                            View on TMDb
                        </button>
                        <button
                            onClick={() => openExternal(`https://www.douban.com/search?cat=1002&q=${encodeURIComponent(show.name)}`)}
                            className="text-gray-400 hover:text-white transition-colors text-sm border-b border-transparent hover:border-white"
                        >
                            View on douban
                        </button>
                        <button
                            onClick={() => openExternal(`https://screen-lookup.vercel.app/tv/${show.id}`)}
                            className="text-gray-400 hover:text-white transition-colors text-sm border-b border-transparent hover:border-white"
                        >
                            View Detailed Info
                        </button>
                    </div>

                    <div className="flex flex-col gap-8">
                        {show.createdBy && show.createdBy.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Created By</h3>
                                <div className="flex flex-wrap gap-4">
                                    {show.createdBy.map((creator, index) => (
                                        <div key={index} className="flex items-center gap-3 bg-white/5 pl-3 pr-5 py-2 rounded-full">
                                            {creator.profilePath ? (
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w185${creator.profilePath}`}
                                                    alt={creator.name}
                                                    className="w-10 h-10 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-neutral-700 flex items-center justify-center">
                                                    <User className="w-5 h-5 text-gray-500" />
                                                </div>
                                            )}
                                            <span className="font-medium text-sm">{creator.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {show.cast && show.cast.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Top Cast</h3>
                                <div className="flex flex-wrap gap-4">
                                    {show.cast.map((actor, index) => (
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
                </div>
            </div>

            {/* Season Selector */}
            <div className="mb-8 container mx-auto px-8">
                <div className="flex flex-wrap items-center gap-3 py-2">
                    {show.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber).map(season => (
                        <button
                            key={season.seasonNumber}
                            onClick={() => setActiveSeason(season.seasonNumber)}
                            className={`px-6 py-2.5 rounded-full font-medium font-sans text-[15px] transition-all duration-300 ${
                                activeSeason === season.seasonNumber 
                                    ? 'bg-white text-black scale-105' 
                                    : 'bg-neutral-700/50 text-neutral-300 hover:bg-neutral-600/50 hover:text-white'
                            }`}
                        >
                            {season.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Episodes */}
            {currentSeason && (
                <div className="container mx-auto px-8 pb-20">
                    <div className="space-y-4">
                        {/* Filter out duplicates based on episodeNumber */}
                        {Object.values(
                            currentSeason.episodes.reduce((acc, episode) => {
                                if (!acc[episode.episodeNumber]) {
                                    acc[episode.episodeNumber] = episode
                                }
                                return acc
                            }, {} as Record<number, Episode>)
                        )
                        .sort((a, b) => a.episodeNumber - b.episodeNumber)
                        .map(episode => (
                            <div
                                key={episode.id}
                                className="bg-neutral-800/50 border border-white/5 rounded-2xl p-4 flex flex-col md:flex-row gap-6 hover:bg-neutral-800 transition-colors"
                            >
                                {/* Episode Still */}
                                <div className="group md:w-56 flex-shrink-0 relative aspect-video rounded-xl overflow-hidden bg-neutral-900 cursor-pointer">
                                    {episode.stillPath ? (
                                        <img
                                            src={`https://image.tmdb.org/t/p/w780${episode.stillPath}`}
                                            alt={episode.name}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 gap-2">
                                            <div className="w-8 h-8 rounded-full border-2 border-current flex items-center justify-center opacity-50">
                                                <span className="text-xs font-bold">TV</span>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Episode Number Badge */}
                                    <div className="absolute bottom-3 left-3 px-2 py-1 bg-white/30 backdrop-blur-md rounded-md text-xs font-bold text-black shadow-sm">
                                        EP {episode.episodeNumber}
                                    </div>
                                    
                                    {/* Play Overlay */}
                                    <button
                                        onClick={() => handlePlayClick(episode)}
                                        disabled={playingEpisodeId === episode.id}
                                        className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-all duration-300 disabled:opacity-100"
                                    >
                                        <div className="transform scale-75 group-hover:scale-100 transition-transform drop-shadow-lg">
                                            {playingEpisodeId === episode.id ? (
                                                <Loader2 className="w-12 h-12 text-white animate-spin" />
                                            ) : (
                                                <Play className="w-12 h-12 text-white fill-white" />
                                            )}
                                        </div>
                                    </button>
                                </div>

                                {/* Episode Info */}
                                <div className="flex-1 py-1 min-w-0 flex flex-col justify-center">
                                    <h3 className="text-lg font-bold text-white mb-2 truncate pr-4">
                                        {episode.name}
                                    </h3>
                                    <p
                                        className={`text-gray-400 text-sm leading-relaxed line-clamp-3 ${hideSpoilers && !revealedEpisodes.has(episode.id) ? 'blur-sm cursor-pointer select-none' : ''}`}
                                        onClick={() => toggleSpoiler(episode.id)}
                                    >
                                        {episode.overview || "No overview available."}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}


            {/* Debug Info: First Episode File Path */}
            {show.seasons.length > 0 && show.seasons[0].episodes.length > 0 && show.seasons[0].episodes[0].videoFiles.length > 0 && (
                <div className="container mx-auto px-8 pb-8 text-gray-500 text-xs break-all">
                    {sources.find(s => s.id === show.seasons[0].episodes[0].videoFiles[0].sourceId)?.name || 'Unknown Source'} – {show.seasons[0].episodes[0].videoFiles[0].filePath}
                </div>
            )}

            {/* Version Selector Modal */}
            {
                selectedEpisode && selectedEpisode.videoFiles && selectedEpisode.videoFiles.length > 1 && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                        <div className="bg-white/50 backdrop-blur-md rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-gray-900">Select Version</h2>
                                <button
                                    onClick={() => setSelectedEpisode(null)}
                                    className="p-2 hover:bg-black/10 rounded-full transition-colors text-gray-900"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="space-y-3">
                                {selectedEpisode.videoFiles.map((file) => (
                                    <button
                                        key={file.id}
                                        onClick={() => playVideo(file, selectedEpisode)}
                                        className="w-full text-left p-4 bg-white/30 hover:bg-white/50 rounded-lg transition-colors flex items-center gap-3"
                                    >
                                        <Play className="w-5 h-5 text-gray-900" />
                                        <div className="flex-1">
                                            <p className="font-medium text-gray-900">{file.name}</p>
                                            <p className="text-sm text-gray-700">{getSourceName(file.sourceId)} - {file.filePath}</p>
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

