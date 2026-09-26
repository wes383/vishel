import { useEffect, useState } from 'react'

export interface ImdbRatingValue {
    rating: number
    votes: number
}

/**
 * IMDb ratings come from a third-party endpoint, so the request belongs in the main process
 * (the renderer has no network access under the content security policy).
 */
export function useImdbRating(imdbId: string | undefined, enabled: boolean) {
    const [value, setValue] = useState<ImdbRatingValue | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!imdbId || !enabled) {
            setValue(null)
            setLoading(false)
            return
        }

        let active = true
        setLoading(true)

        window.electron.ipcRenderer.invoke('get-imdb-rating', imdbId)
            .then(rating => {
                if (active) setValue(rating)
            })
            .catch(error => {
                console.warn('Failed to fetch IMDb rating:', error)
            })
            .finally(() => {
                if (active) setLoading(false)
            })

        return () => {
            active = false
        }
    }, [imdbId, enabled])

    return { rating: value, loading }
}
