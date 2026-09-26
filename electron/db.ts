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
    tagline?: string
    status?: string
    cast?: { name: string, character: string, profilePath: string }[]
    director?: { name: string, profilePath: string | null }[]
    externalIds?: {
        imdb_id?: string
        tvdb_id?: number
    }
    createdAt?: number
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
    status?: string
    cast?: { name: string, character: string, profilePath: string }[]
    createdBy?: { name: string, profilePath: string }[]
    seasons: Season[]
    externalIds?: {
        imdb_id?: string
        tvdb_id?: number
    }
    createdAt?: number
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
    timestamp: number
}

export interface WatchStatus {
    id: string
    mediaId: number
    mediaType: 'movie' | 'tv'
    watched: boolean
    timestamp: number
}

let dbInstance: Database.Database | null = null

/** Statement cache: better-sqlite3 `prepare()` is not free, and lookups repeat per row otherwise. */
const statementCache = new Map<string, Database.Statement>()

const stmt = (sql: string): Database.Statement => {
    let cached = statementCache.get(sql)
    if (!cached) {
        cached = getDb().prepare(sql)
        statementCache.set(sql, cached)
    }
    return cached
}

/** Split large id lists so we stay well below SQLite's variable limit. */
const CHUNK_SIZE = 400

const chunk = <T>(items: T[], size: number = CHUNK_SIZE): T[][] => {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size))
    }
    return out
}

const parseJson = <T>(value: unknown, fallback: T): T => {
    if (typeof value !== 'string' || value.length === 0) return fallback
    try {
        return JSON.parse(value) as T
    } catch {
        return fallback
    }
}

const BASE_SCHEMA = `
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
        tagline TEXT,
        status TEXT,
        cast TEXT, -- JSON
        director TEXT, -- JSON
        externalIds TEXT, -- JSON
        createdAt INTEGER
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
        status TEXT,
        cast TEXT, -- JSON
        createdBy TEXT, -- JSON
        externalIds TEXT, -- JSON
        createdAt INTEGER
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
        id INTEGER PRIMARY KEY AUTOINCREMENT, -- TMDB episode IDs are not unique across shows, so keep a local rowid
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
        timestamp INTEGER,
        UNIQUE(mediaId, mediaType)
    );

    CREATE TABLE IF NOT EXISTS watch_status (
        id TEXT PRIMARY KEY,
        mediaId INTEGER,
        mediaType TEXT,
        watched INTEGER DEFAULT 1,
        timestamp INTEGER,
        UNIQUE(mediaId, mediaType)
    );
`

const INDICES = `
    CREATE INDEX IF NOT EXISTS idx_video_files_movie ON video_files(movieId);
    CREATE INDEX IF NOT EXISTS idx_video_files_episode ON video_files(episodeId);
    CREATE INDEX IF NOT EXISTS idx_episodes_tv_season ON episodes(tvShowId, seasonNumber);
    CREATE INDEX IF NOT EXISTS idx_seasons_tv ON seasons(tvShowId);
    CREATE INDEX IF NOT EXISTS idx_history_media ON history(mediaType, mediaId);
    CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_unscanned_source ON unscanned_files(sourceId);
`

/**
 * Collapse episodes duplicated on (tvShowId, seasonNumber, episodeNumber).
 * Historic scans inserted them freely, and video_files rows pointing at the
 * loser rows were never cleaned up, so the unique index cannot be created until
 * the duplicates and their file rows are reconciled.
 */
const dedupeEpisodes = (db: Database.Database) => {
    const groups = db.prepare(`
        SELECT tvShowId, seasonNumber, episodeNumber, GROUP_CONCAT(id) AS ids
        FROM episodes
        GROUP BY tvShowId, seasonNumber, episodeNumber
        HAVING COUNT(*) > 1
    `).all() as { ids: string }[]

    const keepId = db.prepare('SELECT id FROM video_files WHERE episodeId = ? AND id = ?')
    const deleteFile = db.prepare('DELETE FROM video_files WHERE id = ?')
    const repointFile = db.prepare('UPDATE video_files SET episodeId = ? WHERE id = ?')
    const listFiles = db.prepare('SELECT id FROM video_files WHERE episodeId = ?')
    const deleteEpisode = db.prepare('DELETE FROM episodes WHERE id = ?')

    const reconcile = db.transaction(() => {
        for (const group of groups) {
            const ids = group.ids.split(',').map(Number).filter(Number.isFinite)
            const survivor = Math.min(...ids)
            for (const duplicate of ids.filter(id => id !== survivor)) {
                for (const file of listFiles.all(duplicate) as { id: string }[]) {
                    if (keepId.get(file.id, survivor)) {
                        deleteFile.run(file.id)
                    } else {
                        repointFile.run(survivor, file.id)
                    }
                }
                deleteEpisode.run(duplicate)
            }
        }
    })

    reconcile()
    return groups.length
}

const MIGRATIONS: { version: number, up: (db: Database.Database) => void }[] = [
    {
        version: 2,
        up: (db) => {
            const deduped = dedupeEpisodes(db)
            if (deduped > 0) console.log(`[db] Merged ${deduped} duplicated episode groups`)
            db.exec(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_unique_number
                    ON episodes(tvShowId, seasonNumber, episodeNumber);
            `)
            db.exec(INDICES)
        }
    }
]

const migrate = (db: Database.Database) => {
    const current = Number(db.pragma('user_version', { simple: true }))

    if (current === 0) {
        // Pre-migration databases: adopt the existing structure as version 1.
        db.pragma('user_version = 1')
    }

    const version = Number(db.pragma('user_version', { simple: true }))
    for (const migration of MIGRATIONS.filter(m => m.version > version).sort((a, b) => a.version - b.version)) {
        db.transaction(() => migration.up(db))()
        db.pragma(`user_version = ${migration.version}`)
        console.log(`[db] Applied schema migration to version ${migration.version}`)
    }
}

export const getDb = (): Database.Database => {
    if (dbInstance) return dbInstance

    dbInstance = new Database(DB_PATH)
    dbInstance.pragma('journal_mode = WAL')
    dbInstance.pragma('foreign_keys = ON')

    dbInstance.exec(BASE_SCHEMA)
    migrate(dbInstance)

    return dbInstance
}

// Helpers

const mapVideoFile = (f: VideoFileRow): VideoFile => ({
    ...f,
    name: f.name ?? '',
    filePath: f.filePath ?? '',
    webdavUrl: f.webdavUrl ?? '',
    sourceId: f.sourceId ?? '',
    manuallyMatched: f.manuallyMatched === 1
})

/** Batch-load video_files for a set of owner ids instead of one query per row. */
const loadVideoFilesBy = (owner: 'movieId' | 'episodeId', ids: number[]): Map<number, VideoFile[]> => {
    const grouped = new Map<number, VideoFile[]>()
    const uniqueIds = Array.from(new Set(ids.filter(id => id !== null && id !== undefined)))

    for (const group of chunk(uniqueIds)) {
        const placeholders = group.map(() => '?').join(',')
        const rows = stmt(`SELECT * FROM video_files WHERE ${owner} IN (${placeholders})`)
            .all(...group) as VideoFileRow[]
        for (const row of rows) {
            // The WHERE clause only returns rows whose owner column is set.
            const key = row[owner] as number
            const list = grouped.get(key)
            if (list) {
                list.push(mapVideoFile(row))
            } else {
                grouped.set(key, [mapVideoFile(row)])
            }
        }
    }

    return grouped
}

// Row shapes: they mirror BASE_SCHEMA. Every TEXT/INTEGER/REAL column can come back as
// NULL, so those fields are nullable here and normalised to the exported domain types by
// the readers. Columns declared NOT NULL or PRIMARY KEY (and the ones the only writer in
// this module always fills) are typed non-nullable.

/** movies: id INTEGER PRIMARY KEY, title TEXT NOT NULL. */
interface MovieRow {
    id: number
    title: string
    posterPath: string | null
    backdropPath: string | null
    logoPath: string | null
    overview: string | null
    releaseDate: string | null
    sourceId: string | null
    /** JSON string[] */
    genres: string | null
    runtime: number | null
    voteAverage: number | null
    popularity: number | null
    tagline: string | null
    status: string | null
    /** JSON {name, character, profilePath}[] */
    cast: string | null
    /** JSON {name, profilePath}[] */
    director: string | null
    /** JSON {imdb_id?, tvdb_id?} */
    externalIds: string | null
    createdAt: number | null
}

/** tv_shows: id INTEGER PRIMARY KEY, name TEXT NOT NULL. */
interface TVShowRow {
    id: number
    name: string
    posterPath: string | null
    backdropPath: string | null
    logoPath: string | null
    overview: string | null
    firstAirDate: string | null
    sourceId: string | null
    /** JSON string[] */
    genres: string | null
    voteAverage: number | null
    popularity: number | null
    status: string | null
    /** JSON {name, character, profilePath}[] */
    cast: string | null
    /** JSON {name, profilePath}[] */
    createdBy: string | null
    /** JSON {imdb_id?, tvdb_id?} */
    externalIds: string | null
    createdAt: number | null
}

/** seasons: PRIMARY KEY (tvShowId, seasonNumber) makes both key columns non-nullable. */
interface SeasonRow {
    tvShowId: number
    seasonNumber: number
    name: string | null
    posterPath: string | null
}

/** episodes: id is the local rowid; tmdbId is always written by saveTVShow from Episode.id. */
interface EpisodeRow {
    id: number
    tmdbId: number
    tvShowId: number
    seasonNumber: number
    episodeNumber: number
    name: string | null
    overview: string | null
    stillPath: string | null
}

/** video_files: id TEXT PRIMARY KEY. movieId/episodeId are the two mutually exclusive owners. */
interface VideoFileRow {
    id: string
    movieId: number | null
    episodeId: number | null
    name: string | null
    filePath: string | null
    webdavUrl: string | null
    sourceId: string | null
    manuallyMatched: number | null
}

/** watch_status: id TEXT PRIMARY KEY; setWatchStatus is the only writer and fills every column. */
interface WatchStatusRow {
    id: string
    mediaId: number
    mediaType: string
    watched: number | null
    timestamp: number
}

/** SQL NULL is how the schema stores "no value"; the domain types use an absent field. */
const orUndefined = <T>(value: T | null): T | undefined => value ?? undefined

/** watch_status.mediaType is TEXT in the column but 'movie' | 'tv' in the domain. */
const toMediaType = (value: string): WatchStatus['mediaType'] => (value === 'tv' ? 'tv' : 'movie')

const mapWatchStatus = (row: WatchStatusRow): WatchStatus => ({
    ...row,
    mediaType: toMediaType(row.mediaType),
    watched: row.watched === 1
})

/** A season as handed to the renderer: the domain shape keeps its tvShowId key. */
type BuiltSeason = Season & { tvShowId: number }

/** An episode as handed to the renderer: row ids survive next to the domain shape. */
type BuiltEpisode = Episode & { tmdbId: number, tvShowId: number, _dbId?: number }

/** Load every season/episode/file row for the given shows in three queries, then assemble in memory. */
const loadShowStructures = (showIds: number[]) => {
    const seasonsByShow = new Map<number, SeasonRow[]>()
    const episodesByShow = new Map<number, EpisodeRow[]>()
    const uniqueIds = Array.from(new Set(showIds))

    const videoFilesByEpisode = new Map<number, VideoFile[]>()

    if (uniqueIds.length === 0) return { seasonsByShow, episodesByShow, videoFilesByEpisode }

    for (const group of chunk(uniqueIds)) {
        const placeholders = group.map(() => '?').join(',')
        const seasons = stmt(`SELECT * FROM seasons WHERE tvShowId IN (${placeholders}) ORDER BY seasonNumber`)
            .all(...group) as SeasonRow[]
        for (const season of seasons) {
            const list = seasonsByShow.get(season.tvShowId)
            if (list) list.push(season)
            else seasonsByShow.set(season.tvShowId, [season])
        }
    }

    const episodeIds: number[] = []
    for (const group of chunk(uniqueIds)) {
        const placeholders = group.map(() => '?').join(',')
        const episodes = stmt(`SELECT * FROM episodes WHERE tvShowId IN (${placeholders}) ORDER BY seasonNumber, episodeNumber`)
            .all(...group) as EpisodeRow[]
        for (const episode of episodes) {
            episodeIds.push(episode.id)
            const list = episodesByShow.get(episode.tvShowId)
            if (list) list.push(episode)
            else episodesByShow.set(episode.tvShowId, [episode])
        }
    }

    return {
        seasonsByShow,
        episodesByShow,
        videoFilesByEpisode: loadVideoFilesBy('episodeId', episodeIds)
    }
}

const buildSeasons = (
    seasons: SeasonRow[],
    episodes: EpisodeRow[],
    videoFilesByEpisode: Map<number, VideoFile[]>,
    useTmdbEpisodeId: boolean
) => {
    const episodesBySeason = new Map<number, EpisodeRow[]>()
    for (const episode of episodes) {
        const list = episodesBySeason.get(episode.seasonNumber)
        if (list) list.push(episode)
        else episodesBySeason.set(episode.seasonNumber, [episode])
    }

    const toEpisode = (ep: EpisodeRow, videoFiles: VideoFile[]): BuiltEpisode => ({
        ...ep,
        name: ep.name ?? '',
        overview: ep.overview ?? '',
        stillPath: ep.stillPath ?? '',
        videoFiles
    })

    return seasons.map((season): BuiltSeason => ({
        ...season,
        name: season.name ?? '',
        posterPath: season.posterPath ?? '',
        episodes: (episodesBySeason.get(season.seasonNumber) || []).map(ep => {
            // Files are always keyed on the local rowid, whichever id the caller wants exposed.
            const episode = toEpisode(ep, videoFilesByEpisode.get(ep.id) || [])
            return useTmdbEpisodeId
                ? { ...episode, id: ep.tmdbId, _dbId: ep.id }
                : episode
        })
    }))
}

export const getAllMovies = (): Movie[] => {
    const db = getDb()
    const movies = db.prepare('SELECT * FROM movies ORDER BY title').all() as MovieRow[]
    const videoFilesByMovie = loadVideoFilesBy('movieId', movies.map(m => m.id))

    return movies.map(m => ({
        ...m,
        posterPath: m.posterPath ?? '',
        backdropPath: m.backdropPath ?? '',
        logoPath: orUndefined(m.logoPath),
        overview: m.overview ?? '',
        releaseDate: m.releaseDate ?? '',
        sourceId: m.sourceId ?? '',
        genres: parseJson<string[]>(m.genres, []),
        runtime: orUndefined(m.runtime),
        voteAverage: orUndefined(m.voteAverage),
        popularity: orUndefined(m.popularity),
        tagline: orUndefined(m.tagline),
        status: orUndefined(m.status),
        cast: parseJson<NonNullable<Movie['cast']>>(m.cast, []),
        director: parseJson<NonNullable<Movie['director']>>(m.director, []),
        externalIds: parseJson<NonNullable<Movie['externalIds']>>(m.externalIds, {}),
        createdAt: orUndefined(m.createdAt),
        videoFiles: videoFilesByMovie.get(m.id) || []
    }))
}

export const getMovie = (id: number): Movie | undefined => {
    const db = getDb()
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(id) as MovieRow | undefined
    if (!movie) return undefined

    return {
        ...movie,
        posterPath: movie.posterPath ?? '',
        backdropPath: movie.backdropPath ?? '',
        logoPath: orUndefined(movie.logoPath),
        overview: movie.overview ?? '',
        releaseDate: movie.releaseDate ?? '',
        sourceId: movie.sourceId ?? '',
        genres: parseJson<string[]>(movie.genres, []),
        runtime: orUndefined(movie.runtime),
        voteAverage: orUndefined(movie.voteAverage),
        popularity: orUndefined(movie.popularity),
        tagline: orUndefined(movie.tagline),
        status: orUndefined(movie.status),
        cast: parseJson<NonNullable<Movie['cast']>>(movie.cast, []),
        director: parseJson<NonNullable<Movie['director']>>(movie.director, []),
        externalIds: parseJson<NonNullable<Movie['externalIds']>>(movie.externalIds, {}),
        createdAt: orUndefined(movie.createdAt),
        videoFiles: loadVideoFilesBy('movieId', [id]).get(id) || []
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
    const existing = stmt('SELECT createdAt FROM movies WHERE id = ?').get(movie.id) as { createdAt?: number } | undefined
    const createdAt = existing?.createdAt || Date.now()

    const insert = stmt(`
        INSERT OR REPLACE INTO movies (
            id, title, posterPath, backdropPath, logoPath, overview, releaseDate, sourceId,
            genres, runtime, voteAverage, popularity, tagline, status,
            cast, director, externalIds, createdAt
        ) VALUES (
            @id, @title, @posterPath, @backdropPath, @logoPath, @overview, @releaseDate, @sourceId,
            @genres, @runtime, @voteAverage, @popularity, @tagline, @status,
            @cast, @director, @externalIds, @createdAt
        )
    `)

    const insertFile = stmt(`
        INSERT OR REPLACE INTO video_files (id, movieId, name, filePath, webdavUrl, sourceId, manuallyMatched)
        VALUES (@id, @movieId, @name, @filePath, @webdavUrl, @sourceId, @manuallyMatched)
    `)

    const clearFiles = stmt('DELETE FROM video_files WHERE movieId = ?')

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
            tagline: movie.tagline || null,
            status: movie.status || null,
            cast: JSON.stringify(movie.cast || []),
            director: JSON.stringify(movie.director || []),
            externalIds: JSON.stringify(movie.externalIds || {}),
            createdAt
        })

        clearFiles.run(movie.id)

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
    const shows = db.prepare('SELECT * FROM tv_shows ORDER BY name').all() as TVShowRow[]
    const { seasonsByShow, episodesByShow, videoFilesByEpisode } = loadShowStructures(shows.map(s => s.id))

    return shows.map(s => ({
        ...s,
        posterPath: s.posterPath ?? '',
        backdropPath: s.backdropPath ?? '',
        logoPath: orUndefined(s.logoPath),
        overview: s.overview ?? '',
        firstAirDate: s.firstAirDate ?? '',
        sourceId: s.sourceId ?? '',
        genres: parseJson<string[]>(s.genres, []),
        voteAverage: orUndefined(s.voteAverage),
        popularity: orUndefined(s.popularity),
        status: orUndefined(s.status),
        cast: parseJson<NonNullable<TVShow['cast']>>(s.cast, []),
        createdBy: parseJson<NonNullable<TVShow['createdBy']>>(s.createdBy, []),
        externalIds: parseJson<NonNullable<TVShow['externalIds']>>(s.externalIds, {}),
        createdAt: orUndefined(s.createdAt),
        seasons: buildSeasons(
            seasonsByShow.get(s.id) || [],
            episodesByShow.get(s.id) || [],
            videoFilesByEpisode,
            true
        )
    }))
}

export const getTVShow = (id: number): TVShow | undefined => {
    const db = getDb()
    const show = db.prepare('SELECT * FROM tv_shows WHERE id = ?').get(id) as TVShowRow | undefined
    if (!show) return undefined

    const { seasonsByShow, episodesByShow, videoFilesByEpisode } = loadShowStructures([id])

    return {
        ...show,
        posterPath: show.posterPath ?? '',
        backdropPath: show.backdropPath ?? '',
        logoPath: orUndefined(show.logoPath),
        overview: show.overview ?? '',
        firstAirDate: show.firstAirDate ?? '',
        sourceId: show.sourceId ?? '',
        genres: parseJson<string[]>(show.genres, []),
        voteAverage: orUndefined(show.voteAverage),
        popularity: orUndefined(show.popularity),
        status: orUndefined(show.status),
        cast: parseJson<NonNullable<TVShow['cast']>>(show.cast, []),
        createdBy: parseJson<NonNullable<TVShow['createdBy']>>(show.createdBy, []),
        externalIds: parseJson<NonNullable<TVShow['externalIds']>>(show.externalIds, {}),
        createdAt: orUndefined(show.createdAt),
        seasons: buildSeasons(
            seasonsByShow.get(id) || [],
            episodesByShow.get(id) || [],
            videoFilesByEpisode,
            false
        )
    }
}

export const saveTVShow = (show: TVShow) => {
    const db = getDb()

    const existing = stmt('SELECT createdAt FROM tv_shows WHERE id = ?').get(show.id) as { createdAt?: number } | undefined
    const createdAt = existing?.createdAt || Date.now()

    const insertShow = stmt(`
        INSERT OR REPLACE INTO tv_shows (
            id, name, posterPath, backdropPath, logoPath, overview, firstAirDate, sourceId,
            genres, voteAverage, popularity, status, cast, createdBy, externalIds, createdAt
        ) VALUES (
            @id, @name, @posterPath, @backdropPath, @logoPath, @overview, @firstAirDate, @sourceId,
            @genres, @voteAverage, @popularity, @status, @cast, @createdBy, @externalIds, @createdAt
        )
    `)

    const insertSeason = stmt(`
        INSERT OR REPLACE INTO seasons (tvShowId, seasonNumber, name, posterPath)
        VALUES (@tvShowId, @seasonNumber, @name, @posterPath)
    `)

    // (tvShowId, seasonNumber, episodeNumber) is unique since migration v2, so one upsert covers insert and update.
    const upsertEpisode = stmt(`
        INSERT INTO episodes (tmdbId, tvShowId, seasonNumber, episodeNumber, name, overview, stillPath)
        VALUES (@tmdbId, @tvShowId, @seasonNumber, @episodeNumber, @name, @overview, @stillPath)
        ON CONFLICT(tvShowId, seasonNumber, episodeNumber) DO UPDATE SET
            tmdbId = excluded.tmdbId,
            name = excluded.name,
            overview = excluded.overview,
            stillPath = excluded.stillPath
    `)

    const findEpisode = stmt('SELECT id FROM episodes WHERE tvShowId = ? AND seasonNumber = ? AND episodeNumber = ?')

    const insertFile = stmt(`
        INSERT OR REPLACE INTO video_files (id, episodeId, name, filePath, webdavUrl, sourceId, manuallyMatched)
        VALUES (@id, @episodeId, @name, @filePath, @webdavUrl, @sourceId, @manuallyMatched)
    `)

    const clearEpisodeFiles = stmt('DELETE FROM video_files WHERE episodeId = ?')

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
            status: show.status || null,
            cast: JSON.stringify(show.cast || []),
            createdBy: JSON.stringify(show.createdBy || []),
            externalIds: JSON.stringify(show.externalIds || {}),
            createdAt
        })

        for (const season of show.seasons) {
            insertSeason.run({ ...season, tvShowId: show.id })

            for (const episode of season.episodes) {
                upsertEpisode.run({
                    tmdbId: episode.id,
                    tvShowId: show.id,
                    seasonNumber: season.seasonNumber,
                    episodeNumber: episode.episodeNumber,
                    name: episode.name,
                    overview: episode.overview,
                    stillPath: episode.stillPath
                })

                const row = findEpisode.get(show.id, season.seasonNumber, episode.episodeNumber) as { id: number }
                const epId = row.id

                clearEpisodeFiles.run(epId)

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

/** Movie history rows keep NULL in the episode columns; the domain type declares them absent. */
type HistoryRow = Omit<HistoryItem, 'seasonNumber' | 'episodeNumber'> & {
    seasonNumber: number | null
    episodeNumber: number | null
}

export const getHistory = (): HistoryItem[] => {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM history ORDER BY timestamp DESC LIMIT 200').all() as HistoryRow[]

    return rows.map(({ seasonNumber, episodeNumber, ...rest }) => ({
        ...rest,
        seasonNumber: orUndefined(seasonNumber),
        episodeNumber: orUndefined(episodeNumber)
    }))
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

/** Only sources that were traversed completely may have their queue entries rebuilt. */
export const deleteUnscannedFilesForSources = (sourceIds: string[]): number => {
    if (sourceIds.length === 0) return 0
    const db = getDb()
    const placeholders = sourceIds.map(() => '?').join(',')
    const result = db.prepare(`DELETE FROM unscanned_files WHERE sourceId IN (${placeholders})`)
        .run(...sourceIds)
    return result.changes
}

export const deleteEmptyMovies = () => {
    const db = getDb()
    const orphans = db.prepare('DELETE FROM video_files WHERE movieId IS NOT NULL AND movieId NOT IN (SELECT id FROM movies)').run()
    const result = db.prepare('DELETE FROM movies WHERE id NOT IN (SELECT DISTINCT movieId FROM video_files WHERE movieId IS NOT NULL)').run()
    if (orphans.changes > 0) console.log(`Deleted ${orphans.changes} orphan video file rows`)
    console.log(`Deleted ${result.changes} empty movies`)
    return result.changes
}

export const deleteEmptyTVShows = () => {
    const db = getDb()

    const duplicates = dedupeEpisodes(db)
    if (duplicates > 0) {
        console.log(`Merged ${duplicates} duplicated episode groups`)
    }

    const orphans = db.prepare(`
        DELETE FROM video_files
        WHERE episodeId IS NOT NULL
            AND episodeId NOT IN (SELECT id FROM episodes)
    `).run()
    if (orphans.changes > 0) console.log(`Deleted ${orphans.changes} orphan video file rows`)

    const episodesResult = db.prepare('DELETE FROM episodes WHERE id NOT IN (SELECT DISTINCT episodeId FROM video_files WHERE episodeId IS NOT NULL)').run()
    console.log(`Deleted ${episodesResult.changes} empty episodes`)

    const seasonsResult = db.prepare('DELETE FROM seasons WHERE (tvShowId, seasonNumber) NOT IN (SELECT tvShowId, seasonNumber FROM episodes)').run()
    console.log(`Deleted ${seasonsResult.changes} empty seasons`)

    const showsResult = db.prepare('DELETE FROM tv_shows WHERE id NOT IN (SELECT DISTINCT tvShowId FROM seasons)').run()
    console.log(`Deleted ${showsResult.changes} empty TV shows`)

    return episodesResult.changes + seasonsResult.changes + showsResult.changes + orphans.changes
}

export const getFavorites = (): FavoriteItem[] => {
    const db = getDb()
    return db.prepare('SELECT * FROM favorites ORDER BY timestamp DESC').all() as FavoriteItem[]
}

export const addFavorite = (item: FavoriteItem) => {
    const db = getDb()
    db.prepare(`
        INSERT OR REPLACE INTO favorites (id, mediaId, mediaType, title, timestamp)
        VALUES (@id, @mediaId, @mediaType, @title, @timestamp)
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

export const syncHistoryPosters = () => {
    const db = getDb()

    db.prepare(`
        UPDATE history SET 
            posterPath = (SELECT posterPath FROM movies WHERE movies.id = history.mediaId),
            title = (SELECT title FROM movies WHERE movies.id = history.mediaId)
        WHERE mediaType = 'movie' AND EXISTS (SELECT 1 FROM movies WHERE movies.id = history.mediaId)
    `).run()

    db.prepare(`
        UPDATE history SET 
            posterPath = (SELECT posterPath FROM tv_shows WHERE tv_shows.id = history.mediaId),
            title = (SELECT name FROM tv_shows WHERE tv_shows.id = history.mediaId)
        WHERE mediaType = 'tv' AND EXISTS (SELECT 1 FROM tv_shows WHERE tv_shows.id = history.mediaId)
    `).run()

    console.log('Synced history posters with latest media data')
}

export const getWatchStatus = (mediaId: number, mediaType: string): WatchStatus | undefined => {
    const db = getDb()
    const result = db.prepare('SELECT * FROM watch_status WHERE mediaId = ? AND mediaType = ?')
        .get(mediaId, mediaType) as WatchStatusRow | undefined
    if (!result) return undefined
    return mapWatchStatus(result)
}

export const getAllWatchStatus = (): WatchStatus[] => {
    const db = getDb()
    const results = db.prepare('SELECT * FROM watch_status').all() as WatchStatusRow[]
    return results.map(mapWatchStatus)
}

export const setWatchStatus = (mediaId: number, mediaType: string, watched: boolean) => {
    const db = getDb()
    const id = `${mediaType}-${mediaId}`
    const timestamp = Date.now()
    db.prepare(`
        INSERT OR REPLACE INTO watch_status (id, mediaId, mediaType, watched, timestamp)
        VALUES (@id, @mediaId, @mediaType, @watched, @timestamp)
    `).run({
        id,
        mediaId,
        mediaType,
        watched: watched ? 1 : 0,
        timestamp
    })
}

export const toggleWatchStatus = (mediaId: number, mediaType: string): boolean => {
    const current = getWatchStatus(mediaId, mediaType)
    const newWatched = current ? !current.watched : true
    setWatchStatus(mediaId, mediaType, newWatched)
    return newWatched
}

