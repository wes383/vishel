import { describe, expect, it } from 'vitest'
import { matchesCastSearch, matchesSearch, normalizeGenres, normalizeSearchText } from '../src/utils/searchMatch'

describe('normalizeSearchText', () => {
    it('strips diacritics and punctuation while keeping CJK', () => {
        expect(normalizeSearchText('  "Amélie: A Film!" ')).toBe('amelie a film')
        expect(normalizeSearchText('千与千寻')).toBe('千与千寻')
    })

    it('collapses whitespace runs', () => {
        expect(normalizeSearchText('The   Matrix\nReloaded')).toBe('the matrix reloaded')
    })
})

describe('matchesSearch', () => {
    it('matches an empty or punctuation-only query against everything', () => {
        expect(matchesSearch('Inception', '')).toBe(true)
        expect(matchesSearch('Inception', '   ')).toBe(true)
    })

    it('matches substrings case-insensitively and across diacritics', () => {
        expect(matchesSearch('Inception', 'ncep')).toBe(true)
        expect(matchesSearch('Amélie', 'amelie')).toBe(true)
    })

    it('matches out-of-order tokens', () => {
        expect(matchesSearch('Blade Runner 2049', 'runner blade')).toBe(true)
    })

    it('tolerates a dropped separator, so "atlas" finds "hunger games mockingjay" style typos', () => {
        expect(matchesSearch('The Grand Budapest Hotel', 'grandbudapest')).toBe(true)
    })

    it('rejects unrelated queries', () => {
        expect(matchesSearch('Inception', 'matrix')).toBe(false)
    })
})

describe('matchesCastSearch', () => {
    const cast = [{ name: 'Tom Hanks' }, { name: '罗京民' }]

    it('matches a full name fragment', () => {
        expect(matchesCastSearch(cast, 'tom hank')).toBe(true)
    })

    it('matches every token against one person but not across people', () => {
        expect(matchesCastSearch(cast, 'hanks tom')).toBe(true)
        expect(matchesCastSearch([{ name: 'Tom Hanks' }, { name: 'Megan Fox' }], 'hanks fox')).toBe(false)
    })

    it('matches a leading word prefix for a single token', () => {
        expect(matchesCastSearch(cast, 'tom')).toBe(true)
    })

    it('is stricter than title matching: prefixes only, no subsequences', () => {
        expect(matchesCastSearch(cast, 'hank')).toBe(true)
        expect(matchesCastSearch(cast, 'hks')).toBe(false)
        expect(matchesSearch('Tom Hanks', 'hks')).toBe(true)
    })

    it('returns false when there is no cast to search', () => {
        expect(matchesCastSearch(undefined, 'tom')).toBe(false)
        expect(matchesCastSearch([], 'tom')).toBe(false)
    })

    it('matches CJK names', () => {
        expect(matchesCastSearch(cast, '罗京')).toBe(true)
    })
})

describe('normalizeGenres', () => {
    it('merges TMDB compound genres into their core genre', () => {
        expect(normalizeGenres(['Action & Adventure'])).toEqual(['Action'])
        expect(normalizeGenres(['Sci-Fi & Fantasy'])).toEqual(['Science Fiction'])
        expect(normalizeGenres(['War & Politics'])).toEqual(['War'])
    })

    it('folds unlisted genres into Other and dedupes', () => {
        expect(normalizeGenres(['TV Movie', 'Kids', 'News'])).toEqual(['Other'])
        expect(normalizeGenres(['Drama', 'Comedy', 'Drama'])).toEqual(['Drama', 'Comedy'])
    })

    it('keeps core genres in the incoming order', () => {
        expect(normalizeGenres(['Horror', 'Thriller'])).toEqual(['Horror', 'Thriller'])
    })

    it('returns an empty list for missing input', () => {
        expect(normalizeGenres(undefined)).toEqual([])
        expect(normalizeGenres([])).toEqual([])
    })
})
