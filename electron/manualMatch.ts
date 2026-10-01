import { getDb, getUnscannedFiles, saveMovie, saveTVShow, Movie, TVShow, Season, Episode, VideoFile } from './db'
import { getMovieDetails, getTVShowDetails, getSeasonDetails, pickLogos } from './tmdbService'
import { DataSource, getSources } from './store'

/** Rows come straight from SQLite, where the array/object fields are still JSON TEXT. */
const parseColumn = <T>(value: unknown, fallback: T): T =>
    typeof value === 'string' && value.length > 0 ? JSON.parse(value) as T : fallback

export const manualMatchFile = async (
    fileId: string,
    tmdbId: number,
    mediaType: 'movie' | 'tv',
    episodeInfo?: { season: number, episode: number }
) => {
    console.log(`Manual match: ${fileId} -> ${mediaType} ${tmdbId}`, episodeInfo)

    const db = getDb()
    const unscannedFiles = getUnscannedFiles()
    const file = unscannedFiles.find(f => f.id === fileId)

    if (!file) {
        throw new Error('File not found in unscanned files')
    }

    const sources = getSources()
    const source = sources.find(s => s.id === file.sourceId)

    if (!source) {
        throw new Error('Source not found')
    }

    if (mediaType === 'movie') {
        await matchMovie(tmdbId, file, source)
    } else if (mediaType === 'tv' && episodeInfo) {
        await matchTVShow(tmdbId, file, source, episodeInfo.season, episodeInfo.episode)
    } else {
        throw new Error('Invalid match parameters')
    }

    db.prepare('DELETE FROM unscanned_files WHERE id = ?').run(fileId)

    console.log('Manual match completed successfully')
    return true
}

const matchMovie = async (tmdbId: number, file: VideoFile, source: DataSource) => {
    const db = getDb()

    let movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(tmdbId) as Movie | undefined

    if (movie) {
        console.log(`Movie ${tmdbId} already exists, adding video file`)
        movie = {
            ...movie,
            genres: parseColumn<Movie['genres']>(movie.genres, []),
            cast: parseColumn<Movie['cast']>(movie.cast, []),
            director: parseColumn<Movie['director']>(movie.director, []),
            externalIds: parseColumn<Movie['externalIds']>(movie.externalIds, {}),
            videoFiles: []
        }
        const existingFiles = db.prepare('SELECT * FROM video_files WHERE movieId = ?').all(tmdbId) as VideoFile[]
        file.manuallyMatched = true
        movie.videoFiles = [...existingFiles, file]
        saveMovie(movie)
    } else {
        console.log(`Fetching movie details for ${tmdbId}`)
        const details = await getMovieDetails(tmdbId)

        if (!details) {
            throw new Error('Failed to fetch movie details from TMDB')
        }

        const cast = details.credits?.cast?.slice(0, 10).map(c => ({
            name: c.name,
            character: c.character ?? '',
            profilePath: c.profile_path ?? ''
        }))

        const directors = details.credits?.crew?.filter(c => c.job === 'Director')
        const directorObj = directors?.map(d => ({
            name: d.name,
            profilePath: d.profile_path || null
        }))

        const { localized: logoPath, english: logoPathEn } = pickLogos(details.images)

        const newMovie: Movie = {
            id: details.id,
            title: details.title,
            logoPath,
            logoPathEn,
            overview: details.overview,
            posterPath: details.poster_path ?? '',
            backdropPath: details.backdrop_path ?? '',
            releaseDate: details.release_date ?? '',
            runtime: details.runtime ?? undefined,
            voteAverage: details.vote_average,
            popularity: details.popularity,
            genres: details.genres?.map(g => g.name),
            sourceId: source.id,
            status: details.status,
            cast,
            director: directorObj,
            videoFiles: [file],
            externalIds: details.external_ids
        }

        newMovie.videoFiles[0].manuallyMatched = true

        saveMovie(newMovie)
        console.log(`Created new movie: ${newMovie.title}`)
    }
}

const matchTVShow = async (
    tmdbId: number,
    file: VideoFile,
    source: DataSource,
    seasonNumber: number,
    episodeNumber: number
) => {
    const db = getDb()

    let show = db.prepare('SELECT * FROM tv_shows WHERE id = ?').get(tmdbId) as TVShow | undefined

    if (show) {
        console.log(`TV show ${tmdbId} already exists, adding episode`)

        show = {
            ...show,
            genres: parseColumn<TVShow['genres']>(show.genres, []),
            cast: parseColumn<TVShow['cast']>(show.cast, []),
            createdBy: parseColumn<TVShow['createdBy']>(show.createdBy, []),
            externalIds: parseColumn<TVShow['externalIds']>(show.externalIds, {}),
            seasons: []
        }

        const seasons = db.prepare('SELECT * FROM seasons WHERE tvShowId = ? ORDER BY seasonNumber').all(tmdbId) as Season[]
        for (const season of seasons) {
            // Episode rows keep the local rowid in `id`, so the TMDB id has to be swapped in below.
            const episodes = db.prepare('SELECT * FROM episodes WHERE tvShowId = ? AND seasonNumber = ? ORDER BY episodeNumber').all(tmdbId, season.seasonNumber) as (Episode & { tmdbId: number })[]
            const fullEpisodes = episodes.map(ep => {
                const videoFiles = db.prepare('SELECT * FROM video_files WHERE episodeId = ?').all(ep.id) as VideoFile[]
                return {
                    ...ep,
                    id: ep.tmdbId,
                    _dbId: ep.id,
                    videoFiles
                }
            })
            show.seasons.push({ ...season, episodes: fullEpisodes })
        }
    } else {
        console.log(`Fetching TV show details for ${tmdbId}`)
        const details = await getTVShowDetails(tmdbId)

        if (!details) {
            throw new Error('Failed to fetch TV show details from TMDB')
        }

        const cast = details.credits?.cast?.slice(0, 10).map(c => ({
            name: c.name,
            character: c.character ?? '',
            profilePath: c.profile_path ?? ''
        }))

        const createdBy = details.created_by?.map(c => ({
            name: c.name,
            profilePath: c.profile_path ?? ''
        }))

        const { localized: logoPath, english: logoPathEn } = pickLogos(details.images)

        show = {
            id: details.id,
            name: details.name,
            logoPath,
            logoPathEn,
            posterPath: details.poster_path ?? '',
            backdropPath: details.backdrop_path ?? '',
            overview: details.overview,
            firstAirDate: details.first_air_date ?? '',
            sourceId: source.id,
            genres: details.genres?.map(g => g.name),
            voteAverage: details.vote_average,
            popularity: details.popularity,
            status: details.status,
            cast,
            createdBy,
            seasons: [],
            externalIds: details.external_ids
        }
    }

    let season = show.seasons.find(s => s.seasonNumber === seasonNumber)

    if (!season) {
        console.log(`Fetching season ${seasonNumber} details`)
        const seasonDetails = await getSeasonDetails(tmdbId, seasonNumber)

        season = {
            seasonNumber,
            name: seasonDetails?.name || `Season ${seasonNumber}`,
            posterPath: seasonDetails?.poster_path || '',
            episodes: []
        }
        show.seasons.push(season)
    }

    let episode = season.episodes.find(e => e.episodeNumber === episodeNumber)

    if (!episode) {
        console.log(`Fetching episode S${seasonNumber}E${episodeNumber} details`)
        const seasonDetails = await getSeasonDetails(tmdbId, seasonNumber)
        const episodeMeta = seasonDetails?.episodes?.find(e => e.episode_number === episodeNumber)

        file.manuallyMatched = true

        episode = {
            id: episodeMeta?.id || 0,
            episodeNumber,
            seasonNumber,
            name: episodeMeta?.name || `Episode ${episodeNumber}`,
            overview: episodeMeta?.overview || '',
            stillPath: episodeMeta?.still_path || '',
            videoFiles: [file]
        }
        season.episodes.push(episode)
    } else {
        file.manuallyMatched = true
        episode.videoFiles.push(file)
    }

    saveTVShow(show)
    console.log(`Matched TV show: ${show.name} S${seasonNumber}E${episodeNumber}`)
}
