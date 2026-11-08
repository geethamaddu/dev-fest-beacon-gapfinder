// DataKind gap taxonomy for Beacon food access (Appendix B notes).
export const TYPES = {
  classic: { name: 'Classic Food Desert', color: '#E24B4A' },
  transport: { name: 'Transportation-Compounded Gap', color: '#8E5BD0' },
  blind: { name: 'Possible Blind Spot', color: '#EF9F27' },
  partial: { name: 'Partial signal', color: '#F3E3A0' },
  none: { name: 'No gap flagged', color: '#A9D17A' },
  insufficient: { name: 'Insufficient data', color: '#B4B2A9' },
}
export const TYPE_ORDER = ['classic', 'transport', 'blind', 'partial', 'none', 'insufficient']
export const CONF_RANK = { High: 0, Medium: 1, Low: 2 }

export const f1 = (v) => (v == null ? 'n/a' : `${Math.round(v * 10) / 10}%`)
export const tractLabel = (p) => `${p.county} ${p.geoid.slice(5)}`

function pct(sorted, q) {
  const i = (sorted.length - 1) * q
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

function quartiles(values) {
  const a = values.filter((v) => v != null).sort((x, y) => x - y)
  return a.length ? [pct(a, 0.25), pct(a, 0.5), pct(a, 0.75)] : null
}

// A value of 0 never counts as high: in NYC most tracts have 0% far from a SNAP
// retailer, so every quartile cut-off is 0 and ">= Q3" alone would flag them all.
const inTop = (v, q) => v != null && q != null && v > 0 && v >= q[2]
const inSecond = (v, q) => v != null && q != null && v > 0 && v >= q[1] && v < q[2]

function classify(p, Q) {
  if (p.poverty_pct == null || p.far_half_share == null || p.lila_half_10 == null || (p.population || 0) < 500) {
    return { primary: 'insufficient', secondary: null }
  }
  const povTop = inTop(p.poverty_pct, Q.pov)
  const lila = p.lila_half_10 === 1
  const accTop = inTop(p.far_half_share, Q.acc)
  const trnTop = inTop(p.no_transport_pct, Q.trn)

  const matches = []
  if (povTop && lila) matches.push('classic')
  if (lila && trnTop) matches.push('transport')
  if (matches.length) return { primary: matches[0], secondary: matches[1] || null }
  if (povTop || lila || accTop || trnTop) return { primary: 'partial', secondary: null }

  let second = 0
  if (inSecond(p.poverty_pct, Q.pov)) second++
  if (inSecond(p.far_half_share, Q.acc)) second++
  if (Q.trn && inSecond(p.no_transport_pct, Q.trn)) second++
  return { primary: second >= 2 ? 'blind' : 'none', secondary: null }
}

export function confidence(p) {
  if (p.poverty_pct == null) return 'Low'
  if ((p.population || 0) < 1000 || (p.poverty_moe || 0) > 10) return 'Low'
  if ((p.poverty_moe || 0) > 5) return 'Medium'
  return 'High'
}

export function tier(type, conf) {
  if (type === 'classic' || type === 'transport') {
    return conf === 'Low' ? 'Tier 2: human review before use' : 'Tier 1: recommend, human approves'
  }
  if (type === 'none') return 'No review needed'
  return 'Tier 3: review required, no auto-recommendation'
}

export const isFlagged = (p) => p._t === 'classic' || p._t === 'transport'

// Adds _t, _t2, _conf, _tier to every feature's properties (once per region).
export function analyze(fc, region) {
  const ps = fc.features.map((f) => f.properties)
  const Q = {
    pov: quartiles(ps.map((p) => p.poverty_pct)),
    acc: quartiles(ps.map((p) => p.far_half_share)),
    trn: region.hasTransport ? quartiles(ps.map((p) => p.no_transport_pct)) : null,
  }
  const counts = Object.fromEntries(TYPE_ORDER.map((t) => [t, 0]))
  for (const p of ps) {
    const r = classify(p, Q)
    p._t = r.primary
    p._t2 = r.secondary
    p._conf = confidence(p)
    p._tier = tier(r.primary, p._conf)
    counts[p._t]++
    if (p._t2) counts[p._t2]++
  }
  return { Q, counts, total: ps.length }
}

export function evidence(p, Q, region) {
  const sup = []
  const lim = []
  if (p.poverty_pct != null) sup.push(`Poverty ${f1(p.poverty_pct)} (top quartile starts at ${f1(Q.pov[2])})`)
  if (p.lila_half_10 === 1) sup.push('USDA low-income, low-access (LILA) tract: 1/2 mile urban, 10 miles rural')
  if (p.far_half_share != null) sup.push(`${f1(p.far_half_share)} of residents live over 1/2 mile from a SNAP retailer`)
  if (region.hasTransport && p.no_transport_pct != null) {
    sup.push(`${f1(p.no_transport_pct)} of adults lack reliable transportation (top quartile starts at ${f1(Q.trn[2])})`)
  }
  if (p.poor_no_snap_pct != null) sup.push(`${f1(p.poor_no_snap_pct)} of poor households do not receive SNAP`)

  if (p.poverty_moe != null && p.poverty_moe > 5) lim.push(`Poverty estimate has a wide margin of error (±${f1(p.poverty_moe)})`)
  if ((p.population || 0) < 1000) lim.push(`Small population (${Math.round(p.population || 0).toLocaleString()} residents)`)
  if (p.poverty_pct == null) lim.push('No poverty estimate for this tract')
  if (p.lila_half_10 == null) lim.push('No USDA grocery-access flag for this tract')
  if (!region.hasTransport) lim.push('No transportation data for this region')
  else if (p.no_transport_pct == null) lim.push('No transportation estimate for this tract')
  return { sup, lim }
}

export function resources(type, region) {
  if (type === 'classic') {
    return [
      { text: 'Nearest food bank or pantry:', link: region.resource },
      { text: 'Mobile pantry programs, if listed' },
    ]
  }
  if (type === 'transport') {
    return [
      { text: 'Mobile pantry or delivery-based programs:', link: region.resource },
      { text: 'Transit-accessible pantry locations' },
    ]
  }
  if (type === 'none') return [{ text: 'None needed' }]
  return [{ text: 'No auto-recommendation. Review required.' }]
}

// Higher = address first: tracts with both gap types, then higher poverty.
export function priorityCompare(a, b) {
  const score = (p) => (p._t2 ? 2 : 1)
  return score(b) - score(a) || CONF_RANK[a._conf] - CONF_RANK[b._conf] || (b.poverty_pct || 0) - (a.poverty_pct || 0)
}
