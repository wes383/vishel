import { getDb, Movie, TVShow, VideoFile } from './db'
import { searchMovie, getMovieDetails, searchTVShow, getTVShowDetails, getSeasonDetails } from './tmdbService'
import { listDirectory } from './webdavService'
import { listLocalDirectory } from './localFileService'
import { listDirectory as listSMBDirectory } from './smbService'
import store, { DataSource } from './store'
import path from 'node:path'

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
                    // Only retry decoding for WebDAV and SMB, local paths shouldn't need it usually
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

                            if (!state.newTVShows.has(tvId)) {
                                if (state.pendingTVShows.has(tvId)) {
                                    await state.pendingTVShows.get(tvId)
                                } else {
                                    const processPromise = (async () => {
                                        const existingShow = state.currentTVShows.find(s => s.id === tvId)

                                        if (existingShow && existingShow.cast && existingShow.cast.length > 0 && existingShow.externalIds) {
                                            state.newTVShows.set(tvId, {
                                                ...existingShow,
                                                seasons: []
                                            })
                                        } else {
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

                                                state.newTVShows.set(tvId, {
                                                    id: details.id,
                                                    name: details.name,
                                                    posterPath: details.poster_path,
                                                    backdropPath: details.backdrop_path,
                                                    overview: details.overview,
                                                    firstAirDate: details.first_air_date,
                                                    sourceId: source.id,
                                                    genres: details.genres?.map((g: any) => g.name),
                                                    voteAverage: details.vote_average,
                                                    status: details.status,
                                                    cast,
                                                    createdBy,
                                                    seasons: [],
                                                    externalIds: details.external_ids
                                                })
                                            }
                                        }
                                    })()
                                    state.pendingTVShows.set(tvId, processPromise)
                                    await processPromise
                                    state.pendingTVShows.delete(tvId)
                                }
                            }

                            const tvShow = state.newTVShows.get(tvId)

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
                                            tvShow.seasons.push(newSeason)
                                        })()
                                        state.pendingSeasons.set(seasonCacheKey, seasonPromise)
                                        await seasonPromise
                                        state.pendingSeasons.delete(seasonCacheKey)
                                        season = tvShow.seasons.find(s => s.seasonNumber === episodeInfo.season)
                                    }
                                }

                                if (season) {
                                    const seasonDetails = state.seasonDetailsCache.get(seasonCacheKey)
                                    // Find episode metadata from season details
                                    const episodeMeta = seasonDetails?.episodes?.find((e: any) => e.episode_number === episodeInfo.episode)

                                    const episode = {
                                        id: episodeMeta?.id || 0,
                                        episodeNumber: episodeInfo.episode,
                                        seasonNumber: episodeInfo.season,
                                        name: episodeMeta?.name || `Episode ${episodeInfo.episode}`,
                                        overview: episodeMeta?.overview || '',
                                        stillPath: episodeMeta?.still_path || '',
                                        videoFiles: [createVideoFile(source, item.filename)]
                                    }

                                    const existingEpisode = season.episodes.find((e: any) => e.episodeNumber === episodeInfo.episode)

                                    if (existingEpisode) {
                                        existingEpisode.videoFiles.push(createVideoFile(source, item.filename))
                                    } else {
                                        season.episodes.push(episode)
                                    }
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to process TV show ${item.filename}:`, error)
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

                            if (!state.newMovies.has(movieId)) {
                                if (state.pendingMovies.has(movieId)) {
                                    await state.pendingMovies.get(movieId)
                                } else {
                                    const processPromise = (async () => {
                                        const existingMovie = state.currentMovies.find(m => m.id === bestMatch.id)

                                        if (existingMovie && existingMovie.cast && existingMovie.cast.length > 0 && typeof existingMovie.director !== 'string' && existingMovie.externalIds) {
                                            state.newMovies.set(movieId, {
                                                ...existingMovie,
                                                videoFiles: []
                                            })
                                        } else {
                                            const details = await getMovieDetails(movieId)
                                            if (details) {
                                                const cast = details.credits?.cast?.slice(0, 10).map((c: any) => ({
                                                    name: c.name,
                                                    character: c.character,
                                                    profilePath: c.profile_path
                                                }))

                                                const directors = details.credits?.crew?.filter((c: any) => c.job === 'Director')
                                                const directorObj: { name: string, profilePath: string | null } | undefined = directors && directors.length > 0 ? {
                                                    name: directors[0].name,
                                                    profilePath: directors[0].profile_path || null
                                                } : undefined

                                                state.newMovies.set(movieId, {
                                                    id: details.id,
                                                    title: details.title,
                                                    overview: details.overview,
                                                    posterPath: details.poster_path,
                                                    backdropPath: details.backdrop_path,
                                                    releaseDate: details.release_date,
                                                    runtime: details.runtime,
                                                    voteAverage: details.vote_average,
                                                    genres: details.genres?.map((g: any) => g.name),
                                                    sourceId: source.id,
                                                    status: details.status,
                                                    cast,
                                                    director: directorObj,
                                                    videoFiles: [],
                                                    externalIds: details.external_ids
                                                })
                                            }
                                        }
                                    })()
                                    state.pendingMovies.set(movieId, processPromise)
                                    await processPromise
                                    state.pendingMovies.delete(movieId)
                                }
                            }

                            const movie = state.newMovies.get(movieId)
                            if (movie) {
                                movie.videoFiles.push(createVideoFile(source, item.filename))
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to process movie ${item.filename}:`, error)
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

export const scanMovies = async (onProgress?: (data: any) => void) => {
    if (isScanning) {
        console.log('Scan already in progress, skipping...')
        return
    }

    isScanning = true
    console.log('Starting media scan...')

    try {
        const db = await getDb()
        const sources = store.get('sources') as DataSource[]

        const state: ScanState = {
            newMovies: new Map(),
            currentMovies: db.data.movies,
            newTVShows: new Map(),
            currentTVShows: db.data.tvShows || [],
            seasonDetailsCache: new Map(),
            pendingMovies: new Map(),
            pendingTVShows: new Map(),
            pendingSeasons: new Map()
        }

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

        db.data.movies = Array.from(state.newMovies.values())
        db.data.tvShows = Array.from(state.newTVShows.values())

        await db.write()

        console.log(`Scan complete: Found ${db.data.movies.length} movies and ${db.data.tvShows?.length || 0} TV shows`)
        onProgress?.({ status: 'Scan complete!', done: true })
    } catch (error) {
        console.error('Scan failed:', error)
        onProgress?.({ status: 'Scan failed!', error })
    } finally {
        isScanning = false
    }
}
