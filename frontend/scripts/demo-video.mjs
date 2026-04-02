/**
 * SPECTRA — Automated Video Demo Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Records a walkthrough video of all SPECTRA pages using Playwright's built-in
 * video recording. Output is a single .webm file per page, plus one merged
 * guide that references all clips.
 *
 * Usage:
 *   1. Make sure the SPECTRA dev server is running:
 *        cd frontend && npm run dev
 *
 *   2. From the frontend/ directory, run:
 *        node scripts/demo-video.mjs
 *
 *   Videos are saved to:
 *        frontend/docs/video/<page-name>.webm
 *
 * Requirements:
 *   npx playwright install chromium   (first time only)
 */

import { chromium } from 'playwright'
import { mkdirSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const GOTO_OPTS   = { waitUntil: 'commit', timeout: 120_000 }
const START_FROM  = process.env.START_FROM ?? null

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR   = join(__dirname, '..', 'docs', 'video')
const BASE_URL  = process.env.SPECTRA_URL ?? 'http://localhost:3000'

const USERNAME = 'elion'
const PASSWORD = 'elionspectra'

// Helper: click the first client row and return to build client-tab pages dynamically
async function openFirstClient(page) {
  const row = page.locator('table tbody tr').first()
  if (await row.count() > 0) {
    await row.click()
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
    await page.waitForTimeout(1500)
  }
}

// Helper: click a tab by its visible label text
async function clickTab(page, label) {
  const tab = page.locator(`button:has-text("${label}"), [role="tab"]:has-text("${label}")`)
  if (await tab.count() > 0) {
    await tab.first().click()
    await page.waitForTimeout(1500)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  }
}

// Pages to record
const PAGES = [
  // ── Auth pages ──────────────────────────────────────────────────────────────
  { name: '01_login',          path: '/login',        waitFor: 'form', skipAuth: true },
  { name: '15_portal_login',   path: '/portal/login', waitFor: 'form', skipAuth: true },

  // ── Main officer pages ───────────────────────────────────────────────────────
  { name: '02_dashboard',      path: '/',             waitFor: 'main' },
  { name: '03_clients',        path: '/clients',      waitFor: 'main' },
  { name: '05_warnings',       path: '/warnings',     waitFor: 'main' },
  { name: '06_analytics',      path: '/analytics',    waitFor: 'main' },
  { name: '07_watchlist',      path: '/watchlist',    waitFor: 'main' },
  { name: '08_portfolio',      path: '/portfolio',    waitFor: 'main' },
  { name: '09_concentration',  path: '/concentration',waitFor: 'main' },
  { name: '10_stress',         path: '/stress',       waitFor: 'main' },
  { name: '11_audit',          path: '/audit',        waitFor: 'main' },
  { name: '12_notifications',  path: '/notifications',waitFor: 'main' },
  { name: '13_monitoring',     path: '/monitoring',   waitFor: 'main' },

  // ── Client profile — each tab ────────────────────────────────────────────────
  {
    name: '04a_client_overview',
    path: '/clients',
    waitFor: 'main',
    afterLoad: async (page) => { await openFirstClient(page) },
  },
  {
    name: '04b_client_ewi',
    path: '/clients',
    waitFor: 'main',
    afterLoad: async (page) => {
      await openFirstClient(page)
      await clickTab(page, 'EWI Signals')
    },
  },
  {
    name: '04c_client_alerts',
    path: '/clients',
    waitFor: 'main',
    afterLoad: async (page) => {
      await openFirstClient(page)
      await clickTab(page, 'Alerts')
    },
  },
  {
    name: '04d_client_ai_insights',
    path: '/clients',
    waitFor: 'main',
    afterLoad: async (page) => {
      await openFirstClient(page)
      await clickTab(page, 'AI Insights')
    },
  },
  {
    name: '04e_client_actions_log',
    path: '/clients',
    waitFor: 'main',
    afterLoad: async (page) => {
      await openFirstClient(page)
      await clickTab(page, 'Actions Log')
    },
  },
]

async function waitForPageReady(page, selector = 'main', extraMs = 2500) {
  await page.waitForLoadState('load', { timeout: 180_000 }).catch(() => {})
  try { await page.waitForSelector(selector, { timeout: 20_000 }) } catch {}
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(extraMs)
}

async function loginViaApi(context) {
  console.log('  🔐 Logging in via API...')
  const res = await context.request.post(`${BASE_URL}/api/auth/login`, {
    data: { username: USERNAME, password: PASSWORD },
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok()) throw new Error(`Login API returned ${res.status()}`)
  const body = await res.json().catch(() => ({}))
  if (!body.ok) throw new Error(`Login rejected: ${body.error ?? 'unknown'}`)
  console.log('  ✅ Logged in')
}

async function recordPage(browser, pg) {
  // Each page gets its own context with video recording enabled
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: {
      dir: OUT_DIR,
      size: { width: 1440, height: 900 },
    },
  })

  try {
    if (!pg.skipAuth) {
      await loginViaApi(ctx)
    }

    const page = await ctx.newPage()
    await page.goto(`${BASE_URL}${pg.path}`, GOTO_OPTS)
    await waitForPageReady(page, pg.waitFor ?? 'main')

    if (pg.afterLoad) {
      await pg.afterLoad(page)
    }

    // Slow scroll to show full page content
    await page.evaluate(async () => {
      const totalHeight = document.body.scrollHeight
      const step = 200
      for (let y = 0; y < totalHeight; y += step) {
        window.scrollTo(0, y)
        await new Promise(r => setTimeout(r, 80))
      }
      // Scroll back to top
      window.scrollTo(0, 0)
      await new Promise(r => setTimeout(r, 500))
    })

    await page.waitForTimeout(1000)

    // Retrieve the video path before closing
    const videoPath = await page.video()?.path()
    await ctx.close() // closing the context finalises the .webm file

    // Rename the auto-named file to our preferred name
    if (videoPath) {
      const dest = join(OUT_DIR, `${pg.name}.webm`)
      renameSync(videoPath, dest)
      console.log(`  🎬 Saved → docs/video/${pg.name}.webm`)
    }
  } catch (err) {
    await ctx.close().catch(() => {})
    throw err
  }
}

async function run() {
  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`\n🚀 SPECTRA Video Demo Script`)
  console.log(`   Base URL : ${BASE_URL}`)
  console.log(`   Output   : frontend/docs/video/\n`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  try {
    let resuming = START_FROM !== null

    for (const pg of PAGES) {
      if (resuming) {
        if (pg.name === START_FROM) resuming = false
        else { console.log(`⏭  Skipping ${pg.name}`); continue }
      }
      console.log(`🎬 ${pg.name}`)
      await recordPage(browser, pg)
    }
  } finally {
    await browser.close()
  }

  console.log('\n✅ All videos recorded.')
  console.log(`   Saved to: ${OUT_DIR}`)
  console.log('   Tip: convert to MP4 with:  ffmpeg -i <file>.webm <file>.mp4\n')
}

run().catch(err => {
  console.error('\n❌ Video script failed:', err.message)
  process.exit(1)
})
