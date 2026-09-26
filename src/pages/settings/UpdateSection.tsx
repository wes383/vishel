import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../contexts/ToastContext'
import type { UpdateStatus } from '../../types/ipc'

/** Release channel surfaced in the settings footer; the check itself lives in the main process. */
export default function UpdateSection({ version }: { version: string }) {
    const { t } = useTranslation(['settings', 'common'])
    const { showToast } = useToast()
    const [status, setStatus] = useState<UpdateStatus | null>(null)

    useEffect(() => {
        const handleStatus = (_event: unknown, payload: UpdateStatus) => setStatus(payload)
        window.electron.ipcRenderer.on('update-status', handleStatus)
        return () => window.electron.ipcRenderer.off('update-status', handleStatus)
    }, [])

    const checking = status?.state === 'checking'

    const check = async () => {
        const result = await window.electron.ipcRenderer.invoke('check-for-updates')
        setStatus(result)
        if (result.state === 'available') {
            const ok = await window.electron.ipcRenderer.invoke('download-update')
            if (!ok) showToast(t('settings:updateDownloadError'), 'error')
        } else if (result.state === 'not-available') {
            showToast(t('settings:updateLatestToast'), 'success')
        } else if (result.state === 'error') {
            showToast(result.message || t('settings:updateCheckError'), 'error')
        }
    }

    return (
        <div className="flex items-center justify-center gap-3 text-xs text-foreground-muted">
            {version && <p>{t('settings:versionLabel', { version })}</p>}
            <button
                type="button"
                onClick={() => void check()}
                disabled={checking}
                className="text-xs text-foreground-muted hover:text-foreground hover:underline transition-colors disabled:opacity-50"
            >
                {checking ? t('settings:checkingUpdates') : t('settings:checkForUpdates')}
            </button>
            {status?.state === 'downloaded' && status.version && (
                <p className="text-success">{t('settings:updateInstalledOnRestart', { version: status.version })}</p>
            )}
        </div>
    )
}
