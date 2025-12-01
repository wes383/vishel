import { useState, useEffect } from 'react'
import { Folder, FileVideo, ChevronRight, Loader2 } from 'lucide-react'
import { DataSource } from '../../electron/store'

interface FileBrowserProps {
    config: DataSource['config']
    type: 'webdav' | 'local' | 'smb'
    onSelect: (path: string) => void
    selectedPaths: string[]
}

interface FileItem {
    filename: string
    basename: string
    lastmod: string
    size: number
    type: 'file' | 'directory'
}

export default function FileBrowser({ config, type, onSelect, selectedPaths }: FileBrowserProps) {
    const [currentPath, setCurrentPath] = useState('/')
    const [items, setItems] = useState<FileItem[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const loadDirectory = async (path: string) => {
        setLoading(true)
        setError('')
        try {
            const result = await window.electron.ipcRenderer.invoke('list-directory', { config: { ...config, type }, path })
            setItems(result)
            setCurrentPath(path)
        } catch (err) {
            console.error(err)
            setError('Failed to load directory')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadDirectory('/')
    }, [config])

    const handleNavigate = (item: FileItem) => {
        if (item.type === 'directory') {
            loadDirectory(item.filename)
        }
    }

    const handleUp = () => {
        if (currentPath === '/') return
        const parent = currentPath.split('/').slice(0, -1).join('/') || '/'
        loadDirectory(parent)
    }

    const toggleSelection = (path: string) => {
        onSelect(path)
    }

    return (
        <div className="border border-neutral-700 rounded-lg overflow-hidden bg-neutral-900 h-96 flex flex-col">
            <div className="p-3 bg-neutral-800 border-b border-neutral-700 flex items-center gap-2">
                <button
                    onClick={handleUp}
                    disabled={currentPath === '/'}
                    className="p-1 hover:bg-neutral-700 rounded disabled:opacity-50"
                >
                    <ChevronRight className="w-4 h-4 rotate-180" />
                </button>
                <span className="text-sm font-mono truncate flex-1">{currentPath}</span>
            </div>

            <div className="flex-1 overflow-auto p-2">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                    </div>
                ) : error ? (
                    <div className="text-red-400 text-center p-4">{error}</div>
                ) : (
                    <div className="space-y-1">
                        {items.map((item) => (
                            <div
                                key={item.filename}
                                className="flex items-center gap-2 p-2 hover:bg-neutral-800 rounded cursor-pointer group"
                            >
                                {item.type === 'directory' ? (
                                    <>
                                        <button
                                            onClick={() => toggleSelection(item.filename)}
                                            className={`w-4 h-4 border rounded flex items-center justify-center ${selectedPaths.includes(item.filename)
                                                ? 'bg-indigo-600 border-indigo-600'
                                                : 'border-neutral-600 hover:border-neutral-400'
                                                }`}
                                        >
                                            {selectedPaths.includes(item.filename) && <div className="w-2 h-2 bg-white rounded-sm" />}
                                        </button>
                                        <div
                                            className="flex-1 flex items-center gap-2"
                                            onClick={() => handleNavigate(item)}
                                        >
                                            <Folder className="w-4 h-4 text-yellow-500" />
                                            <span className="text-sm">{item.basename}</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex-1 flex items-center gap-2 opacity-50 pl-8">
                                        <FileVideo className="w-4 h-4 text-blue-400" />
                                        <span className="text-sm">{item.basename}</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
