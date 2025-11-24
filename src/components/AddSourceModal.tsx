import { useState } from 'react'
import { X, Check, Loader2 } from 'lucide-react'
import { DataSource } from '../../electron/store'
import FileBrowser from './FileBrowser'

interface AddSourceModalProps {
    onClose: () => void
    onAdd: (source: DataSource) => void
}

export default function AddSourceModal({ onClose, onAdd }: AddSourceModalProps) {
    const [step, setStep] = useState<1 | 2>(1)
    const [type, setType] = useState<'webdav' | 'local' | 'smb'>('webdav')
    const [config, setConfig] = useState({
        url: '',
        path: '',
        share: '',
        username: '',
        password: '',
        domain: ''
    })
    const [name, setName] = useState('')
    const [selectedPaths, setSelectedPaths] = useState<string[]>([])
    const [testing, setTesting] = useState(false)
    const [error, setError] = useState('')

    const handleTest = async () => {
        setTesting(true)
        setError('')
        try {
            // @ts-ignore
            const success = await window.electron.ipcRenderer.invoke('test-connection', { ...config, type })
            if (success) {
                setStep(2)
            } else {
                setError('Connection failed. Check path/credentials.')
            }
        } catch (e) {
            setError('Connection failed.')
        } finally {
            setTesting(false)
        }
    }

    const handleFinish = () => {
        let finalPaths = selectedPaths
        if (selectedPaths.length === 0) {
            if (type === 'smb' || type === 'webdav') {
                finalPaths = ['/']
            } else if (type === 'local') {
                finalPaths = [config.path || '/']
            }
        }

        const newSource: DataSource = {
            id: crypto.randomUUID(),
            type,
            name: name || (type === 'webdav' ? 'WebDAV Source' : type === 'smb' ? 'SMB Share' : 'Local Source'),
            config,
            paths: finalPaths
        }
        onAdd(newSource)
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
            <div className="bg-neutral-900 border border-neutral-700 rounded-xl w-[600px] max-h-[80vh] flex flex-col">
                <div className="p-4 border-b border-neutral-700 flex justify-between items-center">
                    <h3 className="text-lg font-bold">Add Data Source</h3>
                    <button onClick={onClose}><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 flex-1 overflow-auto">
                    {step === 1 ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Source Type</label>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => setType('webdav')}
                                        className={`flex-1 py-2 rounded-lg border ${type === 'webdav' ? 'bg-white border-white text-black' : 'border-neutral-700 hover:bg-neutral-800'}`}
                                    >
                                        WebDAV
                                    </button>
                                    <button
                                        onClick={() => setType('local')}
                                        className={`flex-1 py-2 rounded-lg border ${type === 'local' ? 'bg-white border-white text-black' : 'border-neutral-700 hover:bg-neutral-800'}`}
                                    >
                                        Local Folder
                                    </button>
                                    <button
                                        onClick={() => setType('smb')}
                                        className={`flex-1 py-2 rounded-lg border ${type === 'smb' ? 'bg-white border-white text-black' : 'border-neutral-700 hover:bg-neutral-800'}`}
                                    >
                                        SMB/CIFS
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Source Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder={type === 'webdav' ? "My WebDAV" : type === 'smb' ? "My SMB Share" : "My Local Folder"}
                                    spellCheck={false}
                                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-white transition-colors"
                                />
                            </div>

                            {type === 'webdav' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">WebDAV URL</label>
                                        <input
                                            type="text"
                                            value={config.url || ''}
                                            onChange={e => setConfig({ ...config, url: e.target.value })}
                                            placeholder="https://example.com/webdav"
                                            spellCheck={false}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-white transition-colors"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Username (Optional)</label>
                                        <input
                                            type="text"
                                            value={config.username || ''}
                                            onChange={e => setConfig({ ...config, username: e.target.value })}
                                            placeholder="username"
                                            spellCheck={false}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-white transition-colors"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Password (Optional)</label>
                                        <input
                                            type="password"
                                            value={config.password || ''}
                                            onChange={e => setConfig({ ...config, password: e.target.value })}
                                            placeholder="password"
                                            spellCheck={false}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-white transition-colors"
                                        />
                                    </div>
                                </>
                            ) : type === 'smb' ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">SMB Share Path</label>
                                        <input
                                            type="text"
                                            value={config.share || ''}
                                            onChange={e => setConfig({ ...config, share: e.target.value })}
                                            placeholder="//192.168.1.100/movies"
                                            spellCheck={false}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-white transition-colors"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Format: //server/share</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
                                        <input
                                            type="text"
                                            value={config.username || ''}
                                            onChange={e => setConfig({ ...config, username: e.target.value })}
                                            placeholder="username"
                                            spellCheck={false}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-white transition-colors"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Password</label>
                                        <input
                                            type="password"
                                            value={config.password || ''}
                                            onChange={e => setConfig({ ...config, password: e.target.value })}
                                            placeholder="password"
                                            spellCheck={false}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-white transition-colors"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-400 mb-1">Domain (Optional)</label>
                                        <input
                                            type="text"
                                            value={config.domain || ''}
                                            onChange={e => setConfig({ ...config, domain: e.target.value })}
                                            placeholder="WORKGROUP"
                                            spellCheck={false}
                                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-white transition-colors"
                                        />
                                    </div>
                                </>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-1">Folder Path</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={config.path || ''}
                                            onChange={e => setConfig({ ...config, path: e.target.value })}
                                            placeholder="D:\Movies"
                                            spellCheck={false}
                                            className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-white transition-colors"
                                        />
                                        <button
                                            onClick={async () => {
                                                // @ts-ignore
                                                const path = await window.electron.ipcRenderer.invoke('open-directory-dialog')
                                                if (path) {
                                                    setConfig({ ...config, path })
                                                }
                                            }}
                                            className="bg-neutral-700 hover:bg-neutral-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                        >
                                            Browse
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">Absolute path to the media folder</p>
                                </div>
                            )}

                            {error && <p className="text-red-400 text-sm">{error}</p>}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-400">Select folders to scan:</p>
                            <FileBrowser
                                config={config}
                                type={type}
                                onSelect={togglePath}
                                selectedPaths={selectedPaths}
                            />
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-neutral-700 flex justify-end gap-3">
                    {step === 1 ? (
                        <button
                            onClick={handleTest}
                            disabled={testing || (type === 'webdav' ? !config.url : (type === 'smb' ? !config.share : !config.path))}
                            className="bg-white hover:bg-gray-200 text-black px-4 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
                        >
                            {testing && <Loader2 className="w-4 h-4 animate-spin" />}
                            Next
                        </button>
                    ) : (
                        <button
                            onClick={handleFinish}
                            className="bg-white hover:bg-gray-200 text-black px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
                        >
                            <Check className="w-4 h-4" />
                            Finish
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
