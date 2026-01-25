import React, { useState } from 'react'
import { X, Search, Loader2, Film, Tv } from 'lucide-react'
import { UnscannedFile } from '../../types/library'

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

interface ManualMatchModalProps {
    file: UnscannedFile
    onClose: () => void
    onMatch: (fileId: string, result: SearchResult, episodeInfo?: { season: number, episode: number }) => void
}

export const ManualMatchModal: React.FC<ManualMatchModalProps> = ({ file, onClose, onMatch }) => {
    const getInitialQuery = () => {
        let name = file.name.replace(/\.[^/.]+$/, '')
        name = name.replace(/[\.\-_]/g, ' ')
        name = name.replace(/\b(1080p|720p|4k|2160p|bluray|webdl|x264|x265|hevc|aac|ac3|dts|truehd)\b/gi, '')
        name = name.replace(/[\[\(\{].*?[\]\}\)]/g, '')
        name = name.replace(/\b(19|20)\d{2}\b.*$/, '')
        return name.trim()
    }

    const [searchQuery, setSearchQuery] = useState(getInitialQuery())
    const [searchType, setSearchType] = useState<'movie' | 'tv'>('movie')
    const [searching, setSearching] = useState(false)
    const [results, setResults] = useState<SearchResult[]>([])
    const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
    const [episodeInfo, setEpisodeInfo] = useState({ season: 1, episode: 1 })

    const handleSearch = async () => {
        if (!searchQuery.trim()) return

        setSearching(true)
        try {
            const data = await window.electron.ipcRenderer.invoke('search-tmdb', {
                query: searchQuery,
                type: searchType
            })
            
            const resultsArray = data.results || data || []
            setResults(resultsArray.map((r: any) => ({
                id: r.id,
                title: r.title,
                name: r.name,
                posterPath: r.poster_path,
                releaseDate: r.release_date,
                firstAirDate: r.first_air_date,
                overview: r.overview,
                mediaType: searchType
            })))
        } catch (error) {
            console.error('Search failed:', error)
        } finally {
            setSearching(false)
        }
    }

    const handleConfirm = () => {
        if (!selectedResult) return
        
        const episodeData = searchType === 'tv' ? episodeInfo : undefined
        onMatch(file.id, selectedResult, episodeData)
        onClose()
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

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-white/50 backdrop-blur-md rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-900/10">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Manual Match</h2>
                        <p className="text-sm text-gray-600 mt-1 truncate max-w-xl">{file.name}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-black/10 rounded-full transition-colors text-gray-900"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Search Section */}
                <div className="p-6 border-b border-gray-900/10">
                    <div className="flex gap-3 mb-4">
                        <button
                            onClick={() => {
                                setSearchType('movie')
                                setResults([])
                                setSelectedResult(null)
                            }}
                            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
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
                            className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                                searchType === 'tv'
                                    ? 'bg-gray-900 text-white'
                                    : 'bg-black/10 text-gray-900 hover:bg-black/20'
                            }`}
                        >
                            TV Show
                        </button>
                    </div>

                    <div className="flex gap-3">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyPress={handleKeyPress}
                                placeholder={`Search for ${searchType === 'movie' ? 'movie' : 'TV show'}...`}
                                className="w-full bg-black/10 border border-gray-900/20 rounded-xl pl-10 pr-4 py-3 outline-none focus:border-gray-900 transition-colors text-gray-900 placeholder:text-gray-500"
                                autoFocus
                            />
                        </div>
                        <button
                            onClick={handleSearch}
                            disabled={searching || !searchQuery.trim()}
                            className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                <div className="flex-1 overflow-auto p-6 episode-selector-scroll">
                    {results.length === 0 ? (
                        <div className="text-center text-gray-600 py-12">
                            <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>Search for a {searchType === 'movie' ? 'movie' : 'TV show'} to match this file</p>
                        </div>
                    ) : (
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
                    )}
                </div>

                {/* Episode Info (for TV shows) */}
                {selectedResult && searchType === 'tv' && (
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
                        disabled={!selectedResult}
                        className="px-6 py-2 rounded-xl font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Confirm Match
                    </button>
                </div>
            </div>
        </div>
    )
}
