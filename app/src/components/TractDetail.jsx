import { useState } from 'react'
import { TYPES, evidence, resources, tractLabel } from '../lib/classify.js'
import { addNote, decisionKey, setDecision, useStore } from '../lib/store.js'

const fmt = (ts) => new Date(ts).toLocaleString()

export function TypePill({ type }) {
  return <span className="pill" style={{ background: TYPES[type].color }}>{TYPES[type].name}</span>
}

export function StatusChip({ status }) {
  const s = status || 'pending'
  return <span className={`status status-${s}`}>{s === 'pending' ? 'Pending review' : s[0].toUpperCase() + s.slice(1)}</span>
}

export default function TractDetail({ p, region, Q }) {
  const { decisions } = useStore()
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const label = tractLabel(p)
  const d = decisions[decisionKey(region.id, p.geoid)]
  const ev = evidence(p, Q, region)

  function decide(status) {
    setDecision(region.id, p.geoid, label, status, note.trim())
    setNote('')
    setErr('')
  }
  function saveNote() {
    if (!note.trim()) { setErr('Write a note first'); return }
    addNote(region.id, p.geoid, label, note.trim())
    setNote('')
    setErr('')
  }

  return (
    <div className="card detail">
      <div className="detail-head">
        <h3>{p.county}, tract {p.geoid.slice(5)}</h3>
        <StatusChip status={d?.status} />
      </div>
      <div className="pills">
        <TypePill type={p._t} />
        {p._t2 && <TypePill type={p._t2} />}
      </div>
      <div className="kv"><span>Confidence</span><b>{p._conf}</b></div>
      <div className="kv"><span>Review tier</span><b>{p._tier}</b></div>

      <p className="lbl">Supporting evidence</p>
      <ul>{ev.sup.map((x) => <li key={x}>{x}</li>)}</ul>
      <p className="lbl">Limiting evidence</p>
      <ul>{ev.lim.map((x) => <li key={x}>{x}</li>)}</ul>
      <p className="lbl">Recommended resources</p>
      <ul>
        {resources(p._t, region).map((r) => (
          <li key={r.text}>{r.text} {r.link && <a href={r.link.url} target="_blank" rel="noopener noreferrer">{r.link.name}</a>}</li>
        ))}
      </ul>

      <div className="decision">
        <p className="lbl">Review and notes</p>
        <textarea
          value={note}
          placeholder="Why do you approve or reject? Local knowledge, next steps..."
          onChange={(e) => { setNote(e.target.value); setErr('') }}
          rows={3}
        />
        {err && <div className="field-error">{err}</div>}
        <div className="btn-row">
          <button className="btn approve" onClick={() => decide('approved')}>Approve</button>
          <button className="btn reject" onClick={() => decide('rejected')}>Reject</button>
          <button className="btn" onClick={saveNote}>Add note</button>
        </div>
        {d?.notes?.length > 0 && (
          <ul className="notes">
            {[...d.notes].reverse().map((n) => (
              <li key={n.ts}>
                <div className="note-meta">{fmt(n.ts)}{n.status ? ` · ${n.status}` : ''}</div>
                <div>{n.text}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
