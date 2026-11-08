// Official Beacon logo, cut from docs/Beacon_Brand_Guidelines.pdf (page 2).
// White version for dark backgrounds, dark version for light backgrounds.
export default function BeaconLogo({ variant = 'white', height = 26 }) {
  const src = `${import.meta.env.BASE_URL}beacon-logo-${variant}.png`
  return <img src={src} alt="Beacon" height={height} style={{ display: 'block', height, width: 'auto' }} />
}
