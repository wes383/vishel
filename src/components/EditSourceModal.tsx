import { useState, useEffect } from 'react'
import { X, Check, Loader2, ChevronLeft } from 'lucide-react'
import { DataSource } from '../../electron/store'
import FileBrowser from './FileBrowser'

interface EditSourceModalProps {
    source: DataSource
    onClose: () => void
    onSave: (source: DataSource) => void
}

export default function EditSourceModal({ source, onClose, onSave }: EditSourceModalProps) {
    const [step, setStep] = useState<1 | 2>(2)
    const [type] = useState<'webdav' | 'local' | 'smb'>(source.type)
    const [config, setConfig] = useState({
        url: source.config.url || '',
        path: source.config.path || '',
        share: source.config.share || '',
        username: source.config.username || '',
        password: source.config.password || '',
        domain: source.config.domain || ''
    })
    const [name, setName] = useState(source.name)
    const [selectedPaths, setSelectedPaths] = useState<string[]>(source.paths)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        setSelectedPaths(source.paths)
    }, [source.paths])

    useEffect(() => {
        const testInitialConnection = async () => {
            setLoading(true)
            try {
                const success = await window.electron.ipcRenderer.invoke('test-connection', { ...source.config, type: source.type })
                if (!success) {
                    setStep(1)
                    setError('Connection failed. Check path/credentials.')
                }
            } catch (e) {
                setStep(1)
                setError('Connection failed. Check path/credentials.')
            } finally {
                setLoading(false)
            }
        }
        testInitialConnection()
    }, [source])

    const handleSave = () => {
        let finalPaths = selectedPaths
        if (selectedPaths.length === 0) {
            if (type === 'smb' || type === 'webdav') {
                finalPaths = ['/']
            } else if (type === 'local') {
                finalPaths = [config.path || '/']
            }
        }

        const updatedSource: DataSource = {
            ...source,
            name: name || (type === 'webdav' ? 'WebDAV Source' : type === 'smb' ? 'SMB Share' : 'Local Source'),
            config,
            paths: finalPaths
        }
        onSave(updatedSource)
        onClose()
    }

    const togglePath = (path: string) => {
        setSelectedPaths(prev =>
            prev.includes(path)
                ? prev.filter(p => p !== path)
                : [...prev, path]
        )
    }

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-white/50 backdrop-blur-md rounded-xl w-[600px] max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-gray-900/10 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-900">Edit Data Source</h3>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-black/10 rounded-full transition-colors text-gray-900"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 flex-1 overflow-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
                        </div>
                    ) : step === 1 ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Source Type</label>
                                <div className="flex gap-4">
                                    <button
                                        disabled
                                        className={`flex-1 py-2 rounded-lg border ${type === 'webdav' ? 'bg-neutral-800 border-neutral-800 text-white' : 'border-gray-900/20 text-gray-900'} opacity-60 cursor-not-allowed`}
                                    >
                                        WebDAV
                                    </button>
                                    <button
                                        disabled
                                        className={`flex-1 py-2 rounded-lg border ${type === 'local' ? 'bg-neutral-800 border-neutral-800 text-white' : 'border-gray-900/20 text-gray-900'} opacity-60 cursor-not-allowed`}
                                    >
                                        Local Folder
                                    </button>
                                    <button
                                        disabled
                                        className={`flex-1 py-2 rounded-lg border ${type === 'smb' ? 'bg-neutral-800 border-neutral-800 text-white' : 'border-gray-900/20 text-gray-900'} opacity-60 cursor-not-allowed`}
                                    >
                                        SMB
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">Source type cannot be changed</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Source Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder={type === 'webdav' ? "My WebDAV" : type === 'smb' ? "My SMB Share" : "My Local Folder"}
                                    spellCheck={false}
                                    className="w-full bg-white/30 border border-gray-900/20 rounded-lg px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900"
                                />
                            </div>

                            {type === 'webdav' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">WebDAV URL</label>
                                        <input
                                            type="text"
                                            value={config.url || ''}
                                            onChange={e => setConfig({ ...config, url: e.target.value })}
                                            placeholder="https://example.com/webdav"
                                            spellCheck={false}
                                            className="w-full bg-white/30 border border-gray-900/20 rounded-lg px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Username (Optional)</label>
                                        <input
                                            type="text"
                                            value={config.username || ''}
                                            onChange={e => setConfig({ ...config, username: e.target.value })}
                                            placeholder="username"
                                            spellCheck={false}
                                            className="w-full bg-white/30 border border-gray-900/20 rounded-lg px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Password (Optional)</label>
                                        <input
                                            type="password"
                                            value={config.password || ''}
                                            onChange={e => setConfig({ ...config, password: e.target.value })}
                                            placeholder="password"
                                            spellCheck={false}
                                            className="w-full bg-white/30 border border-gray-900/20 rounded-lg px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900"
                                        />
                                    </div>
                                </>
                            ) : type === 'smb' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">SMB Share Path</label>
                                        <input
                                            type="text"
                                            value={config.share || ''}
                                            onChange={e => setConfig({ ...config, share: e.target.value })}
                                            placeholder="//192.168.1.100/movies"
                                            spellCheck={false}
                                            className="w-full bg-white/30 border border-gray-900/20 rounded-lg px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900"
                                        />
                                        <p className="text-xs text-gray-700 mt-1">Format: //server/share</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                                        <input
                                            type="text"
                                            value={config.username || ''}
                                            onChange={e => setConfig({ ...config, username: e.target.value })}
                                            placeholder="username"
                                            spellCheck={false}
                                            className="w-full bg-white/30 border border-gray-900/20 rounded-lg px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                        <input
                                            type="password"
                                            value={config.password || ''}
                                            onChange={e => setConfig({ ...config, password: e.target.value })}
                                            placeholder="password"
                                            spellCheck={false}
                                            className="w-full bg-white/30 border border-gray-900/20 rounded-lg px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Domain (Optional)</label>
                                        <input
                                            type="text"
                                            value={config.domain || ''}
                                            onChange={e => setConfig({ ...config, domain: e.target.value })}
                                            placeholder="WORKGROUP"
                                            spellCheck={false}
                                            className="w-full bg-white/30 border border-gray-900/20 rounded-lg px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900"
                                        />
                                    </div>
                                </>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Folder Path</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={config.path || ''}
                                            onChange={e => setConfig({ ...config, path: e.target.value })}
                                            placeholder="D:\Movies"
                                            spellCheck={false}
                                            className="flex-1 bg-white/30 border border-gray-900/20 rounded-lg px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900"
                                        />
                                        <button
                                            onClick={async () => {
                                                const path = await window.electron.ipcRenderer.invoke('open-directory-dialog')
                                                if (path) {
                                                    setConfig({ ...config, path })
                                                }
                                            }}
                                            className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                        >
                                            Browse
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-700 mt-1">Absolute path to the media folder</p>
                                </div>
                            )}

                            {error && <p className="text-red-600 text-sm">{error}</p>}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-700">Select folders to scan:</p>
                            <FileBrowser
                                config={config}
                                type={type}
                                onSelect={togglePath}
                                selectedPaths={selectedPaths}
                            />
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-900/10 flex justify-end gap-3">
                    {step === 1 ? (
                        <button
                            onClick={async () => {
                                setLoading(true)
                                setError('')
                                try {
                                    const success = await window.electron.ipcRenderer.invoke('test-connection', { ...config, type })
                                    if (success) {
                                        setStep(2)
                                    } else {
                                        setError('Connection failed. Check path/credentials.')
                                    }
                                } catch (e) {
                                    setError('Connection failed.')
                                } finally {
                                    setLoading(false)
                                }
                            }}
                            disabled={loading || (type === 'webdav' ? !config.url : (type === 'smb' ? !config.share : !config.path))}
                            className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            Next
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={() => setStep(1)}
                                className="bg-neutral-600 hover:bg-neutral-500 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back
                            </button>
                            <button
                                onClick={handleSave}
                                className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
                            >
                                <Check className="w-4 h-4" />
                                Save Changes
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
