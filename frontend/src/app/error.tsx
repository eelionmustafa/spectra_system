'use client'

function isTimeout(err: Error) {
  return err.message?.toLowerCase().includes('timeout') || err.message?.toLowerCase().includes('timed out')
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const timeout = isTimeout(error)

  return (
    <div className="content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="panel" style={{ padding: '36px 40px', textAlign: 'center', maxWidth: 520 }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: timeout ? '#FFFBEB' : '#FEF2F2',
          border: `1px solid ${timeout ? '#FDE68A' : '#FECACA'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          {timeout ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          )}
        </div>

        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 8 }}>
          {timeout ? 'Query timed out' : 'Something went wrong'}
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 24, lineHeight: 1.7 }}>
          {timeout
            ? 'The database took too long to respond. This is usually temporary — retry in a moment.'
            : (error.message || 'An unexpected error occurred while loading this page.')}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            onClick={reset}
            style={{
              padding: '8px 20px', background: 'var(--navy)', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            Retry
          </button>
          <button
            onClick={() => { window.location.href = '/' }}
            style={{
              padding: '8px 20px', background: 'transparent', color: 'var(--muted)',
              border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            }}
          >
            Dashboard
          </button>
        </div>

        {error.digest && (
          <div style={{ marginTop: 20, fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            ref: {error.digest}
          </div>
        )}
      </div>
    </div>
  )
}
