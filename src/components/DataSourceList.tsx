import { useTranslation } from 'react-i18next'
import { Trash2, FolderOpen, Pencil } from 'lucide-react'
import type { RedactedSource } from '../../electron/settings'

interface DataSourceListProps {
    sources: RedactedSource[]
    onRemove: (id: string) => void | Promise<void>
    onEdit: (source: RedactedSource) => void
}

export default function DataSourceList({ sources, onRemove, onEdit }: DataSourceListProps) {
    const { t } = useTranslation(['settings', 'common'])

    return (
        <div className="space-y-3">
            {sources.map(source => (
                <div key={source.id} className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                        <div className="bg-neutral-700 p-2 rounded-lg">
                            <FolderOpen className="w-6 h-6 text-white" aria-hidden="true" />
                        </div>
                        <div>
                            <h4 className="font-bold">{source.name}</h4>
                            <p className="text-sm text-gray-400">
                                {source.type === 'local' ? source.config.path : source.type === 'smb' ? source.config.share : source.config.url}
                            </p>
                            <div className="flex gap-2 mt-1">
                                {source.paths.length > 0 ? (
                                    source.paths.map(path => (
                                        <span key={path} className="text-xs bg-neutral-700 px-2 py-0.5 rounded text-gray-300">
                                            {path}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-xs bg-neutral-700 px-2 py-0.5 rounded text-gray-300">{t('settings:allFolders')}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-1">
                        <button
                            type="button"
                            onClick={() => onEdit(source)}
                            aria-label={t('settings:editSourceAria', { name: source.name })}
                            className="p-2 hover:bg-blue-900/30 text-gray-500 hover:text-blue-400 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        >
                            <Pencil className="w-5 h-5" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => void onRemove(source.id)}
                            aria-label={t('settings:removeSourceAria', { name: source.name })}
                            className="p-2 hover:bg-red-900/30 text-gray-500 hover:text-red-400 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                        >
                            <Trash2 className="w-5 h-5" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            ))}

            {sources.length === 0 && (
                <p className="text-center py-8 text-gray-500 border-2 border-dashed border-neutral-800 rounded-lg">
                    {t('settings:noSourcesEmpty')}
                </p>
            )}
        </div>
    )
}
