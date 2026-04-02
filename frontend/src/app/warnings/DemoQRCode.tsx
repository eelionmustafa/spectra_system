'use client'

import { QRCodeSVG } from 'qrcode.react'

interface Props {
  url: string
}

export default function DemoQRCode({ url }: Props) {
  return (
    <div style={{
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      background: '#0f172a',
      border: '1px solid #1e293b',
      borderRadius: 12,
      padding: '12px 16px',
    }}>
      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: 0.5 }}>
        Scan to simulate a payment
      </div>
      <div style={{ background: '#fff', borderRadius: 8, padding: 6 }}>
        <QRCodeSVG value={url} size={120} />
      </div>
      <div style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>{url}</div>
    </div>
  )
}
