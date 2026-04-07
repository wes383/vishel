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

  const isMac = useMemo(() => window.electron?.platform === 'darwin', [])
  const isDetailOrSettingsPage = useMemo(() => {
    const path = location.pathname
    return path.startsWith('/movie') || path.startsWith('/tv') || path === '/settings'
  }, [location.pathname])
  
  const titleBarTransparent = isWideScreen && isDetailOrSettingsPage
  const titleBarBlur = !isMac && !titleBarTransparent ? 'bg-[#171717]/80 backdrop-blur-md' : ''

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
      <div className={`titlebar-drag-region h-8 w-full fixed top-0 left-0 z-[100] bg-transparent ${titleBarBlur}`} />
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
