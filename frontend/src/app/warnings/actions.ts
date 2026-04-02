'use server'

import { revalidatePath } from 'next/cache'
import { query } from '@/lib/db.server'
import { ensureEWIPredictionsTable } from '@/lib/ewiPredictionsService'

/**
 * Derives deterioration predictions from existing RiskPortfolio + DueDaysDaily
 * data and MERGEs them into EWIPredictions (upsert by client_id + today's date).
 *
 * Risk score formula:
 *   base  = Stage 3 → 0.65 | Stage 2 → 0.40 | Stage 1 → 0.20
 *   + DPD = 90+ → +0.25 | 60-89 → +0.18 | 30-59 → +0.10 | 1-29 → +0.04
 *
 * Only clients with risk_score >= 0.20 are written (includes Stage 1 clients with early DPD).
 */
export async function seedPredictions(): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    await ensureEWIPredictionsTable()

    const [mcdRows, mdidRows] = await Promise.all([
      query<{ mcd: string }>(`SELECT MAX(CalculationDate) AS mcd  FROM [dbo].[RiskPortfolio]  WITH (NOLOCK)`),
      query<{ mdid: string }>(`SELECT MAX(dateID)          AS mdid FROM [dbo].[DueDaysDaily]  WITH (NOLOCK)`),
    ])
    const mcd  = mcdRows[0]?.mcd  ?? ''
    const mdid = mdidRows[0]?.mdid ?? ''
    if (!mcd || !mdid) return { ok: false, count: 0, error: 'No snapshot data found in database' }

    await query(`
      WITH latest_rp AS (
        SELECT clientID,
          COALESCE(Stage, 1)                            AS stage,
          COALESCE(TRY_CAST(totalExposure AS FLOAT), 0) AS exposure,
          COALESCE(TypeOfProduct, '')                   AS product
        FROM [dbo].[RiskPortfolio] WITH (NOLOCK)
        WHERE CalculationDate = @mcd
      ),
      latest_dpd AS (
        SELECT PersonalID,
          MAX(COALESCE(TRY_CAST(DueDays AS FLOAT), 0)) AS dpd
        FROM [dbo].[DueDaysDaily] WITH (NOLOCK)
        WHERE dateID = @mdid
        GROUP BY PersonalID
      ),
      scored AS (
        SELECT
          rp.clientID,
          rp.stage,
          rp.exposure,
          rp.product,
          COALESCE(ld.dpd, 0) AS dpd,
          -- Stage base + DPD component
          CASE rp.stage WHEN 3 THEN 0.65 WHEN 2 THEN 0.40 ELSE 0.20 END
          + CASE
              WHEN COALESCE(ld.dpd, 0) >= 90 THEN 0.25
              WHEN COALESCE(ld.dpd, 0) >= 60 THEN 0.18
              WHEN COALESCE(ld.dpd, 0) >= 30 THEN 0.10
              WHEN COALESCE(ld.dpd, 0) >  0  THEN 0.04
              ELSE 0.0
            END AS risk_score
        FROM latest_rp rp
        LEFT JOIN latest_dpd ld ON ld.PersonalID = rp.clientID
        WHERE rp.stage >= 2 OR COALESCE(ld.dpd, 0) > 0
      )
      MERGE [dbo].[EWIPredictions] WITH (HOLDLOCK) AS target
      USING (
        SELECT
          clientID AS client_id,
          CASE WHEN risk_score > 0.98 THEN 0.98
               WHEN risk_score < 0.05 THEN 0.05
               ELSE risk_score END                                         AS risk_score,
          CASE
            WHEN risk_score >= 0.75 THEN 'Critical'
            WHEN risk_score >= 0.50 THEN 'High'
            WHEN risk_score >= 0.30 THEN 'Medium'
            ELSE 'Low'
          END                                                              AS deterioration_risk,
          CASE
            WHEN risk_score >= 0.75 THEN 'Critical'
            WHEN risk_score >= 0.50 THEN 'High'
            WHEN risk_score >= 0.30 THEN 'Medium'
            ELSE 'Low'
          END                                                              AS risk_label,
          '[' + ISNULL(STUFF(
            CASE WHEN stage = 3 THEN ',"Stage 3 — NPL Risk"'              ELSE '' END +
            CASE WHEN stage = 2 THEN ',"Stage 2 — Watch"'                 ELSE '' END +
            CASE WHEN dpd >= 90              THEN ',"90+ DPD"'            ELSE '' END +
            CASE WHEN dpd >= 60 AND dpd < 90 THEN ',"60–89 DPD"'          ELSE '' END +
            CASE WHEN dpd >= 30 AND dpd < 60 THEN ',"30–59 DPD"'          ELSE '' END +
            CASE WHEN dpd >  0  AND dpd < 30
              THEN ',"DPD Rising (' + CAST(CAST(dpd AS INT) AS VARCHAR(5)) + 'd)"'
              ELSE '' END
          , 1, 1, ''), '') + ']'                                          AS key_signals,
          'Stage ' + CAST(stage AS VARCHAR(2)) +
          CASE WHEN dpd > 0
            THEN ' client — ' + CAST(CAST(dpd AS INT) AS VARCHAR(5)) + 'd current DPD'
            ELSE ' client'
          END +
          '. Exposure: ' + CAST(CAST(ROUND(exposure / 1000.0, 0) AS INT) AS VARCHAR(10)) + 'K' +
          CASE WHEN product <> '' THEN ' (' + product + ')' ELSE '' END +
          '.'                                                              AS stage_reasoning,
          exposure                                                        AS exposure,
          ROUND(CASE
            WHEN risk_score * 0.65 > 0.98 THEN 0.98
            WHEN risk_score * 0.65 < 0.05 THEN 0.05
            ELSE risk_score * 0.65
          END, 4)                                                         AS pd_30d,
          ROUND(CASE
            WHEN risk_score * 0.82 > 0.98 THEN 0.98
            WHEN risk_score * 0.82 < 0.05 THEN 0.05
            ELSE risk_score * 0.82
          END, 4)                                                         AS pd_60d,
          ROUND(CASE
            WHEN risk_score > 0.98 THEN 0.98
            WHEN risk_score < 0.05 THEN 0.05
            ELSE risk_score
          END, 4)                                                         AS pd_90d,
          ROUND(CASE
            WHEN stage = 3 THEN 0.98
            WHEN stage = 2 THEN CASE WHEN risk_score + 0.10 > 0.95 THEN 0.95 ELSE risk_score + 0.10 END
            ELSE CASE WHEN risk_score * 0.75 > 0.85 THEN 0.85 ELSE risk_score * 0.75 END
          END, 4)                                                         AS stage_migration_prob,
          ROUND(CASE
            WHEN dpd >= 60 THEN 0.98
            WHEN dpd >= 30 THEN 0.90
            WHEN dpd > 0  THEN 0.65
            ELSE CASE WHEN risk_score * 0.50 < 0.05 THEN 0.05 ELSE risk_score * 0.50 END
          END, 4)                                                         AS dpd_escalation_prob,
          CASE
            WHEN risk_score >= 0.75 THEN 'Escalate to recovery and initiate immediate legal review'
            WHEN risk_score >= 0.50 THEN 'Call client immediately and place under intensive monitoring'
            WHEN risk_score >= 0.30 THEN 'Add to watchlist and request supporting documents'
            ELSE 'Continue routine monitoring'
          END                                                              AS recommended_action,
          NULL                                                             AS top_factor_1,
          NULL                                                             AS top_factor_2,
          NULL                                                             AS top_factor_3,
          NULL                                                             AS shap_1,
          NULL                                                             AS shap_2,
          NULL                                                             AS shap_3,
          'Auto-classified from IFRS 9 stage and delinquency data. ' +
          'Exposure: ' + CAST(CAST(ROUND(exposure / 1000.0, 0) AS INT) AS VARCHAR(10)) + 'K' +
          CASE WHEN product <> '' THEN ' (' + product + ')' ELSE '' END +
          '.'                                                              AS ai_reasoning
        FROM scored
        WHERE risk_score >= 0.20
      ) AS source (
        client_id, risk_score, deterioration_risk, risk_label, key_signals, stage_reasoning,
        exposure, pd_30d, pd_60d, pd_90d, stage_migration_prob, dpd_escalation_prob,
        recommended_action, top_factor_1, top_factor_2, top_factor_3, shap_1, shap_2, shap_3, ai_reasoning
      )
      ON  target.client_id = source.client_id
      AND CAST(target.run_date AS DATE) = CAST(GETDATE() AS DATE)
      WHEN MATCHED THEN UPDATE SET
        risk_score         = source.risk_score,
        deterioration_risk = source.deterioration_risk,
        risk_label         = source.risk_label,
        key_signals        = source.key_signals,
        exposure           = source.exposure,
        pd_30d             = source.pd_30d,
        pd_60d             = source.pd_60d,
        pd_90d             = source.pd_90d,
        stage_migration_prob = source.stage_migration_prob,
        dpd_escalation_prob  = source.dpd_escalation_prob,
        recommended_action = source.recommended_action,
        top_factor_1       = source.top_factor_1,
        top_factor_2       = source.top_factor_2,
        top_factor_3       = source.top_factor_3,
        shap_1             = source.shap_1,
        shap_2             = source.shap_2,
        shap_3             = source.shap_3,
        ai_reasoning       = source.ai_reasoning,
        run_date           = GETDATE()
      WHEN NOT MATCHED THEN INSERT
        (
          client_id, risk_score, deterioration_risk, risk_label, key_signals, ai_reasoning, exposure,
          pd_30d, pd_60d, pd_90d, stage_migration_prob, dpd_escalation_prob, recommended_action,
          top_factor_1, top_factor_2, top_factor_3, shap_1, shap_2, shap_3
        )
      VALUES
        (
          source.client_id, source.risk_score, source.deterioration_risk, source.risk_label,
          source.key_signals, source.ai_reasoning, source.exposure, source.pd_30d, source.pd_60d,
          source.pd_90d, source.stage_migration_prob, source.dpd_escalation_prob,
          source.recommended_action, source.top_factor_1, source.top_factor_2, source.top_factor_3,
          source.shap_1, source.shap_2, source.shap_3
        );
    `, { mcd, mdid }, 60000)

    const countRows = await query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM [dbo].[EWIPredictions] WITH (NOLOCK)
       WHERE CAST(run_date AS DATE) = CAST(GETDATE() AS DATE)`
    )

    revalidatePath('/warnings')
    return { ok: true, count: countRows[0]?.n ?? 0 }
  } catch (err) {
    return { ok: false, count: 0, error: (err as Error).message }
  }
}
