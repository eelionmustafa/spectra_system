export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import Link from 'next/link'
import Topbar from '@/components/Topbar'
import ClientProfileTabs from './ClientProfileTabs'
import Loading from './loading'
import {
  getClientProfile, getClientDPDHistory, getClientEWI,
  getClientActiveActions, getClientProducts, getClientCaseHistory,
  getCovenantWaivers, getClientCollateralReviews,
} from '@/lib/queries'
import type { ClientProfile, DPDHistory, ClientEWI, ClientProduct, CaseAction, CovenantWaiverRow, CollateralReviewRow } from '@/lib/queries'
import { readRiskFlags } from '@/lib/predictions'
import { getPredictionSnapshot } from '@/lib/ewiPredictionsService'
import { getActiveRestructuringPlan } from '@/lib/restructuringService'
import { getCommitteeLog } from '@/lib/committeeService'
import { getActiveRecoveryCase, getRecoveryCaseHistory } from '@/lib/recoveryService'
import { isClientWrittenOff } from '@/lib/writtenOffService'
import { isClientResolved } from '@/lib/resolutionService'
import { getScheduledSalary } from '@/lib/scheduledSalaryService'
import type { ScheduledSalary } from '@/lib/scheduledSalaryService'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'

// ─── All secondary data in one flat Promise.all ───────────────────────────────
// Runs inside a Suspense boundary so the topbar + skeleton appear immediately.

async function ClientProfileContent({
  id,
  profile,
  userRole,
}: {
  id: string
  profile: ClientProfile
  userRole: string
}) {
  const [
    dpdHistory,
    ewi,
    activeActions,
    products,
    caseHistory,
    restructuringPlan,
    committeeLog,
    recoveryCase,
    recoveryHistory,
    writtenOff,
    resolved,
    predictionSnapshot,
    scheduledSalary,
    covenantWaivers,
    collateralReviews,
  ] = await Promise.all([
    getClientDPDHistory(id).catch((): DPDHistory[]                                 => []),
    getClientEWI(id).catch((): ClientEWI | null                                    => null),
    getClientActiveActions(id).catch((): { action: string; createdAt: string }[]   => []),
    getClientProducts(id).catch((): ClientProduct[]                                => []),
    getClientCaseHistory(id).catch((): CaseAction[]                                => []),
    getActiveRestructuringPlan(id).catch(()                                        => null),
    getCommitteeLog(id).catch(()                                                   => []),
    getActiveRecoveryCase(id).catch(()                                             => null),
    getRecoveryCaseHistory(id).catch(()                                            => []),
    isClientWrittenOff(id).catch(()                                                => false),
    isClientResolved(id).catch(()                                                  => false),
    getPredictionSnapshot(id).catch(()                                             => null),
    getScheduledSalary(id).catch((): ScheduledSalary | null                        => null),
    getCovenantWaivers(id).catch((): CovenantWaiverRow[]                           => []),
    getClientCollateralReviews(id).catch((): CollateralReviewRow[]                 => []),
  ])

  const prediction  = predictionSnapshot?.prediction ?? null
  const shap        = predictionSnapshot?.shap ?? null
  const riskFlag    = readRiskFlags()[id] ?? null

  return (
    <ClientProfileTabs
      profile={profile}
      dpdHistory={dpdHistory}
      ewi={ewi}
      activeActions={activeActions}
      products={products}
      caseHistory={caseHistory}
      prediction={prediction}
      shap={shap}
      riskFlag={riskFlag}
      userRole={userRole}
      clientId={id}
      restructuringPlan={restructuringPlan}
      committeeLog={committeeLog}
      recoveryCase={recoveryCase}
      recoveryHistory={recoveryHistory}
      isWrittenOff={writtenOff}
      isResolved={resolved}
      scheduledSalary={scheduledSalary}
      covenantWaivers={covenantWaivers}
      collateralReviews={collateralReviews}
    />
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ClientProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Auth — fast cookie read, non-blocking
  let userRole = 'analyst'
  try {
    const jar   = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (token) userRole = (await verifyToken(token)).role
  } catch { /* keep default */ }

  // Critical path: profile only — unblocks topbar + breadcrumbs
  let profile: ClientProfile | null = null
  try {
    profile = await getClientProfile(id)
  } catch (err) {
    const msg = (err as Error).message ?? String(err)
    return (
      <>
        <Topbar
          title="Client Profile"
          breadcrumbs={[{ label: 'Clients', href: '/clients' }, { label: id }]}
        />
        <div className="content">
          <div className="panel" style={{ padding: '20px', color: 'var(--muted)', fontSize: '12px' }}>
            <div style={{ fontWeight: 600, color: 'var(--red)', marginBottom: '6px' }}>Database error</div>
            <code style={{ fontSize: '11px', wordBreak: 'break-all' }}>{msg}</code>
            <div style={{ marginTop: '10px', fontSize: '11px' }}>
              Check <code>/api/infra/ping</code> for diagnostics or review <code>.env.local</code>.
            </div>
          </div>
        </div>
      </>
    )
  }

  if (!profile) {
    return (
      <>
        <Topbar
          title="Client not found"
          breadcrumbs={[{ label: 'Clients', href: '/clients' }, { label: id }]}
        />
        <div className="content">
          <Link href="/clients" className="back-link">← Back to Clients</Link>
          <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
            No client found with ID {id}. If this client exists, the profile query may have timed out — try refreshing.
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Topbar
        title={profile.full_name || profile.personal_id}
        breadcrumbs={[
          { label: 'Clients', href: '/clients' },
          { label: profile.full_name || profile.personal_id },
        ]}
      />
      <Suspense fallback={<Loading />}>
        <ClientProfileContent id={id} profile={profile} userRole={userRole} />
      </Suspense>
    </>
  )
}
