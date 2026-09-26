import { describe, expect, it } from 'vitest'
import {
    cleanFilename,
    fileNameOf,
    isVideoFile,
    parseEpisodeInfo,
    pickMovieMatch,
    pickShowMatch,
    type EpisodeInfo
} from '../electron/mediaNaming'
import type { TmdbSearchResult } from '../electron/tmdbService'

const movie = (id: number, release_date?: string): TmdbSearchResult => ({ id, title: `m${id}`, release_date })
const show = (id: number, first_air_date?: string): TmdbSearchResult => ({ id, name: `s${id}`, first_air_date })

describe('fileNameOf', () => {
    it('strips directories written with either separator', () => {
        expect(fileNameOf('D:\\Movies\\The.Matrix.1999.mkv')).toBe('The.Matrix.1999')
        expect(fileNameOf('/mnt/webdav/TV/The Matrix 1999.mkv')).toBe('The Matrix 1999')
        expect(fileNameOf('//nas/share/Show.S01E02.mkv')).toBe('Show.S01E02')
    })

    it('keeps dots that are not an extension separator', () => {
        expect(fileNameOf('2001 A Space Odyssey.mkv')).toBe('2001 A Space Odyssey')
        expect(fileNameOf('no_extension')).toBe('no_extension')
    })
})

describe('isVideoFile', () => {
    it('accepts the supported containers regardless of case', () => {
        for (const name of ['a.mp4', 'b.MKV', 'c.avi', 'd.mov', 'e.WMV']) {
            expect(isVideoFile(name)).toBe(true)
        }
    })

    it('rejects subtitles, samples and bare folders', () => {
        for (const name of ['a.srt', 'b.txt', 'c.mp4.mkv.sample', 'sample']) {
            expect(isVideoFile(name)).toBe(false)
        }
    })
})

describe('cleanFilename', () => {
    it('turns separators into spaces and pulls the year out', () => {
        expect(cleanFilename('The.Matrix.1999.1080p.Bluray.x265.mkv')).toEqual({ name: 'The Matrix', year: 1999 })
        expect(cleanFilename('D:\\Movies\\Inception (2010) [1080p].mkv')).toEqual({ name: 'Inception', year: 2010 })
    })

    it('drops release-group brackets and codec tokens', () => {
        expect(cleanFilename('Some.Show.2049 [GROUP] {rag}.mkv')).toEqual({ name: 'Some Show', year: 2049 })
        expect(cleanFilename('The Great 2006 720p WEBDL AAC.mkv').name).toBe('The Great')
    })

    it('leaves a year alone when it is the title, not a suffix', () => {
        expect(cleanFilename('1997 The Beginning.mkv')).toEqual({ name: '1997 The Beginning', year: undefined })
    })

    it('returns undefined when no year token is present', () => {
        expect(cleanFilename('Big Buck Bunny.mkv')).toEqual({ name: 'Big Buck Bunny', year: undefined })
    })
})

describe('parseEpisodeInfo', () => {
    it('reads the canonical SxxEyy form', () => {
        expect(parseEpisodeInfo('Severance.S01E02.mkv')).toEqual({ name: 'Severance', season: 1, episode: 2 })
        expect(parseEpisodeInfo('The Boys S02E13 - Homecoming.mkv')).toEqual({ name: 'The Boys', season: 2, episode: 13 })
        expect(parseEpisodeInfo('/tv/friends.10x24.mkv')).toEqual({ name: 'friends', season: 10, episode: 24 })
    })

    it('requires a show name and a non-zero season', () => {
        const cases = ['S01E02.mkv', 'Show.S00E05.mkv', 'Show.S0E1.mkv']
        for (const file of cases) {
            expect(parseEpisodeInfo(file), file).toBeNull()
        }
    })

    it('keeps episode zero, which is how specials are numbered', () => {
        expect(parseEpisodeInfo('Show.1x0.mkv')).toEqual({ name: 'Show', season: 1, episode: 0 })
    })

    it('never mistakes a resolution for an episode number', () => {
        const cases: string[] = ['Movie.1280x720.mkv', 'Clip.1920x1080.mkv', 'Show.1x1080.mkv', 'Show.3x480.mkv']
        for (const file of cases) {
            expect(parseEpisodeInfo(file), file).toBeNull()
        }
    })

    it('caps the ambiguous NxN form at season 50', () => {
        expect(parseEpisodeInfo('Show.S120E05.mkv')).toBeNull()
        expect(parseEpisodeInfo('Show.99x05.mkv')).toBeNull()
        expect(parseEpisodeInfo('Show.50x05.mkv')).toEqual({ name: 'Show', season: 50, episode: 5 })
    })

    it('leaves movies that merely contain an x', () => {
        expect(parseEpisodeInfo('Alien 3.mkv')).toBeNull()
        expect(parseEpisodeInfo('A.X.Show.2019.mkv')).toBeNull()
    })

    it('returns a plain EpisodeInfo shape', () => {
        const info: EpisodeInfo | null = parseEpisodeInfo('Show.S01E02.mkv')
        expect(Object.keys(info ?? {}).sort()).toEqual(['episode', 'name', 'season'])
    })
})

describe('pickMovieMatch', () => {
    it('returns null without candidates', () => {
        expect(pickMovieMatch([], 1999)).toBeNull()
    })

    it('trusts TMDB ordering when the filename carries no year', () => {
        const results = [movie(1), movie(2, '1999-01-01')]
        expect(pickMovieMatch(results)).toBe(results[0])
    })

    it('prefers the exact year over the more popular neighbour', () => {
        const results = [movie(1, '2017-01-01'), movie(2, '1999-03-31')]
        expect(pickMovieMatch(results, 1999)?.id).toBe(2)
    })

    it('accepts a two year miss and rejects a three year miss', () => {
        expect(pickMovieMatch([movie(7, '2001-05-05')], 1999)?.id).toBe(7)
        expect(pickMovieMatch([movie(7, '2002-05-05')], 1999)).toBeNull()
    })

    it('skips candidates without a date when a dated one matches', () => {
        const results = [movie(1), movie(2, '1999-03-31'), movie(3, '1999-06-01')]
        expect(pickMovieMatch(results, 1999)?.id).toBe(2)
    })

    it('refuses to guess when no candidate carries a date', () => {
        const results = [movie(4), movie(5)]
        expect(pickMovieMatch(results, 1999)).toBeNull()
    })
})

describe('pickShowMatch', () => {
    it('returns null without candidates', () => {
        expect(pickShowMatch([], 2010)).toBeNull()
    })

    it('trusts TMDB ordering without a year', () => {
        const results = [show(1), show(2, '2010-01-01')]
        expect(pickShowMatch(results)).toBe(results[0])
    })

    it('skips a reboot that aired after the filename year', () => {
        const results = [show(1, '2019-01-01'), show(2, '1995-01-01')]
        expect(pickShowMatch(results, 2010)?.id).toBe(2)
    })

    it('treats a missing air date as compatible', () => {
        const results = [show(1, '2019-01-01'), show(2)]
        expect(pickShowMatch(results, 2010)?.id).toBe(2)
    })

    it('falls back to the top hit when everything aired later', () => {
        const results = [show(1, '2021-01-01'), show(2, '2022-01-01')]
        expect(pickShowMatch(results, 2010)?.id).toBe(1)
    })
})
