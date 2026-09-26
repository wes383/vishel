import { useState } from 'react'
import { Loader2 } from 'lucide-react'
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
import type { UnscannedFile } from '../../types/library'
import type { EpisodeMatchInfo, MatchResult } from '../../types/ipc'

interface ManualMatchModalProps {
    file: UnscannedFile
    onClose: () => void
    onMatched: (result: MatchResult) => void
}

/** Scene-release noise carries no title information, so it is dropped before searching TMDB. */
const queryFromFileName = (name: string): string => {
    let cleaned = name.replace(/\.[^/.]+$/, '')
    cleaned = cleaned.replace(/[._-]/g, ' ')
    cleaned = cleaned.replace(/\b(1080p|720p|4k|2160p|bluray|webdl|x264|x265|hevc|aac|ac3|dts|truehd)\b/gi, '')
    cleaned = cleaned.replace(/[[({].*?[)\]}]/g, '')
    cleaned = cleaned.replace(/\b(19|20)\d{2}\b.*$/, '')
    return cleaned.trim()
}

/**
 * Matches a file the scanner could not place. Unlike the rematch dialog this one owns the whole
 * write: the file is only removed from `unscanned_files` once `manual-match-file` confirms it.
 */
export function ManualMatchModal({ file, onClose, onMatched }: ManualMatchModalProps) {
    const { t } = useTranslation(['match', 'common'])
    const { showToast } = useToast()
    const search = useTmdbSearch(queryFromFileName(file.name), 'movie')
    const [selectedResult, setSelectedResult] = useState<TmdbSearchItem | null>(null)
    const [episodeInfo, setEpisodeInfo] = useState<EpisodeMatchInfo>({ season: 1, episode: 1 })
    const [submitting, setSubmitting] = useState(false)
    const [matchError, setMatchError] = useState('')

    const showEpisodeFields = Boolean(selectedResult) && search.mediaType === 'tv'

    const handleConfirm = async () => {
        if (!selectedResult || submitting) return

        setSubmitting(true)
        setMatchError('')
        try {
            const outcome = await window.electron.ipcRenderer.invoke('manual-match-file', {
                fileId: file.id,
                tmdbId: selectedResult.id,
                mediaType: selectedResult.mediaType,
                episodeInfo: selectedResult.mediaType === 'tv' ? episodeInfo : undefined
            })

            const result = confirmMatchOutcome(outcome)
            if (!result) {
                setMatchError(t('match:matchNotConfirmed'))
                showToast(t('match:matchCouldNotBeConfirmed'), 'error')
                return
            }

            onMatched(result)
            onClose()
        } catch (error) {
            const message = tmdbErrorMessage(error, t('match:matchFailed'))
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
                    disabled={!selectedResult || submitting}
                    className="px-6 py-2 rounded-xl font-medium bg-neutral-800 text-white hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                    {submitting ? t('match:matching') : t('match:confirmMatch')}
                </button>
            </div>
        </div>
    )

    return (
        <Modal
            title={t('match:manualMatch')}
            description={file.name}
            onClose={onClose}
            size="lg"
            footer={footer}
            bodyClassName="flex flex-col gap-4 min-h-0"
        >
            <TmdbSearchControls
                query={search.query}
                mediaType={search.mediaType}
                searching={search.searching}
                statusMessage={search.statusMessage}
                statusTone={search.statusTone}
                onQueryChange={search.setQuery}
                onMediaTypeChange={search.setMediaType}
                onSubmit={search.submit}
            />

            <TmdbResultList
                items={search.items}
                mediaType={search.mediaType}
                selectedId={selectedResult?.id ?? null}
                searching={search.searching}
                emptyMessage={search.mediaType === 'movie' ? t('match:searchForMovieToMatch') : t('match:searchForTvShowToMatch')}
                loadingMore={search.loadingMore}
                hasMore={search.hasMore}
                onLoadMore={search.loadMore}
                onSelect={setSelectedResult}
            />
        </Modal>
    )
}
