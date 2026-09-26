import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LibraryTab } from '../../types/ipc'

interface LibraryTabsProps {
    activeTab: 'all' | 'movies' | 'tv' | 'history'
    onTabChange: (tab: 'all' | 'movies' | 'tv' | 'history') => void
}

type Variant = 'desktop' | 'mobile'

type TabLabelKey = 'tabAll' | 'tabMovies' | 'tabTvShows' | 'tabHistory'

/** Only the i18n key lives here: a module-scope constant cannot call the `t` hook. */
const TABS: ReadonlyArray<{ id: LibraryTab; labelKey: TabLabelKey }> = [
    { id: 'all', labelKey: 'tabAll' },
    { id: 'movies', labelKey: 'tabMovies' },
    { id: 'tv', labelKey: 'tabTvShows' },
    { id: 'history', labelKey: 'tabHistory' },
]

const NAVIGATION_KEYS = ['ArrowRight', 'ArrowLeft', 'Home', 'End']

interface TabButtonProps {
    variant: Variant
    tab: { id: LibraryTab; label: string }
    isActive: boolean
    className: string
    registerRef: (key: string, element: HTMLButtonElement | null) => void
    onSelect: (tab: LibraryTab) => void
}

/**
 * role=tab plus aria-selected and a roving tabindex: the tab strip is one stop in the tab order
 * and Arrow/Home/End move the selection, per the ARIA tabs pattern. aria-controls is intentionally
 * absent because the panels are rendered by the library page, outside this component.
 */
const TabButton: React.FC<TabButtonProps> = ({ variant, tab, isActive, className, registerRef, onSelect }) => (
    <button
        type="button"
        role="tab"
        id={`library-tab-${variant}-${tab.id}`}
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        ref={(element) => {
            registerRef(`${variant}-${tab.id}`, element)
        }}
        onClick={() => onSelect(tab.id)}
        className={className}
    >
        {tab.label}
    </button>
)

export const LibraryTabs: React.FC<LibraryTabsProps> = ({ activeTab, onTabChange }) => {
    const { t } = useTranslation(['library', 'common'])
    const [indicator, setIndicator] = useState({ left: 0, width: 0 })
    /** The first measurement must land without the slide, otherwise the pill flies in from 0. */
    const [animateIndicator, setAnimateIndicator] = useState(false)

    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const frame = requestAnimationFrame(() => setAnimateIndicator(true))
        return () => cancelAnimationFrame(frame)
    }, [])

    useEffect(() => {
        const measure = () => {
            const container = containerRef.current
            const tab = tabRefs.current[`desktop-${activeTab}`]
            if (!container || !tab) return

            const tabRect = tab.getBoundingClientRect()
            // Below the md breakpoint the desktop strip is display:none and reports a zero box.
            if (tabRect.width === 0) return

            const containerRect = container.getBoundingClientRect()
            const next = {
                left: tabRect.left - containerRect.left,
                width: tabRect.width,
            }
            setIndicator(current =>
                current.left === next.left && current.width === next.width ? current : next
            )
        }

        measure()

        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
        const container = containerRef.current
        if (observer && container) observer.observe(container)
        window.addEventListener('resize', measure)
        return () => {
            observer?.disconnect()
            window.removeEventListener('resize', measure)
        }
    }, [activeTab])

    const registerRef = useCallback((key: string, element: HTMLButtonElement | null) => {
        tabRefs.current[key] = element
    }, [])

    const handleKeyDown = useCallback((variant: Variant, event: React.KeyboardEvent<HTMLDivElement>) => {
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
        tabRefs.current[`${variant}-${next.id}`]?.focus()
    }, [activeTab, onTabChange])

    const desktopButton = (isActive: boolean) => `relative z-10 flex items-center gap-1 lg:gap-2 px-3 py-1.5 lg:px-6 lg:py-2 text-sm lg:text-base rounded-full transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isActive ? 'text-foreground' : 'text-foreground-muted hover:text-foreground'
    }`

    const mobileButton = (isActive: boolean) => `flex items-center gap-1 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isActive ? 'bg-hover-bg-strong text-foreground' : 'text-foreground-muted hover:text-foreground'
    }`

    return (
        <>
            {/* Desktop Tabs */}
            <div
                ref={containerRef}
                className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-surface rounded-full p-1"
            >
                {/* Animated indicator */}
                <div
                    aria-hidden="true"
                    className="absolute bg-hover-bg-strong rounded-full pointer-events-none"
                    style={{
                        left: `${indicator.left}px`,
                        width: `${indicator.width}px`,
                        top: '4px',
                        bottom: '4px',
                        transition: animateIndicator ? 'left 0.25s cubic-bezier(0.16, 1, 0.3, 1), width 0.25s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
                    }}
                />

                <div
                    role="tablist"
                    aria-label={t('library:librarySections')}
                    aria-orientation="horizontal"
                    onKeyDown={(event) => handleKeyDown('desktop', event)}
                    className="relative flex items-center"
                >
                    {TABS.map(tab => (
                        <TabButton
                            key={tab.id}
                            variant="desktop"
                            tab={{ id: tab.id, label: t(`library:${tab.labelKey}`) }}
                            isActive={activeTab === tab.id}
                            className={desktopButton(activeTab === tab.id)}
                            registerRef={registerRef}
                            onSelect={onTabChange}
                        />
                    ))}
                </div>
            </div>

            {/* Mobile Tabs */}
            <div className="flex md:hidden justify-center">
                <div
                    role="tablist"
                    aria-label={t('library:librarySections')}
                    aria-orientation="horizontal"
                    onKeyDown={(event) => handleKeyDown('mobile', event)}
                    className="flex bg-surface rounded-full p-1 text-sm"
                >
                    {TABS.map(tab => (
                        <TabButton
                            key={tab.id}
                            variant="mobile"
                            tab={{ id: tab.id, label: t(`library:${tab.labelKey}`) }}
                            isActive={activeTab === tab.id}
                            className={mobileButton(activeTab === tab.id)}
                            registerRef={registerRef}
                            onSelect={onTabChange}
                        />
                    ))}
                </div>
            </div>
        </>
    )
}
