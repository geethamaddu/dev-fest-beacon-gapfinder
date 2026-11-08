import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import TractDetail from '../components/TractDetail.jsx'
import { CONF_RANK, TYPES, TYPE_ORDER, f1, tractLabel } from '../lib/classify.js'
import { logEvent } from '../lib/store.js'

const MIN_W = 280
const MAX_W = 760
const readWidth = () => {
  try { return Math.min(MAX_W, Math.max(MIN_W, Number(localStorage.getItem('bgf_panel_w')) || 400)) } catch { return 400 }
}

function Chevron({ dir }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d={dir === 'left' ? 'M10 3 L5 8 L10 13' : 'M6 3 L11 8 L6 13'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function MapFinder({ entry, region, selected, onSelect }) {
  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const selectedRef = useRef(selected)
  const onSelectRef = useRef(onSelect)
  const [width, setWidth] = useState(readWidth)
  const [collapsed, setCollapsed] = useState(false)
  selectedRef.current = selected
  onSelectRef.current = onSelect

  const { fc, analysis } = entry
  const selectedProps = selected && fc.features.find((f) => f.properties.geoid === selected.geoid)?.properties

  const style = (f) => {
    const sel = selectedRef.current?.geoid === f.properties.geoid
    return { fillColor: TYPES[f.properties._t].color, fillOpacity: 0.65, color: sel ? '#000' : '#555', weight: sel ? 3 : 0.5 }
  }

  useEffect(() => {
    const map = L.map(mapEl.current, { zoomControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    mapRef.current = map
    return () => map.remove()
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (layerRef.current) layerRef.current.remove()
    const layer = L.geoJSON(fc, {
      style,
      onEachFeature: (f, l) => l.on('click', () => onSelectRef.current(f.properties.geoid, { zoom: false, source: 'map' })),
    }).addTo(map)
    layerRef.current = layer
    map.invalidateSize()
    map.fitBounds(layer.getBounds())
  }, [fc])

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    layer.setStyle(style)
    if (selected?.zoom) {
      layer.eachLayer((l) => {
        if (l.feature.properties.geoid === selected.geoid) {
          mapRef.current.fitBounds(l.getBounds(), { maxZoom: 13 })
          l.bringToFront()
        }
      })
    }
  }, [selected])

  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 0)
    return () => clearTimeout(t)
  }, [width, collapsed])

  function startResize(e) {
    e.preventDefault()
    document.body.classList.add('resizing')
    let latest = width
    const move = (ev) => {
      latest = Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - ev.clientX))
      setWidth(latest)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.classList.remove('resizing')
      try { localStorage.setItem('bgf_panel_w', String(latest)) } catch { /* ignore */ }
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  function togglePanel(open) {
    setCollapsed(!open)
    logEvent('panel', { region: region.id, detail: open ? 'Expanded the side panel' : 'Collapsed the side panel' })
  }

  const scenarios = useMemo(() => {
    const ps = fc.features.map((f) => f.properties)
    const pick = (t) => ps.filter((p) => p._t === t)
      .sort((a, b) => CONF_RANK[a._conf] - CONF_RANK[b._conf] || (b.poverty_pct || 0) - (a.poverty_pct || 0))[0]
    return [
      { label: 'Clear classic food desert', t: 'classic', why: 'High poverty and LILA flag' },
      { label: 'Transportation-compounded', t: 'transport', why: 'LILA flag and high no-transport rate', na: !region.hasTransport },
      { label: 'Blind spot', t: 'blind', why: 'Moderate indicators, no top quartile' },
      { label: 'Insufficient data', t: 'insufficient', why: 'Missing estimate or tiny population' },
      { label: 'Partial signal', t: 'partial', why: 'One indicator high, no gap type' },
    ].map((s) => ({ ...s, p: s.na ? null : pick(s.t) }))
  }, [fc, region])

  return (
    <div className="map-page">
      <div className="map-wrap">
        <div ref={mapEl} className="map" />
        <button className="map-btn fit" onClick={() => mapRef.current.fitBounds(layerRef.current.getBounds())}>Fit {region.name}</button>
        {collapsed && (
          <button className="edge-toggle expand" onClick={() => togglePanel(true)} aria-label="Expand panel" title="Expand panel">
            <Chevron dir="left" />
          </button>
        )}
        <div className="legend">
          {TYPE_ORDER.filter((t) => t !== 'transport' || region.hasTransport).map((t) => (
            <div key={t}><i className="sw" style={{ background: TYPES[t].color }} />{TYPES[t].name}</div>
          ))}
        </div>
      </div>

      {!collapsed && (
        <aside className="panel" style={{ width }}>
          <div className="resizer" onMouseDown={startResize} title="Drag to resize" />
          <button className="edge-toggle collapse" onClick={() => togglePanel(false)} aria-label="Collapse panel" title="Collapse panel">
            <Chevron dir="right" />
          </button>
          <div className="panel-head">
            <span>{region.name}</span>
          </div>
          <div className="panel-body">
            {selectedProps
              ? <TractDetail key={selectedProps.geoid} p={selectedProps} region={region} Q={analysis.Q} />
              : <div className="card muted">Click a tract on the map to see its gap type, evidence and recommended resources.</div>}

            <div className="card">
              <p className="lbl">Gap types across {analysis.total} tracts</p>
              {TYPE_ORDER.map((t) => (
                <div className="kv" key={t}>
                  <span><i className="sw" style={{ background: TYPES[t].color }} />{TYPES[t].name}</span>
                  <b>{t === 'transport' && !region.hasTransport ? 'N/A' : analysis.counts[t]}</b>
                </div>
              ))}
              <p className="lbl top-gap">Top quartile: poverty {f1(analysis.Q.pov[2])} or more{analysis.Q.trn ? `; no reliable transportation ${f1(analysis.Q.trn[2])} or more` : ''}.</p>
            </div>

            <div className="card">
              <p className="lbl">Test scenarios (click to open an example tract)</p>
              {scenarios.map((s) => (
                <div
                  key={s.label}
                  className={`row-item ${s.p ? 'clickable' : ''}`}
                  onClick={() => s.p && onSelect(s.p.geoid, { zoom: true, source: 'scenario' })}
                >
                  <div>
                    <div>{s.label}</div>
                    <small>{s.na ? 'Not available: no transportation data for this region' : s.p ? `${tractLabel(s.p)}: ${s.why}` : 'No example in this region'}</small>
                  </div>
                  <b className={s.na ? 'muted' : s.p ? 'pass' : 'fail'}>{s.na ? 'N/A' : s.p ? 'Pass' : 'None'}</b>
                </div>
              ))}
            </div>

            <div className="card warn">
              {region.hasTransport
                ? 'Data note: poverty and SNAP figures are 2024 Census estimates with margins of error. Transportation is a CDC model-based estimate. SNAP retailers are not joined to tracts.'
                : 'Data note: no-reliable-transportation data is not available for this region, so Transportation-Compounded gaps cannot be detected. Poverty and SNAP figures are 2024 Census estimates with margins of error.'}
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}
