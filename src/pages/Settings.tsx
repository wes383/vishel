import { useState, useEffect } from 'react'
import { Save, Plus, X, RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { DataSource } from '../../electron/store'
import DataSourceList from '../components/DataSourceList'
import AddSourceModal from '../components/AddSourceModal'

interface SettingsData {
    tmdbApiKey: string
    playerPath: string
    hideEpisodeSpoilers: boolean
    sources: DataSource[]
}

export default function SettingsPage() {
    const [settings, setSettings] = useState<SettingsData>({
        tmdbApiKey: '',
        playerPath: '',
        hideEpisodeSpoilers: false,
        sources: []
    })
    const [saving, setSaving] = useState(false)
    const [scanning, setScanning] = useState(false)
    const [showAddModal, setShowAddModal] = useState(false)
    const navigate = useNavigate()

    useEffect(() => {
        // @ts-ignore
        window.electron.ipcRenderer.invoke('get-settings').then((data: SettingsData) => {
            const sources = Array.isArray(data.sources) ? data.sources : []
            setSettings({ ...data, sources })
        })

        // Check scan status
        // @ts-ignore
        window.electron.ipcRenderer.invoke('get-scan-status').then((isScanning: boolean) => {
            setScanning(isScanning)
        })
    }, [])

    const handleSave = async () => {
        setSaving(true)
        // @ts-ignore
        await window.electron.ipcRenderer.invoke('save-settings', settings)
        setTimeout(() => setSaving(false), 1000)
    }

    const handleScan = async () => {
        setScanning(true)
        try {
            // @ts-ignore
            await window.electron.ipcRenderer.invoke('scan-library')
        } catch (error) {
            console.error('Scan error:', error)
        }
        setScanning(false)
    }

    const handleAddSource = (source: DataSource) => {
        const newSettings = {
            ...settings,
            sources: [...settings.sources, source]
        }
        setSettings(newSettings)
        // @ts-ignore
        window.electron.ipcRenderer.invoke('save-settings', newSettings)
    }

    const handleRemoveSource = (id: string) => {
        const newSettings = {
            ...settings,
            sources: settings.sources.filter(s => s.id !== id)
        }
        setSettings(newSettings)
        // @ts-ignore
        window.electron.ipcRenderer.invoke('save-settings', newSettings)
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
                                {scanning ? 'Scanning...' : 'Scan Library'}
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

                    <DataSourceList
                        sources={settings.sources}
                        onRemove={handleRemoveSource}
                    />
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
                            onChange={e => setSettings({ ...settings, tmdbApiKey: e.target.value })}
                            spellCheck={false}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-white transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">External Player Path</label>
                        <input
                            type="text"
                            value={settings.playerPath}
                            onChange={e => setSettings({ ...settings, playerPath: e.target.value })}
                            placeholder="C:\Program Files\..."
                            spellCheck={false}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-white transition-colors"
                        />
                        <p className="text-xs text-gray-500 mt-1">Full path to the executable (e.g., PotPlayer, VLC)</p>
                    </div>

                    <div>
                        <div className="flex items-center justify-between bg-neutral-800 p-4 rounded-lg">
                            <h3 className="font-medium">Hide Episode Details (Spoilers)</h3>
                            <button
                                onClick={() => setSettings({ ...settings, hideEpisodeSpoilers: !settings.hideEpisodeSpoilers })}
                                className={`w-12 h-6 rounded-full transition-colors relative ${settings.hideEpisodeSpoilers ? 'bg-white' : 'bg-neutral-600'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-black transition-transform ${settings.hideEpisodeSpoilers ? 'left-7' : 'left-1'}`} />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Blur episode descriptions until clicked</p>
                    </div>
                </section>

                <div className="pt-px">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-white hover:bg-gray-200 text-black px-6 py-2 rounded-full font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Saved!' : 'Save Settings'}
                    </button>
                </div>
            </div>

            {showAddModal && (
                <AddSourceModal
                    onClose={() => setShowAddModal(false)}
                    onAdd={handleAddSource}
                />
            )}
        </div>
    )
}
