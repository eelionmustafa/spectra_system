export const dynamic = 'force-dynamic'

import { query } from '@/lib/db.server'
import ResetButton from './ResetButton'
import SeedSalaryButton from './SeedSalaryButton'
import QRCardCarousel from './QRCardCarousel'
import LiveFeed from './LiveFeed'

interface DemoClient {
  client_id: string
  full_name: string
  risk_score: number
  risk_label: string
  stage: number
  due_days: number
}

async function getTopClients(): Promise<DemoClient[]> {
  try {
    const rows = await query<DemoClient>(`
      SELECT TOP 10
        CAST(rp.clientID AS VARCHAR(50)) AS client_id,
        COALESCE(cu.name + ' ' + cu.surname, CAST(rp.clientID AS VARCHAR(50))) AS full_name,
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
        COALESCE(TRY_CAST(dd.DueDays AS INT), 0) AS due_days
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
      LEFT JOIN [dbo].[Customer] cu WITH (NOLOCK)
        ON TRY_CAST(cu.PersonalID AS BIGINT) = TRY_CAST(rp.clientID AS BIGINT)
      WHERE rp.Stage = 3
      ORDER BY
        -- Pin Arben Morina first
        CASE WHEN LOWER(COALESCE(cu.name + ' ' + cu.surname, '')) LIKE '%arben%morina%' THEN 0 ELSE 1 END,
        COALESCE(TRY_CAST(dd.DueDays AS FLOAT), 0) DESC
    `, {})
    return rows
  } catch {
    return []
  }
}

export default async function DemoControlPage() {
  const clients = await getTopClients()
  const baseUrl = 'https://spectrarsk.vercel.app'

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0D1B2A',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 32,
      padding: 32,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase', color: '#8FA3B8', marginBottom: 8 }}>
          SPECTRA
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#C9A84C', fontFamily: 'IBM Plex Mono, monospace' }}>
          Live Demo Control
        </div>
        <div style={{ fontSize: 13, color: '#8FA3B8', marginTop: 8 }}>
          Each QR links to a specific client · Arben Morina is first
        </div>
      </div>

      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>
        <QRCardCarousel clients={clients} baseUrl={baseUrl} />
        <LiveFeed />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <ResetButton />
        <SeedSalaryButton />
      </div>

      <div style={{
        background: 'rgba(201,168,76,0.08)',
        border: '1px solid rgba(201,168,76,0.2)',
        borderRadius: 10,
        padding: '14px 20px',
        maxWidth: 420,
        fontSize: 12,
        color: '#8FA3B8',
        lineHeight: 1.7,
        textAlign: 'center',
      }}>
        Audience scans their QR → taps <strong style={{ color: '#C9A84C' }}>Pay Now</strong> →
        risk score updates instantly · live feed appears on the right
      </div>
    </div>
  )
}
