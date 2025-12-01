import { getDb, saveMovie, saveTVShow, addUnscannedFile, clearUnscannedFiles, getAllMovies, getAllTVShows, deleteEmptyMovies, deleteEmptyTVShows, Movie, TVShow, VideoFile } from './db'
import { searchMovie, getMovieDetails, searchTVShow, getTVShowDetails, getSeasonDetails } from './tmdbService'
import { listDirectory } from './webdavService'
import { listLocalDirectory } from './localFileService'
import { listDirectory as listSMBDirectory } from './smbService'
import store, { DataSource } from './store'
import path from 'node:path'
import { getImdbRating, downloadAndImportImdbRatings } from './imdbDatabase'

const cleanFilename = (filename: string): { name: string, year?: number } => {
    let name = path.parse(filename).name
    name = name.replace(/[\.\-_]/g, ' ')

    let year: number | undefined
    const yearMatch = name.match(/\b(19|20)\d{2}\b/)
    if (yearMatch && yearMatch.index && yearMatch.index > 0) {
        year = parseInt(yearMatch[0])
        name = name.substring(0, yearMatch.index)
    }

    name = name.replace(/\b(1080p|720p|4k|2160p|bluray|webdl|x264|x265|hevc|aac|ac3|dts|truehd)\b/gi, '')
    name = name.replace(/[\[\(\{].*?[\]\}\)]/g, '')

    return { name: name.trim(), year }
}

const isVideoFile = (filename: string): boolean => {
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv']
    return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext))
}

interface EpisodeInfo {
    name: string
    season: number
    episode: number
}

const parseEpisodeInfo = (filename: string): EpisodeInfo | null => {
    const name = path.parse(filename).name
    const regex = /(.*)[ ._-]+[sS](\d+)[eE](\d+)|(.*)[ ._-]+(\d+)x(\d+)/
    const match = name.match(regex)

    if (match) {
        const showName = (match[1] || match[4]).replace(/[\.\-_]/g, ' ').trim()
        const season = parseInt(match[2] || match[5])
        const episode = parseInt(match[3] || match[6])
        return { name: showName, season, episode }
    }
    return null
}

const createVideoFile = (source: DataSource, filename: string): VideoFile => {
    let webdavUrl = ''
    if (source.type === 'webdav') {
        webdavUrl = `${source.config.url}${filename}`
    } else if (source.type === 'smb') {
        // For SMB, use Windows UNC path format
        const sharePath = source.config.share?.replace(/\\/g, '/')
        webdavUrl = `${sharePath}${filename}`
    } else {
        webdavUrl = filename
    }

    return {
        id: `${source.id}:${filename}`,
        name: path.basename(filename),
        filePath: filename,
        webdavUrl,
        sourceId: source.id
    }
}

interface ScanState {
    newMovies: Map<number, Movie>
    currentMovies: Movie[]
    newTVShows: Map<number, TVShow>
    currentTVShows: TVShow[]
    seasonDetailsCache: Map<string, any>
    pendingMovies: Map<number, Promise<void>>
    pendingTVShows: Map<number, Promise<void>>
    pendingSeasons: Map<string, Promise<void>>
    unscannedFiles: VideoFile[]

    // Incremental scan tracking
    foundFilePaths: Set<string>
    fileMap: Map<string, { type: 'movie', object: Movie, file: VideoFile } | { type: 'episode', object: TVShow, file: VideoFile }>
    dirtyIds: Set<number> // IDs of movies/shows that need saving
    forceRefresh: boolean // Force re-fetch metadata from TMDB
}

const scanDirectoryRecursive = async (
    source: DataSource,
    dirPath: string,
    state: ScanState
) => {
    console.log(`Scanning directory: ${dirPath} in source ${source.name}`)
    try {
        let items: any[] = []
        if (source.type === 'webdav') {
            items = await listDirectory(source.config, dirPath)
        } else if (source.type === 'local') {
            items = await listLocalDirectory(source.config, dirPath)
        } else if (source.type === 'smb') {
            const smbItems = await listSMBDirectory(source.config, dirPath)
            items = smbItems.map(item => ({
                filename: path.posix.join(dirPath, item.name),
                type: item.type,
                size: item.size
            }))
        }

        const tasks = items.map(async (item) => {
            let targetPath = item.filename

            if (item.type === 'directory') {
                try {
                    await scanDirectoryRecursive(source, targetPath, state)
                } catch (err) {
                    if (source.type === 'webdav' || source.type === 'smb') {
                        console.warn(`Failed to scan subdirectory ${targetPath} with raw path. Retrying with decoded path...`)
                        try {
                            const decodedPath = decodeURIComponent(item.filename)
                            if (decodedPath !== item.filename) {
                                await scanDirectoryRecursive(source, decodedPath, state)
                            } else {
                                throw err
                            }
                        } catch (retryErr) {
                            console.error(`Failed to scan subdirectory ${targetPath}:`, retryErr)
                        }
                    } else {
                        console.error(`Failed to scan subdirectory ${targetPath}:`, err)
                    }
                }
            } else if (item.type === 'file' && isVideoFile(item.filename)) {
                state.foundFilePaths.add(item.filename)

                // Check if file is already known
                const existing = state.fileMap.get(item.filename)
                if (existing && !state.forceRefresh) {
                    // Update WebDAV URL in case config changed
                    const newFile = createVideoFile(source, item.filename)
                    if (existing.file.webdavUrl !== newFile.webdavUrl) {
                        existing.file.webdavUrl = newFile.webdavUrl
                        state.dirtyIds.add(existing.object.id)
                    }
                    return // Skip processing
                }

                const episodeInfo = parseEpisodeInfo(item.filename)

                const findBestMatch = (results: any[], fileYear?: number): any => {
                    if (!results || results.length === 0) return null
                    if (!fileYear) return results[0]
                    const validResults = results.filter((show: any) => {
                        if (!show.first_air_date) return true
                        const showYear = parseInt(show.first_air_date.split('-')[0])
                        return showYear <= fileYear
                    })
                    if (validResults.length === 0) return results[0]

                    return validResults[0]
                }

                if (episodeInfo) {
                    // Handle TV Show
                    const { year } = cleanFilename(item.filename)
                    console.log(`Processing TV Show: ${item.filename} -> ${episodeInfo.name} S${episodeInfo.season}E${episodeInfo.episode} (${year || 'no year'})`)

                    try {
                        const searchYear = episodeInfo.season === 1 ? year : undefined
                        const searchResults = await searchTVShow(episodeInfo.name, searchYear)

                        if (searchResults && searchResults.length > 0) {
                            const bestMatch = findBestMatch(searchResults, year)
                            const tvId = bestMatch.id

                            // Check if show exists in current or new
                            let tvShow = state.currentTVShows.find(s => s.id === tvId) || state.newTVShows.get(tvId)

                            if (!tvShow) {
                                if (state.pendingTVShows.has(tvId)) {
                                    await state.pendingTVShows.get(tvId)
                                    tvShow = state.newTVShows.get(tvId)
                                } else {
                                    const processPromise = (async () => {
                                        const details = await getTVShowDetails(tvId)
                                        if (details) {
                                            const cast = details.credits?.cast?.slice(0, 10).map((c: any) => ({
                                                name: c.name,
                                                character: c.character,
                                                profilePath: c.profile_path
                                            }))
                                            const createdBy = details.created_by?.map((c: any) => ({
                                                name: c.name,
                                                profilePath: c.profile_path
                                            }))

                                            const logoPath = details.images?.logos?.find((l: any) => l.iso_639_1 === 'en')?.file_path

                                            let imdbRating: number | undefined
                                            let imdbVotes: number | undefined
                                            if (details.external_ids?.imdb_id) {
                                                const imdbData = getImdbRating(details.external_ids.imdb_id)
                                                if (imdbData) {
                                                    imdbRating = imdbData.rating
                                                    imdbVotes = imdbData.votes
                                                }
                                            }

                                            const newShow: TVShow = {
                                                id: details.id,
                                                name: details.name,
                                                logoPath: logoPath || '',
                                                posterPath: details.poster_path,
                                                backdropPath: details.backdrop_path,
                                                overview: details.overview,
                                                firstAirDate: details.first_air_date,
                                                sourceId: source.id,
                                                genres: details.genres?.map((g: any) => g.name),
                                                voteAverage: details.vote_average,
                                                popularity: details.popularity,
                                                imdbRating,
                                                imdbVotes,
                                                status: details.status,
                                                cast,
                                                createdBy,
                                                seasons: [],
                                                externalIds: details.external_ids
                                            }
                                            state.newTVShows.set(tvId, newShow)
                                        }
                                    })()
                                    state.pendingTVShows.set(tvId, processPromise)
                                    await processPromise
                                    state.pendingTVShows.delete(tvId)
                                    tvShow = state.newTVShows.get(tvId)
                                }
                            }

                            if (tvShow) {
                                const seasonCacheKey = `${tvId}:${episodeInfo.season}`
                                let season = tvShow.seasons.find(s => s.seasonNumber === episodeInfo.season)

                                if (!season) {
                                    if (state.pendingSeasons.has(seasonCacheKey)) {
                                        await state.pendingSeasons.get(seasonCacheKey)
                                        season = tvShow.seasons.find(s => s.seasonNumber === episodeInfo.season)
                                    } else {
                                        const seasonPromise = (async () => {
                                            if (!state.seasonDetailsCache.has(seasonCacheKey)) {
                                                try {
                                                    const details = await getSeasonDetails(tvId, episodeInfo.season)
                                                    if (details) {
                                                        state.seasonDetailsCache.set(seasonCacheKey, details)
                                                    }
                                                } catch (e) {
                                                    console.warn(`Failed to fetch season details for ${tvId} S${episodeInfo.season}`)
                                                }
                                            }
                                            const seasonDetails = state.seasonDetailsCache.get(seasonCacheKey)

                                            const newSeason = {
                                                seasonNumber: episodeInfo.season,
                                                name: seasonDetails?.name || `Season ${episodeInfo.season}`,
                                                posterPath: seasonDetails?.poster_path || '',
                                                episodes: []
                                            }
                                            tvShow!.seasons.push(newSeason)
                                        })()
                                        state.pendingSeasons.set(seasonCacheKey, seasonPromise)
                                        await seasonPromise
                                        state.pendingSeasons.delete(seasonCacheKey)
                                        season = tvShow.seasons.find(s => s.seasonNumber === episodeInfo.season)
                                    }
                                }

                                if (season) {
                                    const seasonDetails = state.seasonDetailsCache.get(seasonCacheKey)
                                    const episodeMeta = seasonDetails?.episodes?.find((e: any) => e.episode_number === episodeInfo.episode)

                                    let episode = season.episodes.find(e => e.episodeNumber === episodeInfo.episode)
                                    if (!episode) {
                                        episode = {
                                            id: episodeMeta?.id || 0,
                                            episodeNumber: episodeInfo.episode,
                                            seasonNumber: episodeInfo.season,
                                            name: episodeMeta?.name || `Episode ${episodeInfo.episode}`,
                                            overview: episodeMeta?.overview || '',
                                            stillPath: episodeMeta?.still_path || '',
                                            videoFiles: []
                                        }
                                        season.episodes.push(episode)
                                    }

                                    const newFile = createVideoFile(source, item.filename)
                                    episode.videoFiles.push(newFile)

                                    // Mark as dirty since we modified it
                                    state.dirtyIds.add(tvShow.id)

                                    // Update fileMap so we don't process it again if encountered twice (unlikely but safe)
                                    state.fileMap.set(item.filename, { type: 'episode', object: tvShow, file: newFile })
                                }
                            }
                        } else {
                            console.warn(`No TV show match found for: ${item.filename}`)
                            state.unscannedFiles.push(createVideoFile(source, item.filename))
                        }
                    } catch (error) {
                        console.error(`Failed to process TV show ${item.filename}:`, error)
                        state.unscannedFiles.push(createVideoFile(source, item.filename))
                    }
                } else {
                    // Handle Movie
                    try {
                        const { name: query, year } = cleanFilename(item.filename)
                        console.log(`Processing movie: ${item.filename} -> ${query} (${year || 'no year'})`)

                        const searchResults = await searchMovie(query, year)
                        if (searchResults && searchResults.length > 0) {
                            const bestMatch = searchResults[0]
                            const movieId = bestMatch.id

                            let movie = state.currentMovies.find(m => m.id === movieId) || state.newMovies.get(movieId)

                            if (!movie) {
                                if (state.pendingMovies.has(movieId)) {
                                    await state.pendingMovies.get(movieId)
                                    movie = state.newMovies.get(movieId)
                                } else {
                                    const processPromise = (async () => {
                                        const details = await getMovieDetails(movieId)
                                        if (details) {
                                            const cast = details.credits?.cast?.slice(0, 10).map((c: any) => ({
                                                name: c.name,
                                                character: c.character,
                                                profilePath: c.profile_path
                                            }))

                                            const directors = details.credits?.crew?.filter((c: any) => c.job === 'Director')
                                            const directorObj = directors && directors.length > 0 ? {
                                                name: directors[0].name,
                                                profilePath: directors[0].profile_path || null
                                            } : undefined

                                            const logoPath = details.images?.logos?.find((l: any) => l.iso_639_1 === 'en')?.file_path

                                            let imdbRating: number | undefined
                                            let imdbVotes: number | undefined
                                            if (details.external_ids?.imdb_id) {
                                                const imdbData = getImdbRating(details.external_ids.imdb_id)
                                                if (imdbData) {
                                                    imdbRating = imdbData.rating
                                                    imdbVotes = imdbData.votes
                                                }
                                            }

                                            const newMovie: Movie = {
                                                id: details.id,
                                                title: details.title,
                                                logoPath: logoPath || '',
                                                overview: details.overview,
                                                posterPath: details.poster_path,
                                                backdropPath: details.backdrop_path,
                                                releaseDate: details.release_date,
                                                runtime: details.runtime,
                                                voteAverage: details.vote_average,
                                                popularity: details.popularity,
                                                imdbRating,
                                                imdbVotes,
                                                genres: details.genres?.map((g: any) => g.name),
                                                sourceId: source.id,
                                                status: details.status,
                                                cast,
                                                director: directorObj,
                                                videoFiles: [],
                                                externalIds: details.external_ids
                                            }
                                            state.newMovies.set(movieId, newMovie)
                                        }
                                    })()
                                    state.pendingMovies.set(movieId, processPromise)
                                    await processPromise
                                    state.pendingMovies.delete(movieId)
                                    movie = state.newMovies.get(movieId)
                                }
                            }

                            if (movie) {
                                const newFile = createVideoFile(source, item.filename)
                                movie.videoFiles.push(newFile)
                                state.dirtyIds.add(movie.id)
                                state.fileMap.set(item.filename, { type: 'movie', object: movie, file: newFile })
                            }
                        } else {
                            console.warn(`No movie match found for: ${item.filename}`)
                            state.unscannedFiles.push(createVideoFile(source, item.filename))
                        }
                    } catch (error) {
                        console.error(`Failed to process movie ${item.filename}:`, error)
                        state.unscannedFiles.push(createVideoFile(source, item.filename))
                    }
                }
            }
        })

        await Promise.all(tasks)

    } catch (error) {
        console.error(`Error scanning ${dirPath}:`, error)
    }
}

export let isScanning = false

export const getScanStatus = () => isScanning

export const scanMovies = async (onProgress?: (data: any) => void, forceRefresh: boolean = false) => {
    if (isScanning) {
        console.log('Scan already in progress, skipping...')
        return
    }

    isScanning = true
    console.log('Starting media scan...')

    try {
        clearUnscannedFiles()

        const sources = store.get('sources') as DataSource[]
        const currentMovies = getAllMovies()
        const currentTVShows = getAllTVShows()

        // Build file map for fast lookup
        const fileMap = new Map<string, { type: 'movie', object: Movie, file: VideoFile } | { type: 'episode', object: TVShow, file: VideoFile }>()

        currentMovies.forEach(m => {
            m.videoFiles.forEach(f => {
                fileMap.set(f.filePath, { type: 'movie', object: m, file: f })
            })
        })

        currentTVShows.forEach(s => {
            s.seasons.forEach(season => {
                season.episodes.forEach(ep => {
                    ep.videoFiles.forEach(f => {
                        fileMap.set(f.filePath, { type: 'episode', object: s, file: f })
                    })
                })
            })
        })

        const state: ScanState = {
            newMovies: new Map(),
            currentMovies,
            newTVShows: new Map(),
            currentTVShows,
            seasonDetailsCache: new Map(),
            pendingMovies: new Map(),
            pendingTVShows: new Map(),
            pendingSeasons: new Map(),
            unscannedFiles: [],
            foundFilePaths: new Set(),
            fileMap,
            dirtyIds: new Set(),
            forceRefresh
        }

        console.log(`Scan mode: ${forceRefresh ? 'Full Rescan (Force Refresh)' : 'Quick Scan (Incremental)'}`)

        for (const source of sources) {
            console.log(`Scanning source: ${source.name} (${source.type})`)
            onProgress?.({ status: `Scanning ${source.name}...` })

            for (const scanPath of source.paths) {
                try {
                    console.log(`Scanning path: ${scanPath} from source ${source.name}`)
                    await scanDirectoryRecursive(source, scanPath, state)
                } catch (error) {
                    console.error(`Error scanning path ${scanPath}:`, error)
                }
            }
        }

        onProgress?.({ status: 'Processing changes...' })

        // Prune missing files
        let prunedCount = 0

        // Check Movies
        for (const movie of state.currentMovies) {
            const originalCount = movie.videoFiles.length
            movie.videoFiles = movie.videoFiles.filter(f => state.foundFilePaths.has(f.filePath))
            if (movie.videoFiles.length !== originalCount) {
                state.dirtyIds.add(movie.id)
                prunedCount += (originalCount - movie.videoFiles.length)
            }
        }

        // Check TV Shows
        for (const show of state.currentTVShows) {
            let showChanged = false
            for (const season of show.seasons) {
                for (const episode of season.episodes) {
                    const originalCount = episode.videoFiles.length
                    episode.videoFiles = episode.videoFiles.filter(f => state.foundFilePaths.has(f.filePath))
                    if (episode.videoFiles.length !== originalCount) {
                        showChanged = true
                        prunedCount += (originalCount - episode.videoFiles.length)
                    }
                }
            }
            if (showChanged) {
                state.dirtyIds.add(show.id)
            }
        }

        console.log(`Pruned ${prunedCount} missing files`)
        console.log(`Modified items marked as dirty: ${state.dirtyIds.size}`)

        onProgress?.({ status: 'Saving metadata...' })

        const db = getDb()

        const saveTransaction = db.transaction(() => {
            // Save new items
            console.log(`Saving ${state.newMovies.size} new movies`)
            for (const movie of state.newMovies.values()) {
                saveMovie(movie)
            }
            console.log(`Saving ${state.newTVShows.size} new TV shows`)
            for (const show of state.newTVShows.values()) {
                saveTVShow(show)
            }

            // Save modified existing items
            console.log(`Saving ${state.dirtyIds.size} modified items`)
            for (const id of state.dirtyIds) {
                const movie = state.currentMovies.find(m => m.id === id)
                if (movie) {
                    console.log(`Updating movie: ${movie.title} (${movie.videoFiles.length} files)`)
                    saveMovie(movie)
                } else {
                    const show = state.currentTVShows.find(s => s.id === id)
                    if (show) {
                        const totalEpisodes = show.seasons.reduce((sum, s) => sum + s.episodes.length, 0)
                        console.log(`Updating TV show: ${show.name} (${totalEpisodes} episodes)`)
                        saveTVShow(show)
                    }
                }
            }

            for (const file of state.unscannedFiles) {
                addUnscannedFile(file)
            }

            // Cleanup empty items
            console.log('Cleaning up empty records...')
            deleteEmptyMovies()
            deleteEmptyTVShows()
        })

        saveTransaction()

        onProgress?.({ status: 'Updating IMDb ratings...' })
        const allImdbIds: string[] = []

        // Collect IMDb IDs from new items
        state.newMovies.forEach(m => {
            if (m.externalIds?.imdb_id) allImdbIds.push(m.externalIds.imdb_id)
        })
        state.newTVShows.forEach(t => {
            if (t.externalIds?.imdb_id) allImdbIds.push(t.externalIds.imdb_id)
        })

        // If force refresh, also update IMDb for all existing items
        if (forceRefresh) {
            state.currentMovies.forEach(m => {
                if (m.externalIds?.imdb_id && !allImdbIds.includes(m.externalIds.imdb_id)) {
                    allImdbIds.push(m.externalIds.imdb_id)
                }
            })
            state.currentTVShows.forEach(t => {
                if (t.externalIds?.imdb_id && !allImdbIds.includes(t.externalIds.imdb_id)) {
                    allImdbIds.push(t.externalIds.imdb_id)
                }
            })
        }

        if (allImdbIds.length > 0) {
            try {
                console.log(`Fetching IMDb ratings for ${allImdbIds.length} items...`)
                await downloadAndImportImdbRatings(
                    (progress) => {
                        if (progress.stage === 'downloading') {
                            onProgress?.({ status: `Downloading IMDb data... ${(progress.progress / 1024 / 1024).toFixed(1)}MB` })
                        } else if (progress.stage === 'importing') {
                            onProgress?.({ status: `Importing ratings... ${progress.progress} / ${progress.total}` })
                        }
                    },
                    allImdbIds
                )

                const updateRatingsTransaction = db.transaction(() => {
                    let updatedCount = 0

                    // Update new items
                    for (const movie of state.newMovies.values()) {
                        if (movie.externalIds?.imdb_id) {
                            const rating = getImdbRating(movie.externalIds.imdb_id)
                            if (rating) {
                                movie.imdbRating = rating.rating
                                movie.imdbVotes = rating.votes
                                saveMovie(movie)
                                updatedCount++
                            }
                        }
                    }

                    for (const show of state.newTVShows.values()) {
                        if (show.externalIds?.imdb_id) {
                            const rating = getImdbRating(show.externalIds.imdb_id)
                            if (rating) {
                                show.imdbRating = rating.rating
                                show.imdbVotes = rating.votes
                                saveTVShow(show)
                                updatedCount++
                            }
                        }
                    }

                    // Also update existing items if force refresh
                    if (forceRefresh) {
                        console.log(`Checking IMDb updates for ${state.currentMovies.length} movies and ${state.currentTVShows.length} TV shows`)

                        for (const movie of state.currentMovies) {
                            if (movie.externalIds?.imdb_id) {
                                const rating = getImdbRating(movie.externalIds.imdb_id)
                                if (rating) {
                                    if (movie.imdbRating !== rating.rating || movie.imdbVotes !== rating.votes) {
                                        console.log(`Updating ${movie.title}: ${movie.imdbRating} -> ${rating.rating}`)
                                        movie.imdbRating = rating.rating
                                        movie.imdbVotes = rating.votes
                                        saveMovie(movie)
                                        updatedCount++
                                    } else {
                                        console.log(`${movie.title} already has current rating: ${rating.rating}`)
                                    }
                                } else {
                                    console.log(`No IMDb rating found for ${movie.title} (${movie.externalIds.imdb_id})`)
                                }
                            }
                        }

                        for (const show of state.currentTVShows) {
                            if (show.externalIds?.imdb_id) {
                                const rating = getImdbRating(show.externalIds.imdb_id)
                                if (rating) {
                                    if (show.imdbRating !== rating.rating || show.imdbVotes !== rating.votes) {
                                        console.log(`Updating ${show.name}: ${show.imdbRating} -> ${rating.rating}`)
                                        show.imdbRating = rating.rating
                                        show.imdbVotes = rating.votes
                                        saveTVShow(show)
                                        updatedCount++
                                    }
                                } else {
                                    console.log(`No IMDb rating found for ${show.name} (${show.externalIds.imdb_id})`)
                                }
                            }
                        }
                    }

                    console.log(`Updated IMDb ratings for ${updatedCount} items`)
                })

                updateRatingsTransaction()

            } catch (error) {
                console.error('Failed to update IMDb ratings:', error)
            }
        }

        console.log(`Scan complete: Added ${state.newMovies.size} movies and ${state.newTVShows.size} TV shows`)
        onProgress?.({ status: 'Scan complete!', done: true })
    } catch (error) {
        console.error('Scan failed:', error)
        onProgress?.({ status: 'Scan failed!', error })
    } finally {
        isScanning = false
    }
}
