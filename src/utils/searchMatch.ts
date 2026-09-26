import type { CreditMember } from '../types/library'

const GENRE_MERGE_MAP: Record<string, string> = {
    'Action & Adventure': 'Action',
    'Sci-Fi & Fantasy': 'Science Fiction',
    'War & Politics': 'War',
    'TV Movie': 'Other',
    'Kids': 'Other',
    'News': 'Other',
    'Reality': 'Other',
    'Soap': 'Other',
    'Talk': 'Other',
}

const CORE_GENRES = new Set([
    'Action',
    'Adventure',
    'Animation',
    'Comedy',
    'Crime',
    'Drama',
    'Family',
    'Fantasy',
    'Documentary',
    'History',
    'Horror',
    'Music',
    'Mystery',
    'Romance',
    'Science Fiction',
    'Thriller',
    'War',
    'Western',
])

const normalizeGenres = (genres?: string[]) => {
    if (!genres || genres.length === 0) return []
    const normalized = genres.map(genre => GENRE_MERGE_MAP[genre] || genre)
    return Array.from(new Set(normalized.map(genre => CORE_GENRES.has(genre) ? genre : 'Other')))
}

const normalizeSearchText = (text: string) =>
    text
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\u4e00-\u9fa5\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

const isSubsequence = (needle: string, haystack: string) => {
    if (!needle) return true
    let j = 0
    for (let i = 0; i < haystack.length && j < needle.length; i++) {
        if (haystack[i] === needle[j]) j++
    }
    return j === needle.length
}

const matchesSearch = (value: string, query: string) => {
    const normalizedValue = normalizeSearchText(value)
    const normalizedQuery = normalizeSearchText(query)

    if (!normalizedQuery) return true
    if (normalizedValue.includes(normalizedQuery)) return true

    const queryTokens = normalizedQuery.split(' ').filter(Boolean)
    const valueTokens = normalizedValue.split(' ').filter(Boolean)

    if (queryTokens.every(token => normalizedValue.includes(token))) return true

    if (queryTokens.every(token => valueTokens.some(word => isSubsequence(token, word)))) return true

    return isSubsequence(queryTokens.join(''), normalizedValue.replace(/\s+/g, ''))
}

const matchesCastSearch = (
    cast: Array<CreditMember> | undefined,
    query: string
) => {
    const normalizedQuery = normalizeSearchText(query)
    if (!normalizedQuery) return true

    const normalizedNames = (cast || [])
        .map(actor => normalizeSearchText(actor?.name || ''))
        .filter(Boolean)

    if (normalizedNames.length === 0) return false

    // Strict actor matching to avoid false positives from title-style fuzzy logic
    if (normalizedNames.some(name => name.includes(normalizedQuery))) return true

    const queryTokens = normalizedQuery.split(' ').filter(Boolean)
    if (queryTokens.length > 1) {
        return normalizedNames.some(name => queryTokens.every(token => name.includes(token)))
    }

    // Single-token fallback: match on word prefix (e.g. "tom" -> "tom hanks")
    return normalizedNames.some(name => name.split(' ').some(part => part.startsWith(normalizedQuery)))
}

const matchesNameListSearch = (
    people: Array<CreditMember> | undefined,
    query: string
) => matchesCastSearch(people, query)

export { normalizeGenres, normalizeSearchText, matchesSearch, matchesCastSearch, matchesNameListSearch }
