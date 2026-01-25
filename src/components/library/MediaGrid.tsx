import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LazyImage } from '../LazyImage'
import { CombinedItem, Movie, TVShow } from '../../types/library'
import { RematchModal } from './RematchModal'
import { Film, Tv, Play, Heart, RefreshCw, Repeat, X } from 'lucide-react'

interface MediaGridProps {
    items: CombinedItem[] | Movie[] | TVShow[]
    showTitlesOnPosters: boolean
    emptyMessage?: React.ReactNode
    type?: 'combined' | 'movie' | 'tv'
    onRematch?: () => void
}

export const MediaGrid: React.FC<MediaGridProps> = ({ items, showTitlesOnPosters, emptyMessage, type = 'combined', onRematch }) => {
    const navigate = useNavigate()
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item: any } | null>(null)
    const [rematchItem, setRematchItem] = useState<{ id: number, type: 'movie' | 'tv', title: string, videoFiles: any[] } | null>(null)
    const [favoriteStatus, setFavoriteStatus] = useState<{ [key: string]: boolean }>({})
    const [episodeSelector, setEpisodeSelector] = useState<{ show: any, seasons: any[] } | null>(null)
    const [fileSelector, setFileSelector] = useState<{ files: any[], title: string, history: any } | null>(null)
    const [playing, setPlaying] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [refreshing, setRefreshing] = useState(false)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const messageTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

    const showMessage = (message: string, type: 'error' | 'success', duration = 3000) => {
        if (messageTimeoutRef.current) {
            clearTimeout(messageTimeoutRef.current)
        }
        
        setError(null)
        setSuccessMessage(null)
        
        if (type === 'error') {
            setError(message)
        } else {
            setSuccessMessage(message)
        }
        
        messageTimeoutRef.current = setTimeout(() => {
            setError(null)
            setSuccessMessage(null)
            messageTimeoutRef.current = null
        }, duration)
    }

    const showError = (message: string, duration = 3000) => {
        showMessage(message, 'error', duration)
    }

    const showSuccess = (message: string, duration = 3000) => {
        showMessage(message, 'success', duration)
    }

    const getItemTitle = (item: any) => {
        if (!item) return 'Unknown'
        if ('title' in item && item.title) return item.title
        if ('name' in item && item.name) return item.name
        return 'Unknown'
    }

    const getItemType = (item: any) => {
        if (!item) return 'movie'
        if ('type' in item) return item.type
        if (type === 'movie') return 'movie'
        if (type === 'tv') return 'tv'
        return 'movie'
    }

    const handleNavigate = (item: any) => {
        const itemType = getItemType(item)
        if (itemType === 'movie') {
            navigate(`/movie/${item.id}`)
        } else {
            navigate(`/tv/${item.id}`)
        }
    }

    const handleContextMenu = (e: React.MouseEvent, item: any) => {
        e.preventDefault()
        
        const menuWidth = 240
        const menuHeight = 160
        const padding = 8
        
        const viewportWidth = document.documentElement.clientWidth
        const viewportHeight = document.documentElement.clientHeight
        
        let x = e.clientX
        if (e.clientX + menuWidth > viewportWidth - padding) {
            x = e.clientX - menuWidth
        }
        
        let y = e.clientY
        if (e.clientY + menuHeight > viewportHeight - padding) {
            y = e.clientY - menuHeight + 8
        }
        
        setContextMenu({ x, y, item })
        
        const itemType = getItemType(item)
        const key = `${itemType}-${item.id}`
        window.electron.ipcRenderer.invoke('is-favorite', {
            mediaId: item.id,
            mediaType: itemType
        }).then((isFav: boolean) => {
            setFavoriteStatus(prev => ({ ...prev, [key]: isFav }))
        })
    }

    const handleRefreshMetadata = async () => {
        if (!contextMenu) return
        const item = contextMenu.item
        const itemType = getItemType(item)
        const title = getItemTitle(item)
        
        setContextMenu(null)
        setRefreshing(true)
        
        setSuccessMessage(`Refreshing metadata for "${title}"...`)
        
        const scrollContainer = document.querySelector('.library-scroll-container') as HTMLElement
        const scrollPosition = scrollContainer ? scrollContainer.scrollTop : window.scrollY
        
        try {
            await window.electron.ipcRenderer.invoke('refresh-metadata', {
                mediaId: item.id,
                mediaType: itemType
            })
            
            showSuccess(`Metadata refreshed successfully for "${title}"`, 1000)
            
            setTimeout(() => {
                onRematch?.()
                setTimeout(() => {
                    if (scrollContainer) {
                        scrollContainer.scrollTop = scrollPosition
                    } else {
                        window.scrollTo(0, scrollPosition)
                    }
                }, 100)
            }, 1000)
        } catch (err: any) {
            showError(err?.message || 'Failed to refresh metadata')
        } finally {
            setRefreshing(false)
        }
    }

    const handleRematchClick = async () => {
        if (!contextMenu) return
        const item = contextMenu.item
        const itemType = getItemType(item)
        const title = getItemTitle(item)
        
        let videoFiles: any[] = []
        
        try {
            if (itemType === 'movie') {
                const fullMovie = await window.electron.ipcRenderer.invoke('get-movie', item.id)
                if (fullMovie && fullMovie.videoFiles) {
                    videoFiles = fullMovie.videoFiles
                }
            } else if (itemType === 'tv') {
                const fullShow = await window.electron.ipcRenderer.invoke('get-tv-show', item.id)
                if (fullShow && fullShow.seasons) {
                    for (const season of fullShow.seasons) {
                        if (season.episodes) {
                            for (const episode of season.episodes) {
                                if (episode.videoFiles) {
                                    videoFiles.push(...episode.videoFiles)
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Failed to fetch media details:', error)
        }
        
        setRematchItem({ id: item.id, type: itemType, title, videoFiles })
        setContextMenu(null)
    }

    const handleToggleFavorite = async () => {
        if (!contextMenu) return
        const item = contextMenu.item
        const itemType = getItemType(item)
        const title = getItemTitle(item)
        const key = `${itemType}-${item.id}`
        
        const scrollContainer = document.querySelector('.library-scroll-container') as HTMLElement
        const scrollPosition = scrollContainer ? scrollContainer.scrollTop : window.scrollY
        
        try {
            const isFavorited = favoriteStatus[key]
            
            if (isFavorited) {
                await window.electron.ipcRenderer.invoke('remove-favorite', {
                    mediaId: item.id,
                    mediaType: itemType
                })
                setFavoriteStatus(prev => ({ ...prev, [key]: false }))
            } else {
                await window.electron.ipcRenderer.invoke('add-favorite', {
                    mediaId: item.id,
                    mediaType: itemType,
                    title: title,
                    posterPath: item.posterPath || ''
                })
                setFavoriteStatus(prev => ({ ...prev, [key]: true }))
            }
            
            setContextMenu(null)
            onRematch?.()
            requestAnimationFrame(() => {
                setTimeout(() => {
                    if (scrollContainer) {
                        scrollContainer.scrollTop = scrollPosition
                    } else {
                        window.scrollTo(0, scrollPosition)
                    }
                    setTimeout(() => {
                        if (scrollContainer) {
                            scrollContainer.scrollTop = scrollPosition
                        } else {
                            window.scrollTo(0, scrollPosition)
                        }
                    }, 200)
                }, 50)
            })
        } catch (error) {
            console.error('Failed to toggle favorite:', error)
        }
    }

    const handlePlayClick = async () => {
        if (!contextMenu) return
        const item = contextMenu.item
        const itemType = getItemType(item)
        
        setContextMenu(null)
        
        try {
            if (itemType === 'movie') {
                // Fetch full movie data
                const fullMovie = await window.electron.ipcRenderer.invoke('get-movie', item.id)
                if (!fullMovie || !fullMovie.videoFiles || fullMovie.videoFiles.length === 0) {
                    showError('No video files found')
                    return
                }
                
                // Play directly if only one file
                if (fullMovie.videoFiles.length === 1) {
                    playVideo(fullMovie.videoFiles[0], fullMovie.title, {
                        mediaId: fullMovie.id,
                        mediaType: 'movie',
                        title: fullMovie.title,
                        posterPath: fullMovie.posterPath,
                        filePath: fullMovie.videoFiles[0].filePath
                    })
                } else {
                    // Show file selector for multiple files
                    setFileSelector({
                        files: fullMovie.videoFiles,
                        title: fullMovie.title,
                        history: {
                            mediaId: fullMovie.id,
                            mediaType: 'movie',
                            title: fullMovie.title,
                            posterPath: fullMovie.posterPath
                        }
                    })
                }
            } else {
                // Fetch full TV show data
                const fullShow = await window.electron.ipcRenderer.invoke('get-tv-show', item.id)
                if (!fullShow || !fullShow.seasons || fullShow.seasons.length === 0) {
                    showError('No episodes found')
                    return
                }
                
                // Show episode selector
                setEpisodeSelector({ show: fullShow, seasons: fullShow.seasons })
            }
        } catch (error) {
            console.error('Failed to play:', error)
            showError('Failed to load media')
        }
    }

    const playVideo = async (file: any, title: string, history: any) => {
        setPlaying(true)
        showSuccess('Playing video...')
        try {
            await window.electron.ipcRenderer.invoke('play-video', {
                url: file.webdavUrl,
                title,
                history
            })
        } catch (err: any) {
            showError(err?.message || 'Failed to launch player')
        } finally {
            setPlaying(false)
        }
    }

    const handleEpisodePlay = (episode: any, show: any) => {
        if (!episode.videoFiles || episode.videoFiles.length === 0) {
            showError('No video files found for this episode')
            return
        }
        
        // If multiple files, show file selector
        if (episode.videoFiles.length > 1) {
            setFileSelector({
                files: episode.videoFiles,
                title: `${show.name} - S${episode.seasonNumber}E${episode.episodeNumber}${episode.name ? ' - ' + episode.name : ''}`,
                history: {
                    mediaId: show.id,
                    mediaType: 'tv',
                    title: show.name,
                    posterPath: show.posterPath,
                    seasonNumber: episode.seasonNumber,
                    episodeNumber: episode.episodeNumber,
                    episodeName: episode.name
                }
            })
            setEpisodeSelector(null)
            return
        }
        
        const file = episode.videoFiles[0]
        playVideo(file, `${show.name} - S${episode.seasonNumber}E${episode.episodeNumber} - ${episode.name}`, {
            mediaId: show.id,
            mediaType: 'tv',
            title: show.name,
            posterPath: show.posterPath,
            filePath: file.filePath,
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
            episodeName: episode.name
        })
        
        setEpisodeSelector(null)
    }

    const handleRematch = async (newTmdbId: number, fileId?: string, newMediaType?: 'movie' | 'tv', episodeInfo?: { season: number, episode: number }) => {
        if (!rematchItem) return
        
        try {
            if (fileId) {
                // Single file rematch
                await window.electron.ipcRenderer.invoke('rematch-single-file', {
                    oldTmdbId: rematchItem.id,
                    oldMediaType: rematchItem.type,
                    fileId,
                    newTmdbId,
                    newMediaType,
                    episodeInfo
                })
            } else {
                // Full media rematch
                await window.electron.ipcRenderer.invoke('rematch-media', {
                    oldTmdbId: rematchItem.id,
                    newTmdbId,
                    mediaType: rematchItem.type
                })
            }
            setRematchItem(null)
            onRematch?.()
        } catch (error) {
            console.error('Failed to rematch:', error)
            alert(`Failed to rematch: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }

    React.useEffect(() => {
        const handleClick = () => setContextMenu(null)
        const handleScroll = () => setContextMenu(null)
        
        if (contextMenu) {
            document.addEventListener('click', handleClick)
            document.addEventListener('scroll', handleScroll, true) // Use capture phase to catch all scroll events
            return () => {
                document.removeEventListener('click', handleClick)
                document.removeEventListener('scroll', handleScroll, true)
            }
        }
    }, [contextMenu])

    // Handle empty items
    if (items.length === 0) {
        return (
            <div className="text-center text-gray-400 mt-20">
                {emptyMessage || <p>No content found</p>}
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
            
            {/* Success Message */}
            {successMessage && (
                <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
                    <span>{successMessage}</span>
                </div>
            )}
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {items.map((item: any) => {
                    const title = getItemTitle(item)
                    const itemType = getItemType(item)
                    const key = `${itemType}-${item.id}`
                    const isContextMenuOpen = contextMenu?.item?.id === item.id

                    return (
                        <div key={key} className="group">
                            <div className={`relative rounded-xl overflow-hidden shadow-lg transition-all duration-300 ${
                                isContextMenuOpen 
                                    ? 'shadow-2xl' 
                                    : 'hover:shadow-2xl'
                            } ${showTitlesOnPosters ? (isContextMenuOpen ? '-translate-y-1' : 'group-hover:-translate-y-1') : ''}`}>
                                <div
                                    onClick={() => handleNavigate(item)}
                                    onContextMenu={(e) => handleContextMenu(e, item)}
                                    className="aspect-[2/3] relative cursor-pointer bg-neutral-800"
                                >
                                    {item.posterPath ? (
                                        <LazyImage
                                            src={`https://image.tmdb.org/t/p/w500${item.posterPath}`}
                                            alt={title}
                                            className={`w-full h-full object-cover ${
                                                showTitlesOnPosters 
                                                    ? '' 
                                                    : isContextMenuOpen 
                                                        ? 'blur-sm' 
                                                        : 'group-hover:blur-sm'
                                            }`}
                                            placeholderClassName="w-full h-full"
                                        />
                                    ) : (
                                        <div className={`w-full h-full flex items-center justify-center bg-neutral-700 text-neutral-500 ${
                                            showTitlesOnPosters 
                                                ? '' 
                                                : isContextMenuOpen 
                                                    ? 'blur-sm' 
                                                    : 'group-hover:blur-sm'
                                        }`}>
                                            {itemType === 'movie' ? <Film className="w-12 h-12" /> : <Tv className="w-12 h-12" />}
                                        </div>
                                    )}
                                    {!showTitlesOnPosters && (
                                        <div className={`absolute inset-0 bg-black/0 transition-all duration-100 delay-[50ms] flex items-center justify-center p-4 ${
                                            isContextMenuOpen 
                                                ? 'bg-black/60 opacity-100' 
                                                : 'group-hover:bg-black/60 opacity-0 group-hover:opacity-100'
                                        }`}>
                                            <h3 className="font-medium text-white text-center text-lg font-['Inter']">
                                                {title}
                                            </h3>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {showTitlesOnPosters && (
                                <div
                                    onClick={() => handleNavigate(item)}
                                    onContextMenu={(e) => handleContextMenu(e, item)}
                                    className={`mt-2 cursor-pointer transition-transform duration-300 ${
                                        isContextMenuOpen 
                                            ? '-translate-y-1' 
                                            : 'group-hover:-translate-y-1'
                                    }`}
                                >
                                    <h3 className="font-medium text-white text-base text-center px-1 font-['Inter']">
                                        {title}
                                    </h3>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-white/50 backdrop-blur-md rounded-xl shadow-2xl py-1 z-50 w-[240px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button
                        onClick={handlePlayClick}
                        disabled={playing}
                        className="w-full px-4 py-2 text-left hover:bg-black/10 transition-colors text-sm text-gray-900 font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                        <Play className="w-4 h-4" />
                        {playing ? 'Playing...' : 'Play'}
                    </button>
                    <button
                        onClick={handleToggleFavorite}
                        className="w-full px-4 py-2 text-left hover:bg-black/10 transition-colors text-sm text-gray-900 font-medium flex items-center gap-2"
                    >
                        <Heart 
                            className="w-4 h-4" 
                            fill={favoriteStatus[`${getItemType(contextMenu.item)}-${contextMenu.item.id}`] ? 'currentColor' : 'none'}
                        />
                        {favoriteStatus[`${getItemType(contextMenu.item)}-${contextMenu.item.id}`] 
                            ? 'Remove from Favorites' 
                            : 'Add to Favorites'}
                    </button>
                    <button
                        onClick={handleRefreshMetadata}
                        disabled={refreshing}
                        className="w-full px-4 py-2 text-left hover:bg-black/10 transition-colors text-sm text-gray-900 font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        {refreshing ? 'Refreshing...' : 'Refresh Metadata'}
                    </button>
                    <button
                        onClick={handleRematchClick}
                        className="w-full px-4 py-2 text-left hover:bg-black/10 transition-colors text-sm text-gray-900 font-medium flex items-center gap-2"
                    >
                        <Repeat className="w-4 h-4" />
                        Rematch
                    </button>
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
                            {fileSelector.files.map((file: any) => (
                                <button
                                    key={file.id}
                                    onClick={() => {
                                        playVideo(file, fileSelector.title, {
                                            ...fileSelector.history,
                                            filePath: file.filePath
                                        })
                                        setFileSelector(null)
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

            {/* Episode Selector Modal */}
            {episodeSelector && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-white/50 backdrop-blur-md rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-900/10">
                            <h2 className="text-lg font-bold text-gray-900">{episodeSelector.show.name}</h2>
                            <button
                                onClick={() => setEpisodeSelector(null)}
                                className="w-8 h-8 flex items-center justify-center hover:bg-black/10 rounded-full transition-colors text-gray-900"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-6 episode-selector-scroll">
                            {episodeSelector.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber).map(season => (
                                <div key={season.seasonNumber} className="mb-6">
                                    <h3 className="text-lg font-bold mb-3 text-gray-900">Season {season.seasonNumber}</h3>
                                    <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                                        {season.episodes
                                            .filter((ep: any) => ep.videoFiles && ep.videoFiles.length > 0)
                                            .sort((a: any, b: any) => a.episodeNumber - b.episodeNumber)
                                            .map((episode: any) => (
                                                <button
                                                    key={episode.id}
                                                    onClick={() => handleEpisodePlay(episode, episodeSelector.show)}
                                                    className="aspect-square bg-black/20 hover:bg-black/30 rounded-full transition-colors flex items-center justify-center font-medium text-lg text-gray-900"
                                                >
                                                    {episode.episodeNumber}
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Rematch Modal */}
            {rematchItem && (
                <RematchModal
                    mediaId={rematchItem.id}
                    mediaType={rematchItem.type}
                    currentTitle={rematchItem.title}
                    videoFiles={rematchItem.videoFiles}
                    onClose={() => setRematchItem(null)}
                    onRematch={handleRematch}
                />
            )}
        </>
    )
}
