export interface CastMember {
    name: string
    character?: string
    profilePath?: string | null
}

export interface CreditMember {
    name: string
    profilePath?: string | null
}

export interface Movie {
    id: number
    title: string
    posterPath: string
    releaseDate: string
    genres?: string[]
    cast?: CastMember[]
    director?: CreditMember[]
    voteAverage?: number
    popularity?: number
    createdAt?: number
}

export interface TVShow {
    id: number
    name: string
    posterPath: string
    firstAirDate: string
    genres?: string[]
    cast?: CastMember[]
    createdBy?: CreditMember[]
    voteAverage?: number
    popularity?: number
    createdAt?: number
}

export interface UnscannedFile {
    id: string
    name: string
    filePath: string
    sourceName?: string
    webdavUrl?: string
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

export type CombinedItem =
    | (Movie & { type: 'movie', sortKey: string, sortDate: string, createdAt?: number })
    | (TVShow & { type: 'tv', sortKey: string, sortDate: string, createdAt?: number })
