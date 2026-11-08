import { useMemo } from 'react'
import { ACTION_LABEL, PROBLEM_TYPES, TYPES, f1, isFlagged, priorityCompare, typeConfidence } from '../lib/classify.js'
import { decisionKey, useStore } from '../lib/store.js'
import { StatusChip, TypePill } from '../components/TractDetail.jsx'

const BAR_TYPES = ['classic', 'transport', 'snap', 'blind']

export default function Dashboard({ entry, region, onOpen }) {
  const { decisions } = useStore()
  const { fc, analysis } = entry
  const ps = useMemo(() => fc.features.map((f) => f.properties), [fc])
  const flagged = useMemo(() => ps.filter(isFlagged).sort(priorityCompare), [ps])
  const statusOf = (p) => decisions[decisionKey(region.id, p.geoid)]?.status || 'pending'
  // Count every decision in this region, not only the flagged tracts.
  const regionDecisions = Object.entries(decisions).filter(([k]) => k.startsWith(`${region.id}:`)).map(([, d]) => d.status)
  const approved = regionDecisions.filter((s) => s === 'approved').length
  const rejected = regionDecisions.filter((s) => s === 'rejected').length
  const pending = flagged.filter((p) => statusOf(p) === 'pending').length
  const decided = approved + rejected

  const byCounty = useMemo(() => {
    const m = {}
    for (const p of ps) {
      const c = (m[p.county] ||= { county: p.county, tracts: 0, classic: 0, transport: 0, snap: 0, blind: 0 })
      c.tracts++
      for (const t of p._types) if (t in c) c[t]++
    }
    return Object.values(m).sort((a, b) => b.classic + b.transport + b.snap - (a.classic + a.transport + a.snap))
  }, [ps])
  const maxBar = Math.max(1, ...byCounty.map((c) => BAR_TYPES.reduce((s, t) => s + c[t], 0)))

  const stats = [
    { label: 'Tracts analyzed', value: analysis.total },
    { label: 'Classic food deserts', value: analysis.counts.classic, color: TYPES.classic.color },
    { label: 'Transportation-compounded', value: region.hasTransport ? analysis.counts.transport : 'N/A', color: TYPES.transport.color },
    { label: 'SNAP enrollment gaps', value: analysis.counts.snap, color: TYPES.snap.color },
    { label: 'Possible blind spots', value: analysis.counts.blind, color: TYPES.blind.color },
    // Flagged tracts (any problem gap type) with no approve/reject yet; updates live as decisions are made or undone.
    { label: 'Actions pending', value: `${pending} of ${flagged.length}` },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <h1>{region.name} dashboard</h1>
        <p className="muted">Counties: {region.counties}. Gap types follow DataKind's taxonomy plus our SNAP Enrollment Gap; quartiles are computed within this region.</p>
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
          <p className="muted small">
            Tracts with a Classic Food Desert, Transportation-Compounded Gap or SNAP Enrollment Gap ({flagged.length} in this region),
            ranked: more gap types first, then higher confidence, then higher poverty.
          </p>
          {flagged.length === 0 && <p>No flagged tracts in this region.</p>}
          <ol className="problems">
            {flagged.slice(0, 10).map((p) => {
              const problems = p._types.filter((t) => PROBLEM_TYPES.includes(t))
              return (
                <li key={p.geoid}>
                  <div className="problem-main">
                    <div className="problem-title">
                      <b>{p.county}, tract {p.geoid.slice(5)}</b>
                      <StatusChip status={statusOf(p)} />
                    </div>
                    <div className="pills">{p._types.map((t) => <TypePill key={t} type={t} />)}</div>
                    <div className="problem-facts">
                      Poverty {f1(p.poverty_pct)}
                      {p.lila_half_10 === 1 && ' · LILA food desert flag'}
                      {region.hasTransport && ` · ${f1(p.no_transport_pct)} no reliable transport`}
                      {problems.includes('snap') && ` · about ${Math.round(p.poor_hh_no_snap).toLocaleString()} of ${Math.round(p.poor_hh).toLocaleString()} poor households not on SNAP`}
                      {' · '}{typeConfidence(p, p._t)} confidence
                    </div>
                    <div className="problem-action">Recommended: {problems.map((t) => ACTION_LABEL[t]).join(' + ')}</div>
                  </div>
                  <button className="btn" onClick={() => onOpen(p.geoid)}>Open on map</button>
                </li>
              )
            })}
          </ol>
        </section>

        <div className="dash-side">
          <section className="card">
            <h2>Review progress</h2>
            <div className="kv"><span>Approved</span><b>{approved}</b></div>
            <div className="kv"><span>Rejected</span><b>{rejected}</b></div>
            <div className="kv"><span>Top problems still pending</span><b>{pending} of {flagged.length}</b></div>
            <div className="progress">
              <div style={{ width: `${(100 * approved) / Math.max(1, decided + pending)}%`, background: '#388D58' }} />
              <div style={{ width: `${(100 * rejected) / Math.max(1, decided + pending)}%`, background: '#C44A4A' }} />
            </div>
            <p className="muted small" style={{ margin: '8px 0 0' }}>
              Counts every decision in {region.name}, including tracts outside the top problems list. Decisions are saved in this browser only.
            </p>
          </section>

          <section className="card">
            <h2>Gaps by county</h2>
            {byCounty.map((c) => (
              <div className="county" key={c.county}>
                <div className="kv"><span>{c.county}</span><span className="muted small">{c.tracts} tracts</span></div>
                <div className="bar">
                  {BAR_TYPES.map((t) => (
                    <div key={t} style={{ width: `${(100 * c[t]) / maxBar}%`, background: TYPES[t].color }} title={`${c[t]} ${TYPES[t].name}`} />
                  ))}
                </div>
                <div className="muted small">
                  {c.classic} classic{region.hasTransport ? `, ${c.transport} transportation` : ''}, {c.snap} SNAP, {c.blind} blind spots
                </div>
              </div>
            ))}
          </section>

          <section className="card warn small">
            <p style={{ margin: 0 }}><b>Transportation:</b> {region.transportNote}</p>
            <p style={{ margin: '6px 0 0' }}>ACS figures have margins of error; check low-confidence tracts with local staff.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
