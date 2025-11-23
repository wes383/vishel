import { HashRouter as Router, Routes, Route } from 'react-router-dom'
import SettingsPage from './pages/Settings'
import LibraryPage from './pages/Library'
import MovieDetail from './pages/MovieDetail'
import TVDetail from './pages/TVDetail'

function App() {
  return (
    <Router>
      <div className="h-screen bg-neutral-900 text-white overflow-hidden">
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
    </Router>
  )
}

export default App
