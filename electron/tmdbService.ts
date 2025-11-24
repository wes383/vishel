import axios from 'axios'
import store from './store'

const BASE_URL = 'https://api.themoviedb.org/3'

export const getTMDBClient = () => {
    const apiKey = store.get('tmdbApiKey') as string
    if (!apiKey) return null

    return axios.create({
        baseURL: BASE_URL,
        params: {
            api_key: apiKey,
            language: 'en-US'
        }
    })
}

class RateLimiter {
    private queue: { fn: () => Promise<any>, resolve: (value: any) => void, reject: (reason: any) => void }[] = []
    private activeRequests = 0
    private maxConcurrent = 5
    private lastRequestTime = 0
    private minDelay = 200

    async add<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject })
            this.processQueue()
        })
    }

    private async processQueue() {
        if (this.queue.length === 0) return

        const now = Date.now()
        const timeSinceLastRequest = now - this.lastRequestTime
        const waitTime = Math.max(0, this.minDelay - timeSinceLastRequest)

        if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime))
        }

        if (this.queue.length === 0) return

        while (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
            const task = this.queue.shift()
            if (task) {
                this.activeRequests++
                this.lastRequestTime = Date.now()
                task.fn().then(result => {
                    task.resolve(result)
                }).catch(error => {
                    task.reject(error)
                }).finally(() => {
                    this.activeRequests--
                    this.processQueue()
                })
            }
        }

        if (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
            setTimeout(() => this.processQueue(), this.minDelay)
        }
    }
}

const limiter = new RateLimiter()

export const searchMovie = async (query: string, year?: number) => {
    const client = getTMDBClient()
    if (!client) throw new Error('TMDB API Key not configured')

    try {
        const response = await limiter.add(() => client.get('/search/movie', {
            params: {
                query,
                year: year?.toString()
            }
        }))
        return response.data.results
    } catch (error) {
        console.error('TMDB Search Error:', error)
        return []
    }
}

export const getMovieDetails = async (id: number) => {
    const client = getTMDBClient()
    if (!client) throw new Error('TMDB API Key not configured')

    try {
        const response = await limiter.add(() => client.get(`/movie/${id}`, {
            params: { append_to_response: 'credits,external_ids' }
        }))
        return response.data
    } catch (error) {
        console.error('TMDB Details Error:', error)
        return null
    }
}

export const searchTVShow = async (query: string, year?: number) => {
    const client = getTMDBClient()
    if (!client) throw new Error('TMDB API Key not configured')

    try {
        const response = await limiter.add(() => client.get('/search/tv', {
            params: {
                query,
                first_air_date_year: year?.toString()
            }
        }))
        return response.data.results
    } catch (error) {
        console.error('TMDB TV Search Error:', error)
        return []
    }
}

export const getTVShowDetails = async (id: number) => {
    const client = getTMDBClient()
    if (!client) throw new Error('TMDB API Key not configured')

    try {
        const response = await limiter.add(() => client.get(`/tv/${id}`, {
            params: { append_to_response: 'credits,external_ids' }
        }))
        return response.data
    } catch (error) {
        console.error('TMDB TV Details Error:', error)
        return null
    }
}

export const getSeasonDetails = async (tvId: number, seasonNumber: number) => {
    const client = getTMDBClient()
    if (!client) throw new Error('TMDB API Key not configured')

    try {
        const response = await limiter.add(() => client.get(`/tv/${tvId}/season/${seasonNumber}`))
        return response.data
    } catch (error) {
        console.error('TMDB Season Details Error:', error)
        return null
    }
}
