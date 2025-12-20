import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'

const DB_PATH = path.join(app.getPath('userData'), 'metadata.db')

export interface VideoFile {
    id: string
    name: string
    filePath: string
    webdavUrl: string
    sourceId: string
    manuallyMatched?: boolean
}

export interface Movie {
    id: number
    title: string
    posterPath: string
    backdropPath: string
    logoPath?: string
    overview: string
    releaseDate: string
    sourceId: string
    videoFiles: VideoFile[]
    genres?: string[]
    runtime?: number
    voteAverage?: number
    popularity?: number
    imdbRating?: number
    imdbVotes?: number
    tagline?: string
    status?: string
    cast?: { name: string, character: string, profilePath: string }[]
    director?: { name: string, profilePath: string | null }
    externalIds?: {
        imdb_id?: string
        tvdb_id?: number
    }
}

export interface Episode {
    id: number
    name: string
    episodeNumber: number
    seasonNumber: number
    overview: string
    stillPath: string
    videoFiles: VideoFile[]
}

export interface Season {
    seasonNumber: number
    name: string
    posterPath: string
    episodes: Episode[]
}

export interface TVShow {
    id: number
    name: string
    posterPath: string
    backdropPath: string
    logoPath?: string
    overview: string
    firstAirDate: string
    sourceId: string
    genres?: string[]
    voteAverage?: number
    popularity?: number
    imdbRating?: number
    imdbVotes?: number
    status?: string
    cast?: { name: string, character: string, profilePath: string }[]
    createdBy?: { name: string, profilePath: string }[]
    seasons: Season[]
    externalIds?: {
        imdb_id?: string
        tvdb_id?: number
    }
}

export interface HistoryItem {
    id: string
    mediaId: number
    mediaType: 'movie' | 'tv'
    title: string
    posterPath: string
    filePath: string
    timestamp: number
    seasonNumber?: number
    episodeNumber?: number
    episodeName?: string
}

export interface FavoriteItem {
    id: string
    mediaId: number
    mediaType: 'movie' | 'tv'
    title: string
    posterPath: string
    timestamp: number
}

let dbInstance: Database.Database | null = null

export const getDb = (): Database.Database => {
    if (dbInstance) return dbInstance

    dbInstance = new Database(DB_PATH)
    dbInstance.pragma('journal_mode = WAL')

    dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS movies (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            posterPath TEXT,
            backdropPath TEXT,
            logoPath TEXT,
            overview TEXT,
            releaseDate TEXT,
            sourceId TEXT,
            genres TEXT, -- JSON
            runtime INTEGER,
            voteAverage REAL,
            popularity REAL,
            imdbRating REAL,
            imdbVotes INTEGER,
            tagline TEXT,
            status TEXT,
            cast TEXT, -- JSON
            director TEXT, -- JSON
            externalIds TEXT -- JSON
        );

        CREATE TABLE IF NOT EXISTS tv_shows (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            posterPath TEXT,
            backdropPath TEXT,
            logoPath TEXT,
            overview TEXT,
            firstAirDate TEXT,
            sourceId TEXT,
            genres TEXT, -- JSON
            voteAverage REAL,
            popularity REAL,
            imdbRating REAL,
            imdbVotes INTEGER,
            status TEXT,
            cast TEXT, -- JSON
            createdBy TEXT, -- JSON
            externalIds TEXT -- JSON
        );

        CREATE TABLE IF NOT EXISTS seasons (
            tvShowId INTEGER,
            seasonNumber INTEGER,
            name TEXT,
            posterPath TEXT,
            PRIMARY KEY (tvShowId, seasonNumber),
            FOREIGN KEY (tvShowId) REFERENCES tv_shows(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS episodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, -- TMDB episode IDs are not unique across shows? Let's use auto-inc for local DB key, but store TMDB ID
            tmdbId INTEGER,
            tvShowId INTEGER,
            seasonNumber INTEGER,
            episodeNumber INTEGER,
            name TEXT,
            overview TEXT,
            stillPath TEXT,
            FOREIGN KEY (tvShowId, seasonNumber) REFERENCES seasons(tvShowId, seasonNumber) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS video_files (
            id TEXT PRIMARY KEY,
            movieId INTEGER,
            episodeId INTEGER,
            name TEXT,
            filePath TEXT,
            webdavUrl TEXT,
            sourceId TEXT,
            manuallyMatched INTEGER DEFAULT 0,
            FOREIGN KEY (movieId) REFERENCES movies(id) ON DELETE CASCADE,
            FOREIGN KEY (episodeId) REFERENCES episodes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            mediaId INTEGER,
            mediaType TEXT,
            title TEXT,
            posterPath TEXT,
            filePath TEXT,
            timestamp INTEGER,
            seasonNumber INTEGER,
            episodeNumber INTEGER,
            episodeName TEXT
        );

        CREATE TABLE IF NOT EXISTS unscanned_files (
            id TEXT PRIMARY KEY,
            name TEXT,
            filePath TEXT,
            webdavUrl TEXT,
            sourceId TEXT
        );

        CREATE TABLE IF NOT EXISTS favorites (
            id TEXT PRIMARY KEY,
            mediaId INTEGER,
            mediaType TEXT,
            title TEXT,
            posterPath TEXT,
            timestamp INTEGER,
            UNIQUE(mediaId, mediaType)
        );
    `)

    return dbInstance
}

// Helpers

export const getAllMovies = (): Movie[] => {
    const db = getDb()
    const movies = db.prepare('SELECT * FROM movies ORDER BY title').all() as any[]

    return movies.map(m => {
        const videoFiles = (db.prepare('SELECT * FROM video_files WHERE movieId = ?').all(m.id) as any[]).map(f => ({
            ...f,
            manuallyMatched: f.manuallyMatched === 1
        }))
        return {
            ...m,
            genres: JSON.parse(m.genres || '[]'),
            cast: JSON.parse(m.cast || '[]'),
            director: JSON.parse(m.director || 'null'),
            externalIds: JSON.parse(m.externalIds || '{}'),
            videoFiles
        }
    })
}

export const getMovie = (id: number): Movie | undefined => {
    const db = getDb()
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(id) as any
    if (!movie) return undefined

    const videoFiles = (db.prepare('SELECT * FROM video_files WHERE movieId = ?').all(id) as any[]).map(f => ({
        ...f,
        manuallyMatched: f.manuallyMatched === 1
    }))
    return {
        ...movie,
        genres: JSON.parse(movie.genres || '[]'),
        cast: JSON.parse(movie.cast || '[]'),
        director: JSON.parse(movie.director || 'null'),
        externalIds: JSON.parse(movie.externalIds || '{}'),
        videoFiles
    }
}



export const getMovieCount = (): number => {
    const db = getDb()
    const result = db.prepare('SELECT COUNT(*) as count FROM movies').get() as { count: number }
    return result.count
}

export const getTVShowCount = (): number => {
    const db = getDb()
    const result = db.prepare('SELECT COUNT(*) as count FROM tv_shows').get() as { count: number }
    return result.count
}

export const saveMovie = (movie: Movie) => {
    const db = getDb()
    const insert = db.prepare(`
        INSERT OR REPLACE INTO movies (
            id, title, posterPath, backdropPath, logoPath, overview, releaseDate, sourceId,
            genres, runtime, voteAverage, popularity, imdbRating, imdbVotes, tagline, status,
            cast, director, externalIds
        ) VALUES (
            @id, @title, @posterPath, @backdropPath, @logoPath, @overview, @releaseDate, @sourceId,
            @genres, @runtime, @voteAverage, @popularity, @imdbRating, @imdbVotes, @tagline, @status,
            @cast, @director, @externalIds
        )
    `)

    const insertFile = db.prepare(`
        INSERT OR REPLACE INTO video_files (id, movieId, name, filePath, webdavUrl, sourceId, manuallyMatched)
        VALUES (@id, @movieId, @name, @filePath, @webdavUrl, @sourceId, @manuallyMatched)
    `)

    db.transaction(() => {
        insert.run({
            id: movie.id,
            title: movie.title,
            posterPath: movie.posterPath,
            backdropPath: movie.backdropPath,
            logoPath: movie.logoPath || null,
            overview: movie.overview,
            releaseDate: movie.releaseDate,
            sourceId: movie.sourceId,
            genres: JSON.stringify(movie.genres || []),
            runtime: movie.runtime || null,
            voteAverage: movie.voteAverage || null,
            popularity: movie.popularity || null,
            imdbRating: movie.imdbRating || null,
            imdbVotes: movie.imdbVotes || null,
            tagline: movie.tagline || null,
            status: movie.status || null,
            cast: JSON.stringify(movie.cast || []),
            director: JSON.stringify(movie.director || null),
            externalIds: JSON.stringify(movie.externalIds || {})
        })

        db.prepare('DELETE FROM video_files WHERE movieId = ?').run(movie.id)

        for (const file of movie.videoFiles) {
            insertFile.run({
                ...file,
                movieId: movie.id,
                manuallyMatched: file.manuallyMatched ? 1 : 0
            })
        }
    })()
}


export const getAllTVShows = (): TVShow[] => {
    const db = getDb()
    const shows = db.prepare('SELECT * FROM tv_shows ORDER BY name').all() as any[]

    return shows.map(s => {
        const seasons = db.prepare('SELECT * FROM seasons WHERE tvShowId = ? ORDER BY seasonNumber').all(s.id) as any[]
        const fullSeasons = seasons.map(season => {
            const episodes = db.prepare('SELECT * FROM episodes WHERE tvShowId = ? AND seasonNumber = ? ORDER BY episodeNumber').all(s.id, season.seasonNumber) as any[]
            const fullEpisodes = episodes.map(ep => {
                const videoFiles = (db.prepare('SELECT * FROM video_files WHERE episodeId = ?').all(ep.id) as any[]).map(f => ({
                    ...f,
                    manuallyMatched: f.manuallyMatched === 1
                }))
                return {
                    ...ep,
                    id: ep.tmdbId,
                    _dbId: ep.id,
                    videoFiles
                }
            })
            return { ...season, episodes: fullEpisodes }
        })

        return {
            ...s,
            genres: JSON.parse(s.genres || '[]'),
            cast: JSON.parse(s.cast || '[]'),
            createdBy: JSON.parse(s.createdBy || '[]'),
            externalIds: JSON.parse(s.externalIds || '{}'),
            seasons: fullSeasons
        }
    })
}

export const getTVShow = (id: number): TVShow | undefined => {
    const db = getDb()
    const show = db.prepare('SELECT * FROM tv_shows WHERE id = ?').get(id) as any
    if (!show) return undefined

    const seasons = db.prepare('SELECT * FROM seasons WHERE tvShowId = ? ORDER BY seasonNumber').all(id) as any[]
    const fullSeasons = seasons.map(season => {
        const episodes = db.prepare('SELECT * FROM episodes WHERE tvShowId = ? AND seasonNumber = ? ORDER BY episodeNumber').all(id, season.seasonNumber) as any[]
        const fullEpisodes = episodes.map(ep => {
            const videoFiles = (db.prepare('SELECT * FROM video_files WHERE episodeId = ?').all(ep.id) as any[]).map(f => ({
                ...f,
                manuallyMatched: f.manuallyMatched === 1
            }))
            return {
                ...ep,
                id: ep.tmdbId,
                _dbId: ep.id,
                videoFiles
            }
        })
        return { ...season, episodes: fullEpisodes }
    })

    return {
        ...show,
        genres: JSON.parse(show.genres || '[]'),
        cast: JSON.parse(show.cast || '[]'),
        createdBy: JSON.parse(show.createdBy || '[]'),
        externalIds: JSON.parse(show.externalIds || '{}'),
        seasons: fullSeasons
    }
}

export const saveTVShow = (show: TVShow) => {
    const db = getDb()

    const insertShow = db.prepare(`
        INSERT OR REPLACE INTO tv_shows (
            id, name, posterPath, backdropPath, logoPath, overview, firstAirDate, sourceId,
            genres, voteAverage, popularity, imdbRating, imdbVotes, status, cast, createdBy, externalIds
        ) VALUES (
            @id, @name, @posterPath, @backdropPath, @logoPath, @overview, @firstAirDate, @sourceId,
            @genres, @voteAverage, @popularity, @imdbRating, @imdbVotes, @status, @cast, @createdBy, @externalIds
        )
    `)

    const insertSeason = db.prepare(`
        INSERT OR REPLACE INTO seasons (tvShowId, seasonNumber, name, posterPath)
        VALUES (@tvShowId, @seasonNumber, @name, @posterPath)
    `)

    const insertEpisode = db.prepare(`
        INSERT INTO episodes (tmdbId, tvShowId, seasonNumber, episodeNumber, name, overview, stillPath)
        VALUES (@tmdbId, @tvShowId, @seasonNumber, @episodeNumber, @name, @overview, @stillPath)
    `)

    const checkEpisode = db.prepare('SELECT id FROM episodes WHERE tvShowId = ? AND seasonNumber = ? AND episodeNumber = ?')
    const updateEpisode = db.prepare(`
        UPDATE episodes SET tmdbId = @tmdbId, name = @name, overview = @overview, stillPath = @stillPath
        WHERE id = @id
    `)

    const insertFile = db.prepare(`
        INSERT OR REPLACE INTO video_files (id, episodeId, name, filePath, webdavUrl, sourceId, manuallyMatched)
        VALUES (@id, @episodeId, @name, @filePath, @webdavUrl, @sourceId, @manuallyMatched)
    `)

    db.transaction(() => {
        insertShow.run({
            id: show.id,
            name: show.name,
            posterPath: show.posterPath,
            backdropPath: show.backdropPath,
            logoPath: show.logoPath || null,
            overview: show.overview,
            firstAirDate: show.firstAirDate,
            sourceId: show.sourceId,
            genres: JSON.stringify(show.genres || []),
            voteAverage: show.voteAverage || null,
            popularity: show.popularity || null,
            imdbRating: show.imdbRating || null,
            imdbVotes: show.imdbVotes || null,
            status: show.status || null,
            cast: JSON.stringify(show.cast || []),
            createdBy: JSON.stringify(show.createdBy || []),
            externalIds: JSON.stringify(show.externalIds || {})
        })

        for (const season of show.seasons) {
            insertSeason.run({ ...season, tvShowId: show.id })

            for (const episode of season.episodes) {
                let epId: number | bigint

                const existing = checkEpisode.get(show.id, season.seasonNumber, episode.episodeNumber) as { id: number } | undefined

                if (existing) {
                    epId = existing.id
                    updateEpisode.run({
                        id: epId,
                        tmdbId: episode.id,
                        name: episode.name,
                        overview: episode.overview,
                        stillPath: episode.stillPath
                    })
                } else {
                    const info = insertEpisode.run({
                        tmdbId: episode.id,
                        tvShowId: show.id,
                        seasonNumber: season.seasonNumber,
                        episodeNumber: episode.episodeNumber,
                        name: episode.name,
                        overview: episode.overview,
                        stillPath: episode.stillPath
                    })
                    epId = info.lastInsertRowid
                }

                db.prepare('DELETE FROM video_files WHERE episodeId = ?').run(epId)

                for (const file of episode.videoFiles) {
                    insertFile.run({
                        ...file,
                        episodeId: epId,
                        manuallyMatched: file.manuallyMatched ? 1 : 0
                    })
                }
            }
        }
    })()
}

export const getHistory = (): HistoryItem[] => {
    const db = getDb()
    return db.prepare('SELECT * FROM history ORDER BY timestamp DESC LIMIT 200').all() as HistoryItem[]
}

export const addToHistory = (item: HistoryItem) => {
    const db = getDb()
    const insert = db.prepare(`
        INSERT OR REPLACE INTO history (
            id, mediaId, mediaType, title, posterPath, filePath, timestamp,
            seasonNumber, episodeNumber, episodeName
        ) VALUES (
            @id, @mediaId, @mediaType, @title, @posterPath, @filePath, @timestamp,
            @seasonNumber, @episodeNumber, @episodeName
        )
    `)

    db.transaction(() => {
        if (item.mediaType === 'movie') {
            db.prepare('DELETE FROM history WHERE mediaType = ? AND mediaId = ?')
                .run(item.mediaType, item.mediaId)
        } else if (item.mediaType === 'tv') {
            db.prepare('DELETE FROM history WHERE mediaType = ? AND mediaId = ? AND seasonNumber = ? AND episodeNumber = ?')
                .run(item.mediaType, item.mediaId, item.seasonNumber, item.episodeNumber)
        }

        insert.run({
            id: item.id,
            mediaId: item.mediaId,
            mediaType: item.mediaType,
            title: item.title,
            posterPath: item.posterPath,
            filePath: item.filePath,
            timestamp: item.timestamp,
            seasonNumber: item.seasonNumber || null,
            episodeNumber: item.episodeNumber || null,
            episodeName: item.episodeName || null
        })
        // Keep only last 200 items
        const count = db.prepare('SELECT COUNT(*) as count FROM history').get() as { count: number }
        if (count.count > 200) {
            db.prepare('DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY timestamp DESC LIMIT 200)').run()
        }
    })()
}

export const deleteHistoryItem = (id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM history WHERE id = ?').run(id)
}

export const getUnscannedFiles = (): VideoFile[] => {
    const db = getDb()
    return db.prepare('SELECT * FROM unscanned_files').all() as VideoFile[]
}

export const addUnscannedFile = (file: VideoFile) => {
    const db = getDb()
    db.prepare(`
        INSERT OR REPLACE INTO unscanned_files (id, name, filePath, webdavUrl, sourceId)
        VALUES (@id, @name, @filePath, @webdavUrl, @sourceId)
    `).run(file)
}

export const clearUnscannedFiles = () => {
    const db = getDb()
    db.prepare('DELETE FROM unscanned_files').run()
}

export const deleteUnscannedFile = (id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM unscanned_files WHERE id = ?').run(id)
}

export const deleteEmptyMovies = () => {
    const db = getDb()
    const result = db.prepare('DELETE FROM movies WHERE id NOT IN (SELECT DISTINCT movieId FROM video_files WHERE movieId IS NOT NULL)').run()
    console.log(`Deleted ${result.changes} empty movies`)
    return result.changes
}

export const deleteEmptyTVShows = () => {
    const db = getDb()
    // Delete episodes with no video files
    const episodesResult = db.prepare('DELETE FROM episodes WHERE id NOT IN (SELECT DISTINCT episodeId FROM video_files WHERE episodeId IS NOT NULL)').run()
    console.log(`Deleted ${episodesResult.changes} empty episodes`)

    // Delete seasons with no episodes
    const seasonsResult = db.prepare('DELETE FROM seasons WHERE (tvShowId, seasonNumber) NOT IN (SELECT tvShowId, seasonNumber FROM episodes)').run()
    console.log(`Deleted ${seasonsResult.changes} empty seasons`)

    // Delete shows with no seasons
    const showsResult = db.prepare('DELETE FROM tv_shows WHERE id NOT IN (SELECT DISTINCT tvShowId FROM seasons)').run()
    console.log(`Deleted ${showsResult.changes} empty TV shows`)

    return episodesResult.changes + seasonsResult.changes + showsResult.changes
}

// Favorites

export const getFavorites = (): FavoriteItem[] => {
    const db = getDb()
    return db.prepare('SELECT * FROM favorites ORDER BY timestamp DESC').all() as FavoriteItem[]
}

export const addFavorite = (item: FavoriteItem) => {
    const db = getDb()
    db.prepare(`
        INSERT OR REPLACE INTO favorites (id, mediaId, mediaType, title, posterPath, timestamp)
        VALUES (@id, @mediaId, @mediaType, @title, @posterPath, @timestamp)
    `).run(item)
}

export const removeFavorite = (mediaId: number, mediaType: string) => {
    const db = getDb()
    db.prepare('DELETE FROM favorites WHERE mediaId = ? AND mediaType = ?').run(mediaId, mediaType)
}

export const isFavorite = (mediaId: number, mediaType: string): boolean => {
    const db = getDb()
    const result = db.prepare('SELECT id FROM favorites WHERE mediaId = ? AND mediaType = ?').get(mediaId, mediaType)
    return !!result
}

// Sync posters for favorites and history after full rescan
export const syncFavoritesPosters = () => {
    const db = getDb()

    // Update movie favorites
    db.prepare(`
        UPDATE favorites SET 
            posterPath = (SELECT posterPath FROM movies WHERE movies.id = favorites.mediaId),
            title = (SELECT title FROM movies WHERE movies.id = favorites.mediaId)
        WHERE mediaType = 'movie' AND EXISTS (SELECT 1 FROM movies WHERE movies.id = favorites.mediaId)
    `).run()

    // Update TV show favorites
    db.prepare(`
        UPDATE favorites SET 
            posterPath = (SELECT posterPath FROM tv_shows WHERE tv_shows.id = favorites.mediaId),
            title = (SELECT name FROM tv_shows WHERE tv_shows.id = favorites.mediaId)
        WHERE mediaType = 'tv' AND EXISTS (SELECT 1 FROM tv_shows WHERE tv_shows.id = favorites.mediaId)
    `).run()

    console.log('Synced favorites posters with latest media data')
}

export const syncHistoryPosters = () => {
    const db = getDb()

    // Update movie history
    db.prepare(`
        UPDATE history SET 
            posterPath = (SELECT posterPath FROM movies WHERE movies.id = history.mediaId),
            title = (SELECT title FROM movies WHERE movies.id = history.mediaId)
        WHERE mediaType = 'movie' AND EXISTS (SELECT 1 FROM movies WHERE movies.id = history.mediaId)
    `).run()

    // Update TV show history
    db.prepare(`
        UPDATE history SET 
            posterPath = (SELECT posterPath FROM tv_shows WHERE tv_shows.id = history.mediaId),
            title = (SELECT name FROM tv_shows WHERE tv_shows.id = history.mediaId)
        WHERE mediaType = 'tv' AND EXISTS (SELECT 1 FROM tv_shows WHERE tv_shows.id = history.mediaId)
    `).run()

    console.log('Synced history posters with latest media data')
}
