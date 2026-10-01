import {
    getDb,
    saveMovie,
    saveTVShow,
    addUnscannedFile,
    deleteUnscannedFilesForSources,
    getAllMovies,
    getAllTVShows,
    deleteEmptyMovies,
    deleteEmptyTVShows,
    Movie,
    TVShow,
    VideoFile,
    syncHistoryPosters
} from './db'
import {
    searchMovie,
    getMovieDetails,
    searchTVShow,
    getTVShowDetails,
    getSeasonDetails,
    pickLogos,
    isTransientTmdbError,
    isAuthTmdbError,
    TmdbError,
    TmdbSearchResult,
    TmdbSeasonDetails
} from './tmdbService'
import {
    cleanFilename,
    isVideoFile,
    parseEpisodeInfo,
    pickMovieMatch,
    pickShowMatch,
    type EpisodeInfo
} from './mediaNaming'
import { listDirectory } from './webdavService'
import { listLocalDirectory } from './localFileService'
import { listDirectory as listSMBDirectory } from './smbService'
import { DataSource, getSources } from './store'
import path from 'node:path'

/** Cap parallel per-file work: a 2000 file directory must not enqueue 2000 tasks. */
const FILE_CONCURRENCY = 8
/** Progress events are throttled so a long scan does not flood the renderer. */
const PROGRESS_INTERVAL_MS = 250

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

/** File identity is per source: two sources may expose the same relative path. */
const fileKey = (sourceId: string | undefined, filePath: string) => `${sourceId ?? ''}|${filePath}`

export type ScanPhase = 'preparing' | 'refresh' | 'scanning' | 'saving' | 'complete' | 'partial' | 'cancelled' | 'failed'

export interface ScanProgress {
    phase: ScanPhase
    /** English prose for logs and devtools only; the UI renders `phase`, so this is never displayed. */
    status?: string
    processed?: number
    sourceName?: string
    file?: string
    failedSources?: ScanFailure[]
    error?: string
    done?: boolean
}

export interface ScanFailure {
    id: string
    name: string
    error: string
}

/** 'skipped' is an outcome, not a phase: a second scan request is refused before any phase runs. */
export type ScanOutcome = ScanPhase | 'skipped'

export interface ScanResult {
    status: Extract<ScanOutcome, 'complete' | 'partial' | 'cancelled' | 'failed' | 'skipped'>
    newMovies: number
    newTVShows: number
    prunedFiles: number
    unscannedFiles: number
    failedSources: ScanFailure[]
    tmdbErrors?: number
    error?: string
}

type ScanEntry =
    | { type: 'movie', object: Movie, file: VideoFile }
    | { type: 'episode', object: TVShow, file: VideoFile }

interface ScanState {
    newMovies: Map<number, Movie>
    currentMovies: Movie[]
    newTVShows: Map<number, TVShow>
    currentTVShows: TVShow[]
    seasonDetailsCache: Map<string, TmdbSeasonDetails>
    pendingMovies: Map<number, Promise<void>>
    pendingTVShows: Map<number, Promise<void>>
    pendingSeasons: Map<string, Promise<void>>
    unscannedFiles: VideoFile[]

    foundKeys: Set<string>
    fileMap: Map<string, ScanEntry>
    dirtyMovieIds: Set<number>
    dirtyTvIds: Set<number>
    forceRefresh: boolean

    configuredSourceIds: Set<string>
    successfulSourceIds: Set<string>
    failedSources: Map<string, ScanFailure>

    processedFiles: number
    tmdbErrors: number
    fatalError: Error | null
}

class Semaphore {
    private active = 0
    private readonly waiters: (() => void)[] = []

    constructor(private readonly max: number) { }

    async run<T>(fn: () => Promise<T>): Promise<T> {
        if (this.active >= this.max) {
            await new Promise<void>(resolve => this.waiters.push(resolve))
        }
        this.active++
        try {
            return await fn()
        } finally {
            this.active--
            this.waiters.shift()?.()
        }
    }
}

const fileSlots = new Semaphore(FILE_CONCURRENCY)

class ScanAbortError extends Error {
    constructor() {
        super('Scan cancelled')
        this.name = 'ScanAbortError'
    }
}

const throwIfAborted = (signal?: AbortSignal) => {
    if (signal?.aborted) throw new ScanAbortError()
}

const markSourceFailed = (state: ScanState, source: DataSource, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Source ${source.name} scan incomplete:`, error)
    state.failedSources.set(source.id, { id: source.id, name: source.name, error: message })
}

/** The entry shape every source listing (WebDAV, local, SMB) provides to the walk. */
interface DirectoryEntry {
    filename: string
    type: 'file' | 'directory'
    size: number
}

const scanDirectoryRecursive = async (
    source: DataSource,
    dirPath: string,
    state: ScanState,
    signal?: AbortSignal
) => {
    let items: DirectoryEntry[] = []
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
    } else {
        return
    }

    const tasks = items.map(async (item) => {
        throwIfAborted(signal)
        const targetPath = item.filename

        if (item.type === 'directory') {
            try {
                await scanDirectoryRecursive(source, targetPath, state, signal)
            } catch (err) {
                if (err instanceof ScanAbortError) throw err
                if (source.type === 'webdav' || source.type === 'smb') {
                    try {
                        const decodedPath = decodeURIComponent(targetPath)
                        if (decodedPath !== targetPath) {
                            await scanDirectoryRecursive(source, decodedPath, state, signal)
                            return
                        }
                    } catch (retryErr) {
                        if (retryErr instanceof ScanAbortError) throw retryErr
                    }
                }
                // A subdirectory we cannot read makes the whole source untrustworthy for pruning.
                markSourceFailed(state, source, err)
            }
            return
        }

        if (item.type !== 'file' || !isVideoFile(item.filename)) return

        try {
            await fileSlots.run(() => processFile(source, item.filename, state, signal))
        } catch (error) {
            if (error instanceof ScanAbortError) throw error
            // A single unreadable file must not abort the source walk; only a rejected
            // API key stops the scan, because otherwise everything would look unmatched.
            if (error instanceof TmdbError && !isTransientTmdbError(error)) {
                state.fatalError = error
                throw error
            }
            console.error(`Skipped ${item.filename}: ${(error as Error).message}`)
        }
    })

    await Promise.all(tasks)
}

const processFile = async (
    source: DataSource,
    filePath: string,
    state: ScanState,
    signal?: AbortSignal
) => {
    throwIfAborted(signal)

    const key = fileKey(source.id, filePath)
    state.foundKeys.add(key)
    state.processedFiles++

    const existing = state.fileMap.get(key)
    if (existing) {
        const newFile = createVideoFile(source, filePath)
        if (existing.file.webdavUrl !== newFile.webdavUrl) {
            existing.file.webdavUrl = newFile.webdavUrl
            if (existing.type === 'movie') state.dirtyMovieIds.add(existing.object.id)
            else state.dirtyTvIds.add(existing.object.id)
        }
        return
    }

    const episodeInfo = parseEpisodeInfo(filePath)

    if (episodeInfo) {
        await processEpisodeFile(source, filePath, episodeInfo, state, signal)
    } else {
        await processMovieFile(source, filePath, state, signal)
    }
}

const getOrCreateTVShow = async (
    source: DataSource,
    tvId: number,
    state: ScanState
): Promise<TVShow | undefined> => {
    const known = state.currentTVShows.find(s => s.id === tvId) || state.newTVShows.get(tvId)
    if (known) return known

    if (state.pendingTVShows.has(tvId)) {
        await state.pendingTVShows.get(tvId)
        return state.newTVShows.get(tvId)
    }

    const processPromise = (async () => {
        const details = await getTVShowDetails(tvId)
        if (!details) return

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

        state.newTVShows.set(tvId, {
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
        })
    })()

    state.pendingTVShows.set(tvId, processPromise)
    try {
        await processPromise
    } finally {
        state.pendingTVShows.delete(tvId)
    }

    return state.newTVShows.get(tvId)
}

const getSeasonDetailsCached = async (tvId: number, seasonNumber: number, state: ScanState) => {
    const cacheKey = `${tvId}:${seasonNumber}`
    if (state.seasonDetailsCache.has(cacheKey)) return state.seasonDetailsCache.get(cacheKey)

    if (state.pendingSeasons.has(cacheKey)) {
        await state.pendingSeasons.get(cacheKey)
        return state.seasonDetailsCache.get(cacheKey)
    }

    const seasonPromise = (async () => {
        try {
            const details = await getSeasonDetails(tvId, seasonNumber)
            if (details) state.seasonDetailsCache.set(cacheKey, details)
        } catch (e) {
            if (isTransientTmdbError(e)) {
                state.tmdbErrors++
                if (isAuthTmdbError(e)) state.fatalError = e as Error
            }
            console.warn(`Failed to fetch season details for ${tvId} S${seasonNumber}:`, (e as Error).message)
        }
    })()

    state.pendingSeasons.set(cacheKey, seasonPromise)
    try {
        await seasonPromise
    } finally {
        state.pendingSeasons.delete(cacheKey)
    }

    return state.seasonDetailsCache.get(cacheKey)
}

const processEpisodeFile = async (
    source: DataSource,
    filePath: string,
    episodeInfo: EpisodeInfo,
    state: ScanState,
    signal?: AbortSignal
) => {
    const { year } = cleanFilename(filePath)
    console.log(`Processing TV Show: ${filePath} -> ${episodeInfo.name} S${episodeInfo.season}E${episodeInfo.episode} (${year || 'no year'})`)

    let searchResults: TmdbSearchResult[]
    try {
        const searchData = await searchTVShow(episodeInfo.name, episodeInfo.season === 1 ? year : undefined)
        searchResults = searchData.results
    } catch (error) {
        state.tmdbErrors++
        if (isAuthTmdbError(error)) state.fatalError = error as Error
        console.error(`TMDB lookup failed for ${filePath}:`, (error as Error).message)
        // Keep the file out of the manual review queue when TMDB was unreachable.
        throw error
    }

    throwIfAborted(signal)

    if (searchResults.length === 0) {
        console.warn(`No TV show match found for: ${filePath}`)
        state.unscannedFiles.push(createVideoFile(source, filePath))
        return
    }

    const bestMatch = pickShowMatch(searchResults, year)
    if (!bestMatch) {
        state.unscannedFiles.push(createVideoFile(source, filePath))
        return
    }

    const tvShow = await getOrCreateTVShow(source, bestMatch.id, state)
    if (!tvShow) {
        state.unscannedFiles.push(createVideoFile(source, filePath))
        return
    }

    let season = tvShow.seasons.find(s => s.seasonNumber === episodeInfo.season)
    const seasonDetails = await getSeasonDetailsCached(bestMatch.id, episodeInfo.season, state)

    if (!season) {
        season = tvShow.seasons.find(s => s.seasonNumber === episodeInfo.season)
    }

    if (!season) {
        const newSeason = {
            seasonNumber: episodeInfo.season,
            name: seasonDetails?.name || `Season ${episodeInfo.season}`,
            posterPath: seasonDetails?.poster_path || '',
            episodes: []
        }
        tvShow.seasons.push(newSeason)
        season = newSeason
    }

    const episodeMeta = seasonDetails?.episodes?.find(e => e.episode_number === episodeInfo.episode)

    let episode = season.episodes.find(e => e.episodeNumber === episodeInfo.episode)
    if (!episode) {
        episode = {
            id: episodeMeta?.id || 0,
            episodeNumber: episodeInfo.episode,
            seasonNumber: episodeInfo.season,
            name: episodeMeta?.name || `Episode ${episodeInfo.episode}`,
            overview: episodeMeta?.overview || '',
            stillPath: episodeMeta?.still_path || '',
            videoFiles: []
        }
        season.episodes.push(episode)
    } else if (episodeMeta && (!episode.name || episode.name.startsWith('Episode '))) {
        episode.id = episodeMeta.id || episode.id
        episode.name = episodeMeta.name || episode.name
        episode.overview = episodeMeta.overview || episode.overview
        episode.stillPath = episodeMeta.still_path || episode.stillPath
    }

    const newFile = createVideoFile(source, filePath)
    episode.videoFiles.push(newFile)
    state.dirtyTvIds.add(tvShow.id)
    state.fileMap.set(fileKey(source.id, filePath), { type: 'episode', object: tvShow, file: newFile })
}

const getOrCreateMovie = async (source: DataSource, movieId: number, state: ScanState): Promise<Movie | undefined> => {
    const known = state.currentMovies.find(m => m.id === movieId) || state.newMovies.get(movieId)
    if (known) return known

    if (state.pendingMovies.has(movieId)) {
        await state.pendingMovies.get(movieId)
        return state.newMovies.get(movieId)
    }

    const processPromise = (async () => {
        const details = await getMovieDetails(movieId)
        if (!details) return

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

        state.newMovies.set(movieId, {
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
            videoFiles: [],
            externalIds: details.external_ids
        })
    })()

    state.pendingMovies.set(movieId, processPromise)
    try {
        await processPromise
    } finally {
        state.pendingMovies.delete(movieId)
    }

    return state.newMovies.get(movieId)
}

const processMovieFile = async (
    source: DataSource,
    filePath: string,
    state: ScanState,
    signal?: AbortSignal
) => {
    const { name: query, year } = cleanFilename(filePath)
    console.log(`Processing movie: ${filePath} -> ${query} (${year || 'no year'})`)

    let searchResults: TmdbSearchResult[]
    try {
        const searchData = await searchMovie(query, year)
        searchResults = searchData.results
    } catch (error) {
        state.tmdbErrors++
        if (isAuthTmdbError(error)) state.fatalError = error as Error
        console.error(`TMDB lookup failed for ${filePath}:`, (error as Error).message)
        throw error
    }

    throwIfAborted(signal)

    if (searchResults.length === 0) {
        console.warn(`No movie match found for: ${filePath}`)
        state.unscannedFiles.push(createVideoFile(source, filePath))
        return
    }

    const bestMatch = pickMovieMatch(searchResults, year)
    if (!bestMatch) {
        console.warn(`Year ${year} does not match any TMDB candidate for: ${filePath}`)
        state.unscannedFiles.push(createVideoFile(source, filePath))
        return
    }

    const movie = await getOrCreateMovie(source, bestMatch.id, state)
    if (!movie) {
        state.unscannedFiles.push(createVideoFile(source, filePath))
        return
    }

    const newFile = createVideoFile(source, filePath)
    movie.videoFiles.push(newFile)
    state.dirtyMovieIds.add(movie.id)
    state.fileMap.set(fileKey(source.id, filePath), { type: 'movie', object: movie, file: newFile })
}

const refreshExistingMetadata = async (
    state: ScanState,
    signal: AbortSignal | undefined,
    emit: (progress: ScanProgress) => void
) => {
    emit({ phase: 'refresh', status: 'Refreshing metadata for existing items...' })
    console.log('Refreshing metadata for existing items...')

    for (const movie of state.currentMovies) {
        throwIfAborted(signal)
        try {
            const details = await getMovieDetails(movie.id)
            if (details) {
                const { localized: logoPath, english: logoPathEn } = pickLogos(details.images)

                const directors = details.credits?.crew?.filter(c => c.job === 'Director')
                const directorObj = directors?.map(d => ({
                    name: d.name,
                    profilePath: d.profile_path || null
                }))

                movie.title = details.title
                movie.releaseDate = details.release_date ?? ''
                movie.runtime = details.runtime ?? undefined
                movie.genres = details.genres?.map(g => g.name)
                movie.cast = details.credits?.cast?.slice(0, 10).map(c => ({
                    name: c.name,
                    character: c.character ?? '',
                    profilePath: c.profile_path ?? ''
                }))
                movie.director = directorObj
                movie.externalIds = details.external_ids

                movie.posterPath = details.poster_path ?? ''
                movie.backdropPath = details.backdrop_path ?? ''
                movie.overview = details.overview
                // Assigned outright: keeping the previous value here would resurrect the logo of a
                // language the user has moved away from.
                movie.logoPath = logoPath
                movie.logoPathEn = logoPathEn
                movie.voteAverage = details.vote_average
                movie.status = details.status

                state.dirtyMovieIds.add(movie.id)
            }
        } catch (e) {
            if (e instanceof ScanAbortError) throw e
            if (isTransientTmdbError(e)) state.tmdbErrors++
            if (isAuthTmdbError(e)) state.fatalError = e as Error
            console.error(`Failed to refresh metadata for movie ${movie.title}:`, (e as Error).message)
        }
    }

    for (const show of state.currentTVShows) {
        throwIfAborted(signal)
        try {
            const details = await getTVShowDetails(show.id)
            if (details) {
                const { localized: logoPath, english: logoPathEn } = pickLogos(details.images)

                const createdBy = details.created_by?.map(c => ({
                    name: c.name,
                    profilePath: c.profile_path ?? ''
                }))

                show.name = details.name
                show.firstAirDate = details.first_air_date ?? ''
                show.genres = details.genres?.map(g => g.name)
                show.cast = details.credits?.cast?.slice(0, 10).map(c => ({
                    name: c.name,
                    character: c.character ?? '',
                    profilePath: c.profile_path ?? ''
                }))
                show.createdBy = createdBy
                show.externalIds = details.external_ids

                show.posterPath = details.poster_path ?? ''
                show.backdropPath = details.backdrop_path ?? ''
                show.overview = details.overview
                show.logoPath = logoPath
                show.logoPathEn = logoPathEn
                show.voteAverage = details.vote_average
                show.status = details.status

                state.dirtyTvIds.add(show.id)
            }

            for (const season of show.seasons) {
                throwIfAborted(signal)
                try {
                    const seasonCacheKey = `${show.id}:${season.seasonNumber}`
                    const seasonDetails = await getSeasonDetails(show.id, season.seasonNumber)

                    if (seasonDetails) {
                        state.seasonDetailsCache.set(seasonCacheKey, seasonDetails)

                        season.name = seasonDetails.name || season.name
                        if (seasonDetails.poster_path) {
                            season.posterPath = seasonDetails.poster_path
                        }

                        for (const episode of season.episodes) {
                            const episodeMeta = seasonDetails.episodes?.find(e => e.episode_number === episode.episodeNumber)
                            if (episodeMeta) {
                                episode.id = episodeMeta.id || episode.id
                                episode.name = episodeMeta.name || episode.name
                                episode.overview = episodeMeta.overview || episode.overview
                                episode.stillPath = episodeMeta.still_path || episode.stillPath
                                state.dirtyTvIds.add(show.id)
                            }
                        }
                    }
                } catch (e) {
                    if (e instanceof ScanAbortError) throw e
                    if (isTransientTmdbError(e)) state.tmdbErrors++
                    if (isAuthTmdbError(e)) state.fatalError = e as Error
                    console.error(`Failed to refresh season ${season.seasonNumber} metadata for TV show ${show.name}:`, (e as Error).message)
                }
            }
        } catch (e) {
            if (e instanceof ScanAbortError) throw e
            if (isTransientTmdbError(e)) state.tmdbErrors++
            if (isAuthTmdbError(e)) state.fatalError = e as Error
            console.error(`Failed to refresh metadata for TV show ${show.name}:`, (e as Error).message)
        }
    }
}

const pruneMissingFiles = (state: ScanState) => {
    // Only entries of sources that were traversed completely may be removed. A source that is
    // configured but disappeared from settings counts as removed by the user, so it is prunable too.
    const prunable = (sourceId: string | undefined) =>
        state.successfulSourceIds.has(sourceId ?? '') || !state.configuredSourceIds.has(sourceId ?? '')

    let prunedCount = 0

    for (const movie of state.currentMovies) {
        const originalCount = movie.videoFiles.length
        const missing = movie.videoFiles.filter(f =>
            prunable(f.sourceId || movie.sourceId) && !state.foundKeys.has(fileKey(f.sourceId || movie.sourceId, f.filePath))
        )

        if (missing.length > 0) {
            console.log(`[Prune] Movie "${movie.title}" (ID: ${movie.id}) has ${missing.length} missing files:`)
            missing.forEach(f => console.log(`  - Missing: ${f.filePath}`))
        }

        movie.videoFiles = movie.videoFiles.filter(f =>
            !missing.includes(f)
        )

        if (movie.videoFiles.length !== originalCount) {
            state.dirtyMovieIds.add(movie.id)
            prunedCount += originalCount - movie.videoFiles.length
        }
    }

    for (const show of state.currentTVShows) {
        let showChanged = false
        for (const season of show.seasons) {
            for (const episode of season.episodes) {
                const originalCount = episode.videoFiles.length
                const missing = episode.videoFiles.filter(f => {
                    const ownerSourceId = f.sourceId || show.sourceId
                    return prunable(ownerSourceId) && !state.foundKeys.has(fileKey(ownerSourceId, f.filePath))
                })

                if (missing.length > 0) {
                    console.log(`[Prune] Show "${show.name}" S${season.seasonNumber}E${episode.episodeNumber} has ${missing.length} missing files:`)
                    missing.forEach(f => console.log(`  - Missing: ${f.filePath}`))
                }

                episode.videoFiles = episode.videoFiles.filter(f => !missing.includes(f))

                if (episode.videoFiles.length !== originalCount) {
                    showChanged = true
                    prunedCount += originalCount - episode.videoFiles.length
                }
            }
        }
        if (showChanged) {
            state.dirtyTvIds.add(show.id)
        }
    }

    console.log(`Pruned ${prunedCount} missing files`)
    return prunedCount
}

export let isScanning = false

export const getScanStatus = () => isScanning

const emptyResult = (status: ScanResult['status'] = 'cancelled'): ScanResult => ({
    status,
    newMovies: 0,
    newTVShows: 0,
    prunedFiles: 0,
    unscannedFiles: 0,
    failedSources: []
})

export const scanMovies = async (
    onProgress?: (data: ScanProgress) => void,
    forceRefresh: boolean = false,
    signal?: AbortSignal
): Promise<ScanResult> => {
    if (isScanning) {
        console.log('Scan already in progress, skipping...')
        return emptyResult()
    }

    isScanning = true
    console.log('Starting media scan...')

    let stateRef: ScanState | undefined

    let lastEmit = 0
    const emit = (progress: ScanProgress) => {
        if (!onProgress) return
        const now = Date.now()
        const isTerminal = progress.done || progress.phase !== 'scanning'
        if (isTerminal || now - lastEmit >= PROGRESS_INTERVAL_MS) {
            lastEmit = now
            onProgress(progress)
        }
    }

    try {
        const sources = getSources()
        const configuredSourceIds = new Set(sources.map(s => s.id))

        emit({ phase: 'preparing', status: 'Loading library...' })
        const currentMovies = getAllMovies()
        const currentTVShows = getAllTVShows()

        const fileMap = new Map<string, ScanEntry>()

        currentMovies.forEach(m => {
            m.videoFiles.forEach(f => {
                fileMap.set(fileKey(f.sourceId || m.sourceId, f.filePath), { type: 'movie', object: m, file: f })
            })
        })

        currentTVShows.forEach(s => {
            s.seasons.forEach(season => {
                season.episodes.forEach(ep => {
                    ep.videoFiles.forEach(f => {
                        fileMap.set(fileKey(f.sourceId || s.sourceId, f.filePath), { type: 'episode', object: s, file: f })
                    })
                })
            })
        })

        const state: ScanState = {
            newMovies: new Map(),
            currentMovies,
            newTVShows: new Map(),
            currentTVShows,
            seasonDetailsCache: new Map(),
            pendingMovies: new Map(),
            pendingTVShows: new Map(),
            pendingSeasons: new Map(),
            unscannedFiles: [],
            foundKeys: new Set(),
            fileMap,
            dirtyMovieIds: new Set(),
            dirtyTvIds: new Set(),
            forceRefresh,
            configuredSourceIds,
            successfulSourceIds: new Set(),
            failedSources: new Map(),
            processedFiles: 0,
            tmdbErrors: 0,
            fatalError: null
        }
        stateRef = state

        console.log(`Scan mode: ${forceRefresh ? 'Full Rescan (Force Refresh)' : 'Quick Scan (Incremental)'}`)

        if (forceRefresh) {
            await refreshExistingMetadata(state, signal, emit)
            if (state.fatalError) throw state.fatalError
        }

        for (const source of sources) {
            throwIfAborted(signal)
            console.log(`Scanning source: ${source.name} (${source.type})`)
            emit({ phase: 'scanning', status: `Scanning ${source.name}...`, sourceName: source.name, processed: state.processedFiles })

            let sourceOk = true
            for (const scanPath of source.paths || []) {
                try {
                    await scanDirectoryRecursive(source, scanPath, state, signal)
                } catch (error) {
                    if (error instanceof ScanAbortError) throw error
                    if (error instanceof TmdbError && !isTransientTmdbError(error)) {
                        state.fatalError = error
                        throw error
                    }
                    sourceOk = false
                    markSourceFailed(state, source, error)
                }
                if (state.fatalError) throw state.fatalError
            }

            if (sourceOk) {
                state.successfulSourceIds.add(source.id)
            }
        }

        throwIfAborted(signal)

        emit({ phase: 'scanning', status: 'Processing changes...', processed: state.processedFiles })
        console.log(`Total found files in scan: ${state.foundKeys.size}`)
        const prunedFiles = pruneMissingFiles(state)

        emit({ phase: 'saving', status: 'Saving metadata...' })

        const db = getDb()

        const saveTransaction = db.transaction(() => {
            if (state.newMovies.size > 0 || state.newTVShows.size > 0) {
                console.log('--- Save Transaction Summary ---')
                console.log(`New Movies: ${state.newMovies.size}`)
                console.log(`New TV Shows: ${state.newTVShows.size}`)
                state.newTVShows.forEach(s => {
                    console.log(`  Show: ${s.name} (S:${s.seasons.length} seasons)`)
                    s.seasons.forEach(se => {
                        console.log(`    Season ${se.seasonNumber}: ${se.episodes.length} episodes`)
                    })
                })
                console.log('--------------------------------')
            }

            for (const movie of state.newMovies.values()) {
                saveMovie(movie)
            }
            for (const show of state.newTVShows.values()) {
                saveTVShow(show)
            }

            for (const id of state.dirtyMovieIds) {
                const movie = state.currentMovies.find(m => m.id === id)
                if (movie) saveMovie(movie)
            }

            for (const id of state.dirtyTvIds) {
                const show = state.currentTVShows.find(s => s.id === id)
                if (show) saveTVShow(show)
            }

            // Rebuild the review queue atomically and only for sources we fully traversed.
            deleteUnscannedFilesForSources([
                ...Array.from(state.successfulSourceIds),
                ...Array.from(state.configuredSourceIds).filter(id => !state.failedSources.has(id))
            ])
            for (const file of state.unscannedFiles) {
                addUnscannedFile(file)
            }

            deleteEmptyMovies()
            deleteEmptyTVShows()
        })

        saveTransaction()

        // Sync history posters during full rescan
        if (forceRefresh) {
            emit({ phase: 'saving', status: 'Syncing history...' })
            syncHistoryPosters()
        }

        const failedSources = Array.from(state.failedSources.values())
        console.log(`Scan complete: Added ${state.newMovies.size} movies and ${state.newTVShows.size} TV shows`)

        if (failedSources.length > 0) {
            console.warn(`Scan finished with warnings: ${failedSources.map(f => f.name).join(', ')}`)
        }

        emit({
            phase: failedSources.length > 0 || state.tmdbErrors > 0 ? 'partial' : 'complete',
            status: failedSources.length > 0
                ? `Scan finished with warnings (${failedSources.length} source(s) incomplete)`
                : state.tmdbErrors > 0
                    ? `Scan complete, but ${state.tmdbErrors} TMDB request(s) failed - unmatched items may need a re-scan`
                    : 'Scan complete!',
            processed: state.processedFiles,
            failedSources,
            done: true
        })

        return {
            status: failedSources.length > 0 ? 'partial' : 'complete',
            newMovies: state.newMovies.size,
            newTVShows: state.newTVShows.size,
            prunedFiles,
            unscannedFiles: state.unscannedFiles.length,
            failedSources,
            tmdbErrors: state.tmdbErrors
        }
    } catch (error) {
        if (error instanceof ScanAbortError || signal?.aborted) {
            console.warn('Scan cancelled')
            emit({ phase: 'cancelled', status: 'Scan cancelled', done: true })
            return emptyResult('cancelled')
        }

        const message = error instanceof Error ? error.message : String(error)
        console.error('Scan failed:', message)

        if (isAuthTmdbError(error)) {
            emit({ phase: 'failed', status: 'Scan failed: TMDB API key rejected. Update it in Settings.', error: message, done: true })
        } else {
            emit({ phase: 'failed', status: `Scan failed: ${message}`, error: message, done: true })
        }

        return {
            status: 'failed',
            newMovies: 0,
            newTVShows: 0,
            prunedFiles: 0,
            unscannedFiles: 0,
            failedSources: Array.from(stateRef?.failedSources.values() ?? []),
            error: message
        }
    } finally {
        isScanning = false
    }
}
