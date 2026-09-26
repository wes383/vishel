import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import { RadioIndicator } from '../../components/ui/Choice'
import type { DetectedPlayer } from '../../../electron/playerDetector'

const isIinaApp = (path: string) =>
    path.toLowerCase().includes('iina.app') && !path.toLowerCase().includes('iina-cli')

/** Player detection and selection. Saving is explicit: focusing the free-text path no longer persists. */
export default function PlayerSection() {
    const { t } = useTranslation(['settings', 'common'])
    const { settings, save, ready } = useSettings()
    const { showToast } = useToast()

    const [players, setPlayers] = useState<DetectedPlayer[]>([])
    const [detecting, setDetecting] = useState(false)
    const [customPath, setCustomPath] = useState('')
    const [customSelected, setCustomSelected] = useState(false)

    useEffect(() => {
        if (!ready || !settings) return

        let active = true
        setDetecting(true)

        window.electron.ipcRenderer.invoke('detect-players')
            .then(detected => {
                if (!active) return
                const list = detected || []
                setPlayers(list)

                const storedCustom = settings.customPlayerPath || ''
                const storedPlayer = settings.playerPath || ''

                if (storedCustom) {
                    setCustomPath(storedCustom)
                    setCustomSelected(!list.some(player => player.path === storedPlayer))
                } else if (storedPlayer && !list.some(player => player.path === storedPlayer)) {
                    // The saved player is gone: show its path as custom so the user can re-point it.
                    setCustomPath(storedPlayer)
                    setCustomSelected(true)
                }
            })
            .catch(error => {
                console.error('Failed to detect players:', error)
            })
            .finally(() => {
                if (active) setDetecting(false)
            })

        return () => {
            active = false
        }
    }, [ready, settings])

    const selectPlayer = async (path: string) => {
        const ok = await save({ playerPath: path })
        if (!ok) showToast(t('settings:playerSelectionSaveError'), 'error')
    }

    const commitCustomPath = async () => {
        const trimmed = customPath.trim()
        if (!trimmed) return
        if (trimmed === settings?.playerPath && trimmed === settings?.customPlayerPath) return

        const ok = await save({ playerPath: trimmed, customPlayerPath: trimmed })
        if (!ok) showToast(t('settings:playerPathSaveError'), 'error')
    }

    const usingCustom = !settings?.playerPath || customSelected || !players.some(player => player.path === settings?.playerPath)

    return (
        <section aria-labelledby="player-heading">
            <div className="flex items-center justify-between mb-2">
                <h2 id="player-heading" className="text-xl font-semibold">{t('settings:externalPlayerHeading')}</h2>
                {detecting && <span className="text-xs text-foreground-muted animate-pulse">{t('settings:detectingPlayers')}</span>}
            </div>

            <Card className="overflow-hidden mb-3">
                {players.map(player => {
                    const selected = !customSelected && settings?.playerPath === player.path
                    return (
                        <button
                            key={player.path}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                                setCustomSelected(false)
                                void selectPlayer(player.path)
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-hover-bg focus:outline-none focus-visible:bg-hover-bg-strong ${
                                selected ? 'bg-accent-muted' : ''
                            } ${player !== players[0] ? 'border-t border-border' : ''}`}
                        >
                            <RadioIndicator checked={selected} />
                            <span className="min-w-0 flex-1">
                                <span className={`block text-sm font-medium ${selected ? 'text-foreground' : 'text-foreground-muted'}`}>{player.name}</span>
                                <span className="block text-xs text-foreground-muted truncate">{player.path}</span>
                            </span>
                        </button>
                    )
                })}

                <div className={`flex items-center gap-3 px-4 py-3 ${players.length > 0 ? 'border-t border-border' : ''} ${usingCustom ? 'bg-accent-muted' : ''}`}>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={usingCustom}
                        aria-label={t('settings:useCustomPlayerAria')}
                        onClick={() => {
                            setCustomSelected(true)
                            void commitCustomPath()
                        }}
                        className="flex-shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <RadioIndicator checked={usingCustom} />
                    </button>
                    <Input
                        type="text"
                        size="md"
                        className="flex-1"
                        value={customPath}
                        onFocus={() => setCustomSelected(true)}
                        onChange={event => setCustomPath(event.target.value)}
                        onBlur={() => void commitCustomPath()}
                        onKeyDown={event => {
                            if (event.key === 'Enter') {
                                event.preventDefault()
                                void commitCustomPath()
                            }
                        }}
                        spellCheck={false}
                        aria-label={t('settings:customPlayerPathAria')}
                        placeholder={t('settings:customPlayerPathPlaceholder')}
                    />
                </div>
            </Card>

            {isIinaApp(customPath) && (
                <p className="text-xs text-warning mt-2" role="status">
                    {t('settings:iinaCliHint')}
                </p>
            )}
        </section>
    )
}
