export interface Movie {
    id: number
    title: string
    posterPath: string
    releaseDate: string
    voteAverage?: number
    popularity?: number
    imdbVotes?: number
    imdbRating?: number
}

export interface TVShow {
    id: number
    name: string
    posterPath: string
    firstAirDate: string
    voteAverage?: number
    popularity?: number
    imdbVotes?: number
    imdbRating?: number
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

export type CombinedItem =
    | (Movie & { type: 'movie', sortKey: string, sortDate: string })
    | (TVShow & { type: 'tv', sortKey: string, sortDate: string })
