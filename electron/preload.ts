import { ipcRenderer, contextBridge } from 'electron'
import { INVOKE_CHANNELS, RECEIVE_CHANNELS } from './ipcChannels'

const invokeChannels = new Set<string>(INVOKE_CHANNELS)
const receiveChannels = new Set<string>(RECEIVE_CHANNELS)

type Listener = (...args: unknown[]) => void
type Wrapper = (...args: unknown[]) => void

/** The original listener -> wrapper map, so `off()` can remove what `on()` registered. */
const registered = new WeakMap<Listener, Wrapper>()

const requireChannel = (allowed: Set<string>, action: string, channel: unknown) => {
    if (typeof channel !== 'string' || !allowed.has(channel)) {
        throw new Error(`Blocked IPC ${action} on channel: ${String(channel)}`)
    }
    return channel
}

contextBridge.exposeInMainWorld('electron', {
    platform: process.platform as string,
    ipcRenderer: {
        on(channel: string, listener: Listener) {
            requireChannel(receiveChannels, 'on', channel)
            const wrapper: Wrapper = (_event, ...args) => listener(_event, ...args)
            registered.set(listener, wrapper)
            return ipcRenderer.on(channel, wrapper)
        },
        off(channel: string, listener: Listener) {
            requireChannel(receiveChannels, 'off', channel)
            const wrapper = registered.get(listener) || listener
            registered.delete(listener)
            return ipcRenderer.off(channel, wrapper)
        },
        invoke(channel: string, ...args: unknown[]) {
            requireChannel(invokeChannels, 'invoke', channel)
            return ipcRenderer.invoke(channel, ...args)
        },
    },
})
