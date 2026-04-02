'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  intervalMs?: number
}

export default function LiveRefreshBanner({ intervalMs = 30000 }: Props) {
  const router = useRouter()
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
      setLastRefresh(new Date())
    }, intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])

  const seconds = Math.round(intervalMs / 1000)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '5px 10px',
      marginBottom: 12,
      borderRadius: 6,
      background: 'rgba(16,185,129,0.08)',
      border: '1px solid rgba(16,185,129,0.18)',
      fontSize: 12,
      color: '#94a3b8',
      width: 'fit-content',
    }}>
      <span style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#10B981',
        display: 'inline-block',
        boxShadow: '0 0 0 0 rgba(16,185,129,0.6)',
        animation: 'spectra-pulse-dot 2s ease-in-out infinite',
      }} />
      <span style={{ color: '#10B981', fontWeight: 600 }}>Live</span>
      <span>· refreshes every {seconds}s</span>
      {lastRefresh && (
        <span style={{ color: '#64748b', marginLeft: 4 }}>· Updated just now</span>
      )}
      <style>{`
        @keyframes spectra-pulse-dot {
          0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.6); }
          70%  { box-shadow: 0 0 0 6px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
        }
      `}</style>
    </div>
  )
}
