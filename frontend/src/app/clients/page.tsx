import { Suspense } from 'react'
import Topbar from '@/components/Topbar'
import { getClientsPaginated } from '@/lib/queries'
import ClientsTable from './ClientsTable'

export const dynamic = 'force-dynamic'

const VALID_STAGES   = new Set(['1', '2', '3', 'NA'])
const VALID_DPD      = new Set(['0', '1', '31', '90'])
const VALID_STATUSES = new Set(['Active', 'Inactive', 'Suspended', 'Deceased'])
const CURRENT_YEAR   = new Date().getFullYear()
const VALID_VINTAGES = new Set(Array.from({ length: 6 }, (_, i) => String(CURRENT_YEAR - i)))

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string; stage?: string; dpd?: string; status?: string; vintage?: string }>
}

async function ClientsContent({ searchParams }: PageProps) {
  const { q = '', page = '1', stage = '', dpd = '', status = '', vintage = '' } = await searchParams
  const pageNum       = Math.max(1, parseInt(page, 10) || 1)
  const search        = q.trim()
  const stageFilter   = VALID_STAGES.has(stage)     ? stage   : ''
  const dpdFilter     = VALID_DPD.has(dpd)           ? dpd     : ''
  const statusFilter  = VALID_STATUSES.has(status)   ? status  : ''
  const vintageFilter = VALID_VINTAGES.has(vintage)  ? parseInt(vintage, 10) : undefined

  let rows: Awaited<ReturnType<typeof getClientsPaginated>>['rows'] = [], total = 0
  try {
    ;({ rows, total } = await getClientsPaginated(search, pageNum, { stage: stageFilter, dpd: dpdFilter, status: statusFilter, vintage: vintageFilter }))
  } catch {
    // DB error — table renders empty with error handled gracefully
  }

  return (
    <ClientsTable
      initialRows={rows}
      initialTotal={total}
      initialQ={search}
      initialPage={pageNum}
      initialStage={stageFilter}
      initialDpd={dpdFilter}
      initialStatus={statusFilter}
      initialVintage={vintage}
    />
  )
}

export default function ClientsPage(props: PageProps) {
  const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  return (
    <>
      <Topbar title="Clients" sub={monthLabel} />
      <div className="content">
        <Suspense fallback={
          <div>
            {/* Search bar skeleton */}
            <div style={{ height: 44, borderRadius: 8, background: '#F1F5F9', marginBottom: 10, animation: 'pulse 1.4s ease-in-out infinite' }} />
            {/* Filter bar skeleton */}
            <div style={{ height: 48, borderRadius: 8, background: '#F8FAFC', border: '1px solid var(--border)', marginBottom: 10, animation: 'pulse 1.4s ease-in-out infinite' }} />
            {/* Table skeleton */}
            <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ height: 40, background: '#F8FAFC', borderBottom: '1px solid var(--border)' }} />
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                  {[140, 90, 100, 70, 60, 80].map((w, ci) => (
                    <div key={ci} style={{ height: 12, width: w, borderRadius: 3, background: '#EEF2F7', animation: `pulse 1.4s ease-in-out ${i * 0.06}s infinite` }} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        }>
          <ClientsContent {...props} />
        </Suspense>
      </div>
    </>
  )
}
