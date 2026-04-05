import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Play, Calendar, Clock, User, X, Loader2, ChevronLeft, Heart, Check } from 'lucide-react'


import type { DataSource } from '../../electron/store'
import { formatVoteCount } from '../utils/formatNumber'
import {
    buildExternalLinks,
    defaultMovieExternalLinks,
    normalizeExternalLinks,
    type ExternalLinkConfig
} from '../utils/externalLinks'
import { formatMoviePlayTitle } from '../utils/playTitle'

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

interface VideoProbeMetadata {
    width: number | null
    height: number | null
    codec: string | null
    isHdr: boolean | null
    hdrType: string | null
    bitDepth: number | null
    frameRate: number | null
    duration: number | null
    fileSize: number | null
    bitrate: number | null
    audioCodec: string | null
    audioChannels: number | null
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
    const isMac = useMemo(() => window.electron?.platform === 'darwin', [])
    const { id } = useParams()
    const navigate = useNavigate()
    const [movie, setMovie] = useState<Movie | null>(null)
    const [loading, setLoading] = useState(true)
    const [sources, setSources] = useState<DataSource[]>([])
    const [playingFileId, setPlayingFileId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isFavorited, setIsFavorited] = useState(false)
    const [isWatched, setIsWatched] = useState(false)
    const [imdbRating, setImdbRating] = useState<{ rating: number, votes: number } | null>(null)
    const [loadingImdb, setLoadingImdb] = useState(false)
    const [showTextTitle, setShowTextTitle] = useState(false)
    const [showImdbRating, setShowImdbRating] = useState(true)
    const [preferTextTitle, setPreferTextTitle] = useState(true)
    const [externalLinkConfigs, setExternalLinkConfigs] = useState<ExternalLinkConfig[]>(defaultMovieExternalLinks)
    const [videoMetadata, setVideoMetadata] = useState<Record<string, VideoProbeMetadata | null>>({})
    const [probeVideoMetadataEnabled, setProbeVideoMetadataEnabled] = useState(true)

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                navigate('/')
                e.preventDefault()
            }

            if (e.key === ' ' && movie && !playingFileId) {
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
    }, [navigate, movie, playingFileId])

    useEffect(() => {
        const fetchMovie = async () => {
            if (!id) return
            try {
                const data = await window.electron.ipcRenderer.invoke('get-movie', parseInt(id))
                if (!data) {
                    // Movie not found, redirect to home
                    console.warn(`Movie ${id} not found, redirecting to home`)
                    navigate('/')
                    return
                }
                setMovie(data)
                
                // Fetch IMDb rating if available
                if (data.externalIds?.imdb_id && showImdbRating) {
                    fetchImdbRating(data.externalIds.imdb_id)
                }
            } catch (error) {
                console.error('Failed to fetch movie:', error)
                navigate('/')
            } finally {
                setLoading(false)
            }
        }
        fetchMovie()

        window.electron.ipcRenderer.invoke('get-settings').then((data: any) => {
            setSources(data.sources || [])
            setShowImdbRating(data.showImdbRating !== false)
            const preferText = data.preferTextTitle === true
            setPreferTextTitle(preferText)
            setShowTextTitle(preferText)
            setExternalLinkConfigs(normalizeExternalLinks(data.movieExternalLinks, defaultMovieExternalLinks))
            setProbeVideoMetadataEnabled(data.probeVideoMetadataEnabled !== false)
        })

        // Check favorite status
        if (id) {
            window.electron.ipcRenderer.invoke('is-favorite', { mediaId: parseInt(id), mediaType: 'movie' })
                .then(setIsFavorited)
            window.electron.ipcRenderer.invoke('get-watch-status', { mediaId: parseInt(id), mediaType: 'movie' })
                .then((status: { watched: boolean } | undefined) => setIsWatched(status?.watched || false))
        }
    }, [id, navigate, showImdbRating])

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

    const playVideo = async (file: VideoFile) => {
        if (!movie) return
        setPlayingFileId(file.id)
        setError(null)
        try {
            const result = await window.electron.ipcRenderer.invoke('play-video', {
                url: file.webdavUrl,
                title: formatMoviePlayTitle(movie.title),
                history: {
                    mediaId: movie.id,
                    mediaType: 'movie',
                    title: movie.title,
                    posterPath: movie.posterPath,
                    filePath: file.filePath
                }
            })
            if (result?.autoMarked) {
                setIsWatched(true)
            }
        } catch (err: any) {
            setError(err?.message || 'Failed to launch player')
            setTimeout(() => setError(null), 5000)
        } finally {
            setPlayingFileId(null)
        }
    }

    const openExternal = (url: string) => {
        window.electron.ipcRenderer.invoke('open-external', url)
    }

    const externalLinks = useMemo(() => {
        if (!movie) {
            return []
        }
        return buildExternalLinks(externalLinkConfigs, {
            tmdbId: movie.id,
            imdbId: movie.externalIds?.imdb_id,
            title: movie.title
        })
    }, [externalLinkConfigs, movie])

    useEffect(() => {
        if (!probeVideoMetadataEnabled) {
            setVideoMetadata({})
            return
        }
        if (!movie?.videoFiles || movie.videoFiles.length === 0) {
            setVideoMetadata({})
            return
        }
        let active = true
        setVideoMetadata({})
        const probe = async () => {
            const results = await Promise.all(
                movie.videoFiles.map(async (file) => {
                    const metadata = await window.electron.ipcRenderer.invoke('probe-video-metadata', {
                        url: file.webdavUrl,
                        sourceId: file.sourceId
                    }) as VideoProbeMetadata | null
                    return [file.id, metadata] as const
                })
            )
            if (!active) return
            const mapped: Record<string, VideoProbeMetadata | null> = {}
            results.forEach(([id, metadata]) => {
                mapped[id] = metadata
            })
            setVideoMetadata(mapped)
        }
        probe()
        return () => {
            active = false
        }
    }, [externalLinkConfigs, movie])

    const formatDuration = (seconds: number | null): string | null => {
        if (!seconds) return null
        const h = Math.floor(seconds / 3600)
        const m = Math.floor((seconds % 3600) / 60)
        const s = Math.floor(seconds % 60)
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
        }
        return `${m}:${s.toString().padStart(2, '0')}`
    }

    const formatFileSize = (bytes: number | null): string | null => {
        if (!bytes) return null
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
    }

    const formatBitrate = (bps: number | null): string | null => {
        if (!bps) return null
        const mbps = bps / 1000000
        if (mbps >= 1) {
            return `${mbps.toFixed(1)} Mbps`
        }
        const kbps = bps / 1000
        return `${kbps.toFixed(0)} Kbps`
    }

    const formatAudioChannels = (codec: string, channels: number): string => {
        const layoutMap: Record<number, string> = {
            1: 'mono',
            2: 'stereo',
            3: '2.1',
            4: '3.1',
            5: '5.0',
            6: '5.1',
            7: '6.1',
            8: '7.1',
            9: '7.1.2',
            10: '7.1.2',
            12: '7.1.4'
        }
        const layout = layoutMap[channels] || `${channels}ch`
        return `${codec.toUpperCase()}.${layout}`
    }

    const formatVideoInfo = (metadata: VideoProbeMetadata | null | undefined): string | null => {
        if (!metadata) return null
        const parts: string[] = []
        if (formatDuration(metadata.duration)) parts.push(formatDuration(metadata.duration)!)
        if (formatFileSize(metadata.fileSize)) parts.push(formatFileSize(metadata.fileSize)!)
        if (formatBitrate(metadata.bitrate)) parts.push(formatBitrate(metadata.bitrate)!)
        if (metadata.hdrType) parts.push(metadata.hdrType)
        else if (metadata.isHdr === false) parts.push('SDR')
        if (metadata.bitDepth) parts.push(`${metadata.bitDepth}bit`)
        if (metadata.codec) parts.push(metadata.codec.toUpperCase())
        if (metadata.frameRate) parts.push(`${metadata.frameRate}fps`)
        if (metadata.width && metadata.height) parts.push(`${metadata.width}×${metadata.height}`)
        if (metadata.audioCodec) {
            const audioInfo = formatAudioChannels(metadata.audioCodec, metadata.audioChannels || 0)
            parts.push(audioInfo)
        }
        return parts.length > 0 ? parts.join(' · ') : null
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
                <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
                    <X className="w-5 h-5" />
                    <span>{error}</span>
                </div>
            )}
            {/* Backdrop Image */}
            <div className="absolute inset-0 h-[80vh] w-full overflow-hidden">
                {!isMac && <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-neutral-900/50 to-transparent z-[99]" />}
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
            <div className="relative z-20 container mx-auto px-8 pt-[55vh] pb-20">

                <div className="pt-4">
                    {movie.logoPath && !showTextTitle && !preferTextTitle ? (
                        <img
                            src={`https://image.tmdb.org/t/p/original${movie.logoPath}`}
                            alt={movie.title}
                            className="max-w-[400px] max-h-[150px] object-contain mb-6 origin-left cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setShowTextTitle(true)}
                        />
                    ) : (
                        <h1 
                            className={`text-5xl font-bold mb-2 leading-tight ${movie.logoPath && !preferTextTitle ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                            onClick={() => movie.logoPath && !preferTextTitle && setShowTextTitle(false)}
                        >
                            {movie.title}
                        </h1>
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
                        {(movie.voteAverage || (imdbRating && showImdbRating)) && (
                            <div className="flex gap-3">
                                {movie.voteAverage && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
                                        <span className="text-[#01b4e4] font-bold text-sm">TMDB</span>
                                        <span className="font-semibold">{movie.voteAverage.toFixed(1)}</span>
                                    </div>
                                )}
                                {imdbRating && showImdbRating && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
                                        <span className="text-[#f5c518] font-bold text-sm">IMDb</span>
                                        <span className="font-semibold">{imdbRating.rating.toFixed(1)}</span>
                                        {imdbRating.votes && (
                                            <span className="text-xs text-gray-200">({formatVoteCount(imdbRating.votes)})</span>
                                        )}
                                    </div>
                                )}
                                {loadingImdb && !imdbRating && movie.externalIds?.imdb_id && showImdbRating && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
                                        <span className="text-[#f5c518] font-bold text-sm">IMDb</span>
                                        <span className="text-gray-400 text-sm">Loading...</span>
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
                        {/* Action Buttons - Favorite & Watch Status */}
                        <div className="flex items-center gap-2">
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
                                className="group relative p-2 rounded-full hover:bg-white/10 transition-colors"
                            >
                                <Heart className={`w-5 h-5 ${isFavorited ? 'fill-red-700 text-red-700' : 'text-gray-400'}`} />
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-neutral-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    {isFavorited ? 'Remove from Favorites' : 'Add to Favorites'}
                                </span>
                            </button>
                            <button
                                onClick={async () => {
                                    const newWatched = await window.electron.ipcRenderer.invoke('toggle-watch-status', { mediaId: movie.id, mediaType: 'movie' })
                                    setIsWatched(newWatched)
                                }}
                                className="group relative p-2 rounded-full hover:bg-white/10 transition-colors"
                            >
                                <Check className={`w-5 h-5 ${isWatched ? 'text-green-700' : 'text-gray-400'}`} strokeWidth={3} />
                                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-neutral-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                    {isWatched ? 'Mark as Unwatched' : 'Mark as Watched'}
                                </span>
                            </button>
                        </div>
                    </div>

                    <p className="text-lg text-gray-300 leading-relaxed max-w-3xl mb-6">
                        {movie.overview}
                    </p>

                    {/* External Links */}
                    {externalLinks.length > 0 && (
                        <div className="flex flex-wrap gap-4 mb-10">
                            {externalLinks.map((link, index) => (
                                <button
                                    key={`${link.label}-${index}`}
                                    onClick={() => openExternal(link.url)}
                                    className="text-gray-400 hover:text-white transition-colors text-sm border-b border-transparent hover:border-white"
                                >
                                    {link.label}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex flex-col gap-8 mb-10">
                        {movie.director && Array.isArray(movie.director) && movie.director.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Director{movie.director.length > 1 ? 's' : ''}</h3>
                                <div className="flex flex-wrap gap-4">
                                    {movie.director.map((director, index) => (
                                        <div key={index} className="flex items-center gap-3 bg-white/5 pl-3 pr-5 py-2 rounded-full w-fit">
                                            {director.profilePath ? (
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w185${director.profilePath}`}
                                                    alt={director.name}
                                                    className="w-10 h-10 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-neutral-700 flex items-center justify-center">
                                                    <User className="w-5 h-5 text-gray-500" />
                                                </div>
                                            )}
                                            <span className="font-medium text-sm">{director.name}</span>
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

                    <div className="flex flex-col gap-4">

                        {movie.videoFiles && movie.videoFiles.length > 0 && (
                            <div className="flex flex-col gap-2">
                                {movie.videoFiles.map((file) => {
                                    const isPlaying = playingFileId === file.id
                                    const isAnyPlaying = playingFileId !== null
                                    return (
                                        <div
                                            key={file.id}
                                            className={`group border border-gray-600 rounded-xl px-3 py-3 flex items-center gap-3 transition-colors ${isAnyPlaying ? (isPlaying ? 'cursor-default' : 'cursor-not-allowed opacity-50') : 'hover:bg-white/10 cursor-pointer'}`}
                                            onClick={() => !isAnyPlaying && playVideo(file)}
                                        >
                                            <button
                                                onClick={(e) => { e.stopPropagation(); if (!isAnyPlaying) playVideo(file) }}
                                                disabled={isAnyPlaying}
                                                className={`flex-shrink-0 w-8 h-8 flex items-center justify-center transition-transform ${isAnyPlaying ? 'cursor-not-allowed' : 'group-hover:scale-110'}`}
                                            >
                                                {isAnyPlaying && isPlaying ? (
                                                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                                                ) : (
                                                    <Play className="w-5 h-5 text-white fill-white" />
                                                )}
                                            </button>
                                            <div className="flex flex-col gap-0.5 flex-1 min-w-0 pr-4">
                                                <span className="text-gray-200 font-medium text-sm break-all">
                                                    {file.name}
                                                </span>
                                                {formatVideoInfo(videoMetadata[file.id]) && (
                                                    <span className="text-gray-400 font-mono text-xs">
                                                        {formatVideoInfo(videoMetadata[file.id])}
                                                    </span>
                                                )}
                                                <span className="text-gray-500 text-xs truncate">
                                                    {sources.find(s => s.id === file.sourceId)?.name || 'Unknown Source'}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>


        </div >
    )
}
