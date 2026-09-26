import React, { useCallback, useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

interface SearchInputProps {
    value: string
    onChange: (value: string) => void
    onClose: () => void
    visible: boolean
    placeholder?: string
}

/** Grace period so focus can travel from the input to the clear button without closing the field. */
const CLOSE_ON_BLUR_DELAY_MS = 120

export const SearchInput: React.FC<SearchInputProps> = ({
    value,
    onChange,
    onClose,
    visible,
    placeholder
}) => {
    // Resolved here rather than as a default parameter: a parameter default cannot see `t`.
    const { t } = useTranslation(['library', 'common'])
    const resolvedPlaceholder = placeholder ?? t('library:librarySearchPlaceholder')
    const inputRef = useRef<HTMLInputElement>(null)
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const isActiveRef = useRef(true)
    const inputId = useId()

    useEffect(() => {
        isActiveRef.current = true
        return () => {
            isActiveRef.current = false
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
        }
    }, [])

    const cancelClose = useCallback(() => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current)
            closeTimerRef.current = null
        }
    }, [])

    const scheduleClose = useCallback(() => {
        cancelClose()
        closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null
            if (isActiveRef.current) onClose()
        }, CLOSE_ON_BLUR_DELAY_MS)
    }, [cancelClose, onClose])

    useEffect(() => {
        if (!visible) {
            cancelClose()
            return
        }
        inputRef.current?.focus()
    }, [visible, cancelClose])

    if (!visible) return null

    const handleClear = () => {
        cancelClose()
        onChange('')
        inputRef.current?.focus()
    }

    return (
        <div
            role="search"
            aria-label={t('library:librarySearch')}
            className="mb-6 relative"
            onBlur={(event) => {
                // Focus leaving the whole search block closes it while the query is empty.
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
                if (!value) scheduleClose()
            }}
        >
            <label htmlFor={inputId} className="sr-only">
                {t('library:searchTheLibrary')}
            </label>
            <input
                ref={inputRef}
                id={inputId}
                type="text"
                autoComplete="off"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key !== 'Escape') return
                    // Handled here, so the page-level Escape does not also fire.
                    event.preventDefault()
                    event.stopPropagation()
                    cancelClose()
                    // First Escape clears the query, a second one collapses the field.
                    if (value) onChange('')
                    else onClose()
                }}
                placeholder={resolvedPlaceholder}
                className="library-search-input w-full bg-neutral-800 text-white px-4 py-3 pr-10 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            />
            {value && (
                <button
                    type="button"
                    onMouseDown={(event) => {
                        // Keep focus on the input so the block does not close on blur.
                        event.preventDefault()
                        cancelClose()
                    }}
                    onClick={handleClear}
                    aria-label={t('library:clearSearch')}
                    title={t('library:clearSearch')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                    <X className="w-5 h-5" aria-hidden="true" />
                </button>
            )}
        </div>
    )
}
