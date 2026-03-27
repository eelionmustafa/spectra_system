'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RESTRICTED_ACTIONS } from '@/lib/users'
import type { Role } from '@/lib/users'
import type { RecommendedAction, Urgency } from '@/lib/actionEngine'

// ─── Legacy string-based action support ─────────────────────────────────────────────

const LEGACY_CONFIRM = new Set([
  'Freeze Account', 'Freeze account',
  'Legal Review', 'Legal review', 'Legal referral',
  'Escalate', 'Escalate case', 'Escalate → Recovery',
  'Restructure',
])

const LEGACY_NAVIGATE = new Set([
  'Call Now', 'Contact immediately', 'Urgent client contact',
])

const LEGACY_DESTRUCTIVE = new Set([
  'Freeze Account', 'Freeze account',
  'Legal Review', 'Legal review', 'Legal referral',
  'Escalate', 'Escalate case', 'Escalate → Recovery',
])

const LEGACY_DESCRIPTION: Record<string, string> = {
  'Freeze Account':        'Logs an account freeze request to the action register.',
  'Freeze account':        'Logs an account freeze request to the action register.',
  'Legal Review':          'Creates a legal review case and logs it to the action register.',
  'Legal review':          'Creates a legal review case and logs it to the action register.',
  'Legal referral':        'Refers this client to the legal team. Logged to the action register.',
  'Restructure':           'Initiates a loan restructuring review. This will be logged.',
  'Escalate':              'Escalates this case to the senior risk manager.',
  'Escalate case':         'Escalates this case to the senior risk manager.',
  'Escalate → Recovery':  'Escalates immediately to the recovery team.',
}

// ─── Urgency display config ─────────────────────────────────────────────────────────

const URGENCY_LABEL: Record<Urgency, string> = {
  IMMEDIATE: '⚡ Today',
  URGENT:    '🔔 24h',
  STANDARD:  '📋 7d',
  ROUTINE:   '📅 30d',
}

const URGENCY_COLOR: Record<Urgency, string> = {
  IMMEDIATE: '#9B1C1C',
  URGENT:    '#92400E',
  STANDARD:  'var(--navy)',
  ROUTINE:   'var(--muted)',
}

const URGENCY_BG: Record<Urgency, string> = {
  IMMEDIATE: '#FEF2F2',
  URGENT:    '#FFFBEB',
  STANDARD:  'rgba(13,27,42,0.05)',
  ROUTINE:   '#F4F7FA',
}

// ─── Role-aware tooltip helper ────────────────────────────────────────────

const ROLE_DISPLAY: Partial<Record<Role, string>> = {
  admin:        'Administrators',
  risk_officer: 'Risk officers',
  analyst:      'Analysts',
}

function blockedTooltip(userRole: Role | undefined): string {
  const roleLabel = userRole ? (ROLE_DISPLAY[userRole] ?? userRole) : 'Your role'
  return roleLabel + ' do not have permission to execute this action. Contact a senior risk manager.'
}

// ─── Props ────────────────────────────────────────────────────────────────────────────

interface PropsStructured {
  mode: 'structured'
  actions: RecommendedAction[]
  clientId?: string
  userRole?: Role
}

interface PropsLegacy {
  mode?: 'legacy'
  actions: string[]
  accentColor: string
  accentBg: string
  clientId?: string
  userRole?: Role
}

type Props = PropsStructured | PropsLegacy

// ─── Component ────────────────────────────────────────────────────────────────────────────

export default function ActionChips(props: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [done, setDone]             = useState<Set<string>>(new Set())
  const [confirmAction, setConfirmAction] = useState<RecommendedAction | null>(null)

  const isStructured = props.mode === 'structured'

  function canExecute(label: string, requiresRole?: 'any' | 'risk_officer'): boolean {
    if (requiresRole === 'risk_officer')
      return props.userRole === 'admin' || props.userRole === 'risk_officer'
    return !RESTRICTED_ACTIONS.has(label) ||
      props.userRole === 'admin' || props.userRole === 'risk_officer'
  }

  function logAction(label: string) {
    fetch('/api/actions/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: label,
        clientId: props.clientId ?? null,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {})
  }

  function executeStructured(action: RecommendedAction) {
    setConfirmAction(null)
    setDone(prev => new Set([...prev, action.label]))
    logAction(action.label)
    if (LEGACY_NAVIGATE.has(action.label) && props.clientId) {
      setTimeout(() => router.push(`/client/${props.clientId}`), 500)
    }
  }

  function executeLegacy(label: string) {
    setConfirming(null)
    setDone(prev => new Set([...prev, label]))
    logAction(label)
    if (LEGACY_NAVIGATE.has(label) && props.clientId) {
      setTimeout(() => router.push(`/client/${props.clientId}`), 500)
    }
  }

  // ── STRUCTURED MODE ──────────────────────────────────────────────────────────────

  if (isStructured) {
    const structuredActions = (props as PropsStructured).actions

    // Confirming a destructive action
    if (confirmAction) {
      return (
        <div style={{
          marginTop: '6px', padding: '10px 12px',
          background: '#FEF2F2', borderRadius: '7px', border: '1px solid #FECACA',
        }}>
          <div style={{ fontSize: '10px', color: '#7F1D1D', fontWeight: 600, marginBottom: '4px' }}>
            Confirm: {confirmAction.label}
          </div>
          <div style={{ fontSize: '10px', color: '#9B1C1C', marginBottom: '8px', lineHeight: 1.5 }}>
            {confirmAction.trigger}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => executeStructured(confirmAction)} style={{
              fontSize: '9px', padding: '4px 12px', borderRadius: '5px',
              border: '1px solid #9B1C1C', background: '#9B1C1C', color: 'white',
              cursor: 'pointer', fontWeight: 600,
            }}>Confirm</button>
            <button onClick={() => setConfirmAction(null)} style={{
              fontSize: '9px', padding: '4px 10px', borderRadius: '5px',
              border: '1px solid #FECACA', background: 'white', color: '#9B1C1C',
              cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '4px' }}>
        {structuredActions.map((action, i) => {
          const isDone    = done.has(action.label)
          const blocked   = !canExecute(action.label, action.requiresRole)

          if (isDone) {
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 10px', borderRadius: '7px',
                background: '#EAF9F2', border: '1px solid #A7F3D0',
              }}>
                <span style={{ color: '#065F46', fontSize: '12px', fontWeight: 700 }}>✓</span>
                <span style={{ fontSize: '11px', color: '#065F46', fontWeight: 500 }}>{action.label}</span>
                <span style={{ fontSize: '9px', color: '#6EE7B7', marginLeft: 'auto' }}>Logged</span>
                {/* No undo for destructive actions */}
                {!action.destructive && (
                  <button onClick={() => setDone(prev => { const n = new Set(prev); n.delete(action.label); return n })}
                    style={{ fontSize: '9px', color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    undo
                  </button>
                )}
              </div>
            )
          }

          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '7px 10px', borderRadius: '7px',
              background: blocked ? '#F8FAFC' : URGENCY_BG[action.urgency],
              border: `1px solid ${blocked ? 'var(--border)' : action.urgency === 'IMMEDIATE' ? '#FECACA' : 'var(--border)'}`,
              opacity: blocked ? 0.7 : 1,
            }}>
              {/* Urgency badge */}
              <span style={{
                fontSize: '8px', padding: '1px 5px', borderRadius: '4px', fontWeight: 700,
                background: blocked ? '#EEF2F7' : `${URGENCY_COLOR[action.urgency]}15`,
                color: blocked ? 'var(--muted)' : URGENCY_COLOR[action.urgency],
                flexShrink: 0, fontFamily: 'var(--mono)',
              }}>
                {URGENCY_LABEL[action.urgency]}
              </span>

              {/* Action label + trigger */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: blocked ? 'var(--muted)' : 'var(--text)' }}>
                  {action.label}
                  {blocked && <span style={{ marginLeft: '4px', fontSize: '9px' }}>🔒</span>}
                </div>
                <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '1px', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {action.trigger}
                </div>
              </div>

              {/* Action button */}
              <button
                disabled={blocked}
                onClick={() => {
                  if (blocked) return
                  if (action.destructive) setConfirmAction(action)
                  else executeStructured(action)
                }}
                title={blocked ? blockedTooltip(props.userRole) : action.sla}
                style={{
                  fontSize: '9px', padding: '3px 10px', borderRadius: '5px', flexShrink: 0,
                  border: `1px solid ${blocked ? '#CBD5E1' : URGENCY_COLOR[action.urgency]}`,
                  background: blocked ? 'white' : URGENCY_COLOR[action.urgency],
                  color: blocked ? '#94A3B8' : 'white',
                  cursor: blocked ? 'not-allowed' : 'pointer',
                  fontFamily: 'var(--font)', fontWeight: 600,
                }}
              >
                {action.destructive ? 'Confirm →' : 'Execute'}
              </button>
            </div>
          )
        })}
      </div>
    )
  }

  // ── LEGACY MODE (string[] format — backward compatibility) ───────────────────────

  const legacyActions = (props as PropsLegacy).actions
  const { accentColor, accentBg } = props as PropsLegacy

  if (confirming) {
    const desc = LEGACY_DESCRIPTION[confirming] ?? `Confirm: ${confirming}?`
    return (
      <div style={{
        marginTop: '6px', padding: '10px 12px',
        background: '#FEF2F2', borderRadius: '7px', border: '1px solid #FECACA',
      }}>
        <div style={{ fontSize: '10px', color: '#9B1C1C', marginBottom: '8px', lineHeight: 1.5 }}>{desc}</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => executeLegacy(confirming)} style={{
            fontSize: '9px', padding: '4px 12px', borderRadius: '5px',
            border: '1px solid #9B1C1C', background: '#9B1C1C', color: 'white',
            cursor: 'pointer', fontWeight: 600,
          }}>Confirm</button>
          <button onClick={() => setConfirming(null)} style={{
            fontSize: '9px', padding: '4px 10px', borderRadius: '5px',
            border: '1px solid #FECACA', background: 'white', color: '#9B1C1C',
            cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '5px' }}>
      {legacyActions.map(a => {
        const isDone  = done.has(a)
        const blocked = !canExecute(a)

        if (isDone) {
          return (
            <span key={a} style={{
              fontSize: '9px', padding: '3px 8px', borderRadius: '5px',
              background: '#EAF9F2', color: '#065F46', border: '1px solid #A7F3D0',
              display: 'inline-flex', alignItems: 'center', gap: '4px',
            }}>
              ✓ {a}
              {!LEGACY_DESTRUCTIVE.has(a) && (
                <button onClick={() => setDone(prev => { const n = new Set(prev); n.delete(a); return n })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '9px', padding: 0, marginLeft: '2px' }}>
                  ×
                </button>
              )}
            </span>
          )
        }

        return (
          <button key={a}
            onClick={() => {
              if (!canExecute(a)) return
              if (LEGACY_CONFIRM.has(a)) setConfirming(a)
              else executeLegacy(a)
            }}
            disabled={blocked}
            title={blocked ? blockedTooltip(props.userRole) : a}
            style={{
              fontSize: '9px', padding: '3px 8px', borderRadius: '5px',
              border: `1px solid ${blocked ? '#CBD5E1' : `${accentColor}40`}`,
              background: blocked ? '#F1F5F9' : accentBg,
              color: blocked ? '#94A3B8' : accentColor,
              cursor: blocked ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font)', fontWeight: 500, opacity: blocked ? 0.6 : 1,
            }}
          >
            {a}{blocked && <span style={{ marginLeft: '4px', fontSize: '8px' }}>🔒</span>}
          </button>
        )
      })}
    </div>
  )
}

