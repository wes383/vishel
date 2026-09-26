import React, { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { LibraryTab } from '../../types/ipc'
import { TAB_LIST_CLASS, tabTriggerClass } from '../ui/Segmented'

interface LibraryTabsProps {
    activeTab: LibraryTab
    onTabChange: (tab: LibraryTab) => void
}

type TabLabelKey = 'tabAll' | 'tabMovies' | 'tabTvShows' | 'tabFavorites' | 'tabHistory'

/** Only the i18n key lives here: a module-scope constant cannot call the `t` hook. */
const TABS: ReadonlyArray<{ id: LibraryTab; labelKey: TabLabelKey }> = [
    { id: 'all', labelKey: 'tabAll' },
    { id: 'movies', labelKey: 'tabMovies' },
    { id: 'tv', labelKey: 'tabTvShows' },
    { id: 'favorites', labelKey: 'tabFavorites' },
    { id: 'history', labelKey: 'tabHistory' },
]

/** Order doubles as the whitelist for the `?tab=` URL, so the strip has one definition. */
export const LIBRARY_TAB_IDS: readonly LibraryTab[] = TABS.map(tab => tab.id)

const NAVIGATION_KEYS = ['ArrowRight', 'ArrowLeft', 'Home', 'End']

/**
 * role=tab plus aria-selected and a roving tabindex: the strip is one stop in the tab order and
 * Arrow/Home/End move the selection, per the ARIA tabs pattern. aria-controls is intentionally
 * absent because the panels are rendered by the library page, outside this component.
 */
export const LibraryTabs: React.FC<LibraryTabsProps> = ({ activeTab, onTabChange }) => {
    const { t } = useTranslation(['library', 'common'])
    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        // Leave modified Home/End (scroll to top/bottom of the library) alone.
        if (event.ctrlKey || event.metaKey || event.altKey) return
        if (!NAVIGATION_KEYS.includes(event.key)) return
        event.preventDefault()

        const currentIndex = TABS.findIndex(tab => tab.id === activeTab)
        let nextIndex = currentIndex
        if (event.key === 'ArrowRight') nextIndex = currentIndex + 1
        else if (event.key === 'ArrowLeft') nextIndex = currentIndex - 1
        else if (event.key === 'Home') nextIndex = 0
        else if (event.key === 'End') nextIndex = TABS.length - 1

        const next = TABS[(nextIndex + TABS.length) % TABS.length]
        onTabChange(next.id)
        // Activation follows focus, so focus has to move with the new selection.
        tabRefs.current[next.id]?.focus()
    }, [activeTab, onTabChange])

    return (
        <div
            role="tablist"
            aria-label={t('library:librarySections')}
            aria-orientation="horizontal"
            onKeyDown={handleKeyDown}
            className={TAB_LIST_CLASS}
        >
            {TABS.map(tab => {
                const isActive = activeTab === tab.id
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        tabIndex={isActive ? 0 : -1}
                        ref={element => { tabRefs.current[tab.id] = element }}
                        onClick={() => onTabChange(tab.id)}
                        className={tabTriggerClass(isActive)}
                    >
                        {t(`library:${tab.labelKey}`)}
                    </button>
                )
            })}
        </div>
    )
}
