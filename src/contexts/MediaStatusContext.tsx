import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { FavoriteItem, WatchStatus } from '../../electron/db'
import type { MediaType } from '../types/ipc'

export const mediaKey = (mediaType: MediaType, mediaId: number) => `${mediaType}-${mediaId}`

interface MediaStatusApi {
    favorites: FavoriteItem[]
    watchStatus: Record<string, WatchStatus>
    isFavorite: (mediaType: MediaType, mediaId: number) => boolean
    isWatched: (mediaType: MediaType, mediaId: number) => boolean
    statusTimestamp: (mediaType: MediaType, mediaId: number) => number
    toggleFavorite: (item: { mediaId: number, mediaType: MediaType, title: string }) => Promise<boolean>
    toggleWatched: (mediaType: MediaType, mediaId: number) => Promise<boolean>
    refresh: () => Promise<void>
}

const MediaStatusContext = createContext<MediaStatusApi | null>(null)

/**
 * Favorite and watched state was duplicated across the library page and every grid/menu
 * copy of it, so editing one left the others showing stale check marks. One cache, one API.
 */
export function MediaStatusProvider({ children }: { children: React.ReactNode }) {
    const [favorites, setFavorites] = useState<FavoriteItem[]>([])
    const [watchList, setWatchList] = useState<WatchStatus[]>([])

    const refresh = useCallback(async () => {
        try {
            const [favoriteRows, statusRows] = await Promise.all([
                window.electron.ipcRenderer.invoke('get-favorites'),
                window.electron.ipcRenderer.invoke('get-all-watch-status')
            ])
            setFavorites(favoriteRows || [])
            setWatchList(statusRows || [])
        } catch (error) {
            console.error('Failed to load favorite and watch status:', error)
        }
    }, [])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const watchStatus = useMemo(() => {
        const map: Record<string, WatchStatus> = {}
        for (const row of watchList) {
            map[mediaKey(row.mediaType, row.mediaId)] = row
        }
        return map
    }, [watchList])

    const favoriteKeys = useMemo(
        () => new Set(favorites.map(item => mediaKey(item.mediaType, item.mediaId))),
        [favorites]
    )

    const isFavorite = useCallback(
        (mediaType: MediaType, mediaId: number) => favoriteKeys.has(mediaKey(mediaType, mediaId)),
        [favoriteKeys]
    )

    const isWatched = useCallback(
        (mediaType: MediaType, mediaId: number) => Boolean(watchStatus[mediaKey(mediaType, mediaId)]?.watched),
        [watchStatus]
    )

    /** Newest of the favorite/watched timestamps, used by the "recently added" ordering. */
    const statusTimestamp = useCallback((mediaType: MediaType, mediaId: number) => {
        const key = mediaKey(mediaType, mediaId)
        const watched = watchStatus[key]?.watched ? watchStatus[key].timestamp : 0
        const favorite = favorites.find(item => mediaKey(item.mediaType, item.mediaId) === key)?.timestamp || 0
        return Math.max(watched, favorite)
    }, [watchStatus, favorites])

    const toggleFavorite = useCallback(async (item: { mediaId: number, mediaType: MediaType, title: string }) => {
        const wasFavorite = isFavorite(item.mediaType, item.mediaId)
        const payload = { mediaId: item.mediaId, mediaType: item.mediaType }

        if (wasFavorite) {
            await window.electron.ipcRenderer.invoke('remove-favorite', payload)
        } else {
            await window.electron.ipcRenderer.invoke('add-favorite', item)
        }

        await refresh()
        return !wasFavorite
    }, [isFavorite, refresh])

    const toggleWatched = useCallback(async (mediaType: MediaType, mediaId: number) => {
        const watched = await window.electron.ipcRenderer.invoke('toggle-watch-status', { mediaId, mediaType })
        await refresh()
        return watched
    }, [refresh])

    const api = useMemo(() => ({
        favorites,
        watchStatus,
        isFavorite,
        isWatched,
        statusTimestamp,
        toggleFavorite,
        toggleWatched,
        refresh
    }), [favorites, watchStatus, isFavorite, isWatched, statusTimestamp, toggleFavorite, toggleWatched, refresh])

    return <MediaStatusContext.Provider value={api}>{children}</MediaStatusContext.Provider>
}

export const useMediaStatus = (): MediaStatusApi => {
    const context = useContext(MediaStatusContext)
    if (!context) throw new Error('useMediaStatus must be used inside <MediaStatusProvider>')
    return context
}
