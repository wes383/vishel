import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enCommon from './locales/en/common.json'
import enLibrary from './locales/en/library.json'
import enGrid from './locales/en/grid.json'
import enMatch from './locales/en/match.json'
import enDetail from './locales/en/detail.json'
import enSettings from './locales/en/settings.json'

export const NAMESPACES = ['common', 'library', 'grid', 'match', 'detail', 'settings'] as const

/**
 * English only. All copy still goes through `t()` so a locale can be added later without touching
 * components again; the strings themselves live in `locales/en/*.json` as the source of truth.
 */
i18n.use(initReactI18next).init({
    resources: {
        en: { common: enCommon, library: enLibrary, grid: enGrid, match: enMatch, detail: enDetail, settings: enSettings }
    },
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: [...NAMESPACES],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    parseMissingKeyHandler: key => key
})

export default i18n
