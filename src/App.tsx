import { HashRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import SettingsPage from './pages/Settings'
import LibraryPage from './pages/Library'
import MovieDetail from './pages/MovieDetail'
import TVDetail from './pages/TVDetail'

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const handleNavigateToTab = (_event: any, tab: 'all' | 'movies' | 'tv' | 'favorites' | 'history') => {
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
      <div className="titlebar-drag-region h-8 w-full fixed top-0 left-0 z-[100] bg-neutral-900/5 saturate-150 backdrop-blur-md" />
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
    <Router>
      <AppContent />
    </Router>
  )
}

export default App
