'use client'

export default function ReloadButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      style={{
        marginTop: '12px', padding: '8px 16px', borderRadius: '6px',
        background: 'var(--navy)', color: 'white', fontWeight: 600,
        fontSize: '12px', border: 'none', cursor: 'pointer',
        fontFamily: 'var(--font)',
      }}
    >
      Reload Page
    </button>
  )
}
