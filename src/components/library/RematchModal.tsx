import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Select from '../ui/Select'
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
            <p aria-live="polite" className="text-sm text-danger">
                {matchError}
            </p>
            <div className="flex items-center justify-end gap-3">
                <Button variant="ghost" onClick={onClose} disabled={submitting}>
                    {t('common:cancel')}
                </Button>
                <Button
                    onClick={() => void handleConfirm()}
                    disabled={!selectedResult || selectedResult.id === mediaId}
                    loading={submitting}
                >
                    {submitting ? t('match:rematching') : t('match:confirmRematch')}
                </Button>
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
                <Select
                    id="rematch-file"
                    size="md"
                    value={selectedFileId}
                    onChange={event => setSelectedFileId(event.target.value)}
                    disabled={videoFiles.length <= 1}
                    label={t('match:filesToRematch')}
                >
                    {videoFiles.length > 1 && <option value={ALL_FILES}>{t('match:allFilesCount', { count: videoFiles.length })}</option>}
                    {videoFiles.length === 0 && <option value={ALL_FILES}>{t('match:noFile')}</option>}
                    {videoFiles.map(videoFile => (
                        <option key={videoFile.id} value={videoFile.id}>
                            {videoFile.name}
                        </option>
                    ))}
                </Select>
                {singleFile && videoFiles.length > 1 && (
                    <p className="text-xs text-foreground-muted mt-2">
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
