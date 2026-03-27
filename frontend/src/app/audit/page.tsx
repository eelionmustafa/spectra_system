export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Topbar from '@/components/Topbar'
import { getAuditLog, getAuditStats } from '@/lib/queries'
import lazy from 'next/dynamic'
import SectionHeader from '@/components/SectionHeader'
import DownloadCSV from '@/components/DownloadCSV'
const _skel = () => <div style={{ height: 180, borderRadius: 8, background: '#F8FAFC', animation: 'pulse 1.5s ease-in-out infinite' }} />
const ActionTypeChart = lazy(() => import('./ActionTypeChart'), { loading: _skel })
const ActionUserChart = lazy(() => import('./ActionUserChart'), { loading: _skel })
const AuditTable      = lazy(() => import('./AuditTable'), { loading: () => <div style={{ height: 300, borderRadius: 8, background: '#F8FAFC', animation: 'pulse 1.5s ease-in-out infinite' }} /> })

function AuditSkeleton() {
  return (
    <div className="content">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="kcard" style={{ animation: `pulse 1.4s ease-in-out ${i * 0.08}s infinite` }}>
            <div style={{ height: 10, width: '60%', borderRadius: 3, background: '#EEF2F7', marginBottom: 8 }} />
            <div style={{ height: 24, width: '40%', borderRadius: 4, background: '#EEF2F7', marginBottom: 6 }} />
            <div style={{ height: 10, width: '30%', borderRadius: 3, background: '#F1F5F9', marginLeft: 'auto' }} />
          </div>
        ))}
      </div>
      <div style={{ height: 200, borderRadius: 8, background: '#F8FAFC', border: '1px solid var(--border)', animation: 'pulse 1.4s ease-in-out 0.2s infinite' }} />
    </div>
  )
}

async function AuditContent() {
  let log: Awaited<ReturnType<typeof getAuditLog>> = []
  let stats: Awaited<ReturnType<typeof getAuditStats>> = { total_today: 0, total_week: 0, active_freezes: 0, total_all: 0 }

  try {
    ;[log, stats] = await Promise.all([getAuditLog(100), getAuditStats()])
  } catch {
    return (
      <div className="content">
        <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
          Database not connected — fill in <code>.env</code> with SSMS credentials.
        </div>
      </div>
    )
  }

  const actionCounts: Record<string, number> = {}
  for (const e of log) {
    const k = e.action
    actionCounts[k] = (actionCounts[k] ?? 0) + 1
  }
  const topActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).slice(0, 6)

  const byUser: Record<string, number> = {}
  for (const e of log) {
    byUser[e.actionedBy] = (byUser[e.actionedBy] ?? 0) + 1
  }
  const topUsers = Object.entries(byUser).sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <div className="content">

      <SectionHeader title="Activity Summary" sub="last 100 actions" />
      <div className="row4">
        {[
          { label: 'Today',         val: stats.total_today,   color: 'var(--navy)',  badge: 'bb', badgeLabel: 'Actions' },
          { label: 'This Week',     val: stats.total_week,    color: 'var(--navy)',  badge: 'bb', badgeLabel: 'Actions' },
          { label: 'Active Freezes', val: stats.active_freezes, color: stats.active_freezes > 0 ? 'var(--red)' : 'var(--green)', badge: stats.active_freezes > 0 ? 'br' : 'bg', badgeLabel: stats.active_freezes > 0 ? 'Active' : 'None' },
          { label: 'Total Logged',  val: stats.total_all,     color: 'var(--navy)',  badge: 'bb', badgeLabel: 'All time' },
        ].map(k => (
          <div key={k.label} className="kcard" style={{ borderLeft: `3px solid ${k.color}` }}>
            <div className="kl">{k.label}</div>
            <div className="kv" style={{ color: k.color }}>{(k.val ?? 0).toLocaleString()}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' }}>
              <span className={`badge ${k.badge}`}>{k.badgeLabel}</span>
            </div>
          </div>
        ))}
      </div>

      <SectionHeader title="Action Breakdown" sub="by type & user" />
      <div className="row2">
        <div className="panel">
          <div className="ph"><span className="pt">Actions by type</span><span className="pa">last 100 entries</span></div>
          {topActions.length === 0
            ? <div style={{ fontSize: '11px', color: 'var(--muted)', padding: '8px 0' }}>No actions recorded yet</div>
            : <ActionTypeChart data={topActions} />
          }
        </div>
        <div className="panel">
          <div className="ph"><span className="pt">Actions by user</span><span className="pa">top contributors</span></div>
          {topUsers.length === 0
            ? <div style={{ fontSize: '11px', color: 'var(--muted)', padding: '8px 0' }}>No users recorded yet</div>
            : <ActionUserChart data={topUsers} />
          }
        </div>
      </div>

      <SectionHeader title="Recent Actions" sub="latest 100 entries — ordered by time" />
      <div className="panel">
        <div className="ph">
          <span className="pt">Action history</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="pa">{log.length} entries</span>
            {log.length > 0 && (
              <DownloadCSV
                data={log as unknown as Record<string, unknown>[]}
                filename={`spectra_audit_log_${new Date().toISOString().slice(0, 10)}`}
                columns={[
                  { key: 'createdAt',  label: 'Timestamp' },
                  { key: 'clientId',   label: 'Client ID' },
                  { key: 'action',     label: 'Action' },
                  { key: 'actionedBy', label: 'Actioned By' },
                  { key: 'status',     label: 'Status' },
                  { key: 'notes',      label: 'Notes' },
                ]}
              />
            )}
          </div>
        </div>
        {log.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
            No actions recorded yet. Actions are logged when risk officers interact with client profiles.
          </div>
        ) : (
          <AuditTable log={log} />
        )}
      </div>

    </div>
  )
}

export default function AuditPage() {
  return (
    <>
      <Topbar title="Audit Log" sub="Action History" />
      <Suspense fallback={<AuditSkeleton />}>
        <AuditContent />
      </Suspense>
    </>
  )
}
