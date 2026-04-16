export const dynamic = 'force-dynamic'

import ResetButton from './ResetButton'
import SeedSalaryButton from './SeedSalaryButton'
import LiveFeed from './LiveFeed'

export default async function DemoControlPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0D1B2A',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 32,
      padding: 32,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: '#8FA3B8', marginBottom: 8 }}>
          SPECTRA
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#C9A84C', fontFamily: 'IBM Plex Mono, monospace' }}>
          Live Demo Control
        </div>
        <div style={{ fontSize: 13, color: '#8FA3B8', marginTop: 8 }}>
          Live payment feed · reset between demos
        </div>
      </div>

      <LiveFeed />

      <div style={{ display: 'flex', gap: 12 }}>
        <ResetButton />
        <SeedSalaryButton />
      </div>
    </div>
  )
}
