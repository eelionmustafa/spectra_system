'use client'
import { useState } from 'react'
import { ClientProfile } from '@/lib/queries'

export default function AISummary({ profile }: { profile: ClientProfile }) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/risk-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else setSummary(data.summary)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel ai-panel" style={{ marginTop: '12px' }}>
      <div className="ph">
        <span className="pt">AI Risk Assessment</span>
        <span className="ai-badge">Claude</span>
      </div>
      {!summary && !loading && !error && (
        <button className="ai-btn" onClick={generate}>
          Generate AI risk summary ↗
        </button>
      )}
      {loading && (
        <div className="ai-loading" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Analysing client profile…
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
      {error && (
        <>
          <div className="ai-error">{error}</div>
          <button className="ai-regen" onClick={generate}>Retry</button>
        </>
      )}
      {summary && (
        <>
          <div className="ai-output">{summary}</div>
          <button className="ai-regen" onClick={generate}>Regenerate</button>
        </>
      )}
    </div>
  )
}
