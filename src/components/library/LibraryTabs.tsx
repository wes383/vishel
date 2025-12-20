import React from 'react'

interface LibraryTabsProps {
    activeTab: 'all' | 'movies' | 'tv' | 'history'
    onTabChange: (tab: 'all' | 'movies' | 'tv' | 'history') => void
}

export const LibraryTabs: React.FC<LibraryTabsProps> = ({ activeTab, onTabChange }) => {
    const tabs = [
        { id: 'all', label: 'All' },
        { id: 'movies', label: 'Movies' },
        { id: 'tv', label: 'TV Shows' },
        { id: 'history', label: 'History' },
    ] as const

    return (
        <>
            {/* Desktop Tabs */}
            <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-neutral-800 rounded-full p-1 transition-all duration-300">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={(e) => {
                            onTabChange(tab.id)
                                ; (e.target as HTMLButtonElement).blur()
                        }}
                        className={`flex items-center gap-1 lg:gap-2 px-3 py-1.5 lg:px-6 lg:py-2 text-sm lg:text-base rounded-full transition-all ${activeTab === tab.id ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
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
                                    ; (e.target as HTMLButtonElement).blur()
                            }}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-full transition-all ${activeTab === tab.id ? 'bg-white/10 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>
        </>
    )
}
