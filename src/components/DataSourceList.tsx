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
                <div key={source.id} className="bg-surface border border-border rounded-lg p-3 flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                        <div className="bg-surface-raised p-2 rounded-lg">
                            <FolderOpen className="w-6 h-6 text-foreground" aria-hidden="true" />
                        </div>
                        <div>
                            <h4 className="font-bold">{source.name}</h4>
                            <p className="text-sm text-foreground-muted">
                                {source.type === 'local' ? source.config.path : source.type === 'smb' ? source.config.share : source.config.url}
                            </p>
                            <div className="flex gap-2 mt-1">
                                {source.paths.length > 0 ? (
                                    source.paths.map(path => (
                                        <span key={path} className="text-xs bg-hover-bg-strong px-2 py-0.5 rounded text-foreground-muted">
                                            {path}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-xs bg-hover-bg-strong px-2 py-0.5 rounded text-foreground-muted">{t('settings:allFolders')}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-1">
                        <button
                            type="button"
                            onClick={() => onEdit(source)}
                            aria-label={t('settings:editSourceAria', { name: source.name })}
                            className="p-2 hover:bg-hover-bg text-foreground-subtle hover:text-foreground rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Pencil className="w-5 h-5" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => void onRemove(source.id)}
                            aria-label={t('settings:removeSourceAria', { name: source.name })}
                            className="p-2 hover:bg-danger-soft text-foreground-subtle hover:text-danger rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Trash2 className="w-5 h-5" aria-hidden="true" />
                        </button>
                    </div>
                </div>
            ))}

            {sources.length === 0 && (
                <p className="text-center py-8 text-foreground-muted border border-dashed border-border rounded-lg">
                    {t('settings:noSourcesEmpty')}
                </p>
            )}
        </div>
    )
}
