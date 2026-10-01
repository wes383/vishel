import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import SettingRow from '../../components/ui/SettingRow'
import { InfoHint } from '../../components/ui/Tooltip'
import Segmented from '../../components/ui/Segmented'
import Toggle from '../../components/ui/Toggle'
import Input from '../../components/ui/Input'
import { Field } from '../../components/ui/Field'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import type { RendererSettings } from '../../../electron/settings'

const POSTER_TITLE_MODES = [
    { value: 'hover', labelKey: 'posterTitleHover' },
    { value: 'below', labelKey: 'posterTitleBelow' },
    { value: 'hidden', labelKey: 'posterTitleHidden' }
] as const

const POSTER_SIZES = [
    { value: 'small', labelKey: 'posterSizeSmall' },
    { value: 'medium', labelKey: 'posterSizeMedium' },
    { value: 'large', labelKey: 'posterSizeLarge' }
] as const

/** Language names stay in their own language, which is why these are not translation keys. */
const LANGUAGES = [
    { value: 'en', label: 'English' },
    { value: 'zh', label: '简体中文' }
] as const

function Group({ heading, children }: { heading: string; children: ReactNode }) {
    return (
        <div className="space-y-4" role="group" aria-label={heading}>
            <h3 className="text-sm font-bold text-foreground-muted uppercase tracking-wider">{heading}</h3>
            {children}
        </div>
    )
}

export default function GeneralSection() {
    const { t } = useTranslation(['settings', 'common'])
    const { settings, save } = useSettings()
    const { showToast } = useToast()

    const [apiKey, setApiKey] = useState('')

    useEffect(() => {
        setApiKey(settings?.tmdbApiKey || '')
    }, [settings?.tmdbApiKey])

    const commit = async (patch: Partial<RendererSettings>, failure: string) => {
        const ok = await save(patch)
        if (!ok) showToast(failure, 'error')
    }

    const handleApiKeyBlur = () => {
        const trimmed = apiKey.trim()
        // The provider returns a masked key; sending it back unchanged must be a no-op.
        if (trimmed === settings?.tmdbApiKey) return
        void commit({ tmdbApiKey: trimmed }, t('settings:tmdbApiKeySaveError'))
    }

    return (
        <section className="space-y-6" aria-labelledby="general-heading">
            <h2 id="general-heading" className="text-xl font-semibold -mt-[5px]">{t('settings:generalHeading')}</h2>

            <Group heading={t('settings:metadataGroupHeading')}>
                <Field id="tmdb-api-key" label={t('settings:tmdbApiKeyLabel')} hint={t('settings:tmdbApiKeyHint')}>
                    <Input
                        id="tmdb-api-key"
                        type="text"
                        size="md"
                        value={apiKey}
                        onChange={event => setApiKey(event.target.value)}
                        onBlur={handleApiKeyBlur}
                        spellCheck={false}
                        autoComplete="off"
                        aria-describedby="tmdb-api-key-hint"
                    />
                </Field>

                <SettingRow
                    title={t('settings:languageTitle')}
                    description={t('settings:languageRescanHint', {
                        language: LANGUAGES.find(option => option.value === settings?.language)?.label ?? ''
                    })}
                    control={(
                        <Segmented
                            label={t('settings:languageAria')}
                            value={settings?.language || 'en'}
                            options={LANGUAGES}
                            onChange={value => void commit({ language: value }, t('settings:settingSaveError'))}
                        />
                    )}
                />

                <SettingRow
                    title={t('settings:probeMetadataTitle')}
                    description={(
                        <>
                            {t('settings:probeMetadataDescription')}
                            <InfoHint text={t('settings:probeMetadataHint')} />
                        </>
                    )}
                    control={(
                        <Toggle
                            label={t('settings:probeMetadataAria')}
                            checked={settings?.probeVideoMetadataEnabled !== false}
                            onChange={value => void commit({ probeVideoMetadataEnabled: value }, t('settings:settingSaveError'))}
                        />
                    )}
                />
            </Group>

            <Group heading={t('settings:appearanceGroupHeading')}>
                {settings?.language === 'zh' && (
                    <SettingRow
                        title={t('settings:preferEnglishLogoTitle')}
                        description={t('settings:preferEnglishLogoDescription')}
                        control={(
                            <Toggle
                                label={t('settings:preferEnglishLogoAria')}
                                // Undefined means "never touched", which is the English-preferring default.
                                checked={settings?.preferEnglishLogo !== false}
                                onChange={value => void commit({ preferEnglishLogo: value }, t('settings:settingSaveError'))}
                            />
                        )}
                    />
                )}

                <SettingRow
                    title={t('settings:preferTextTitleTitle')}
                    description={t('settings:preferTextTitleDescription')}
                    control={(
                        <Toggle
                            label={t('settings:preferTextTitleAria')}
                            checked={settings?.preferTextTitle === true}
                            onChange={value => void commit({ preferTextTitle: value }, t('settings:settingSaveError'))}
                        />
                    )}
                />

                <SettingRow
                    title={t('settings:posterTitleDisplayTitle')}
                    description={t('settings:posterTitleDisplayDescription')}
                    control={(
                        <Segmented
                            label={t('settings:posterTitleDisplayAria')}
                            value={settings?.posterTitleMode || 'hover'}
                            options={POSTER_TITLE_MODES.map(option => ({ value: option.value, label: t(`settings:${option.labelKey}`) }))}
                            onChange={value => void commit({
                                posterTitleMode: value,
                                showTitlesOnPosters: value === 'below'
                            }, t('settings:settingSaveError'))}
                        />
                    )}
                />

                <SettingRow
                    title={t('settings:posterSizeTitle')}
                    description={t('settings:posterSizeDescription')}
                    control={(
                        <Segmented
                            label={t('settings:posterSizeAria')}
                            value={settings?.posterSize || 'medium'}
                            options={POSTER_SIZES.map(option => ({ value: option.value, label: t(`settings:${option.labelKey}`) }))}
                            onChange={value => void commit({ posterSize: value }, t('settings:settingSaveError'))}
                        />
                    )}
                />

                <SettingRow
                    title={t('settings:showImdbRatingTitle')}
                    description={t('settings:showImdbRatingDescription')}
                    control={(
                        <Toggle
                            label={t('settings:showImdbRatingAria')}
                            checked={settings?.showImdbRating !== false}
                            onChange={value => void commit({ showImdbRating: value }, t('settings:settingSaveError'))}
                        />
                    )}
                />

                <SettingRow
                    title={t('settings:hideEpisodeDetailsTitle')}
                    description={t('settings:hideEpisodeDetailsDescription')}
                    control={(
                        <Toggle
                            label={t('settings:hideEpisodeDetailsAria')}
                            checked={settings?.hideEpisodeSpoilers === true}
                            onChange={value => void commit({ hideEpisodeSpoilers: value }, t('settings:settingSaveError'))}
                        />
                    )}
                />
            </Group>

            <Group heading={t('settings:playbackGroupHeading')}>
                <SettingRow
                    title={t('settings:autoMarkWatchedTitle')}
                    description={t('settings:autoMarkWatchedDescription')}
                    control={(
                        <Toggle
                            label={t('settings:autoMarkWatchedAria')}
                            checked={settings?.autoMarkWatchedEnabled === true}
                            onChange={value => void commit({ autoMarkWatchedEnabled: value }, t('settings:settingSaveError'))}
                        />
                    )}
                >
                    <div className="flex items-center justify-between">
                        <h3 className={`font-medium ${settings?.autoMarkWatchedEnabled ? '' : 'text-foreground-subtle'}`}>{t('settings:applyToMoviesOnlyTitle')}</h3>
                        <Toggle
                            label={t('settings:applyToMoviesOnlyAria')}
                            disabled={settings?.autoMarkWatchedEnabled !== true}
                            checked={settings?.autoMarkWatchedEnabled === true && settings?.autoMarkWatchedScope === 'movies'}
                            onChange={value => void commit({ autoMarkWatchedScope: value ? 'movies' : 'all' }, t('settings:settingSaveError'))}
                        />
                    </div>
                </SettingRow>

                <SettingRow
                    title={t('settings:useFormattedTitleTitle')}
                    description={(
                        <>
                            {t('settings:useFormattedTitleDescription')}
                            <InfoHint text={t('settings:useFormattedTitleHint')} />
                        </>
                    )}
                    control={(
                        <Toggle
                            label={t('settings:useFormattedTitleAria')}
                            checked={settings?.useFormattedTitle !== false}
                            onChange={value => void commit({ useFormattedTitle: value }, t('settings:settingSaveError'))}
                        />
                    )}
                />
            </Group>

            <Group heading={t('settings:applicationGroupHeading')}>
                <SettingRow
                    title={t('settings:minimizeToTrayTitle')}
                    description={t('settings:minimizeToTrayDescription')}
                    control={(
                        <Toggle
                            label={t('settings:minimizeToTrayAria')}
                            checked={settings?.minimizeToTray === true}
                            onChange={value => void commit({ minimizeToTray: value }, t('settings:settingSaveError'))}
                        />
                    )}
                />
            </Group>
        </section>
    )
}
