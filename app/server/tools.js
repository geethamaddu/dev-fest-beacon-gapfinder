// Data tools the chatbot can call. All numbers shown to users come from here,
// never from the model. Classification reuses the app's own rules (src/lib/classify.js).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { analyze, isFlagged, resources, snapDetails, typeConfidence, ACTION_LABEL, PROBLEM_TYPES, SNAP_MIN_POOR_HH, TYPES, TYPE_ORDER } from '../src/lib/classify.js'
import { REGIONS, regionById } from '../src/lib/regions.js'

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')
const cache = new Map()

export function loadRegion(id) {
  if (!REGIONS.some((r) => r.id === id)) throw new Error(`Unknown region "${id}". Valid: ${REGIONS.map((r) => r.id).join(', ')}`)
  if (!cache.has(id)) {
    const fc = JSON.parse(readFileSync(path.join(DATA_DIR, `${id}.geojson`), 'utf8'))
    const region = regionById(id)
    cache.set(id, { region, tracts: fc.features.map((f) => f.properties), analysis: analyze(fc, region) })
  }
  return cache.get(id)
}

const round = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d)
const GAP_KEYS = TYPE_ORDER
const SORT_FIELDS = ['poverty_pct', 'poverty_moe', 'snap_pct', 'population', 'households', 'poor_hh', 'poor_hh_no_snap', 'poor_no_snap_pct', 'far_half_share', 'no_transport_pct']

// Plain-language reason for the confidence level; mirrors confidence() in classify.js.
function confidenceReason(p) {
  const pop = Math.round(p.population || 0)
  if (p.poverty_pct == null) return 'Low: no poverty estimate for this tract'
  const r = []
  if (pop < 1000) r.push(`small population (${pop.toLocaleString()} residents, under 1,000)`)
  if ((p.poverty_moe || 0) > 10) r.push(`poverty margin of error ±${round(p.poverty_moe)} points (over 10)`)
  if (r.length) return `Low: ${r.join(' and ')}`
  if ((p.poverty_moe || 0) > 5) return `Medium: poverty margin of error ±${round(p.poverty_moe)} points (over 5)`
  return 'High: population 1,000 or more and poverty margin of error 5 points or less'
}

// Mirrors snapConfidence() in classify.js: the SNAP estimate has its own reliability checks.
function snapConfidenceReason(p) {
  const r = []
  if ((p.poor_hh || 0) < 100) r.push(`only about ${Math.round(p.poor_hh || 0)} poor households (under 100)`)
  if (p.poor_no_snap_pct >= 95) r.push(`${round(p.poor_no_snap_pct)}% of poor households not on SNAP (95% or more: possible student housing or small sample)`)
  if (p._conf === 'Low') r.push('the tract itself is Low confidence')
  return r.length ? `Low: ${r.join('; ')}` : `${p._snapConf}: same as the tract's confidence`
}

function shape(p, Q) {
  const problems = p._types.filter((t) => PROBLEM_TYPES.includes(t))
  const hasSnap = p._types.includes('snap')
  return {
    tract_id: p.geoid,
    label: `${p.county} tract ${p.geoid.slice(5)}`,
    county: p.county,
    main_gap_type: TYPES[p._t].name,
    all_gap_types: p._types.map((t) => TYPES[t].name),
    flagged: isFlagged(p),
    confidence: p._conf,
    confidence_reason: confidenceReason(p),
    ...(hasSnap && { snap_gap_confidence: p._snapConf, snap_gap_confidence_reason: snapConfidenceReason(p) }),
    review_tier: p._tier,
    // One recommendation per problem gap type, as on the tract panel; none for review-only types.
    recommended_actions: problems.length
      ? problems.map((t) => ({ for_gap_type: TYPES[t].name, confidence: typeConfidence(p, t), action: ACTION_LABEL[t], details: resources(t, regionById(regionIdOf(p))).map((r) => r.text) }))
      : resources(p._t, regionById(regionIdOf(p))).map((r) => r.text),
    ...(hasSnap && Q && { snap_cautions: snapDetails(p, Q).cautions }),
    poverty_pct: round(p.poverty_pct),
    poverty_margin_of_error: round(p.poverty_moe),
    snap_households_pct: round(p.snap_pct),
    population: p.population == null ? null : Math.round(p.population),
    households: p.households == null ? null : Math.round(p.households),
    poor_households: p.poor_hh == null ? null : Math.round(p.poor_hh),
    poor_households_not_on_snap: p.poor_hh_no_snap == null ? null : Math.round(p.poor_hh_no_snap),
    poor_households_not_on_snap_pct: round(p.poor_no_snap_pct),
    residents_over_half_mile_from_snap_retailer_pct: round(p.far_half_share),
    usda_low_income_low_access: p.lila_half_10 == null ? null : p.lila_half_10 === 1,
    no_reliable_transportation_pct: round(p.no_transport_pct),
  }
}

function filterTracts(tracts, a) {
  const county = a.county?.toLowerCase()
  return tracts.filter((p) => {
    if (county && p.county.toLowerCase() !== county) return false
    if (a.gap_type && !p._types.includes(a.gap_type)) return false
    if (a.flagged_only && !isFlagged(p)) return false
    if (a.confidence && p._conf !== a.confidence) return false
    if (a.snap_gap_confidence && !(p._types.includes('snap') && p._snapConf === a.snap_gap_confidence)) return false
    if (a.lila != null && (p.lila_half_10 === 1) !== a.lila) return false
    if (a.min_poverty_pct != null && !(p.poverty_pct >= a.min_poverty_pct)) return false
    if (a.max_poverty_pct != null && !(p.poverty_pct <= a.max_poverty_pct)) return false
    if (a.min_population != null && !((p.population || 0) >= a.min_population)) return false
    if (a.min_poor_households_not_on_snap != null && !(p.poor_hh_no_snap >= a.min_poor_households_not_on_snap)) return false
    return true
  })
}

// Region of a tract, from its state FIPS prefix (tools only see one region's tracts at a time).
const regionIdOf = (p) => ({ '12': 'central-florida', '36': 'nyc', '49': 'salt-lake-city' })[p.geoid.slice(0, 2)]

const REGION_PROP = { type: 'STRING', description: 'Region id. Omit to use the region the user is viewing.', enum: REGIONS.map((r) => r.id) }
const FILTER_PROPS = {
  region: REGION_PROP,
  flagged_only: { type: 'BOOLEAN', description: 'true = only FLAGGED tracts: those with at least one problem gap type (Classic Food Desert, Transportation-Compounded Gap or SNAP Enrollment Gap). Use whenever the user says "flagged".' },
  county: { type: 'STRING', description: 'County name exactly as in the data, e.g. "Orange". Use region_info to list counties.' },
  gap_type: { type: 'STRING', enum: GAP_KEYS, description: 'Gap type key; matches tracts that have this type as their main OR an additional type. classic = Classic Food Desert, transport = Transportation-Compounded Gap, snap = SNAP Enrollment Gap, blind = Possible Blind Spot, partial = Partial signal, none = No gap flagged, insufficient = Insufficient data.' },
  confidence: { type: 'STRING', enum: ['High', 'Medium', 'Low'], description: "The tract's overall confidence (poverty estimate reliability)." },
  snap_gap_confidence: { type: 'STRING', enum: ['High', 'Medium', 'Low'], description: 'Confidence of the SNAP Enrollment Gap itself (only SNAP gap tracts match). Use this, not confidence, for questions about how reliable a SNAP gap is.' },
  lila: { type: 'BOOLEAN', description: 'true = only USDA low-income AND low-access tracts' },
  min_poverty_pct: { type: 'NUMBER' },
  max_poverty_pct: { type: 'NUMBER' },
  min_population: { type: 'NUMBER' },
  min_poor_households_not_on_snap: { type: 'NUMBER' },
}

export const DECLARATIONS = [
  {
    name: 'region_info',
    description: 'Describes a region: counties, tract count, which indicators exist, gap type counts, quartile cutoffs, and the classification rules. Call this for questions about definitions, data availability or what the data cannot answer.',
    parameters: { type: 'OBJECT', properties: { region: REGION_PROP } },
  },
  {
    name: 'get_tract',
    description: 'Full details for one census tract. tract_id is the 11-digit GEOID, or the last 6 digits together with a county.',
    parameters: {
      type: 'OBJECT',
      properties: { region: REGION_PROP, tract_id: { type: 'STRING' }, county: { type: 'STRING' } },
      required: ['tract_id'],
    },
  },
  {
    name: 'query_tracts',
    description: 'List tracts matching filters, sorted by a field. Returns total_matches and up to `limit` tracts (max 25). Use for rankings ("top 5 tracts with...") and filtered lists.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ...FILTER_PROPS,
        sort_by: { type: 'STRING', enum: SORT_FIELDS, description: 'Field to sort by. Default poverty_pct.' },
        descending: { type: 'BOOLEAN', description: 'Default true (highest first).' },
        limit: { type: 'NUMBER', description: 'Default 10, max 25.' },
      },
    },
  },
  {
    name: 'aggregate',
    description: 'Counts, sums and per-tract averages over tracts matching filters, optionally grouped by county, gap_type or confidence. Use for totals, counts, "how many people", "how many tracts", averages, and comparing a tract with its county (use average_per_tract; never divide yourself).',
    parameters: {
      type: 'OBJECT',
      properties: { ...FILTER_PROPS, group_by: { type: 'STRING', enum: ['none', 'county', 'gap_type', 'confidence'] } },
    },
  },
]

// Small models sometimes garble the id ("central-floridaconfidence"); accept one that clearly contains a real id.
function pickRegion(a, defaultRegion) {
  const raw = String(a.region || defaultRegion).trim().toLowerCase()
  const id = REGIONS.find((r) => r.id === raw)?.id || REGIONS.find((r) => raw.startsWith(r.id) || raw.includes(r.id))?.id || raw
  return loadRegion(id)
}

const EXEC = {
  region_info(a, dr) {
    const { region, tracts, analysis } = pickRegion(a, dr)
    const q = (x) => (x ? { q1: round(x[0]), median: round(x[1]), q3_top_quartile_starts: round(x[2]) } : null)
    return {
      region: region.name,
      region_id: region.id,
      counties: [...new Set(tracts.map((p) => p.county))].sort(),
      tract_count: tracts.length,
      indicators_available: ['poverty rate (ACS S1701)', 'SNAP participation (ACS S2201)', 'population (ACS S0101)', 'USDA low-income low-access flag (LILA, 1/2 mile urban / 10 miles rural)', 'share of residents over 1/2 mile from a SNAP retailer', ...(region.hasTransport ? ['no reliable transportation (CDC PLACES)'] : [])],
      indicators_NOT_available: [...(region.hasTransport ? [] : ['no reliable transportation (not available for Central Florida)']), 'store closures, pantry/food bank locations and capacity, private organization data, individual SNAP retailer per tract (address list only)'],
      gap_type_counts: Object.fromEntries(TYPE_ORDER.map((t) => [TYPES[t].name, analysis.counts[t]])),
      gap_type_counts_note: 'A tract can have several problem gap types, so these counts can add up to more than the tract count.',
      flagged_tracts: analysis.flagged,
      transportation_note: region.transportNote,
      quartile_cutoffs_within_region: {
        poverty_pct: q(analysis.Q.pov),
        residents_over_half_mile_pct: q(analysis.Q.acc),
        no_transport_pct: q(analysis.Q.trn),
        snap_households_pct: q(analysis.Q.snapPct),
        poor_households_not_on_snap_pct_among_snap_eligible_tracts: q(analysis.Q.snapGap),
      },
      rules: {
        flagged: 'a tract with at least one problem gap type: Classic Food Desert, Transportation-Compounded Gap or SNAP Enrollment Gap. The first one is its main type (map color, review tier).',
        classic_food_desert: 'poverty in top quartile AND LILA flag. Recommendation: nearest food bank or pantry, mobile pantry if listed',
        transportation_compounded_gap: region.hasTransport ? 'LILA flag AND no-reliable-transportation in top quartile. Recommendation: mobile pantry or delivery, transit-accessible locations' : 'cannot be computed (no transportation data)',
        snap_enrollment_gap: `our addition: poverty at or above the region median AND share of poor households not on SNAP in the top quartile (tracts with at least ${SNAP_MIN_POOR_HH} poor households). Recommendation: SNAP registration drive (sign-up events, help applying)`,
        snap_enrollment_gap_confidence: 'Low if fewer than 100 poor households, 95% or more not on SNAP (possible student housing or small sample), or the tract is Low confidence; otherwise the tract confidence',
        possible_blind_spot: 'no problem type, no indicator in top quartile, but at least two in second-highest quartile; review required',
        partial_signal: 'one indicator high, no taxonomy match; review required',
        insufficient_data: 'missing poverty or access value, or population under 500',
        confidence: 'Low if population < 1,000 or poverty margin of error > 10 points; Medium if margin > 5; otherwise High',
        note: 'Quartiles are computed within the region. A value of 0 never counts as high. The map only suggests; people approve or reject.',
      },
    }
  },

  get_tract(a, dr) {
    const { tracts, analysis } = pickRegion(a, dr)
    const id = String(a.tract_id).trim()
    let hits = tracts.filter((p) => p.geoid === id)
    if (!hits.length) hits = tracts.filter((p) => p.geoid.endsWith(id) && (!a.county || p.county.toLowerCase() === a.county.toLowerCase()))
    if (!hits.length) return { found: false, message: `No tract matching "${id}"${a.county ? ` in ${a.county}` : ''}.` }
    if (hits.length > 1) return { found: false, message: 'Several tracts match; give the full 11-digit tract_id or a county.', candidates: hits.slice(0, 10).map((p) => `${p.county} ${p.geoid}`) }
    return { found: true, tract: shape(hits[0], analysis.Q) }
  },

  query_tracts(a, dr) {
    const { tracts, analysis } = pickRegion(a, dr)
    const field = a.sort_by || 'poverty_pct'
    if (!SORT_FIELDS.includes(field)) throw new Error(`sort_by must be one of ${SORT_FIELDS.join(', ')}`)
    const dir = a.descending === false ? 1 : -1
    const limit = Math.min(Math.max(Math.floor(a.limit || 10), 1), 25)
    const all = filterTracts(tracts, a)
    const matches = all.filter((p) => p[field] != null)
    matches.sort((x, y) => dir * (x[field] - y[field]))
    return {
      total_matching_tracts: all.length,
      tracts_missing_sort_value: all.length - matches.length,
      sorted_by: field,
      order: dir === -1 ? 'highest first' : 'lowest first',
      returned: Math.min(limit, matches.length),
      note: 'Report total_matching_tracts as the count. "returned" is only how many are listed below.',
      tracts: matches.slice(0, limit).map((p) => shape(p, analysis.Q)),
    }
  },

  aggregate(a, dr) {
    const { tracts } = pickRegion(a, dr)
    const rows = filterTracts(tracts, a)
    const keyOf = { none: () => 'all matching tracts', county: (p) => p.county, gap_type: (p) => TYPES[p._t].name, confidence: (p) => p._conf }[a.group_by || 'none']
    const groups = new Map()
    for (const p of rows) {
      const k = keyOf(p)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(p)
    }
    const sum = (ps, f) => Math.round(ps.reduce((s, p) => s + (p[f] || 0), 0))
    // Averages are computed here so the model never has to divide.
    const avg = (ps, f) => {
      const v = ps.filter((p) => p[f] != null)
      return v.length ? round(v.reduce((s, p) => s + p[f], 0) / v.length) : null
    }
    const avgInt = (ps, f) => { const a = avg(ps, f); return a == null ? null : Math.round(a) }
    return {
      total_tracts: rows.length,
      ...(a.group_by === 'gap_type' && {
        grouping_note: 'Grouped by each tract\'s MAIN gap type, so each tract counts once. To count every tract that has a type (main or additional), use the gap_type filter instead.',
      }),
      groups: [...groups.entries()].map(([group, ps]) => ({
        group,
        tracts: ps.length,
        population: sum(ps, 'population'),
        households: sum(ps, 'households'),
        poor_households: sum(ps, 'poor_hh'),
        poor_households_not_on_snap: sum(ps, 'poor_hh_no_snap'),
        average_per_tract: {
          population: avgInt(ps, 'population'),
          households: avgInt(ps, 'households'),
          poor_households: avgInt(ps, 'poor_hh'),
          poor_households_not_on_snap: avgInt(ps, 'poor_hh_no_snap'),
          poverty_pct: avg(ps, 'poverty_pct'),
          snap_households_pct: avg(ps, 'snap_pct'),
          poor_households_not_on_snap_pct: avg(ps, 'poor_no_snap_pct'),
          residents_over_half_mile_from_snap_retailer_pct: avg(ps, 'far_half_share'),
        },
        note: 'Averages are simple means across tracts (each tract counts once), not population-weighted.',
      })),
    }
  },
}

export function runTool(name, args, defaultRegion) {
  const fn = EXEC[name]
  if (!fn) return { error: `Unknown tool ${name}` }
  try {
    return fn(args || {}, defaultRegion)
  } catch (e) {
    return { error: e.message }
  }
}
