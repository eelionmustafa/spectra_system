export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { verifyClientToken, CLIENT_COOKIE } from '@/lib/clientAuth'
import { verifyToken } from '@/lib/auth'
import {
  getClientProfile, getClientActiveActions, getClientProducts,
  getClientAccounts, getClientAccountTransactions,
  getClientCardTransactions, getClientUpcomingPayments,
  getClientCreditTransactions, getClientCaseHistory,
  getClientPersonalInfo, getClientLoanDetails, getClientCards, getClientAmortization,
} from '@/lib/queries'
import type {
  ClientProfile, ClientProduct, ClientAccount, AccountTransaction,
  CardTransaction, ScheduledPayment, CreditTransaction, CaseAction,
  ClientPersonalInfo, ClientLoanDetail, ClientCard, AmortizationRow,
} from '@/lib/queries'
import { getActiveFreezeLimit } from '@/lib/frozenLimitService'
import { getDocumentRequests } from '@/lib/documentRequestService'
import { getEngagements } from '@/lib/engagementService'
import { getActiveRestructuringPlan } from '@/lib/restructuringService'
import { isClientResolved } from '@/lib/resolutionService'
import type { FreezeRow } from '@/lib/frozenLimitService'
import type { DocumentRequestRow } from '@/lib/documentRequestService'
import type { EngagementRow } from '@/lib/engagementService'
import type { PlanRow } from '@/lib/restructuringService'
import PortalMessaging from './PortalMessaging'

/* ─── helpers ────────────────────────────────────────────────────────────────── */
function fmtAmt(n: number, always = false) {
  const abs = Math.abs(n)
  const s = abs >= 1_000_000 ? (abs / 1_000_000).toFixed(2) + 'M'
          : abs >= 1_000     ? (abs / 1_000).toFixed(2) + 'K'
          : abs.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (n < 0 || always ? (n < 0 ? '−' : '+') : '') + '€' + s
}
function fmtDate(d: string) {
  if (!d) return ''
  const dt = new Date(d)
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function daysUntil(d: string) {
  const diff = Math.round((new Date(d).getTime() - Date.now()) / 86400000)
  if (diff < 0)  return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return `in ${diff} days`
}
function acctLabel(type: string) {
  const t = (type ?? '').toLowerCase()
  if (t.includes('saving'))   return 'Savings Account'
  if (t.includes('current') || t.includes('check')) return 'Current Account'
  if (t.includes('deposit'))  return 'Term Deposit'
  return type || 'Account'
}
function productLabel(type: string | null) {
  if (!type) return 'Loan'
  const t = type.toLowerCase()
  if (t.includes('mortgage') || t.includes('housing')) return 'Mortgage'
  if (t.includes('card') || t.includes('credit'))      return 'Credit Card'
  if (t.includes('auto') || t.includes('car'))         return 'Auto Loan'
  if (t.includes('personal'))                          return 'Personal Loan'
  if (t.includes('business') || t.includes('sme'))     return 'Business Loan'
  return type
}
function productIcon(type: string | null) {
  const l = productLabel(type)
  if (l === 'Mortgage')    return '🏠'
  if (l === 'Credit Card') return '💳'
  if (l === 'Auto Loan')   return '🚗'
  return '📋'
}
function txnIcon(amount: number, kind?: string) {
  const k = (kind ?? '').toLowerCase()
  if (k.includes('salary') || k.includes('credit') || amount > 0) return { icon: '↓', color: '#065F46', bg: '#ECFDF5' }
  return { icon: '↑', color: '#991B1B', bg: '#FEF2F2' }
}
function genderLabel(g: string) {
  if (g === 'M' || g === 'm') return 'Male'
  if (g === 'F' || g === 'f') return 'Female'
  return g || ''
}
function residentLabel(r: string) {
  if (r === '1') return 'Resident'
  if (r === '0') return 'Non-Resident'
  return r || ''
}
function acctStatusLabel(s: string) {
  if (s === '2') return 'Active'
  if (s === '4') return 'Dormant'
  if (s === '8') return 'Closed'
  return s || 'Unknown'
}

/* ─── svg icons ──────────────────────────────────────────────────────────────── */
const IconPerson = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M3 17c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)
const IconGrid = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
    <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
)
const IconWallet = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
    <rect x="2" y="5" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M2 9h16" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M6 5l3-3h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="14.5" cy="13" r="1" fill="currentColor"/>
  </svg>
)
const IconDoc = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
    <path d="M5 2h7l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M12 2v5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)
const IconCard = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
    <rect x="1" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M1 8h18" stroke="currentColor" strokeWidth="1.5"/>
    <rect x="3" y="11" width="4" height="2" rx="0.5" fill="currentColor" opacity="0.5"/>
  </svg>
)
const IconCalendar = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
    <rect x="2" y="4" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M2 9h16" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M6 2v4M14 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M6 13h2M10 13h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)
const IconChat = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
    <path d="M2 3h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6l-4 3V4a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
)
const IconLock = () => (
  <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
    <rect x="3" y="9" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M6 9V6a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="10" cy="14" r="1.5" fill="currentColor"/>
  </svg>
)
const IconAlert = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <path d="M10 2L2 17h16L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M10 8v4M10 14.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)
const IconInfo = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M10 9v5M10 6.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)
const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)
const IconPhone = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
    <path d="M4 2h4l2 5-2.5 1.5c1 2 2.5 3.5 4.5 4.5L13.5 10.5l5 2v4c0 1-1 2-2 2C6 19 1 9 1 4c0-1 1-2 3-2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
  </svg>
)
const IconMail = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
    <rect x="2" y="5" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M2 7l8 5 8-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)
const IconShield = () => (
  <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
    <path d="M10 2L3 5v6c0 4 3.5 7 7 8 3.5-1 7-4 7-8V5l-7-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <path d="M7 10.5l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

/* ─── frozen wall ────────────────────────────────────────────────────────────── */
function FrozenWall({ name, clientId }: { name: string; clientId: string }) {
  return (
    <div style={{ background: '#0D1B2A', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PortalHeader clientId={clientId} name={name} isClient showSignOut />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: '480px' }}>
          {/* Icon badge */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(153,27,27,0.12)', border: '1.5px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="32" height="32" viewBox="0 0 20 20" fill="none">
                <rect x="3" y="9" width="14" height="9" rx="2" stroke="#EF4444" strokeWidth="1.5"/>
                <path d="M6 9V6a4 4 0 0 1 8 0v3" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="10" cy="14" r="1.5" fill="#EF4444"/>
              </svg>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'white', marginBottom: '10px', letterSpacing: '-0.02em' }}>Account Restricted</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
              Hello <span style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>{name}</span>, your account
              {' '}<span style={{ fontFamily: 'monospace', color: 'rgba(201,168,76,0.8)', fontSize: '12px' }}>{clientId}</span>{' '}
              has been temporarily restricted by our risk management team.
            </div>
          </div>

          {/* What this means */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '20px 24px', marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>Account restrictions</div>
            {[
              'All transactions are blocked',
              'Withdrawals and transfers are suspended',
              'Card payments are disabled',
              'Online banking actions are restricted',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </div>
                {item}
              </div>
            ))}
          </div>

          {/* Contact */}
          <div style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '14px', padding: '20px 24px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#C9A84C', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>Contact us immediately</div>
            {[
              { Icon: IconPhone, label: 'Phone', val: '+383 38 000 000' },
              { Icon: IconMail, label: 'Email', val: 'restrictions@spectrabank.com' },
            ].map(c => (
              <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px', fontSize: '12px' }}>
                <div style={{ color: 'rgba(201,168,76,0.7)' }}><c.Icon /></div>
                <span style={{ color: 'rgba(255,255,255,0.3)', minWidth: '42px', fontSize: '11px' }}>{c.label}</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>{c.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── shared header ──────────────────────────────────────────────────────────── */
function PortalHeader({ clientId, name, balance, isClient, showSignOut, officerPreview }: {
  clientId: string; name: string; balance?: number; isClient: boolean; showSignOut?: boolean; officerPreview?: boolean
}) {
  const initials = name ? name.split(' ').map(w => w[0]).slice(0, 2).join('') : clientId.slice(0, 2).toUpperCase()
  return (
    <>
      {officerPreview && (
        <div style={{ background: '#060F18', color: 'rgba(255,255,255,0.45)', padding: '6px 24px', fontSize: '10px', display: 'flex', alignItems: 'center', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ color: '#C9A84C', fontWeight: 700, letterSpacing: '0.1em' }}>SPECTRA</span>
          <span style={{ marginLeft: '10px', marginRight: '10px', color: 'rgba(255,255,255,0.2)' }}>|</span>
          <span>Officer Preview Mode</span>
          <Link href={`/clients/${clientId}`} style={{ marginLeft: 'auto', color: '#C9A84C', textDecoration: 'none', fontSize: '10px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="#C9A84C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back to Risk View
          </Link>
        </div>
      )}
      <div style={{ background: 'linear-gradient(160deg, #07111C 0%, #0B1B30 55%, #112540 100%)', padding: '0 24px', color: 'white', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
        {/* Decorative line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.4) 30%, rgba(201,168,76,0.4) 70%, transparent)' }} />
        <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '14px', height: '60px' }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexShrink: 0 }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 8h4l2-6 2 12 2-6h2" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.1em', lineHeight: 1 }}>SPECTRA</div>
              <div style={{ fontSize: '7.5px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.14em', marginTop: '2px' }}>e-BANKING</div>
            </div>
          </div>

          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

          {/* Avatar */}
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.08))', border: '1.5px solid rgba(201,168,76,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: '#C9A84C', flexShrink: 0, letterSpacing: '0.02em' }}>{initials}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>{name}</div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', marginTop: '2px', letterSpacing: '0.03em' }}>{clientId}</div>
          </div>

          {/* Balance */}
          {balance !== undefined && (
            <div style={{ flexShrink: 0, textAlign: 'right', padding: '8px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: '8.5px', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '3px' }}>Total Balance</div>
              <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'monospace', color: balance >= 0 ? '#4ADE80' : '#F87171', letterSpacing: '-0.02em' }}>{fmtAmt(balance)}</div>
            </div>
          )}

          {/* Sign out */}
          {showSignOut && isClient && (
            <form action="/api/portal/auth/logout" method="POST" style={{ flexShrink: 0 }}>
              <button type="submit" style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', borderRadius: '8px', padding: '6px 14px', fontSize: '10px', cursor: 'pointer', letterSpacing: '0.05em', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '5px' }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10 11l4-4-4-4M14 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Sign out
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  )
}

/* ─── tab nav ────────────────────────────────────────────────────────────────── */
const TABS = [
  { key: 'profile',   label: 'Profile',   Icon: IconPerson  },
  { key: 'overview',  label: 'Overview',  Icon: IconGrid    },
  { key: 'accounts',  label: 'Accounts',  Icon: IconWallet  },
  { key: 'loans',     label: 'Loans',     Icon: IconDoc     },
  { key: 'cards',     label: 'Cards',     Icon: IconCard    },
  { key: 'payments',  label: 'Payments',  Icon: IconCalendar },
] as const
type TabKey = typeof TABS[number]['key']

function TabNav({ active, clientId }: { active: TabKey; clientId: string }) {
  return (
    <div style={{ background: 'white', borderBottom: '1px solid #E8EDF3', boxShadow: '0 1px 4px rgba(13,27,42,0.06)', position: 'sticky', top: 0, zIndex: 20 }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', padding: '0 20px', overflowX: 'auto' }}>
        {TABS.map(t => {
          const isActive = active === t.key
          return (
            <Link key={t.key} href={`/portal/${clientId}?tab=${t.key}`} style={{
              padding: '14px 16px 12px',
              fontSize: '11px',
              fontWeight: isActive ? 700 : 500,
              color: isActive ? '#0D2137' : '#94A3B8',
              textDecoration: 'none',
              borderBottom: isActive ? '2px solid #C9A84C' : '2px solid transparent',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              letterSpacing: isActive ? '0.02em' : '0',
              transition: 'color 0.15s',
            }}>
              <span style={{ opacity: isActive ? 1 : 0.5, display: 'flex', alignItems: 'center' }}>
                <t.Icon />
              </span>
              {t.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

/* ─── section wrapper ────────────────────────────────────────────────────────── */
function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'white', borderRadius: '16px', border: '1px solid rgba(13,27,42,0.07)', overflow: 'hidden', boxShadow: '0 1px 2px rgba(13,27,42,0.04), 0 4px 16px rgba(13,27,42,0.04)' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '10px', background: '#FAFBFC' }}>
        <div style={{ width: '3px', height: '18px', borderRadius: '2px', background: 'linear-gradient(180deg, #C9A84C, #E8C96A)', flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0D1B2A', letterSpacing: '0.01em' }}>{title}</div>
          {sub && <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>{sub}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}

/* ─── notice banner ──────────────────────────────────────────────────────────── */
function NoticeBanner({ variant, Icon, title, children }: {
  variant: 'red' | 'amber' | 'blue' | 'green' | 'navy'
  Icon: React.FC
  title: string
  children: React.ReactNode
}) {
  const styles = {
    red:   { bg: '#FEF2F2', border: '#FECACA', bar: '#991B1B', title: '#991B1B' },
    amber: { bg: '#FFFBEB', border: '#FDE68A', bar: '#D97706', title: '#92400E' },
    blue:  { bg: '#EFF6FF', border: '#BFDBFE', bar: '#3B82F6', title: '#1E40AF' },
    green: { bg: '#F0FDF4', border: '#BBF7D0', bar: '#16A34A', title: '#166534' },
    navy:  { bg: '#F0F4FF', border: '#C7D2FE', bar: '#1E3A5F', title: '#1E3A5F' },
  }[variant]
  return (
    <div style={{ background: styles.bg, border: `1px solid ${styles.border}`, borderLeft: `3px solid ${styles.bar}`, borderRadius: '10px', padding: '13px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      <div style={{ color: styles.bar, marginTop: '1px', flexShrink: 0 }}><Icon /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: styles.title, marginBottom: '4px' }}>{title}</div>
        <div style={{ fontSize: '11px', color: '#374151', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  )
}

/* ─── stat cell ──────────────────────────────────────────────────────────────── */
function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600, marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: color ?? '#0D1B2A', fontFamily: 'monospace', letterSpacing: '-0.01em' }}>{value}</div>
    </div>
  )
}

/* ─── badge ──────────────────────────────────────────────────────────────────── */
function Badge({ label, color }: { label: string; color: 'green' | 'red' | 'amber' | 'blue' | 'grey' }) {
  const s = {
    green: { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' },
    red:   { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA' },
    amber: { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
    blue:  { bg: '#EFF6FF', text: '#1E40AF', border: '#BFDBFE' },
    grey:  { bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0' },
  }[color]
  return (
    <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', background: s.bg, color: s.text, border: `1px solid ${s.border}`, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
  )
}

/* ─── page ────────────────────────────────────────────────────────────────────── */
export default async function ClientPortal({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { id }   = await params
  const { tab: rawTab } = await searchParams
  const activeTab: TabKey = (TABS.map(t => t.key) as string[]).includes(rawTab ?? '') ? (rawTab as TabKey) : 'overview'

  const cookieStore = await cookies()

  /* ── Auth ── */
  let isOfficerPreview = false
  let isClientSession  = false

  const clientToken = cookieStore.get(CLIENT_COOKIE)?.value
  if (clientToken) {
    let clientPayload: { clientId: string } | null = null
    try { clientPayload = await verifyClientToken(clientToken) } catch { /* invalid/expired */ }
    if (!clientPayload) {
      redirect('/portal/login')
    } else if (clientPayload.clientId !== id) {
      redirect(`/portal/${clientPayload.clientId}`)
    } else {
      isClientSession = true
    }
  }

  if (!isClientSession) {
    const officerToken = cookieStore.get('spectra_session')?.value
    if (officerToken) {
      let valid = false
      try { await verifyToken(officerToken); valid = true } catch { /* expired */ }
      if (!valid) redirect('/login')
      else isOfficerPreview = true
    }
  }

  if (!isClientSession && !isOfficerPreview) redirect('/portal/login')

  /* ── Data ── */
  let profile: ClientProfile | null = null
  let products: ClientProduct[]     = []
  let activeActions: { action: string }[] = []
  let accounts: ClientAccount[]     = []
  let accountTxns: AccountTransaction[] = []
  let cardTxns: CardTransaction[]   = []
  let upcoming: ScheduledPayment[]  = []
  let creditTxns: CreditTransaction[] = []
  let caseHistory: CaseAction[]     = []
  let personalInfo: ClientPersonalInfo | null = null
  let loanDetails: ClientLoanDetail[] = []
  let clientCards: ClientCard[] = []
  let amortization: AmortizationRow[] = []
  let activeFreeze: FreezeRow | null = null
  let pendingDocs: DocumentRequestRow[] = []
  let upcomingEngagements: EngagementRow[] = []
  let activePlan: PlanRow | null = null
  let isResolved = false

  try {
    const [profileResult, baseResults] = await Promise.all([
      getClientProfile(id).catch(() => null),
      Promise.all([
        getClientProducts(id),
        getClientActiveActions(id),
        getClientAccounts(id),
        activeTab === 'overview' || activeTab === 'accounts'
          ? getClientAccountTransactions(id, 40) : Promise.resolve([] as AccountTransaction[]),
        activeTab === 'cards'
          ? getClientCardTransactions(id, 30) : Promise.resolve([] as CardTransaction[]),
        activeTab === 'overview' || activeTab === 'loans' || activeTab === 'payments'
          ? getClientUpcomingPayments(id) : Promise.resolve([] as ScheduledPayment[]),
        activeTab === 'loans'
          ? getClientCreditTransactions(id, 30) : Promise.resolve([] as CreditTransaction[]),
        getClientCaseHistory(id),
      ]),
    ])
    profile       = profileResult
    products      = baseResults[0]
    activeActions = baseResults[1]
    accounts      = baseResults[2]
    accountTxns   = baseResults[3]
    cardTxns      = baseResults[4]
    upcoming      = baseResults[5]
    creditTxns    = baseResults[6]
    caseHistory   = baseResults[7]

    if (activeTab === 'profile') {
      personalInfo = await getClientPersonalInfo(id)
    }
    if (activeTab === 'loans') {
      const [ld, am] = await Promise.all([getClientLoanDetails(id), getClientAmortization(id)])
      loanDetails  = ld
      amortization = am
    }
    if (activeTab === 'cards') {
      clientCards = await getClientCards(id)
    }
    if (activeTab === 'payments') {
      amortization = await getClientAmortization(id)
    }

    const [freeze, docs, engagements, plan, resolved] = await Promise.allSettled([
      getActiveFreezeLimit(id),
      getDocumentRequests(id, 10),
      getEngagements(id, 10),
      getActiveRestructuringPlan(id),
      isClientResolved(id),
    ])
    if (freeze.status === 'fulfilled')       activeFreeze        = freeze.value
    if (docs.status === 'fulfilled')         pendingDocs         = docs.value.filter(d => d.status === 'Pending')
    if (engagements.status === 'fulfilled')  upcomingEngagements = engagements.value.filter(e => e.status === 'scheduled' && new Date(e.scheduled_at) > new Date())
    if (plan.status === 'fulfilled')         activePlan          = plan.value
    if (resolved.status === 'fulfilled')     isResolved          = resolved.value
  } catch {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'white', borderRadius: '16px', padding: '36px 44px', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FEF2F2', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <IconAlert />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0D1B2A', marginBottom: '6px' }}>Service Unavailable</div>
          <div style={{ fontSize: '12px', color: '#64748B' }}>Please try again later.</div>
        </div>
      </div>
    )
  }

  const isFrozen = !!(activeFreeze) || (activeActions ?? []).some(a => a.action === 'Freeze Account' || a.action === 'Freeze account')
  if (isFrozen && isClientSession) {
    return <FrozenWall name={profile?.full_name || id} clientId={id} />
  }

  const totalBalance    = accounts.reduce((s, a) => s + a.balance, 0)
  const totalCreditLim  = products.reduce((s, p) => s + p.approved_amount, 0)
  const nextPayment     = upcoming.find(u => !u.is_paid)
  const overdue         = upcoming.filter(u => !u.is_paid && new Date(u.due_date) < new Date())
  const notices         = caseHistory.filter(h => ['Legal Demand Notice', 'Restructure Offer', 'Payment Sweep'].includes(h.action))

  return (
    <div style={{ background: '#EEF2F7', minHeight: '100vh' }}>
      <style>{`
        @media (max-width: 600px) {
          .portal-kpi-grid { grid-template-columns: 1fr 1fr !important; }
          .portal-profile-grid { grid-template-columns: 1fr !important; }
          .portal-amort-grid { grid-template-columns: repeat(3,1fr) !important; }
        }
      `}</style>

      <PortalHeader
        clientId={id} name={profile?.full_name || id}
        balance={totalBalance}
        isClient={isClientSession}
        showSignOut
        officerPreview={isOfficerPreview}
      />
      <TabNav active={activeTab} clientId={id} />

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 20px 48px' }}>

        {/* ════════════════════════ PROFILE ════════════════════════ */}
        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Section title="Personal Information" sub="Your registered details with SPECTRA Bank">
              {!personalInfo ? (
                <div style={{ padding: '32px', textAlign: 'center', fontSize: '12px', color: '#94A3B8' }}>No profile data found.</div>
              ) : (
                <div className="portal-profile-grid" style={{ padding: '22px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
                  {[
                    { label: 'Full Name',       val: personalInfo.full_name || '—' },
                    { label: 'Date of Birth',   val: personalInfo.dob || '—' },
                    { label: 'Gender',          val: genderLabel(personalInfo.gender) || '—' },
                    { label: 'City',            val: personalInfo.city || '—' },
                    { label: 'Address',         val: personalInfo.address || '—' },
                    { label: 'Phone',           val: personalInfo.phone || '—' },
                    { label: 'Email',           val: personalInfo.email && personalInfo.email !== 'SKA' ? personalInfo.email : '—' },
                    { label: 'Branch',          val: personalInfo.branch || '—' },
                    { label: 'Occupation',      val: personalInfo.occupation || '—' },
                    { label: 'Residency',       val: residentLabel(personalInfo.resident) || '—' },
                    { label: 'Customer Since',  val: personalInfo.date_of_register || '—' },
                    { label: 'Customer Type',   val: personalInfo.customer_type === '0' ? 'Individual' : personalInfo.customer_type || '—' },
                  ].map((row, idx) => (
                    <div key={row.label} style={{ padding: '14px 16px', borderBottom: idx < 11 ? '1px solid #F1F5F9' : 'none', borderRight: idx % 2 === 0 ? '1px solid #F1F5F9' : 'none' }}>
                      <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600, marginBottom: '5px' }}>{row.label}</div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#0D1B2A' }}>{row.val}</div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Account Summary" sub="Overview of all your banking products">
              <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                <StatCell label="Deposit Accounts" value={String(accounts.length)} />
                <StatCell label="Active Loans"     value={String(products.length)} />
                <StatCell label="Total Balance"    value={fmtAmt(totalBalance)} color={totalBalance >= 0 ? '#065F46' : '#991B1B'} />
              </div>
              <div style={{ padding: '12px 20px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '12px' }}>Your Accounts</div>
                {accounts.slice(0, 5).map((a, i) => (
                  <div key={`${a.account_no.trim()}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0', borderBottom: i < Math.min(accounts.length, 5) - 1 ? '1px solid #F8FAFC' : 'none' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: acctLabel(a.account_type).includes('Saving') ? '#EFF6FF' : acctLabel(a.account_type).includes('Deposit') ? '#F0FDF4' : '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0, border: '1px solid rgba(0,0,0,0.05)' }}>
                      {acctLabel(a.account_type).includes('Saving') ? '💰' : acctLabel(a.account_type).includes('Deposit') ? '🏦' : '🏧'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#0D1B2A' }}>{acctLabel(a.account_type)}</div>
                      <div style={{ fontSize: '9px', color: '#94A3B8', fontFamily: 'monospace', marginTop: '2px' }}>{a.account_no}</div>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: a.balance >= 0 ? '#065F46' : '#991B1B', fontFamily: 'monospace' }}>{fmtAmt(a.balance)}</div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Contact card */}
            <div style={{ background: 'linear-gradient(160deg, #07111C 0%, #0D2137 60%, #132B49 100%)', borderRadius: '16px', padding: '24px', color: 'white', border: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.1)' }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap', position: 'relative' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Need to update your details?</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, maxWidth: '260px' }}>Visit any SPECTRA branch or contact us to update your personal information.</div>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {[{ Icon: IconPhone, label: 'Call us', sub: '+383 38 000 000' }, { Icon: IconMail, label: 'Email', sub: 'support@spectrabank.com' }].map(c => (
                    <div key={c.label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '11px', padding: '12px 16px', border: '1px solid rgba(255,255,255,0.09)', minWidth: '145px' }}>
                      <div style={{ color: '#C9A84C', marginBottom: '6px' }}><c.Icon /></div>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#C9A84C', marginBottom: '3px' }}>{c.label}</div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{c.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════ OVERVIEW ════════════════════════ */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Notices */}
            {(isFrozen || isResolved || overdue.length > 0 || notices.length > 0 || activeFreeze || pendingDocs.length > 0 || upcomingEngagements.length > 0 || activePlan) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {isResolved && (
                  <NoticeBanner variant="green" Icon={IconCheck} title="Case Resolved">
                    Your account is in good standing — all concerns have been reviewed and resolved by our risk team. No further action is required on your end.
                  </NoticeBanner>
                )}
                {isFrozen && (
                  <NoticeBanner variant="red" Icon={IconLock} title="Account Restricted">
                    Transactions are currently blocked. Please contact your advisor immediately.
                  </NoticeBanner>
                )}
                {activeFreeze && (
                  <NoticeBanner variant="navy" Icon={IconLock} title="Credit Limit Frozen">
                    Your credit limit has been temporarily frozen by our risk team.
                    {activeFreeze.reason && <> Reason: <em>{activeFreeze.reason}</em>.</>}
                    {' '}Please contact your branch to discuss.
                    <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '5px', fontFamily: 'monospace' }}>Since {new Date(activeFreeze.frozen_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                  </NoticeBanner>
                )}
                {pendingDocs.length > 0 && (
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderLeft: '3px solid #D97706', borderRadius: '10px', padding: '13px 16px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{ color: '#D97706', marginTop: '1px' }}>
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M5 2h7l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5"/><path d="M12 2v5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400E', marginBottom: '4px' }}>
                          Documents Required — {pendingDocs.length} request{pendingDocs.length > 1 ? 's' : ''} pending
                        </div>
                        <div style={{ fontSize: '11px', color: '#374151', marginBottom: '10px', lineHeight: 1.6 }}>
                          Your bank has requested the following documents. Please submit them to your branch or relationship manager.
                        </div>
                        {pendingDocs.map((req, i) => {
                          const docs = (() => { try { return JSON.parse(req.requested_docs) as string[] } catch { return [req.requested_docs] } })()
                          return (
                            <div key={req.id} style={{ marginBottom: '8px', padding: '10px 12px', background: 'rgba(255,255,255,0.7)', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: docs.length > 0 ? '5px' : 0 }}>
                                {docs.map((d: string) => (
                                  <span key={d} style={{ fontSize: '10px', fontWeight: 600, padding: '3px 9px', borderRadius: '20px', background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>{d}</span>
                                ))}
                              </div>
                              {req.due_date && <div style={{ fontSize: '10px', color: '#B45309', marginTop: '4px' }}>Due by: <strong>{new Date(req.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>}
                              {req.notes && <div style={{ fontSize: '10px', color: '#374151', marginTop: '3px', fontStyle: 'italic' }}>{req.notes}</div>}
                              {i === 0 && <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '4px', fontFamily: 'monospace' }}>Requested {new Date(req.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
                {upcomingEngagements.length > 0 && (
                  <NoticeBanner variant="green" Icon={IconCalendar} title={upcomingEngagements[0].type === 'call' ? 'Scheduled Call with Your Advisor' : 'Scheduled Meeting with Your Advisor'}>
                    {new Date(upcomingEngagements[0].scheduled_at).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                    {' at '}
                    {new Date(upcomingEngagements[0].scheduled_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    {upcomingEngagements[0].notes && <div style={{ marginTop: '3px', fontStyle: 'italic' }}>{upcomingEngagements[0].notes}</div>}
                    {upcomingEngagements.length > 1 && <div style={{ marginTop: '4px', fontWeight: 600, color: '#16A34A' }}>+{upcomingEngagements.length - 1} more scheduled</div>}
                  </NoticeBanner>
                )}
                {activePlan && (
                  <NoticeBanner variant="navy" Icon={IconDoc} title={`Restructuring Proposal — ${activePlan.status}`}>
                    Your bank has submitted a{' '}
                    <strong>{{ LoanExtension: 'Loan Extension', PaymentHoliday: 'Payment Holiday', RateReduction: 'Rate Reduction', DebtConsolidation: 'Debt Consolidation', PartialWriteOff: 'Partial Write-Off' }[activePlan.type] ?? activePlan.type}</strong>{' '}
                    proposal. Please contact your branch to review and approve.
                    <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '5px', fontFamily: 'monospace' }}>Proposed {new Date(activePlan.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                  </NoticeBanner>
                )}
                {overdue.length > 0 && (
                  <NoticeBanner variant="amber" Icon={IconAlert} title={`Overdue Payments — ${overdue.length} instalment${overdue.length > 1 ? 's' : ''}`}>
                    You have past-due scheduled payments. Please arrange payment to avoid additional fees.
                  </NoticeBanner>
                )}
                {notices.map((n, i) => (
                  <NoticeBanner key={i} variant="blue" Icon={IconInfo} title={n.action === 'Legal Demand Notice' ? 'Legal Demand Notice' : n.action === 'Restructure Offer' ? 'Payment Plan Offer' : 'Automatic Debit'}>
                    {n.notes}
                    <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '4px', fontFamily: 'monospace' }}>{n.createdAt.slice(0, 10)}</div>
                  </NoticeBanner>
                ))}
              </div>
            )}

            {/* KPI cards */}
            <div className="portal-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
              {[
                {
                  label: 'Total Balance',
                  value: fmtAmt(totalBalance),
                  sub: `${accounts.length} account${accounts.length !== 1 ? 's' : ''}`,
                  color: totalBalance >= 0 ? '#059669' : '#DC2626',
                  barColor: totalBalance >= 0 ? '#059669' : '#DC2626',
                },
                {
                  label: 'Total Credit',
                  value: fmtAmt(totalCreditLim),
                  sub: `${products.length} loan${products.length !== 1 ? 's' : ''}`,
                  color: '#1E3A5F',
                  barColor: '#1E3A5F',
                },
                {
                  label: 'Next Payment',
                  value: nextPayment ? fmtAmt(nextPayment.scheduled_amount) : '—',
                  sub: nextPayment ? daysUntil(nextPayment.due_date) : 'No upcoming',
                  color: nextPayment && !nextPayment.is_paid && new Date(nextPayment.due_date) < new Date() ? '#DC2626' : '#92400E',
                  barColor: nextPayment && !nextPayment.is_paid && new Date(nextPayment.due_date) < new Date() ? '#DC2626' : '#D97706',
                },
              ].map(k => (
                <div key={k.label} style={{ background: 'white', borderRadius: '14px', border: '1px solid rgba(13,27,42,0.07)', boxShadow: '0 1px 2px rgba(13,27,42,0.04), 0 4px 16px rgba(13,27,42,0.04)', overflow: 'hidden' }}>
                  <div style={{ height: '3px', background: k.barColor, opacity: 0.6 }} />
                  <div style={{ padding: '16px 18px 18px' }}>
                    <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, marginBottom: '10px' }}>{k.label}</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: k.color, fontFamily: 'monospace', letterSpacing: '-0.02em', lineHeight: 1 }}>{k.value}</div>
                    <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '8px', fontWeight: 500 }}>{k.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Accounts quick view */}
            {accounts.length > 0 && (
              <Section title="My Accounts" sub="Your deposit accounts at a glance">
                {accounts.slice(0, 4).map((a, i) => (
                  <div key={`${a.account_no.trim()}-${i}`} style={{ padding: '13px 20px', borderBottom: i < accounts.slice(0, 4).length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: '13px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: acctLabel(a.account_type).includes('Saving') ? '#EFF6FF' : acctLabel(a.account_type).includes('Deposit') ? '#F0FDF4' : '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0, border: '1px solid rgba(0,0,0,0.05)' }}>
                      {acctLabel(a.account_type).includes('Saving') ? '💰' : acctLabel(a.account_type).includes('Deposit') ? '🏦' : '🏧'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0D1B2A' }}>{acctLabel(a.account_type)}</div>
                      <div style={{ fontSize: '9px', color: '#94A3B8', fontFamily: 'monospace', marginTop: '2px' }}>{a.account_no}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: a.balance >= 0 ? '#065F46' : '#991B1B', fontFamily: 'monospace' }}>{fmtAmt(a.balance)}</div>
                      <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '2px', letterSpacing: '0.04em' }}>{a.currency}</div>
                    </div>
                  </div>
                ))}
                {accounts.length > 4 && (
                  <div style={{ padding: '10px 20px', borderTop: '1px solid #F8FAFC' }}>
                    <Link href={`/portal/${id}?tab=accounts`} style={{ fontSize: '11px', color: '#1E3A5F', textDecoration: 'none', fontWeight: 600 }}>View all {accounts.length} accounts →</Link>
                  </div>
                )}
              </Section>
            )}

            {/* Recent transactions */}
            {accountTxns.length > 0 && (
              <Section title="Recent Transactions" sub="Latest account activity">
                {accountTxns.slice(0, 8).map((t, i) => {
                  const ic = txnIcon(t.amount)
                  const slice8 = accountTxns.slice(0, 8)
                  return (
                    <div key={i} style={{ padding: '11px 20px', borderBottom: i < slice8.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: ic.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 800, color: ic.color, flexShrink: 0 }}>{ic.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description ? t.description.slice(0, 50) : acctLabel(t.account_type)}</div>
                        <div style={{ fontSize: '9px', color: '#94A3B8', fontFamily: 'monospace', marginTop: '2px' }}>{t.account_no} · {fmtDate(t.date)}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: t.amount >= 0 ? '#065F46' : '#991B1B', fontFamily: 'monospace' }}>{fmtAmt(t.amount, true)}</div>
                      </div>
                    </div>
                  )
                })}
                <div style={{ padding: '10px 20px', borderTop: '1px solid #F8FAFC' }}>
                  <Link href={`/portal/${id}?tab=accounts`} style={{ fontSize: '11px', color: '#1E3A5F', textDecoration: 'none', fontWeight: 600 }}>View all transactions →</Link>
                </div>
              </Section>
            )}

            {/* Next payment */}
            {nextPayment && (
              <Section title="Next Scheduled Payment">
                <div style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0, border: '1px solid #E0E7FF' }}>{productIcon(nextPayment.product_type)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0D1B2A' }}>{productLabel(nextPayment.product_type)}</div>
                    <div style={{ fontSize: '9px', color: '#94A3B8', fontFamily: 'monospace', marginTop: '3px' }}>{nextPayment.credit_account}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '20px', fontWeight: 800, color: '#0D2137', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{fmtAmt(nextPayment.scheduled_amount)}</div>
                    <div style={{ fontSize: '11px', color: new Date(nextPayment.due_date) < new Date() ? '#991B1B' : '#92400E', fontWeight: 600, marginTop: '3px' }}>{fmtDate(nextPayment.due_date)} · {daysUntil(nextPayment.due_date)}</div>
                  </div>
                </div>
                <div style={{ padding: '0 20px 14px' }}>
                  <Link href={`/portal/${id}?tab=payments`} style={{ fontSize: '11px', color: '#1E3A5F', textDecoration: 'none', fontWeight: 600 }}>View full payment schedule →</Link>
                </div>
              </Section>
            )}
          </div>
        )}

        {/* ════════════════════════ ACCOUNTS ════════════════════════ */}
        {activeTab === 'accounts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {accounts.length === 0 ? (
              <div style={{ background: 'white', borderRadius: '16px', padding: '48px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No deposit accounts found.</div>
            ) : accounts.map((a, ai) => {
              const txns = accountTxns.filter(t => t.account_no === a.account_no)
              return (
                <Section key={`${a.account_no.trim()}-${ai}`} title={acctLabel(a.account_type)} sub={`Account: ${a.account_no} · ${a.currency}`}>
                  <div style={{ padding: '16px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', display: 'flex', gap: '32px', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600, marginBottom: '5px' }}>Available Balance</div>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: a.balance >= 0 ? '#065F46' : '#991B1B', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{fmtAmt(a.balance)}</div>
                    </div>
                    {a.amount_on_hold > 0 && (
                      <div style={{ paddingLeft: '32px', borderLeft: '1px solid #E2E8F0' }}>
                        <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600, marginBottom: '5px' }}>On Hold</div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#92400E', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{fmtAmt(a.amount_on_hold)}</div>
                      </div>
                    )}
                  </div>
                  {txns.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: '#94A3B8' }}>No recent transactions.</div>
                  ) : txns.slice(0, 20).map((t, i) => {
                    const ic = txnIcon(t.amount)
                    return (
                      <div key={i} style={{ padding: '11px 20px', borderBottom: i < txns.slice(0, 20).length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: ic.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: ic.color, flexShrink: 0 }}>{ic.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '11px', fontWeight: 500, color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description ? t.description.slice(0, 60) : t.amount >= 0 ? 'Incoming Transfer' : 'Outgoing Transfer'}</div>
                          <div style={{ fontSize: '9px', color: '#94A3B8', fontFamily: 'monospace', marginTop: '2px' }}>{fmtDate(t.date)}</div>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: t.amount >= 0 ? '#065F46' : '#991B1B', fontFamily: 'monospace', flexShrink: 0 }}>{fmtAmt(t.amount, true)}</div>
                      </div>
                    )
                  })}
                </Section>
              )
            })}
          </div>
        )}

        {/* ════════════════════════ LOANS ════════════════════════ */}
        {activeTab === 'loans' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {products.length === 0 ? (
              <div style={{ background: 'white', borderRadius: '16px', padding: '48px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No active loans.</div>
            ) : products.map((p, pi) => {
              const myTxns  = creditTxns.filter(t => t.credit_account === p.credit_account)
              const myPay   = upcoming.filter(u => u.credit_account === p.credit_account)
              const detail  = loanDetails.find(d => d.credit_account === p.credit_account)
              const myAmort = amortization.filter(a => a.credit_account === p.credit_account)
              const stageColor = p.stage === 'Stage 1' ? '#065F46' : p.stage === 'Stage 2' ? '#92400E' : '#991B1B'
              const stageLabel = p.stage === 'Stage 1' ? 'Current' : p.stage === 'Stage 2' ? 'Watch' : 'Overdue'
              const stageBadge = p.stage === 'Stage 1' ? 'green' : p.stage === 'Stage 2' ? 'amber' : 'red'
              return (
                <Section key={`${p.credit_account.trim()}-${pi}`} title={`${productIcon(p.product_type)} ${productLabel(p.product_type)}`} sub={`Account: ${p.credit_account}`}>
                  <div style={{ padding: '16px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                    {(() => {
                      const nextInst = myPay.find(u => !u.is_paid)
                      return [
                        { label: 'Loan Amount',    value: fmtAmt(p.approved_amount), color: '#0D1B2A' },
                        { label: 'Next Instalment', value: nextInst ? fmtAmt(nextInst.scheduled_amount) : '—', color: nextInst && !nextInst.is_paid && new Date(nextInst.due_date) < new Date() ? '#991B1B' : '#1E3A5F' },
                        { label: 'Days Overdue',   value: p.due_days > 0 ? `${p.due_days}d` : 'None', color: p.due_days > 0 ? '#991B1B' : '#065F46' },
                        { label: 'Status',         value: stageLabel, color: stageColor },
                      ]
                    })().map(k => (
                      <StatCell key={k.label} label={k.label} value={k.value} color={k.color} />
                    ))}
                  </div>

                  {detail && (detail.interest_rate > 0 || detail.from_date || detail.period_months > 0) && (
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', background: '#FAFBFC' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '12px' }}>Loan Terms</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                        {detail.interest_rate > 0 && <StatCell label="Interest Rate" value={`${detail.interest_rate.toFixed(2)}%`} />}
                        {detail.period_months > 0 && <StatCell label="Term" value={`${detail.period_months}m`} />}
                        {detail.from_date && <StatCell label="Start Date" value={fmtDate(detail.from_date)} />}
                        {detail.to_date && <StatCell label="End Date" value={fmtDate(detail.to_date)} />}
                      </div>
                      {detail.installments_amount > 0 && (
                        <div style={{ marginTop: '12px', padding: '10px 14px', background: '#EFF6FF', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #E0E7FF' }}>
                          <span style={{ fontSize: '11px', color: '#1E3A5F', fontWeight: 600 }}>Monthly Instalment</span>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: '#1E3A5F', fontFamily: 'monospace' }}>{fmtAmt(detail.installments_amount)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {myAmort.length > 0 && (
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '10px' }}>Amortization Schedule</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                          <thead>
                            <tr style={{ background: '#F8FAFC' }}>
                              {['#', 'Due Date', 'Principal', 'Interest', 'Annuity', 'Outstanding', 'Status'].map(h => (
                                <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: '8.5px', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #E8EDF3', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {myAmort.slice(0, 12).map((row, i) => {
                              const isOverdue = !row.is_paid && new Date(row.due_date) < new Date()
                              return (
                                <tr key={i} style={{ background: isOverdue ? '#FEF9F9' : row.is_paid ? '#F0FDF4' : 'white', borderBottom: i < myAmort.slice(0,12).length-1 ? '1px solid #F8FAFC' : 'none' }}>
                                  <td style={{ padding: '6px 10px', color: '#94A3B8', fontSize: '10px' }}>{row.instalment_no}</td>
                                  <td style={{ padding: '6px 10px', color: isOverdue ? '#991B1B' : '#0D1B2A', fontWeight: 500, whiteSpace: 'nowrap' }}>{fmtDate(row.due_date)}</td>
                                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#0D1B2A' }}>{fmtAmt(row.principal)}</td>
                                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#92400E' }}>{fmtAmt(row.interest)}</td>
                                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#0D2137' }}>{fmtAmt(row.annuity)}</td>
                                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#64748B' }}>{fmtAmt(row.outstanding)}</td>
                                  <td style={{ padding: '6px 10px' }}>
                                    {row.is_paid
                                      ? <Badge label="Paid" color="green" />
                                      : isOverdue
                                        ? <Badge label="Overdue" color="red" />
                                        : <Badge label="Due" color="grey" />}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {myPay.length > 0 && (
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '10px' }}>Upcoming Instalments</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {myPay.slice(0, 4).map((pay, i) => {
                          const isOverdue = !pay.is_paid && new Date(pay.due_date) < new Date()
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '9px', background: isOverdue ? '#FEF2F2' : pay.is_paid ? '#ECFDF5' : '#F8FAFC', border: `1px solid ${isOverdue ? '#FECACA' : pay.is_paid ? '#A7F3D0' : '#E8EDF3'}` }}>
                              <span style={{ fontSize: '16px', flexShrink: 0 }}>{pay.is_paid ? '✅' : isOverdue ? '⚠️' : '📅'}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: isOverdue ? '#991B1B' : '#0D1B2A' }}>{fmtDate(pay.due_date)}</div>
                                <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '2px' }}>{daysUntil(pay.due_date)}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: isOverdue ? '#991B1B' : '#0D2137', fontFamily: 'monospace' }}>{fmtAmt(pay.scheduled_amount)}</div>
                                {pay.paid_amount > 0 && !pay.is_paid && (
                                  <div style={{ fontSize: '9px', color: '#065F46', marginTop: '2px' }}>Paid: {fmtAmt(pay.paid_amount)}</div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {myTxns.length > 0 && (
                    <div style={{ padding: '14px 20px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '10px' }}>Repayment History</div>
                      {myTxns.slice(0, 6).map((t, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0', borderBottom: i < myTxns.slice(0, 6).length - 1 ? '1px solid #F8FAFC' : 'none' }}>
                          <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: '#ECFDF5', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#065F46', fontWeight: 800, flexShrink: 0 }}>↓</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '11px', fontWeight: 500, color: '#0D1B2A' }}>{t.kind || 'Payment'}</div>
                            <div style={{ fontSize: '9px', color: '#94A3B8', fontFamily: 'monospace', marginTop: '2px' }}>{fmtDate(t.date)}</div>
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: '#065F46', fontFamily: 'monospace' }}>{fmtAmt(Math.abs(t.amount))}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              )
            })}
          </div>
        )}

        {/* ════════════════════════ CARDS ════════════════════════ */}
        {activeTab === 'cards' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {cardTxns.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {clientCards.length === 0 ? (
                  <div style={{ background: 'white', borderRadius: '16px', padding: '48px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>No cards found.</div>
                ) : clientCards.map((card, ci) => (
                  <Section key={`${card.card_no}-${ci}`} title={card.brand_label + ' ' + card.type_label} sub={'Card ending in ' + card.card_no.slice(-4)}>
                    <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                      <StatCell label="Status" value={card.card_status_label} color={card.card_status_label === 'Active' ? '#065F46' : '#92400E'} />
                      <StatCell label="Kind"   value={card.kind_label || '—'} />
                      <StatCell label="Issued" value={fmtDate(card.production_date)} />
                    </div>
                    <div style={{ padding: '14px 20px', fontSize: '11px', color: '#94A3B8' }}>No recent card transactions available.</div>
                  </Section>
                ))}
              </div>
            ) : (() => {
              const byCard = cardTxns.reduce<Record<string, CardTransaction[]>>((acc, t) => {
                const key = t.card_no.trim()
                acc[key] = acc[key] ?? []
                acc[key].push(t)
                return acc
              }, {})
              return Object.entries(byCard).map(([cardNo, txns]) => {
                const totalSpend = txns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
                const thisMonth  = txns.filter(t => t.date?.slice(0, 7) === new Date().toISOString().slice(0, 7))
                const monthSpend = thisMonth.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
                const cardMeta   = clientCards.find(c => c.card_no === cardNo)
                return (
                  <Section key={cardNo} title="Credit Card" sub={`Card ending in ${cardNo.slice(-4)}`}>
                    <div style={{ padding: '16px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                      <StatCell label="This Month"        value={fmtAmt(monthSpend)} />
                      <StatCell label="Total Transactions" value={String(txns.length)} />
                      <StatCell label="All-time Spend"    value={fmtAmt(totalSpend)} color="#92400E" />
                    </div>
                    {cardMeta && (
                      <div style={{ padding: '12px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', gap: '24px', flexWrap: 'wrap', background: '#FAFBFC' }}>
                        {[
                          { label: 'Brand',     val: cardMeta.brand_label },
                          { label: 'Type',      val: cardMeta.type_label },
                          { label: 'Kind',      val: cardMeta.kind_label },
                          { label: 'Status',    val: cardMeta.card_status_label },
                          { label: 'Issued',    val: fmtDate(cardMeta.production_date) },
                          { label: 'Delivered', val: fmtDate(cardMeta.delivery_date) },
                        ].filter(r => r.val).map(r => (
                          <div key={r.label}>
                            <div style={{ fontSize: '9px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: '3px' }}>{r.label}</div>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: r.label === 'Status' && r.val === 'Active' ? '#065F46' : r.label === 'Status' ? '#92400E' : '#0D1B2A' }}>{r.val}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {txns.slice(0, 20).map((t, i) => (
                      <div key={i} style={{ padding: '11px 20px', borderBottom: i < txns.slice(0, 20).length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: '#FFF1F2', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>💳</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || 'Card Transaction'}</div>
                          <div style={{ fontSize: '9px', color: '#94A3B8', fontFamily: 'monospace', marginTop: '2px' }}>{fmtDate(t.date)}</div>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#991B1B', fontFamily: 'monospace', flexShrink: 0 }}>−{fmtAmt(Math.abs(t.amount))}</div>
                      </div>
                    ))}
                  </Section>
                )
              })
            })()}
          </div>
        )}

        {/* ════════════════════════ PAYMENTS ════════════════════════ */}
        {activeTab === 'payments' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Section title="Payment Schedule" sub="Upcoming and recent instalments across all loans">
              {upcoming.length === 0 ? (
                <div style={{ padding: '36px', textAlign: 'center', fontSize: '12px', color: '#94A3B8' }}>No scheduled payments found.</div>
              ) : upcoming.map((pay, i) => {
                const isOverdue = !pay.is_paid && new Date(pay.due_date) < new Date()
                return (
                  <div key={i} style={{ padding: '13px 20px', borderBottom: i < upcoming.length - 1 ? '1px solid #F8FAFC' : 'none', background: pay.is_paid ? '#F0FDF4' : isOverdue ? '#FEF9F9' : 'white', display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>{pay.is_paid ? '✅' : isOverdue ? '⚠️' : '📅'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: pay.is_paid ? '#065F46' : isOverdue ? '#991B1B' : '#0D1B2A' }}>{productLabel(pay.product_type)}</span>
                        {isOverdue && <Badge label="Overdue" color="red" />}
                        {pay.is_paid && <Badge label="Paid" color="green" />}
                      </div>
                      <div style={{ fontSize: '9px', color: '#94A3B8', fontFamily: 'monospace', marginTop: '3px' }}>{pay.credit_account} · Due: {fmtDate(pay.due_date)}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: pay.is_paid ? '#065F46' : isOverdue ? '#991B1B' : '#0D1B2A', fontFamily: 'monospace' }}>{fmtAmt(pay.scheduled_amount)}</div>
                      {!pay.is_paid && <div style={{ fontSize: '10px', color: isOverdue ? '#991B1B' : '#92400E', fontWeight: 600, marginTop: '2px' }}>{daysUntil(pay.due_date)}</div>}
                      {pay.is_paid && pay.paid_amount > 0 && <div style={{ fontSize: '10px', color: '#065F46', marginTop: '2px' }}>Paid: {fmtAmt(pay.paid_amount)}</div>}
                    </div>
                  </div>
                )
              })}
            </Section>

            {amortization.length > 0 && (() => {
              const byLoan = amortization.reduce<Record<string, AmortizationRow[]>>((acc, r) => {
                const key = r.credit_account.trim()
                acc[key] = acc[key] ?? []; acc[key].push(r); return acc
              }, {})
              return Object.keys(byLoan).length > 0 ? (
                <Section title="Amortization Details" sub="Principal vs. interest breakdown per loan">
                  {Object.entries(byLoan).map(([acct, rows]) => {
                    const totalPrincipal = rows.reduce((s, r) => s + r.principal, 0)
                    const totalInterest  = rows.reduce((s, r) => s + r.interest, 0)
                    const totalAnnuity   = rows.reduce((s, r) => s + r.annuity, 0)
                    const paidRows       = rows.filter(r => r.is_paid)
                    const outstanding    = rows.find(r => !r.is_paid)?.outstanding ?? 0
                    return (
                      <div key={acct} style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#0D1B2A', marginBottom: '12px', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {acct}
                          <Badge label={`${paidRows.length}/${rows.length} paid`} color={paidRows.length === rows.length ? 'green' : 'blue'} />
                        </div>
                        <div className="portal-amort-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px' }}>
                          <StatCell label="Total Principal" value={fmtAmt(totalPrincipal)} />
                          <StatCell label="Total Interest"  value={fmtAmt(totalInterest)} color="#92400E" />
                          <StatCell label="Total Annuity"   value={fmtAmt(totalAnnuity)} color="#1E3A5F" />
                          <StatCell label="Paid"            value={`${paidRows.length}/${rows.length}`} color={paidRows.length === rows.length ? '#065F46' : '#0D1B2A'} />
                          <StatCell label="Outstanding"     value={outstanding > 0 ? fmtAmt(outstanding) : '—'} color={outstanding > 0 ? '#991B1B' : '#065F46'} />
                        </div>
                      </div>
                    )
                  })}
                </Section>
              ) : null
            })()}

            {notices.length > 0 && (
              <Section title="Bank Notices" sub="Important communications regarding your account">
                {notices.map((n, i) => (
                  <div key={i} style={{ padding: '14px 20px', borderBottom: i < notices.length - 1 ? '1px solid #F8FAFC' : 'none', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: n.action === 'Legal Demand Notice' ? '#FEF2F2' : '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid ' + (n.action === 'Legal Demand Notice' ? '#FECACA' : '#BFDBFE') }}>
                      <span style={{ fontSize: '15px' }}>{n.action === 'Legal Demand Notice' ? '⚖️' : n.action === 'Restructure Offer' ? '📋' : '💰'}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0D1B2A', marginBottom: '4px' }}>{n.action}</div>
                      <div style={{ fontSize: '11px', color: '#374151', lineHeight: 1.6 }}>{n.notes}</div>
                      <div style={{ fontSize: '9px', color: '#94A3B8', marginTop: '5px', fontFamily: 'monospace' }}>{n.createdAt.slice(0, 10)}</div>
                    </div>
                  </div>
                ))}
              </Section>
            )}

            <div style={{ background: 'linear-gradient(160deg, #07111C 0%, #0D2137 60%, #132B49 100%)', borderRadius: '16px', padding: '24px', color: 'white', border: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.1)' }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap', position: 'relative' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Need to arrange a payment?</div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, maxWidth: '260px' }}>Contact us to discuss repayment options, restructuring, or to arrange a transfer.</div>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {[{ Icon: IconPhone, label: 'Call us', sub: '+383 38 000 000' }, { Icon: IconMail, label: 'Email', sub: 'support@spectrabank.com' }].map(c => (
                    <div key={c.label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '11px', padding: '12px 16px', border: '1px solid rgba(255,255,255,0.09)', minWidth: '145px' }}>
                      <div style={{ color: '#C9A84C', marginBottom: '6px' }}><c.Icon /></div>
                      <div style={{ fontSize: '10px', fontWeight: 700, color: '#C9A84C', marginBottom: '3px' }}>{c.label}</div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>{c.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '36px', paddingBottom: '8px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '10px', color: '#B0BAC9', background: 'rgba(255,255,255,0.6)', borderRadius: '20px', padding: '5px 14px', border: '1px solid rgba(13,27,42,0.06)' }}>
            <span style={{ color: '#94A3B8' }}><IconShield /></span>
            Secure Session · SPECTRA e-Banking · {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
          </div>
        </div>
      </div>
      <PortalMessaging clientId={id} />
    </div>
  )
}
