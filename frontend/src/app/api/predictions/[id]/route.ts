import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken, COOKIE_NAME } from "@/lib/auth"
import { getPredictionSnapshot } from "@/lib/ewiPredictionsService"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await verifyToken(token)
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const snapshot = await getPredictionSnapshot(id)
  if (!snapshot) {
    return NextResponse.json({ error: "No prediction data" }, { status: 404 })
  }

  const pred = snapshot.prediction
  const shapRow = snapshot.shap
  return NextResponse.json({
    clientID:             pred.clientID,
    pd_score:             pred.pd_score,
    risk_label:           pred.risk_label,
    stage_migration_prob: pred.stage_migration_prob,
    dpd_escalation_prob:  pred.dpd_escalation_prob,
    recommended_action:   pred.recommended_action,
    top_factor_1:         shapRow?.top_factor_1 ?? null,
    top_factor_2:         shapRow?.top_factor_2 ?? null,
    top_factor_3:         shapRow?.top_factor_3 ?? null,
    shap_1:               shapRow?.shap_1 ?? null,
    shap_2:               shapRow?.shap_2 ?? null,
    shap_3:               shapRow?.shap_3 ?? null,
  })
}
