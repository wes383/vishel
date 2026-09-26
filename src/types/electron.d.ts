import type { InvokeChannel, ReceiveChannel } from '../../electron/ipcChannels'
import type { IpcRequestMap, IpcEventMap } from './ipc'

export type IpcListener<K extends ReceiveChannel> = (event: unknown, payload: IpcEventMap[K]) => void

export interface TypedIpcRenderer {
    invoke<K extends InvokeChannel>(
        channel: K,
        ...args: IpcRequestMap[K]['args']
    ): Promise<IpcRequestMap[K]['result']>
    on<K extends ReceiveChannel>(channel: K, listener: IpcListener<K>): void
    off<K extends ReceiveChannel>(channel: K, listener: IpcListener<K>): void
}

declare global {
    interface Window {
        electron: {
            platform: string
            ipcRenderer: TypedIpcRenderer
        }
    }
}
