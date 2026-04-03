export const dynamic = 'force-dynamic'

import DemoQRCode from '../warnings/DemoQRCode'
import ResetButton from './ResetButton'
import SeedSalaryButton from './SeedSalaryButton'

export default async function DemoControlPage() {
  const payUrl = `https://spectrarsk.vercel.app/demo/pay`

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
          Share this QR with the audience to simulate payments in real time
        </div>
      </div>

      <DemoQRCode url={payUrl} />

      <div style={{ fontSize: 11, color: '#4A6A8A', fontFamily: 'IBM Plex Mono, monospace' }}>
        {payUrl}
      </div>

      <ResetButton />
      <SeedSalaryButton />

      <div style={{
        background: 'rgba(201,168,76,0.08)',
        border: '1px solid rgba(201,168,76,0.2)',
        borderRadius: 10,
        padding: '14px 20px',
        maxWidth: 360,
        fontSize: 12,
        color: '#8FA3B8',
        lineHeight: 1.7,
        textAlign: 'center',
      }}>
        Audience scans → taps <strong style={{ color: '#C9A84C' }}>Pay Now</strong> on any client →
        risk score updates on the Warnings page within 30 seconds
      </div>
    </div>
  )
}
