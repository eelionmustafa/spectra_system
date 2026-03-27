'use client'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export default function ErrorState({ message = 'Something went wrong', onRetry }: ErrorStateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '16px', textAlign: 'center', padding: '32px' }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--red)' }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <div>
        <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--red)', marginBottom: '4px' }}>Error</p>
        <p style={{ fontSize: '12px', color: 'var(--muted)' }}>{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{ padding: '7px 16px', background: 'var(--navy)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', fontWeight: 500, color: 'var(--text)', cursor: 'pointer' }}
        >
          Try again
        </button>
      )}
    </div>
  )
}
