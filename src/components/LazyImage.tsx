import React, { useState, useEffect, useRef } from 'react'
import { ImageOff } from 'lucide-react'

interface LazyImageProps {
    src: string
    alt: string
    className?: string
    placeholderClassName?: string
    onLoad?: () => void
    /** Called when the image fails, e.g. to report a broken poster. */
    onError?: () => void
}

export const LazyImage: React.FC<LazyImageProps> = ({
    src,
    alt,
    className = '',
    placeholderClassName = '',
    onLoad,
    onError
}) => {
    const [status, setStatus] = useState<'pending' | 'loaded' | 'error'>('pending')
    const [isInView, setIsInView] = useState(false)
    const imgRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!imgRef.current) return

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setIsInView(true)
                        observer.disconnect()
                    }
                })
            },
            {
                rootMargin: '100px', // Start loading 100px before entering viewport
                threshold: 0.01
            }
        )

        observer.observe(imgRef.current)

        return () => {
            observer.disconnect()
        }
    }, [])

    // A failed or never-completed load used to leave the poster transparent with an
    // endless pulse skeleton; now it settles on a visible placeholder.
    useEffect(() => {
        setStatus('pending')
    }, [src])

    const handleLoad = () => {
        setStatus('loaded')
        onLoad?.()
    }

    const handleError = () => {
        setStatus('error')
        onError?.()
    }

    return (
        <div ref={imgRef} className={`relative ${placeholderClassName}`}>
            {status === 'pending' && (
                <div className={`absolute inset-0 bg-surface ${isInView ? 'animate-pulse' : ''} ${placeholderClassName}`} />
            )}
            {status === 'error' && (
                <div className={`absolute inset-0 bg-surface flex items-center justify-center text-foreground-faint ${placeholderClassName}`}>
                    <ImageOff className="w-8 h-8" aria-hidden="true" />
                    <span className="sr-only">{`Poster unavailable: ${alt}`}</span>
                </div>
            )}
            {isInView && status !== 'error' && (
                <img
                    src={src}
                    alt={alt}
                    className={`${className} ${status === 'loaded' ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
                    onLoad={handleLoad}
                    onError={handleError}
                    loading="lazy"
                />
            )}
        </div>
    )
}
