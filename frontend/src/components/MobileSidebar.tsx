'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { SessionPayload } from '@/lib/auth'
import { ROLE_BADGE } from '@/lib/users'

interface Props { session: SessionPayload | null; onClose: () => void }

const NAV_ICON = {
  home: <svg viewBox="0 0 15 15" fill="none"><path d="M1 8L7.5 2 14 8v6H9.5v-4h-4V14H1V8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  monitoring: <svg viewBox="0 0 15 15" fill="none"><rect x="1" y="3" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 9l2-2.5 2 1.5 2-3 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  notifications: <svg viewBox="0 0 15 15" fill="none"><path d="M7.5 1.5a4 4 0 0 1 4 4v2.5l1 1.5H2.5L3.5 8V5.5a4 4 0 0 1 4-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M6 11a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  portfolio: <svg viewBox="0 0 15 15" fill="none"><rect x="1" y="9" width="3" height="5" stroke="currentColor" strokeWidth="1.2"/><rect x="6" y="5" width="3" height="9" stroke="currentColor" strokeWidth="1.2"/><rect x="11" y="1" width="3" height="13" stroke="currentColor" strokeWidth="1.2"/></svg>,
  warnings: <svg viewBox="0 0 15 15" fill="none"><path d="M7.5 1L14 13H1L7.5 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M7.5 6v3M7.5 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  watchlist: <svg viewBox="0 0 15 15" fill="none"><rect x="2" y="1.5" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5h5M5 7.5h5M5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  clients: <svg viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/><path d="M1.5 13c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  analytics: <svg viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M7.5 7.5L11 5M7.5 7.5v-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  concentration: <svg viewBox="0 0 15 15" fill="none"><path d="M1 13L5 7l3 3 3-5 3 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 1v12h13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  stress: <svg viewBox="0 0 15 15" fill="none"><path d="M1 13h3l2-6 2 4 2-8 2 6h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  audit: <svg viewBox="0 0 15 15" fill="none"><rect x="2" y="1" width="11" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5h5M5 7.5h5M5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  logout: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
}

export default function MobileSidebar({ session, onClose }: Props) {
  const path   = usePathname()
  const router = useRouter()
  const badge  = session ? (ROLE_BADGE[session.role] ?? { label: session.role, color: '#94A3B8' }) : null
  const isActive = (href: string) => path === href || (href !== '/' && path.startsWith(href))

  // Close on route change
  useEffect(() => { onClose() }, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  function NavItem({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
      <Link
        href={href}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '11px 16px', borderRadius: 7, textDecoration: 'none',
          background: isActive(href) ? 'rgba(201,168,76,0.1)' : 'none',
          borderLeft: isActive(href) ? '2px solid var(--gold)' : '2px solid transparent',
          color: isActive(href) ? 'var(--gold2)' : 'var(--slate)',
          fontSize: 13, fontWeight: isActive(href) ? 600 : 400,
          marginBottom: 1,
        }}
      >
        <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
        {label}
      </Link>
    )
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 200, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 260,
        background: 'var(--navy)', zIndex: 201,
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid rgba(201,168,76,0.15)',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, background: 'var(--gold)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 8h4l2-6 2 12 2-6h2" stroke="#0D1B2A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)', letterSpacing: '0.05em' }}>SPECTRA</div>
              <div style={{ fontSize: 8, color: 'var(--slate)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>Risk Intelligence</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 4 }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: '10px 8px' }}>
          <div style={{ fontSize: '8.5px', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(143,163,184,0.5)', padding: '0 8px', marginBottom: 4 }}>Monitor</div>
          <NavItem href="/"              icon={NAV_ICON.home}          label="Dashboard" />
          <NavItem href="/portfolio"     icon={NAV_ICON.portfolio}     label="Portfolio" />
          <NavItem href="/monitoring"    icon={NAV_ICON.monitoring}    label="Monitoring" />
          <NavItem href="/notifications" icon={NAV_ICON.notifications} label="Notifications" />

          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '8px 0' }} />

          <div style={{ fontSize: '8.5px', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(143,163,184,0.5)', padding: '0 8px', marginBottom: 4 }}>Risk</div>
          <NavItem href="/warnings"      icon={NAV_ICON.warnings}      label="Early Warnings" />
          <NavItem href="/watchlist"     icon={NAV_ICON.watchlist}     label="Watchlist" />
          <NavItem href="/clients"       icon={NAV_ICON.clients}       label="Clients" />
          <NavItem href="/analytics"     icon={NAV_ICON.analytics}     label="Analytics" />
          <NavItem href="/concentration" icon={NAV_ICON.concentration} label="Concentration" />
          <NavItem href="/stress"        icon={NAV_ICON.stress}        label="Stress Test" />

          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '8px 0' }} />

          <div style={{ fontSize: '8.5px', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(143,163,184,0.5)', padding: '0 8px', marginBottom: 4 }}>System</div>
          <NavItem href="/audit" icon={NAV_ICON.audit} label="Audit Log" />
        </div>

        {/* User footer */}
        {session && badge && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, color: 'var(--gold)', flexShrink: 0 }}>
              {session.initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.name}</div>
              <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: `${badge.color}22`, color: badge.color, fontWeight: 700 }}>{badge.label}</span>
            </div>
            <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 4 }}>
              {NAV_ICON.logout}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
