import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronLeft, Loader2 } from 'lucide-react'
import Modal from '../ui/Modal'
import FileBrowser from '../FileBrowser'
import type { DataSource } from '../../../electron/store'
import type { RedactedSource, WritableSource } from '../../../electron/settings'
import type { SourceConnectionRequest } from '../../types/ipc'

interface SourceModalProps {
    /** Omitted when adding; present (redacted) when editing an existing source. */
    source?: RedactedSource
    onClose: () => void
    onSubmit: (source: WritableSource) => void
}

type SourceType = DataSource['type']

interface ConfigFields {
    url: string
    path: string
    share: string
    username: string
    password: string
    domain: string
}

const EMPTY_CONFIG: ConfigFields = {
    url: '',
    path: '',
    share: '',
    username: '',
    password: '',
    domain: ''
}

const INPUT_CLASSES = 'w-full bg-white/30 border border-gray-900/20 rounded-lg px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900'
const LABEL_CLASSES = 'block text-sm font-medium text-gray-700 mb-1'

/**
 * Add and edit were two near-identical components; the copy is why the stored password used
 * to be round-tripped through the renderer. Edit mode now keeps the secret in the main process
 * and only sends a password the user actually typed.
 */
export default function SourceModal({ source, onClose, onSubmit }: SourceModalProps) {
    const { t } = useTranslation(['settings', 'common'])
    const isEdit = Boolean(source)
    const [type, setType] = useState<SourceType>(source?.type || 'webdav')

    // Source-type copy lives here because it is translated; the type ids themselves stay as data.
    const typeLabels: Record<SourceType, string> = {
        webdav: t('settings:sourceTypeWebdav'),
        local: t('settings:sourceTypeLocal'),
        smb: t('settings:sourceTypeSmb')
    }

    const namePlaceholders: Record<SourceType, string> = {
        webdav: t('settings:namePlaceholderWebdav'),
        smb: t('settings:namePlaceholderSmb'),
        local: t('settings:namePlaceholderLocal')
    }

    const defaultNames: Record<SourceType, string> = {
        webdav: t('settings:defaultNameWebdav'),
        smb: t('settings:defaultNameSmb'),
        local: t('settings:defaultNameLocal')
    }

    const [step, setStep] = useState<1 | 2>(isEdit ? 2 : 1)
    const [name, setName] = useState(source?.name || '')
    const [config, setConfig] = useState<ConfigFields>(() => ({
        ...EMPTY_CONFIG,
        url: source?.config?.url || '',
        path: source?.config?.path || '',
        share: source?.config?.share || '',
        username: source?.config?.username || '',
        domain: source?.config?.domain || ''
    }))
    const [passwordEdited, setPasswordEdited] = useState(false)
    const [selectedPaths, setSelectedPaths] = useState<string[]>(source?.paths || [])
    const [testing, setTesting] = useState(false)
    const [error, setError] = useState('')

    const update = (patch: Partial<ConfigFields>) => setConfig(prev => ({ ...prev, ...patch }))

    const requiredFieldMissing = type === 'webdav'
        ? !config.url
        : type === 'smb'
            ? !config.share
            : !config.path

    const handleTest = async () => {
        setTesting(true)
        setError('')
        try {
            const request: SourceConnectionRequest = {
                type,
                id: source?.id,
                url: config.url || undefined,
                path: config.path || undefined,
                share: config.share || undefined,
                username: config.username || undefined,
                domain: config.domain || undefined,
                password: passwordEdited ? config.password : undefined
            }
            const success = await window.electron.ipcRenderer.invoke('test-connection', request)
            if (success) {
                setStep(2)
            } else {
                setError(t('settings:connectionFailedError'))
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : t('settings:connectionFailedShort'))
        } finally {
            setTesting(false)
        }
    }

    const togglePath = (path: string) => {
        setSelectedPaths(prev =>
            prev.includes(path) ? prev.filter(entry => entry !== path) : [...prev, path]
        )
    }

    const handleFinish = () => {
        const finalPaths = selectedPaths.length > 0
            ? selectedPaths
            : [type === 'local' ? (config.path || '/') : '/']

        const submitted: WritableSource = {
            id: source?.id || crypto.randomUUID(),
            type,
            name: name || defaultNames[type],
            config: {
                url: config.url || undefined,
                path: config.path || undefined,
                share: config.share || undefined,
                username: config.username || undefined,
                domain: config.domain || undefined,
                // Undefined means "keep the stored secret"; the main process resolves it.
                password: passwordEdited ? config.password : undefined
            },
            paths: finalPaths
        }

        onSubmit(submitted)
    }

    const browseDirectory = async () => {
        try {
            const picked = await window.electron.ipcRenderer.invoke('open-directory-dialog')
            if (picked) update({ path: picked })
        } catch (err) {
            setError(err instanceof Error ? err.message : t('settings:folderPickerError'))
        }
    }

    const footer = step === 1 ? (
        <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-gray-900 hover:bg-black/10 transition-colors">
                {t('common:cancel')}
            </button>
            <button
                type="button"
                onClick={handleTest}
                disabled={testing || requiredFieldMissing}
                className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
                {testing && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                {t('settings:next')}
            </button>
        </div>
    ) : (
        <div className="flex justify-between gap-3">
            {!isEdit ? (
                <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-4 py-2 rounded-lg text-gray-900 hover:bg-black/10 transition-colors flex items-center gap-1"
                >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    {t('common:back')}
                </button>
            ) : <span />}
            <button
                type="button"
                onClick={handleFinish}
                className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
                <Check className="w-4 h-4" aria-hidden="true" />
                {isEdit ? t('common:save') : t('settings:finish')}
            </button>
        </div>
    )

    return (
        <Modal
            title={isEdit ? t('settings:editSourceTitle', { type: typeLabels[type] }) : t('settings:addSourceTitle')}
            description={isEdit ? t('settings:editSourceDescription') : t('settings:addSourceDescription')}
            onClose={onClose}
            size="md"
            footer={footer}
            panelClassName="w-[600px]"
        >
            {step === 1 ? (
                <div className="space-y-4">
                    <div>
                        <span className={LABEL_CLASSES} id="source-type-label">{t('settings:sourceTypeLabel')}</span>
                        {isEdit ? (
                            <p className="py-2 font-medium text-gray-900">{typeLabels[type]}</p>
                        ) : (
                            <div className="flex gap-4" role="group" aria-labelledby="source-type-label">
                                {(['webdav', 'local', 'smb'] as SourceType[]).map(option => (
                                    <button
                                        key={option}
                                        type="button"
                                        aria-pressed={type === option}
                                        onClick={() => {
                                            setType(option)
                                            setSelectedPaths([])
                                            setStep(1)
                                        }}
                                        className={`flex-1 py-2 rounded-lg border transition-colors ${
                                            type === option
                                                ? 'bg-neutral-800 border-neutral-800 text-white'
                                                : 'border-gray-900/20 hover:bg-black/10 text-gray-900'
                                        }`}
                                    >
                                        {typeLabels[option]}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className={LABEL_CLASSES} htmlFor="source-name">{t('settings:sourceNameLabel')}</label>
                        <input
                            id="source-name"
                            type="text"
                            value={name}
                            onChange={event => setName(event.target.value)}
                            placeholder={namePlaceholders[type]}
                            spellCheck={false}
                            className={INPUT_CLASSES}
                        />
                    </div>

                    {type === 'webdav' && (
                        <>
                            <div>
                                <label className={LABEL_CLASSES} htmlFor="source-url">{t('settings:webdavUrlLabel')}</label>
                                <input
                                    id="source-url"
                                    type="text"
                                    value={config.url}
                                    onChange={event => update({ url: event.target.value })}
                                    placeholder="https://example.com/webdav"
                                    spellCheck={false}
                                    className={INPUT_CLASSES}
                                />
                            </div>
                            <SourceCredentialFields
                                config={config}
                                update={update}
                                isEdit={isEdit}
                                hasStoredPassword={Boolean(source?.config?.hasPassword)}
                                onPasswordEdited={() => setPasswordEdited(true)}
                                usernameLabel={t('settings:usernameOptional')}
                                requiredPassword={false}
                            />
                        </>
                    )}

                    {type === 'smb' && (
                        <>
                            <div>
                                <label className={LABEL_CLASSES} htmlFor="source-share">{t('settings:smbSharePathLabel')}</label>
                                <input
                                    id="source-share"
                                    type="text"
                                    value={config.share}
                                    onChange={event => update({ share: event.target.value })}
                                    placeholder="//192.168.1.100/movies"
                                    spellCheck={false}
                                    className={INPUT_CLASSES}
                                />
                                <p className="text-xs text-gray-700 mt-1">{t('settings:smbShareFormat')}</p>
                            </div>
                            <SourceCredentialFields
                                config={config}
                                update={update}
                                isEdit={isEdit}
                                hasStoredPassword={Boolean(source?.config?.hasPassword)}
                                onPasswordEdited={() => setPasswordEdited(true)}
                                domain
                            />
                        </>
                    )}

                    {type === 'local' && (
                        <div>
                            <label className={LABEL_CLASSES} htmlFor="source-path">{t('settings:folderPathLabel')}</label>
                            <div className="flex gap-2">
                                <input
                                    id="source-path"
                                    type="text"
                                    value={config.path}
                                    onChange={event => update({ path: event.target.value })}
                                    placeholder="D:\Movies"
                                    spellCheck={false}
                                    className="flex-1 bg-white/30 border border-gray-900/20 rounded-lg px-4 py-2 outline-none focus:border-gray-900 transition-colors text-gray-900"
                                />
                                <button
                                    type="button"
                                    onClick={browseDirectory}
                                    className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                                >
                                    {t('common:browse')}
                                </button>
                            </div>
                            <p className="text-xs text-gray-700 mt-1">{t('settings:folderPathHint')}</p>
                        </div>
                    )}

                    {error && (
                        <p className="text-red-600 text-sm" role="alert">{error}</p>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-gray-700">{t('settings:selectFoldersToScan')}</p>
                    <FileBrowser
                        config={{
                            url: config.url || undefined,
                            path: config.path || undefined,
                            share: config.share || undefined,
                            username: config.username || undefined,
                            domain: config.domain || undefined,
                            password: passwordEdited ? config.password : undefined
                        }}
                        type={type}
                        sourceId={source?.id}
                        onSelect={togglePath}
                        selectedPaths={selectedPaths}
                    />
                    {error && (
                        <p className="text-red-600 text-sm" role="alert">{error}</p>
                    )}
                </div>
            )}
        </Modal>
    )
}

interface SourceCredentialFieldsProps {
    config: ConfigFields
    update: (patch: Partial<ConfigFields>) => void
    isEdit: boolean
    hasStoredPassword: boolean
    onPasswordEdited: () => void
    usernameLabel?: string
    domain?: boolean
    requiredPassword?: boolean
}

function SourceCredentialFields({
    config,
    update,
    isEdit,
    hasStoredPassword,
    onPasswordEdited,
    usernameLabel,
    domain = false,
    requiredPassword = true
}: SourceCredentialFieldsProps) {
    const { t } = useTranslation(['settings', 'common'])

    return (
        <>
            <div>
                <label className={LABEL_CLASSES} htmlFor="source-username">{usernameLabel ?? t('common:username')}</label>
                <input
                    id="source-username"
                    type="text"
                    value={config.username}
                    onChange={event => update({ username: event.target.value })}
                    placeholder={t('settings:placeholderUsername')}
                    spellCheck={false}
                    autoComplete="off"
                    className={INPUT_CLASSES}
                />
            </div>

            <div>
                <label className={LABEL_CLASSES} htmlFor="source-password">
                    {requiredPassword ? t('common:password') : t('settings:passwordOptional')}
                </label>
                <input
                    id="source-password"
                    type="password"
                    value={config.password}
                    onChange={event => {
                        onPasswordEdited()
                        update({ password: event.target.value })
                    }}
                    placeholder={isEdit && hasStoredPassword ? t('settings:storedPasswordPlaceholder') : t('settings:placeholderPassword')}
                    spellCheck={false}
                    autoComplete="new-password"
                    className={INPUT_CLASSES}
                />
                {isEdit && hasStoredPassword && (
                    <p className="text-xs text-gray-700 mt-1">
                        {t('settings:storedPasswordHint')}
                    </p>
                )}
            </div>

            {domain && (
                <div>
                    <label className={LABEL_CLASSES} htmlFor="source-domain">{t('settings:domainOptional')}</label>
                    <input
                        id="source-domain"
                        type="text"
                        value={config.domain}
                        onChange={event => update({ domain: event.target.value })}
                        placeholder="WORKGROUP"
                        spellCheck={false}
                        className={INPUT_CLASSES}
                    />
                </div>
            )}
        </>
    )
}
