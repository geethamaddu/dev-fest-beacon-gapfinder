import { SNAP_MIN_POOR_HH, TYPES, f1 } from '../lib/classify.js'
import { REGIONS } from '../lib/regions.js'

const TEAM = [
  { name: 'Phanindhar Golla', role: 'Software developer', initials: 'PG' },
  { name: 'Geetha Maddu', role: 'Software developer', initials: 'GM' },
]

const REVIEW = 'No automatic recommendation; a person reviews it'

// Generic rule per gap type, plus a function giving that region's real cut-offs.
const RULES = [
  {
    type: 'classic',
    rule: "Poverty in the region's top 25% AND USDA food-desert (LILA) flag = yes (low income and over 1/2 mile urban or 10 miles rural from a store)",
    action: 'Nearest food bank or pantry; mobile pantry if listed',
    cut: (Q) => <>Poverty <b>≥ {f1(Q.pov[2])}</b> + LILA</>,
  },
  {
    type: 'transport',
    rule: "USDA LILA flag = yes AND adults without reliable transportation in the region's top 25%",
    action: 'Mobile pantry or delivery programs; transit-accessible locations',
    cut: (Q, r) => (r.hasTransport && Q.trn ? <>LILA + no reliable transport <b>≥ {f1(Q.trn[2])}</b></> : <>Not available (no transportation data)</>),
  },
  {
    type: 'snap',
    rule: `Poverty at or above the region's median AND share of poor households not on SNAP in the region's top 25% (at least ${SNAP_MIN_POOR_HH} poor households)`,
    action: 'SNAP registration drive: sign-up events at trusted places and help applying',
    cut: (Q) => <>Poverty <b>≥ {f1(Q.pov[1])}</b> + not on SNAP <b>≥ {f1(Q.snapGap?.[2])}</b></>,
  },
  {
    type: 'blind',
    rule: "No gap type above and nothing in the top 25%, but at least two indicators in the second-highest 25% (between the median and the top-25% cut-off)",
    action: REVIEW,
    cut: (Q, r) => (
      <>
        Poverty <b>{f1(Q.pov[1])}–{f1(Q.pov[2])}</b>
        {Q.acc[2] === 0 ? <>; store distance not used (most tracts 0%)</> : <>; far from store <b>{f1(Q.acc[1])}–{f1(Q.acc[2])}</b></>}
        {r.hasTransport && Q.trn && <>; no transport <b>{f1(Q.trn[1])}–{f1(Q.trn[2])}</b></>}
      </>
    ),
  },
  {
    type: 'partial',
    rule: 'No gap type above, but one indicator is in the top 25% (or the LILA flag is yes)',
    action: REVIEW,
    cut: (Q, r) => (
      <>
        Poverty <b>≥ {f1(Q.pov[2])}</b>, or LILA, or far from store {Q.acc[2] === 0 ? <b>&gt; 0%</b> : <b>≥ {f1(Q.acc[2])}</b>}
        {r.hasTransport && Q.trn && <>, or no transport <b>≥ {f1(Q.trn[2])}</b></>}
      </>
    ),
  },
  {
    type: 'insufficient',
    rule: 'Poverty, store distance or LILA flag missing, OR fewer than 500 residents',
    action: REVIEW,
    cut: () => <>Same rule</>,
  },
  { type: 'none', rule: 'None of the above', action: 'None needed', cut: () => <>Same rule</> },
]

function RegionCell({ rule, entry, region }) {
  if (!entry) return <td className="muted small">Loading...</td>
  const { Q, counts } = entry.analysis
  const n = rule.type === 'transport' && !region.hasTransport ? 'N/A' : counts[rule.type]
  return (
    <td>
      <div>{rule.cut(Q, region)}</div>
      <div className="cnt">{n === 'N/A' ? 'N/A' : `${n} ${n === 1 ? 'tract' : 'tracts'}`}</div>
    </td>
  )
}

export default function About({ entries }) {
  return (
    <div className="page about">
      <div className="page-head">
        <h1>About us</h1>
        <p className="muted">Beacon Gap Finder was built for the DevFest Florida hackathon, DataKind track: Beacon Challenge 2, Food Access and Nutrition Gaps.</p>
      </div>

      <section className="card">
        <h2>The team</h2>
        <div className="team">
          {TEAM.map((m) => (
            <div className="member" key={m.name}>
              <div className="avatar">{m.initials}</div>
              <div>
                <div className="member-name">{m.name}</div>
                <div className="muted">{m.role}</div>
              </div>
            </div>
          ))}
        </div>
        <p>Beacon Gap Finder is designed and built by Phanindhar Golla and Geetha Maddu.</p>
      </section>

      <section className="card">
        <h2>What the app does</h2>
        <ul>
          <li>Combines Beacon's public indicators (poverty, SNAP participation, USDA low grocery access, and transportation where available) at the census tract level for Central Florida, New York City and Salt Lake City.</li>
          <li>Classifies each tract with DataKind's gap taxonomy (Classic Food Desert, Transportation-Compounded Gap, Possible Blind Spot, Insufficient data) plus our SNAP Enrollment Gap.</li>
          <li>Shows why each tract was flagged, how confident the data is, and which resources fit.</li>
          <li>Keeps people in charge: every recommendation can be approved or rejected with a reason, every decision is recorded in History, and any decision can be undone.</li>
        </ul>
      </section>

      <section className="card">
        <h2>How we evaluate a location</h2>
        <p>Each location is a census tract, a neighborhood of about 4,000 people. Every tract goes through the same five steps.</p>
        <ol className="steps">
          <li>
            <b>Collect its indicators.</b> Poverty rate, the USDA low-income and low-access (LILA) flag at 1/2 mile in cities and 10 miles in rural areas,
            the share of residents over 1/2 mile from a SNAP store, the share of poor households not on SNAP, and, in NYC and Salt Lake City only,
            the share of adults without reliable transportation.
          </li>
          <li>
            <b>Compare it with its own region.</b> We split every indicator into quartiles within each region, so a tract is "high"
            when it is in the top 25% of its own region, not of the whole country. That is why the cut-offs below differ by region. A value of 0 never counts as high.
          </li>
          <li>
            <b>Assign gap types</b> using DataKind's taxonomy plus our SNAP Enrollment Gap. A tract can have more than one problem gap type
            (for example a Classic Food Desert that also has a SNAP Enrollment Gap), and each one brings its own recommendation.
            The table shows the rule and the actual cut-offs and tract counts in every region:
            <div className="table-wrap">
              <table className="rules">
                <thead>
                  <tr>
                    <th>Gap type</th>
                    <th>Rule</th>
                    {REGIONS.map((r) => <th key={r.id}>{r.name}</th>)}
                    <th>Recommended action</th>
                  </tr>
                </thead>
                <tbody>
                  {RULES.map((rule) => (
                    <tr key={rule.type}>
                      <td><i className="sw" style={{ background: TYPES[rule.type].color }} />{TYPES[rule.type].name}</td>
                      <td>{rule.rule}</td>
                      {REGIONS.map((r) => <RegionCell key={r.id} rule={rule} entry={entries[r.id]} region={r} />)}
                      <td>{rule.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="transport-note">
              <b>Transportation-Compounded Gap by region</b>
              <ul>
                {REGIONS.map((r) => <li key={r.id}><b>{r.name}:</b> {r.transportNote}</li>)}
              </ul>
            </div>
          </li>
          <li>
            <b>Rate confidence.</b> Low when the tract has fewer than 1,000 residents or the poverty estimate's margin of error is over 10 points;
            Medium when the margin is over 5 points; otherwise High. For a SNAP Enrollment Gap, confidence is also Low when there are fewer than
            100 poor households or almost none are on SNAP, which can point to student housing or a small sample.
          </li>
          <li>
            <b>Set the review tier.</b> Tier 1: a food desert, transportation gap or SNAP enrollment gap with Medium or High confidence, recommended and approved by a person.
            Tier 2: the same gaps with Low confidence, checked by a person before use. Tier 3: blind spots, partial signals and insufficient data,
            reviewed with no automatic recommendation.
          </li>
        </ol>
        <p className="muted small">Every tract's detail panel shows the supporting and limiting evidence behind its result, so anyone can see why it was flagged. The review tiers are our draft until DataKind's own tiers are available.</p>
      </section>

      <section className="card">
        <h2>Data sources</h2>
        <ul>
          <li>Census ACS 5-year 2024: S1701 poverty, S2201 SNAP, S0101 population</li>
          <li>USDA ERS Food Access Research Atlas, SNAP-authorized retailer access (LILA at 1/2 mile urban, 10 miles rural)</li>
          <li>CDC PLACES 2025: lack of reliable transportation (NYC and Salt Lake City only)</li>
          <li>Census TIGERweb tract boundaries; map tiles from OpenStreetMap</li>
        </ul>
      </section>
    </div>
  )
}
