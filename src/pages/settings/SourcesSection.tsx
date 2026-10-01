import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, RefreshCw } from 'lucide-react'
import DataSourceList from '../../components/DataSourceList'
import SourceModal from '../../components/source/SourceModal'
import ScanProgressBar from '../../components/ScanProgressBar'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
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
    const { scanning, scan, addFinishListener } = useScan()

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
                <h2 id="sources-heading" className="text-xl font-semibold">{t('settings:dataSourcesHeading')}</h2>
                <div className="flex gap-3">
                    <Button size="sm" onClick={() => void runScan(false)} disabled={scanning}>
                        <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} aria-hidden="true" />
                        {scanning ? t('settings:scanningButton') : t('settings:quickScan')}
                    </Button>
                    <Button size="sm" onClick={() => void runScan(true)} disabled={scanning}>
                        <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} aria-hidden="true" />
                        {scanning ? t('settings:scanningButton') : t('settings:fullRescan')}
                    </Button>
                    <Button size="sm" onClick={() => setShowAddModal(true)}>
                        <Plus className="w-4 h-4" aria-hidden="true" />
                        {t('settings:addSource')}
                    </Button>
                </div>
            </div>

            {scanning && <ScanProgressBar />}

            <div className="mb-4 px-1">
                <p className="text-sm text-foreground-muted mb-1">
                    <span className="font-semibold text-foreground">{t('settings:quickScanLabel')}</span> {t('settings:quickScanHelp')}
                </p>
                <p className="text-sm text-foreground-muted">
                    <span className="font-semibold text-foreground">{t('settings:fullRescanLabel')}</span> {t('settings:fullRescanHelp')}
                </p>
            </div>

            <DataSourceList
                sources={sources}
                onRemove={handleRemoveSource}
                onEdit={setEditingSource}
            />

            <div className="grid grid-cols-2 gap-4 mt-6">
                <Card padded>
                    <h3 className="text-sm font-medium text-foreground-muted mb-1">{t('settings:totalMovies')}</h3>
                    <p className="text-2xl font-bold">{stats.movies}</p>
                </Card>
                <Card padded>
                    <h3 className="text-sm font-medium text-foreground-muted mb-1">{t('settings:totalTvShows')}</h3>
                    <p className="text-2xl font-bold">{stats.tvShows}</p>
                </Card>
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
