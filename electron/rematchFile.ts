import { getDb, getMovie, getTVShow, saveMovie, saveTVShow, Movie, VideoFile } from './db'
import { getMovieDetails, getTVShowDetails, getSeasonDetails } from './tmdbService'
import store, { DataSource } from './store'

export const rematchSingleFile = async (
    oldTmdbId: number,
    oldMediaType: 'movie' | 'tv',
    fileId: string,
    newTmdbId: number,
    newMediaType: 'movie' | 'tv',
    episodeInfo?: { season: number, episode: number }
) => {
    console.log(`Rematch single file: ${fileId} from ${oldMediaType} ${oldTmdbId} -> ${newMediaType} ${newTmdbId}`)

    const db = getDb()
    
    let fileToMove: VideoFile | null = null
    let sourceId: string = ''

    if (oldMediaType === 'movie') {
        const oldMovie = getMovie(oldTmdbId)
        if (!oldMovie) throw new Error('Old movie not found')
        
        fileToMove = oldMovie.videoFiles.find(f => f.id === fileId) || null
        if (!fileToMove) throw new Error('File not found in old movie')
        
        sourceId = oldMovie.sourceId
        
        oldMovie.videoFiles = oldMovie.videoFiles.filter(f => f.id !== fileId)
        
        if (oldMovie.videoFiles.length > 0) {
            saveMovie(oldMovie)
        } else {
            db.prepare('DELETE FROM movies WHERE id = ?').run(oldTmdbId)
            db.prepare('DELETE FROM favorites WHERE mediaId = ? AND mediaType = ?').run(oldTmdbId, 'movie')
            db.prepare('DELETE FROM history WHERE mediaId = ? AND mediaType = ?').run(oldTmdbId, 'movie')
        }
    } else {
        const oldShow = getTVShow(oldTmdbId)
        if (!oldShow) throw new Error('Old TV show not found')
        
        sourceId = oldShow.sourceId
        
        // Find and remove the file from episodes
        let found = false
        for (const season of oldShow.seasons) {
            for (const episode of season.episodes) {
                const fileIndex = episode.videoFiles.findIndex(f => f.id === fileId)
                if (fileIndex !== -1) {
                    fileToMove = episode.videoFiles[fileIndex]
                    episode.videoFiles.splice(fileIndex, 1)
                    found = true
                    break
                }
            }
            if (found) break
        }
        
        if (!fileToMove) throw new Error('File not found in old TV show')
        
        // Clean up empty episodes and seasons
        for (const season of oldShow.seasons) {
            season.episodes = season.episodes.filter(ep => ep.videoFiles.length > 0)
        }
        oldShow.seasons = oldShow.seasons.filter(s => s.episodes.length > 0)
        
        if (oldShow.seasons.length > 0) {
            saveTVShow(oldShow)
        } else {
            db.prepare('DELETE FROM tv_shows WHERE id = ?').run(oldTmdbId)
            db.prepare('DELETE FROM favorites WHERE mediaId = ? AND mediaType = ?').run(oldTmdbId, 'tv')
            db.prepare('DELETE FROM history WHERE mediaId = ? AND mediaType = ?').run(oldTmdbId, 'tv')
        }
    }

    const sources = store.get('sources') as DataSource[]
    const source = sources.find(s => s.id === sourceId)
    if (!source) throw new Error('Source not found')

    // Add file to new media
    if (newMediaType === 'movie') {
        await addFileToMovie(newTmdbId, fileToMove, source)
    } else if (newMediaType === 'tv' && episodeInfo) {
        await addFileToTVShow(newTmdbId, fileToMove, source, episodeInfo.season, episodeInfo.episode)
    } else {
        throw new Error('Invalid new media type or missing episode info')
    }

    console.log('Single file rematch completed successfully')
    return true
}

const addFileToMovie = async (tmdbId: number, file: VideoFile, source: DataSource) => {
    let movie = getMovie(tmdbId)

    if (movie) {
        console.log(`Movie ${tmdbId} already exists, adding file`)
        file.manuallyMatched = true
        movie.videoFiles.push(file)
        
        // Remove duplicates
        const uniqueFiles = Array.from(
            new Map(movie.videoFiles.map(f => [f.filePath, f])).values()
        )
        movie.videoFiles = uniqueFiles
        
        saveMovie(movie)
    } else {
        // Fetch movie details from TMDB
        console.log(`Fetching movie details for ${tmdbId}`)
        const details = await getMovieDetails(tmdbId)
        
        if (!details) {
            throw new Error('Failed to fetch movie details from TMDB')
        }

        const cast = details.credits?.cast?.slice(0, 10).map((c: any) => ({
            name: c.name,
            character: c.character,
            profilePath: c.profile_path
        }))

        const directors = details.credits?.crew?.filter((c: any) => c.job === 'Director')
        const directorObj = directors?.map((d: any) => ({
            name: d.name,
            profilePath: d.profile_path || null
        }))

        const logoPath = details.images?.logos?.find((l: any) => l.iso_639_1 === 'en')?.file_path

        file.manuallyMatched = true

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
            genres: details.genres?.map((g: any) => g.name),
            sourceId: source.id,
            status: details.status,
            cast,
            director: directorObj,
            videoFiles: [file],
            externalIds: details.external_ids
        }

        saveMovie(newMovie)
        console.log(`Created new movie: ${newMovie.title}`)
    }
}

const addFileToTVShow = async (
    tmdbId: number,
    file: VideoFile,
    source: DataSource,
    seasonNumber: number,
    episodeNumber: number
) => {
    let show = getTVShow(tmdbId)

    if (!show) {
        // Fetch TV show details from TMDB
        console.log(`Fetching TV show details for ${tmdbId}`)
        const details = await getTVShowDetails(tmdbId)
        
        if (!details) {
            throw new Error('Failed to fetch TV show details from TMDB')
        }

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

        show = {
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
            status: details.status,
            cast,
            createdBy,
            seasons: [],
            externalIds: details.external_ids
        }
    }

    // Find or create season
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

    // Find or create episode
    let episode = season.episodes.find(e => e.episodeNumber === episodeNumber)

    if (!episode) {
        console.log(`Fetching episode S${seasonNumber}E${episodeNumber} details`)
        const seasonDetails = await getSeasonDetails(tmdbId, seasonNumber)
        const episodeMeta = seasonDetails?.episodes?.find((e: any) => e.episode_number === episodeNumber)

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
        
        const uniqueFiles = Array.from(
            new Map(episode.videoFiles.map(f => [f.filePath, f])).values()
        )
        episode.videoFiles = uniqueFiles
    }

    saveTVShow(show)
    console.log(`Added file to TV show: ${show.name} S${seasonNumber}E${episodeNumber}`)
}
