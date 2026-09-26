import type { TmdbSearchResult } from './tmdbService'

export const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv']

export interface EpisodeInfo {
    name: string
    season: number
    episode: number
}

/**
 * WebDAV and SMB listings carry the separator style of the REMOTE share, so `path.parse` on a
 * POSIX host would not strip a Windows path. Splitting on both keeps naming identical everywhere.
 */
export const fileNameOf = (filePath: string): string => {
    const base = filePath.slice(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1)
    const dot = base.lastIndexOf('.')
    return dot > 0 ? base.slice(0, dot) : base
}

export const isVideoFile = (filename: string): boolean =>
    VIDEO_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext))

export const cleanFilename = (filename: string): { name: string, year?: number } => {
    let name = fileNameOf(filename).replace(/[._-]/g, ' ')

    let year: number | undefined
    const yearMatch = name.match(/\b(19|20)\d{2}\b/)
    if (yearMatch && yearMatch.index && yearMatch.index > 0) {
        year = parseInt(yearMatch[0])
        name = name.substring(0, yearMatch.index)
        // Cutting at the year leaves the opener of "(2010)" and any trailing separator behind.
        name = name.replace(/[[({][^\]})]*$/, '').replace(/[ ._-]+$/, '')
    }

    name = name.replace(/\b(1080p|720p|4k|2160p|bluray|webdl|x264|x265|hevc|aac|ac3|dts|truehd)\b/gi, '')
    name = name.replace(/[[({].*?[\]})]/g, '')

    return { name: name.trim(), year }
}

/** Heights that only ever appear as video resolution, never as an episode number. */
const RESOLUTION_HEIGHTS = new Set([480, 576, 720, 1080, 1440, 2160, 4320])

/**
 * Two separate patterns: `S01E02` and `1x02`.
 * The `NxN` form is anchored to a separator and rejects resolution tokens, so
 * `Movie.1920x1080` is no longer read as season 1920 episode 1080.
 */
export const parseEpisodeInfo = (filename: string): EpisodeInfo | null => {
    const name = fileNameOf(filename)

    const seasonEpisode = name.match(/^(.+?)[ ._-]*[sS](\d{1,2})[eE](\d{1,3})(?:$|[ ._-])/)
    if (seasonEpisode) {
        const showName = seasonEpisode[1].replace(/[.\-_]/g, ' ').trim()
        const season = parseInt(seasonEpisode[2])
        const episode = parseInt(seasonEpisode[3])
        if (showName && season >= 1 && season <= 99) {
            return { name: showName, season, episode }
        }
        return null
    }

    const numberXNumber = name.match(/^(.+?)[ ._-]+(\d{1,2})x(\d{1,3})(?:$|[ ._-])/)
    if (numberXNumber) {
        const showName = numberXNumber[1].replace(/[.\-_]/g, ' ').trim()
        const season = parseInt(numberXNumber[2])
        const episode = parseInt(numberXNumber[3])
        if (showName && season >= 1 && season <= 50 && !RESOLUTION_HEIGHTS.has(episode)) {
            return { name: showName, season, episode }
        }
    }

    return null
}

const releaseYearOf = (dateStr?: string): number | undefined => {
    if (!dateStr) return undefined
    const year = parseInt(dateStr.slice(0, 4), 10)
    return Number.isNaN(year) ? undefined : year
}

/** TMDB ordering is popularity based, so the first hit is only trustworthy once the year agrees. */
export const pickMovieMatch = (results: TmdbSearchResult[], fileYear?: number): TmdbSearchResult | null => {
    if (results.length === 0) return null
    if (!fileYear) return results[0]

    let best: TmdbSearchResult | null = null
    let bestDelta = Number.POSITIVE_INFINITY

    for (const result of results) {
        const year = releaseYearOf(result.release_date)
        if (year === undefined) continue
        const delta = Math.abs(year - fileYear)
        if (delta < bestDelta) {
            bestDelta = delta
            best = result
        }
        if (delta === 0) break
    }

    if (best && bestDelta <= 2) return best
    // Filename carries a year but no candidate is close enough to be trusted.
    return null
}

export const pickShowMatch = (results: TmdbSearchResult[], fileYear?: number): TmdbSearchResult | null => {
    if (results.length === 0) return null
    if (!fileYear) return results[0]

    const airedBefore = results.filter(result => {
        const year = releaseYearOf(result.first_air_date)
        return year === undefined || year <= fileYear
    })
    if (airedBefore.length > 0) return airedBefore[0]
    return results[0]
}
