import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, RefreshCw, Square } from 'lucide-react'
import DataSourceList from '../../components/DataSourceList'
import SourceModal from '../../components/source/SourceModal'
import { useSettings } from '../../contexts/SettingsContext'
import { useToast } from '../../contexts/ToastContext'
import { useScan } from '../../contexts/ScanContext'
import type { RedactedSource, WritableSource } from '../../../electron/settings'
import type { ScanResult } from '../../../electron/scanner'

interface LibraryStats {
    movies: number
    tvShows: number
}

/** Data sources, the two scan entry points, and the resulting library counts. */
export default function SourcesSection() {
    const { t } = useTranslation(['settings', 'common'])
    const { settings, save } = useSettings()
    const { showToast } = useToast()
    const { scanning, scan, cancel, addFinishListener } = useScan()

    const [stats, setStats] = useState<LibraryStats>({ movies: 0, tvShows: 0 })
    const [showAddModal, setShowAddModal] = useState(false)
    const [editingSource, setEditingSource] = useState<RedactedSource | null>(null)

    const fetchStats = () => {
        window.electron.ipcRenderer.invoke('get-library-stats')
            .then(setStats)
            .catch(error => console.error('Failed to load library stats:', error))
    }

    useEffect(() => {
        fetchStats()
        return addFinishListener((result: ScanResult) => {
            fetchStats()
            if (result.status === 'partial') {
                showToast(result.failedSources.map(source => source.error).join('\n'), 'error', 8000)
            }
        })
    }, [addFinishListener, showToast])

    const sources = settings?.sources || []

    const persistSources = async (next: WritableSource[]) => {
        const ok = await save({ sources: next })
        if (!ok) showToast(t('settings:sourcesSaveError'), 'error')
    }

    const handleAddSource = async (source: WritableSource) => {
        setShowAddModal(false)
        await persistSources([...sources, source])
        showToast(t('settings:sourceAddedToast', { name: source.name }), 'success')
    }

    const handleSaveEditedSource = async (updated: WritableSource) => {
        setEditingSource(null)
        await persistSources(sources.map(item => (item.id === updated.id ? updated : item)) as WritableSource[])
        showToast(t('settings:sourceSavedToast', { name: updated.name }), 'success')
    }

    const handleRemoveSource = async (id: string) => {
        await persistSources(sources.filter(item => item.id !== id) as WritableSource[])
    }

    const runScan = async (forceRefresh: boolean) => {
        const result = await scan(forceRefresh)
        fetchStats()
        if (!result) return

        if (result.status === 'failed') {
            showToast(result.error || t('settings:scanFailedToast'), 'error', 8000)
        } else if (result.status === 'partial') {
            showToast(t('settings:scanIncompleteToast', { sources: result.failedSources.map(source => source.name).join(', ') }), 'error', 8000)
        } else if (result.status === 'complete') {
            showToast(t('settings:scanFinishedToast', { movies: result.newMovies, shows: result.newTVShows }), 'success')
        }
    }

    return (
        <section aria-labelledby="sources-heading">
            <div className="flex items-center justify-between mb-4">
                <h2 id="sources-heading" className="text-xl font-semibold text-white">{t('settings:dataSourcesHeading')}</h2>
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={() => void runScan(false)}
                        disabled={scanning}
                        className="flex items-center gap-2 bg-white hover:bg-gray-200 text-black px-4 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} aria-hidden="true" />
                        {scanning ? t('settings:scanningButton') : t('settings:quickScan')}
                    </button>
                    <button
                        type="button"
                        onClick={() => void runScan(true)}
                        disabled={scanning}
                        className="flex items-center gap-2 bg-white hover:bg-gray-200 text-black px-4 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} aria-hidden="true" />
                        {scanning ? t('settings:scanningButton') : t('settings:fullRescan')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowAddModal(true)}
                        className="bg-white hover:bg-gray-200 text-black px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                        <Plus className="w-4 h-4" aria-hidden="true" />
                        {t('settings:addSource')}
                    </button>
                </div>
            </div>

            {scanning && (
                <div className="mb-4 flex justify-end">
                    <button
                        type="button"
                        onClick={() => void cancel()}
                        className="flex items-center gap-1.5 bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                    >
                        <Square className="w-3 h-3" aria-hidden="true" />
                        {t('settings:stopScan')}
                    </button>
                </div>
            )}

            <div className="mb-4 px-1">
                <p className="text-sm text-gray-400 mb-1">
                    <span className="font-semibold text-gray-300">{t('settings:quickScanLabel')}</span> {t('settings:quickScanHelp')}
                </p>
                <p className="text-sm text-gray-400">
                    <span className="font-semibold text-gray-300">{t('settings:fullRescanLabel')}</span> {t('settings:fullRescanHelp')}
                </p>
            </div>

            <DataSourceList
                sources={sources}
                onRemove={handleRemoveSource}
                onEdit={setEditingSource}
            />

            <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="bg-neutral-800 p-4 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-400 mb-1">{t('settings:totalMovies')}</h3>
                    <p className="text-2xl font-bold text-white">{stats.movies}</p>
                </div>
                <div className="bg-neutral-800 p-4 rounded-lg">
                    <h3 className="text-sm font-medium text-gray-400 mb-1">{t('settings:totalTvShows')}</h3>
                    <p className="text-2xl font-bold text-white">{stats.tvShows}</p>
                </div>
            </div>

            <div aria-live="polite" className="sr-only">
                {scanning ? t('settings:scanningProgress') : ''}
            </div>

            {showAddModal && (
                <SourceModal
                    onClose={() => setShowAddModal(false)}
                    onSubmit={handleAddSource}
                />
            )}

            {editingSource && (
                <SourceModal
                    source={editingSource}
                    onClose={() => setEditingSource(null)}
                    onSubmit={handleSaveEditedSource}
                />
            )}
        </section>
    )
}
