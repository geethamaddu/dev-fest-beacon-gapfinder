export const REGIONS = [
  {
    id: 'central-florida',
    name: 'Central Florida',
    counties: 'Orange, Seminole, Osceola, Lake',
    hasTransport: false,
    resource: { name: 'Feeding America food bank finder (Second Harvest Food Bank of Central Florida)', url: 'https://www.feedingamerica.org/find-your-local-foodbank' },
  },
  {
    id: 'nyc',
    name: 'New York City',
    counties: 'Bronx, Brooklyn, Manhattan, Queens, Staten Island',
    hasTransport: true,
    resource: { name: 'NYC Food Help finder', url: 'https://finder.nyc.gov/foodhelp/' },
  },
  {
    id: 'salt-lake-city',
    name: 'Salt Lake City',
    counties: 'Salt Lake, Tooele',
    hasTransport: true,
    resource: { name: '211 Utah', url: 'https://211utah.org/' },
  },
]

export const regionById = (id) => REGIONS.find((r) => r.id === id) || REGIONS[0]
