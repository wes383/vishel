import { ipcMain, dialog, shell } from 'electron'
import store from './store'
import { scanMovies, getScanStatus } from './scanner'
import { playVideo } from './player'
import { getAllMovies, getMovie, getAllTVShows, getTVShow, getHistory, addToHistory, deleteHistoryItem, getUnscannedFiles, getFavorites, addFavorite, removeFavorite, isFavorite, getMovieCount, getTVShowCount, saveMovie, saveTVShow } from './db'
import { testConnection, listDirectory } from './webdavService'
import { testLocalConnection, listLocalDirectory } from './localFileService'
import { testConnection as testSMBConnection, listDirectory as listSMBDirectory } from './smbService'
import { getImdbDbStatus } from './imdbDatabase'
import { getMovieDetails, getTVShowDetails, getSeasonDetails } from './tmdbService'

export const setupIpcHandlers = () => {
    // Settings
    ipcMain.handle('get-settings', () => store.store)
    ipcMain.handle('save-settings', (_, settings) => {
        store.set(settings)
        return true
    })

    ipcMain.handle('get-library-stats', async () => {
        return {
            movies: getMovieCount(),
            tvShows: getTVShowCount()
        }
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
    
    // Refresh metadata
    ipcMain.handle('refresh-metadata', async (_, { mediaId, mediaType }: { mediaId: number, mediaType: 'movie' | 'tv' }) => {
        try {
            if (mediaType === 'movie') {
                const existingMovie = getMovie(mediaId)
                if (!existingMovie) throw new Error('Movie not found')
                
                const details = await getMovieDetails(mediaId)
                if (!details) throw new Error('Failed to fetch movie details from TMDB')
                
                const cast = details.credits?.cast?.slice(0, 10).map((c: any) => ({
                    name: c.name,
                    character: c.character,
                    profilePath: c.profile_path
                })) || []
                
                const director = details.credits?.crew?.filter((c: any) => c.job === 'Director').map((d: any) => ({
                    name: d.name,
                    profilePath: d.profile_path
                })) || []
                
                const logoPath = details.images?.logos?.find((l: any) => l.iso_639_1 === 'en')?.file_path || null
                
                const updatedMovie = {
                    ...existingMovie,
                    title: details.title,
                    posterPath: details.poster_path,
                    backdropPath: details.backdrop_path,
                    logoPath,
                    overview: details.overview,
                    releaseDate: details.release_date,
                    genres: details.genres?.map((g: any) => g.name) || [],
                    runtime: details.runtime,
                    voteAverage: details.vote_average,
                    popularity: details.popularity,
                    tagline: details.tagline,
                    status: details.status,
                    cast,
                    director,
                    externalIds: {
                        imdb_id: details.external_ids?.imdb_id,
                        tvdb_id: details.external_ids?.tvdb_id
                    }
                }
                
                saveMovie(updatedMovie)
                return { success: true }
            } else {
                const existingShow = getTVShow(mediaId)
                if (!existingShow) throw new Error('TV show not found')
                
                const details = await getTVShowDetails(mediaId)
                if (!details) throw new Error('Failed to fetch TV show details from TMDB')
                
                const cast = details.credits?.cast?.slice(0, 10).map((c: any) => ({
                    name: c.name,
                    character: c.character,
                    profilePath: c.profile_path
                })) || []
                
                const createdBy = details.created_by?.map((c: any) => ({
                    name: c.name,
                    profilePath: c.profile_path
                })) || []
                
                const logoPath = details.images?.logos?.find((l: any) => l.iso_639_1 === 'en')?.file_path || null
                
                // Refresh season and episode metadata
                const updatedSeasons = []
                for (const season of existingShow.seasons) {
                    const seasonDetails = await getSeasonDetails(mediaId, season.seasonNumber)
                    if (seasonDetails) {
                        const updatedEpisodes = season.episodes.map(ep => {
                            const epDetails = seasonDetails.episodes?.find((e: any) => e.episode_number === ep.episodeNumber)
                            if (epDetails) {
                                return {
                                    ...ep,
                                    name: epDetails.name,
                                    overview: epDetails.overview,
                                    stillPath: epDetails.still_path
                                }
                            }
                            return ep
                        })
                        
                        updatedSeasons.push({
                            ...season,
                            name: seasonDetails.name,
                            posterPath: seasonDetails.poster_path,
                            episodes: updatedEpisodes
                        })
                    } else {
                        updatedSeasons.push(season)
                    }
                }
                
                const updatedShow = {
                    ...existingShow,
                    name: details.name,
                    posterPath: details.poster_path,
                    backdropPath: details.backdrop_path,
                    logoPath,
                    overview: details.overview,
                    firstAirDate: details.first_air_date,
                    genres: details.genres?.map((g: any) => g.name) || [],
                    voteAverage: details.vote_average,
                    popularity: details.popularity,
                    status: details.status,
                    cast,
                    createdBy,
                    seasons: updatedSeasons,
                    externalIds: {
                        imdb_id: details.external_ids?.imdb_id,
                        tvdb_id: details.external_ids?.tvdb_id
                    }
                }
                
                saveTVShow(updatedShow)
                return { success: true }
            }
        } catch (error) {
            console.error('Failed to refresh metadata:', error)
            throw error
        }
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
    ipcMain.handle('search-tmdb', async (_, { query, type, page }) => {
        if (type === 'movie') {
            const { searchMovie } = await import('./tmdbService')
            return await searchMovie(query, undefined, page)
        } else {
            const { searchTVShow } = await import('./tmdbService')
            return await searchTVShow(query, undefined, page)
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

    // Rematch
    ipcMain.handle('rematch-media', async (_, { oldTmdbId, newTmdbId, mediaType }) => {
        const { rematchMedia } = await import('./rematch')
        return await rematchMedia(oldTmdbId, newTmdbId, mediaType)
    })

    ipcMain.handle('rematch-single-file', async (_, { oldTmdbId, oldMediaType, fileId, newTmdbId, newMediaType, episodeInfo }) => {
        const { rematchSingleFile } = await import('./rematchFile')
        return await rematchSingleFile(oldTmdbId, oldMediaType, fileId, newTmdbId, newMediaType, episodeInfo)
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
