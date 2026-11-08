import { useMemo } from 'react'
import { TYPES, f1, isFlagged, priorityCompare, resources } from '../lib/classify.js'
import { decisionKey, useStore } from '../lib/store.js'
import { StatusChip, TypePill } from '../components/TractDetail.jsx'

export default function Dashboard({ entry, region, onOpen }) {
  const { decisions } = useStore()
  const { fc, analysis } = entry
  const ps = useMemo(() => fc.features.map((f) => f.properties), [fc])
  const flagged = useMemo(() => ps.filter(isFlagged).sort(priorityCompare), [ps])
  const statusOf = (p) => decisions[decisionKey(region.id, p.geoid)]?.status || 'pending'
  const approved = flagged.filter((p) => statusOf(p) === 'approved').length
  const rejected = flagged.filter((p) => statusOf(p) === 'rejected').length
  const pending = flagged.length - approved - rejected
  const review = analysis.counts.blind + analysis.counts.partial + analysis.counts.insufficient

  const byCounty = useMemo(() => {
    const m = {}
    for (const p of ps) {
      const c = (m[p.county] ||= { county: p.county, tracts: 0, classic: 0, transport: 0, blind: 0 })
      c.tracts++
      for (const t of [p._t, p._t2]) if (t === 'classic' || t === 'transport' || t === 'blind') c[t]++
    }
    return Object.values(m).sort((a, b) => b.classic + b.transport - (a.classic + a.transport))
  }, [ps])
  const maxBar = Math.max(1, ...byCounty.map((c) => c.classic + c.transport + c.blind))

  const stats = [
    { label: 'Tracts analyzed', value: analysis.total },
    { label: 'Classic food deserts', value: analysis.counts.classic, color: TYPES.classic.color },
    { label: 'Transportation-compounded', value: region.hasTransport ? analysis.counts.transport : 'N/A', color: TYPES.transport.color },
    { label: 'Possible blind spots', value: analysis.counts.blind, color: TYPES.blind.color },
    { label: 'Need human review', value: review },
    { label: 'Decisions pending', value: `${pending} of ${flagged.length}` },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <h1>{region.name} dashboard</h1>
        <p className="muted">Counties: {region.counties}. Gap types follow DataKind's taxonomy; quartiles are computed within this region.</p>
      </div>

      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.label} style={s.color ? { borderTopColor: s.color } : undefined}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <section className="card">
          <h2>Top problems to address</h2>
          <p className="muted small">Classic food deserts and transportation-compounded gaps, ranked: both gap types first, then higher confidence, then higher poverty.</p>
          {flagged.length === 0 && <p>No flagged tracts in this region.</p>}
          <ol className="problems">
            {flagged.slice(0, 10).map((p) => (
              <li key={p.geoid}>
                <div className="problem-main">
                  <div className="problem-title">
                    <b>{p.county}, tract {p.geoid.slice(5)}</b>
                    <StatusChip status={statusOf(p)} />
                  </div>
                  <div className="pills">
                    <TypePill type={p._t} />
                    {p._t2 && <TypePill type={p._t2} />}
                  </div>
                  <div className="problem-facts">
                    Poverty {f1(p.poverty_pct)} · {f1(p.far_half_share)} far from a SNAP store
                    {region.hasTransport && ` · ${f1(p.no_transport_pct)} no reliable transport`} · {p._conf} confidence
                  </div>
                  <div className="problem-action">{resources(p._t, region).map((r) => r.text.replace(/:$/, '')).join('; ')}</div>
                </div>
                <button className="btn" onClick={() => onOpen(p.geoid)}>Open on map</button>
              </li>
            ))}
          </ol>
        </section>

        <div className="dash-side">
          <section className="card">
            <h2>Review progress</h2>
            <div className="kv"><span>Approved</span><b>{approved}</b></div>
            <div className="kv"><span>Rejected</span><b>{rejected}</b></div>
            <div className="kv"><span>Pending</span><b>{pending}</b></div>
            <div className="progress">
              <div style={{ width: `${(100 * approved) / Math.max(1, flagged.length)}%`, background: '#3B8F4E' }} />
              <div style={{ width: `${(100 * rejected) / Math.max(1, flagged.length)}%`, background: '#B03A3A' }} />
            </div>
          </section>

          <section className="card">
            <h2>Gaps by county</h2>
            {byCounty.map((c) => (
              <div className="county" key={c.county}>
                <div className="kv"><span>{c.county}</span><span className="muted small">{c.tracts} tracts</span></div>
                <div className="bar">
                  <div style={{ width: `${(100 * c.classic) / maxBar}%`, background: TYPES.classic.color }} title={`${c.classic} classic`} />
                  <div style={{ width: `${(100 * c.transport) / maxBar}%`, background: TYPES.transport.color }} title={`${c.transport} transportation`} />
                  <div style={{ width: `${(100 * c.blind) / maxBar}%`, background: TYPES.blind.color }} title={`${c.blind} blind spots`} />
                </div>
                <div className="muted small">
                  {c.classic} classic{region.hasTransport ? `, ${c.transport} transportation` : ''}, {c.blind} blind spots
                </div>
              </div>
            ))}
          </section>

          <section className="card warn small">
            {region.hasTransport
              ? 'Transportation data is a CDC model-based estimate. ACS figures have margins of error; check low-confidence tracts with local staff.'
              : 'No transportation data for this region, so Transportation-Compounded gaps cannot be detected here.'}
          </section>
        </div>
      </div>
    </div>
  )
}
