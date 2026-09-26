import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Play, Loader2, Edit } from 'lucide-react'
import { UnscannedFile } from '../../types/library'
import { ManualMatchModal } from './ManualMatchModal'
import { useListVirtualizer } from '../../hooks/useRowVirtualizer'
import { useToast } from '../../contexts/ToastContext'
import type { MatchResult } from '../../types/ipc'

interface UnscannedFilesProps {
    files: UnscannedFile[]
    onRefresh?: () => void
}

/** Fixed row height: `p-4` plus the two-line variant, so windowing has an exact pitch. */
const ROW_PITCH = 76

const errorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback

export const UnscannedFiles: React.FC<UnscannedFilesProps> = ({ files, onRefresh }) => {
    const [expanded, setExpanded] = useState(false)
    const [selectedFile, setSelectedFile] = useState<UnscannedFile | null>(null)
    const [playingId, setPlayingId] = useState<string | null>(null)
    const listRef = useRef<HTMLUListElement>(null)
    const { start, end, paddingTop, paddingBottom } = useListVirtualizer(listRef, files.length, ROW_PITCH, expanded)

    const isActiveRef = useRef(true)
    useEffect(() => {
        isActiveRef.current = true
        return () => {
            isActiveRef.current = false
        }
    }, [])

    const { showToast } = useToast()
    const { t } = useTranslation(['grid', 'common'])
    const panelId = useId()

    const setPlaying = useCallback((id: string | null) => {
        if (isActiveRef.current) setPlayingId(id)
    }, [])

    const handlePlay = useCallback(async (file: UnscannedFile) => {
        if (!file.webdavUrl) {
            showToast(t('grid:noStreamUrl'), 'error')
            return
        }

        setPlaying(file.id)
        try {
            await window.electron.ipcRenderer.invoke('play-video', {
                url: file.webdavUrl,
                title: file.name
            })
        } catch (error) {
            console.error('Failed to play video:', error)
            showToast(errorMessage(error, t('grid:failedToPlayVideo')), 'error')
        } finally {
            setPlaying(null)
        }
    }, [setPlaying, showToast, t])

    /** ManualMatchModal owns the write and only reports back once it is confirmed. */
    const handleMatched = useCallback((result: MatchResult) => {
        showToast(result.title ? t('grid:matchedAs', { title: result.title }) : t('grid:fileMatched'), 'success')
        onRefresh?.()
    }, [onRefresh, showToast, t])

    const handleEditClick = useCallback((event: React.MouseEvent, file: UnscannedFile) => {
        event.stopPropagation()
        setSelectedFile(file)
    }, [])

    if (files.length === 0) return null

    return (
        <div className="mt-12 mb-8">
            <h3 className="text-xl font-semibold mb-4">
                <button
                    type="button"
                    onClick={() => setExpanded(value => !value)}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    className="group flex w-full items-center justify-between gap-2 rounded-lg text-gray-400 hover:text-gray-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                    <span className="font-semibold truncate">
                        {t('grid:unscannedFiles', { count: files.length })}
                    </span>
                    <ChevronDown
                        aria-hidden="true"
                        className={`w-5 h-5 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                </button>
            </h3>
            <p className="sr-only" role="status" aria-live="polite">
                {t('grid:filesWaiting', { count: files.length })}
            </p>

            {expanded && (
                <ul
                    id={panelId}
                    ref={listRef}
                    style={{ paddingTop, paddingBottom }}
                    className="bg-neutral-800 rounded-xl overflow-hidden"
                >
                    {files.slice(start, end).map(file => (
                        <li
                            key={file.id}
                            className="h-[76px] p-4 border-b border-neutral-700 last:border-0 flex items-center justify-between gap-3 hover:bg-neutral-700/50 transition-colors group/item"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="font-medium text-white truncate">{file.name}</p>
                                {file.sourceName && (
                                    <p className="text-sm text-gray-500 truncate">
                                        {t('grid:fromSource', { name: file.sourceName })}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation()
                                        void handlePlay(file)
                                    }}
                                    disabled={playingId === file.id}
                                    title={t('grid:playThisFile')}
                                    aria-label={t('grid:playNamed', { name: file.name })}
                                    className="p-2 hover:bg-neutral-600 rounded-full transition-colors opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-50"
                                >
                                    {playingId === file.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                                    ) : (
                                        <Play className="w-4 h-4" aria-hidden="true" />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={(event) => handleEditClick(event, file)}
                                    title={t('grid:matchThisFileManually')}
                                    aria-label={t('grid:matchFileManuallyAriaLabel', { name: file.name })}
                                    className="p-2 hover:bg-neutral-600 rounded-full transition-colors opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                >
                                    <Edit className="w-4 h-4" aria-hidden="true" />
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {selectedFile && (
                <ManualMatchModal
                    file={selectedFile}
                    onClose={() => setSelectedFile(null)}
                    onMatched={handleMatched}
                />
            )}
        </div>
    )
}
