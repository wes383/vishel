import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface SearchInputProps {
    value: string
    onChange: (value: string) => void
    onClose: () => void
    visible: boolean
}

export const SearchInput: React.FC<SearchInputProps> = ({ value, onChange, onClose, visible }) => {
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (visible && inputRef.current) {
            inputRef.current.focus()
        }
    }, [visible])

    if (!visible) return null

    return (
        <div className="mb-6 relative">
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        onChange('')
                        onClose()
                        e.preventDefault()
                    }
                }}
                onBlur={() => {
                    if (!value) {
                        // Small delay to allow clicking the close button or other elements
                        setTimeout(() => {
                            onClose()
                        }, 100)
                    }
                }}
                placeholder="Search movies and TV shows..."
                className="w-full bg-neutral-800 text-white px-4 py-3 pr-10 rounded-full focus:outline-none focus:ring-2 focus:ring-white/20"
            />
            {value && (
                <button
                    onClick={() => onChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            )}
        </div>
    )
}
