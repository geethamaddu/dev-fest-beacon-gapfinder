const TEAM = [
  { name: 'Phanindhar Golla', role: 'Software developer', initials: 'PG' },
  { name: 'Geetha Maddu', role: 'Software developer', initials: 'GM' },
]

export default function About() {
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
          <li>Combines Beacon's public indicators (poverty, SNAP participation, USDA low grocery access, and transportation where available) at the census tract level.</li>
          <li>Classifies each tract with DataKind's gap taxonomy: Classic Food Desert, Transportation-Compounded Gap, Possible Blind Spot, or Insufficient data.</li>
          <li>Shows why each tract was flagged, how confident the data is, and which resources fit.</li>
          <li>Keeps people in charge: every recommendation can be approved or rejected with notes, and all activity is recorded in History.</li>
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
            <b>Compare it with its own region.</b> We split every indicator into quartiles within the selected region, so a tract is "high"
            when it is in the top 25% of that region, not of the whole country. A value of 0 never counts as high.
          </li>
          <li>
            <b>Assign a gap type</b> using DataKind's taxonomy:
            <table className="rules">
              <thead><tr><th>Gap type</th><th>When</th><th>What we recommend</th></tr></thead>
              <tbody>
                <tr><td>Classic Food Desert</td><td>Poverty in the top quartile and LILA flagged</td><td>Nearest food bank or pantry, mobile pantry if listed</td></tr>
                <tr><td>Transportation-Compounded Gap</td><td>LILA flagged and no-reliable-transportation in the top quartile (NYC, Salt Lake City)</td><td>Mobile pantry or delivery programs, transit-accessible locations</td></tr>
                <tr><td>Possible Blind Spot</td><td>Nothing in the top quartile, but at least two indicators in the second-highest quartile</td><td>No automatic recommendation; a person reviews it</td></tr>
                <tr><td>Partial signal</td><td>One indicator is high, but no gap type matches</td><td>No automatic recommendation; a person reviews it</td></tr>
                <tr><td>Insufficient data</td><td>A key number is missing, or fewer than 500 residents</td><td>No automatic recommendation; a person reviews it</td></tr>
                <tr><td>No gap flagged</td><td>None of the above</td><td>None needed</td></tr>
              </tbody>
            </table>
          </li>
          <li>
            <b>Rate confidence.</b> Low when the tract has fewer than 1,000 residents or the poverty estimate's margin of error is over 10 points;
            Medium when the margin is over 5 points; otherwise High.
          </li>
          <li>
            <b>Set the review tier.</b> Tier 1: a food desert or transportation gap with Medium or High confidence, recommended and approved by a person.
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
