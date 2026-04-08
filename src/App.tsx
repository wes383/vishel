import { HashRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import SettingsPage from './pages/Settings'
import LibraryPage from './pages/Library'
import MovieDetail from './pages/MovieDetail'
import TVDetail from './pages/TVDetail'

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()

  const [isWideScreen, setIsWideScreen] = useState(() => window.innerWidth >= 1024)

  useEffect(() => {
    const handleResize = () => setIsWideScreen(window.innerWidth >= 1024)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const isDetailOrSettingsPage = useMemo(() => {
    const path = location.pathname
    return path === '/settings'
  }, [location.pathname])

  const titleBarTransparent = isWideScreen && isDetailOrSettingsPage
  const isSettingsNarrow = !isWideScreen && location.pathname === '/settings'
  const titleBarBlur = !titleBarTransparent && !isSettingsNarrow ? 'bg-gradient-to-b' : ''
  const titleBarStyle = !titleBarTransparent && !isSettingsNarrow ? { background: 'linear-gradient(to bottom, rgba(23,23,23,0.6) 0%, rgba(23,23,23,0.35) 10%, rgba(23,23,23,0.18) 25%, rgba(23,23,23,0.1) 40%, rgba(23,23,23,0.05) 55%, rgba(23,23,23,0.02) 70%, transparent 85%)' } : isSettingsNarrow ? { background: '#171717' } : {}

  useEffect(() => {
    const handleNavigateToTab = (_event: any, tab: 'all' | 'movies' | 'tv' | 'history') => {
      sessionStorage.setItem('library_active_tab', tab)
      if (location.pathname !== '/') {
        navigate('/')
      }
    }

    window.electron.ipcRenderer.on('navigate-to-tab', handleNavigateToTab)

    return () => {
      window.electron.ipcRenderer.off('navigate-to-tab', handleNavigateToTab)
    }
  }, [navigate, location])

  return (
    <div className="h-screen bg-neutral-900 text-white overflow-hidden flex flex-col">
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
      <Router>
        <AppContent />
      </Router>
    </ErrorBoundary>
  )
}

export default App
