import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { RendererSettings, RendererSettingsPatch } from '../../electron/settings'

interface SettingsApi {
    /** null until the first successful load - callers must not write before that. */
    settings: RendererSettings | null
    ready: boolean
    save: (patch: RendererSettingsPatch) => Promise<boolean>
    reload: () => Promise<void>
}

const SettingsContext = createContext<SettingsApi | null>(null)

/**
 * Settings used to be fetched independently by every page, and the settings page would
 * auto-save its default state over the persisted config if a toggle was clicked before
 * the first load finished. One provider, loaded once, rejects writes until hydrated.
 */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<RendererSettings | null>(null)
    const latest = useRef<RendererSettings | null>(null)

    const apply = useCallback((next: RendererSettings | null) => {
        latest.current = next
        setSettings(next)
    }, [])

    const reload = useCallback(async () => {
        try {
            const loaded = await window.electron.ipcRenderer.invoke('get-settings')
            apply(loaded)
        } catch (error) {
            console.error('Failed to load settings:', error)
        }
    }, [apply])

    useEffect(() => {
        void reload()
    }, [reload])

    const save = useCallback(async (patch: RendererSettingsPatch) => {
        if (!latest.current) {
            console.warn('Ignored settings save before settings were loaded')
            return false
        }

        const previous = latest.current
        apply({ ...previous, ...patch } as RendererSettings)

        try {
            await window.electron.ipcRenderer.invoke('save-settings', patch)
            return true
        } catch (error) {
            console.error('Failed to save settings:', error)
            apply(previous)
            return false
        }
    }, [apply])

    const api = useMemo(() => ({
        settings,
        ready: settings !== null,
        save,
        reload
    }), [settings, save, reload])

    return <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>
}

export const useSettings = (): SettingsApi => {
    const context = useContext(SettingsContext)
    if (!context) throw new Error('useSettings must be used inside <SettingsProvider>')
    return context
}
