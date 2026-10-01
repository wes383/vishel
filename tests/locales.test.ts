import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CORE_GENRES, genreLabelKey } from '../src/utils/searchMatch'

const LOCALES_DIR = fileURLToPath(new URL('../src/i18n/locales/', import.meta.url))
const REFERENCE = 'en'

const localeNames = (): string[] => readdirSync(LOCALES_DIR).sort()

const namespaceFiles = (locale: string): string[] =>
    readdirSync(`${LOCALES_DIR}${locale}`).filter(name => name.endsWith('.json')).sort()

const entries = (locale: string, file: string): Record<string, string> =>
    JSON.parse(readFileSync(`${LOCALES_DIR}${locale}/${file}`, 'utf8')) as Record<string, string>

const placeholdersOf = (value: string): string[] =>
    [...value.matchAll(/\{\{(\w+)/g)].map(match => match[1]).sort()

const otherLocales = localeNames().filter(locale => locale !== REFERENCE)

/**
 * Keys a locale deliberately omits so i18next serves the reference language instead. Omitting
 * rather than copying the English text means it can never drift or get translated by mistake, and
 * this is the only place that intent can be written down - JSON has no comments. The TMDB
 * attribution is legal boilerplate, so it stays English in every locale.
 */
const UNTRANSLATED = new Set(['tmdbAttribution'])

const translatableKeys = (file: string): string[] =>
    Object.keys(entries(REFERENCE, file)).filter(key => !UNTRANSLATED.has(key))

describe('locale bundles', () => {
    it('ship the same namespace files in every locale', () => {
        const reference = namespaceFiles(REFERENCE)
        expect(reference.length).toBeGreaterThan(0)

        for (const locale of otherLocales) {
            expect(namespaceFiles(locale), locale).toEqual(reference)
        }
    })

    it('carry the same keys as the reference locale', () => {
        for (const locale of otherLocales) {
            for (const file of namespaceFiles(locale)) {
                const reference = translatableKeys(file).sort()
                const translated = entries(locale, file)

                expect(Object.keys(translated).sort(), `${locale}/${file}`).toEqual(reference)

                for (const [key, value] of Object.entries(translated)) {
                    expect(value.trim(), `${locale}/${file}:${key}`).not.toBe('')
                }
            }
        }
    })

    // A dropped {{title}} makes the sentence render its braces instead of throwing anywhere.
    it('keep every interpolation argument of the string they translate', () => {
        for (const locale of otherLocales) {
            for (const file of namespaceFiles(locale)) {
                const reference = entries(REFERENCE, file)
                const translated = entries(locale, file)

                for (const key of translatableKeys(file)) {
                    expect(placeholdersOf(translated[key]), `${locale}/${file}:${key}`)
                        .toEqual(placeholdersOf(reference[key]))
                }
            }
        }
    })

    // The genre filter offers exactly these labels; a bundle missing one silently renders the
    // filter's fallback, and the set can only change here, with the canonical list.
    it('carry a label for every filterable genre', () => {
        const expected = [...CORE_GENRES, 'Other'].map(genreLabelKey).sort()

        for (const locale of localeNames()) {
            const bundle = entries(locale, 'library.json')
            for (const key of expected) {
                expect(bundle[key], `${locale}/library.json:${key}`).toBeTruthy()
            }
        }
    })
})
