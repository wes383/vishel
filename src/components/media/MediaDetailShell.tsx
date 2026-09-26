import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, Check, ChevronLeft, Clock, Heart, ImageOff, Play, User } from 'lucide-react'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import EmptyState from '../ui/EmptyState'
import { Spinner } from '../ui/Feedback'
import { Tooltip } from '../ui/Tooltip'
import { getRuntimeParts, tmdbImage } from '../../utils/formatMediaInfo'
import { formatVoteCount } from '../../utils/formatNumber'
import { useMediaStatus } from '../../contexts/MediaStatusContext'
import { useToast } from '../../contexts/ToastContext'
import type { VideoFile } from '../../../electron/db'
import type { VideoProbeMetadata } from '../../../electron/mediaProbe'
import type { MediaType } from '../../types/ipc'
import type { ImdbRatingValue } from '../../hooks/useImdbRating'
import { getExternalLinkLabelKey } from '../../utils/externalLinks'
import type { ExternalLink } from '../../utils/externalLinks'

export interface Person {
    name: string
    character?: string
    profilePath?: string | null
}

interface MediaDetailShellProps {
    mediaType: MediaType
    mediaId: number
    title: string
    overview: string
    logoPath?: string | null
    backdropPath?: string | null
    tagline?: string
    year?: string
    runtime?: number
    genres?: string[]
    voteAverage?: number
    imdbRating: ImdbRatingValue | null
    loadingImdb: boolean
    showImdbRating: boolean
    preferTextTitle: boolean
    externalLinks: ExternalLink[]
    hasImdbId: boolean
    onBack: () => void
    isMac: boolean
    children: React.ReactNode
}

/**
 * Header, banner, ratings, favourite/watched actions and external links were duplicated
 * line for line between the movie and TV detail pages.
 */
export function MediaDetailShell({
    mediaType,
    mediaId,
    title,
    overview,
    logoPath,
    backdropPath,
    tagline,
    year,
    runtime,
    genres,
    voteAverage,
    imdbRating,
    loadingImdb,
    showImdbRating,
    preferTextTitle,
    externalLinks,
    hasImdbId,
    onBack,
    isMac,
    children
}: MediaDetailShellProps) {
    const { t } = useTranslation(['detail', 'common'])
    const [showTextTitle, setShowTextTitle] = useState(preferTextTitle)
    const { isFavorite, isWatched, toggleFavorite, toggleWatched } = useMediaStatus()
    const { showToast } = useToast()

    const favorited = isFavorite(mediaType, mediaId)
    const watched = isWatched(mediaType, mediaId)
    const runtimeParts = getRuntimeParts(runtime)

    const handleToggleFavorite = async () => {
        try {
            const added = await toggleFavorite({ mediaId, mediaType, title })
            showToast(
                added ? t('detail:favoriteAdded', { title }) : t('detail:favoriteRemoved', { title }),
                'success'
            )
        } catch (error) {
            showToast(error instanceof Error ? error.message : t('detail:favoritesUpdateFailed'), 'error')
        }
    }

    const handleToggleWatched = async () => {
        try {
            const nowWatched = await toggleWatched(mediaType, mediaId)
            showToast(
                nowWatched ? t('detail:markedWatched', { title }) : t('detail:markedUnwatched', { title }),
                'success'
            )
        } catch (error) {
            showToast(error instanceof Error ? error.message : t('detail:watchStatusUpdateFailed'), 'error')
        }
    }

    return (
        <div className="relative min-h-screen bg-background text-foreground">
            <div className="absolute inset-0 h-[80vh] w-full overflow-hidden">
                {!isMac && <div className="titlebar-fade absolute top-0 left-0 right-0 h-8 z-[99]" />}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background z-10" />
                {backdropPath && (
                    <>
                        <img
                            src={tmdbImage(backdropPath, 'w300')}
                            alt=""
                            aria-hidden="true"
                            className="absolute inset-0 w-full h-full object-cover object-top opacity-50 blur-md"
                        />
                        <img
                            src={tmdbImage(backdropPath, 'original')}
                            alt={t('detail:backdropAlt', { title })}
                            className="absolute inset-0 w-full h-full object-cover object-top opacity-0 transition-opacity duration-700 ease-in-out"
                            onLoad={(event) => event.currentTarget.classList.remove('opacity-0')}
                        />
                    </>
                )}
            </div>

            <Button
                size="icon"
                variant="ghost"
                onClick={onBack}
                aria-label={t('detail:backToLibrary')}
                className="absolute top-12 left-8 z-40"
            >
                <ChevronLeft className="w-6 h-6" aria-hidden="true" />
            </Button>

            <div className="relative z-20 container mx-auto px-8 pt-[55vh] pb-20">
                <div className="pt-4">
                    {logoPath && !showTextTitle && !preferTextTitle ? (
                        <button
                            type="button"
                            onClick={() => setShowTextTitle(true)}
                            aria-label={t('detail:showTitleAsText', { title })}
                            className="block origin-left hover:opacity-80 transition-opacity"
                        >
                            <img
                                src={tmdbImage(logoPath, 'original')}
                                alt={title}
                                className="max-w-[400px] max-h-[150px] object-contain mb-6"
                            />
                        </button>
                    ) : (
                        <h1 className="font-display text-5xl font-extrabold mb-2 leading-tight tracking-tight">
                            <button
                                type="button"
                                onClick={() => {
                                    if (logoPath && !preferTextTitle) setShowTextTitle(false)
                                }}
                                className={logoPath && !preferTextTitle ? 'cursor-pointer hover:opacity-80 transition-opacity text-left' : 'text-left cursor-default'}
                            >
                                {title}
                            </button>
                        </h1>
                    )}

                    {tagline && <p className="text-xl text-foreground-muted italic mb-6">{tagline}</p>}

                    <div className="flex flex-wrap items-center gap-6 text-foreground-muted mb-8 text-sm md:text-base">
                        {year && (
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-foreground-subtle" aria-hidden="true" />
                                <span>{year}</span>
                            </div>
                        )}
                        {runtimeParts ? (
                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-foreground-subtle" aria-hidden="true" />
                                <span>
                                    {t('detail:runtimeHoursMinutes', {
                                        hours: runtimeParts.hours,
                                        minutes: runtimeParts.minutes
                                    })}
                                </span>
                            </div>
                        ) : null}

                        <RatingBadges
                            voteAverage={voteAverage}
                            imdbRating={imdbRating}
                            loadingImdb={loadingImdb}
                            showImdbRating={showImdbRating}
                            hasImdbId={hasImdbId}
                        />

                        {genres && genres.length > 0 && (
                            <div className="flex gap-2 flex-wrap">
                                {genres.map(genre => (
                                    <Badge key={genre} tone="muted" shape="rect">{genre}</Badge>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <StatusToggleButton
                                onClick={handleToggleFavorite}
                                active={favorited}
                                activeLabel={t('detail:removeFromFavorites')}
                                inactiveLabel={t('detail:addToFavorites')}
                            >
                                <Heart className={`w-5 h-5 ${favorited ? 'fill-danger text-danger' : 'text-foreground-muted'}`} aria-hidden="true" />
                            </StatusToggleButton>
                            <StatusToggleButton
                                onClick={handleToggleWatched}
                                active={watched}
                                activeLabel={t('detail:markAsUnwatched')}
                                inactiveLabel={t('detail:markAsWatched')}
                            >
                                <Check className={`w-5 h-5 ${watched ? 'text-success' : 'text-foreground-muted'}`} strokeWidth={3} aria-hidden="true" />
                            </StatusToggleButton>
                        </div>
                    </div>

                    <p className="text-lg text-foreground-muted leading-relaxed max-w-3xl mb-6">{overview}</p>

                    {externalLinks.length > 0 && (
                        <div className="flex flex-wrap gap-4 mb-10">
                            {externalLinks.map((link, index) => {
                                const labelKey = getExternalLinkLabelKey(link.label)

                                return (
                                    <button
                                        key={`${link.label}-${index}`}
                                        type="button"
                                        onClick={() => void window.electron.ipcRenderer.invoke('open-external', link.url)}
                                        className="text-foreground-muted hover:text-foreground transition-colors text-sm border-b border-transparent hover:border-border-strong"
                                    >
                                        {labelKey ? t(labelKey) : link.label}
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    {children}
                </div>
            </div>
        </div>
    )
}

interface StatusToggleButtonProps {
    onClick: () => void
    active: boolean
    activeLabel: string
    inactiveLabel: string
    children: React.ReactNode
}

function StatusToggleButton({ onClick, active, activeLabel, inactiveLabel, children }: StatusToggleButtonProps) {
    const label = active ? activeLabel : inactiveLabel
    return (
        <Tooltip label={label} side="top">
            <Button size="icon" variant="ghost" onClick={onClick} aria-label={label} aria-pressed={active}>
                {children}
            </Button>
        </Tooltip>
    )
}

interface RatingBadgesProps {
    voteAverage?: number
    imdbRating: ImdbRatingValue | null
    loadingImdb: boolean
    showImdbRating: boolean
    hasImdbId: boolean
}

export function RatingBadges({ voteAverage, imdbRating, loadingImdb, showImdbRating, hasImdbId }: RatingBadgesProps) {
    const { t } = useTranslation(['detail', 'common'])

    if (!voteAverage && !(imdbRating && showImdbRating)) return null

    return (
        <div className="flex gap-3">
            {voteAverage ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
                    <span className="text-tmdb font-bold text-sm">TMDB</span>
                    <span className="font-semibold">{voteAverage.toFixed(1)}</span>
                </div>
            ) : null}
            {imdbRating && showImdbRating ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
                    <span className="text-imdb font-bold text-sm">IMDb</span>
                    <span className="font-semibold">{imdbRating.rating.toFixed(1)}</span>
                    {imdbRating.votes ? <span className="text-xs text-foreground-muted">({formatVoteCount(imdbRating.votes)})</span> : null}
                </div>
            ) : null}
            {loadingImdb && !imdbRating && hasImdbId && showImdbRating ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
                    <span className="text-imdb font-bold text-sm">IMDb</span>
                    <span className="text-foreground-muted text-sm">{t('common:loading')}</span>
                </div>
            ) : null}
        </div>
    )
}

interface PersonChipsProps {
    label: string
    pluralLabel?: string
    people?: Person[]
}

export function PersonChips({ label, pluralLabel, people = [] }: PersonChipsProps) {
    if (people.length === 0) return null

    return (
        <div>
            <h3 className="text-sm font-bold text-foreground-muted uppercase tracking-wider mb-4">
                {people.length > 1 && pluralLabel ? pluralLabel : label}
            </h3>
            <div className="flex flex-wrap gap-4">
                {people.map((person, index) => (
                    <div key={`${person.name}-${index}`} className="flex items-center gap-3 bg-muted px-3 py-2 rounded-lg w-fit">
                        {person.profilePath ? (
                            <img
                                src={tmdbImage(person.profilePath, 'w185')}
                                alt=""
                                aria-hidden="true"
                                className="w-10 h-10 rounded-md object-cover"
                            />
                        ) : (
                            <div className="w-10 h-10 rounded-md bg-surface-raised flex items-center justify-center" aria-hidden="true">
                                <User className="w-5 h-5 text-foreground-muted" />
                            </div>
                        )}
                        <div className="overflow-hidden">
                            <p className="font-medium text-sm truncate">{person.name}</p>
                            {person.character ? <p className="text-xs text-foreground-muted truncate">{person.character}</p> : null}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

interface VideoFileListProps {
    files: VideoFile[]
    metadata: Record<string, VideoProbeMetadata | null>
    sourceNames: Record<string, string>
    playingFileId: string | null
    videoInfoOf: (metadata: VideoProbeMetadata | null) => string[]
    onPlay: (file: VideoFile) => void
}

export function VideoFileList({ files, metadata, sourceNames, playingFileId, videoInfoOf, onPlay }: VideoFileListProps) {
    const { t } = useTranslation(['detail', 'common'])
    const anyPlaying = playingFileId !== null

    if (files.length === 0) return null

    return (
        <div className="flex flex-col gap-3">
            {files.map(file => {
                const isPlaying = playingFileId === file.id
                const infoParts = videoInfoOf(metadata[file.id])
                const sourceName = sourceNames[file.sourceId]

                return (
                    <button
                        key={file.id}
                        type="button"
                        disabled={anyPlaying}
                        onClick={() => onPlay(file)}
                        aria-label={sourceName
                            ? t('detail:playFileFromSource', { name: file.name, source: sourceName })
                            : t('detail:playFile', { name: file.name })}
                        className={`flex items-center gap-4 rounded-lg border px-4 py-3.5 text-left transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            anyPlaying
                                ? (isPlaying
                                    ? 'cursor-default border-border-strong bg-accent-muted'
                                    : 'cursor-not-allowed opacity-45 border-border bg-surface')
                                : 'cursor-pointer border-border bg-surface hover:border-border-strong hover:bg-hover-bg'
                        }`}
                    >
                        <span className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center">
                            {anyPlaying && isPlaying ? (
                                <Spinner size="md" />
                            ) : (
                                <Play className="w-[18px] h-[18px] text-accent fill-accent ml-0.5" aria-hidden="true" />
                            )}
                        </span>
                        <span className="flex flex-col gap-1 flex-1 min-w-0 pr-2">
                            <span className="font-medium text-sm break-all">{file.name}</span>
                            {infoParts.length > 0 && (
                                <span className="flex flex-wrap items-center gap-1.5">
                                    {infoParts.map((part, index) => (
                                        <Badge
                                            key={`${file.id}-${index}-${part}`}
                                            tone="muted"
                                        >
                                            {part}
                                        </Badge>
                                    ))}
                                </span>
                            )}
                            <span className="text-foreground-muted text-xs truncate">
                                {sourceName || t('detail:unknownSource')}
                            </span>
                        </span>
                    </button>
                )
            })}
        </div>
    )
}

export function NotFoundPanel({ label, onBack }: { label: string, onBack: () => void }) {
    const { t } = useTranslation(['detail', 'common'])

    return (
        <div className="flex items-center justify-center h-screen">
            <EmptyState
                icon={ImageOff}
                title={label}
            >
                <Button variant="outline" onClick={onBack}>
                    {t('detail:backToLibrary')}
                </Button>
            </EmptyState>
        </div>
    )
}
