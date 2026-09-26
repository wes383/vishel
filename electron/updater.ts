import { app } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'

export interface UpdateStatus {
    state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloaded' | 'error'
    version?: string
    message?: string
}

let emit: (status: UpdateStatus) => void = () => { /* no window yet */ }
let lastStatus: UpdateStatus = { state: 'idle' }

const publish = (status: UpdateStatus) => {
    lastStatus = status
    emit(status)
}

/**
 * electron-builder already publishes GitHub releases, so the release channel exists; this is
 * the missing half that lets security fixes reach installed users.
 */
export const initAutoUpdater = (broadcast: (status: UpdateStatus) => void) => {
    emit = broadcast

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }))
    autoUpdater.on('update-available', (info: UpdateInfo) => publish({ state: 'available', version: info.version }))
    autoUpdater.on('update-not-available', () => publish({ state: 'not-available' }))
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
        publish({ state: 'downloaded', version: info.version })
        autoUpdater.quitAndInstall(false, true)
    })
    autoUpdater.on('error', (error) => {
        console.warn('[updater] check failed:', error.message)
        publish({ state: 'error', message: error.message })
    })

    if (app.isPackaged) {
        // A silent periodic check; the settings page also exposes an explicit one.
        void checkForUpdates()
    }
}

export const getUpdateStatus = (): UpdateStatus => lastStatus

export const checkForUpdates = async (): Promise<UpdateStatus> => {
    if (!app.isPackaged) {
        const message = 'Update checks are unavailable in a development build'
        publish({ state: 'error', message })
        return { state: 'error', message }
    }

    try {
        const result = await autoUpdater.checkForUpdates()
        publish({
            state: result?.isUpdateAvailable ? 'available' : 'not-available',
            version: result?.updateInfo?.version
        })
        return lastStatus
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        publish({ state: 'error', message })
        return lastStatus
    }
}

/** Downloads the pending release; `update-downloaded` installs and restarts. */
export const downloadUpdate = async (): Promise<boolean> => {
    try {
        await autoUpdater.downloadUpdate()
        return true
    } catch (error) {
        console.warn('[updater] download failed:', error)
        return false
    }
}
