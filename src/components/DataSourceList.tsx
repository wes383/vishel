import { Trash2, FolderOpen } from 'lucide-react'
import { DataSource } from '../../electron/store'

interface DataSourceListProps {
    sources: DataSource[]
    onRemove: (id: string) => void
}

export default function DataSourceList({ sources, onRemove }: DataSourceListProps) {
    return (
        <div className="space-y-3">
            {sources.map(source => (
                <div key={source.id} className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                        <div className="bg-neutral-700 p-3 rounded-lg">
                            <FolderOpen className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h4 className="font-bold">{source.name}</h4>
                            <p className="text-sm text-gray-400">
                                {source.type === 'local' ? source.config.path : source.config.url}
                            </p>
                            <div className="flex gap-2 mt-1">
                                {source.paths.length > 0 ? (
                                    source.paths.map(path => (
                                        <span key={path} className="text-xs bg-neutral-700 px-2 py-0.5 rounded text-gray-300">
                                            {path}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-xs bg-neutral-700 px-2 py-0.5 rounded text-gray-300">All (/)</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => onRemove(source.id)}
                        className="p-2 hover:bg-red-900/30 text-gray-500 hover:text-red-400 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>
                </div>
            ))}

            {sources.length === 0 && (
                <div className="text-center py-8 text-gray-500 border-2 border-dashed border-neutral-800 rounded-lg">
                    No data sources configured
                </div>
            )}
        </div>
    )
}
