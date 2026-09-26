import { useEffect, useState } from 'react'
import type { VideoFile } from '../../electron/db'
import type { VideoProbeMetadata } from '../../electron/mediaProbe'

/**
 * Probes each file for codec/HDR/bitrate metadata. The previous copy of this effect omitted
 * the enable flag from its dependency array, so toggling the setting never re-probed.
 *
 * `files` must keep a stable identity (memoise it at the call site) or probing restarts on
 * every render.
 */
export function useVideoProbeMetadata(files: VideoFile[], enabled: boolean) {
    const [metadata, setMetadata] = useState<Record<string, VideoProbeMetadata | null>>({})

    useEffect(() => {
        if (!enabled || files.length === 0) {
            setMetadata({})
            return
        }

        let active = true
        setMetadata({})

        const probe = async () => {
            const results = await Promise.all(files.map(async file => {
                try {
                    const probed = await window.electron.ipcRenderer.invoke('probe-video-metadata', {
                        url: file.webdavUrl,
                        sourceId: file.sourceId
                    })
                    return [file.id, probed] as const
                } catch (error) {
                    console.warn(`Failed to probe ${file.name}:`, error)
                    return [file.id, null] as const
                }
            }))

            if (!active) return

            const mapped: Record<string, VideoProbeMetadata | null> = {}
            for (const [id, value] of results) {
                mapped[id] = value
            }
            setMetadata(mapped)
        }

        void probe()

        return () => {
            active = false
        }
    }, [files, enabled])

    return metadata
}
