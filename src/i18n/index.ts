import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enCommon from './locales/en/common.json'
import enLibrary from './locales/en/library.json'
import enGrid from './locales/en/grid.json'
import enMatch from './locales/en/match.json'
import enDetail from './locales/en/detail.json'
import enSettings from './locales/en/settings.json'
import zhCommon from './locales/zh/common.json'
import zhLibrary from './locales/zh/library.json'
import zhGrid from './locales/zh/grid.json'
import zhMatch from './locales/zh/match.json'
import zhDetail from './locales/zh/detail.json'
import zhSettings from './locales/zh/settings.json'

export const NAMESPACES = ['common', 'library', 'grid', 'match', 'detail', 'settings'] as const

/**
 * Both locales are bundled rather than lazy-loaded: the app is offline-first and a missing
 * translation is echoed as its key (`parseMissingKeyHandler`), so the zh files must stay in step
 * with en key for key. `lng` is the starting point only - SettingsProvider switches to the stored
 * language as soon as settings arrive.
 */
i18n.use(initReactI18next).init({
    resources: {
        en: { common: enCommon, library: enLibrary, grid: enGrid, match: enMatch, detail: enDetail, settings: enSettings },
        zh: { common: zhCommon, library: zhLibrary, grid: zhGrid, match: zhMatch, detail: zhDetail, settings: zhSettings }
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
