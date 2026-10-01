/**
 * The IPC surface of the app. preload.ts enforces these lists at runtime, and the
 * renderer's types are derived from them, so a new channel has to be declared here first.
 */
export const INVOKE_CHANNELS = [
    'get-settings',
    'save-settings',
    'get-library-stats',
    'test-connection',
    'list-directory',
    'scan-library',
    'full-rescan-library',
    'cancel-scan',
    'get-movies',
    'get-movie',
    'get-tv-shows',
    'get-tv-show',
    'refresh-metadata',
    'get-unscanned-files',
    'play-video',
    'detect-players',
    'get-history',
    'delete-history-item',
    'open-directory-dialog',
    'open-external',
    'get-imdb-rating',
    'probe-video-metadata',
    'search-tmdb',
    'manual-match-file',
    'rematch-media',
    'rematch-single-file',
    'get-favorites',
    'add-favorite',
    'remove-favorite',
    'get-all-watch-status',
    'toggle-watch-status'
] as const

export type InvokeChannel = typeof INVOKE_CHANNELS[number]

/** Channels the main process pushes to the renderer. */
export const RECEIVE_CHANNELS = [
    'scan-progress',
    'navigate-to-tab'
] as const

export type ReceiveChannel = typeof RECEIVE_CHANNELS[number]
