import { useState, useEffect } from 'react'
import { Plus, X, RefreshCw, AlertCircle, Check, ChevronUp, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { DataSource } from '../../electron/store'
import DataSourceList from '../components/DataSourceList'
import AddSourceModal from '../components/AddSourceModal'
import EditSourceModal from '../components/EditSourceModal'
import TMDBLogo from '../assets/TMDB_logo.svg'
import {
    defaultMovieExternalLinks,
    defaultTvExternalLinks,
    normalizeExternalLinks,
    type ExternalLinkConfig
} from '../utils/externalLinks'

interface SettingsData {
    tmdbApiKey: string
    playerPath: string
    customPlayerPath: string
    hideEpisodeSpoilers: boolean
    showTitlesOnPosters: boolean
    posterTitleMode: 'hover' | 'below' | 'hidden'
    minimizeToTray: boolean
    autoMarkWatchedEnabled: boolean
    autoMarkWatchedScope: 'movies' | 'all'
    useFormattedTitle: boolean
    showImdbRating: boolean
    preferTextTitle: boolean
    posterSize: 'small' | 'medium' | 'large'
    probeVideoMetadataEnabled: boolean
    movieExternalLinks: ExternalLinkConfig[]
    tvExternalLinks: ExternalLinkConfig[]
    sources: DataSource[]
}

interface LibraryStats {
    movies: number
    tvShows: number
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<SettingsData>({
        tmdbApiKey: '',
        playerPath: '',
        customPlayerPath: '',
        hideEpisodeSpoilers: false,
        showTitlesOnPosters: false,
        posterTitleMode: 'hover',
        minimizeToTray: false,
        autoMarkWatchedEnabled: false,
        autoMarkWatchedScope: 'movies',
        useFormattedTitle: true,
        showImdbRating: true,
        preferTextTitle: false,
        posterSize: 'medium',
        probeVideoMetadataEnabled: true,
        movieExternalLinks: defaultMovieExternalLinks.map(link => ({ ...link })),
        tvExternalLinks: defaultTvExternalLinks.map(link => ({ ...link })),
        sources: []
    })
    const [stats, setStats] = useState<LibraryStats>({ movies: 0, tvShows: 0 })
    const [scanning, setScanning] = useState(false)
    const [showAddModal, setShowAddModal] = useState(false)
    const [editingSource, setEditingSource] = useState<DataSource | null>(null)
    const [appVersion, setAppVersion] = useState<string>('')
    const [showIinaWarning, setShowIinaWarning] = useState(false)
    const [detectedPlayers, setDetectedPlayers] = useState<{ name: string; path: string }[]>([])
    const [detectingPlayers, setDetectingPlayers] = useState(false)
    const [customPlayerPath, setCustomPlayerPath] = useState('')
    const navigate = useNavigate()

    const fetchStats = () => {
        window.electron.ipcRenderer.invoke('get-library-stats').then((data: LibraryStats) => {
            setStats(data)
        })
    }

    const handleSelectPlayer = (playerPath: string) => {
        const newSettings = { ...settings, playerPath: playerPath }
        setSettings(newSettings)
        autoSave(newSettings)

        if (playerPath.toLowerCase().includes('iina.app') && !playerPath.toLowerCase().includes('iina-cli')) {
            setShowIinaWarning(true)
        } else {
            setShowIinaWarning(false)
        }
    }

    useEffect(() => {
        const init = async () => {
            fetchStats()

            const data = await window.electron.ipcRenderer.invoke('get-settings')
            const sources = Array.isArray(data.sources) ? data.sources : []
            const movieExternalLinks = normalizeExternalLinks(data.movieExternalLinks, defaultMovieExternalLinks)
            const tvExternalLinks = normalizeExternalLinks(data.tvExternalLinks, defaultTvExternalLinks)
            const posterTitleMode: 'hover' | 'below' | 'hidden' =
                data.posterTitleMode || (data.showTitlesOnPosters ? 'below' : 'hover')
            setSettings({ ...data, posterTitleMode, sources, movieExternalLinks, tvExternalLinks })

            const isScanning = await window.electron.ipcRenderer.invoke('get-scan-status')
            setScanning(isScanning)

            const version = await window.electron.ipcRenderer.invoke('get-app-version')
            setAppVersion(version)

            // Detect players and restore custom player path from settings
            setDetectingPlayers(true)
            try {
                const players = await window.electron.ipcRenderer.invoke('detect-players')
                setDetectedPlayers(players || [])
                // Restore custom player path from saved settings
                if (data.customPlayerPath) {
                    setCustomPlayerPath(data.customPlayerPath)
                    if (data.playerPath && !players?.some((p: { path: string }) => p.path === data.playerPath)) {
                        const newSettings = { ...data, playerPath: data.customPlayerPath }
                        setSettings(newSettings)
                        await window.electron.ipcRenderer.invoke('save-settings', newSettings)
                    }
                } else if (data.playerPath && !players?.some((p: { path: string }) => p.path === data.playerPath)) {
                    setCustomPlayerPath(data.playerPath)
                }
            } catch (error) {
                console.error('Failed to detect players:', error)
            }
            setDetectingPlayers(false)
        }

        init()
    }, [])

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement
            const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

            // Escape - go back
            if (e.key === 'Escape') {
                if (showAddModal) {
                    setShowAddModal(false)
                } else if (editingSource) {
                    setEditingSource(null)
                } else if (!isInputField) {
                    navigate('/')
                }
                e.preventDefault()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [navigate, showAddModal, editingSource])

    const autoSave = async (newSettings: SettingsData) => {
        await window.electron.ipcRenderer.invoke('save-settings', newSettings)
    }

    const handleScan = async () => {
        setScanning(true)
        try {
            await window.electron.ipcRenderer.invoke('scan-library', false)
        } catch (error) {
            console.error('Scan error:', error)
        }
        setScanning(false)
        fetchStats()
    }

    const handleFullRescan = async () => {
        setScanning(true)
        try {
            await window.electron.ipcRenderer.invoke('full-rescan-library')
        } catch (error) {
            console.error('Full rescan error:', error)
        }
        setScanning(false)
        fetchStats()
    }

    const handleAddSource = (source: DataSource) => {
        const newSettings = {
            ...settings,
            sources: [...settings.sources, source]
        }
        setSettings(newSettings)
        window.electron.ipcRenderer.invoke('save-settings', newSettings)
    }

    const handleRemoveSource = (id: string) => {
        const newSettings = {
            ...settings,
            sources: settings.sources.filter(s => s.id !== id)
        }
        setSettings(newSettings)
        window.electron.ipcRenderer.invoke('save-settings', newSettings)
    }

    const handleEditSource = (source: DataSource) => {
        setEditingSource(source)
    }

    const handleSaveEditedSource = (updatedSource: DataSource) => {
        const newSettings = {
            ...settings,
            sources: settings.sources.map(s => s.id === updatedSource.id ? updatedSource : s)
        }
        setSettings(newSettings)
        window.electron.ipcRenderer.invoke('save-settings', newSettings)
    }

    const updateExternalLink = (
        mediaType: 'movieExternalLinks' | 'tvExternalLinks',
        index: number,
        key: 'label' | 'template',
        value: string
    ) => {
        const links = settings[mediaType].map((link, i) => i === index ? { ...link, [key]: value } : link)
        setSettings({ ...settings, [mediaType]: links })
    }

    const saveExternalLinks = async (mediaType: 'movieExternalLinks' | 'tvExternalLinks') => {
        const newSettings = { ...settings, [mediaType]: settings[mediaType].map(link => ({ ...link })) }
        setSettings(newSettings)
        await autoSave(newSettings)
    }

    const addExternalLink = async (mediaType: 'movieExternalLinks' | 'tvExternalLinks') => {
        const newSettings = {
            ...settings,
            [mediaType]: [...settings[mediaType], { label: '', template: '' }]
        }
        setSettings(newSettings)
        await autoSave(newSettings)
    }

    const removeExternalLink = async (mediaType: 'movieExternalLinks' | 'tvExternalLinks', index: number) => {
        const newSettings = {
            ...settings,
            [mediaType]: settings[mediaType].filter((_, i) => i !== index)
        }
        setSettings(newSettings)
        await autoSave(newSettings)
    }

    const moveExternalLink = async (
        mediaType: 'movieExternalLinks' | 'tvExternalLinks',
        index: number,
        direction: 'up' | 'down'
    ) => {
        const links = [...settings[mediaType]]
        const targetIndex = direction === 'up' ? index - 1 : index + 1
        if (targetIndex < 0 || targetIndex >= links.length) return
        const temp = links[index]
        links[index] = links[targetIndex]
        links[targetIndex] = temp
        const newSettings = { ...settings, [mediaType]: links }
        setSettings(newSettings)
        await autoSave(newSettings)
    }

    const resetExternalLinksToDefault = async () => {
        const newSettings = {
            ...settings,
            movieExternalLinks: defaultMovieExternalLinks.map(link => ({ ...link })),
            tvExternalLinks: defaultTvExternalLinks.map(link => ({ ...link }))
        }
        setSettings(newSettings)
        await autoSave(newSettings)
    }

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold">Settings</h1>
                <button
                    onClick={() => navigate('/')}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            <div className="space-y-8">
                {/* Data Sources Section */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-white">Data Sources</h2>
                        <div className="flex gap-3">
                            <button
                                onClick={handleScan}
                                disabled={scanning}
                                className={`flex items-center gap-2 bg-white hover:bg-gray-200 text-black px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${scanning ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
                                {scanning ? 'Scanning...' : 'Quick Scan'}
                            </button>
                            <button
                                onClick={handleFullRescan}
                                disabled={scanning}
                                className={`flex items-center gap-2 bg-white hover:bg-gray-200 text-black px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${scanning ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
                                {scanning ? 'Scanning...' : 'Full Rescan'}
                            </button>
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="bg-white hover:bg-gray-200 text-black px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Add Source
                            </button>
                        </div>
                    </div>

                    <div className="mb-4 px-1">
                        <p className="text-sm text-gray-400 mb-1">
                            <span className="font-semibold text-gray-300">Quick Scan:</span> Fast scan that only checks for new or deleted files.
                        </p>
                        <p className="text-sm text-gray-400">
                            <span className="font-semibold text-gray-300">Full Rescan:</span> Complete refresh of all metadata.
                        </p>
                    </div>

                    <DataSourceList
                        sources={settings.sources}
                        onRemove={handleRemoveSource}
                        onEdit={handleEditSource}
                    />
                </section>

                <hr className="border-neutral-800" />

                {/* Library Statistics */}
                <section>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-neutral-800 p-4 rounded-lg">
                            <h3 className="text-sm font-medium text-gray-400 mb-1">Total Movies</h3>
                            <p className="text-2xl font-bold text-white">{stats.movies}</p>
                        </div>
                        <div className="bg-neutral-800 p-4 rounded-lg">
                            <h3 className="text-sm font-medium text-gray-400 mb-1">Total TV Shows</h3>
                            <p className="text-2xl font-bold text-white">{stats.tvShows}</p>
                        </div>
                    </div>
                </section>

                <hr className="border-neutral-800" />

                {/* General Settings Section */}
                <section className="space-y-4">
                    <h2 className="text-xl font-semibold text-white -mt-[5px]">General Configuration</h2>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">TMDB API Key</label>
                        <input
                            type="text"
                            value={settings.tmdbApiKey}
                            onChange={e => {
                                const newSettings = { ...settings, tmdbApiKey: e.target.value }
                                setSettings(newSettings)
                            }}
                            onBlur={() => autoSave(settings)}
                            spellCheck={false}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-white transition-colors"
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-sm font-medium text-gray-400">External Player</label>
                            {detectingPlayers && (
                                <span className="text-xs text-gray-500 animate-pulse">Detecting...</span>
                            )}
                        </div>

                        <div className="bg-neutral-800 rounded-xl overflow-hidden mb-3">
                            {/* Detected Players List */}
                            {detectedPlayers.map((player, index) => {
                                const isSelected = settings.playerPath === player.path
                                return (
                                    <button
                                        key={index}
                                        onClick={() => handleSelectPlayer(player.path)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${isSelected ? 'bg-white/10' : 'hover:bg-white/5'
                                            } ${index > 0 ? 'border-t border-neutral-700/60' : ''}`}
                                    >
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'border-white bg-white' : 'border-neutral-500'
                                            }`}>
                                            {isSelected && <Check className="w-3 h-3 text-black" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                                                {player.name}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate">
                                                {player.path}
                                            </p>
                                        </div>
                                    </button>
                                )
                            })}

                            {/* Custom Path Input */}
                            <div
                                onClick={() => {
                                    // Select custom path when clicking the area
                                    const newSettings = { ...settings, playerPath: customPlayerPath, customPlayerPath: customPlayerPath }
                                    setSettings(newSettings)
                                    autoSave(newSettings)
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all cursor-pointer ${(!settings.playerPath || !detectedPlayers.some(p => p.path === settings.playerPath))
                                    ? 'bg-white/10'
                                    : 'hover:bg-white/5'
                                    } ${detectedPlayers.length > 0 ? 'border-t border-neutral-700/60' : ''}`}
                            >
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${(!settings.playerPath || !detectedPlayers.some(p => p.path === settings.playerPath))
                                    ? 'border-white bg-white'
                                    : 'border-neutral-500'
                                    }`}>
                                    {(!settings.playerPath || !detectedPlayers.some(p => p.path === settings.playerPath)) && (
                                        <Check className="w-3 h-3 text-black" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1 w-full">
                                    <input
                                        id="custom-player-input"
                                        type="text"
                                        value={customPlayerPath}
                                        onFocus={() => {
                                            // Select custom path when focusing the input
                                            const newSettings = { ...settings, playerPath: customPlayerPath, customPlayerPath: customPlayerPath }
                                            setSettings(newSettings)
                                            autoSave(newSettings)
                                        }}
                                        onChange={e => {
                                            const newPath = e.target.value
                                            setCustomPlayerPath(newPath)
                                            const newSettings = { ...settings, playerPath: newPath, customPlayerPath: newPath }
                                            setSettings(newSettings)
                                            const pathVal = newPath.trim()
                                            if (pathVal.toLowerCase().includes('iina.app') && !pathVal.toLowerCase().includes('iina-cli')) {
                                                setShowIinaWarning(true)
                                            } else {
                                                setShowIinaWarning(false)
                                            }
                                        }}
                                        onBlur={() => {
                                            const newSettings = { ...settings, playerPath: customPlayerPath, customPlayerPath: customPlayerPath }
                                            autoSave(newSettings)
                                        }}
                                        spellCheck={false}
                                        placeholder="Your player not showing above? Enter the full path to the executable..."
                                        className="w-full bg-white/5 border border-neutral-600 focus:border-white rounded-xl px-3 py-2 outline-none transition-all text-sm text-white player-path-input"
                                        style={{ colorScheme: 'dark' }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* IINA Warning */}
                        {showIinaWarning && (
                            <p className="text-xs text-yellow-500 mt-2">
                                For better compatibility, use iina-cli instead of IINA.app
                            </p>
                        )}
                    </div>

                    <div>
                        <div className="flex items-center justify-between bg-neutral-800 p-4 rounded-lg">
                            <h3 className="font-medium">Hide Episode Details</h3>
                            <button
                                onClick={() => {
                                    const newSettings = { ...settings, hideEpisodeSpoilers: !settings.hideEpisodeSpoilers }
                                    setSettings(newSettings)
                                    autoSave(newSettings)
                                }}
                                className={`w-12 h-6 rounded-full transition-colors relative ${settings.hideEpisodeSpoilers ? 'bg-white' : 'bg-neutral-600'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-transform ${settings.hideEpisodeSpoilers ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Blur episode descriptions until clicked</p>
                    </div>

                    <div>
                        <div className="flex items-center justify-between bg-neutral-800 p-4 rounded-lg">
                            <h3 className="font-medium">Poster Title Display</h3>
                            <div className="flex bg-neutral-700/50 rounded-full p-1">
                                {([
                                    { value: 'hover', label: 'Hover' },
                                    { value: 'below', label: 'Below' },
                                    { value: 'hidden', label: 'Hidden' }
                                ] as const).map((mode) => (
                                    <button
                                        key={mode.value}
                                        onClick={() => {
                                            const newSettings = {
                                                ...settings,
                                                posterTitleMode: mode.value,
                                                showTitlesOnPosters: mode.value === 'below'
                                            }
                                            setSettings(newSettings)
                                            autoSave(newSettings)
                                        }}
                                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${settings.posterTitleMode === mode.value
                                            ? 'bg-white/10 text-white shadow-sm'
                                            : 'text-gray-400 hover:text-white'
                                            }`}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Hover: show title on hover. Below: show title below poster. Hidden: hide title</p>
                    </div>

                    <div>
                        <div className="flex items-center justify-between bg-neutral-800 p-4 rounded-lg">
                            <h3 className="font-medium">Poster Size</h3>
                            <div className="flex bg-neutral-700/50 rounded-full p-1">
                                {(['small', 'medium', 'large'] as const).map((size) => (
                                    <button
                                        key={size}
                                        onClick={() => {
                                            const newSettings = { ...settings, posterSize: size }
                                            setSettings(newSettings)
                                            autoSave(newSettings)
                                        }}
                                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${settings.posterSize === size
                                            ? 'bg-white/10 text-white shadow-sm'
                                            : 'text-gray-400 hover:text-white'
                                            }`}
                                    >
                                        {size.charAt(0).toUpperCase() + size.slice(1)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Adjust poster size on the home page</p>
                    </div>

                    <div>
                        <div className="flex items-center justify-between bg-neutral-800 p-4 rounded-lg">
                            <h3 className="font-medium">Minimize to Tray on Close</h3>
                            <button
                                onClick={() => {
                                    const newSettings = { ...settings, minimizeToTray: !settings.minimizeToTray }
                                    setSettings(newSettings)
                                    autoSave(newSettings)
                                }}
                                className={`w-12 h-6 rounded-full transition-colors relative ${settings.minimizeToTray ? 'bg-white' : 'bg-neutral-600'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-transform ${settings.minimizeToTray ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Keep application running in background when closed</p>
                    </div>

                    <div>
                        <div className="flex items-center justify-between bg-neutral-800 p-4 rounded-lg">
                            <h3 className="font-medium">Probe Video Metadata</h3>
                            <button
                                onClick={() => {
                                    const newSettings = { ...settings, probeVideoMetadataEnabled: !settings.probeVideoMetadataEnabled }
                                    setSettings(newSettings)
                                    autoSave(newSettings)
                                }}
                                className={`w-12 h-6 rounded-full transition-colors relative ${settings.probeVideoMetadataEnabled ? 'bg-white' : 'bg-neutral-600'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-transform ${settings.probeVideoMetadataEnabled ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Fetch video resolution, codec, frame rate, etc. Requires FFmpeg installed</p>
                    </div>

                    <div>
                        <div className="bg-neutral-800 p-4 rounded-lg space-y-5">
                            <div className="flex items-center justify-between">
                                <h3 className="font-medium">Auto Mark as Watched</h3>
                                <button
                                    onClick={() => {
                                        const newSettings = {
                                            ...settings,
                                            autoMarkWatchedEnabled: !settings.autoMarkWatchedEnabled
                                        }
                                        setSettings(newSettings)
                                        autoSave(newSettings)
                                    }}
                                    className={`w-12 h-6 rounded-full transition-colors relative ${settings.autoMarkWatchedEnabled ? 'bg-white' : 'bg-neutral-600'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-transform ${settings.autoMarkWatchedEnabled ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>
                            <div className={`flex items-center justify-between ${!settings.autoMarkWatchedEnabled ? 'opacity-50' : ''}`}>
                                <h3 className={`font-medium ${!settings.autoMarkWatchedEnabled ? 'text-gray-500' : ''}`}>Apply to Movies Only</h3>
                                <button
                                    onClick={() => {
                                        if (!settings.autoMarkWatchedEnabled) return
                                        const newScope: 'movies' | 'all' = settings.autoMarkWatchedScope === 'movies' ? 'all' : 'movies'
                                        const newSettings = {
                                            ...settings,
                                            autoMarkWatchedScope: newScope
                                        }
                                        setSettings(newSettings)
                                        autoSave(newSettings)
                                    }}
                                    disabled={!settings.autoMarkWatchedEnabled}
                                    className={`w-12 h-6 rounded-full transition-colors relative ${!settings.autoMarkWatchedEnabled ? 'bg-neutral-600 cursor-not-allowed' : settings.autoMarkWatchedScope === 'movies' ? 'bg-white' : 'bg-neutral-600'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-transform ${settings.autoMarkWatchedScope === 'movies' ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Automatically mark content as watched when the play button is clicked; when "Movies Only" is off, applies to both movies and TV shows</p>
                    </div>

                    <div>
                        <div className="flex items-center justify-between bg-neutral-800 p-4 rounded-lg">
                            <h3 className="font-medium">Use Formatted Title</h3>
                            <button
                                onClick={() => {
                                    const newSettings = { ...settings, useFormattedTitle: !settings.useFormattedTitle }
                                    setSettings(newSettings)
                                    autoSave(newSettings)
                                }}
                                className={`w-12 h-6 rounded-full transition-colors relative ${settings.useFormattedTitle ? 'bg-white' : 'bg-neutral-600'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-transform ${settings.useFormattedTitle ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                            Use formatted media title as player title (supported players: VLC, mpv, IINA, mpv.net, PotPlayer)
                            <span className="group relative">
                                <AlertCircle className="w-3.5 h-3.5 text-gray-500" />
                                <span className="absolute top-full right-0 mt-2 px-3 py-2 bg-neutral-800 border border-neutral-600 text-white text-xs rounded-lg whitespace-normal w-72 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                    Formatted title may not appear if the media file contains an embedded metadata title (especially in VLC), or when opening the local file (especially in IINA)
                                </span>
                            </span>
                        </p>
                    </div>

                    <div>
                        <div className="flex items-center justify-between bg-neutral-800 p-4 rounded-lg">
                            <h3 className="font-medium">Show IMDb Rating</h3>
                            <button
                                onClick={() => {
                                    const newSettings = { ...settings, showImdbRating: !settings.showImdbRating }
                                    setSettings(newSettings)
                                    autoSave(newSettings)
                                }}
                                className={`w-12 h-6 rounded-full transition-colors relative ${settings.showImdbRating ? 'bg-white' : 'bg-neutral-600'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-transform ${settings.showImdbRating ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Display IMDb ratings</p>
                    </div>

                    <div>
                        <div className="flex items-center justify-between bg-neutral-800 p-4 rounded-lg">
                            <h3 className="font-medium">Prefer Text Title</h3>
                            <button
                                onClick={() => {
                                    const newSettings = { ...settings, preferTextTitle: !settings.preferTextTitle }
                                    setSettings(newSettings)
                                    autoSave(newSettings)
                                }}
                                className={`w-12 h-6 rounded-full transition-colors relative ${settings.preferTextTitle ? 'bg-white' : 'bg-neutral-600'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-transform ${settings.preferTextTitle ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Show text title instead of logo on detail pages</p>
                    </div>

                    <div>
                        <div className="bg-neutral-800 p-4 rounded-lg space-y-5">
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-medium">Movie External Links</h3>
                                    <button
                                        onClick={() => addExternalLink('movieExternalLinks')}
                                        className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        Add
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {settings.movieExternalLinks.map((link, index) => (
                                        <div key={`movie-link-${index}`} className="grid grid-cols-[1fr_2fr_auto] gap-2 min-w-0">
                                            <input
                                                type="text"
                                                value={link.label}
                                                onChange={e => updateExternalLink('movieExternalLinks', index, 'label', e.target.value)}
                                                onBlur={() => saveExternalLinks('movieExternalLinks')}
                                                className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-white transition-colors min-w-0"
                                            />
                                            <input
                                                type="text"
                                                value={link.template}
                                                onChange={e => updateExternalLink('movieExternalLinks', index, 'template', e.target.value)}
                                                onBlur={() => saveExternalLinks('movieExternalLinks')}
                                                spellCheck={false}
                                                className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-white transition-colors min-w-0"
                                            />
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => moveExternalLink('movieExternalLinks', index, 'up')}
                                                    disabled={index === 0}
                                                    className="px-2.5 py-2 rounded-lg border border-neutral-700 hover:border-white/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    <ChevronUp className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => moveExternalLink('movieExternalLinks', index, 'down')}
                                                    disabled={index === settings.movieExternalLinks.length - 1}
                                                    className="px-2.5 py-2 rounded-lg border border-neutral-700 hover:border-white/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    <ChevronDown className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => removeExternalLink('movieExternalLinks', index)}
                                                    className="px-2.5 py-2 rounded-lg border border-neutral-700 hover:border-red-500/60 hover:text-red-400 transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-medium">TV External Links</h3>
                                <button
                                    onClick={() => addExternalLink('tvExternalLinks')}
                                    className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    Add
                                </button>
                            </div>
                            <div className="space-y-2">
                                {settings.tvExternalLinks.map((link, index) => (
                                    <div key={`tv-link-${index}`} className="grid grid-cols-[1fr_2fr_auto] gap-2 min-w-0">
                                        <input
                                            type="text"
                                            value={link.label}
                                            onChange={e => updateExternalLink('tvExternalLinks', index, 'label', e.target.value)}
                                            onBlur={() => saveExternalLinks('tvExternalLinks')}
                                            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-white transition-colors min-w-0"
                                        />
                                        <input
                                            type="text"
                                            value={link.template}
                                            onChange={e => updateExternalLink('tvExternalLinks', index, 'template', e.target.value)}
                                            onBlur={() => saveExternalLinks('tvExternalLinks')}
                                            spellCheck={false}
                                            className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-white transition-colors min-w-0"
                                        />
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => moveExternalLink('tvExternalLinks', index, 'up')}
                                                disabled={index === 0}
                                                className="px-2.5 py-2 rounded-lg border border-neutral-700 hover:border-white/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <ChevronUp className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => moveExternalLink('tvExternalLinks', index, 'down')}
                                                disabled={index === settings.tvExternalLinks.length - 1}
                                                className="px-2.5 py-2 rounded-lg border border-neutral-700 hover:border-white/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <ChevronDown className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => removeExternalLink('tvExternalLinks', index)}
                                                className="px-2.5 py-2 rounded-lg border border-neutral-700 hover:border-red-500/60 hover:text-red-400 transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500">
                        <p>
                            Supported placeholders: {'{tmdbId}'} {'{imdbId}'} {'{title}'}
                        </p>
                        <span>·</span>
                        <button
                            onClick={resetExternalLinksToDefault}
                            className="text-xs text-gray-500 hover:underline transition-colors"
                        >
                            Restore Defaults
                        </button>
                    </div>
                    </div>
                </section>

                <hr className="border-neutral-800" />

                <p className="text-xs text-gray-600 text-center -mt-2">
                    Shortcuts: Esc to go back | Ctrl/Cmd + F to open search (Library)
                </p>

                {/* TMDB & IMDb Attribution */}
                <section className="flex flex-col items-center justify-center gap-1 -mt-2 pt-0 pb-6">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => window.electron.ipcRenderer.invoke('open-external', 'https://www.themoviedb.org')}
                            className="hover:brightness-125 transition-all"
                        >
                            <img
                                src={TMDBLogo}
                                alt="TMDB Logo"
                                className="h-4 w-auto"
                            />
                        </button>
                        <p className="text-xs text-gray-500">
                            This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.
                        </p>
                    </div>
                    {appVersion && (
                        <p className="text-xs text-gray-500">
                            Version {appVersion}
                        </p>
                    )}
                </section>

            </div>

            {showAddModal && (
                <AddSourceModal
                    onClose={() => setShowAddModal(false)}
                    onAdd={handleAddSource}
                />
            )}

            {editingSource && (
                <EditSourceModal
                    source={editingSource}
                    onClose={() => setEditingSource(null)}
                    onSave={handleSaveEditedSource}
                />
            )}
        </div>
    )
}
