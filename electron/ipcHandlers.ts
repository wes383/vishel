import { ipcMain, dialog, shell } from 'electron'
import store from './store'
import { scanMovies, getScanStatus } from './scanner'
import { playVideo } from './player'
import { getDb } from './db'
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
    ipcMain.handle('scan-library', async () => {
        console.log('IPC: scan-library called')
        try {
            await scanMovies()
            console.log('IPC: scan-library finished')
            return true
        } catch (error) {
            console.error('IPC: scan-library failed', error)
            throw error
        }
    })

    ipcMain.handle('get-scan-status', () => {
        return getScanStatus()
    })

    ipcMain.handle('get-movies', async () => {
        const db = await getDb()
        return db.data.movies
    })

    ipcMain.handle('get-movie', async (_, id) => {
        const db = await getDb()
        return db.data.movies.find(m => m.id === id)
    })

    ipcMain.handle('get-tv-shows', async () => {
        const db = await getDb()
        return db.data.tvShows || []
    })

    ipcMain.handle('get-tv-show', async (_, id) => {
        const db = await getDb()
        return db.data.tvShows?.find(s => s.id === id)
    })

    ipcMain.handle('get-unscanned-files', async () => {
        const db = await getDb()
        return db.data.unscannedFiles || []
    })

    // Player
    ipcMain.handle('play-video', async (_, { url, title }) => {
        await playVideo(url, title)
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
}
