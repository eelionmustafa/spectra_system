'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import type { SessionPayload } from '@/lib/auth'
import { ROLE_BADGE } from '@/lib/users'

interface Props { session: SessionPayload }

interface NavItemProps {
  href: string
  icon: React.ReactNode
  label: string
  count?: number | null
  countColor?: string
  collapsed: boolean
  isActive: (href: string) => boolean
}

function NavItem({ href, icon, label, count, countColor, collapsed, isActive }: NavItemProps) {
  const active = isActive(href)
  return (
    <Link href={href} className={`nav-item${active ? ' active' : ''}`} title={collapsed ? label : undefined}>
      <span className="ni">{icon}</span>
      {!collapsed && <span className="nt">{label}</span>}
      {count != null && count > 0 && (
        collapsed
          ? <span className="nb-dot" style={countColor ? { background: countColor } : undefined} />
          : <span className="nb" style={countColor ? { background: countColor } : undefined}>{count > 99 ? '99+' : count}</span>
      )}
    </Link>
  )
}

const NAV_ICON = {
  home: <svg viewBox="0 0 15 15" fill="none"><path d="M1 8L7.5 2 14 8v6H9.5v-4h-4V14H1V8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  monitoring: <svg viewBox="0 0 15 15" fill="none"><rect x="1" y="3" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 9l2-2.5 2 1.5 2-3 2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  notifications: <svg viewBox="0 0 15 15" fill="none"><path d="M7.5 1.5a4 4 0 0 1 4 4v2.5l1 1.5H2.5L3.5 8V5.5a4 4 0 0 1 4-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M6 11a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  portfolio: <svg viewBox="0 0 15 15" fill="none"><rect x="1" y="9" width="3" height="5" stroke="currentColor" strokeWidth="1.2"/><rect x="6" y="5" width="3" height="9" stroke="currentColor" strokeWidth="1.2"/><rect x="11" y="1" width="3" height="13" stroke="currentColor" strokeWidth="1.2"/></svg>,
  warnings: <svg viewBox="0 0 15 15" fill="none"><path d="M7.5 1L14 13H1L7.5 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M7.5 6v3M7.5 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  watchlist: <svg viewBox="0 0 15 15" fill="none"><rect x="2" y="1.5" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5h5M5 7.5h5M5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  clients: <svg viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/><path d="M1.5 13c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  compare: <svg viewBox="0 0 15 15" fill="none"><circle cx="4.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="10.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1 13c0-2.5 1.6-3.5 3.5-3.5S8 10.5 8 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M7 13c0-2.5 1.6-3.5 3.5-3.5S14 10.5 14 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  analytics: <svg viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M7.5 7.5L11 5M7.5 7.5v-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  concentration: <svg viewBox="0 0 15 15" fill="none"><path d="M1 13L5 7l3 3 3-5 3 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 1v12h13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  model: <svg viewBox="0 0 15 15" fill="none"><path d="M2 11l3-4 2 2 3-5 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="5" cy="7" r="1" fill="currentColor"/><circle cx="7" cy="9" r="1" fill="currentColor"/><circle cx="10" cy="4" r="1" fill="currentColor"/><circle cx="13" cy="7" r="1" fill="currentColor"/></svg>,
  stress: <svg viewBox="0 0 15 15" fill="none"><path d="M1 13h3l2-6 2 4 2-8 2 6h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  audit:   <svg viewBox="0 0 15 15" fill="none"><rect x="2" y="1" width="11" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5h5M5 7.5h5M5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="3.5" cy="5" r="0.8" fill="currentColor"/><circle cx="3.5" cy="7.5" r="0.8" fill="currentColor"/><circle cx="3.5" cy="10" r="0.8" fill="currentColor"/></svg>,
  reports: <svg viewBox="0 0 15 15" fill="none"><path d="M3 13V7l2-2h5l2 2v6H3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M6 5V2h3v3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M6 10h3M6 8h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  collapse: (flip: boolean) => <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d={flip ? 'M4 2l4 4-4 4' : 'M8 2L4 6l4 4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  logout: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
}

export default function Sidebar({ session }: Props) {
  const path   = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sb-collapsed') === '1' } catch { return false }
  })
  const [alertCount, setAlertCount]             = useState<number | null>(null)
  const [watchlistCount, setWatchlistCount]     = useState<number | null>(null)
  const [notifCount, setNotifCount]             = useState<number | null>(null)

  const toggle = useCallback(() => {
    setCollapsed(c => {
      try { localStorage.setItem('sb-collapsed', c ? '0' : '1') } catch {}
      return !c
    })
  }, [])

  useEffect(() => {
    fetch('/api/alerts/count').then(r => r.json()).then(d => setAlertCount(d.count ?? 0)).catch(() => setAlertCount(0))
    fetch('/api/watchlist/count').then(r => r.json()).then(d => setWatchlistCount(d.count ?? 0)).catch(() => setWatchlistCount(0))
    fetch('/api/notifications').then(r => r.json()).then(d => setNotifCount(d.unreadCount ?? 0)).catch(() => setNotifCount(0))
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const badge = ROLE_BADGE[session.role] ?? { label: session.role, color: '#94A3B8' }
  const isActive = (href: string) => path === href || (href !== '/' && path.startsWith(href))

  return (
    <div className={`sidebar${collapsed ? ' sc' : ''}`}>

      {/* Logo */}
      <div className="logo">
        <div className="logo-mark">
          <img src="/logo.png" alt="SPECTRA" width={22} height={22} style={{ objectFit: 'contain' }} />
        </div>
        {!collapsed && (
          <div>
            <div className="logo-name">SPECTRA</div>
            <div className="logo-sub">Risk Intelligence</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="nav">
        <div className="nav-group">
          {!collapsed && <div className="nav-label">Monitor</div>}
          <NavItem href="/"               icon={NAV_ICON.home}          label="Dashboard"     collapsed={collapsed} isActive={isActive} />
          <NavItem href="/portfolio"      icon={NAV_ICON.portfolio}     label="Portfolio"     collapsed={collapsed} isActive={isActive} />
          <NavItem href="/monitoring"     icon={NAV_ICON.monitoring}    label="Monitoring"    collapsed={collapsed} isActive={isActive} />
          <NavItem href="/notifications"  icon={NAV_ICON.notifications} label="Notifications"  count={notifCount} countColor="var(--red)" collapsed={collapsed} isActive={isActive} />
        </div>

        <div className="nav-div"/>

        <div className="nav-group">
          {!collapsed && <div className="nav-label">Risk</div>}
          <NavItem href="/warnings"      icon={NAV_ICON.warnings}      label="Early Warnings" count={alertCount}     collapsed={collapsed} isActive={isActive} />
          <NavItem href="/watchlist"     icon={NAV_ICON.watchlist}    label="Watchlist"      count={watchlistCount} countColor="var(--amber)" collapsed={collapsed} isActive={isActive} />
          <NavItem href="/clients"       icon={NAV_ICON.clients}      label="Clients"        collapsed={collapsed} isActive={isActive} />
          <NavItem href="/compare"       icon={NAV_ICON.compare}      label="Compare"        collapsed={collapsed} isActive={isActive} />
          <NavItem href="/analytics"     icon={NAV_ICON.analytics}    label="Analytics"      collapsed={collapsed} isActive={isActive} />
          <NavItem href="/concentration" icon={NAV_ICON.concentration} label="Concentration"  collapsed={collapsed} isActive={isActive} />
          <NavItem href="/stress"        icon={NAV_ICON.stress}       label="Stress Test"    collapsed={collapsed} isActive={isActive} />
        </div>

        <div className="nav-div"/>

        <div className="nav-group">
          {!collapsed && <div className="nav-label">System</div>}
          <NavItem href="/audit" icon={NAV_ICON.audit} label="Audit Log" collapsed={collapsed} isActive={isActive} />
        </div>

      </div>

      {/* Collapse toggle */}
      <button className="sb-toggle" onClick={toggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {NAV_ICON.collapse(collapsed)}
        {!collapsed && <span style={{ fontSize: '10px', color: 'var(--slate)' }}>Collapse</span>}
      </button>

      {/* User footer */}
      <div className="s-user" title={collapsed ? `${session.name} · ${badge.label}` : undefined}>
        <div className="s-av">{session.initials}</div>
        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="s-name">{session.name}</div>
              <span style={{
                display: 'inline-block', fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
                background: `${badge.color}22`, color: badge.color, fontWeight: 700, letterSpacing: '0.04em', marginTop: '2px',
              }}>
                {badge.label}
              </span>
            </div>
            <button onClick={handleLogout} className="sb-logout" title="Sign out">
              {NAV_ICON.logout}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
