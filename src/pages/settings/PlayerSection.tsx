import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
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
                <h2 id="player-heading" className="text-xl font-semibold text-white">{t('settings:externalPlayerHeading')}</h2>
                {detecting && <span className="text-xs text-gray-500 animate-pulse">{t('settings:detectingPlayers')}</span>}
            </div>

            <div className="bg-neutral-800 rounded-xl overflow-hidden mb-3">
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
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-white/5 focus:outline-none focus-visible:bg-white/10 ${
                                selected ? 'bg-white/10' : ''
                            } ${player !== players[0] ? 'border-t border-neutral-700/60' : ''}`}
                        >
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                selected ? 'border-white bg-white' : 'border-neutral-500'
                            }`}>
                                {selected && <Check className="w-3 h-3 text-black" aria-hidden="true" />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className={`block text-sm font-medium ${selected ? 'text-white' : 'text-gray-300'}`}>{player.name}</span>
                                <span className="block text-xs text-gray-500 truncate">{player.path}</span>
                            </span>
                        </button>
                    )
                })}

                <div className={`flex items-center gap-3 px-4 py-3 ${players.length > 0 ? 'border-t border-neutral-700/60' : ''} ${usingCustom ? 'bg-white/10' : ''}`}>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={usingCustom}
                        aria-label={t('settings:useCustomPlayerAria')}
                        onClick={() => {
                            setCustomSelected(true)
                            void commitCustomPath()
                        }}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                            usingCustom ? 'border-white bg-white' : 'border-neutral-500'
                        }`}
                    >
                        {usingCustom && <Check className="w-3 h-3 text-black" aria-hidden="true" />}
                    </button>
                    <input
                        type="text"
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
                        className="flex-1 min-w-0 bg-white/5 border border-neutral-600 focus:border-white rounded-xl px-3 py-2 outline-none transition-all text-sm text-white"
                    />
                </div>
            </div>

            {isIinaApp(customPath) && (
                <p className="text-xs text-yellow-500 mt-2" role="status">
                    {t('settings:iinaCliHint')}
                </p>
            )}
        </section>
    )
}
