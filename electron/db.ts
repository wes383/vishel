import { Low } from 'lowdb'
import { JSONFilePreset } from 'lowdb/node'
import { app } from 'electron'
import path from 'node:path'

export interface VideoFile {
    id: string
    name: string
    filePath: string
    webdavUrl: string
    sourceId: string
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

export interface Data {
    movies: Movie[]
    tvShows: TVShow[]
    unscannedFiles: VideoFile[]
    history: HistoryItem[]
    lastScan: string
}

const defaultData: Data = { movies: [], tvShows: [], unscannedFiles: [], history: [], lastScan: '' }

const dbPath = path.join(app.getPath('userData'), 'db.json')

let dbInstance: Low<Data> | null = null

export const getDb = async (): Promise<Low<Data>> => {
    if (dbInstance) return dbInstance
    dbInstance = await JSONFilePreset<Data>(dbPath, defaultData)

    // Ensure history array exists for existing databases
    if (!dbInstance.data.history) {
        dbInstance.data.history = []
        await dbInstance.write()
    }

    return dbInstance
}
