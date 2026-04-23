-- ═══════════════════════════════════════════════════════════════════════════
-- SPECTRA — Azure SQL: Nightly KPI Scheduling Options
--
-- Azure SQL Database does NOT support SQL Server Agent or msdb.
-- Use one of the options below depending on what you have available.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── OPTION A: Azure Elastic Jobs (recommended for Azure SQL) ───────────────
-- Set up once in Azure Portal:
-- 1. Go to your Azure SQL Server resource
-- 2. Search "Elastic Job Agent" → Create one (linked to a job database)
-- 3. In the Elastic Jobs UI, create a job that runs:
--
--    EXEC [dbo].[usp_RefreshKPISummary]
--
-- 4. Set schedule: daily at 02:00 UTC
-- 5. Target: your SPECTRA database
--
-- No SQL script needed — done entirely in Azure Portal.
-- Docs: https://learn.microsoft.com/en-us/azure/azure-sql/database/elastic-jobs-overview


-- ─── OPTION B: App-level cron (zero Azure cost, already implemented) ─────────
-- The SPECTRA app has a built-in cron route at:
--
--    GET /api/kpi/cron?secret=CRON_SECRET
--
-- Call this nightly using any of:
--   - Vercel Cron Jobs (free on Hobby/Pro — add to vercel.json)
--   - GitHub Actions scheduled workflow
--   - Windows Task Scheduler (curl command)
--   - Any external cron service (cron-job.org, etc.)
--
-- See: frontend/src/app/api/kpi/cron/route.ts
-- See: vercel.json (cron config already added)


-- ─── OPTION C: Azure Logic Apps / Azure Functions Timer Trigger ──────────────
-- Create an Azure Function with a timer trigger (cron expression: 0 0 2 * * *)
-- that calls: POST https://your-app.vercel.app/api/kpi/refresh
-- with header: x-cron-secret: <your CRON_SECRET env var>


-- ─── Manual refresh (run anytime in SSMS) ────────────────────────────────────
-- EXEC [dbo].[usp_RefreshKPISummary]
