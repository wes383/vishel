import { app, BrowserWindow, Tray, Menu, nativeImage, session } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupIpcHandlers } from './ipcHandlers'
import store, { migrateStoredSecrets } from './store'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let tray: Tray | null = null
let isQuitting = false

// Single instance lock - prevent multiple windows
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit()
} else {
  // This is the first instance, handle second-instance event
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus the existing window
    if (win) {
      if (win.isMinimized()) win.restore()
      if (!win.isVisible()) win.show()
      win.focus()
    }
  })

  // Quit when all windows are closed, except on macOS
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
      win = null
    }
  })

  app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  app.whenReady().then(() => {
    migrateStoredSecrets()
    setupContentSecurityPolicy()
    setupIpcHandlers()
    createTray()
    createWindow()
  })
}

/**
 * The renderer shows remote poster/backdrop images and has no network needs of its own,
 * so everything is pinned to the local origin plus TMDB image hosts. Fonts are bundled
 * from src/assets/fonts, so no font CDN is allowlisted.
 */
function setupContentSecurityPolicy() {
  const isDev = Boolean(VITE_DEV_SERVER_URL)

  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self'"

  const connectSrc = isDev
    ? "connect-src 'self' ws://localhost:5173 http://localhost:5173"
    : "connect-src 'self'"

  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https://image.tmdb.org",
    connectSrc,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })
}

function createTray() {
  if (tray) return

  const iconPath = path.join(process.env.VITE_PUBLIC, 'icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  if (icon.isEmpty()) {
    // A missing or unreadable icon produced an invisible tray with a dead click handler.
    console.error(`Tray icon unavailable at ${iconPath}, skipping tray creation`)
    return
  }

  const isMac = process.platform === 'darwin'
  const traySize = isMac ? 22 : 64
  tray = new Tray(icon.resize({ width: traySize, height: traySize }))
  tray.setToolTip('Vishel')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App', click: () => {
        if (win) {
          win.show()
          win.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'All', click: () => {
        if (win) {
          win.show()
          win.focus()
          win.webContents.send('navigate-to-tab', 'all')
        }
      }
    },
    {
      label: 'Movies', click: () => {
        if (win) {
          win.show()
          win.focus()
          win.webContents.send('navigate-to-tab', 'movies')
        }
      }
    },
    {
      label: 'TV Shows', click: () => {
        if (win) {
          win.show()
          win.focus()
          win.webContents.send('navigate-to-tab', 'tv')
        }
      }
    },
    {
      label: 'Favorites', click: () => {
        if (win) {
          win.show()
          win.focus()
          win.webContents.send('navigate-to-tab', 'favorites')
        }
      }
    },
    {
      label: 'History', click: () => {
        if (win) {
          win.show()
          win.focus()
          win.webContents.send('navigate-to-tab', 'history')
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit', click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (win) {
      if (win.isVisible()) {
        if (win.isFocused()) {
          win.hide()
        } else {
          win.focus()
        }
      } else {
        win.show()
        win.focus()
      }
    }
  })
}

function createWindow() {
  win = new BrowserWindow({
    title: 'Vishel',
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    // Was 480, which the library header outgrew as soon as its actions gained text labels: the tab
    // strip and the toolbar each need a row to themselves, and at 480 both wrapped again inside
    // their own row. 640 is Tailwind's `sm` step, so it is a width the stylesheet already knows.
    // The height floor is Electron's own default window height (800x600, and no explicit size is
    // set here), so it stops the window being crushed without changing what it opens at.
    minWidth: 640,
    minHeight: 600,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#ffffff',
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      // The renderer reaches Node only through the allow-listed channels in preload.
      sandbox: false,
    },
  })

  // Remove the default menu bar
  win.setMenu(null)

  win.on('page-title-updated', (event) => event.preventDefault())

  // Keep the window on the local app shell: no popups, no navigation to remote origins,
  // and no permission grants.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  win.webContents.on('will-navigate', (event, url) => {
    const isLocal = url.startsWith('file://') || (Boolean(VITE_DEV_SERVER_URL) && url.startsWith(VITE_DEV_SERVER_URL as string))
    if (!isLocal) {
      console.warn(`Blocked navigation to ${url}`)
      event.preventDefault()
    }
  })

  win.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
    console.warn(`Blocked permission request: ${permission}`)
    callback(false)
  })

  // Handle Close Event
  win.on('close', (e) => {
    if (!isQuitting) {
      const minimizeToTray = store.get('minimizeToTray', false)
      if (minimizeToTray) {
        e.preventDefault()
        win?.hide()
        return
      }
    }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

