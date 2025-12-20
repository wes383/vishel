import { useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

interface KeyboardShortcutsOptions {
    onSearch?: () => void
    onEscape?: () => void
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
    const navigate = useNavigate()
    const location = useLocation()

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        const target = e.target as HTMLElement
        const isInputField = target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable

        // Escape key
        if (e.key === 'Escape') {
            if (options.onEscape) {
                options.onEscape()
                e.preventDefault()
                return
            }
            if (location.pathname.startsWith('/movie/') || location.pathname.startsWith('/tv/')) {
                navigate('/')
                e.preventDefault()
                return
            }
            if (location.pathname === '/settings') {
                navigate('/')
                e.preventDefault()
                return
            }
        }

        if (isInputField) return

        // Ctrl/Cmd + F - Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            if (options.onSearch) {
                options.onSearch()
                e.preventDefault()
                return
            }
        }

        // Ctrl/Cmd + , - Open settings
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            navigate('/settings')
            e.preventDefault()
            return
        }

    }, [navigate, location, options])

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])
}

// Simpler hook for pages that just need basic navigation shortcuts
export function useGlobalShortcuts() {
    const navigate = useNavigate()
    const location = useLocation()

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement
            const isInputField = target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable

            // Escape - go back from detail/settings pages
            if (e.key === 'Escape' && !isInputField) {
                if (location.pathname !== '/') {
                    navigate('/')
                    e.preventDefault()
                }
            }

            // Ctrl/Cmd + , - Open settings
            if ((e.ctrlKey || e.metaKey) && e.key === ',') {
                if (location.pathname !== '/settings') {
                    navigate('/settings')
                }
                e.preventDefault()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [navigate, location])
}
