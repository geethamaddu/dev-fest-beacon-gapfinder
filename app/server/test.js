// Run: npm test   (no API key needed; checks the data tools against direct calculations)
import assert from 'node:assert/strict'
import { runTool, loadRegion } from './tools.js'
import { unverifiedNumbers, mentionedTracts } from './index.js'

const R = 'central-florida'
const { tracts } = loadRegion(R)

// aggregate matches direct sum
const agg = runTool('aggregate', { group_by: 'none' }, R)
assert.equal(agg.total_tracts, tracts.length)
assert.equal(agg.groups[0].population, Math.round(tracts.reduce((s, p) => s + (p.population || 0), 0)))

// per-tract averages are computed by the tool (the model must not divide)
const orange = tracts.filter((p) => p.county === 'Orange')
const oAgg = runTool('aggregate', { county: 'Orange' }, R).groups[0]
assert.equal(oAgg.average_per_tract.population, Math.round(orange.reduce((s, p) => s + (p.population || 0), 0) / orange.length))
assert.equal(oAgg.average_per_tract.poor_households_not_on_snap,
  Math.round(orange.filter((p) => p.poor_hh_no_snap != null).reduce((s, p) => s + p.poor_hh_no_snap, 0) / orange.filter((p) => p.poor_hh_no_snap != null).length))

// county filter + ranking
const top = runTool('query_tracts', { county: 'Lake', sort_by: 'poor_hh_no_snap', limit: 3 }, R)
assert.equal(top.tracts.length, 3)
assert.ok(top.tracts.every((t) => t.county === 'Lake'))
assert.ok(top.tracts[0].poor_households_not_on_snap >= top.tracts[1].poor_households_not_on_snap)

// partial tract id
const t = tracts[0]
const g = runTool('get_tract', { tract_id: t.geoid.slice(5), county: t.county }, R)
assert.equal(g.found, true)
assert.equal(g.tract.tract_id, t.geoid)

// unanswerable: unknown tract, unknown tool, bad region, missing transportation
assert.equal(runTool('get_tract', { tract_id: '999999999' }, R).found, false)
assert.ok(runTool('nope', {}, R).error)
assert.ok(runTool('region_info', { region: 'mars' }, R).error)
const info = runTool('region_info', {}, R)
assert.ok(info.indicators_NOT_available.some((s) => s.includes('transportation')))
assert.equal(runTool('aggregate', { group_by: 'gap_type' }, R).groups.some((x) => x.group === 'Transportation-Compounded Gap'), false)

// counts include tracts missing the sort value; flagged_only = any problem type (classic, transport, snap)
const PROBLEM = ['Classic Food Desert', 'Transportation-Compounded Gap', 'SNAP Enrollment Gap']
const low = tracts.filter((p) => p._conf === 'Low')
const lowQ = runTool('query_tracts', { confidence: 'Low' }, R)
assert.equal(lowQ.total_matching_tracts, low.length)
assert.equal(lowQ.tracts_missing_sort_value, low.filter((p) => p.poverty_pct == null).length)
const flaggedLow = runTool('query_tracts', { confidence: 'Low', flagged_only: true, limit: 25 }, R)
assert.equal(flaggedLow.total_matching_tracts, low.filter((p) => p._types.some((x) => ['classic', 'transport', 'snap'].includes(x))).length)
assert.ok(flaggedLow.tracts.every((x) => x.flagged && x.all_gap_types.some((n) => PROBLEM.includes(n))))

// SNAP Enrollment Gap: counts match the app (main + additional type), per region
const SNAP_COUNTS = { 'central-florida': 33, nyc: 95, 'salt-lake-city': 24 } // from CLAUDE.md
for (const [rid, n] of Object.entries(SNAP_COUNTS)) {
  const rt = loadRegion(rid).tracts
  assert.equal(rt.filter((p) => p._types.includes('snap')).length, n, `${rid} snap count`)
  assert.equal(runTool('aggregate', { region: rid, gap_type: 'snap' }, R).total_tracts, n)
  assert.equal(runTool('region_info', { region: rid }, R).gap_type_counts['SNAP Enrollment Gap'], n)
}
// SNAP tracts carry their own confidence, reason and a SNAP registration recommendation
const snapQ = runTool('query_tracts', { gap_type: 'snap', limit: 25 }, R)
for (const x of snapQ.tracts) {
  assert.ok(x.all_gap_types.includes('SNAP Enrollment Gap'))
  assert.ok(x.snap_gap_confidence_reason.startsWith(`${x.snap_gap_confidence}:`), x.snap_gap_confidence_reason)
  const rec = x.recommended_actions.find((r) => r.for_gap_type === 'SNAP Enrollment Gap')
  assert.equal(rec.action, 'SNAP registration drive')
  assert.equal(rec.confidence, x.snap_gap_confidence)
}
// SNAP gap confidence has its own filter (it can be Low while the tract is Medium)
const snapLow = tracts.filter((p) => p._types.includes('snap') && p._snapConf === 'Low')
const snapLowQ = runTool('query_tracts', { snap_gap_confidence: 'Low', limit: 25 }, R)
assert.equal(snapLowQ.total_matching_tracts, snapLow.length)
assert.ok(snapLow.some((p) => p._conf !== 'Low'), 'expected SNAP-Low tracts whose tract confidence is not Low')
assert.ok(snapLowQ.tracts.every((x) => x.snap_gap_confidence === 'Low'))

// a tract with two problem types gets two recommendations, main type first
const multi = tracts.find((p) => p._types.filter((x) => ['classic', 'transport', 'snap'].includes(x)).length > 1)
if (multi) {
  const mt = runTool('get_tract', { tract_id: multi.geoid }, R).tract
  assert.equal(mt.main_gap_type, mt.all_gap_types[0])
  assert.equal(mt.recommended_actions.length, mt.all_gap_types.filter((n) => PROBLEM.includes(n)).length)
}
// non-problem tracts get the review-only text, not an action
const partialT = runTool('query_tracts', { gap_type: 'partial', limit: 1 }, R).tracts[0]
assert.deepEqual(partialT.recommended_actions, ['No auto-recommendation. Review required.'])

// every listed tract carries a confidence reason that matches its level
for (const x of lowQ.tracts) assert.ok(x.confidence_reason.startsWith(`${x.confidence}:`), x.confidence_reason)

// garbled region ids from the model still resolve; unknown ones still error
assert.equal(runTool('region_info', { region: 'central-floridaconfidence' }, R).region_id, R)
assert.ok(runTool('region_info', { region: 'central-florital' }, R).error)

// number checker flags invented figures, accepts real ones
const real = JSON.stringify(agg)
assert.deepEqual(unverifiedNumbers(`Population is ${agg.groups[0].population.toLocaleString()}.`, [real]), [])
assert.deepEqual(unverifiedNumbers('About 987,654 residents.', [real]), [987654])
// tract ids, full or last 6 digits with a leading zero, are not flagged when they came from a tool
const tj = JSON.stringify(g)
assert.deepEqual(unverifiedNumbers(`${t.county} tract ${t.geoid.slice(5)} (${t.geoid})`, [tj]), [])
assert.deepEqual(unverifiedNumbers('Orange tract 999999 (12095999999)', [tj]), [999999, 12095999999])
// leading zero dropped by the model ("tract 17703" for 017703) is still recognised
const zeroTract = tracts.find((p) => p.geoid[5] === '0')
const zj = JSON.stringify(runTool('get_tract', { tract_id: zeroTract.geoid }, R))
assert.deepEqual(unverifiedNumbers(`${zeroTract.county} tract ${Number(zeroTract.geoid.slice(5))}`, [zj]), [])

// tracts mentioned in an answer are returned for map links; unmentioned ones are not
const topJson = JSON.stringify(top)
const [a0, a1, a2] = top.tracts
const zeroless = a1.label.replace(/(\d{6})$/, (s) => String(Number(s)))
const m = mentionedTracts(`See ${a0.tract_id} and ${zeroless}.`, [topJson])
assert.deepEqual(m.map((x) => x.geoid).sort(), [a0.tract_id, a1.tract_id].sort())
assert.ok(!m.some((x) => x.geoid === a2.tract_id))

console.log('All tool tests passed.')
