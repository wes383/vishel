import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LazyImage } from '../LazyImage'
import Modal from '../ui/Modal'
import { GridItem } from '../../types/library'
import { RematchModal } from './RematchModal'
import { useMediaStatus } from '../../contexts/MediaStatusContext'
import { useToast } from '../../contexts/ToastContext'
import { Film, Tv, Play, Heart, RefreshCw, Repeat, Check } from 'lucide-react'
import { formatMoviePlayTitle, formatTvPlayTitle } from '../../utils/playTitle'
import { useRowVirtualizer } from '../../hooks/useRowVirtualizer'
import type { Episode, Movie, Season, TVShow, VideoFile } from '../../../electron/db'
import type { MatchResult, PlayHistoryDraft } from '../../types/ipc'

interface MediaGridProps {
    items: GridItem[]
    posterTitleMode: 'hover' | 'below' | 'hidden'
    posterSize?: 'small' | 'medium' | 'large'
    emptyMessage?: React.ReactNode
    /** Called after any mutation that changes the library contents. */
    onChanged?: () => void
}

interface ContextMenuState {
    x: number
    y: number
    item: GridItem
}

const MENU_WIDTH = 240
const MENU_HEIGHT = 200
const MENU_PADDING = 8

interface PosterCardProps {
    item: GridItem
    posterTitleMode: 'hover' | 'below' | 'hidden'
    posterSize: 'small' | 'medium' | 'large'
    isMenuOpen: boolean
    onOpen: (item: GridItem) => void
    onMenu: (item: GridItem, anchor: HTMLElement, point?: { x: number, y: number }) => void
}

const PosterCard = React.memo(function PosterCard({
    item,
    posterTitleMode,
    posterSize,
    isMenuOpen,
    onOpen,
    onMenu
}: PosterCardProps) {
    // The aria-label is built here, not passed in as a prop, so React.memo's shallow comparison
    // stays valid and a language switch re-renders this card through its own subscription.
    const { t } = useTranslation(['grid', 'common'])
    const ref = useRef<HTMLButtonElement>(null)
    const isHoverMode = posterTitleMode === 'hover'
    const shouldShift = posterTitleMode !== 'hover'

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        // Shift+F10 and the dedicated menu key are the keyboard routes to the context menu.
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            if (ref.current) onMenu(item, ref.current)
        }
    }

    return (
        <div className="group">
            <button
                ref={ref}
                type="button"
                onClick={() => onOpen(item)}
                onContextMenu={(event) => {
                    event.preventDefault()
                    onMenu(item, event.currentTarget, { x: event.clientX, y: event.clientY })
                }}
                onKeyDown={handleKeyDown}
                aria-label={item.type === 'movie'
                    ? t('grid:posterAriaLabelMovie', { title: item.title })
                    : t('grid:posterAriaLabelTv', { title: item.title })}
                className={`block w-full text-left rounded-xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    shouldShift ? (isMenuOpen ? '-translate-y-1' : 'group-hover:-translate-y-1') : ''
                }`}
            >
                {/* The card chrome lives on the poster, so a title below it sits outside the rounded box. */}
                <span className={`block aspect-[2/3] relative rounded-xl overflow-hidden shadow-lg ${
                    isMenuOpen ? 'shadow-2xl' : 'group-hover:shadow-2xl'
                } bg-neutral-800`}>
                    {/* Blur wraps the image only: the hover title is a sibling, so it stays sharp. */}
                    <span className={`block w-full h-full transition-all duration-300 ${
                        isHoverMode ? (isMenuOpen ? 'blur-sm' : 'group-hover:blur-sm') : ''
                    }`}>
                        {item.posterPath ? (
                            <LazyImage
                                src={`https://image.tmdb.org/t/p/w500${item.posterPath}`}
                                alt={item.title}
                                className="w-full h-full object-cover"
                                placeholderClassName="w-full h-full"
                            />
                        ) : (
                            <span className="w-full h-full flex items-center justify-center bg-neutral-700 text-neutral-500">
                                {item.type === 'movie' ? <Film className="w-12 h-12" aria-hidden="true" /> : <Tv className="w-12 h-12" aria-hidden="true" />}
                            </span>
                        )}
                    </span>
                    {isHoverMode && (
                        <span className={`absolute inset-0 bg-black/0 transition-all duration-100 delay-[50ms] flex items-center justify-center p-4 ${
                            isMenuOpen ? 'bg-black/60 opacity-100' : 'group-hover:bg-black/60 opacity-0 group-hover:opacity-100'
                        }`}>
                            <span className={`font-medium text-white text-center ${
                                posterSize === 'small' ? 'text-base' : 'text-lg'
                            }`}>
                                {item.title}
                            </span>
                        </span>
                    )}
                </span>
                {posterTitleMode === 'below' && (
                    <span className={`block mt-2 px-1 font-medium text-white text-center ${
                        posterSize === 'small' ? 'text-sm' : 'text-base'
                    }`}>
                        {item.title}
                    </span>
                )}
            </button>
        </div>
    )
})

const GRID_CLASSES = {
    small: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8',
    medium: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
    large: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
} as const

export const MediaGrid: React.FC<MediaGridProps> = ({
    items,
    posterTitleMode,
    posterSize = 'medium',
    emptyMessage,
    onChanged
}) => {
    const navigate = useNavigate()
    const { t } = useTranslation(['grid', 'common'])
    const gridRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const anchorRef = useRef<HTMLElement | null>(null)

    const { isFavorite, isWatched, toggleFavorite, toggleWatched } = useMediaStatus()
    const { showToast } = useToast()

    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
    const [rematchItem, setRematchItem] = useState<{ id: number, type: 'movie' | 'tv', title: string, videoFiles: VideoFile[] } | null>(null)
    const [episodeSelector, setEpisodeSelector] = useState<TVShow | null>(null)
    const [fileSelector, setFileSelector] = useState<{ files: VideoFile[], title: string, history: PlayHistoryDraft } | null>(null)
    const [playing, setPlaying] = useState(false)
    const [refreshing, setRefreshing] = useState(false)

    const showTitleBelow = posterTitleMode === 'below'
    const virtualizer = useRowVirtualizer(gridRef, items.length, posterSize, showTitleBelow)

    const handleOpen = useCallback((item: GridItem) => {
        navigate(item.type === 'movie' ? `/movie/${item.id}` : `/tv/${item.id}`)
    }, [navigate])

    /** Right-click opens at the cursor; the keyboard route has no pointer, so it anchors to the card. */
    const handleMenu = useCallback((item: GridItem, anchor: HTMLElement, point?: { x: number, y: number }) => {
        anchorRef.current = anchor

        const rect = anchor.getBoundingClientRect()
        const viewportWidth = document.documentElement.clientWidth
        const viewportHeight = document.documentElement.clientHeight

        let x = point ? point.x : rect.left
        if (x + MENU_WIDTH > viewportWidth - MENU_PADDING) {
            x = Math.max(MENU_PADDING, (point ? point.x : rect.right) - MENU_WIDTH)
        }

        let y = point ? point.y : rect.top
        if (y + MENU_HEIGHT > viewportHeight - MENU_PADDING) {
            y = Math.max(MENU_PADDING, (point ? point.y : rect.bottom) - MENU_HEIGHT + 8)
        }

        setContextMenu({ x, y, item })
    }, [])

    const closeMenu = useCallback((restoreFocus = true) => {
        setContextMenu(null)
        if (restoreFocus) anchorRef.current?.focus()
    }, [])

    const playVideo = useCallback(async (file: VideoFile, title: string, history: PlayHistoryDraft) => {
        setPlaying(true)
        try {
            const result = await window.electron.ipcRenderer.invoke('play-video', {
                url: file.webdavUrl,
                title,
                history
            })
            if (result?.autoMarked) {
                onChanged?.()
            }
        } catch (error) {
            showToast(errorMessage(error, t('grid:failedToLaunchPlayer')), 'error')
        } finally {
            setPlaying(false)
        }
    }, [onChanged, showToast, t])

    const playMovie = useCallback((movie: Movie) => {
        const [first, ...rest] = movie.videoFiles
        const history: PlayHistoryDraft = {
            mediaId: movie.id,
            mediaType: 'movie',
            title: movie.title,
            posterPath: movie.posterPath,
            filePath: first.filePath
        }

        if (rest.length === 0) {
            void playVideo(first, formatMoviePlayTitle(movie.title), history)
            return
        }

        setFileSelector({
            files: movie.videoFiles,
            title: formatMoviePlayTitle(movie.title),
            history
        })
    }, [playVideo])

    const openFileForItem = useCallback(async (item: GridItem) => {
        if (item.type === 'movie') {
            const movie = await window.electron.ipcRenderer.invoke('get-movie', item.id)
            if (!movie || movie.videoFiles.length === 0) {
                showToast(t('grid:noVideoFilesFound'), 'error')
                return
            }
            playMovie(movie)
            return
        }

        const show = await window.electron.ipcRenderer.invoke('get-tv-show', item.id)
        if (!show || show.seasons.length === 0) {
            showToast(t('grid:noEpisodesFound'), 'error')
            return
        }
        setEpisodeSelector(show)
    }, [showToast, playMovie, t])


    const handleEpisodePlay = (episode: Episode, show: TVShow) => {
        const title = formatTvPlayTitle(show.name, episode.seasonNumber, episode.episodeNumber, episode.name)
        const history: PlayHistoryDraft = {
            mediaId: show.id,
            mediaType: 'tv',
            title: show.name,
            posterPath: show.posterPath,
            filePath: episode.videoFiles[0].filePath,
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
            episodeName: episode.name
        }

        if (episode.videoFiles.length > 1) {
            setFileSelector({ files: episode.videoFiles, title, history })
            setEpisodeSelector(null)
            return
        }

        void playVideo(episode.videoFiles[0], title, history)
        setEpisodeSelector(null)
    }

    const handleRefreshMetadata = async () => {
        if (!contextMenu) return
        const item = contextMenu.item
        closeMenu(false)
        setRefreshing(true)
        showToast(t('grid:refreshingMetadata', { title: item.title }))

        try {
            await window.electron.ipcRenderer.invoke('refresh-metadata', {
                mediaId: item.id,
                mediaType: item.type
            })
            showToast(t('grid:metadataRefreshed', { title: item.title }), 'success')
            onChanged?.()
        } catch (error) {
            showToast(errorMessage(error, t('grid:failedToRefreshMetadata')), 'error')
        } finally {
            setRefreshing(false)
        }
    }

    const handleRematchClick = async () => {
        if (!contextMenu) return
        const item = contextMenu.item
        closeMenu(false)

        let videoFiles: VideoFile[] = []
        try {
            if (item.type === 'movie') {
                const movie = await window.electron.ipcRenderer.invoke('get-movie', item.id)
                videoFiles = movie?.videoFiles || []
            } else {
                const show = await window.electron.ipcRenderer.invoke('get-tv-show', item.id)
                videoFiles = (show?.seasons || []).flatMap((season: Season) =>
                    season.episodes.flatMap(episode => episode.videoFiles)
                )
            }
        } catch (error) {
            console.error('Failed to fetch media details:', error)
            showToast(t('grid:failedToLoadFileList'), 'error')
            return
        }

        setRematchItem({ id: item.id, type: item.type, title: item.title, videoFiles })
    }

    const handleToggleFavorite = async () => {
        if (!contextMenu) return
        const item = contextMenu.item
        closeMenu()

        try {
            const added = await toggleFavorite({ mediaId: item.id, mediaType: item.type, title: item.title })
            showToast(added
                ? t('grid:addedToFavorites', { title: item.title })
                : t('grid:removedFromFavorites', { title: item.title }), 'success')
            onChanged?.()
        } catch (error) {
            showToast(errorMessage(error, t('grid:failedToUpdateFavorites')), 'error')
        }
    }

    const handleToggleWatched = async () => {
        if (!contextMenu) return
        const item = contextMenu.item
        closeMenu()

        try {
            const watched = await toggleWatched(item.type, item.id)
            showToast(watched
                ? t('grid:markedAsWatched', { title: item.title })
                : t('grid:markedAsUnwatched', { title: item.title }), 'success')
        } catch (error) {
            showToast(errorMessage(error, t('grid:failedToUpdateWatchStatus')), 'error')
        }
    }

    const handleRematched = (result: MatchResult) => {
        setRematchItem(null)
        showToast(result.title ? t('grid:matchedTo', { title: result.title }) : t('grid:rematched'), 'success')
        onChanged?.()
    }

    useEffect(() => {
        if (!contextMenu) return

        const handlePointerDown = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setContextMenu(null)
            }
        }
        const handleScroll = () => setContextMenu(null)
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation()
                closeMenu()
            }
        }

        document.addEventListener('mousedown', handlePointerDown)
        document.addEventListener('scroll', handleScroll, true)
        document.addEventListener('keydown', handleKeyDown, true)

        menuRef.current?.focus()

        return () => {
            document.removeEventListener('mousedown', handlePointerDown)
            document.removeEventListener('scroll', handleScroll, true)
            document.removeEventListener('keydown', handleKeyDown, true)
        }
    }, [contextMenu, closeMenu])

    const visibleItems = useMemo(() => {
        const start = virtualizer.startRow * virtualizer.columns
        const end = Math.min(items.length, virtualizer.endRow * virtualizer.columns)
        return items.slice(start, end)
    }, [items, virtualizer.startRow, virtualizer.endRow, virtualizer.columns])

    if (items.length === 0) {
        return (
            <div className="text-center text-gray-400 mt-20">
                {emptyMessage || <p>{t('grid:noContentFound')}</p>}
            </div>
        )
    }
    const menuIsBelowHiddenPoster = posterTitleMode === 'hidden'

    return (
        <>
            <div
                ref={gridRef}
                className={`grid gap-6 ${GRID_CLASSES[posterSize]}`}
                style={{ paddingTop: virtualizer.paddingTop, paddingBottom: virtualizer.paddingBottom }}
            >
                {visibleItems.map(item => (
                    <PosterCard
                        key={`${item.type}-${item.id}`}
                        item={item}
                        posterTitleMode={posterTitleMode}
                        posterSize={posterSize}
                        isMenuOpen={contextMenu?.item.id === item.id && contextMenu?.item.type === item.type}
                        onOpen={handleOpen}
                        onMenu={handleMenu}
                    />
                ))}
            </div>

            {contextMenu && (
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label={t('grid:actionsFor', { title: contextMenu.item.title })}
                    tabIndex={-1}
                    onKeyDown={(event) => {
                        const entries = Array.from(
                            event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])')
                        )
                        const current = entries.indexOf(document.activeElement as HTMLElement)
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                            event.preventDefault()
                            const next = event.key === 'ArrowDown'
                                ? entries[(current + 1) % entries.length]
                                : entries[(current - 1 + entries.length) % entries.length]
                            next?.focus()
                        } else if (event.key === 'Home') {
                            event.preventDefault()
                            entries[0]?.focus()
                        } else if (event.key === 'End') {
                            event.preventDefault()
                            entries[entries.length - 1]?.focus()
                        }
                    }}
                    className="fixed bg-white/50 backdrop-blur-md rounded-xl shadow-2xl py-1 z-50 w-[240px] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    {menuIsBelowHiddenPoster && (
                        <div className="px-4 py-2 border-b border-black/10">
                            <p className="text-sm text-gray-900 font-semibold truncate">{contextMenu.item.title}</p>
                        </div>
                    )}
                    <MenuItem onClick={() => { closeMenu(false); void openFileForItem(contextMenu.item) }} disabled={playing}>
                        <Play className="w-4 h-4" aria-hidden="true" />
                        {playing ? t('grid:playing') : t('common:play')}
                    </MenuItem>
                    <MenuItem onClick={handleToggleFavorite}>
                        <Heart
                            className={`w-4 h-4 ${isFavorite(contextMenu.item.type, contextMenu.item.id) ? 'fill-red-700 text-red-700' : ''}`}
                            aria-hidden="true"
                        />
                        {isFavorite(contextMenu.item.type, contextMenu.item.id) ? t('grid:removeFromFavorites') : t('grid:addToFavorites')}
                    </MenuItem>
                    <MenuItem onClick={handleToggleWatched}>
                        <Check
                            className={`w-4 h-4 ${isWatched(contextMenu.item.type, contextMenu.item.id) ? 'text-green-700' : ''}`}
                            strokeWidth={3}
                            aria-hidden="true"
                        />
                        {isWatched(contextMenu.item.type, contextMenu.item.id) ? t('grid:markAsUnwatched') : t('grid:markAsWatched')}
                    </MenuItem>
                    <MenuItem onClick={handleRefreshMetadata} disabled={refreshing}>
                        <RefreshCw className="w-4 h-4" aria-hidden="true" />
                        {refreshing ? t('grid:refreshing') : t('grid:refreshMetadata')}
                    </MenuItem>
                    <MenuItem onClick={handleRematchClick}>
                        <Repeat className="w-4 h-4" aria-hidden="true" />
                        {t('grid:rematch')}
                    </MenuItem>
                </div>
            )}

            {fileSelector && (
                <Modal
                    title={t('grid:selectVersion')}
                    onClose={() => setFileSelector(null)}
                    size="lg"
                    description={fileSelector.title}
                >
                    <div className="space-y-3">
                        {fileSelector.files.map(file => (
                            <button
                                key={file.id}
                                type="button"
                                onClick={() => {
                                    void playVideo(file, fileSelector.title, { ...fileSelector.history, filePath: file.filePath })
                                    setFileSelector(null)
                                }}
                                className="w-full text-left p-4 bg-white/30 hover:bg-white/50 rounded-lg transition-colors flex items-center gap-3"
                            >
                                <Play className="w-5 h-5 text-gray-900" aria-hidden="true" />
                                <span className="flex-1 min-w-0">
                                    <span className="block font-medium text-gray-900 truncate">{file.name}</span>
                                    <span className="block text-sm text-gray-700 truncate">{file.filePath}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </Modal>
            )}

            {episodeSelector && (
                <Modal
                    title={episodeSelector.name}
                    onClose={() => setEpisodeSelector(null)}
                    size="lg"
                    description={t('grid:selectEpisodeToPlay')}
                >
                    <div className="space-y-6">
                        {[...episodeSelector.seasons]
                            .sort((a, b) => a.seasonNumber - b.seasonNumber)
                            .map(season => {
                                const playable = [...season.episodes]
                                    .filter(episode => episode.videoFiles.length > 0)
                                    .sort((a, b) => a.episodeNumber - b.episodeNumber)

                                if (playable.length === 0) return null

                                return (
                                    <div key={season.seasonNumber}>
                                        <h3 className="text-lg font-bold mb-3 text-gray-900">{t('grid:seasonHeading', { number: season.seasonNumber })}</h3>
                                        <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                                            {playable.map(episode => (
                                                <button
                                                    key={`${episode.seasonNumber}-${episode.episodeNumber}`}
                                                    type="button"
                                                    onClick={() => handleEpisodePlay(episode, episodeSelector)}
                                                    aria-label={episode.name
                                                        ? t('grid:playEpisodeNamedAriaLabel', { season: episode.seasonNumber, episode: episode.episodeNumber, name: episode.name })
                                                        : t('grid:playEpisodeAriaLabel', { season: episode.seasonNumber, episode: episode.episodeNumber })}
                                                    className="aspect-square bg-black/20 hover:bg-black/30 rounded-full transition-colors flex items-center justify-center font-medium text-lg text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                >
                                                    {episode.episodeNumber}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )
                            })}
                    </div>
                </Modal>
            )}

            {rematchItem && (
                <RematchModal
                    mediaId={rematchItem.id}
                    mediaType={rematchItem.type}
                    currentTitle={rematchItem.title}
                    videoFiles={rematchItem.videoFiles}
                    onClose={() => setRematchItem(null)}
                    onMatched={handleRematched}
                />
            )}
        </>
    )
}

interface MenuItemProps {
    onClick: () => void
    disabled?: boolean
    children: React.ReactNode
}

const MenuItem: React.FC<MenuItemProps> = ({ onClick, disabled, children }) => (
    <button
        type="button"
        role="menuitem"
        onClick={onClick}
        disabled={disabled}
        className="w-full px-4 py-2 text-left hover:bg-black/10 transition-colors text-sm text-gray-900 font-medium disabled:opacity-50 flex items-center gap-2 focus:outline-none focus-visible:bg-black/10"
    >
        {children}
    </button>
)

const errorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback
