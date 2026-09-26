import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Folder, FileVideo, ChevronRight } from 'lucide-react'
import { Checkbox } from './ui/Choice'
import { Spinner } from './ui/Feedback'
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

    return (
        <div className="border border-border rounded-lg overflow-hidden bg-background h-96 flex flex-col">
            <div className="p-3 bg-surface-raised border-b border-border flex items-center gap-2">
                <button
                    type="button"
                    onClick={handleUp}
                    disabled={currentPath === '/'}
                    aria-label={t('settings:parentFolderAria')}
                    className="p-1 hover:bg-hover-bg rounded disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <ChevronRight className="w-4 h-4 rotate-180" aria-hidden="true" />
                </button>
                <span className="text-sm font-mono truncate flex-1" aria-live="polite">{currentPath}</span>
            </div>

            <div className="flex-1 overflow-auto p-2">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <Spinner size="lg" label={t('common:loading')} />
                    </div>
                ) : error ? (
                    <div className="text-danger text-center p-4">{error}</div>
                ) : (
                    <div className="space-y-1">
                        {items.map((item) => {
                            const selected = selectedPaths.includes(item.filename)

                            return (
                                <div key={item.filename} className="flex items-center gap-2 p-2 hover:bg-hover-bg rounded group">
                                    {item.type === 'directory' ? (
                                        <>
                                            <Checkbox
                                                checked={selected}
                                                onCheckedChange={() => toggleSelection(item.filename)}
                                                label={t('settings:scanFolderAria', { name: item.basename })}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleNavigate(item)}
                                                aria-label={t('settings:openFolderAria', { name: item.basename })}
                                                className="flex-1 flex items-center gap-2 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                <Folder className="w-4 h-4 text-foreground-muted" aria-hidden="true" />
                                                <span className="text-sm">{item.basename}</span>
                                            </button>
                                        </>
                                    ) : (
                                        <div className="flex-1 flex items-center gap-2 opacity-50 pl-8">
                                            <FileVideo className="w-4 h-4 text-foreground-subtle" aria-hidden="true" />
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
