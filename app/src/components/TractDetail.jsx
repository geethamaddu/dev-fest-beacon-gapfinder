import { useState } from 'react'
import { PROBLEM_TYPES, TYPES, evidence, resources, snapDetails, tractLabel, typeConfidence } from '../lib/classify.js'
import { decisionKey, latestDecision, setDecision, undoDecision, useStore } from '../lib/store.js'

const fmt = (ts) => new Date(ts).toLocaleString()
const DARK_PILLS = ['transport', 'snap']

export function TypePill({ type }) {
  return (
    <span className="pill" style={{ background: TYPES[type].color, color: DARK_PILLS.includes(type) ? '#fff' : undefined }}>
      {TYPES[type].name}
    </span>
  )
}

export function StatusChip({ status }) {
  const s = status || 'pending'
  return <span className={`status status-${s}`}>{s === 'pending' ? 'Pending review' : s[0].toUpperCase() + s.slice(1)}</span>
}

export default function TractDetail({ p, region, Q }) {
  const { decisions, history } = useStore()
  const [note, setNote] = useState('')
  const label = tractLabel(p)
  const d = decisions[decisionKey(region.id, p.geoid)]
  const last = latestDecision(history, region.id, p.geoid)
  const ev = evidence(p, Q, region)
  const snap = snapDetails(p, Q)
  const problems = p._types.filter((t) => PROBLEM_TYPES.includes(t))

  function decide(status) {
    setDecision(region.id, p.geoid, label, status, note.trim())
    setNote('')
  }

  return (
    <div className="card detail">
      <div className="detail-head">
        <h3>{p.county}, tract {p.geoid.slice(5)}</h3>
        <StatusChip status={d?.status} />
      </div>
      <div className="pills">
        {p._types.map((t) => <TypePill key={t} type={t} />)}
      </div>
      <div className="kv"><span>Confidence</span><b>{p._conf}</b></div>
      {p._types.includes('snap') && <div className="kv"><span>SNAP estimate confidence</span><b>{p._snapConf}</b></div>}
      <div className="kv"><span>Review tier</span><b>{p._tier}</b></div>

      <p className="lbl">Supporting evidence</p>
      <ul>
        {ev.sup.map((x) => <li key={x}>{x}</li>)}
        {snap.lines.map((x) => <li key={x}>{x}</li>)}
      </ul>
      <p className="lbl">Limiting evidence</p>
      <ul>
        {ev.lim.map((x) => <li key={x}>{x}</li>)}
        {snap.cautions.map((x) => <li key={x}>{x}</li>)}
      </ul>

      <p className="lbl">Recommended resources</p>
      {problems.length === 0 ? (
        <ul>{resources(p._t, region).map((r) => <li key={r.text}>{r.text}</li>)}</ul>
      ) : (
        problems.map((t) => (
          <div key={t} className="rec-group" style={{ borderLeftColor: TYPES[t].color }}>
            <div className="rec-head">For {TYPES[t].name} <span className="muted small">({typeConfidence(p, t)} confidence)</span></div>
            <ul>
              {resources(t, region).map((r) => (
                <li key={r.text}>{r.text} {r.link && <a href={r.link.url} target="_blank" rel="noopener noreferrer">{r.link.name}</a>}</li>
              ))}
            </ul>
          </div>
        ))
      )}

      <div className="decision">
        <p className="lbl">Review: reason (optional), then approve or reject</p>
        <textarea
          value={note}
          placeholder="Why do you approve or reject? Local knowledge, next steps..."
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
        <div className="btn-row">
          <button className="btn approve" onClick={() => decide('approved')}>Approve</button>
          <button className="btn reject" onClick={() => decide('rejected')}>Reject</button>
          {last && (
            <button className="btn" onClick={() => undoDecision(last.id)} title={`Undo: ${last.detail}`}>
              Undo {last.status === 'approved' ? 'approval' : 'rejection'}
            </button>
          )}
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
