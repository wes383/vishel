import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Play, Loader2, SkipForward, X } from 'lucide-react'
import { HistoryItem } from '../../types/library'

interface HistoryListProps {
    items: HistoryItem[]
    onDelete: (id: string) => void
    emptyMessage?: React.ReactNode
}

export const HistoryList: React.FC<HistoryListProps> = ({ items, onDelete, emptyMessage }) => {
    const navigate = useNavigate()
    const [playingId, setPlayingId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [fileSelector, setFileSelector] = useState<{ episode: any, show: any, isNext: boolean } | null>(null)
    const errorTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

    const showError = (message: string, duration = 3000) => {
        if (errorTimeoutRef.current) {
            clearTimeout(errorTimeoutRef.current)
        }
        
        setError(message)
        errorTimeoutRef.current = setTimeout(() => {
            setError(null)
            errorTimeoutRef.current = null
        }, duration)
    }

    const handleNavigateToDetail = async (item: HistoryItem) => {
        try {
            if (item.mediaType === 'movie') {
                const movie = await window.electron.ipcRenderer.invoke('get-movie', item.mediaId)
                if (!movie) {
                    showError('This movie is no longer in your library')
                    return
                }
            } else {
                const show = await window.electron.ipcRenderer.invoke('get-tv-show', item.mediaId)
                if (!show) {
                    showError('This TV show is no longer in your library')
                    return
                }
            }
            
            navigate(item.mediaType === 'movie' ? `/movie/${item.mediaId}` : `/tv/${item.mediaId}`)
        } catch (err: any) {
            showError(err?.message || 'Failed to load media details')
        }
    }

    const handlePlay = async (item: HistoryItem) => {
        setPlayingId(item.id)
        setError(null)
        
        try {
            let videoFile = null
            
            if (item.mediaType === 'movie') {
                const movie = await window.electron.ipcRenderer.invoke('get-movie', item.mediaId)
                if (movie && movie.videoFiles) {
                    if (movie.videoFiles.length > 1) {
                        const fakeEpisode = {
                            videoFiles: movie.videoFiles,
                            seasonNumber: 0,
                            episodeNumber: 0,
                            name: movie.title
                        }
                        const fakeShow = {
                            id: movie.id,
                            name: movie.title,
                            posterPath: movie.posterPath
                        }
                        setFileSelector({ episode: fakeEpisode, show: fakeShow, isNext: false })
                        setPlayingId(null)
                        return
                    }
                    
                    videoFile = movie.videoFiles.find((f: any) => f.filePath === item.filePath)
                    if (!videoFile && movie.videoFiles.length > 0) {
                        videoFile = movie.videoFiles[0]
                    }
                }
            } else {
                const show = await window.electron.ipcRenderer.invoke('get-tv-show', item.mediaId)
                if (show && show.seasons) {
                    for (const season of show.seasons) {
                        if (season.seasonNumber === item.seasonNumber) {
                            const episode = season.episodes.find((ep: any) => ep.episodeNumber === item.episodeNumber)
                            if (episode && episode.videoFiles) {
                                if (episode.videoFiles.length > 1) {
                                    setFileSelector({ episode, show, isNext: false })
                                    setPlayingId(null)
                                    return
                                }
                                
                                videoFile = episode.videoFiles.find((f: any) => f.filePath === item.filePath)
                                if (!videoFile && episode.videoFiles.length > 0) {
                                    videoFile = episode.videoFiles[0]
                                }
                            }
                            break
                        }
                    }
                }
            }
            
            if (!videoFile) {
                throw new Error('Video file not found')
            }
            
            // Play the video
            await window.electron.ipcRenderer.invoke('play-video', {
                url: videoFile.webdavUrl,
                title: item.mediaType === 'tv' && item.seasonNumber && item.episodeNumber
                    ? `${item.title} - S${item.seasonNumber}E${item.episodeNumber}${item.episodeName ? ' - ' + item.episodeName : ''}`
                    : item.title,
                history: {
                    mediaId: item.mediaId,
                    mediaType: item.mediaType,
                    title: item.title,
                    posterPath: item.posterPath,
                    filePath: videoFile.filePath,
                    seasonNumber: item.seasonNumber,
                    episodeNumber: item.episodeNumber,
                    episodeName: item.episodeName
                }
            })
        } catch (err: any) {
            showError(err?.message || 'Failed to play video')
        } finally {
            setPlayingId(null)
        }
    }

    const handlePlayNext = async (item: HistoryItem) => {
        if (item.mediaType !== 'tv' || !item.seasonNumber || item.episodeNumber === undefined) return
        
        setPlayingId(`${item.id}-next`)
        setError(null)
        
        try {
            const show = await window.electron.ipcRenderer.invoke('get-tv-show', item.mediaId)
            if (!show || !show.seasons) {
                throw new Error('TV show not found')
            }
            
            const currentSeason = show.seasons.find((s: any) => s.seasonNumber === item.seasonNumber)
            if (!currentSeason) {
                throw new Error('Season not found')
            }
            
            const nextEpisode = currentSeason.episodes.find((ep: any) => ep.episodeNumber === item.episodeNumber! + 1)
            if (!nextEpisode || !nextEpisode.videoFiles || nextEpisode.videoFiles.length === 0) {
                throw new Error('Next episode not found')
            }
            
            if (nextEpisode.videoFiles.length > 1) {
                setFileSelector({ episode: nextEpisode, show, isNext: true })
                setPlayingId(null)
                return
            }
            
            const videoFile = nextEpisode.videoFiles[0]
            
            await window.electron.ipcRenderer.invoke('play-video', {
                url: videoFile.webdavUrl,
                title: `${item.title} - S${nextEpisode.seasonNumber}E${nextEpisode.episodeNumber}${nextEpisode.name ? ' - ' + nextEpisode.name : ''}`,
                history: {
                    mediaId: item.mediaId,
                    mediaType: 'tv',
                    title: item.title,
                    posterPath: item.posterPath,
                    filePath: videoFile.filePath,
                    seasonNumber: nextEpisode.seasonNumber,
                    episodeNumber: nextEpisode.episodeNumber,
                    episodeName: nextEpisode.name
                }
            })
        } catch (err: any) {
            showError(err?.message || 'Failed to play next episode')
        } finally {
            setPlayingId(null)
        }
    }

    const hasNextEpisode = async (item: HistoryItem): Promise<boolean> => {
        if (item.mediaType !== 'tv' || !item.seasonNumber || item.episodeNumber === undefined) return false
        
        try {
            const show = await window.electron.ipcRenderer.invoke('get-tv-show', item.mediaId)
            if (!show || !show.seasons) return false
            
            const currentSeason = show.seasons.find((s: any) => s.seasonNumber === item.seasonNumber)
            if (!currentSeason) return false
            
            const nextEpisode = currentSeason.episodes.find((ep: any) => ep.episodeNumber === item.episodeNumber! + 1)
            return !!(nextEpisode && nextEpisode.videoFiles && nextEpisode.videoFiles.length > 0)
        } catch {
            return false
        }
    }

    // Check which items have next episodes
    const [itemsWithNext, setItemsWithNext] = React.useState<Set<string>>(new Set())
    
    React.useEffect(() => {
        const checkNextEpisodes = async () => {
            const results = new Set<string>()
            for (const item of items) {
                if (await hasNextEpisode(item)) {
                    results.add(item.id)
                }
            }
            setItemsWithNext(results)
        }
        checkNextEpisodes()
    }, [items])

    if (items.length === 0) {
        return (
            <div className="text-center text-gray-400 mt-20">
                {emptyMessage || <p>No history found</p>}
            </div>
        )
    }

    return (
        <>
            {/* Error Message */}
            {error && (
                <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
                    <span>{error}</span>
                </div>
            )}
            
            {/* File Selector Modal */}
            {fileSelector && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-white/50 backdrop-blur-md rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-gray-900">Select Version</h2>
                            <button
                                onClick={() => setFileSelector(null)}
                                className="p-2 hover:bg-black/10 rounded-full transition-colors text-gray-900"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="space-y-3">
                            {fileSelector.episode.videoFiles.map((file: any) => (
                                <button
                                    key={file.id}
                                    onClick={async () => {
                                        setFileSelector(null)
                                        setPlayingId(fileSelector.isNext ? `next-${file.id}` : file.id)
                                        try {
                                            // Determine if this is a movie or TV show based on seasonNumber
                                            const isMovie = fileSelector.episode.seasonNumber === 0
                                            
                                            await window.electron.ipcRenderer.invoke('play-video', {
                                                url: file.webdavUrl,
                                                title: isMovie 
                                                    ? fileSelector.show.name
                                                    : `${fileSelector.show.name} - S${fileSelector.episode.seasonNumber}E${fileSelector.episode.episodeNumber}${fileSelector.episode.name ? ' - ' + fileSelector.episode.name : ''}`,
                                                history: {
                                                    mediaId: fileSelector.show.id,
                                                    mediaType: isMovie ? 'movie' : 'tv',
                                                    title: fileSelector.show.name,
                                                    posterPath: fileSelector.show.posterPath,
                                                    filePath: file.filePath,
                                                    ...(isMovie ? {} : {
                                                        seasonNumber: fileSelector.episode.seasonNumber,
                                                        episodeNumber: fileSelector.episode.episodeNumber,
                                                        episodeName: fileSelector.episode.name
                                                    })
                                                }
                                            })
                                        } catch (err: any) {
                                            showError(err?.message || 'Failed to play video')
                                        } finally {
                                            setPlayingId(null)
                                        }
                                    }}
                                    className="w-full text-left p-4 bg-white/30 hover:bg-white/50 rounded-lg transition-colors flex items-center gap-3"
                                >
                                    <Play className="w-5 h-5 text-gray-900" />
                                    <div className="flex-1">
                                        <p className="font-medium text-gray-900">{file.name}</p>
                                        <p className="text-sm text-gray-700">{file.filePath}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            
            <div className="space-y-2">
            {items.map(item => (
                <div
                    key={item.id}
                    className="group bg-neutral-800 rounded-xl overflow-hidden hover:bg-neutral-700 transition-colors"
                >
                    <div className="flex items-center gap-4 p-3">
                        {/* Poster */}
                        <div
                            className="flex-shrink-0 w-16 h-24 rounded-lg overflow-hidden cursor-pointer bg-neutral-700"
                            onClick={() => handleNavigateToDetail(item)}
                        >
                            {item.posterPath ? (
                                <img
                                    src={`https://image.tmdb.org/t/p/w200${item.posterPath}`}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-neutral-500 text-xs">
                                    No Poster
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => handleNavigateToDetail(item)}
                        >
                            <h3 className="font-semibold text-white text-base truncate">{item.title}</h3>
                            <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
                                {item.mediaType === 'tv' && item.seasonNumber && item.episodeNumber && (
                                    <>
                                        <span>S{item.seasonNumber}E{item.episodeNumber}</span>
                                        {item.episodeName && (
                                            <>
                                                <span>·</span>
                                                <span className="truncate">{item.episodeName}</span>
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {new Date(item.timestamp).toLocaleString()}
                            </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2">
                            {itemsWithNext.has(item.id) && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handlePlayNext(item)
                                    }}
                                    disabled={playingId === `${item.id}-next`}
                                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 text-white hover:bg-white hover:text-black transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 text-sm font-medium"
                                >
                                    {playingId === `${item.id}-next` ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <SkipForward className="w-4 h-4" />
                                    )}
                                    <span>Play Next: S{item.seasonNumber}E{item.episodeNumber! + 1}</span>
                                </button>
                            )}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handlePlay(item)
                                }}
                                disabled={playingId === item.id}
                                className="flex-shrink-0 p-2 rounded-full bg-white/20 text-white hover:bg-white hover:text-black transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                            >
                                {playingId === item.id ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <Play className="w-5 h-5" />
                                )}
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onDelete(item.id)
                                }}
                                className="flex-shrink-0 p-2 mr-2 rounded-full bg-white/20 text-gray-300 hover:bg-red-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
        </>
    )
}
