import { useEffect, useRef, useState } from 'react'
import NavBar from './components/NavBar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import MapFinder from './pages/MapFinder.jsx'
import History from './pages/History.jsx'
import About from './pages/About.jsx'
import { REGIONS, regionById } from './lib/regions.js'
import { analyze } from './lib/classify.js'

const PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'map', label: 'Map Finder' },
  { id: 'history', label: 'History' },
  { id: 'about', label: 'About' },
]
const readPage = () => {
  const h = window.location.hash.replace('#/', '')
  return PAGES.some((p) => p.id === h) ? h : 'dashboard'
}
const readRegion = () => {
  try { return localStorage.getItem('bgf_region') || 'central-florida' } catch { return 'central-florida' }
}

export default function App() {
  const [page, setPage] = useState(readPage)
  const [regionId, setRegionId] = useState(readRegion)
  const [entries, setEntries] = useState({})
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null) // { geoid, zoom }
  const region = regionById(regionId)
  const entry = entries[regionId]

  useEffect(() => {
    const onHash = () => setPage(readPage())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Load the selected region; the About page compares all regions, so it loads every one.
  const loading = useRef(new Set())
  useEffect(() => {
    const ids = page === 'about' ? REGIONS.map((r) => r.id) : [regionId]
    for (const id of ids) {
      if (entries[id] || loading.current.has(id)) continue
      loading.current.add(id)
      if (id === regionId) setError(null)
      fetch(`${import.meta.env.BASE_URL}data/${id}.geojson`)
        .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
        .then((fc) => setEntries((e) => ({ ...e, [id]: { fc, analysis: analyze(fc, regionById(id)) } })))
        .catch((err) => { if (id === regionId) setError(`Could not load data for ${regionById(id).name} (${err.message}). Run the pipeline first.`) })
        .finally(() => loading.current.delete(id))
    }
  }, [regionId, page, entries])

  function changeRegion(id) {
    setRegionId(id)
    setSelected(null)
    try { localStorage.setItem('bgf_region', id) } catch { /* ignore */ }
  }

  // History records actions only (approve, reject, undo), so opening a tract is not logged.
  function openTract(geoid, { zoom = false, goToMap = false } = {}) {
    setSelected({ geoid, zoom, at: Date.now() })
    if (goToMap) window.location.hash = '#/map'
  }

  let body
  if (page === 'about') body = <About entries={entries} />
  else if (page === 'history') body = <History onOpen={(r, g) => { if (r !== regionId) changeRegion(r); openTract(g, { zoom: true, goToMap: true, source: 'history' }) }} />
  else if (error) body = <div className="page"><div className="card error">{error}</div></div>
  else if (!entry) body = <div className="page"><div className="card">Loading {region.name} data...</div></div>
  else if (page === 'map') body = <MapFinder entry={entry} region={region} selected={selected} onSelect={openTract} />
  else body = <Dashboard entry={entry} region={region} onOpen={(g) => openTract(g, { zoom: true, goToMap: true, source: 'dashboard' })} />

  return (
    <div className="app">
      <NavBar pages={PAGES} page={page} regionId={regionId} onRegion={changeRegion} />
      <main>{body}</main>
    </div>
  )
}
