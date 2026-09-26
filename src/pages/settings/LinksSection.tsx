import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Pencil, Plus, X } from 'lucide-react'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import { defaultMovieExternalLinks, defaultTvExternalLinks, normalizeExternalLinks } from '../../utils/externalLinks'
import type { ExternalLinkConfig } from '../../../electron/store'
import type { RendererSettingsPatch } from '../../../electron/settings'

type LinksKey = 'movieExternalLinks' | 'tvExternalLinks'

export default function LinksSection() {
    const { t } = useTranslation(['settings', 'common'])
    const { settings, save } = useSettings()
    const { showToast } = useToast()

    const [movieLinks, setMovieLinks] = useState<ExternalLinkConfig[]>([])
    const [tvLinks, setTvLinks] = useState<ExternalLinkConfig[]>([])
    const [editing, setEditing] = useState(false)

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
            <div className="flex items-center justify-between mb-4">
                <h2 id="links-heading" className="text-xl font-semibold">{t('settings:externalLinksHeading')}</h2>
                <Button size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                    {t('common:edit')}
                </Button>
            </div>

            <Card padded className="space-y-4">
                {groups.map(group => (
                    <div key={group.key}>
                        <h3 className="text-sm font-medium text-foreground-muted mb-2">{group.title}</h3>
                        {group.links.length === 0 ? (
                            <p className="text-sm text-foreground-muted">{t('common:none')}</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {group.links.map((link, index) => (
                                    <Badge key={`${group.key}-${index}`} tone="muted">
                                        {link.label || link.template}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </Card>

            {editing && (
                <Modal
                    title={t('settings:externalLinksHeading')}
                    onClose={() => setEditing(false)}
                    size="lg"
                    footer={(
                        <div className="flex items-center justify-between gap-3">
                            <Button variant="ghost" onClick={() => void resetToDefaults()}>
                                {t('settings:restoreDefaults')}
                            </Button>
                            <Button onClick={() => setEditing(false)}>{t('common:close')}</Button>
                        </div>
                    )}
                >
                    <div className="flex flex-col gap-6">
                        {groups.map(group => (
                            <div key={group.key}>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-medium">{group.title}</h3>
                                    <Button size="sm" variant="subtle" onClick={() => addLink(group.key)}>
                                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                                        {t('common:add')}
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {group.links.map((link, index) => (
                                        <div key={`${group.key}-${index}`} className="grid grid-cols-[1fr_2fr_auto] gap-2 min-w-0 items-start">
                                            <Input
                                                type="text"
                                                size="md"
                                                value={link.label}
                                                onChange={event => updateLink(group.key, index, 'label', event.target.value)}
                                                onBlur={() => void persist(group.key, group.links)}
                                                aria-label={t('settings:linkLabelAria', { title: group.title, number: index + 1 })}
                                            />
                                            <Input
                                                type="text"
                                                size="md"
                                                value={link.template}
                                                onChange={event => updateLink(group.key, index, 'template', event.target.value)}
                                                onBlur={() => void persist(group.key, group.links)}
                                                spellCheck={false}
                                                aria-label={t('settings:linkTemplateAria', { title: group.title, number: index + 1 })}
                                            />
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    size="icon"
                                                    variant="outline"
                                                    onClick={() => moveLink(group.key, index, 'up')}
                                                    disabled={index === 0}
                                                    aria-label={t('settings:moveLinkUpAria', { title: group.title, number: index + 1 })}
                                                >
                                                    <ChevronUp className="w-4 h-4" aria-hidden="true" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="outline"
                                                    onClick={() => moveLink(group.key, index, 'down')}
                                                    disabled={index === group.links.length - 1}
                                                    aria-label={t('settings:moveLinkDownAria', { title: group.title, number: index + 1 })}
                                                >
                                                    <ChevronDown className="w-4 h-4" aria-hidden="true" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="outline"
                                                    tone="danger"
                                                    onClick={() => removeLink(group.key, index)}
                                                    aria-label={t('settings:removeLinkAria', { title: group.title, number: index + 1 })}
                                                >
                                                    <X className="w-4 h-4" aria-hidden="true" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        <p className="text-xs text-foreground-muted">{t('settings:supportedPlaceholders')}</p>
                    </div>
                </Modal>
            )}
        </section>
    )
}
