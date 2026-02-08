import React, { useState } from 'react'
import { ChevronDown, Edit, Play, Loader2 } from 'lucide-react'
import { UnscannedFile } from '../../types/library'
import { ManualMatchModal } from './ManualMatchModal'

interface UnscannedFilesProps {
    files: UnscannedFile[]
    onRefresh?: () => void
}

export const UnscannedFiles: React.FC<UnscannedFilesProps> = ({ files, onRefresh }) => {
    const [expanded, setExpanded] = useState(false)
    const [selectedFile, setSelectedFile] = useState<UnscannedFile | null>(null)
    const [playingId, setPlayingId] = useState<string | null>(null)

    if (files.length === 0) return null

    const handlePlay = async (file: UnscannedFile) => {
        if (file.webdavUrl) {
            setPlayingId(file.id)
            try {
                await window.electron.ipcRenderer.invoke('play-video', {
                    url: file.webdavUrl,
                    title: file.name
                })
            } catch (error) {
                console.error('Failed to play video:', error)
            } finally {
                setPlayingId(null)
            }
        }
    }

    const handleMatch = async (fileId: string, result: any, episodeInfo?: { season: number, episode: number }) => {
        try {
            await window.electron.ipcRenderer.invoke('manual-match-file', {
                fileId,
                tmdbId: result.id,
                mediaType: result.mediaType,
                episodeInfo
            })
            onRefresh?.()
        } catch (error) {
            console.error('Failed to match file:', error)
        }
    }

    const handleEditClick = (e: React.MouseEvent, file: UnscannedFile) => {
        e.stopPropagation()
        setSelectedFile(file)
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
                            className="p-4 border-b border-neutral-700 last:border-0 flex items-center justify-between hover:bg-neutral-700/50 transition-colors group/item"
                        >
                            <div className="overflow-hidden flex-1">
                                <p className="font-medium text-white truncate">{file.name}</p>
                                <p className="text-sm text-gray-500 truncate">
                                    {file.sourceName ? <span>{file.sourceName}</span> : null}
                                    {file.sourceName ? ' - ' : ''}
                                    {file.filePath}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handlePlay(file)
                                    }}
                                    disabled={playingId === file.id}
                                    className="p-2 hover:bg-neutral-600 rounded-full transition-colors opacity-0 group-hover/item:opacity-100 disabled:opacity-50"
                                >
                                    {playingId === file.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Play className="w-4 h-4" />
                                    )}
                                </button>
                                <button
                                    onClick={(e) => handleEditClick(e, file)}
                                    className="p-2 hover:bg-neutral-600 rounded-full transition-colors opacity-0 group-hover/item:opacity-100"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {selectedFile && (
                <ManualMatchModal
                    file={selectedFile}
                    onClose={() => setSelectedFile(null)}
                    onMatch={handleMatch}
                />
            )}
        </div>
    )
}
