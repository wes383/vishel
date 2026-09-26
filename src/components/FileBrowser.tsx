import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Folder, FileVideo, ChevronRight, Loader2 } from 'lucide-react'
import type { DataSource } from '../../electron/store'

interface FileBrowserProps {
    config: DataSource['config']
    type: 'webdav' | 'local' | 'smb'
    onSelect: (path: string) => void
    selectedPaths: string[]
    /** Existing sources keep their password in the main process; browsing needs its id. */
    sourceId?: string
}

interface FileItem {
    filename: string
    basename: string
    lastmod: string
    size: number
    type: 'file' | 'directory'
}

export default function FileBrowser({ config, type, onSelect, selectedPaths, sourceId }: FileBrowserProps) {
    const { t } = useTranslation(['settings', 'common'])
    const [currentPath, setCurrentPath] = useState('/')
    const [items, setItems] = useState<FileItem[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const loadDirectory = async (path: string) => {
        setLoading(true)
        setError('')
        try {
            const result = await window.electron.ipcRenderer.invoke('list-directory', { config: { ...config, type }, path, sourceId })
            setItems(result)
            setCurrentPath(path)
        } catch (err) {
            console.error(err)
            setItems([])
            setError(t('settings:browserLoadError'))
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadDirectory('/')
        // The connection settings object is rebuilt by the parent on every keystroke, so only
        // the identity fields may trigger a reload. `t` is left out on purpose: switching
        // language must not re-run the directory listing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type, sourceId, config.url, config.path, config.share, config.username, config.domain, config.password])

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

    // Owns its text color: the panel is dark on purpose, and the light modal that hosts it
    // sets `text-gray-900`, which would otherwise render these names invisible.
    return (
        <div className="border border-neutral-700 rounded-lg overflow-hidden bg-neutral-900 text-white h-96 flex flex-col">
            <div className="p-3 bg-neutral-800 border-b border-neutral-700 flex items-center gap-2">
                <button
                    type="button"
                    onClick={handleUp}
                    disabled={currentPath === '/'}
                    aria-label={t('settings:parentFolderAria')}
                    className="p-1 hover:bg-neutral-700 rounded disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                >
                    <ChevronRight className="w-4 h-4 rotate-180" aria-hidden="true" />
                </button>
                <span className="text-sm font-mono truncate flex-1" aria-live="polite">{currentPath}</span>
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
                        {items.map((item) => {
                            const selected = selectedPaths.includes(item.filename)

                            return (
                                <div key={item.filename} className="flex items-center gap-2 p-2 hover:bg-neutral-800 rounded group">
                                    {item.type === 'directory' ? (
                                        <>
                                            <button
                                                type="button"
                                                role="checkbox"
                                                aria-checked={selected}
                                                aria-label={t('settings:scanFolderAria', { name: item.basename })}
                                                onClick={() => toggleSelection(item.filename)}
                                                className={`w-4 h-4 border rounded flex items-center justify-center flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                                                    selected ? 'bg-indigo-600 border-indigo-600' : 'border-neutral-600 hover:border-neutral-400'
                                                }`}
                                            >
                                                {selected && <span className="w-2 h-2 bg-white rounded-sm" />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleNavigate(item)}
                                                aria-label={t('settings:openFolderAria', { name: item.basename })}
                                                className="flex-1 flex items-center gap-2 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                                            >
                                                <Folder className="w-4 h-4 text-yellow-500" aria-hidden="true" />
                                                <span className="text-sm">{item.basename}</span>
                                            </button>
                                        </>
                                    ) : (
                                        <div className="flex-1 flex items-center gap-2 opacity-50 pl-8">
                                            <FileVideo className="w-4 h-4 text-blue-400" aria-hidden="true" />
                                            <span className="text-sm">{item.basename}</span>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
