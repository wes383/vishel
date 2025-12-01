import React, { useState, useEffect, useRef } from 'react'

interface LazyImageProps {
    src: string
    alt: string
    className?: string
    placeholderClassName?: string
    onLoad?: () => void
}

export const LazyImage: React.FC<LazyImageProps> = ({
    src,
    alt,
    className = '',
    placeholderClassName = '',
    onLoad
}) => {
    const [isLoaded, setIsLoaded] = useState(false)
    const [isInView, setIsInView] = useState(false)
    const imgRef = useRef<HTMLImageElement>(null)

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

    const handleLoad = () => {
        setIsLoaded(true)
        onLoad?.()
    }

    return (
        <div ref={imgRef} className={`relative ${placeholderClassName}`}>
            {!isLoaded && (
                <div className={`absolute inset-0 bg-neutral-800 animate-pulse ${placeholderClassName}`} />
            )}
            {isInView && (
                <img
                    src={src}
                    alt={alt}
                    className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
                    onLoad={handleLoad}
                    loading="lazy"
                />
            )}
        </div>
    )
}
