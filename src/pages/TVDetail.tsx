import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, Play } from 'lucide-react'
import type { Episode, TVShow as TVShowRecord, VideoFile } from '../../electron/db'
import {
    MediaDetailShell,
    NotFoundPanel,
    PersonChips
} from '../components/media/MediaDetailShell'
import Modal from '../components/ui/Modal'
import ListItemButton from '../components/ui/ListItemButton'
import Segmented from '../components/ui/Segmented'
import Card from '../components/ui/Card'
import { LoadingPanel } from '../components/ui/Feedback'
import { buildExternalLinks, defaultTvExternalLinks, normalizeExternalLinks } from '../utils/externalLinks'
import { tmdbImage } from '../utils/formatMediaInfo'
import { formatTvPlayTitle } from '../utils/playTitle'
import { useImdbRating } from '../hooks/useImdbRating'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { useMediaStatus } from '../contexts/MediaStatusContext'

export default function TVDetail() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { t } = useTranslation(['detail', 'common'])
    const { settings } = useSettings()
    const { showToast } = useToast()
    const { isWatched, toggleWatched } = useMediaStatus()

    const [show, setShow] = useState<TVShowRecord | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeSeason, setActiveSeason] = useState<number | null>(null)
    const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null)
    const [revealedEpisodes, setRevealedEpisodes] = useState<Set<number>>(new Set())
    const [playingEpisodeId, setPlayingEpisodeId] = useState<number | null>(null)

    const hideSpoilers = settings?.hideEpisodeSpoilers === true
    const showImdbRating = settings?.showImdbRating !== false
    const imdbId = show?.externalIds?.imdb_id
    const { rating: imdbRating, loading: loadingImdb } = useImdbRating(imdbId, showImdbRating)

    const externalLinkConfigs = useMemo(
        () => normalizeExternalLinks(settings?.tvExternalLinks, defaultTvExternalLinks),
        [settings?.tvExternalLinks]
    )

    const sourceNames = useMemo(
        () => Object.fromEntries((settings?.sources || []).map(source => [source.id, source.name])),
        [settings?.sources]
    )

    const externalLinks = useMemo(() => {
        if (!show) return []
        return buildExternalLinks(externalLinkConfigs, {
            tmdbId: show.id,
            imdbId: show.externalIds?.imdb_id,
            title: show.name
        })
    }, [externalLinkConfigs, show])

    const seasons = useMemo(
        () => [...(show?.seasons || [])].sort((a, b) => a.seasonNumber - b.seasonNumber),
        [show?.seasons]
    )

    const episodes = useMemo(() => {
        const current = seasons.find(season => season.seasonNumber === activeSeason)
        if (!current) return []

        const byNumber = new Map<number, Episode>()
        for (const episode of current.episodes) {
            if (!byNumber.has(episode.episodeNumber)) {
                byNumber.set(episode.episodeNumber, episode)
            }
        }
        return Array.from(byNumber.values()).sort((a, b) => a.episodeNumber - b.episodeNumber)
    }, [seasons, activeSeason])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // The version picker closes itself; Escape here only backs out of the page.
            if (event.key === 'Escape' && !selectedEpisode) {
                event.preventDefault()
                navigate('/')
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [navigate, selectedEpisode])

    useEffect(() => {
        if (!id) {
            setLoading(false)
            return
        }

        // Cancels state updates (and the redirect) that land after unmount.
        let active = true

        const fetchShow = async () => {
            try {
                const data = await window.electron.ipcRenderer.invoke('get-tv-show', parseInt(id))
                if (!active) return

                if (!data) {
                    console.warn(`TV show ${id} not found, redirecting to home`)
                    navigate('/')
                    return
                }

                setShow(data)
                const firstSeason = [...data.seasons].sort((a, b) => a.seasonNumber - b.seasonNumber)[0]
                if (firstSeason) setActiveSeason(firstSeason.seasonNumber)
            } catch (error) {
                console.error('Failed to fetch TV show:', error)
                if (active) navigate('/')
            } finally {
                if (active) setLoading(false)
            }
        }

        void fetchShow()

        return () => {
            active = false
        }
    }, [id, navigate])

    const playFile = useCallback(async (file: VideoFile, episode: Episode) => {
        if (!show) return
        setPlayingEpisodeId(episode.id)
        setSelectedEpisode(null)

        try {
            const result = await window.electron.ipcRenderer.invoke('play-video', {
                url: file.webdavUrl,
                title: formatTvPlayTitle(show.name, episode.seasonNumber, episode.episodeNumber, episode.name),
                history: {
                    mediaId: show.id,
                    mediaType: 'tv',
                    title: show.name,
                    posterPath: show.posterPath,
                    filePath: file.filePath,
                    seasonNumber: episode.seasonNumber,
                    episodeNumber: episode.episodeNumber,
                    episodeName: episode.name
                }
            })
            if (result?.autoMarked && !isWatched('tv', show.id)) {
                await toggleWatched('tv', show.id)
            }
        } catch (error) {
            showToast(error instanceof Error ? error.message : t('detail:playerLaunchFailed'), 'error')
        } finally {
            setPlayingEpisodeId(null)
        }
    }, [show, isWatched, toggleWatched, showToast, t])

    const handlePlayClick = (episode: Episode) => {
        if (episode.videoFiles.length === 0) return
        if (episode.videoFiles.length === 1) {
            void playFile(episode.videoFiles[0], episode)
            return
        }
        setSelectedEpisode(episode)
    }

    const toggleSpoiler = (episodeId: number) => {
        if (!hideSpoilers) return
        setRevealedEpisodes(prev => {
            const next = new Set(prev)
            if (next.has(episodeId)) next.delete(episodeId)
            else next.add(episodeId)
            return next
        })
    }

    if (loading) {
        return <LoadingPanel label={t('common:loading')} className="h-screen" />
    }

    if (!show) {
        return <NotFoundPanel label={t('detail:tvShowNotFound')} onBack={() => navigate('/')} />
    }

    const activeVersion = selectedEpisode

    return (
        <>
            <MediaDetailShell
                mediaType="tv"
                mediaId={show.id}
                title={show.name}
                overview={show.overview}
                logoPath={show.logoPath}
                backdropPath={show.backdropPath}
                year={show.firstAirDate?.split('-')[0]}
                genres={show.genres}
                voteAverage={show.voteAverage}
                imdbRating={imdbRating}
                loadingImdb={loadingImdb}
                showImdbRating={showImdbRating}
                hasImdbId={Boolean(imdbId)}
                preferTextTitle={settings?.preferTextTitle === true}
                externalLinks={externalLinks}
                onBack={() => navigate('/')}
                isMac={window.electron?.platform === 'darwin'}
            >
                <div className="flex flex-col gap-8 mb-10">
                    <PersonChips
                        label={t('detail:createdBy')}
                        people={show.createdBy?.map(creator => ({ name: creator.name, profilePath: creator.profilePath }))}
                    />
                    <PersonChips label={t('detail:topCast')} people={show.cast} />
                </div>
            </MediaDetailShell>

            <div className="container mx-auto px-8 -mt-12 relative z-20">
                <div className="py-2">
                    <Segmented
                        label={t('detail:seasons')}
                        value={activeSeason}
                        options={seasons.map(season => ({ value: season.seasonNumber, label: season.name }))}
                        onChange={setActiveSeason}
                    />
                </div>

                {episodes.length > 0 && (
                    <div className="space-y-4 pb-20">
                        {episodes.map(episode => {
                            const revealed = !hideSpoilers || revealedEpisodes.has(episode.id)
                            const playLabel = episode.name
                                ? t('detail:playSeasonEpisodeNamed', {
                                    seasonNumber: episode.seasonNumber,
                                    episodeNumber: episode.episodeNumber,
                                    name: episode.name
                                })
                                : t('detail:playSeasonEpisode', {
                                    seasonNumber: episode.seasonNumber,
                                    episodeNumber: episode.episodeNumber
                                })

                            return (
                                <Card
                                    key={`${episode.seasonNumber}-${episode.episodeNumber}`}
                                    interactive
                                    padded
                                    className="flex flex-col md:flex-row gap-6"
                                >
                                    <div className="group md:w-56 flex-shrink-0 relative aspect-video rounded-lg overflow-hidden bg-background">
                                        {episode.stillPath ? (
                                            <img
                                                src={tmdbImage(episode.stillPath, 'w780')}
                                                alt=""
                                                aria-hidden="true"
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-foreground-faint gap-2" aria-hidden="true">
                                                <div className="w-8 h-8 rounded-full border-2 border-current flex items-center justify-center opacity-50">
                                                    <span className="text-xs font-bold">TV</span>
                                                </div>
                                            </div>
                                        )}

                                        <div className="absolute bottom-3 left-3 px-2 py-1 bg-black/60 rounded-md text-xs font-bold text-white">
                                            {t('detail:episodeBadge', { episodeNumber: episode.episodeNumber })}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handlePlayClick(episode)}
                                            disabled={playingEpisodeId !== null || episode.videoFiles.length === 0}
                                            aria-label={playLabel}
                                            className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-150 disabled:opacity-100"
                                        >
                                            <span className="transform scale-75 group-hover:scale-100 transition-transform">
                                                {playingEpisodeId === episode.id ? (
                                                    <Loader2 className="w-12 h-12 text-white animate-spin" aria-hidden="true" />
                                                ) : (
                                                    <Play className="w-12 h-12 text-white fill-white" aria-hidden="true" />
                                                )}
                                            </span>
                                        </button>
                                    </div>

                                    <div className="flex-1 py-1 min-w-0 flex flex-col justify-center">
                                        <h3 className="text-lg font-bold mb-2 truncate pr-4">{episode.name}</h3>
                                        <button
                                            type="button"
                                            onClick={() => toggleSpoiler(episode.id)}
                                            disabled={!hideSpoilers}
                                            aria-expanded={revealed}
                                            aria-label={revealed ? undefined : t('detail:revealEpisodeSynopsis')}
                                            className={`text-left text-foreground-muted text-sm leading-relaxed line-clamp-3 ${
                                                hideSpoilers && !revealed ? 'blur-sm cursor-pointer select-none hover:blur-none transition-all' : ''
                                            }`}
                                        >
                                            {episode.overview || t('detail:noEpisodeOverview')}
                                        </button>
                                    </div>
                                </Card>
                            )
                        })}
                    </div>
                )}
            </div>

            {activeVersion && activeVersion.videoFiles.length > 1 && (
                <Modal
                    title={t('detail:selectVersion')}
                    onClose={() => setSelectedEpisode(null)}
                    size="lg"
                    description={t('detail:seasonEpisode', {
                        seasonNumber: activeVersion.seasonNumber,
                        episodeNumber: activeVersion.episodeNumber
                    })}
                >
                    <div className="space-y-3">
                        {activeVersion.videoFiles.map(file => (
                            <ListItemButton
                                key={file.id}
                                icon={<Play className="w-5 h-5" aria-hidden="true" />}
                                title={file.name}
                                meta={sourceNames[file.sourceId] || t('common:unknown')}
                                onClick={() => void playFile(file, activeVersion)}
                            />
                        ))}
                    </div>
                </Modal>
            )}
        </>
    )
}
