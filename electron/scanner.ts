import { getDb, Movie, TVShow, VideoFile } from './db'
import { searchMovie, getMovieDetails, searchTVShow, getTVShowDetails, getSeasonDetails } from './tmdbService'
import { listDirectory } from './webdavService'
import { listLocalDirectory } from './localFileService'
import { listDirectory as listSMBDirectory } from './smbService'
import store, { DataSource } from './store'
import path from 'node:path'

const cleanFilename = (filename: string): string => {
    let name = path.parse(filename).name
    name = name.replace(/[\.\-_]/g, ' ')
    const yearMatch = name.match(/\b(19|20)\d{2}\b/)
    if (yearMatch && yearMatch.index && yearMatch.index > 0) {
        name = name.substring(0, yearMatch.index)
    }
    name = name.replace(/\b(1080p|720p|4k|2160p|bluray|webdl|x264|x265|hevc|aac|ac3|dts|truehd)\b/gi, '')
    name = name.replace(/[\[\(\{].*?[\]\}\)]/g, '')

    return name.trim()
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


const scanDirectoryRecursive = async (
    source: DataSource,
    dirPath: string,
    newMovies: Map<number, Movie>,
    currentMovies: Movie[],
    newTVShows: Map<number, TVShow>,
    currentTVShows: TVShow[],
    seasonDetailsCache: Map<string, any>
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

        for (const item of items) {
            let targetPath = item.filename

            if (item.type === 'directory') {
                try {
                    await scanDirectoryRecursive(source, targetPath, newMovies, currentMovies, newTVShows, currentTVShows, seasonDetailsCache)
                } catch (err) {
                    // Only retry decoding for WebDAV and SMB, local paths shouldn't need it usually
                    if (source.type === 'webdav' || source.type === 'smb') {
                        console.warn(`Failed to scan subdirectory ${targetPath} with raw path. Retrying with decoded path...`)
                        try {
                            const decodedPath = decodeURIComponent(item.filename)
                            if (decodedPath !== item.filename) {
                                await scanDirectoryRecursive(source, decodedPath, newMovies, currentMovies, newTVShows, currentTVShows, seasonDetailsCache)
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

                if (episodeInfo) {
                    // Handle TV Show
                    console.log(`Processing TV Show: ${item.filename} -> ${episodeInfo.name} S${episodeInfo.season}E${episodeInfo.episode}`)

                    try {
                        const searchResults = await searchTVShow(episodeInfo.name)
                        if (searchResults && searchResults.length > 0) {
                            const bestMatch = searchResults[0]
                            const tvId = bestMatch.id

                            let tvShow = newTVShows.get(tvId)

                            if (!tvShow) {
                                const existingShow = currentTVShows.find(s => s.id === tvId)

                                if (existingShow && existingShow.cast && existingShow.cast.length > 0 && existingShow.externalIds) {
                                    tvShow = {
                                        ...existingShow,
                                        seasons: []
                                    }
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

                                        tvShow = {
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
                                        }
                                    }
                                }
                                if (tvShow) newTVShows.set(tvId, tvShow)
                            }

                            if (tvShow) {
                                let season = tvShow.seasons.find(s => s.seasonNumber === episodeInfo.season)

                                const cacheKey = `${tvId}:${episodeInfo.season}`
                                if (!seasonDetailsCache.has(cacheKey)) {
                                    try {
                                        const details = await getSeasonDetails(tvId, episodeInfo.season)
                                        if (details) {
                                            seasonDetailsCache.set(cacheKey, details)
                                        }
                                    } catch (e) {
                                        console.warn(`Failed to fetch season details for ${tvId} S${episodeInfo.season}`)
                                    }
                                }
                                const seasonDetails = seasonDetailsCache.get(cacheKey)

                                if (!season) {
                                    season = {
                                        seasonNumber: episodeInfo.season,
                                        name: seasonDetails?.name || `Season ${episodeInfo.season}`,
                                        posterPath: seasonDetails?.poster_path || '',
                                        episodes: []
                                    }
                                    tvShow.seasons.push(season)
                                }

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
                    } catch (error) {
                        console.error(`Failed to process TV show ${item.filename}:`, error)
                    }
                } else {
                    // Handle Movie
                    try {
                        const query = cleanFilename(item.filename)
                        console.log(`Processing movie: ${item.filename} -> ${query}`)

                        const searchResults = await searchMovie(query)
                        if (searchResults && searchResults.length > 0) {
                            const bestMatch = searchResults[0]
                            const movieId = bestMatch.id

                            let movie = newMovies.get(movieId)

                            if (!movie) {
                                const existingMovie = currentMovies.find(m => m.id === bestMatch.id)

                                if (existingMovie && existingMovie.cast && existingMovie.cast.length > 0 && typeof existingMovie.director !== 'string' && existingMovie.externalIds) {
                                    movie = {
                                        ...existingMovie,
                                        videoFiles: []
                                    }
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

                                        movie = {
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
                                        }
                                    }
                                }
                                if (movie) newMovies.set(movieId, movie)
                            }

                            if (movie) {
                                movie.videoFiles.push(createVideoFile(source, item.filename))
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to process movie ${item.filename}:`, error)
                    }
                }
            }
        }
    } catch (error) {
        console.error(`Error scanning ${dirPath}:`, error)
    }
}

export const scanMovies = async (onProgress?: (data: any) => void) => {
    console.log('Starting media scan...')
    const db = await getDb()
    const sources = store.get('sources') as DataSource[]

    const newMovies = new Map<number, Movie>()
    const newTVShows = new Map<number, TVShow>()

    const seasonDetailsCache = new Map<string, any>()

    for (const source of sources) {
        console.log(`Scanning source: ${source.name} (${source.type})`)
        onProgress?.({ status: `Scanning ${source.name}...` })

        for (const scanPath of source.paths) {
            try {
                console.log(`Scanning path: ${scanPath} from source ${source.name}`)
                await scanDirectoryRecursive(source, scanPath, newMovies, db.data.movies, newTVShows, db.data.tvShows || [], seasonDetailsCache)
            } catch (error) {
                console.error(`Error scanning path ${scanPath}:`, error)
            }
        }
    }

    db.data.movies = Array.from(newMovies.values())
    db.data.tvShows = Array.from(newTVShows.values())

    await db.write()

    console.log(`Scan complete: Found ${db.data.movies.length} movies and ${db.data.tvShows?.length || 0} TV shows`)
    onProgress?.({ status: 'Scan complete!', done: true })
}
