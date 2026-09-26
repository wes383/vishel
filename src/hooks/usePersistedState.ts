import { useEffect, useState } from 'react'

/**
 * UI preferences were each stored with their own lazy-init-plus-effect pair across two
 * storages; this keeps that behaviour in one place.
 */
export function usePersistedState<T>(storage: 'local' | 'session', key: string, fallback: T) {
    const [value, setValue] = useState<T>(() => {
        try {
            const stored = storage === 'local'
                ? localStorage.getItem(key)
                : sessionStorage.getItem(key)
            if (stored === null) return fallback
            if (typeof fallback === 'string') return stored as unknown as T
            return JSON.parse(stored) as T
        } catch {
            return fallback
        }
    })

    useEffect(() => {
        try {
            const target = storage === 'local' ? localStorage : sessionStorage
            target.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
        } catch (error) {
            console.warn(`Failed to persist ${key}:`, error)
        }
    }, [storage, key, value])

    return [value, setValue] as const
}
