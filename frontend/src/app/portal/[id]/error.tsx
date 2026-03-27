'use client'

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: '32px', textAlign: 'center', maxWidth: 420, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff' }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, color: '#111' }}>Unable to load your account</div>
        <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>
          {error.message ?? 'Please try again or contact your relationship manager.'}
        </div>
        <button
          onClick={reset}
          style={{ padding: '8px 20px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
        >
          Retry
        </button>
      </div>
    </div>
  )
}
