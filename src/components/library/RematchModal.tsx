import React, { useState } from 'react'
import { X, Search, Loader2, ChevronDown, Film, Tv } from 'lucide-react'

interface VideoFile {
    id: string
    name: string
    filePath: string
    webdavUrl: string
    sourceId: string
}

interface SearchResult {
    id: number
    title?: string
    name?: string
    posterPath: string | null
    releaseDate?: string
    firstAirDate?: string
    overview: string
    mediaType: 'movie' | 'tv'
}

interface RematchModalProps {
    mediaId: number
    mediaType: 'movie' | 'tv'
    currentTitle: string
    videoFiles: VideoFile[]
    onClose: () => void
    onRematch: (newTmdbId: number, fileId?: string, newMediaType?: 'movie' | 'tv', episodeInfo?: { season: number, episode: number }) => void
}

export const RematchModal: React.FC<RematchModalProps> = ({ 
    mediaId, 
    mediaType, 
    currentTitle,
    videoFiles,
    onClose, 
    onRematch 
}) => {
    const [searchQuery, setSearchQuery] = useState(currentTitle)
    const [searchType, setSearchType] = useState<'movie' | 'tv'>(mediaType)
    const [searching, setSearching] = useState(false)
    const [results, setResults] = useState<SearchResult[]>([])
    const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
    const [selectedFileId, setSelectedFileId] = useState<string | 'all'>(videoFiles.length > 1 ? 'all' : videoFiles[0]?.id || 'all')
    const [episodeInfo, setEpisodeInfo] = useState({ season: 1, episode: 1 })
    const [fileDropdownOpen, setFileDropdownOpen] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [loadingMore, setLoadingMore] = useState(false)
    const resultsContainerRef = React.useRef<HTMLDivElement>(null)

    const handleSearch = async (page: number = 1) => {
        if (!searchQuery.trim()) return

        if (page === 1) {
            setSearching(true)
            setResults([])
            setCurrentPage(1)
        } else {
            setLoadingMore(true)
        }

        try {
            const data = await window.electron.ipcRenderer.invoke('search-tmdb', {
                query: searchQuery,
                type: searchType,
                page
            })
            
            const newResults = (data.results || []).map((r: any) => ({
                id: r.id,
                title: r.title,
                name: r.name,
                posterPath: r.poster_path,
                releaseDate: r.release_date,
                firstAirDate: r.first_air_date,
                overview: r.overview,
                mediaType: searchType
            }))

            if (page === 1) {
                setResults(newResults)
            } else {
                setResults(prev => [...prev, ...newResults])
            }
            
            setCurrentPage(data.page || page)
            setTotalPages(data.totalPages || 1)
        } catch (error) {
            console.error('Search failed:', error)
        } finally {
            setSearching(false)
            setLoadingMore(false)
        }
    }

    const loadMoreResults = () => {
        if (currentPage < totalPages && !loadingMore) {
            handleSearch(currentPage + 1)
        }
    }

    const handleConfirm = () => {
        if (!selectedResult) return
        if (selectedResult.id === mediaId && selectedFileId === 'all') return
        
        if (selectedFileId === 'all') {
            onRematch(selectedResult.id)
        } else {
            const episodeData = searchType === 'tv' ? episodeInfo : undefined
            onRematch(selectedResult.id, selectedFileId, searchType, episodeData)
        }
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !searching) {
            handleSearch()
        }
    }

    React.useEffect(() => {
        if (searchQuery.trim()) {
            handleSearch()
        }
    }, [])

    React.useEffect(() => {
        const handleClickOutside = () => setFileDropdownOpen(false)
        if (fileDropdownOpen) {
            document.addEventListener('click', handleClickOutside)
            return () => document.removeEventListener('click', handleClickOutside)
        }
    }, [fileDropdownOpen])

    React.useEffect(() => {
        const container = resultsContainerRef.current
        if (!container) return

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container
            if (scrollHeight - scrollTop - clientHeight < 50) {
                loadMoreResults()
            }
        }

        container.addEventListener('scroll', handleScroll)
        return () => container.removeEventListener('scroll', handleScroll)
    }, [currentPage, totalPages, loadingMore])

    const getSelectedFileName = () => {
        if (selectedFileId === 'all') {
            return `All Files (${videoFiles.length})`
        }
        const file = videoFiles.find(f => f.id === selectedFileId)
        return file?.name || 'Select file...'
    }

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-white/50 backdrop-blur-md rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-900/10">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-baseline gap-3">
                            <h2 className="text-2xl font-bold text-gray-900">Rematch {mediaType === 'movie' ? 'Movie' : 'TV Show'}</h2>
                            <p className="text-sm text-gray-600">Current: {currentTitle}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-black/10 rounded-full transition-colors text-gray-900"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* File Selection */}
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="relative flex-1">
                                {videoFiles.length > 1 ? (
                                    <>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setFileDropdownOpen(!fileDropdownOpen)
                                            }}
                                            className="w-full bg-black/10 border border-gray-900/20 rounded-xl px-4 py-2 pr-10 outline-none focus:border-gray-900 transition-colors text-left text-gray-900"
                                        >
                                            {getSelectedFileName()}
                                        </button>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 pointer-events-none" />
                                        
                                        {/* Custom Dropdown */}
                                        {fileDropdownOpen && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-900/20 rounded-xl shadow-xl z-50 max-h-64 overflow-auto episode-selector-scroll">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        setSelectedFileId('all')
                                                        setFileDropdownOpen(false)
                                                    }}
                                                    className={`w-full px-4 py-3 text-left hover:bg-black/10 transition-colors text-gray-900 ${
                                                        selectedFileId === 'all' ? 'bg-black/10' : ''
                                                    }`}
                                                >
                                                    All Files ({videoFiles.length})
                                                </button>
                                                {videoFiles.map((file) => (
                                                    <button
                                                        key={file.id}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setSelectedFileId(file.id)
                                                            setFileDropdownOpen(false)
                                                        }}
                                                        className={`w-full px-4 py-3 text-left hover:bg-black/10 transition-colors truncate text-gray-900 ${
                                                            selectedFileId === file.id ? 'bg-black/10' : ''
                                                        }`}
                                                        title={file.name}
                                                    >
                                                        {file.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="w-full bg-black/10 border border-gray-900/20 rounded-xl px-4 py-2 text-gray-900">
                                        {videoFiles[0]?.name || 'No file'}
                                    </div>
                                )}
                            </div>
                        </div>
                        {selectedFileId !== 'all' && videoFiles.length > 1 && (
                            <p className="text-xs text-gray-600 mt-2">
                                Only the selected file will be moved to the new match.
                            </p>
                        )}
                    </div>
                </div>

                {/* Search Section */}
                <div className="p-6 border-b border-gray-900/10">
                    <div className="flex gap-3">
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setSearchType('movie')
                                    setResults([])
                                    setSelectedResult(null)
                                }}
                                className={`px-4 py-2 rounded-xl font-medium transition-colors whitespace-nowrap ${
                                    searchType === 'movie'
                                        ? 'bg-gray-900 text-white'
                                        : 'bg-black/10 text-gray-900 hover:bg-black/20'
                                }`}
                            >
                                Movie
                            </button>
                            <button
                                onClick={() => {
                                    setSearchType('tv')
                                    setResults([])
                                    setSelectedResult(null)
                                }}
                                className={`px-4 py-2 rounded-xl font-medium transition-colors whitespace-nowrap ${
                                    searchType === 'tv'
                                        ? 'bg-gray-900 text-white'
                                        : 'bg-black/10 text-gray-900 hover:bg-black/20'
                                }`}
                            >
                                TV Show
                            </button>
                        </div>
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder={`Search for ${searchType === 'movie' ? 'movie' : 'TV show'}...`}
                                className="w-full bg-black/10 border border-gray-900/20 rounded-xl pl-10 pr-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900 placeholder:text-gray-500"
                                autoFocus
                            />
                        </div>
                        <button
                            onClick={() => handleSearch()}
                            disabled={searching || !searchQuery.trim()}
                            className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                        >
                            {searching ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Searching...
                                </>
                            ) : (
                                'Search'
                            )}
                        </button>
                    </div>
                </div>

                {/* Results Section */}
                <div ref={resultsContainerRef} className="flex-1 overflow-auto p-6 episode-selector-scroll">
                    {results.length === 0 ? (
                        <div className="text-center text-gray-600 py-12">
                            <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>Search for a {searchType === 'movie' ? 'movie' : 'TV show'} to rematch</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3">
                                {results.map((result) => {
                                    const title = result.title || result.name || 'Unknown'
                                    const date = result.releaseDate || result.firstAirDate || ''
                                    const year = date ? date.split('-')[0] : ''
                                    const isSelected = selectedResult?.id === result.id

                                    return (
                                        <div
                                            key={result.id}
                                            onClick={() => setSelectedResult(result)}
                                            className={`flex gap-4 p-4 rounded-xl cursor-pointer transition-all ${
                                                isSelected
                                                    ? 'bg-black/20 border-2 border-gray-900'
                                                    : 'bg-black/10 hover:bg-black/20 border-2 border-transparent'
                                            }`}
                                        >
                                            {result.posterPath ? (
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w185${result.posterPath}`}
                                                    alt={title}
                                                    className="w-16 h-24 object-cover rounded"
                                                />
                                            ) : (
                                                <div className="w-16 h-24 bg-black/20 rounded flex items-center justify-center text-gray-600">
                                                    {searchType === 'movie' ? <Film className="w-8 h-8" /> : <Tv className="w-8 h-8" />}
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold text-lg truncate text-gray-900">
                                                    {title} {year && <span className="text-gray-600">({year})</span>}
                                                </h3>
                                                <p className="text-sm text-gray-600 line-clamp-2 mt-1">
                                                    {result.overview || 'No description available'}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            
                            {/* Loading More Indicator */}
                            {loadingMore && (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
                                    <span className="ml-2 text-gray-600">Loading more...</span>
                                </div>
                            )}
                            
                            {/* End of Results */}
                            {currentPage >= totalPages && results.length > 0 && (
                                <div className="text-center py-4 text-gray-600 text-sm">
                                    No more results
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Episode Info (for TV shows with single file) */}
                {selectedResult && searchType === 'tv' && selectedFileId !== 'all' && (
                    <div className="p-6 border-t border-gray-900/10">
                        <h3 className="font-semibold mb-3 text-gray-900">Episode Information</h3>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-sm text-gray-600 mb-1">Season</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="10000"
                                    value={episodeInfo.season}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value) || 1
                                        setEpisodeInfo({ ...episodeInfo, season: Math.min(Math.max(val, 1), 10000) })
                                    }}
                                    className="w-full bg-black/10 border border-gray-900/20 rounded-xl px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-sm text-gray-600 mb-1">Episode</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="10000"
                                    value={episodeInfo.episode}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value) || 1
                                        setEpisodeInfo({ ...episodeInfo, episode: Math.min(Math.max(val, 1), 10000) })
                                    }}
                                    className="w-full bg-black/10 border border-gray-900/20 rounded-xl px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-900/10">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 rounded-xl font-medium bg-black/10 hover:bg-black/20 transition-colors text-gray-900"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!selectedResult || selectedResult.id === mediaId}
                        className="px-6 py-2 rounded-xl font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Confirm Rematch
                    </button>
                </div>
            </div>
        </div>
    )
}
