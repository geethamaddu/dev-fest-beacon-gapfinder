export const REGIONS = [
  {
    id: 'central-florida',
    name: 'Central Florida',
    counties: 'Orange, Seminole, Osceola, Lake',
    hasTransport: false,
    transportNote:
      'Transportation-Compounded Gap is not available for Central Florida: the CDC PLACES file has rows for its tracts, but the "lack of reliable transportation" column is empty for all of them (DataKind confirms this data is NYC and Salt Lake City only). A possible stand-in we have not applied yet is the USDA low vehicle access flag (100+ households without a car more than 1/2 mile from a SNAP store).',
    resource: { name: 'Feeding America food bank finder (Second Harvest Food Bank of Central Florida)', url: 'https://www.feedingamerica.org/find-your-local-foodbank' },
  },
  {
    id: 'nyc',
    name: 'New York City',
    counties: 'Bronx, Brooklyn, Manhattan, Queens, Staten Island',
    hasTransport: true,
    transportNote:
      'Few Transportation-Compounded Gaps in NYC: the gap needs the USDA food-desert (LILA) flag, and only 7 NYC tracts have it at 1/2 mile because grocery stores are close almost everywhere. Transportation is a CDC model-based estimate.',
    resource: { name: 'NYC Food Help finder', url: 'https://finder.nyc.gov/foodhelp/' },
  },
  {
    id: 'salt-lake-city',
    name: 'Salt Lake City',
    counties: 'Salt Lake, Tooele',
    hasTransport: true,
    transportNote:
      'Transportation-Compounded Gap uses the CDC PLACES "lack of reliable transportation" estimate, a model-based figure, together with the USDA food-desert (LILA) flag.',
    resource: { name: '211 Utah', url: 'https://211utah.org/' },
  },
]

export const regionById = (id) => REGIONS.find((r) => r.id === id) || REGIONS[0]
