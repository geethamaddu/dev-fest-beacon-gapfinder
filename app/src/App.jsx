import { useEffect, useRef, useState } from 'react'
import NavBar from './components/NavBar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import MapFinder from './pages/MapFinder.jsx'
import History from './pages/History.jsx'
import About from './pages/About.jsx'
import { regionById } from './lib/regions.js'
import { analyze, tractLabel } from './lib/classify.js'
import { logEvent } from './lib/store.js'

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
  const lastPage = useRef(null)
  const region = regionById(regionId)
  const entry = entries[regionId]

  useEffect(() => {
    const onHash = () => setPage(readPage())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (lastPage.current === page) return
    lastPage.current = page
    logEvent('page', { region: regionId, detail: `Opened ${PAGES.find((p) => p.id === page).label}` })
  }, [page, regionId])

  useEffect(() => {
    if (entries[regionId]) return
    setError(null)
    fetch(`${import.meta.env.BASE_URL}data/${regionId}.geojson`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((fc) => setEntries((e) => ({ ...e, [regionId]: { fc, analysis: analyze(fc, regionById(regionId)) } })))
      .catch((err) => setError(`Could not load data for ${regionById(regionId).name} (${err.message}). Run the pipeline first.`))
  }, [regionId, entries])

  function changeRegion(id) {
    setRegionId(id)
    setSelected(null)
    try { localStorage.setItem('bgf_region', id) } catch { /* ignore */ }
    logEvent('region', { region: id, detail: `Switched region to ${regionById(id).name}` })
  }

  function openTract(geoid, { zoom = false, goToMap = false, source = 'map' } = {}) {
    setSelected({ geoid, zoom, at: Date.now() })
    const f = entry?.fc.features.find((x) => x.properties.geoid === geoid)
    const label = f ? tractLabel(f.properties) : geoid
    const how = { map: 'on the map', dashboard: 'from the dashboard', history: 'from history', scenario: 'from a test scenario' }[source] || ''
    logEvent(source === 'scenario' ? 'scenario' : 'tract', { region: regionId, geoid, label, detail: `Opened ${label} ${how}`.trim() })
    if (goToMap) window.location.hash = '#/map'
  }

  let body
  if (page === 'about') body = <About />
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
