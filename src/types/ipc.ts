import type { Movie, TVShow, HistoryItem, FavoriteItem, WatchStatus, VideoFile } from '../../electron/db'
import type { RendererSettings, RendererSettingsPatch, RedactedSource, WritableSource } from '../../electron/settings'
import type { DataSource, ExternalLinkConfig } from '../../electron/store'
import type { ScanProgress, ScanResult } from '../../electron/scanner'
import type { VideoProbeMetadata } from '../../electron/mediaProbe'
import type { DetectedPlayer } from '../../electron/playerDetector'
import type { TmdbSearchResponse } from '../../electron/tmdbService'

export type MediaType = 'movie' | 'tv'
export type LibraryTab = 'all' | 'movies' | 'tv' | 'favorites' | 'history'

export interface ImdbRating {
    rating: number
    votes: number
}

export interface RemoteFileStat {
    filename: string
    basename: string
    lastmod: string
    size: number
    type: 'file' | 'directory'
}

/** Connection settings sent by the renderer: `password` is omitted to reuse the stored one. */
export interface SourceConnectionRequest extends Partial<DataSource['config']> {
    type: DataSource['type']
    id?: string
    hasPassword?: boolean
}

export interface ListDirectoryRequest {
    config: SourceConnectionRequest
    path: string
    sourceId?: string
}

export interface UnscannedFileEntry extends VideoFile {
    sourceName: string
}

export interface EpisodeMatchInfo {
    season: number
    episode: number
}

export interface MediaKey {
    mediaId: number
    mediaType: MediaType
}

export interface FavoriteDraft {
    mediaId: number
    mediaType: MediaType
    title: string
}

export interface PlayHistoryDraft {
    mediaId: number
    mediaType: MediaType
    title: string
    posterPath: string
    filePath: string
    seasonNumber?: number
    episodeNumber?: number
    episodeName?: string
}

export interface PlayVideoRequest {
    url: string
    title?: string
    history?: PlayHistoryDraft
}

export interface MatchResult {
    success?: boolean
    mediaId?: number
    mediaType?: MediaType
    title?: string
}

export interface LibraryStats {
    movies: number
    tvShows: number
}

/** One entry per allow-listed invoke channel: args tuple and resolved payload. */
export interface IpcRequestMap {
    'get-settings': { args: []; result: RendererSettings }
    'save-settings': { args: [RendererSettingsPatch]; result: boolean }
    'get-library-stats': { args: []; result: LibraryStats }
    'test-connection': { args: [SourceConnectionRequest]; result: boolean }
    'list-directory': { args: [ListDirectoryRequest]; result: RemoteFileStat[] }
    'scan-library': { args: [boolean?]; result: ScanResult }
    'full-rescan-library': { args: []; result: ScanResult }
    'cancel-scan': { args: []; result: boolean }
    'get-movies': { args: []; result: Movie[] }
    'get-movie': { args: [number]; result: Movie | undefined }
    'get-tv-shows': { args: []; result: TVShow[] }
    'get-tv-show': { args: [number]; result: TVShow | undefined }
    'refresh-metadata': { args: [MediaKey]; result: { success: boolean } }
    'get-unscanned-files': { args: []; result: UnscannedFileEntry[] }
    'play-video': { args: [PlayVideoRequest]; result: { autoMarked: boolean } }
    'detect-players': { args: []; result: DetectedPlayer[] }
    'get-history': { args: []; result: HistoryItem[] }
    'delete-history-item': { args: [string]; result: boolean }
    'open-directory-dialog': { args: []; result: string | null }
    'open-external': { args: [string]; result: boolean }
    'get-imdb-rating': { args: [string]; result: ImdbRating | null }
    'probe-video-metadata': { args: [{ url: string; sourceId?: string }]; result: VideoProbeMetadata | null }
    'search-tmdb': { args: [{ query: string; type: MediaType; page?: number }]; result: TmdbSearchResponse }
    'manual-match-file': { args: [{ fileId: string; tmdbId: number; mediaType: MediaType; episodeInfo?: EpisodeMatchInfo }]; result: MatchResult }
    'rematch-media': { args: [{ oldTmdbId: number; newTmdbId: number; mediaType: MediaType }]; result: MatchResult }
    'rematch-single-file': { args: [{
        oldTmdbId: number
        oldMediaType: MediaType
        fileId: string
        newTmdbId: number
        newMediaType: MediaType
        episodeInfo?: EpisodeMatchInfo
    }]; result: MatchResult }
    'get-favorites': { args: []; result: FavoriteItem[] }
    'add-favorite': { args: [FavoriteDraft]; result: boolean }
    'remove-favorite': { args: [MediaKey]; result: boolean }
    'get-app-version': { args: []; result: string }
    'get-all-watch-status': { args: []; result: WatchStatus[] }
    'toggle-watch-status': { args: [MediaKey]; result: boolean }
}

/** Channels the main process pushes; payload per channel. */
export interface IpcEventMap {
    'scan-progress': ScanProgress
    'navigate-to-tab': LibraryTab
}

export type { RedactedSource, WritableSource, ExternalLinkConfig }
