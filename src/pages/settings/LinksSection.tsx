import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { defaultMovieExternalLinks, defaultTvExternalLinks, normalizeExternalLinks } from '../../utils/externalLinks'
import type { ExternalLinkConfig } from '../../../electron/store'
import type { RendererSettingsPatch } from '../../../electron/settings'

type LinksKey = 'movieExternalLinks' | 'tvExternalLinks'

const INPUT_CLASSES = 'bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-white transition-colors min-w-0'

export default function LinksSection() {
    const { t } = useTranslation(['settings', 'common'])
    const { settings, save } = useSettings()
    const { showToast } = useToast()

    const [movieLinks, setMovieLinks] = useState<ExternalLinkConfig[]>([])
    const [tvLinks, setTvLinks] = useState<ExternalLinkConfig[]>([])

    useEffect(() => {
        if (!settings) return
        setMovieLinks(normalizeExternalLinks(settings.movieExternalLinks, defaultMovieExternalLinks))
        setTvLinks(normalizeExternalLinks(settings.tvExternalLinks, defaultTvExternalLinks))
    }, [settings])

    const setters: Record<LinksKey, React.Dispatch<React.SetStateAction<ExternalLinkConfig[]>>> = {
        movieExternalLinks: setMovieLinks,
        tvExternalLinks: setTvLinks
    }

    const current: Record<LinksKey, ExternalLinkConfig[]> = { movieExternalLinks: movieLinks, tvExternalLinks: tvLinks }

    const patchFor = (key: LinksKey, next: ExternalLinkConfig[]): RendererSettingsPatch =>
        key === 'movieExternalLinks' ? { movieExternalLinks: next } : { tvExternalLinks: next }

    const persist = async (key: LinksKey, next: ExternalLinkConfig[]) => {
        setters[key](next)
        const ok = await save(patchFor(key, next))
        if (!ok) showToast(t('settings:linksSaveError'), 'error')
    }

    const updateLink = (key: LinksKey, index: number, field: keyof ExternalLinkConfig, value: string) => {
        setters[key](prev => prev.map((link, position) => (position === index ? { ...link, [field]: value } : link)))
    }

    const addLink = (key: LinksKey) => {
        void persist(key, [...current[key], { label: '', template: 'https://' }])
    }

    const removeLink = (key: LinksKey, index: number) => {
        void persist(key, current[key].filter((_, position) => position !== index))
    }

    const moveLink = (key: LinksKey, index: number, direction: 'up' | 'down') => {
        const target = direction === 'up' ? index - 1 : index + 1
        const links = current[key]
        if (target < 0 || target >= links.length) return

        const next = [...links]
        next[index] = links[target]
        next[target] = links[index]
        void persist(key, next)
    }

    const resetToDefaults = async () => {
        await save({
            movieExternalLinks: defaultMovieExternalLinks.map(link => ({ ...link })),
            tvExternalLinks: defaultTvExternalLinks.map(link => ({ ...link }))
        })
        setMovieLinks(defaultMovieExternalLinks.map(link => ({ ...link })))
        setTvLinks(defaultTvExternalLinks.map(link => ({ ...link })))
        showToast(t('settings:linksRestoredToast'), 'success')
    }

    const groups: { key: LinksKey; title: string; links: ExternalLinkConfig[] }[] = [
        { key: 'movieExternalLinks', title: t('settings:movieExternalLinksTitle'), links: movieLinks },
        { key: 'tvExternalLinks', title: t('settings:tvExternalLinksTitle'), links: tvLinks }
    ]

    return (
        <section aria-labelledby="links-heading">
            <h2 id="links-heading" className="sr-only">{t('settings:externalLinksHeading')}</h2>
            <div className="bg-neutral-800 p-4 rounded-lg space-y-5">
                {groups.map(group => (
                    <div key={group.key}>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-medium">{group.title}</h3>
                            <button
                                type="button"
                                onClick={() => addLink(group.key)}
                                className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                                {t('common:add')}
                            </button>
                        </div>
                        <div className="space-y-2">
                            {group.links.map((link, index) => (
                                <div key={`${group.key}-${index}`} className="grid grid-cols-[1fr_2fr_auto] gap-2 min-w-0">
                                    <input
                                        type="text"
                                        value={link.label}
                                        onChange={event => updateLink(group.key, index, 'label', event.target.value)}
                                        onBlur={() => void persist(group.key, group.links)}
                                        aria-label={t('settings:linkLabelAria', { title: group.title, number: index + 1 })}
                                        className={INPUT_CLASSES}
                                    />
                                    <input
                                        type="text"
                                        value={link.template}
                                        onChange={event => updateLink(group.key, index, 'template', event.target.value)}
                                        onBlur={() => void persist(group.key, group.links)}
                                        spellCheck={false}
                                        aria-label={t('settings:linkTemplateAria', { title: group.title, number: index + 1 })}
                                        className={INPUT_CLASSES}
                                    />
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => moveLink(group.key, index, 'up')}
                                            disabled={index === 0}
                                            aria-label={t('settings:moveLinkUpAria', { title: group.title, number: index + 1 })}
                                            className="px-2.5 py-2 rounded-lg border border-neutral-700 hover:border-white/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <ChevronUp className="w-4 h-4" aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => moveLink(group.key, index, 'down')}
                                            disabled={index === group.links.length - 1}
                                            aria-label={t('settings:moveLinkDownAria', { title: group.title, number: index + 1 })}
                                            className="px-2.5 py-2 rounded-lg border border-neutral-700 hover:border-white/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <ChevronDown className="w-4 h-4" aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => removeLink(group.key, index)}
                                            aria-label={t('settings:removeLinkAria', { title: group.title, number: index + 1 })}
                                            className="px-2.5 py-2 rounded-lg border border-neutral-700 hover:border-red-500/60 hover:text-red-400 transition-colors"
                                        >
                                            <X className="w-4 h-4" aria-hidden="true" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500">
                <p>
                    {t('settings:supportedPlaceholders')}
                </p>
                <span aria-hidden="true">·</span>
                <button type="button" onClick={() => void resetToDefaults()} className="text-xs text-gray-500 hover:underline transition-colors">
                    {t('settings:restoreDefaults')}
                </button>
            </div>
        </section>
    )
}
