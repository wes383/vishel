import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import SourcesSection from './settings/SourcesSection'
import PlayerSection from './settings/PlayerSection'
import GeneralSection from './settings/GeneralSection'
import LinksSection from './settings/LinksSection'
import UpdateSection from './settings/UpdateSection'
import { useSettings } from '../contexts/SettingsContext'
import TMDBLogo from '../assets/TMDB_logo.svg'

export default function SettingsPage() {
    const navigate = useNavigate()
    const { t } = useTranslation(['settings', 'common'])
    const { ready } = useSettings()
    const [appVersion, setAppVersion] = useState('')

    useEffect(() => {
        let active = true

        window.electron.ipcRenderer.invoke('get-app-version')
            .then(version => {
                if (active) setAppVersion(version)
            })
            .catch(error => console.error('Failed to read the app version:', error))

        return () => {
            active = false
        }
    }, [])

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement
            const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
            if (event.key === 'Escape' && !isTyping) {
                event.preventDefault()
                navigate('/')
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [navigate])

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-3xl font-bold">{t('settings:heading')}</h1>
                <button
                    type="button"
                    onClick={() => navigate('/')}
                    aria-label={t('settings:closeSettingsAria')}
                    className="p-2 hover:bg-hover-bg rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <X className="w-6 h-6" aria-hidden="true" />
                </button>
            </div>

            {!ready ? (
                <p className="text-foreground-muted" role="status">{t('settings:loadingSettings')}</p>
            ) : (
                <div className="space-y-8">
                    <SourcesSection />

                    <hr className="border-border" />

                    <PlayerSection />

                    <hr className="border-border" />

                    <GeneralSection />

                    <LinksSection />

                    <hr className="border-border" />

                    <p className="text-xs text-foreground-muted text-center -mt-2">
                        {t('settings:shortcutsHint')}
                    </p>

                    <section className="flex flex-col items-center justify-center gap-1 -mt-2 pt-0 pb-6" aria-label={t('settings:attributionAria')}>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void window.electron.ipcRenderer.invoke('open-external', 'https://www.themoviedb.org')}
                                aria-label={t('settings:openTmdbSiteAria')}
                                className="hover:brightness-125 transition-all"
                            >
                                <img src={TMDBLogo} alt={t('settings:tmdbLogoAlt')} className="h-4 w-auto" />
                            </button>
                            <p className="text-xs text-foreground-muted">
                                {t('settings:tmdbAttribution')}
                            </p>
                        </div>
                        <UpdateSection version={appVersion} />
                    </section>
                </div>
            )}
        </div>
    )
}
