import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Play, Calendar, User, X, ChevronDown } from 'lucide-react'
import { DataSource } from '../../electron/store'

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
    const [isSeasonOpen, setIsSeasonOpen] = useState(false)
    const [sources, setSources] = useState<DataSource[]>([])
    const [hideSpoilers, setHideSpoilers] = useState(false)
    const [revealedEpisodes, setRevealedEpisodes] = useState<Set<number>>(new Set())
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsSeasonOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [])

    useEffect(() => {
        const fetchShow = async () => {
            if (!id) return
            try {
                // @ts-ignore
                const data = await window.electron.ipcRenderer.invoke('get-tv-show', parseInt(id))
                setShow(data)
                if (data && data.seasons.length > 0) {
                    setActiveSeason(data.seasons[0].seasonNumber)
                }
            } catch (error) {
                console.error('Failed to fetch TV show:', error)
            } finally {
                setLoading(false)
            }
        }
        fetchShow()

        // @ts-ignore
        window.electron.ipcRenderer.invoke('get-settings').then((data: any) => {
            setSources(data.sources || [])
            setHideSpoilers(data.hideEpisodeSpoilers || false)
        })
    }, [id])

    const handlePlayClick = (episode: Episode) => {
        if (!episode.videoFiles || episode.videoFiles.length === 0) return

        if (episode.videoFiles.length === 1) {
            playVideo(episode.videoFiles[0], episode)
        } else {
            setSelectedEpisode(episode)
        }
    }

    const openExternal = (url: string) => {
        // @ts-ignore
        window.electron.ipcRenderer.invoke('open-external', url)
    }

    const getSourceName = (sourceId: string): string => {
        const source = sources.find(s => s.id === sourceId)
        return source ? source.name : 'Unknown'
    }


    const playVideo = (file: VideoFile, episode: Episode) => {
        if (!show) return
        // @ts-ignore
        window.electron.ipcRenderer.invoke('play-video', {
            url: file.webdavUrl,
            title: `${show.name} - S${episode.seasonNumber}E${episode.episodeNumber} - ${episode.name}`
        })
        setSelectedEpisode(null)
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
                <button onClick={() => navigate('/')} className="p-2 hover:bg-neutral-800 rounded-lg transition-colors">
                    <X className="w-6 h-6" />
                </button>
            </div>
        )
    }

    const currentSeason = show.seasons.find(s => s.seasonNumber === activeSeason)

    return (
        <div className="relative min-h-screen bg-neutral-900 text-white">
            {/* Backdrop Image */}
            <div className="absolute inset-0 h-[60vh] w-full overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-neutral-900/60 to-neutral-900 z-10" />
                {show.backdropPath && (
                    <>
                        <img
                            src={`https://image.tmdb.org/t/p/w300${show.backdropPath}`}
                            alt={show.name}
                            className="absolute inset-0 w-full h-full object-cover opacity-50 blur-md"
                        />
                        <img
                            src={`https://image.tmdb.org/t/p/original${show.backdropPath}`}
                            alt={show.name}
                            className="absolute inset-0 w-full h-full object-cover opacity-0 transition-opacity duration-700 ease-in-out"
                            onLoad={(e) => e.currentTarget.classList.remove('opacity-0')}
                        />
                    </>
                )}
            </div>

            <button
                onClick={() => navigate('/')}
                className="absolute top-8 right-8 z-50 p-2 hover:bg-white/10 rounded-full transition-colors"
            >
                <X className="w-6 h-6" />
            </button>

            {/* Content */}
            <div className="relative z-20 container mx-auto px-8 pt-[45vh] pb-8">

                <div className="mb-12 pt-4">
                    {show.logoPath ? (
                        <img
                            src={`https://image.tmdb.org/t/p/w500${show.logoPath}`}
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
                        {(show.voteAverage || show.imdbRating) && (
                            <div className="flex gap-3">
                                {show.voteAverage && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
                                        <span className="text-[#01b4e4] font-bold text-sm">TMDb</span>
                                        <span className="font-semibold">{show.voteAverage.toFixed(1)}</span>
                                    </div>
                                )}
                                {show.imdbRating && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
                                        <span className="text-[#f5c518] font-bold text-sm">IMDb</span>
                                        <span className="font-semibold">{show.imdbRating.toFixed(1)}</span>
                                        {show.imdbVotes && (
                                            <span className="text-xs text-gray-200">({(show.imdbVotes).toLocaleString()})</span>
                                        )}
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
                            onClick={() => openExternal(`https://www.douban.com/search?source=suggest&q=${encodeURIComponent(show.name)}`)}
                            className="text-gray-400 hover:text-white transition-colors text-sm border-b border-transparent hover:border-white"
                        >
                            View on douban
                        </button>
                    </div>

                    <div className="flex flex-col gap-8">
                        {show.createdBy && show.createdBy.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Created By</h3>
                                <div className="flex gap-4">
                                    {show.createdBy.map((creator, index) => (
                                        <div key={index} className="flex items-center gap-2 bg-white/5 pl-3 pr-5 py-2 rounded-full">
                                            {creator.profilePath && (
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w185${creator.profilePath}`}
                                                    alt={creator.name}
                                                    className="w-6 h-6 rounded-full object-cover"
                                                />
                                            )}
                                            <span className="font-medium">{creator.name}</span>
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
                                                <p className="font-medium text-sm truncate" title={actor.name}>{actor.name}</p>
                                                <p className="text-xs text-gray-400 truncate" title={actor.character}>{actor.character}</p>
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
                <div className="relative inline-block" ref={dropdownRef}>
                    <button
                        onClick={() => setIsSeasonOpen(!isSeasonOpen)}
                        className="flex items-center gap-2 px-6 py-3 bg-neutral-800 hover:bg-neutral-600 rounded-full transition-colors font-medium min-w-[200px] justify-between"
                    >
                        <span>{show.seasons.find(s => s.seasonNumber === activeSeason)?.name || 'Select Season'}</span>
                        <ChevronDown className={`w-5 h-5 transition-transform ${isSeasonOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isSeasonOpen && (
                        <div className="absolute top-full left-0 mt-2 w-full bg-neutral-800 rounded-2xl overflow-hidden shadow-xl z-50 border border-white/10 p-2">
                            {show.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber).map(season => (
                                <button
                                    key={season.seasonNumber}
                                    onClick={() => {
                                        setActiveSeason(season.seasonNumber)
                                        setIsSeasonOpen(false)
                                    }}
                                    className={`w-full text-left px-6 py-3 hover:bg-white/10 transition-colors rounded-full ${activeSeason === season.seasonNumber ? 'bg-white text-black' : 'text-gray-300'
                                        }`}
                                >
                                    {season.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Episodes */}
            {currentSeason && (
                <div className="container mx-auto px-8 pb-20">
                    <div className="space-y-4">
                        {currentSeason.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber).map(episode => (
                            <div
                                key={episode.id}
                                className="bg-neutral-800 rounded-xl overflow-hidden flex flex-col md:flex-row gap-4 hover:bg-neutral-750 transition-colors"
                            >
                                {/* Episode Still */}
                                <div className="md:w-48 flex-shrink-0 relative aspect-video md:aspect-auto">
                                    {episode.stillPath ? (
                                        <img
                                            src={`https://image.tmdb.org/t/p/w500${episode.stillPath}`}
                                            alt={episode.name}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-gray-500">
                                            No Image
                                        </div>
                                    )}
                                    <button
                                        onClick={() => handlePlayClick(episode)}
                                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity"
                                    >
                                        <Play className="w-10 h-10 text-white fill-current" />
                                    </button>
                                </div>

                                {/* Episode Info */}
                                <div className="flex-1 p-4 md:p-6">
                                    <div className="flex items-start justify-between mb-2">
                                        <h3 className="text-xl font-bold">
                                            {episode.episodeNumber}. {episode.name}
                                        </h3>
                                    </div>
                                    <p
                                        className={`text-gray-400 line-clamp-3 transition-all duration-300 ${hideSpoilers && !revealedEpisodes.has(episode.id) ? 'blur-sm cursor-pointer select-none' : ''}`}
                                        onClick={() => toggleSpoiler(episode.id)}
                                    >
                                        {episode.overview}
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
                        <div className="bg-neutral-800 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold">Select Version</h2>
                                <button
                                    onClick={() => setSelectedEpisode(null)}
                                    className="p-2 hover:bg-neutral-700 rounded-full transition-colors"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="space-y-3">
                                {selectedEpisode.videoFiles.map((file) => (
                                    <button
                                        key={file.id}
                                        onClick={() => playVideo(file, selectedEpisode)}
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

