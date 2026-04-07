export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { query } from '@/lib/db.server'
import PayButton from './PayButton'

interface DemoClient {
  client_id: string
  risk_score: number
  risk_label: string | null
  stage: number | null
  due_days: number | null
}

// Ensure assignment table exists and claim next unclaimed client
async function claimClient(): Promise<string | null> {
  try {
    await query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'DemoClientAssignments' AND schema_id = SCHEMA_ID('dbo'))
        CREATE TABLE [dbo].[DemoClientAssignments] (
          client_id  NVARCHAR(50) NOT NULL PRIMARY KEY,
          assigned_at DATETIME NOT NULL DEFAULT GETDATE()
        )
    `, {})

    // Get top clients ordered by risk, skip already assigned ones (within last 2 hours)
    const rows = await query<{ client_id: string }>(`
      SELECT TOP 1 rp.clientID AS client_id
      FROM (
        SELECT clientID, MAX(Stage) AS Stage
        FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
        WHERE CalculationDate = (SELECT MAX(CalculationDate) FROM [dbo].[RiskPortfolio] WITH (NOLOCK))
        GROUP BY clientID
      ) rp
      OUTER APPLY (
        SELECT TOP 1 DueDays
        FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
        WHERE PersonalID = rp.clientID
        ORDER BY dateID DESC
      ) dd
      WHERE rp.Stage = 3
        AND rp.clientID NOT IN (
          SELECT client_id FROM [dbo].[DemoClientAssignments] WITH (NOLOCK)
          WHERE assigned_at > DATEADD(HOUR, -2, GETDATE())
        )
      ORDER BY
        -- Pin Arben Morina first
        CASE WHEN LOWER(COALESCE(cu.name + ' ' + cu.surname, '')) LIKE '%arben%morina%' THEN 0 ELSE 1 END,
        COALESCE(TRY_CAST(dd.DueDays AS FLOAT), 0) DESC
    `, {})

    const clientId = rows[0]?.client_id
    if (!clientId) return null

    // Claim it (INSERT OR IGNORE pattern)
    await query(`
      IF NOT EXISTS (SELECT 1 FROM [dbo].[DemoClientAssignments] WHERE client_id = @clientId AND assigned_at > DATEADD(HOUR, -2, GETDATE()))
        INSERT INTO [dbo].[DemoClientAssignments] (client_id) VALUES (@clientId)
    `, { clientId })

    return clientId
  } catch {
    return null
  }
}

async function getClient(clientId: string): Promise<DemoClient | null> {
  try {
    const rows = await query<DemoClient>(`
      SELECT
        rp.clientID AS client_id,
        CAST(
          CASE rp.Stage WHEN 3 THEN 0.65 WHEN 2 THEN 0.40 ELSE 0.20 END
          + CASE
              WHEN COALESCE(TRY_CAST(dd.DueDays AS FLOAT), 0) >= 90 THEN 0.25
              WHEN COALESCE(TRY_CAST(dd.DueDays AS FLOAT), 0) >= 60 THEN 0.18
              WHEN COALESCE(TRY_CAST(dd.DueDays AS FLOAT), 0) >= 30 THEN 0.10
              WHEN COALESCE(TRY_CAST(dd.DueDays AS FLOAT), 0) >  0  THEN 0.04
              ELSE 0.0
            END
        AS FLOAT) AS risk_score,
        CASE WHEN rp.Stage = 3 THEN 'Critical' WHEN rp.Stage = 2 THEN 'High' ELSE 'Medium' END AS risk_label,
        rp.Stage AS stage,
        TRY_CAST(dd.DueDays AS INT) AS due_days
      FROM (
        SELECT clientID, MAX(Stage) AS Stage
        FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
        WHERE CalculationDate = (SELECT MAX(CalculationDate) FROM [dbo].[RiskPortfolio] WITH (NOLOCK))
        GROUP BY clientID
      ) rp
      OUTER APPLY (
        SELECT TOP 1 DueDays FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
        WHERE PersonalID = rp.clientID ORDER BY dateID DESC
      ) dd
      WHERE rp.clientID = @clientId
    `, { clientId })
    return rows[0] ?? null
  } catch {
    return null
  }
}

function riskColor(score: number) {
  if (score >= 0.75) return '#ef4444'
  if (score >= 0.50) return '#f97316'
  if (score >= 0.40) return '#eab308'
  return '#10b981'
}

function riskGlow(score: number) {
  if (score >= 0.75) return 'rgba(239,68,68,0.15)'
  if (score >= 0.50) return 'rgba(249,115,22,0.12)'
  if (score >= 0.40) return 'rgba(234,179,8,0.10)'
  return 'rgba(16,185,129,0.08)'
}

function stageMeta(stage: number | null) {
  if (stage === 3) return { label: 'Stage 3 · NPL',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)' }
  if (stage === 2) return { label: 'Stage 2 · Watch',  color: '#f97316', bg: 'rgba(249,115,22,0.12)' }
  return                  { label: 'Stage 1 · Active', color: '#10b981', bg: 'rgba(16,185,129,0.10)' }
}

export default async function DemoPayPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>
}) {
  const params   = await searchParams
  let   clientId = params.client ?? null

  // No client in URL — claim one and redirect
  if (!clientId) {
    const claimed = await claimClient()
    if (claimed) redirect(`/demo/pay?client=${encodeURIComponent(claimed)}`)
    // fallthrough: no clients available
  }

  const client = clientId ? await getClient(clientId) : null
  const sm     = stageMeta(client?.stage ?? null)
  const pct    = Math.round((client?.risk_score ?? 0) * 100)
  const color  = riskColor(client?.risk_score ?? 0)
  const glow   = riskGlow(client?.risk_score ?? 0)
  const dpd    = client?.due_days ?? 0
  const barPct = Math.min(dpd / 120, 1) * 100
  const barClr = dpd >= 90 ? '#ef4444' : dpd >= 60 ? '#f97316' : dpd >= 30 ? '#eab308' : '#10b981'

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #060d1a 0%, #0a1628 60%, #0d1f35 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: '#e2e8f0',
    }}>
      {/* Header */}
      <div style={{
        padding: '28px 20px 20px',
        textAlign: 'center',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.2)',
        backdropFilter: 'blur(12px)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)',
          borderRadius: 20, padding: '4px 14px', marginBottom: 10,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block', boxShadow: '0 0 6px #10b981' }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#C9A84C', textTransform: 'uppercase' }}>Live Demo</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', letterSpacing: -0.5 }}>
          Simulate a Payment
        </div>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 5 }}>
          Your assigned client is shown below
        </div>
      </div>

      <div style={{ padding: '24px 16px 40px', maxWidth: 480, margin: '0 auto' }}>
        {!client ? (
          <div style={{ marginTop: 80, textAlign: 'center', color: '#334155', fontSize: 14, lineHeight: 1.8 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
            No clients available right now.<br />
            <span style={{ fontSize: 12 }}>Ask the presenter to reset the demo.</span>
          </div>
        ) : (
          <div style={{
            background: 'linear-gradient(135deg, #0f1f35 0%, #0a1628 100%)',
            border: `1px solid ${color}30`,
            borderTop: `3px solid ${color}`,
            borderRadius: 18,
            padding: '20px 18px 22px',
            boxShadow: `0 4px 24px ${glow}, 0 1px 4px rgba(0,0,0,0.4)`,
            animation: 'fadeUp 0.4s cubic-bezier(0.34,1.2,0.64,1)',
          }}>
            {/* ID + badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, color: '#475569', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 3 }}>Assigned Client</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: '#f1f5f9', letterSpacing: 0.5 }}>
                  {client.client_id}
                </div>
              </div>
              <div style={{
                background: sm.bg, color: sm.color,
                border: `1px solid ${sm.color}40`,
                borderRadius: 10, padding: '5px 12px',
                fontSize: 11, fontWeight: 700,
              }}>
                {sm.label}
              </div>
            </div>

            {/* Metrics */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <div style={{
                flex: 1, background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12, padding: '12px 14px',
              }}>
                <div style={{ fontSize: 10, color: '#475569', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Risk Score</div>
                <div style={{ fontSize: 30, fontWeight: 900, color, lineHeight: 1, fontFamily: 'monospace' }}>
                  {pct}<span style={{ fontSize: 14, fontWeight: 600 }}>%</span>
                </div>
                <div style={{ fontSize: 10, color, fontWeight: 600, marginTop: 3 }}>{client.risk_label}</div>
              </div>

              <div style={{
                flex: 1, background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12, padding: '12px 14px',
              }}>
                <div style={{ fontSize: 10, color: '#475569', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Days Past Due</div>
                <div style={{ fontSize: 30, fontWeight: 900, color: barClr, lineHeight: 1, fontFamily: 'monospace' }}>{dpd}</div>
                <div style={{ marginTop: 8, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                  <div style={{ width: `${barPct}%`, height: '100%', background: barClr, borderRadius: 2 }} />
                </div>
              </div>
            </div>

            <PayButton personalId={client.client_id} />
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', paddingBottom: 32, color: '#1e3a5f', fontSize: 11, letterSpacing: 1 }}>
        SPECTRA · LIVE DEMO
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
