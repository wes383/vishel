import { useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import { useToast } from '../../contexts/ToastContext'
import {
    EpisodeFields,
    TmdbResultList,
    TmdbSearchControls,
    confirmMatchOutcome,
    tmdbErrorMessage,
    useTmdbSearch,
    type TmdbSearchItem
} from './TmdbResultList'
import type { EpisodeMatchInfo, MatchResult, MediaType } from '../../types/ipc'

interface VideoFile {
    id: string
    name: string
    filePath: string
    webdavUrl: string
    sourceId: string
}

interface RematchModalProps {
    mediaId: number
    mediaType: 'movie' | 'tv'
    currentTitle: string
    videoFiles: VideoFile[]
    onClose: () => void
    onMatched: (result: MatchResult) => void
}

const ALL_FILES = 'all'

/**
 * Re-matches an already scanned item. The single-file branch moves one video out of the current
 * movie/show onto the new TMDB entry, which is why it is the only branch needing episode numbers.
 */
export function RematchModal({
    mediaId,
    mediaType,
    currentTitle,
    videoFiles,
    onClose,
    onMatched
}: RematchModalProps) {
    const { t } = useTranslation(['match', 'common'])
    const { showToast } = useToast()
    const search = useTmdbSearch(currentTitle, mediaType)
    const [selectedResult, setSelectedResult] = useState<TmdbSearchItem | null>(null)
    const [selectedFileId, setSelectedFileId] = useState<string>(
        videoFiles.length > 1 ? ALL_FILES : videoFiles[0]?.id || ALL_FILES
    )
    const [episodeInfo, setEpisodeInfo] = useState<EpisodeMatchInfo>({ season: 1, episode: 1 })
    const [submitting, setSubmitting] = useState(false)
    const [matchError, setMatchError] = useState('')

    const singleFile = selectedFileId !== ALL_FILES
    const showEpisodeFields = Boolean(selectedResult) && singleFile && search.mediaType === 'tv'
    const selectedFile = videoFiles.find(videoFile => videoFile.id === selectedFileId)

    const handleMediaTypeChange = (value: MediaType) => {
        search.setMediaType(value)
        setSelectedResult(null)
    }

    const handleConfirm = async () => {
        if (!selectedResult || submitting) return

        setSubmitting(true)
        setMatchError('')
        try {
            const outcome = singleFile
                ? await window.electron.ipcRenderer.invoke('rematch-single-file', {
                    oldTmdbId: mediaId,
                    oldMediaType: mediaType,
                    fileId: selectedFileId,
                    newTmdbId: selectedResult.id,
                    newMediaType: selectedResult.mediaType,
                    episodeInfo: selectedResult.mediaType === 'tv' ? episodeInfo : undefined
                })
                : await window.electron.ipcRenderer.invoke('rematch-media', {
                    oldTmdbId: mediaId,
                    newTmdbId: selectedResult.id,
                    mediaType
                })

            const result = confirmMatchOutcome(outcome)
            if (!result) {
                setMatchError(t('match:rematchNotConfirmed'))
                showToast(t('match:rematchCouldNotBeConfirmed'), 'error')
                return
            }

            onMatched(result)
            onClose()
        } catch (error) {
            const message = tmdbErrorMessage(error, t('match:rematchFailed'))
            setMatchError(message)
            showToast(message, 'error')
        } finally {
            setSubmitting(false)
        }
    }

    const footer = (
        <div className="space-y-4">
            {showEpisodeFields && <EpisodeFields value={episodeInfo} onChange={setEpisodeInfo} />}
            <p aria-live="polite" className="text-sm text-red-600">
                {matchError}
            </p>
            <div className="flex items-center justify-end gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    disabled={submitting}
                    className="px-6 py-2 rounded-xl font-medium bg-black/10 hover:bg-black/20 transition-colors text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {t('common:cancel')}
                </button>
                <button
                    type="button"
                    onClick={() => void handleConfirm()}
                    disabled={!selectedResult || selectedResult.id === mediaId || submitting}
                    className="px-6 py-2 rounded-xl font-medium bg-neutral-800 text-white hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                    {submitting ? t('match:rematching') : t('match:confirmRematch')}
                </button>
            </div>
        </div>
    )

    return (
        <Modal
            title={mediaType === 'movie' ? t('match:rematchMovie') : t('match:rematchTvShow')}
            description={t('match:currentTitle', { title: currentTitle })}
            onClose={onClose}
            size="lg"
            footer={footer}
            bodyClassName="flex flex-col gap-4 min-h-0"
        >
            <div>
                <label htmlFor="rematch-file" className="sr-only">
                    {t('match:filesToRematch')}
                </label>
                <div className="relative">
                    <select
                        id="rematch-file"
                        value={selectedFileId}
                        onChange={event => setSelectedFileId(event.target.value)}
                        disabled={videoFiles.length <= 1}
                        className="w-full appearance-none bg-black/10 border border-gray-900/20 rounded-xl px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900 disabled:opacity-70"
                    >
                        {videoFiles.length > 1 && <option value={ALL_FILES}>{t('match:allFilesCount', { count: videoFiles.length })}</option>}
                        {videoFiles.length === 0 && <option value={ALL_FILES}>{t('match:noFile')}</option>}
                        {videoFiles.map(videoFile => (
                            <option key={videoFile.id} value={videoFile.id}>
                                {videoFile.name}
                            </option>
                        ))}
                    </select>
                    <ChevronDown
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600 pointer-events-none"
                        aria-hidden="true"
                    />
                </div>
                {singleFile && videoFiles.length > 1 && (
                    <p className="text-xs text-gray-600 mt-2">
                        {t('match:onlyFileMoved', { name: selectedFile?.name || t('match:theSelectedFile') })}
                    </p>
                )}
            </div>

            <TmdbSearchControls
                query={search.query}
                mediaType={search.mediaType}
                searching={search.searching}
                statusMessage={search.statusMessage}
                statusTone={search.statusTone}
                onQueryChange={search.setQuery}
                onMediaTypeChange={handleMediaTypeChange}
                onSubmit={search.submit}
            />

            <TmdbResultList
                items={search.items}
                mediaType={search.mediaType}
                selectedId={selectedResult?.id ?? null}
                searching={search.searching}
                emptyMessage={search.mediaType === 'movie' ? t('match:searchForMovie') : t('match:searchForTvShow')}
                loadingMore={search.loadingMore}
                hasMore={search.hasMore}
                onLoadMore={search.loadMore}
                onSelect={setSelectedResult}
            />
        </Modal>
    )
}
