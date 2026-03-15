import React, { useState, useRef, useEffect } from 'react'
import { Settings, Search, ArrowUpDown, Check, SlidersHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export type SortOption = 'name-asc' | 'name-desc' | 'date-desc' | 'date-asc' | 'rating-desc' | 'added-desc' | 'recently-added'

export type FilterOption = 'all' | 'watched' | 'unwatched' | 'favorites'

interface LibraryActionsProps {
    sortBy: SortOption
    onSortChange: (sort: SortOption) => void
    onSearchToggle: () => void
    activeTab?: 'all' | 'movies' | 'tv' | 'history'
    filterBy?: FilterOption
    onFilterChange?: (filter: FilterOption) => void
}

export const LibraryActions: React.FC<LibraryActionsProps> = ({ sortBy, onSortChange, onSearchToggle, activeTab, filterBy = 'all', onFilterChange }) => {
    const [filterMenuOpen, setFilterMenuOpen] = useState(false)
    const [sortMenuOpen, setSortMenuOpen] = useState(false)
    const filterMenuRef = useRef<HTMLDivElement>(null)
    const sortMenuRef = useRef<HTMLDivElement>(null)
    const navigate = useNavigate()

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
        { value: 'recently-added', label: 'Recently Added' },
        { value: 'name-asc', label: 'Name (A-Z)' },
        { value: 'name-desc', label: 'Name (Z-A)' },
        { value: 'date-desc', label: 'Date (Newest)' },
        { value: 'date-asc', label: 'Date (Oldest)' },
        { value: 'rating-desc', label: 'Popularity' },
    ]

    const sortOptions = allSortOptions

    const allFilterOptions: { value: FilterOption; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'watched', label: 'Watched' },
        { value: 'unwatched', label: 'Unwatched' },
        { value: 'favorites', label: 'Favorites' },
    ]

    const filterOptions = allFilterOptions

    return (
        <div className="flex items-center gap-2">
            {activeTab !== 'history' && (
                <div className="relative" ref={filterMenuRef}>
                    <button
                        onClick={() => {
                            setFilterMenuOpen(!filterMenuOpen)
                            setSortMenuOpen(false)
                        }}
                        className="p-2 rounded-full text-gray-400 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                        <SlidersHorizontal className="w-6 h-6" />
                    </button>
                    {filterMenuOpen && (
                        <div className="absolute right-0 mt-2 w-56 bg-white/50 backdrop-blur-md rounded-xl shadow-2xl py-2 z-50">
                            <div className="px-4 py-2 text-xs font-semibold text-gray-900 uppercase">Filter</div>
                            {filterOptions.map(option => (
                                <button
                                    key={option.value}
                                    onClick={() => {
                                        onFilterChange?.(option.value)
                                        setFilterMenuOpen(false)
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-black/10 transition-colors flex items-center justify-between"
                                >
                                    <span className="text-gray-900 font-medium">{option.label}</span>
                                    {filterBy === option.value && <Check className="w-4 h-4 text-gray-900" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {activeTab !== 'history' && (
                <div className="relative" ref={sortMenuRef}>
                    <button
                        onClick={() => {
                            setSortMenuOpen(!sortMenuOpen)
                            setFilterMenuOpen(false)
                        }}
                        className="p-2 rounded-full text-gray-400 hover:bg-neutral-800 hover:text-white transition-colors"
                    >
                        <ArrowUpDown className="w-6 h-6" />
                    </button>
                    {sortMenuOpen && (
                        <div className="absolute right-0 mt-2 w-56 bg-white/50 backdrop-blur-md rounded-xl shadow-2xl py-2 z-50">
                            <div className="px-4 py-2 text-xs font-semibold text-gray-900 uppercase">Sort By</div>
                            {sortOptions.map(option => (
                                <button
                                    key={option.value}
                                    onClick={() => {
                                        onSortChange(option.value)
                                        setSortMenuOpen(false)
                                    }}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-black/10 transition-colors flex items-center justify-between"
                                >
                                    <span className="text-gray-900 font-medium">{option.label}</span>
                                    {sortBy === option.value && <Check className="w-4 h-4 text-gray-900" />}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <button
                onClick={onSearchToggle}
                className="p-2 rounded-full text-gray-400 hover:bg-neutral-800 hover:text-white transition-colors"
            >
                <Search className="w-6 h-6" />
            </button>
            <button
                onClick={() => navigate('/settings')}
                className="p-2 rounded-full text-gray-400 hover:bg-neutral-800 hover:text-white transition-colors"
            >
                <Settings className="w-6 h-6" />
            </button>
        </div>
    )
}
