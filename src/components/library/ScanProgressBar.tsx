import { useTranslation } from 'react-i18next'
import { useScan } from '../../contexts/ScanContext'
import { Loader2, X } from 'lucide-react'

/** Only the i18n key lives here: a module-scope constant cannot call the `t` hook. */
const PHASE_LABEL_KEY: Record<string, string> = {
    preparing: 'phasePreparing',
    refresh: 'phaseRefresh',
    scanning: 'phaseScanning',
    saving: 'phaseSaving',
    cancelled: 'phaseCancelled'
}

/** Live scan feedback plus the way out - previously a scan could not be observed or stopped. */
export default function ScanProgressBar() {
    const { t } = useTranslation(['library', 'common'])
    const { scanning, progress, cancel } = useScan()

    if (!scanning) return null

    const phase = progress
        ? t(`library:${PHASE_LABEL_KEY[progress.phase] || 'phaseScanning'}`)
        : t('library:phaseStarting')
    const detail = progress?.sourceName
        ? `${progress.sourceName}${progress.file ? ` · ${progress.file}` : ''}`
        : progress?.error

    return (
        <div
            className="mb-6 rounded-xl bg-neutral-800/80 ring-1 ring-white/10 px-4 py-3 flex items-center gap-4"
            role="status"
            aria-live="polite"
        >
            <Loader2 className="w-5 h-5 animate-spin text-indigo-400 shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{phase}</p>
                {detail && <p className="text-xs text-white/60 truncate">{detail}</p>}
            </div>
            {typeof progress?.processed === 'number' && (
                <span className="text-sm text-white/70 tabular-nums shrink-0">
                    {t('library:fileCount', { count: progress.processed })}
                </span>
            )}
            <button
                type="button"
                onClick={() => void cancel()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-white shrink-0"
            >
                <X className="w-4 h-4" aria-hidden="true" />
                {t('library:stop')}
            </button>
        </div>
    )
}
