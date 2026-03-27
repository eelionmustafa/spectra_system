'use client'
import { useState, useEffect } from 'react'
import RefreshButton from './RefreshButton'
import NotificationBell from './NotificationBell'
import MobileSidebar from './MobileSidebar'
import type { SessionPayload } from '@/lib/auth'

interface Crumb { label: string; href?: string }

export default function Topbar({
  title,
  sub,
  breadcrumbs,
}: {
  title: string
  sub?: string
  breadcrumbs?: Crumb[]
}) {
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [session, setSession] = useState<SessionPayload | null>(null)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(s => setSession(s)).catch(() => {})
  }, [])

  return (
    <>
      <div className="topbar">
        {/* Hamburger — mobile only, only when logged in */}
        <button
          className="tb-hamburger"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 }}>
          {breadcrumbs && breadcrumbs.length > 0 ? (
            <div className="tb-breadcrumb">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {i > 0 && <span className="tb-breadcrumb-sep">/</span>}
                  {crumb.href
                    ? <a href={crumb.href} style={{ color: 'var(--muted)', textDecoration: 'none' }} className="tb-breadcrumb-link">{crumb.label}</a>
                    : <span className="tb-breadcrumb-cur">{crumb.label}</span>
                  }
                </span>
              ))}
            </div>
          ) : (
            <div>
              <span className="tb-title">{title}</span>
              {sub && <span className="tb-sub">— {sub}</span>}
            </div>
          )}
          {breadcrumbs && breadcrumbs.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="tb-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
              {sub && <span className="tb-sub">— {sub}</span>}
            </div>
          )}
        </div>

        <div className="tb-right">
          <RefreshButton />
          <div className="tb-divider" />
          <span className="tb-date">{date}</span>
          <NotificationBell />
        </div>
      </div>

      {mobileOpen && (
        <MobileSidebar session={session ?? null} onClose={() => setMobileOpen(false)} />
      )}
    </>
  )
}
