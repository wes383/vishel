import React, { useState, useRef, useEffect } from 'react'
import { Settings, Search, ArrowUpDown, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export type SortOption = 'name-asc' | 'name-desc' | 'date-desc' | 'date-asc' | 'rating-desc' | 'imdb-rating-desc'

interface LibraryActionsProps {
    sortBy: SortOption
    onSortChange: (sort: SortOption) => void
    onSearchToggle: () => void
}

export const LibraryActions: React.FC<LibraryActionsProps> = ({ sortBy, onSortChange, onSearchToggle }) => {
    const [filterMenuOpen, setFilterMenuOpen] = useState(false)
    const filterMenuRef = useRef<HTMLDivElement>(null)
    const navigate = useNavigate()

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
                setFilterMenuOpen(false)
            }
        }
        if (filterMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [filterMenuOpen])

    const sortOptions: { value: SortOption; label: string }[] = [
        { value: 'name-asc', label: 'Name (A-Z)' },
        { value: 'name-desc', label: 'Name (Z-A)' },
        { value: 'date-desc', label: 'Date (Newest)' },
        { value: 'date-asc', label: 'Date (Oldest)' },
        { value: 'rating-desc', label: 'Popularity (Highest)' },
        { value: 'imdb-rating-desc', label: 'IMDb Rating' },
    ]

    return (
        <div className="flex items-center gap-2">
            <div className="relative" ref={filterMenuRef}>
                <button
                    onClick={() => setFilterMenuOpen(!filterMenuOpen)}
                    className="p-2 rounded-full text-gray-400 hover:bg-neutral-800 hover:text-white transition-colors"
                >
                    <ArrowUpDown className="w-6 h-6" />
                </button>
                {filterMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-neutral-800 rounded-lg shadow-xl border border-neutral-700 py-2 z-50">
                        <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Sort By</div>
                        {sortOptions.map(option => (
                            <button
                                key={option.value}
                                onClick={() => {
                                    onSortChange(option.value)
                                    setFilterMenuOpen(false)
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-700 transition-colors flex items-center justify-between"
                            >
                                <span className="text-white">{option.label}</span>
                                {sortBy === option.value && <Check className="w-4 h-4 text-white" />}
                            </button>
                        ))}
                    </div>
                )}
            </div>
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
