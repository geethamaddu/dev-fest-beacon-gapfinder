import { useState } from 'react'
import { clearHistory, useStore } from '../lib/store.js'
import { regionById } from '../lib/regions.js'

const TYPE_LABELS = {
  page: 'Page view',
  region: 'Region change',
  tract: 'Tract opened',
  scenario: 'Test scenario',
  decision: 'Decision',
  note: 'Note',
  panel: 'Panel',
}

export default function History({ onOpen }) {
  const { history } = useStore()
  const [type, setType] = useState('all')
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = history.filter((h) =>
    (type === 'all' || h.type === type) &&
    (!needle || `${h.detail || ''} ${h.label || ''}`.toLowerCase().includes(needle)))

  function clearAll() {
    if (window.confirm('Clear the whole activity history? Decisions and notes are kept.')) clearHistory()
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>History</h1>
        <p className="muted">Everything done in this browser: pages opened, region changes, tracts viewed, decisions and notes. Stored locally in this browser.</p>
      </div>
      <div className="card toolbar">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All activity</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search history" />
        <span className="muted small">{rows.length} of {history.length} entries</span>
        <button className="btn" onClick={clearAll}>Clear history</button>
      </div>
      <div className="card">
        {rows.length === 0 && <p className="muted">No activity yet.</p>}
        <table className="history">
          <tbody>
            {rows.map((h) => (
              <tr key={h.id}>
                <td className="nowrap muted small">{new Date(h.ts).toLocaleString()}</td>
                <td><span className={`tag tag-${h.type}`}>{TYPE_LABELS[h.type] || h.type}</span></td>
                <td className="nowrap small">{h.region ? regionById(h.region).name : ''}</td>
                <td>{h.detail}</td>
                <td>{h.geoid && <button className="btn small" onClick={() => onOpen(h.region, h.geoid)}>Open</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
