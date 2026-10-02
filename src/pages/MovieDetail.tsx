import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import type { Movie as MovieRecord, VideoFile } from '../../electron/db'
import {
    MediaDetailShell,
    NotFoundPanel,
    PersonChips,
    VideoFileList
} from '../components/media/MediaDetailShell'
import Modal from '../components/ui/Modal'
import ListItemButton from '../components/ui/ListItemButton'
import Button from '../components/ui/Button'
import { LoadingPanel, Spinner } from '../components/ui/Feedback'
import { buildExternalLinks, defaultMovieExternalLinks, normalizeExternalLinks } from '../utils/externalLinks'
import { displayLogo, formatVideoInfo } from '../utils/formatMediaInfo'
import { formatMoviePlayTitle } from '../utils/playTitle'
import { useImdbRating } from '../hooks/useImdbRating'
import { useVideoProbeMetadata } from '../hooks/useVideoProbeMetadata'
import { useSettings } from '../contexts/SettingsContext'
import { useToast } from '../contexts/ToastContext'
import { useMediaStatus } from '../contexts/MediaStatusContext'

export default function MovieDetail() {
    const isMac = window.electron?.platform === 'darwin'
    const { id } = useParams()
    const navigate = useNavigate()
    const { t } = useTranslation(['detail', 'common'])
    const { settings } = useSettings()
    const { showToast } = useToast()
    const { isWatched, toggleWatched } = useMediaStatus()

    const [movie, setMovie] = useState<MovieRecord | null>(null)
    const [loading, setLoading] = useState(true)
    const [playingFileId, setPlayingFileId] = useState<string | null>(null)
    const [showFilePicker, setShowFilePicker] = useState(false)

    const showImdbRating = settings?.showImdbRating !== false
    const imdbId = movie?.externalIds?.imdb_id
    const { rating: imdbRating, loading: loadingImdb } = useImdbRating(imdbId, showImdbRating)

    const videoFiles = useMemo(() => movie?.videoFiles || [], [movie])
    const videoMetadata = useVideoProbeMetadata(videoFiles, settings?.probeVideoMetadataEnabled !== false)

    const externalLinkConfigs = useMemo(
        () => normalizeExternalLinks(settings?.movieExternalLinks, defaultMovieExternalLinks),
        [settings?.movieExternalLinks]
    )

    const sourceNames = useMemo(
        () => Object.fromEntries((settings?.sources || []).map(source => [source.id, source.name])),
        [settings?.sources]
    )

    const externalLinks = useMemo(() => {
        if (!movie) return []
        return buildExternalLinks(externalLinkConfigs, {
            tmdbId: movie.id,
            imdbId: movie.externalIds?.imdb_id,
            title: movie.title
        })
    }, [externalLinkConfigs, movie])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // The version picker closes itself; Escape here only backs out of the page.
            if (event.key === 'Escape' && !showFilePicker) {
                event.preventDefault()
                navigate('/')
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [navigate, showFilePicker])

    useEffect(() => {
        if (!id) {
            setLoading(false)
            return
        }

        // Guards against setting state (or redirecting) after the page unmounted.
        let active = true

        const fetchMovie = async () => {
            try {
                const data = await window.electron.ipcRenderer.invoke('get-movie', parseInt(id))
                if (!active) return

                if (!data) {
                    console.warn(`Movie ${id} not found, redirecting to home`)
                    navigate('/')
                    return
                }
                setMovie(data)
            } catch (error) {
                console.error('Failed to fetch movie:', error)
                if (active) navigate('/')
            } finally {
                if (active) setLoading(false)
            }
        }

        void fetchMovie()

        return () => {
            active = false
        }
    }, [id, navigate])

    const playVideo = useCallback(async (file: VideoFile) => {
        if (!movie) return
        setPlayingFileId(file.id)
        try {
            const result = await window.electron.ipcRenderer.invoke('play-video', {
                url: file.webdavUrl,
                title: formatMoviePlayTitle(movie.title),
                history: {
                    mediaId: movie.id,
                    mediaType: 'movie',
                    title: movie.title,
                    posterPath: movie.posterPath,
                    posterPathEn: movie.posterPathEn,
                    filePath: file.filePath
                }
            })
            if (result?.autoMarked && !isWatched('movie', movie.id)) {
                await toggleWatched('movie', movie.id)
            }
        } catch (error) {
            showToast(error instanceof Error ? error.message : t('detail:playerLaunchFailed'), 'error')
        } finally {
            setPlayingFileId(null)
        }
    }, [movie, isWatched, toggleWatched, showToast, t])

    const handlePlayClick = useCallback(() => {
        if (playingFileId !== null) return
        if (videoFiles.length === 1) {
            void playVideo(videoFiles[0])
            return
        }
        setShowFilePicker(true)
    }, [playingFileId, videoFiles, playVideo])

    if (loading) {
        return <LoadingPanel label={t('common:loading')} className="h-screen" />
    }

    if (!movie) {
        return <NotFoundPanel label={t('detail:movieNotFound')} onBack={() => navigate('/')} />
    }

    const directors = movie.director?.map(director => ({ name: director.name, profilePath: director.profilePath })) ?? []

    return (
        <>
            <MediaDetailShell
                mediaType="movie"
                mediaId={movie.id}
                title={movie.title}
                overview={movie.overview}
                logoPath={displayLogo(movie, settings)}
                backdropPath={movie.backdropPath}
                tagline={movie.tagline}
                year={movie.releaseDate?.split('-')[0]}
                runtime={movie.runtime}
                genres={movie.genres}
                voteAverage={movie.voteAverage}
                imdbRating={imdbRating}
                loadingImdb={loadingImdb}
                showImdbRating={showImdbRating}
                hasImdbId={Boolean(imdbId)}
                preferTextTitle={settings?.preferTextTitle === true}
                externalLinks={externalLinks}
                onBack={() => navigate('/')}
                isMac={isMac}
                primaryAction={videoFiles.length > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handlePlayClick}
                        aria-busy={playingFileId !== null || undefined}
                        className={playingFileId !== null ? 'cursor-default' : undefined}
                    >
                        {playingFileId !== null ? (
                            <Spinner size="sm" />
                        ) : (
                            <Play className="w-4 h-4 fill-current text-foreground-muted" aria-hidden="true" />
                        )}
                        <span className="text-foreground-muted">{t('common:play')}</span>
                    </Button>
                )}
            >
                <div className="flex flex-col gap-8 mb-10">
                    <PersonChips
                        label={t('detail:director', { count: directors.length })}
                        people={directors}
                    />
                    <PersonChips label={t('detail:topCast')} people={movie.cast} />
                </div>

                <VideoFileList
                    files={videoFiles}
                    metadata={videoMetadata}
                    sourceNames={sourceNames}
                    playingFileId={playingFileId}
                    videoInfoOf={formatVideoInfo}
                    onPlay={playVideo}
                />
            </MediaDetailShell>

            {showFilePicker && (
                <Modal
                    title={t('detail:selectVersion')}
                    onClose={() => setShowFilePicker(false)}
                    size="lg"
                    description={formatMoviePlayTitle(movie.title)}
                >
                    <div className="space-y-3">
                        {videoFiles.map(file => (
                            <ListItemButton
                                key={file.id}
                                icon={<Play className="w-5 h-5" aria-hidden="true" />}
                                title={file.name}
                                meta={file.filePath}
                                onClick={() => {
                                    void playVideo(file)
                                    setShowFilePicker(false)
                                }}
                            />
                        ))}
                    </div>
                </Modal>
            )}
        </>
    )
}
