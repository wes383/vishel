import { useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

interface KeyboardShortcutsOptions {
    onSearch?: () => void
    onEscape?: () => void
}

function scrollHomeToTop() {
    const scrollContainer = document.querySelector('.library-scroll-container') as HTMLElement | null
    if (scrollContainer) {
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
        return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
    const navigate = useNavigate()
    const location = useLocation()

    // Held in a ref so an inline callback from the caller does not re-subscribe on every render.
    const handlers = useRef(options)
    useEffect(() => {
        handlers.current = options
    })

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        const target = e.target as HTMLElement
        const isInputField = target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable

        // Escape key
        if (e.key === 'Escape') {
            if (handlers.current.onEscape) {
                handlers.current.onEscape()
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
            if (location.pathname === '/') {
                scrollHomeToTop()
                e.preventDefault()
                return
            }
        }

        if (isInputField) return

        // Ctrl/Cmd + F - Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            if (handlers.current.onSearch) {
                handlers.current.onSearch()
                e.preventDefault()
                return
            }
        }

    }, [navigate, location])

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])
}
