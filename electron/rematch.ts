import { getDb, getMovie, getTVShow, saveMovie, saveTVShow, Movie, TVShow } from './db'
import { getMovieDetails, getTVShowDetails, getSeasonDetails } from './tmdbService'

export const rematchMedia = async (
    oldTmdbId: number,
    newTmdbId: number,
    mediaType: 'movie' | 'tv'
) => {
    console.log(`Rematch: ${mediaType} ${oldTmdbId} -> ${newTmdbId}`)

    if (oldTmdbId === newTmdbId) {
        throw new Error('New TMDB ID is the same as the old one')
    }

    if (mediaType === 'movie') {
        await rematchMovie(oldTmdbId, newTmdbId)
    } else if (mediaType === 'tv') {
        await rematchTVShow(oldTmdbId, newTmdbId)
    } else {
        throw new Error('Invalid media type')
    }

    console.log('Rematch completed successfully')
    return true
}

const rematchMovie = async (oldTmdbId: number, newTmdbId: number) => {
    const db = getDb()
    
    const oldMovie = getMovie(oldTmdbId)
    if (!oldMovie) {
        throw new Error('Old movie not found')
    }

    const existingNewMovie = getMovie(newTmdbId)
    
    if (existingNewMovie) {
        console.log(`New movie ${newTmdbId} already exists, merging video files`)
        
        existingNewMovie.videoFiles.push(...oldMovie.videoFiles)
        
        const uniqueFiles = Array.from(
            new Map(existingNewMovie.videoFiles.map(f => [f.filePath, f])).values()
        )
        existingNewMovie.videoFiles = uniqueFiles
        
        db.transaction(() => {
            saveMovie(existingNewMovie)
            
            db.prepare('UPDATE favorites SET mediaId = ? WHERE mediaId = ? AND mediaType = ?')
                .run(newTmdbId, oldTmdbId, 'movie')
            db.prepare('UPDATE history SET mediaId = ? WHERE mediaId = ? AND mediaType = ?')
                .run(newTmdbId, oldTmdbId, 'movie')
            
            db.prepare('DELETE FROM movies WHERE id = ?').run(oldTmdbId)
        })()
    } else {
        console.log(`Fetching new movie details for ${newTmdbId}`)
        const details = await getMovieDetails(newTmdbId)
        
        if (!details) {
            throw new Error('Failed to fetch new movie details from TMDB')
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
            sourceId: oldMovie.sourceId,
            status: details.status,
            cast,
            director: directorObj,
            videoFiles: oldMovie.videoFiles,
            externalIds: details.external_ids
        }

        db.transaction(() => {
            saveMovie(newMovie)
            
            db.prepare('UPDATE favorites SET mediaId = ?, title = ?, posterPath = ? WHERE mediaId = ? AND mediaType = ?')
                .run(newTmdbId, newMovie.title, newMovie.posterPath, oldTmdbId, 'movie')
            db.prepare('UPDATE history SET mediaId = ?, title = ?, posterPath = ? WHERE mediaId = ? AND mediaType = ?')
                .run(newTmdbId, newMovie.title, newMovie.posterPath, oldTmdbId, 'movie')
            
            db.prepare('DELETE FROM movies WHERE id = ?').run(oldTmdbId)
        })()
        
        console.log(`Rematched movie: ${oldMovie.title} -> ${newMovie.title}`)
    }
}

const rematchTVShow = async (oldTmdbId: number, newTmdbId: number) => {
    const db = getDb()
    
    const oldShow = getTVShow(oldTmdbId)
    if (!oldShow) {
        throw new Error('Old TV show not found')
    }

    const existingNewShow = getTVShow(newTmdbId)
    
    if (existingNewShow) {
        console.log(`New TV show ${newTmdbId} already exists, merging episodes`)
        
        for (const oldSeason of oldShow.seasons) {
            let newSeason = existingNewShow.seasons.find(s => s.seasonNumber === oldSeason.seasonNumber)
            
            if (!newSeason) {
                existingNewShow.seasons.push(oldSeason)
            } else {
                for (const oldEpisode of oldSeason.episodes) {
                    let newEpisode = newSeason.episodes.find(e => e.episodeNumber === oldEpisode.episodeNumber)
                    
                    if (!newEpisode) {
                        newSeason.episodes.push(oldEpisode)
                    } else {
                        newEpisode.videoFiles.push(...oldEpisode.videoFiles)
                        
                        const uniqueFiles = Array.from(
                            new Map(newEpisode.videoFiles.map(f => [f.filePath, f])).values()
                        )
                        newEpisode.videoFiles = uniqueFiles
                    }
                }
            }
        }
        
        db.transaction(() => {
            saveTVShow(existingNewShow)
            
            db.prepare('UPDATE favorites SET mediaId = ? WHERE mediaId = ? AND mediaType = ?')
                .run(newTmdbId, oldTmdbId, 'tv')
            db.prepare('UPDATE history SET mediaId = ? WHERE mediaId = ? AND mediaType = ?')
                .run(newTmdbId, oldTmdbId, 'tv')
            
            db.prepare('DELETE FROM tv_shows WHERE id = ?').run(oldTmdbId)
        })()
    } else {
        console.log(`Fetching new TV show details for ${newTmdbId}`)
        const details = await getTVShowDetails(newTmdbId)
        
        if (!details) {
            throw new Error('Failed to fetch new TV show details from TMDB')
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

        // Save new show
        const newShow: TVShow = {
            id: details.id,
            name: details.name,
            logoPath: logoPath || '',
            posterPath: details.poster_path,
            backdropPath: details.backdrop_path,
            overview: details.overview,
            firstAirDate: details.first_air_date,
            sourceId: oldShow.sourceId,
            genres: details.genres?.map((g: any) => g.name),
            voteAverage: details.vote_average,
            popularity: details.popularity,
            status: details.status,
            cast,
            createdBy,
            seasons: [],
            externalIds: details.external_ids
        }

        // Fetch season details and update episode metadata
        for (const oldSeason of oldShow.seasons) {
            try {
                const seasonDetails = await getSeasonDetails(newTmdbId, oldSeason.seasonNumber)
                
                const newSeason = {
                    seasonNumber: oldSeason.seasonNumber,
                    name: seasonDetails?.name || oldSeason.name,
                    posterPath: seasonDetails?.poster_path || oldSeason.posterPath,
                    episodes: oldSeason.episodes.map(oldEpisode => {
                        const episodeMeta = seasonDetails?.episodes?.find(
                            (e: any) => e.episode_number === oldEpisode.episodeNumber
                        )
                        
                        return {
                            id: episodeMeta?.id || oldEpisode.id,
                            episodeNumber: oldEpisode.episodeNumber,
                            seasonNumber: oldEpisode.seasonNumber,
                            name: episodeMeta?.name || oldEpisode.name,
                            overview: episodeMeta?.overview || oldEpisode.overview,
                            stillPath: episodeMeta?.still_path || oldEpisode.stillPath,
                            videoFiles: oldEpisode.videoFiles
                        }
                    })
                }
                
                newShow.seasons.push(newSeason)
            } catch (e) {
                console.warn(`Failed to fetch season ${oldSeason.seasonNumber} details, using old data`)
                newShow.seasons.push(oldSeason)
            }
        }

        db.transaction(() => {
            saveTVShow(newShow)
            
            db.prepare('UPDATE favorites SET mediaId = ?, title = ?, posterPath = ? WHERE mediaId = ? AND mediaType = ?')
                .run(newTmdbId, newShow.name, newShow.posterPath, oldTmdbId, 'tv')
            db.prepare('UPDATE history SET mediaId = ?, title = ?, posterPath = ? WHERE mediaId = ? AND mediaType = ?')
                .run(newTmdbId, newShow.name, newShow.posterPath, oldTmdbId, 'tv')
            
            db.prepare('DELETE FROM tv_shows WHERE id = ?').run(oldTmdbId)
        })()
        
        console.log(`Rematched TV show: ${oldShow.name} -> ${newShow.name}`)
    }
}
