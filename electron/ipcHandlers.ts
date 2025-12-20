import { ipcMain, dialog, shell } from 'electron'
import store from './store'
import { scanMovies, getScanStatus } from './scanner'
import { playVideo } from './player'
import { getAllMovies, getMovie, getAllTVShows, getTVShow, getHistory, addToHistory, deleteHistoryItem, getUnscannedFiles, getFavorites, addFavorite, removeFavorite, isFavorite } from './db'
import { testConnection, listDirectory } from './webdavService'
import { testLocalConnection, listLocalDirectory } from './localFileService'
import { testConnection as testSMBConnection, listDirectory as listSMBDirectory } from './smbService'
import { getImdbDbStatus } from './imdbDatabase'

export const setupIpcHandlers = () => {
    // Settings
    ipcMain.handle('get-settings', () => store.store)
    ipcMain.handle('save-settings', (_, settings) => {
        store.set(settings)
        return true
    })

    // Data Sources
    ipcMain.handle('test-connection', async (_, config) => {
        if (config.type === 'local' || config.path) {
            return await testLocalConnection(config)
        } else if (config.type === 'smb') {
            return await testSMBConnection(config)
        }
        return await testConnection(config)
    })

    ipcMain.handle('list-directory', async (_, { config, path }) => {
        if (config.type === 'local' || config.path) {
            return await listLocalDirectory(config, path)
        } else if (config.type === 'smb') {
            const smbFiles = await listSMBDirectory(config, path)
            return smbFiles.map(file => ({
                filename: path ? `${path}/${file.name}` : `/${file.name}`,
                basename: file.name,
                lastmod: file.lastModified.toISOString(),
                size: file.size,
                type: file.type
            }))
        }
        return await listDirectory(config, path)
    })


    // Library
    ipcMain.handle('scan-library', async (_, forceRefresh: boolean = false) => {
        console.log(`IPC: scan-library called (forceRefresh: ${forceRefresh})`)
        try {
            await scanMovies(undefined, forceRefresh)
            console.log('IPC: scan-library finished')
            return true
        } catch (error) {
            console.error('IPC: scan-library failed', error)
            throw error
        }
    })

    // Full rescan
    ipcMain.handle('full-rescan-library', async () => {
        console.log('IPC: full-rescan-library called')
        try {
            await scanMovies(undefined, true)
            console.log('IPC: full-rescan-library finished')
            return true
        } catch (error) {
            console.error('IPC: full-rescan-library failed', error)
            throw error
        }
    })

    ipcMain.handle('get-scan-status', () => {
        return getScanStatus()
    })

    ipcMain.handle('get-movies', async () => {
        return getAllMovies()
    })

    ipcMain.handle('get-movie', async (_, id) => {
        return getMovie(id)
    })

    ipcMain.handle('get-tv-shows', async () => {
        return getAllTVShows()
    })

    ipcMain.handle('get-tv-show', async (_, id) => {
        return getTVShow(id)
    })

    ipcMain.handle('get-unscanned-files', async () => {
        const files = getUnscannedFiles()
        const sources = store.get('sources') as any[] || []

        return files.map(file => {
            const source = sources.find(s => s.id === file.sourceId)
            return {
                ...file,
                sourceName: source ? source.name : 'Unknown Source'
            }
        })
    })

    // Player
    ipcMain.handle('play-video', async (_, { url, title, history }) => {
        if (history) {
            addToHistory({
                ...history,
                id: crypto.randomUUID(),
                timestamp: Date.now()
            })
        }
        await playVideo(url, title)
    })

    ipcMain.handle('get-history', async () => {
        return getHistory()
    })

    ipcMain.handle('delete-history-item', async (_, historyId: string) => {
        deleteHistoryItem(historyId)
        return true
    })

    // Dialogs
    ipcMain.handle('open-directory-dialog', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory']
        })
        if (result.canceled) {
            return null
        }
        return result.filePaths[0]
    })

    // System
    ipcMain.handle('open-external', async (_, url) => {
        await shell.openExternal(url)
    })

    // IMDb Database
    ipcMain.handle('get-imdb-db-status', async () => {
        return getImdbDbStatus()
    })

    // Manual Match
    ipcMain.handle('search-tmdb', async (_, { query, type }) => {
        if (type === 'movie') {
            const { searchMovie } = await import('./tmdbService')
            return await searchMovie(query)
        } else {
            const { searchTVShow } = await import('./tmdbService')
            return await searchTVShow(query)
        }
    })

    ipcMain.handle('manual-match-file', async (_, { fileId, tmdbId, mediaType, episodeInfo }) => {
        const { manualMatchFile } = await import('./manualMatch')
        return await manualMatchFile(fileId, tmdbId, mediaType, episodeInfo)
    })

    ipcMain.handle('delete-unscanned-file', async (_, fileId: string) => {
        const { deleteUnscannedFile } = await import('./db')
        deleteUnscannedFile(fileId)
        return true
    })

    // Favorites
    ipcMain.handle('get-favorites', async () => {
        return getFavorites()
    })

    ipcMain.handle('add-favorite', async (_, item) => {
        addFavorite({
            ...item,
            id: crypto.randomUUID(),
            timestamp: Date.now()
        })
        return true
    })

    ipcMain.handle('remove-favorite', async (_, { mediaId, mediaType }) => {
        removeFavorite(mediaId, mediaType)
        return true
    })

    ipcMain.handle('is-favorite', async (_, { mediaId, mediaType }) => {
        return isFavorite(mediaId, mediaType)
    })
}
