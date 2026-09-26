import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronLeft } from 'lucide-react'
import Modal from '../ui/Modal'
import FileBrowser from '../FileBrowser'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Segmented from '../ui/Segmented'
import { Field } from '../ui/Field'
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
            <Button variant="ghost" onClick={onClose}>{t('common:cancel')}</Button>
            <Button onClick={handleTest} disabled={requiredFieldMissing} loading={testing}>
                {t('settings:next')}
            </Button>
        </div>
    ) : (
        <div className="flex justify-between gap-3">
            {!isEdit ? (
                <Button variant="ghost" onClick={() => setStep(1)}>
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                    {t('common:back')}
                </Button>
            ) : <span />}
            <Button onClick={handleFinish}>
                <Check className="w-4 h-4" aria-hidden="true" />
                {isEdit ? t('common:save') : t('settings:finish')}
            </Button>
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
                    <Field label={t('settings:sourceTypeLabel')}>
                        {isEdit ? (
                            <p className="py-2 font-medium">{typeLabels[type]}</p>
                        ) : (
                            <Segmented
                                fill
                                label={t('settings:sourceTypeLabel')}
                                value={type}
                                options={(['webdav', 'local', 'smb'] as SourceType[]).map(option => ({ value: option, label: typeLabels[option] }))}
                                onChange={option => {
                                    setType(option)
                                    setSelectedPaths([])
                                    setStep(1)
                                }}
                            />
                        )}
                    </Field>

                    <Field id="source-name" label={t('settings:sourceNameLabel')}>
                        <Input
                            id="source-name"
                            type="text"
                            value={name}
                            onChange={event => setName(event.target.value)}
                            placeholder={namePlaceholders[type]}
                            spellCheck={false}
                        />
                    </Field>

                    {type === 'webdav' && (
                        <>
                            <Field id="source-url" label={t('settings:webdavUrlLabel')}>
                                <Input
                                    id="source-url"
                                    type="text"
                                    value={config.url}
                                    onChange={event => update({ url: event.target.value })}
                                    placeholder="https://example.com/webdav"
                                    spellCheck={false}
                                />
                            </Field>
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
                            <Field id="source-share" label={t('settings:smbSharePathLabel')} hint={t('settings:smbShareFormat')}>
                                <Input
                                    id="source-share"
                                    type="text"
                                    value={config.share}
                                    onChange={event => update({ share: event.target.value })}
                                    placeholder="//192.168.1.100/movies"
                                    spellCheck={false}
                                />
                            </Field>
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
                        <Field id="source-path" label={t('settings:folderPathLabel')} hint={t('settings:folderPathHint')}>
                            <div className="flex gap-2">
                                <Input
                                    id="source-path"
                                    type="text"
                                    value={config.path}
                                    onChange={event => update({ path: event.target.value })}
                                    placeholder="D:\Movies"
                                    spellCheck={false}
                                />
                                <Button variant="outline" onClick={browseDirectory}>
                                    {t('common:browse')}
                                </Button>
                            </div>
                        </Field>
                    )}

                    {error && (
                        <p className="text-sm text-danger" role="alert">{error}</p>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-foreground-muted">{t('settings:selectFoldersToScan')}</p>
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
                        <p className="text-sm text-danger" role="alert">{error}</p>
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
            <Field id="source-username" label={usernameLabel ?? t('common:username')}>
                <Input
                    id="source-username"
                    type="text"
                    value={config.username}
                    onChange={event => update({ username: event.target.value })}
                    placeholder={t('settings:placeholderUsername')}
                    spellCheck={false}
                    autoComplete="off"
                />
            </Field>

            <Field
                id="source-password"
                label={requiredPassword ? t('common:password') : t('settings:passwordOptional')}
                hint={isEdit && hasStoredPassword ? t('settings:storedPasswordHint') : undefined}
            >
                <Input
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
                />
            </Field>

            {domain && (
                <Field id="source-domain" label={t('settings:domainOptional')}>
                    <Input
                        id="source-domain"
                        type="text"
                        value={config.domain}
                        onChange={event => update({ domain: event.target.value })}
                        placeholder="WORKGROUP"
                        spellCheck={false}
                    />
                </Field>
            )}
        </>
    )
}
