import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import type { Movie as MovieRecord, VideoFile } from '../../electron/db'
import {
    MediaDetailShell,
    NotFoundPanel,
    PersonChips,
    VideoFileList
} from '../components/media/MediaDetailShell'
import { buildExternalLinks, defaultMovieExternalLinks, normalizeExternalLinks } from '../utils/externalLinks'
import { formatVideoInfo } from '../utils/formatMediaInfo'
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
            if (event.key === 'Escape') {
                event.preventDefault()
                navigate('/')
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [navigate])

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

    if (loading) {
        return <div className="flex items-center justify-center h-screen text-gray-400">{t('common:loading')}</div>
    }

    if (!movie) {
        return <NotFoundPanel label={t('detail:movieNotFound')} onBack={() => navigate('/')} />
    }

    const directors = movie.director?.map(director => ({ name: director.name, profilePath: director.profilePath })) ?? []

    return (
        <MediaDetailShell
            mediaType="movie"
            mediaId={movie.id}
            title={movie.title}
            overview={movie.overview}
            logoPath={movie.logoPath}
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
    )
}
