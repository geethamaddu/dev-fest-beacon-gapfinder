// Gap taxonomy for Beacon food access: DataKind's types (Appendix B notes) plus
// our SNAP Enrollment Gap. A tract can have more than one problem gap type.
export const SNAP_COLOR = '#4A7CD0' // brand Info blue
export const TYPES = {
  classic: { name: 'Classic Food Desert', color: '#E24B4A' },
  transport: { name: 'Transportation-Compounded Gap', color: '#8E5BD0' },
  snap: { name: 'SNAP Enrollment Gap', color: SNAP_COLOR },
  blind: { name: 'Possible Blind Spot', color: '#EF9F27' },
  partial: { name: 'Partial signal', color: '#F3E3A0' },
  none: { name: 'No gap flagged', color: '#A9D17A' },
  insufficient: { name: 'Insufficient data', color: '#B4B2A9' },
}
export const PROBLEM_TYPES = ['classic', 'transport', 'snap'] // gap types that come with a recommendation
export const TYPE_ORDER = ['classic', 'transport', 'snap', 'blind', 'partial', 'none', 'insufficient']
export const CONF_RANK = { High: 0, Medium: 1, Low: 2 }
export const SNAP_MIN_POOR_HH = 30

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

const isInsufficient = (p) =>
  p.poverty_pct == null || p.far_half_share == null || p.lila_half_10 == null || (p.population || 0) < 500
const snapEligible = (p) => !isInsufficient(p) && p.poor_no_snap_pct != null && (p.poor_hh || 0) >= SNAP_MIN_POOR_HH

// Returns the tract's gap types, most important first.
function classify(p, Q) {
  if (isInsufficient(p)) return ['insufficient']
  const povTop = inTop(p.poverty_pct, Q.pov)
  const lila = p.lila_half_10 === 1
  const accTop = inTop(p.far_half_share, Q.acc)
  const trnTop = inTop(p.no_transport_pct, Q.trn)
  const snapGap = snapEligible(p) && p.poverty_pct >= Q.pov[1] && inTop(p.poor_no_snap_pct, Q.snapGap)

  const types = []
  if (povTop && lila) types.push('classic')
  if (lila && trnTop) types.push('transport')
  if (snapGap) types.push('snap')
  if (types.length) return types
  if (povTop || lila || accTop || trnTop) return ['partial']

  let second = 0
  if (inSecond(p.poverty_pct, Q.pov)) second++
  if (inSecond(p.far_half_share, Q.acc)) second++
  if (Q.trn && inSecond(p.no_transport_pct, Q.trn)) second++
  return [second >= 2 ? 'blind' : 'none']
}

export function confidence(p) {
  if (p.poverty_pct == null) return 'Low'
  if ((p.population || 0) < 1000 || (p.poverty_moe || 0) > 10) return 'Low'
  if ((p.poverty_moe || 0) > 5) return 'Medium'
  return 'High'
}

function snapConfidence(p) {
  if ((p.poor_hh || 0) < 100 || p.poor_no_snap_pct >= 95 || p._conf === 'Low') return 'Low'
  return p._conf
}

// Confidence for one gap type of a tract (SNAP has its own reliability checks).
export const typeConfidence = (p, t) => (t === 'snap' ? p._snapConf : p._conf)

export function tier(type, conf) {
  if (PROBLEM_TYPES.includes(type)) {
    return conf === 'Low' ? 'Tier 2: human review before use' : 'Tier 1: recommend, human approves'
  }
  if (type === 'none') return 'No review needed'
  return 'Tier 3: review required, no auto-recommendation'
}

export const isFlagged = (p) => p._types.some((t) => PROBLEM_TYPES.includes(t))

// Adds _types, _t (main type), _conf, _snapConf, _tier to every tract (once per region).
export function analyze(fc, region) {
  const ps = fc.features.map((f) => f.properties)
  const Q = {
    pov: quartiles(ps.map((p) => p.poverty_pct)),
    acc: quartiles(ps.map((p) => p.far_half_share)),
    trn: region.hasTransport ? quartiles(ps.map((p) => p.no_transport_pct)) : null,
    snapPct: quartiles(ps.map((p) => p.snap_pct)),
    snapGap: quartiles(ps.filter(snapEligible).map((p) => p.poor_no_snap_pct)),
  }
  const counts = Object.fromEntries(TYPE_ORDER.map((t) => [t, 0]))
  let flagged = 0
  for (const p of ps) {
    p._types = classify(p, Q)
    p._t = p._types[0]
    p._conf = confidence(p)
    p._snapConf = p._types.includes('snap') ? snapConfidence(p) : null
    p._tier = tier(p._t, typeConfidence(p, p._t))
    for (const t of p._types) counts[t]++
    if (isFlagged(p)) flagged++
  }
  return { Q, counts, flagged, total: ps.length }
}

export function snapDetails(p, Q) {
  const lines = []
  if (p.snap_pct != null) lines.push(`${f1(p.snap_pct)} of all households receive SNAP (region median ${f1(Q.snapPct?.[1])})`)
  if (p.poor_no_snap_pct != null && p.poor_hh != null) {
    lines.push(`${f1(p.poor_no_snap_pct)} of poor households do not receive SNAP: about ${Math.round(p.poor_hh_no_snap).toLocaleString()} of ${Math.round(p.poor_hh).toLocaleString()} (top quartile starts at ${f1(Q.snapGap?.[2])})`)
  }
  const cautions = []
  if (p.poor_no_snap_pct != null && p.poor_no_snap_pct >= 95) cautions.push('Nearly all poor households are off SNAP. This can mean student housing or a small Census sample; check locally.')
  if (p.poor_hh != null && p.poor_hh < 100) cautions.push(`Only about ${Math.round(p.poor_hh)} poor households, so the SNAP estimate is less reliable.`)
  return { lines, cautions }
}

export function evidence(p, Q, region) {
  const sup = []
  const lim = []
  if (p.poverty_pct != null) sup.push(`Poverty ${f1(p.poverty_pct)} (top quartile starts at ${f1(Q.pov[2])}, median ${f1(Q.pov[1])})`)
  if (p.lila_half_10 === 1) sup.push('USDA low-income, low-access (LILA) tract: 1/2 mile urban, 10 miles rural')
  if (p.far_half_share != null) sup.push(`${f1(p.far_half_share)} of residents live over 1/2 mile from a SNAP retailer`)
  if (region.hasTransport && p.no_transport_pct != null) {
    sup.push(`${f1(p.no_transport_pct)} of adults lack reliable transportation (top quartile starts at ${f1(Q.trn[2])})`)
  }

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
  if (type === 'snap') {
    return [
      { text: 'SNAP registration drive: host sign-up events at trusted places (library, school, church, pantry)' },
      { text: 'Help families apply with the state SNAP office or a local benefits partner' },
    ]
  }
  if (type === 'none') return [{ text: 'None needed' }]
  return [{ text: 'No auto-recommendation. Review required.' }]
}

// Short action label for lists.
export const ACTION_LABEL = {
  classic: 'Food bank or mobile pantry',
  transport: 'Mobile pantry or delivery',
  snap: 'SNAP registration drive',
}

// Address first: tracts with more problem types, then higher confidence, then higher poverty.
export function priorityCompare(a, b) {
  const n = (p) => p._types.filter((t) => PROBLEM_TYPES.includes(t)).length
  return n(b) - n(a)
    || CONF_RANK[typeConfidence(a, a._t)] - CONF_RANK[typeConfidence(b, b._t)]
    || (b.poverty_pct || 0) - (a.poverty_pct || 0)
}
