import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { InfoHint, Segmented, SettingRow, Toggle } from './SettingsControls'
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
        <section className="space-y-4" aria-labelledby="general-heading">
            <h2 id="general-heading" className="text-xl font-semibold text-white -mt-[5px]">{t('settings:generalHeading')}</h2>

            <div>
                <label className="block text-sm font-medium text-gray-400 mb-1" htmlFor="tmdb-api-key">{t('settings:tmdbApiKeyLabel')}</label>
                <input
                    id="tmdb-api-key"
                    type="text"
                    value={apiKey}
                    onChange={event => setApiKey(event.target.value)}
                    onBlur={handleApiKeyBlur}
                    spellCheck={false}
                    autoComplete="off"
                    aria-describedby="tmdb-api-key-hint"
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-2 outline-none focus:border-white transition-colors"
                />
                <p id="tmdb-api-key-hint" className="text-xs text-gray-500 mt-1">
                    {t('settings:tmdbApiKeyHint')}
                </p>
            </div>

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
                    <h3 className={`font-medium ${settings?.autoMarkWatchedEnabled ? '' : 'text-gray-500'}`}>{t('settings:applyToMoviesOnlyTitle')}</h3>
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
        </section>
    )
}
