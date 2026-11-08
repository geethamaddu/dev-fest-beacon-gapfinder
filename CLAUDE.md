# Beacon Gap Finder

Project folder: `D:\interview\dev-fest\BeaconGapFinder` (all project files live here; raw Beacon data in `rawdata/`). The app is the React project in `app/`.

DevFest Florida hackathon project, DataKind track, Beacon challenge 2 (Food Access and Nutrition Gaps), Central Florida.

## Problem

Food banks, pantries and nutrition assistance groups know their communities from hands-on work, but it is hard to connect that knowledge to public data on poverty, SNAP participation and grocery access. The data is spread across separate files, differs by region, and needs an analyst to combine. Even when someone produces a chart, a team cannot easily discuss it, agree on it and act on it. Result: services go where they always have, not where unmet need is greatest.

Challenge title: "From Insight to Coordinated Community Action". DataKind notes organizations need more than data access.

## Requirements

From the Beacon brief and DataKind notes:

- Use only Beacon's public indicators (no private organization data). Build on the example datasets, not inside Beacon.
- Central Florida indicators available: poverty rate, SNAP participation, USDA low grocery access. No-reliable-transportation data is NOT available for Central Florida (NYC and Salt Lake City only).
- Use the Low-Income AND Low-Access (LILA) definition at 1/2 mile urban / 10 miles rural, not a distance-only flag.
- SNAP retailers are an address list only, not joined to tracts. Treat as a manual lookup, not a systematic column.
- Make reasoning visible: confidence, why flagged, plain-language data limits.
- Support human review (approve, reject, challenge); do not silently auto-decide.
- A prototype is enough (two days). Teams present: what they made, what they learned, what should happen next.
- Judging: Desirability 40% (would a real food bank use it), Viability 30% (trust, transparency, public good), Feasibility 30% (works, sound logic).

## Idea

A map for food bank teams that shows where food access gaps are, explains why each tract was flagged, says how confident the data is, and recommends a resource or marks it for human review. The map decides nothing on its own: transparent rules produce a gap type, and people approve or reject.

## Solution

Static data pipeline plus a React web app. Python joins the Beacon example datasets with Census tract boundaries and writes one GeoJSON file per region (Central Florida, New York City, Salt Lake City). The React app (Vite + Leaflet + OpenStreetMap) classifies each tract by DataKind's gap taxonomy, shows the evidence, and records team decisions, notes and activity.

## Functional design

Top nav bar (white, orange bottom border): official Beacon logo (dark version on the light bar, cut from `docs/Beacon_Brand_Guidelines.pdf` page 2, files `app/public/beacon-logo-white.png` and `-dark.png`) plus "Gap Finder" on the left; nav items Dashboard, Map Finder, History, About and the region picker (Central Florida, New York City, Salt Lake City) on the right. Colors follow the brand guide: Primary 900 `#1E343F`, Primary 700 `#385981`, Primary 500 `#6B8FA8`, Accent Orange `#F79122`, Success `#388D58`, Error `#C44A4A`; font Avenir with system fallbacks.

- Dashboard: stat cards (tracts, classic deserts, transportation gaps, SNAP enrollment gaps, blind spots, and "Actions pending" = flagged tracts with no approve/reject yet, shown as "X of Y" and updated live on approve, reject or undo); "Top problems to address" (top 10 flagged tracts: both gap types first, then confidence, then poverty) with "Open on map"; review progress; gaps by county.
- Map Finder: tracts colored by gap type with a legend and a "Fit region" button. Right panel is collapsible (chevron tab on the panel's left edge; chevron on the map's right edge to expand) and horizontally resizable (drag its left edge, 280 to 760 px, width remembered). Panel shows the selected tract's detail, gap-type counts and a data note.
- Tract detail: gap type(s), confidence, review tier, supporting and limiting evidence, recommended resources per gap type (region-specific link), an optional reason box with Approve / Reject (the reason is saved with the decision; there is no separate note button), Undo for the latest decision on the tract, and the list of past reasons.
- History: actions only (Approved, Rejected, Undo) with time, region, tract and reason; filter by action, search, Undo button on the latest decision of a tract, Open button, Clear history. Page views, region changes and opened tracts are NOT recorded.
- About: team (Phanindhar Golla and Geetha Maddu, software developers), what the app does, data sources.

Decisions and history are stored in the browser's localStorage (per browser, not shared). Undo restores the tract's previous decision (or pending) and marks the original entry as undone.

Gap types (quartiles computed within the selected region; a value of 0 never counts as high):

| Gap type | Rule | Resource |
|---|---|---|
| Classic Food Desert | Poverty in top quartile AND LILA flag (1/2 mile urban, 10 miles rural) | Nearest food bank or pantry, mobile pantry if listed |
| Transportation-Compounded Gap | LILA flag AND top-quartile no-reliable-transportation rate (NYC and SLC only) | Mobile pantry or delivery programs, transit-accessible locations |
| SNAP Enrollment Gap (our addition) | Poverty at or above the region median AND share of poor households not on SNAP in the top quartile (at least 30 poor households) | SNAP registration drive: sign-up events, help applying |
| Possible Blind Spot | No problem type above and no indicator in top quartile, but at least two available indicators in the second-highest quartile | No auto-recommendation; review required |
| Partial signal (our addition) | One indicator high, no taxonomy match | No auto-recommendation; review required |
| No gap flagged | Everything else | None needed |
| Insufficient data | Missing poverty or access value, or population under 500 | Review required |

A tract can have more than one problem gap type (Classic Food Desert, Transportation-Compounded Gap, SNAP Enrollment Gap); the first is its main type (map color, review tier) and each brings its own recommendation. SNAP Enrollment Gap uses `poor_hh_no_snap / poor_hh` from S2201; its confidence is Low when fewer than 100 poor households, 95% or more not on SNAP (possible student housing or small sample), or the tract is Low confidence. A "Outline all SNAP gaps" map toggle outlines every tract with a SNAP gap, including those where it is the second type. Current SNAP counts: Central Florida 33, NYC 95, Salt Lake City 24.

Confidence: Low if population under 1,000 or poverty margin of error over 10 points; Medium if margin over 5; otherwise High.

Review tiers (DRAFT: our own mapping, the real Appendix A was not provided): Tier 1 recommend, human approves (classic, Medium or High confidence); Tier 2 human review before use (classic, Low confidence); Tier 3 review required, no auto-recommendation (blind spot, partial, insufficient data).

Example output per tract: geography ID and name, gap type, confidence, supporting and limiting evidence, recommended resources, review tier.

## Technical design

```
rawdata/ ──► pipeline/build_data.py ──► app/public/data/<region>.geojson ──► React app (app/src)
Census TIGERweb boundaries ─┘
```

- Pipeline: `pipeline/build_data.py` (Python standard library only) builds three regions: Central Florida (FIPS 12: Orange 095, Seminole 117, Osceola 097, Lake 069), NYC (36: 005, 047, 061, 081, 085), Salt Lake City (49: Salt Lake 035, Tooele 045). Inputs: ACS S1701, S2201, S0101; USDA SRAM straight-line table (`SD_SRAM_LILATracts_halfAnd10`, `SD_SRAM_lapophalfshare`); CDC PLACES `LACKTRPT_CrudePrev`. Tract boundaries from TIGERweb (paged).
- App: `app/` is a Vite + React 18 project. `src/App.jsx` (hash routing, region loading), `src/components/` (NavBar, BeaconLogo, TractDetail), `src/pages/` (Dashboard, MapFinder, History, About), `src/lib/classify.js` (taxonomy, confidence, tiers, evidence, resources), `src/lib/store.js` (decisions, notes, history in localStorage), `src/lib/regions.js` (regions and resource links).

- Data is static (rebuilt on demand). User decisions are stored separately in localStorage.
- Chatbot ("Chat About Data", floating button): `src/components/ChatPanel.jsx` posts to `/api/chat` (Vite proxies to port 8787). `server/index.js` (Node, no framework) calls the free Gemini API (`GEMINI_API_KEY` and optional `GEMINI_MODEL` in `app/.env`, see `.env.example`; `.env` is gitignored) with function calling. `server/tools.js` holds the tools (`region_info`, `get_tract`, `query_tracts`, `aggregate`). They reuse `classify.js`, so the chatbot and the map always agree: each tract result has `main_gap_type`, `all_gap_types`, `flagged` (any of Classic, Transportation, SNAP Enrollment Gap), per-type `recommended_actions` with their confidence, and for SNAP gaps `snap_gap_confidence`, its reason and `snap_cautions`. When `classify.js` changes, update `server/tools.js` and run `npm test` (the tests check the chatbot's SNAP counts against the numbers above). The chatbot does not write to History (actions only). Anti-hallucination: temperature 0, a strict system prompt, every statistic must come from a tool, and the server flags any number in an answer that it can't find in the tool results. Team decisions and notes are not sent to Gemini. Tract names and IDs in answers are links that open the tract on the map (switching region if needed): the server returns the tracts an answer mentions, and `src/lib/linkify.js` (a remark plugin) links them after markdown parsing. The tract detail panel has an "Ask about this tract" button that focuses the chat on that tract and offers four tract questions (why flagged, compare with county average, what to check before approving, other tracts with the same gap type). `aggregate` returns `average_per_tract` so the model never divides. Default model `gemini-flash-lite-latest`, falling back to `gemini-flash-latest` (`GEMINI_FALLBACK_MODELS`), with a 20 s timeout per call and retries on 429/5xx. In November 2026 testing the free Flash model often returned 503 "high demand", and `gemini-2.5-flash` was retired for new keys.

Commands:

```bash
# rebuild data (reads rawdata/ by default)
python pipeline/build_data.py

# run the React app (first time: npm install)
cd app
npm install
npm run dev        # http://localhost:5173
npm run server     # chat server on :8787 (second terminal; needs app/.env)
npm test           # chatbot data-tool tests, no key needed
npm run build      # production build in app/dist
```

## Data sources

`rawdata/` holds the Beacon files from the hackathon Drive folder, unzipped. The pipeline reads four of them: `Population - Below Poverty Level/` (S1701), `Households and Households Receiving SNAP Census, S2201/`, `Total Population/` (S0101), and `SRAM Straight Line Distance Data.csv` (USDA, directly in rawdata). Also present but unused: the other SRAM tables, `SNAP_Retailer_Location_data.csv` (address list, manual lookup only), `Household Income, Median/` (S1901, possible third signal), `Employed and Unemployed, 16+ Labor Force/` (B23025, small business challenge), and the CDC PLACES transportation CSV. The PLACES file has rows for Central Florida tracts but the no-reliable-transportation column (`LACKTRPT_CrudePrev`) is empty for them, matching DataKind's note.

Beacon example datasets (Drive folder from the hackathon), Census ACS 5-year 2024, USDA ERS Food Access Research Atlas (July 2026 release), Census TIGERweb, OpenStreetMap.

## Known limits and open items

- No transportation indicator for Central Florida; a stand-in third signal is untested.
- SNAP retailer address list is not used (manual lookup only).
- Review tiers are a draft; compare with Appendix A when available.
- Resource link is the Feeding America finder; add Second Harvest Food Bank of Central Florida and 211 links.
- Team features (shared notes, disagreement view, flyers, chat) are undecided.
- Very high "poor households not on SNAP" values come straight from Census estimates and should be sanity-checked with the DataKind mentor.
