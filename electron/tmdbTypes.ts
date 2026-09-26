/**
 * The subset of TMDB v3 payloads this app reads. Fields are optional because append_to_response
 * can fail per block, and TMDB omits keys (never sends null) for some entries.
 */

export interface TmdbGenre {
    id: number
    name: string
}

export interface TmdbPerson {
    id: number
    name: string
    profile_path?: string | null
    character?: string | null
    job?: string | null
    department?: string | null
    credit_id?: string
}

export interface TmdbImage {
    file_path: string
    iso_639_1?: string | null
    aspect_ratio?: number
    height?: number
    width?: number
    vote_average?: number
    vote_count?: number
}

export interface TmdbCredits {
    cast?: TmdbPerson[]
    crew?: TmdbPerson[]
}

export interface TmdbImages {
    logos?: TmdbImage[]
    posters?: TmdbImage[]
    backdrops?: TmdbImage[]
}

export interface TmdbExternalIds {
    imdb_id?: string
    tmdb_id?: number
    tvdb_id?: number
    facebook_id?: string
    instagram_id?: string
    twitter_id?: string
}

interface TmdbDetailsBase {
    id: number
    overview: string
    poster_path?: string | null
    backdrop_path?: string | null
    original_language?: string
    popularity?: number
    vote_average?: number
    vote_count?: number
    genres?: TmdbGenre[]
    status?: string
    homepage?: string
    credits?: TmdbCredits
    images?: TmdbImages
    external_ids?: TmdbExternalIds
}

export interface TmdbMovieDetails extends TmdbDetailsBase {
    title: string
    original_title?: string
    tagline?: string
    release_date?: string
    runtime?: number
}

export interface TmdbEpisode {
    id?: number
    episode_number: number
    season_number?: number
    name?: string
    overview?: string
    still_path?: string | null
    air_date?: string
    runtime?: number
    crew?: TmdbPerson[]
    guest_stars?: TmdbPerson[]
}

export interface TmdbSeasonDetails {
    id?: number
    name?: string
    overview?: string
    poster_path?: string | null
    air_date?: string
    episodes?: TmdbEpisode[]
}

export interface TmdbSeasonSummary {
    season_number: number
    id?: number
    name?: string
    overview?: string
    poster_path?: string | null
    air_date?: string
    episode_count?: number
}

export interface TmdbTVDetails extends TmdbDetailsBase {
    name: string
    original_name?: string
    first_air_date?: string
    last_air_date?: string
    number_of_seasons?: number
    number_of_episodes?: number
    episode_run_time?: number[]
    origin_country?: string[]
    created_by?: TmdbPerson[]
    seasons?: TmdbSeasonSummary[]
}
