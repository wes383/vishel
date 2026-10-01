import { ipcMain, dialog, shell, app, BrowserWindow } from 'electron'
import axios from 'axios'
import store, { getSources } from './store'
import { getRedactedSettings, saveSettings, hydrateSourceConfig } from './settings'
import { scanMovies, getScanStatus, ScanProgress, ScanResult } from './scanner'
import { playVideo } from './player'
import {
    getAllMovies,
    getMovie,
    getAllTVShows,
    getTVShow,
    getHistory,
    addToHistory,
    deleteHistoryItem,
    getUnscannedFiles,
    getFavorites,
    addFavorite,
    removeFavorite,
    getMovieCount,
    getTVShowCount,
    saveMovie,
    saveTVShow,
    Movie,
    TVShow,
    Season,
    getAllWatchStatus,
    setWatchStatus,
    toggleWatchStatus
} from './db'
import { testConnection, listDirectory } from './webdavService'
import { testLocalConnection, listLocalDirectory } from './localFileService'
import { testConnection as testSMBConnection, listDirectory as listSMBDirectory } from './smbService'
import { getMovieDetails, getTVShowDetails, getSeasonDetails, pickLogos } from './tmdbService'
import { probeVideoMetadata } from './mediaProbe'
import { checkForUpdates, downloadUpdate, initAutoUpdater } from './updater'

/** Only web links may leave the app through the OS handler. */
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])

const IMDB_RATING_URL = 'https://imdb-ratings-ten.vercel.app/api/rating'
const IMDB_ID_PATTERN = /^tt\d{7,9}$/

const broadcast = (channel: string, payload: unknown) => {
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
            window.webContents.send(channel, payload)
        }
    }
}

let scanController: AbortController | null = null

const runScan = async (forceRefresh: boolean): Promise<ScanResult> => {
    if (getScanStatus()) {
        return { status: 'skipped', newMovies: 0, newTVShows: 0, prunedFiles: 0, unscannedFiles: 0, failedSources: [] }
    }

    scanController = new AbortController()
    const signal = scanController.signal

    try {
        return await scanMovies((progress: ScanProgress) => broadcast('scan-progress', progress), forceRefresh, signal)
    } finally {
        scanController = null
    }
}

export const setupIpcHandlers = () => {
    // Settings - credentials never cross the IPC boundary
    ipcMain.handle('get-settings', () => getRedactedSettings())
    ipcMain.handle('save-settings', (_, settings) => saveSettings(settings))

    ipcMain.handle('get-library-stats', async () => {
        return {
            movies: getMovieCount(),
            tvShows: getTVShowCount()
        }
    })


    // Data Sources
    ipcMain.handle('test-connection', async (_, payload) => {
        const config = hydrateSourceConfig(payload, payload?.id)
        if (config.type === 'local') {
            return await testLocalConnection(config)
        } else if (config.type === 'smb') {
            return await testSMBConnection(config)
        }
        return await testConnection(config)
    })

    ipcMain.handle('list-directory', async (_, { config, path, sourceId }) => {
        const resolved = hydrateSourceConfig(config, sourceId ?? config?.id)
        if (resolved.type === 'local') {
            return await listLocalDirectory(resolved, path)
        } else if (resolved.type === 'smb') {
            const smbFiles = await listSMBDirectory(resolved, path)
            return smbFiles.map(file => ({
                filename: path ? `${path}/${file.name}` : `/${file.name}`,
                basename: file.name,
                lastmod: file.lastModified.toISOString(),
                size: file.size,
                type: file.type
            }))
        }
        return await listDirectory(resolved, path)
    })


    // Library
    ipcMain.handle('scan-library', async (_, forceRefresh: boolean = false) => {
        console.log(`IPC: scan-library called (forceRefresh: ${forceRefresh})`)
        try {
            const result = await runScan(forceRefresh)
            console.log('IPC: scan-library finished')
            return result
        } catch (error) {
            console.error('IPC: scan-library failed', error)
            throw error
        }
    })

    // Full rescan
    ipcMain.handle('full-rescan-library', async () => {
        console.log('IPC: full-rescan-library called')
        try {
            const result = await runScan(true)
            console.log('IPC: full-rescan-library finished')
            return result
        } catch (error) {
            console.error('IPC: full-rescan-library failed', error)
            throw error
        }
    })

    ipcMain.handle('cancel-scan', () => {
        scanController?.abort()
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

                const cast = details.credits?.cast?.slice(0, 10).map(c => ({
                    name: c.name,
                    character: c.character ?? '',
                    profilePath: c.profile_path ?? ''
                })) || []

                const director = details.credits?.crew?.filter(c => c.job === 'Director').map(d => ({
                    name: d.name,
                    profilePath: d.profile_path ?? null
                })) || []

                const { localized: logoPath, english: logoPathEn } = pickLogos(details.images)

                const updatedMovie: Movie = {
                    ...existingMovie,
                    title: details.title,
                    posterPath: details.poster_path ?? '',
                    backdropPath: details.backdrop_path ?? '',
                    logoPath,
                    logoPathEn,
                    overview: details.overview,
                    releaseDate: details.release_date ?? '',
                    genres: details.genres?.map(g => g.name) || [],
                    runtime: details.runtime ?? undefined,
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

                const cast = details.credits?.cast?.slice(0, 10).map(c => ({
                    name: c.name,
                    character: c.character ?? '',
                    profilePath: c.profile_path ?? ''
                })) || []

                const createdBy = details.created_by?.map(c => ({
                    name: c.name,
                    profilePath: c.profile_path ?? ''
                })) || []

                const { localized: logoPath, english: logoPathEn } = pickLogos(details.images)

                // Refresh season and episode metadata
                const updatedSeasons: Season[] = []
                for (const season of existingShow.seasons) {
                    const seasonDetails = await getSeasonDetails(mediaId, season.seasonNumber)
                    if (seasonDetails) {
                        const updatedEpisodes = season.episodes.map(ep => {
                            const epDetails = seasonDetails.episodes?.find(e => e.episode_number === ep.episodeNumber)
                            if (epDetails) {
                                return {
                                    ...ep,
                                    name: epDetails.name ?? '',
                                    overview: epDetails.overview ?? '',
                                    stillPath: epDetails.still_path ?? ''
                                }
                            }
                            return ep
                        })

                        updatedSeasons.push({
                            ...season,
                            name: seasonDetails.name ?? '',
                            posterPath: seasonDetails.poster_path ?? '',
                            episodes: updatedEpisodes
                        })
                    } else {
                        updatedSeasons.push(season)
                    }
                }

                const updatedShow: TVShow = {
                    ...existingShow,
                    name: details.name,
                    posterPath: details.poster_path ?? '',
                    backdropPath: details.backdrop_path ?? '',
                    logoPath,
                    logoPathEn,
                    overview: details.overview,
                    firstAirDate: details.first_air_date ?? '',
                    genres: details.genres?.map(g => g.name) || [],
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
        const sources = getSources()

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
        let autoMarked = false
        if (history) {
            addToHistory({
                ...history,
                id: crypto.randomUUID(),
                timestamp: Date.now()
            })

            // Auto mark as watched based on settings
            const autoMarkWatchedEnabled = store.get('autoMarkWatchedEnabled')
            if (autoMarkWatchedEnabled) {
                const autoMarkWatchedScope = store.get('autoMarkWatchedScope')
                const shouldMark = autoMarkWatchedScope === 'all' ||
                    (autoMarkWatchedScope === 'movies' && history.mediaType === 'movie')

                if (shouldMark) {
                    setWatchStatus(history.mediaId, history.mediaType, true)
                    autoMarked = true
                }
            }
        }
        await playVideo(url, title)
        return { autoMarked }
    })

    ipcMain.handle('detect-players', async () => {
        const { detectPlayers } = await import('./playerDetector')
        return detectPlayers()
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
        let protocol: string
        try {
            protocol = new URL(url).protocol
        } catch {
            console.warn(`Blocked open-external for malformed URL: ${url}`)
            return false
        }

        if (!ALLOWED_EXTERNAL_PROTOCOLS.has(protocol)) {
            console.warn(`Blocked open-external for protocol: ${protocol}`)
            return false
        }

        await shell.openExternal(url)
        return true
    })

    ipcMain.handle('get-imdb-rating', async (_, imdbId: string) => {
        if (typeof imdbId !== 'string' || !IMDB_ID_PATTERN.test(imdbId)) {
            return null
        }

        try {
            const response = await axios.get(IMDB_RATING_URL, {
                params: { imdbId },
                timeout: 8000
            })
            const data = response.data
            if (!data?.rating || !data?.numVotes) return null
            return {
                rating: parseFloat(data.rating),
                votes: parseInt(String(data.numVotes).replace(/,/g, ''), 10)
            }
        } catch (error) {
            console.warn('Failed to fetch IMDb rating:', (error as Error).message)
            return null
        }
    })

    ipcMain.handle('probe-video-metadata', async (_, payload: { url: string; sourceId?: string }) => {
        const enabled = store.get('probeVideoMetadataEnabled')
        if (enabled === false) {
            console.log('[probeVideoMetadata] Disabled by settings, skipping')
            return null
        }
        return probeVideoMetadata(payload)
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
        await manualMatchFile(fileId, tmdbId, mediaType, episodeInfo)
        // A resolved promise is the only success signal these modules have; make it explicit so
        // the dialog cannot close on a failed match.
        return { success: true, mediaId: tmdbId, mediaType }
    })

    // Rematch
    ipcMain.handle('rematch-media', async (_, { oldTmdbId, newTmdbId, mediaType }) => {
        const { rematchMedia } = await import('./rematch')
        await rematchMedia(oldTmdbId, newTmdbId, mediaType)
        return { success: true, mediaId: newTmdbId, mediaType }
    })

    ipcMain.handle('rematch-single-file', async (_, { oldTmdbId, oldMediaType, fileId, newTmdbId, newMediaType, episodeInfo }) => {
        const { rematchSingleFile } = await import('./rematchFile')
        await rematchSingleFile(oldTmdbId, oldMediaType, fileId, newTmdbId, newMediaType, episodeInfo)
        return { success: true, mediaId: newTmdbId, mediaType: newMediaType }
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

    ipcMain.handle('get-app-version', () => {
        return app.getVersion()
    })

    // Watch Status
    ipcMain.handle('get-all-watch-status', async () => {
        return getAllWatchStatus()
    })

    ipcMain.handle('toggle-watch-status', async (_, { mediaId, mediaType }) => {
        return toggleWatchStatus(mediaId, mediaType)
    })

    // Updates
    ipcMain.handle('check-for-updates', async () => checkForUpdates())

    ipcMain.handle('download-update', async () => downloadUpdate())

    initAutoUpdater(status => broadcast('update-status', status))
}
