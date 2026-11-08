import BeaconLogo from './BeaconLogo.jsx'
import { REGIONS } from '../lib/regions.js'

export default function NavBar({ pages, page, regionId, onRegion }) {
  return (
    <header className="nav">
      <a className="brand" href="#/dashboard">
        <BeaconLogo variant="dark" />
        <span className="brand-product">Gap Finder</span>
      </a>
      <nav className="nav-items">
        {pages.map((p) => (
          <a key={p.id} href={`#/${p.id}`} className={p.id === page ? 'active' : ''}>{p.label}</a>
        ))}
      </nav>
      <label className="region-picker">
        <span>Region</span>
        <select value={regionId} onChange={(e) => onRegion(e.target.value)}>
          {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </label>
    </header>
  )
}
