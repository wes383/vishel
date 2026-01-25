import React, { useState, useRef, useEffect } from 'react'

interface LibraryTabsProps {
    activeTab: 'all' | 'movies' | 'tv' | 'favorites' | 'history'
    onTabChange: (tab: 'all' | 'movies' | 'tv' | 'favorites' | 'history') => void
}

export const LibraryTabs: React.FC<LibraryTabsProps> = ({ activeTab, onTabChange }) => {
    const tabs = [
        { id: 'all', label: 'All' },
        { id: 'movies', label: 'Movies' },
        { id: 'tv', label: 'TV Shows' },
        { id: 'favorites', label: 'Favorites' },
        { id: 'history', label: 'History' },
    ] as const

    const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
    const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({})
    const containerRef = useRef<HTMLDivElement>(null)
    const isFirstRenderRef = useRef(true)

    useEffect(() => {
        updateIndicator(activeTab)
    }, [activeTab])
    
    // Update indicator on window resize
    useEffect(() => {
        const handleResize = () => {
            updateIndicator(activeTab)
        }
        
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [activeTab])

    const updateIndicator = (tabId: string) => {
        const tabElement = tabRefs.current[tabId]
        const container = containerRef.current
        if (tabElement && container) {
            const containerRect = container.getBoundingClientRect()
            const tabRect = tabElement.getBoundingClientRect()
            setIndicatorStyle({
                left: tabRect.left - containerRect.left,
                width: tabRect.width,
            })
            if (isFirstRenderRef.current) {
                setTimeout(() => {
                    isFirstRenderRef.current = false
                }, 50)
            }
        }
    }

    return (
        <>
            {/* Desktop Tabs */}
            <div 
                ref={containerRef}
                className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-neutral-800 rounded-full p-1 transition-all duration-300"
            >
                {/* Animated indicator */}
                <div
                    className="absolute bg-white/10 rounded-full shadow-sm pointer-events-none"
                    style={{
                        left: `${indicatorStyle.left}px`,
                        width: `${indicatorStyle.width}px`,
                        top: '4px',
                        bottom: '4px',
                        transition: isFirstRenderRef.current ? 'none' : 'all 0.25s ease-out',
                    }}
                />
                
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        ref={(el) => (tabRefs.current[tab.id] = el)}
                        onClick={(e) => {
                            onTabChange(tab.id)
                            ;(e.target as HTMLButtonElement).blur()
                        }}
                        className={`relative z-10 flex items-center gap-1 lg:gap-2 px-3 py-1.5 lg:px-6 lg:py-2 text-sm lg:text-base rounded-full transition-colors whitespace-nowrap ${
                            activeTab === tab.id ? 'text-white' : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Mobile Tabs */}
            <div className="flex md:hidden justify-center">
                <div className="flex bg-neutral-800 rounded-full p-1 text-sm">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={(e) => {
                                onTabChange(tab.id)
                                ;(e.target as HTMLButtonElement).blur()
                            }}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-full transition-all whitespace-nowrap ${
                                activeTab === tab.id ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>
        </>
    )
}
