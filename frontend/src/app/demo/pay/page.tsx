export const dynamic = 'force-dynamic'

import { query } from '@/lib/db.server'
import { ensureEWIPredictionsTable } from '@/lib/ewiPredictionsService'
import { seedPredictions } from '@/app/warnings/actions'
import PayButton from './PayButton'

interface DemoClient {
  client_id: string
  risk_score: number
  risk_label: string | null
  stage: number | null
  due_days: number | null
}

async function getHighRiskClients(): Promise<DemoClient[]> {
  try {
    await ensureEWIPredictionsTable()

    // Auto-seed if EWIPredictions is empty so the demo always has data
    const countRows = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM [dbo].[EWIPredictions] WITH (NOLOCK)`, {})
    if ((countRows[0]?.n ?? 0) === 0) {
      await seedPredictions()
    }

    return await query<DemoClient>(
      `SELECT TOP 6
         e.client_id,
         e.risk_score,
         e.risk_label,
         rp.Stage           AS stage,
         dd.DueDays         AS due_days
       FROM (
         SELECT *,
           ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY run_date DESC) AS rn
         FROM [dbo].[EWIPredictions] WITH (NOLOCK)
       ) e
       LEFT JOIN [dbo].[RiskPortfolio] rp WITH (NOLOCK)
         ON rp.PersonalID = e.client_id
       OUTER APPLY (
         SELECT TOP 1 DueDays
         FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
         WHERE PersonalID = e.client_id
         ORDER BY dateID DESC
       ) dd
       WHERE e.rn = 1
         AND e.risk_score >= 0.35
       ORDER BY e.risk_score DESC`,
      {}
    )
  } catch {
    return []
  }
}

function riskColor(score: number) {
  if (score >= 0.75) return '#ef4444'
  if (score >= 0.5)  return '#f59e0b'
  return '#3b82f6'
}

function stageBadge(stage: number | null) {
  if (stage === 3) return { label: 'NPL', color: '#ef4444' }
  if (stage === 2) return { label: 'Watch', color: '#f59e0b' }
  return { label: 'Active', color: '#10b981' }
}

export default async function DemoPayPage() {
  const clients = await getHighRiskClients()

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0f1e',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#f1f5f9',
    }}>
      {/* Header */}
      <div style={{
        background: '#0f172a',
        borderBottom: '1px solid #1e3a5f',
        padding: '20px 16px 16px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: '#3b82f6', fontWeight: 700, marginBottom: 4 }}>
          SPECTRA
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>Live Demo</div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
          Simulate payments for high-risk clients
        </div>
      </div>

      {/* Cards */}
      <div style={{ padding: '16px', maxWidth: 480, margin: '0 auto' }}>
        {clients.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: '#64748b',
            marginTop: 60,
            fontSize: 15,
          }}>
            No high-risk clients found in EWI predictions.
          </div>
        )}

        {clients.map(client => {
          const badge = stageBadge(client.stage)
          const pct = Math.round((client.risk_score ?? 0) * 100)
          const color = riskColor(client.risk_score ?? 0)

          return (
            <div
              key={client.client_id}
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 16,
                padding: '18px 16px',
                marginBottom: 14,
              }}
            >
              {/* Client header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>Client ID</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace' }}>
                    {client.client_id}
                  </div>
                </div>
                <div style={{
                  background: badge.color + '22',
                  color: badge.color,
                  border: `1px solid ${badge.color}44`,
                  borderRadius: 8,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                }}>
                  {badge.label}
                </div>
              </div>

              {/* Metrics row */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, background: '#1e293b', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Risk Score</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color }}>{pct}%</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{client.risk_label ?? 'Unknown'}</div>
                </div>
                <div style={{ flex: 1, background: '#1e293b', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Days Past Due</div>
                  <div style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: (client.due_days ?? 0) > 0 ? '#ef4444' : '#10b981',
                  }}>
                    {client.due_days ?? 0}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>current DPD</div>
                </div>
              </div>

              <PayButton personalId={client.client_id} />
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '16px 16px 32px', color: '#334155', fontSize: 11 }}>
        SPECTRA Demo — payments simulate DPD reset to 0
      </div>
    </div>
  )
}
