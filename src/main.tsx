import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './i18n'
import './index.css'

// Vite prints a LAN URL that opens in any browser, but `window.electron` only exists once the
// preload script has run inside an Electron window.
const hasBridge = Boolean(window.electron?.ipcRenderer)

const root = ReactDOM.createRoot(document.getElementById('root')!)

if (!hasBridge) {
    root.render(
        <div className="h-screen bg-neutral-900 text-white flex items-center justify-center p-8">
            <div className="max-w-md">
                <h1 className="text-2xl font-bold mb-3">Electron bridge unavailable</h1>
                <p className="text-sm text-white/70">
                    <code className="text-white">window.electron</code> was not injected, so no
                    local data can be read. This is expected when the page is open in a browser -
                    use the application window that <code className="text-white">npm run dev</code>{' '}
                    opens. If it is missing inside that window, the preload script failed to load;
                    check the DevTools console for the error.
                </p>
            </div>
        </div>
    )
} else {
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>,
    )
}
