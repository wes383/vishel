import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Trash2, Play, Loader2, SkipForward } from 'lucide-react'
import Modal from '../ui/Modal'
import ListItemButton from '../ui/ListItemButton'
import { useToast } from '../../contexts/ToastContext'
import { HistoryItem } from '../../types/library'
import { useListVirtualizer } from '../../hooks/useRowVirtualizer'
import { formatMoviePlayTitle, formatTvPlayTitle } from '../../utils/playTitle'
import type { Episode, Movie, TVShow, VideoFile } from '../../../electron/db'
import type { MediaType, PlayHistoryDraft } from '../../types/ipc'

interface HistoryListProps {
    items: HistoryItem[]
    onDelete: (id: string) => void
    emptyMessage?: React.ReactNode
}

type MediaRecord = Movie | TVShow

/** `p-3` around a 96px poster plus the `space-y-2` gap. */
const HISTORY_ROW_PITCH = 128

/**
 * Outcome of a single library lookup. `missing` means the record was deleted from the
 * library; `failed` means the IPC itself rejected, which must not be presented as "gone".
 */
type MediaEntry =
    | { status: 'available'; record: MediaRecord }
    | { status: 'missing' }
    | { status: 'failed' }

/** What a row needs to render, all derived from the cached record - no extra IPC per row. */
interface DerivedRow {
    item: HistoryItem
    checked: boolean
    /** The record was confirmed deleted from the library (as opposed to the lookup failing). */
    removed: boolean
    nextEpisode: Episode | null
    playedAt: string
    episodeLabel: string
}

/** Everything needed to start playback, including which versions to offer. */
interface PlaybackPlan {
    title: string
    history: PlayHistoryDraft
    files: VideoFile[]
    /** The file this entry was played from last time, when it is still in the library. */
    preferredPath?: string
}

/** One lookup per media record, however many history rows point at it. */
const mediaKeyOf = (mediaType: MediaType, mediaId: number) => `${mediaType}:${mediaId}`

/** Inverse of mediaKeyOf, for keys produced by it. */
const parseMediaKey = (key: string): { mediaType: MediaType; mediaId: number } => {
    const separator = key.indexOf(':')
    return {
        mediaType: key.slice(0, separator) === 'tv' ? 'tv' : 'movie',
        mediaId: Number(key.slice(separator + 1))
    }
}

/**
 * Searching the library re-filters the history on every keystroke, so lookups are debounced;
 * the cache below means a settled lookup is never repeated anyway.
 */
const LOOKUP_DEBOUNCE_MS = 250
/** Round-trips are independent, but firing one per row at once stalls the main process. */
const LOOKUP_CONCURRENCY = 6

const errorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback

const isTVShow = (record: MediaRecord): record is TVShow => 'seasons' in record

async function requestMedia(mediaType: MediaType, mediaId: number): Promise<MediaRecord | null> {
    const record = mediaType === 'movie'
        ? await window.electron.ipcRenderer.invoke('get-movie', mediaId)
        : await window.electron.ipcRenderer.invoke('get-tv-show', mediaId)
    return record ?? null
}

function episodeOf(record: MediaRecord, item: HistoryItem): Episode | null {
    if (!isTVShow(record) || item.seasonNumber === undefined || item.episodeNumber === undefined) return null
    const season = record.seasons.find(entry => entry.seasonNumber === item.seasonNumber)
    return season?.episodes.find(entry => entry.episodeNumber === item.episodeNumber) ?? null
}

function nextEpisodeOf(record: MediaRecord, item: HistoryItem): Episode | null {
    if (!isTVShow(record) || item.seasonNumber === undefined || item.episodeNumber === undefined) return null
    const season = record.seasons.find(entry => entry.seasonNumber === item.seasonNumber)
    return season?.episodes.find(entry =>
        entry.episodeNumber === item.episodeNumber! + 1 && entry.videoFiles.length > 0
    ) ?? null
}

function planForItem(record: MediaRecord, item: HistoryItem): PlaybackPlan | null {
    if (isTVShow(record)) {
        const episode = episodeOf(record, item)
        if (!episode || episode.videoFiles.length === 0) return null
        return {
            title: formatTvPlayTitle(record.name, episode.seasonNumber, episode.episodeNumber, episode.name),
            history: {
                mediaId: record.id,
                mediaType: 'tv',
                title: record.name,
                posterPath: record.posterPath,
                filePath: episode.videoFiles[0].filePath,
                seasonNumber: episode.seasonNumber,
                episodeNumber: episode.episodeNumber,
                episodeName: episode.name
            },
            files: episode.videoFiles,
            preferredPath: item.filePath
        }
    }

    if (record.videoFiles.length === 0) return null
    return {
        title: formatMoviePlayTitle(record.title),
        history: {
            mediaId: record.id,
            mediaType: 'movie',
            title: record.title,
            posterPath: record.posterPath,
            filePath: record.videoFiles[0].filePath
        },
        files: record.videoFiles,
        preferredPath: item.filePath
    }
}

function planForEpisode(record: TVShow, episode: Episode): PlaybackPlan {
    return {
        title: formatTvPlayTitle(record.name, episode.seasonNumber, episode.episodeNumber, episode.name),
        history: {
            mediaId: record.id,
            mediaType: 'tv',
            title: record.name,
            posterPath: record.posterPath,
            filePath: episode.videoFiles[0].filePath,
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
            episodeName: episode.name
        },
        files: episode.videoFiles
    }
}

/**
 * Keeps lookups off the keystroke path. The joined signature is the debounce identity, so a
 * re-render whose content is unchanged never cancels a pending batch.
 */
function useDebouncedKeys(keys: string[], delay: number): string[] {
    const signature = useMemo(() => keys.join('|'), [keys])
    const [debouncedSignature, setDebouncedSignature] = useState(signature)

    useEffect(() => {
        if (signature === debouncedSignature) return

        const timer = setTimeout(() => setDebouncedSignature(signature), delay)
        return () => clearTimeout(timer)
    }, [signature, debouncedSignature, delay])

    return useMemo(
        () => (debouncedSignature ? debouncedSignature.split('|') : []),
        [debouncedSignature]
    )
}

export const HistoryList: React.FC<HistoryListProps> = ({ items, onDelete, emptyMessage }) => {
    const navigate = useNavigate()
    const { t } = useTranslation(['grid', 'common'])
    const { showToast } = useToast()

    const [playingId, setPlayingIdState] = useState<string | null>(null)
    const [fileSelector, setFileSelectorState] = useState<PlaybackPlan | null>(null)

    /**
     * Resolved at most once per media record for as long as this view is mounted. The ref is the
     * synchronous source the actions read; the state is an immutable snapshot of it that lets the
     * derived rows recompute.
     */
    const cacheRef = useRef(new Map<string, MediaEntry>())
    const [cachedEntries, setCachedEntries] = useState<ReadonlyMap<string, MediaEntry>>(() => new Map())
    const inFlightRef = useRef(new Set<string>())
    const isActiveRef = useRef(true)

    useEffect(() => {
        isActiveRef.current = true
        return () => {
            isActiveRef.current = false
        }
    }, [])

    const setPlaying = useCallback((id: string | null) => {
        if (isActiveRef.current) setPlayingIdState(id)
    }, [])

    const setSelector = useCallback((plan: PlaybackPlan | null) => {
        if (isActiveRef.current) setFileSelectorState(plan)
    }, [])

    const publishCache = useCallback(() => {
        if (isActiveRef.current) setCachedEntries(new Map(cacheRef.current))
    }, [])

    const storeEntry = useCallback((key: string, entry: MediaEntry) => {
        cacheRef.current.set(key, entry)
        publishCache()
    }, [publishCache])

    /** Cache-first lookup used by the row actions, so clicking Play does not re-fetch a show. */
    const loadMedia = useCallback(async (mediaType: MediaType, mediaId: number): Promise<MediaRecord | null> => {
        const key = mediaKeyOf(mediaType, mediaId)
        const cached = cacheRef.current.get(key)
        if (cached && cached.status !== 'failed') {
            return cached.status === 'available' ? cached.record : null
        }

        const record = await requestMedia(mediaType, mediaId)
        storeEntry(key, record ? { status: 'available', record } : { status: 'missing' })
        return record
    }, [storeEntry])

    const pendingKeys = useMemo(() => {
        const unresolved = new Set<string>()
        for (const item of items) {
            const key = mediaKeyOf(item.mediaType, item.mediaId)
            if (!cachedEntries.has(key) && !inFlightRef.current.has(key)) unresolved.add(key)
        }
        return Array.from(unresolved).sort()
    }, [items, cachedEntries])

    const debouncedKeys = useDebouncedKeys(pendingKeys, LOOKUP_DEBOUNCE_MS)

    // Resolve the media behind the visible rows in bounded-parallel batches, once each.
    useEffect(() => {
        if (debouncedKeys.length === 0) return

        const run = async () => {
            let failures = 0

            for (let index = 0; index < debouncedKeys.length; index += LOOKUP_CONCURRENCY) {
                await Promise.all(debouncedKeys.slice(index, index + LOOKUP_CONCURRENCY).map(async key => {
                    if (inFlightRef.current.has(key) || cacheRef.current.has(key)) return
                    inFlightRef.current.add(key)

                    const { mediaType, mediaId } = parseMediaKey(key)
                    try {
                        const record = await requestMedia(mediaType, mediaId)
                        storeEntry(key, record ? { status: 'available', record } : { status: 'missing' })
                    } catch (error) {
                        // A rejected lookup is a transport problem, not a deleted record: keep it
                        // retryable and say so instead of hiding the row's actions.
                        console.error(`Failed to check "${key}" against the library:`, error)
                        failures += 1
                        storeEntry(key, { status: 'failed' })
                    } finally {
                        inFlightRef.current.delete(key)
                    }
                }))
            }

            if (failures > 0) {
                showToast(t('grid:libraryCheckFailures', { count: failures }), 'error')
            }
        }

        run().catch(error => {
            console.error('Failed to refresh play history:', error)
            showToast(t('grid:couldNotCheckHistoryItems'), 'error')
        })
    }, [debouncedKeys, showToast, storeEntry, t])

    const rows = useMemo<DerivedRow[]>(() => items.map(item => {
        const entry = cachedEntries.get(mediaKeyOf(item.mediaType, item.mediaId))
        const record = entry?.status === 'available' ? entry.record : null
        const hasEpisode = item.seasonNumber !== undefined && item.episodeNumber !== undefined

        return {
            item,
            checked: entry !== undefined,
            // A record known to be gone loses its Play button; a failed lookup keeps it so the
            // click can retry and report the real error.
            removed: entry?.status === 'missing',
            nextEpisode: record ? nextEpisodeOf(record, item) : null,
            playedAt: new Date(item.timestamp).toLocaleString(),
            episodeLabel: hasEpisode ? t('grid:episodeCode', { season: item.seasonNumber, episode: item.episodeNumber }) : ''
        }
    }), [items, cachedEntries, t])

    const listRef = useRef<HTMLUListElement>(null)
    const { start, end, paddingTop, paddingBottom } = useListVirtualizer(listRef, rows.length, HISTORY_ROW_PITCH)

    const isChecking = rows.some(row => !row.checked)

    const playFile = useCallback(async (file: VideoFile, plan: PlaybackPlan) => {
        await window.electron.ipcRenderer.invoke('play-video', {
            url: file.webdavUrl,
            title: plan.title,
            history: { ...plan.history, filePath: file.filePath }
        })
    }, [])

    /** A single version plays straight away; several open the version picker. */
    const launch = useCallback(async (plan: PlaybackPlan) => {
        if (plan.files.length > 1) {
            setSelector(plan)
            return
        }

        const preferred = plan.files.find(file => file.filePath === plan.preferredPath) || plan.files[0]
        await playFile(preferred, plan)
    }, [playFile, setSelector])

    const handleNavigateToDetail = useCallback(async (item: HistoryItem) => {
        try {
            const record = await loadMedia(item.mediaType, item.mediaId)
            if (!record) {
                showToast(
                    item.mediaType === 'movie'
                        ? t('grid:movieNoLongerInLibrary')
                        : t('grid:tvShowNoLongerInLibrary'),
                    'error'
                )
                return
            }
            navigate(item.mediaType === 'movie' ? `/movie/${item.mediaId}` : `/tv/${item.mediaId}`)
        } catch (error) {
            console.error('Failed to load media details:', error)
            showToast(errorMessage(error, t('grid:failedToLoadMediaDetails')), 'error')
        }
    }, [loadMedia, navigate, showToast, t])

    const handlePlay = useCallback(async (item: HistoryItem) => {
        setPlaying(item.id)
        try {
            const record = await loadMedia(item.mediaType, item.mediaId)
            if (!record) {
                showToast(
                    item.mediaType === 'movie'
                        ? t('grid:movieNoLongerInLibrary')
                        : t('grid:tvShowNoLongerInLibrary'),
                    'error'
                )
                return
            }

            const plan = planForItem(record, item)
            if (!plan) {
                showToast(t('grid:noPlayableFileFound'), 'error')
                return
            }

            await launch(plan)
        } catch (error) {
            console.error('Failed to play history item:', error)
            showToast(errorMessage(error, t('grid:failedToPlayVideo')), 'error')
        } finally {
            setPlaying(null)
        }
    }, [launch, loadMedia, setPlaying, showToast, t])

    const handlePlayNext = useCallback(async (item: HistoryItem) => {
        setPlaying(`${item.id}-next`)
        try {
            const record = await loadMedia('tv', item.mediaId)
            if (!record || !isTVShow(record)) {
                showToast(t('grid:tvShowNoLongerInLibrary'), 'error')
                return
            }

            const next = nextEpisodeOf(record, item)
            if (!next) {
                showToast(t('grid:nextEpisodeNotInLibrary'), 'error')
                return
            }

            await launch(planForEpisode(record, next))
        } catch (error) {
            console.error('Failed to play the next episode:', error)
            showToast(errorMessage(error, t('grid:failedToPlayNextEpisode')), 'error')
        } finally {
            setPlaying(null)
        }
    }, [launch, loadMedia, setPlaying, showToast, t])

    const handleSelectFile = useCallback(async (file: VideoFile, plan: PlaybackPlan) => {
        setSelector(null)
        setPlaying(`file-${file.id}`)
        try {
            await playFile(file, plan)
        } catch (error) {
            console.error('Failed to play the selected version:', error)
            showToast(errorMessage(error, t('grid:failedToPlayVideo')), 'error')
        } finally {
            setPlaying(null)
        }
    }, [playFile, setPlaying, setSelector, showToast, t])

    const emptyState = (
        <div className="text-center text-gray-400 mt-20">
            {emptyMessage || <p>{t('grid:noHistoryFound')}</p>}
        </div>
    )

    return (
        <>
            {/* Search filters this list as the user types, so the count is announced politely. */}
            <div className="sr-only" role="status" aria-live="polite">
                {items.length === 0
                    ? t('grid:noHistoryEntries')
                    : t('grid:showingHistory', { count: items.length })}
            </div>

            {items.length === 0 ? emptyState : (
                <ul
                    ref={listRef}
                    style={{ paddingTop, paddingBottom }}
                    className="space-y-2"
                    aria-busy={isChecking}
                >
                    {rows.slice(start, end).map(({ item, removed, nextEpisode, playedAt, episodeLabel }) => (
                        <li
                            key={item.id}
                            className="group bg-neutral-800 rounded-xl overflow-hidden hover:bg-neutral-700 transition-colors"
                        >
                            <div className="flex items-center gap-4 p-3">
                                {/* Poster: mouse affordance only; the title button carries the tab stop. */}
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => void handleNavigateToDetail(item)}
                                    aria-label={t('grid:openDetailsAriaLabel', { title: item.title })}
                                    className="flex-shrink-0 w-16 h-24 rounded-lg overflow-hidden bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                                >
                                    {item.posterPath ? (
                                        <img
                                            src={`https://image.tmdb.org/t/p/w200${item.posterPath}`}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <span className="w-full h-full flex items-center justify-center text-neutral-500 text-xs">
                                            {t('grid:noPoster')}
                                        </span>
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => void handleNavigateToDetail(item)}
                                    className="flex-1 min-w-0 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                                >
                                    <span className="block font-semibold text-white text-base truncate">{item.title}</span>
                                    {episodeLabel && (
                                        <span className="flex items-center gap-2 mt-1 text-sm text-gray-400">
                                            <span>{episodeLabel}</span>
                                            {item.episodeName && (
                                                <>
                                                    <span aria-hidden="true">·</span>
                                                    <span className="truncate">{item.episodeName}</span>
                                                </>
                                            )}
                                        </span>
                                    )}
                                    <span className="block text-xs text-gray-500 mt-1">{playedAt}</span>
                                </button>

                                <div className="flex items-center gap-2">
                                    {nextEpisode && (
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                void handlePlayNext(item)
                                            }}
                                            disabled={playingId === `${item.id}-next`}
                                            aria-label={t('grid:playNextAriaLabel', { season: nextEpisode.seasonNumber, episode: nextEpisode.episodeNumber, title: item.title })}
                                            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 text-white hover:bg-white hover:text-black transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50 text-sm font-medium"
                                        >
                                            {playingId === `${item.id}-next` ? (
                                                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                                            ) : (
                                                <SkipForward className="w-4 h-4" aria-hidden="true" />
                                            )}
                                            <span>{t('grid:playNextLabel', { season: nextEpisode.seasonNumber, episode: nextEpisode.episodeNumber })}</span>
                                        </button>
                                    )}
                                    {removed ? (
                                        <span className="flex-shrink-0 px-3 py-1.5 text-xs text-gray-500 whitespace-nowrap">
                                            {t('grid:removedFromLibrary')}
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation()
                                                void handlePlay(item)
                                            }}
                                            disabled={playingId === item.id}
                                            aria-label={episodeLabel
                                                ? t('grid:playWithEpisodeAriaLabel', { title: item.title, episode: episodeLabel })
                                                : t('grid:playNamed', { name: item.title })}
                                            className="flex-shrink-0 p-2 rounded-full bg-white/20 text-white hover:bg-white hover:text-black transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50"
                                        >
                                            {playingId === item.id ? (
                                                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                                            ) : (
                                                <Play className="w-5 h-5" aria-hidden="true" />
                                            )}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onDelete(item.id)
                                        }}
                                        aria-label={t('grid:removeFromHistoryAriaLabel', { title: item.title })}
                                        className="flex-shrink-0 p-2 mr-2 rounded-full bg-white/20 text-gray-300 hover:bg-red-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                                    >
                                        <Trash2 className="w-5 h-5" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {fileSelector && (
                <Modal
                    title={t('grid:selectVersion')}
                    description={fileSelector.title}
                    onClose={() => setSelector(null)}
                >
                    <div className="space-y-3">
                        {fileSelector.files.map(file => (
                            <ListItemButton
                                key={file.id}
                                icon={<Play className="w-5 h-5" aria-hidden="true" />}
                                title={file.name}
                                onClick={() => void handleSelectFile(file, fileSelector)}
                            />
                        ))}
                    </div>
                </Modal>
            )}
        </>
    )
}
