import { useState } from 'react'
import { clearHistory, latestDecision, undoDecision, useStore } from '../lib/store.js'
import { regionById } from '../lib/regions.js'

const FILTERS = {
  all: 'All actions',
  approved: 'Approved',
  rejected: 'Rejected',
  undo: 'Undo',
}

const actionLabel = (h) => (h.type === 'undo' ? 'Undo' : h.status === 'approved' ? 'Approved' : 'Rejected')
const tagClass = (h) => (h.type === 'undo' ? 'tag-undo' : h.status === 'approved' ? 'tag-approved' : 'tag-rejected')

export default function History({ onOpen }) {
  const { history } = useStore()
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = history.filter((h) =>
    (filter === 'all' || (filter === 'undo' ? h.type === 'undo' : h.type === 'decision' && h.status === filter)) &&
    (!needle || `${h.detail || ''} ${h.label || ''}`.toLowerCase().includes(needle)))

  function clearAll() {
    if (window.confirm('Clear the whole action history? Current approve/reject decisions are kept.')) clearHistory()
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1>History</h1>
        <p className="muted">Every action taken in this browser: approvals, rejections with their reasons, and undos. Stored locally in this browser.</p>
      </div>
      <div className="card toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          {Object.entries(FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by tract or reason" />
        <span className="muted small">{rows.length} of {history.length} actions</span>
        <button className="btn" onClick={clearAll}>Clear history</button>
      </div>
      <div className="card">
        {rows.length === 0 && <p className="muted">No actions yet. Approve or reject a tract on the Map Finder to see it here.</p>}
        <table className="history">
          <tbody>
            {rows.map((h) => {
              const canUndo = h.type === 'decision' && !h.undone && latestDecision(history, h.region, h.geoid)?.id === h.id
              return (
                <tr key={h.id} className={h.undone ? 'undone' : ''}>
                  <td className="nowrap muted small">{new Date(h.ts).toLocaleString()}</td>
                  <td><span className={`tag ${tagClass(h)}`}>{actionLabel(h)}</span></td>
                  <td className="nowrap small">{h.region ? regionById(h.region).name : ''}</td>
                  <td>
                    {h.detail}
                    {h.undone && <span className="muted small"> (undone)</span>}
                  </td>
                  <td className="nowrap">
                    {canUndo && <button className="btn small" onClick={() => undoDecision(h.id)}>Undo</button>}{' '}
                    {h.geoid && <button className="btn small" onClick={() => onOpen(h.region, h.geoid)}>Open</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
