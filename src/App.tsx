import { HashRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import i18n from './i18n'
import ErrorBoundary from './components/ErrorBoundary'
import SettingsPage from './pages/Settings'
import LibraryPage from './pages/Library'
import MovieDetail from './pages/MovieDetail'
import TVDetail from './pages/TVDetail'
import { ToastProvider } from './contexts/ToastContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { MediaStatusProvider } from './contexts/MediaStatusContext'
import { ScanProvider } from './contexts/ScanContext'
import type { LibraryTab } from './types/ipc'

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()

  const [isWideScreen, setIsWideScreen] = useState(() => window.innerWidth >= 1024)

  useEffect(() => {
    const handleResize = () => setIsWideScreen(window.innerWidth >= 1024)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const isSettingsPage = location.pathname === '/settings'

  const titleBarTransparent = isWideScreen && isSettingsPage
  const isSettingsNarrow = !isWideScreen && isSettingsPage
  const titleBarBlur = !titleBarTransparent && !isSettingsNarrow ? 'bg-gradient-to-b' : ''
  const titleBarStyle = !titleBarTransparent && !isSettingsNarrow ? { background: 'linear-gradient(to bottom, rgba(23,23,23,0.6) 0%, rgba(23,23,23,0.35) 10%, rgba(23,23,23,0.18) 25%, rgba(23,23,23,0.1) 40%, rgba(23,23,23,0.05) 55%, rgba(23,23,23,0.02) 70%, transparent 85%)' } : isSettingsNarrow ? { background: '#171717' } : {}

  useEffect(() => {
    const handleNavigateToTab = (_event: unknown, tab: LibraryTab) => {
      // The tab lives in the URL, so the library page stays the single writer of it.
      navigate(`/?tab=${tab}`)
    }

    window.electron.ipcRenderer.on('navigate-to-tab', handleNavigateToTab)

    return () => {
      window.electron.ipcRenderer.off('navigate-to-tab', handleNavigateToTab)
    }
  }, [navigate])

  // Out of flow on purpose: an in-flow 100vh shell still lets tall page content extend the
  // viewport's scrollable area, which renders a second scrollbar beside main's.
  return (
    <div className="fixed inset-0 bg-neutral-900 text-white overflow-hidden flex flex-col">
      <div className={`titlebar-drag-region h-8 w-full fixed top-0 left-0 z-[100] bg-transparent ${titleBarBlur}`} style={titleBarStyle} />
      {/* Main Content */}
      <main className="h-full overflow-auto bg-neutral-900">
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/movie/:id" element={<MovieDetail />} />
          <Route path="/tv/:id" element={<TVDetail />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <ToastProvider>
          <SettingsProvider>
            <MediaStatusProvider>
              <ScanProvider>
                <Router>
                  <AppContent />
                </Router>
              </ScanProvider>
            </MediaStatusProvider>
          </SettingsProvider>
        </ToastProvider>
      </I18nextProvider>
    </ErrorBoundary>
  )
}

export default App
