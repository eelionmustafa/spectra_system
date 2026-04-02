'use client'

import { useEffect, useRef, type ReactNode } from 'react'

export default function CaseReviewDisclosure({
  autoOpen,
  summary,
  children,
}: {
  autoOpen: boolean
  summary: ReactNode
  children: ReactNode
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    if (autoOpen && detailsRef.current && !detailsRef.current.open) {
      detailsRef.current.open = true
    }
  }, [autoOpen])

  return (
    <details
      ref={detailsRef}
      style={{ marginTop: '16px' }}
      suppressHydrationWarning
    >
      <summary
        style={{
          cursor: 'pointer',
          listStyle: 'none',
          padding: '12px 14px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F7FAFD 100%)',
          boxShadow: 'var(--shadow)',
        }}
      >
        {summary}
      </summary>

      <div style={{ marginTop: '10px' }}>
        {children}
      </div>
    </details>
  )
}
