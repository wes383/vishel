import axios, { type AxiosInstance } from 'axios'
import store from './store'
import type { TmdbMovieDetails, TmdbSeasonDetails, TmdbTVDetails } from './tmdbTypes'

export type {
    TmdbCredits,
    TmdbEpisode,
    TmdbExternalIds,
    TmdbGenre,
    TmdbImage,
    TmdbImages,
    TmdbMovieDetails,
    TmdbPerson,
    TmdbSeasonDetails,
    TmdbSeasonSummary,
    TmdbTVDetails
} from './tmdbTypes'

const BASE_URL = 'https://api.themoviedb.org/3'
const REQUEST_TIMEOUT_MS = 15000
const MAX_ATTEMPTS = 3
const BACKOFF_BASE_MS = 1000

export class TmdbError extends Error {
    readonly status: number | undefined
    /** transient = worth retrying later (network / 429 / 5xx); non-transient = bad request or key */
    readonly transient: boolean

    constructor(message: string, options: { status?: number, transient?: boolean } = {}) {
        super(message)
        this.name = 'TmdbError'
        this.status = options.status
        this.transient = options.transient ?? true
    }
}

export const isTransientTmdbError = (error: unknown): boolean => {
    if (error instanceof TmdbError) return error.transient
    return true
}

export const isAuthTmdbError = (error: unknown): boolean =>
    error instanceof TmdbError && (error.status === 401 || error.status === 403)

/** TMDB v4 read keys are JWT-shaped and must be sent as a Bearer header; v3 keys only work as a query param. */
const isBearerKey = (apiKey: string) => apiKey.split('.').length === 3

let cachedClient: AxiosInstance | null = null
let cachedApiKey: string | null = null

export const getTMDBClient = (): AxiosInstance | null => {
    const apiKey = store.get('tmdbApiKey') as string
    if (!apiKey) return null

    if (cachedClient && cachedApiKey === apiKey) return cachedClient

    const useBearer = isBearerKey(apiKey)
    cachedClient = axios.create({
        baseURL: BASE_URL,
        timeout: REQUEST_TIMEOUT_MS,
        params: useBearer ? { language: 'en-US' } : { api_key: apiKey, language: 'en-US' },
        headers: useBearer ? { Authorization: `Bearer ${apiKey}` } : {}
    })
    cachedApiKey = apiKey
    return cachedClient
}

class RateLimiter {
    private queue: (() => void)[] = []
    private activeRequests = 0
    private readonly maxConcurrent = 5
    private lastRequestTime = 0
    private readonly minDelay = 200
    private cooldownUntil = 0

    async add<T>(fn: () => Promise<T>): Promise<T> {
        await this.acquire()
        try {
            return await fn()
        } finally {
            this.release()
        }
    }

    /** Pause all outgoing requests (used on 429 Retry-After). */
    coolDown(ms: number) {
        this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + ms)
    }

    private async acquire() {
        if (this.cooldownUntil > Date.now()) {
            await new Promise(resolve => setTimeout(resolve, this.cooldownUntil - Date.now()))
        }

        if (this.activeRequests >= this.maxConcurrent) {
            await new Promise<void>(resolve => this.queue.push(resolve))
        }

        const waitTime = Math.max(0, this.minDelay - (Date.now() - this.lastRequestTime))
        if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime))
        }

        this.activeRequests++
        this.lastRequestTime = Date.now()
    }

    private release() {
        this.activeRequests--
        const next = this.queue.shift()
        if (next) next()
    }
}

const limiter = new RateLimiter()

const statusOf = (error: unknown): number | undefined =>
    axios.isAxiosError(error) ? error.response?.status : undefined

const toTmdbError = (error: unknown, context: string): TmdbError => {
    const status = statusOf(error)
    const reason = error instanceof Error ? error.message : String(error)

    if (status === 429) {
        const headers = (axios.isAxiosError(error) ? error.response?.headers : undefined) as Record<string, unknown> | undefined
        const retryAfter = Number(headers?.['retry-after'])
        limiter.coolDown(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : BACKOFF_BASE_MS * 4)
        return new TmdbError(`${context}: rate limited by TMDB (429)`, { status, transient: true })
    }

    // 5xx / network / timeout are worth another attempt; other 4xx will never succeed.
    const transient = status === undefined || status >= 500
    return new TmdbError(`${context}: ${reason}`, { status, transient })
}

const request = async <T>(context: string, fn: (client: AxiosInstance) => Promise<T>): Promise<T> => {
    const client = getTMDBClient()
    if (!client) throw new TmdbError('TMDB API Key not configured', { transient: false })

    let lastError: TmdbError | undefined
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return await limiter.add(() => fn(client))
        } catch (error) {
            lastError = toTmdbError(error, context)
            if (!lastError.transient || attempt === MAX_ATTEMPTS) break
            const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt - 1)
            console.warn(`${context} failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${lastError.message}. Retrying in ${backoff}ms`)
            await new Promise(resolve => setTimeout(resolve, backoff))
        }
    }

    throw lastError ?? new TmdbError(`${context}: request failed`)
}

export interface TmdbSearchResult {
    id: number
    title?: string
    name?: string
    first_air_date?: string
    release_date?: string
    poster_path?: string | null
    [key: string]: unknown
}

export interface TmdbSearchResponse {
    results: TmdbSearchResult[]
    page: number
    totalPages: number
    totalResults: number
}

const toSearchResponse = (data: unknown): TmdbSearchResponse => {
    const page = (data ?? {}) as { results?: unknown; page?: number; total_pages?: number; total_results?: number }
    return {
        results: Array.isArray(page.results) ? page.results as TmdbSearchResult[] : [],
        page: page.page ?? 1,
        totalPages: page.total_pages ?? 1,
        totalResults: page.total_results ?? 0
    }
}

export const searchMovie = async (query: string, year?: number, page: number = 1): Promise<TmdbSearchResponse> =>
    toSearchResponse(await request('TMDB movie search', client =>
        client.get('/search/movie', {
            params: { query, year: year?.toString(), page: page.toString() }
        }).then(r => r.data)
    ))

export const getMovieDetails = async (id: number): Promise<TmdbMovieDetails> =>
    request<TmdbMovieDetails>('TMDB movie details', client =>
        client.get(`/movie/${id}`, {
            params: { append_to_response: 'credits,external_ids,images', include_image_language: 'en,null' }
        }).then(r => r.data)
    )

export const searchTVShow = async (query: string, year?: number, page: number = 1): Promise<TmdbSearchResponse> =>
    toSearchResponse(await request('TMDB TV search', client =>
        client.get('/search/tv', {
            params: { query, first_air_date_year: year?.toString(), page: page.toString() }
        }).then(r => r.data)
    ))

export const getTVShowDetails = async (id: number): Promise<TmdbTVDetails> =>
    request<TmdbTVDetails>('TMDB TV details', client =>
        client.get(`/tv/${id}`, {
            params: { append_to_response: 'credits,external_ids,images', include_image_language: 'en,null' }
        }).then(r => r.data)
    )

export const getSeasonDetails = async (tvId: number, seasonNumber: number): Promise<TmdbSeasonDetails> =>
    request<TmdbSeasonDetails>('TMDB season details', client =>
        client.get(`/tv/${tvId}/season/${seasonNumber}`).then(r => r.data)
    )
