import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { UnscannedFile } from '../../types/library'

interface UnscannedFilesProps {
    files: UnscannedFile[]
}

export const UnscannedFiles: React.FC<UnscannedFilesProps> = ({ files }) => {
    const [expanded, setExpanded] = useState(false)

    if (files.length === 0) return null

    const handlePlay = (file: UnscannedFile) => {
        if (file.webdavUrl) {
            window.electron.ipcRenderer.invoke('play-video', {
                url: file.webdavUrl,
                title: file.name
            })
        }
    }

    return (
        <div className="mt-12 mb-8">
            <div
                className="flex items-center justify-between mb-4 cursor-pointer group"
                onClick={() => setExpanded(!expanded)}
            >
                <h3 className="text-xl font-semibold text-gray-400 group-hover:text-gray-300 transition-colors">
                    Unscanned Files ({files.length})
                </h3>
                <ChevronDown className={`w-5 h-5 text-gray-400 group-hover:text-gray-300 transition-all ${expanded ? 'rotate-180' : ''}`} />
            </div>
            {expanded && (
                <div className="bg-neutral-800 rounded-xl overflow-hidden">
                    {files.map(file => (
                        <div
                            key={file.id}
                            className="p-4 border-b border-neutral-700 last:border-0 flex items-center justify-between hover:bg-neutral-700/50 transition-colors cursor-pointer group/item"
                            onClick={() => handlePlay(file)}
                        >
                            <div className="overflow-hidden">
                                <p className="font-medium text-white truncate">{file.name}</p>
                                <p className="text-sm text-gray-500 truncate">
                                    {file.sourceName ? <span>{file.sourceName}</span> : null}
                                    {file.sourceName ? ' - ' : ''}
                                    {file.filePath}
                                </p>
                            </div>
                            <div className="text-xs text-neutral-500 px-2 py-1 bg-neutral-900 rounded whitespace-nowrap">
                                Unidentified
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
