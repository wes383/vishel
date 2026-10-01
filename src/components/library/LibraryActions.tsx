import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, Search, ArrowUpDown, Check, SlidersHorizontal, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '../ui/Button'
import Menu, { MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu'
import { genreLabelKey } from '../../utils/searchMatch'
import type { LibraryTab } from '../../types/ipc'

export type SortOption = 'name-asc' | 'name-desc' | 'date-desc' | 'date-asc' | 'popularity-desc' | 'recently-added'

export type FilterOption = 'all' | 'watched' | 'unwatched'

/** Order is the menu order; the page also validates the persisted value against this list. */
export const FILTER_VALUES: readonly FilterOption[] = ['all', 'watched', 'unwatched']

interface LibraryActionsProps {
    sortBy: SortOption
    onSortChange: (sort: SortOption) => void
    onSearchToggle: () => void
    /** The search field lives in the library page, which owns this toggle's pressed state. */
    searchExpanded: boolean
    activeTab?: LibraryTab
    filterBy?: FilterOption
    onFilterChange?: (filter: FilterOption) => void
    genreFilter?: string
    genreOptions?: string[]
    onGenreFilterChange?: (genre: string) => void
    /** Resets the status and genre narrowing. The current tab is a view, not a filter, so it stays. */
    onClearFilters: () => void
}

/**
 * `right-0` snaps the menu's own right edge to the trigger's, so the trigger needs one menu-width
 * of clearance on its left. The toolbar is right-aligned and the filter trigger has four buttons to
 * its right, so at narrow window sizes it does not have that - there the menu opens left-anchored
 * instead of running off the left edge. Both numbers mirror the w-72 and w-56 classes below.
 */
const MENU_WIDTH = { filter: 288, sort: 224 } as const
const MENU_EDGE_GAP = 8

type MenuAnchor = 'left' | 'right'

const anchorFor = (trigger: HTMLButtonElement, width: number): MenuAnchor =>
    (trigger.getBoundingClientRect().right - width >= MENU_EDGE_GAP ? 'right' : 'left')

export const LibraryActions: React.FC<LibraryActionsProps> = ({
    sortBy,
    onSortChange,
    onSearchToggle,
    searchExpanded,
    activeTab,
    filterBy = 'all',
    onFilterChange,
    genreFilter = 'all',
    genreOptions = [],
    onGenreFilterChange,
    onClearFilters
}) => {
    const [filterMenuOpen, setFilterMenuOpen] = useState(false)
    const [sortMenuOpen, setSortMenuOpen] = useState(false)
    /** One value serves both because opening either menu closes the other. */
    const [menuAnchor, setMenuAnchor] = useState<MenuAnchor>('right')
    const filterMenuRef = useRef<HTMLDivElement>(null)
    const sortMenuRef = useRef<HTMLDivElement>(null)
    const navigate = useNavigate()
    const { t } = useTranslation(['library', 'common'])
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
                setFilterMenuOpen(false)
            }
            if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
                setSortMenuOpen(false)
            }
        }
        if (filterMenuOpen || sortMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [filterMenuOpen, sortMenuOpen])

    const allSortOptions: { value: SortOption; label: string }[] = [
        { value: 'recently-added', label: t('library:sortRecentlyAdded') },
        { value: 'name-asc', label: t('library:sortNameAsc') },
        { value: 'name-desc', label: t('library:sortNameDesc') },
        { value: 'date-desc', label: t('library:sortDateDesc') },
        { value: 'date-asc', label: t('library:sortDateAsc') },
        { value: 'popularity-desc', label: t('library:sortPopularity') },
    ]

    const sortOptions = allSortOptions

    const filterLabels: Record<FilterOption, string> = {
        all: t('library:filterAll'),
        watched: t('library:filterWatched'),
        unwatched: t('library:filterUnwatched')
    }

    const filterOptions = FILTER_VALUES.map(value => ({ value, label: filterLabels[value] }))

    const handleMenuKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        setFilterMenuOpen(false)
        setSortMenuOpen(false)
    }
    const hasActiveFilter = filterBy !== 'all' || genreFilter !== 'all'

    return (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {hasActiveFilter && activeTab !== 'history' && (
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onClearFilters}
                    aria-label={t('library:clearFilters')}
                >
                    <X className="w-4 h-4" aria-hidden="true" />
                    {t('common:clear')}
                </Button>
            )}
            {activeTab !== 'history' && (
                <div className="relative" ref={filterMenuRef}>
                    <Button
                        size="sm"
                        variant={hasActiveFilter ? 'subtle' : 'ghost'}
                        onClick={(event) => {
                            setMenuAnchor(anchorFor(event.currentTarget, MENU_WIDTH.filter))
                            setFilterMenuOpen(!filterMenuOpen)
                            setSortMenuOpen(false)
                        }}
                        aria-haspopup="menu"
                        aria-expanded={filterMenuOpen}
                        aria-label={hasActiveFilter ? t('library:filterAndGenreActive') : undefined}
                    >
                        <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                        {t('library:filterHeading')}
                    </Button>
                    {filterMenuOpen && (
                        <Menu
                            placement="absolute"
                            label={t('library:filterAndGenre')}
                            className={`${menuAnchor === 'left' ? 'left-0' : 'right-0'} top-full mt-2 w-72`}
                            onKeyDown={handleMenuKeys}
                        >
                            <MenuLabel className="uppercase">{t('library:filterHeading')}</MenuLabel>
                            {filterOptions.map(option => (
                                <MenuItem
                                    key={option.value}
                                    role="menuitemradio"
                                    aria-checked={filterBy === option.value}
                                    checked={filterBy === option.value}
                                    onClick={() => {
                                        onFilterChange?.(option.value)
                                        setFilterMenuOpen(false)
                                    }}
                                    className="justify-between"
                                >
                                    <span className="font-medium">{option.label}</span>
                                    {filterBy === option.value && <Check className="w-4 h-4" aria-hidden="true" />}
                                </MenuItem>
                            ))}
                            <>
                                <MenuSeparator />
                                <MenuLabel className="uppercase">{t('library:genreHeading')}</MenuLabel>
                                <div className="grid max-w-[280px] grid-cols-2 gap-0.5 px-1 pb-1 mx-auto">
                                    <MenuItem
                                        role="menuitemradio"
                                        aria-checked={genreFilter === 'all'}
                                        checked={genreFilter === 'all'}
                                        onClick={() => {
                                            onGenreFilterChange?.('all')
                                            setFilterMenuOpen(false)
                                        }}
                                        className="col-span-2 justify-between"
                                    >
                                        <span className="font-medium">{t('library:allGenres')}</span>
                                        {genreFilter === 'all' && <Check className="w-4 h-4" aria-hidden="true" />}
                                    </MenuItem>
                                    {genreOptions.map((genre) => (
                                        <MenuItem
                                            key={genre}
                                            role="menuitemradio"
                                            aria-checked={genreFilter === genre}
                                            checked={genreFilter === genre}
                                            onClick={() => {
                                                onGenreFilterChange?.(genre)
                                                setFilterMenuOpen(false)
                                            }}
                                            className="justify-between"
                                        >
                                            <span className="font-medium truncate pr-2">{t(`library:${genreLabelKey(genre)}`, { defaultValue: genre })}</span>
                                            {genreFilter === genre && <Check className="w-4 h-4" aria-hidden="true" />}
                                        </MenuItem>
                                    ))}
                                </div>
                            </>
                        </Menu>
                    )}
                </div>
            )}
            {activeTab !== 'history' && (
                <div className="relative" ref={sortMenuRef}>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                            setMenuAnchor(anchorFor(event.currentTarget, MENU_WIDTH.sort))
                            setSortMenuOpen(!sortMenuOpen)
                            setFilterMenuOpen(false)
                        }}
                        aria-haspopup="menu"
                        aria-expanded={sortMenuOpen}
                    >
                        <ArrowUpDown className="w-4 h-4" aria-hidden="true" />
                        {t('library:sort')}
                    </Button>
                    {sortMenuOpen && (
                        <Menu
                            placement="absolute"
                            label={t('library:sortBy')}
                            className={`${menuAnchor === 'left' ? 'left-0' : 'right-0'} top-full mt-2 w-56`}
                            onKeyDown={handleMenuKeys}
                        >
                            <MenuLabel className="uppercase">{t('library:sortByHeading')}</MenuLabel>
                            {sortOptions.map(option => (
                                <MenuItem
                                    key={option.value}
                                    role="menuitemradio"
                                    aria-checked={sortBy === option.value}
                                    checked={sortBy === option.value}
                                    onClick={() => {
                                        onSortChange(option.value)
                                        setSortMenuOpen(false)
                                    }}
                                    className="justify-between"
                                >
                                    <span className="font-medium">{option.label}</span>
                                    {sortBy === option.value && <Check className="w-4 h-4" aria-hidden="true" />}
                                </MenuItem>
                            ))}
                        </Menu>
                    )}
                </div>
            )}
            <Button
                size="sm"
                variant="ghost"
                onClick={onSearchToggle}
                aria-pressed={searchExpanded}
            >
                <Search className="w-4 h-4" aria-hidden="true" />
                {t('common:search')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/settings')}>
                <Settings className="w-4 h-4" aria-hidden="true" />
                {t('library:settings')}
            </Button>
        </div>
    )
}
