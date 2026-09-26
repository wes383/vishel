import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ScanProgress, ScanResult } from '../../electron/scanner'

interface ScanApi {
    scanning: boolean
    progress: ScanProgress | null
    /** Kick off a scan; resolves with the main-process summary. */
    scan: (forceRefresh?: boolean) => Promise<ScanResult | null>
    cancel: () => Promise<void>
    /** Subscribe to scan completion; returns an unsubscribe function. */
    addFinishListener: (listener: (result: ScanResult) => void) => () => void
}

const ScanContext = createContext<ScanApi | null>(null)

/**
 * Scanning used to be a fire-and-forget await with no feedback and no way out: the progress
 * callbacks existed but were never wired to IPC. This owns the scan-progress stream, the
 * cancel action, and notifies subscribers so the library reloads when a scan lands.
 */
export function ScanProvider({ children }: { children: React.ReactNode }) {
    const [scanning, setScanning] = useState(false)
    const [progress, setProgress] = useState<ScanProgress | null>(null)
    const listeners = useRef(new Set<(result: ScanResult) => void>())

    useEffect(() => {
        const handleProgress = (_event: unknown, payload: ScanProgress) => {
            setProgress(payload)
            if (payload.done) {
                setScanning(false)
            }
        }

        window.electron.ipcRenderer.on('scan-progress', handleProgress)
        return () => window.electron.ipcRenderer.off('scan-progress', handleProgress)
    }, [])

    const scan = useCallback(async (forceRefresh = false) => {
        setScanning(true)
        setProgress({ phase: 'preparing' })

        try {
            const result = forceRefresh
                ? await window.electron.ipcRenderer.invoke('full-rescan-library')
                : await window.electron.ipcRenderer.invoke('scan-library', false)

            listeners.current.forEach(listener => listener(result))
            return result
        } catch (error) {
            console.error('Scan failed:', error)
            setScanning(false)
            setProgress({
                phase: 'failed',
                done: true,
                error: error instanceof Error && error.message ? error.message : undefined
            })
            return null
        }
    }, [])

    const cancel = useCallback(async () => {
        try {
            await window.electron.ipcRenderer.invoke('cancel-scan')
        } catch (error) {
            console.error('Failed to cancel scan:', error)
        }
    }, [])

    const addFinishListener = useCallback((listener: (result: ScanResult) => void) => {
        listeners.current.add(listener)
        return () => {
            listeners.current.delete(listener)
        }
    }, [])

    const api = useMemo(() => ({ scanning, progress, scan, cancel, addFinishListener }),
        [scanning, progress, scan, cancel, addFinishListener])

    return <ScanContext.Provider value={api}>{children}</ScanContext.Provider>
}

export const useScan = (): ScanApi => {
    const context = useContext(ScanContext)
    if (!context) throw new Error('useScan must be used inside <ScanProvider>')
    return context
}
