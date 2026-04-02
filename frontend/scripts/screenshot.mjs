/**
 * SPECTRA — Automated Screenshot Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Launches a Playwright Chromium browser, logs in as elion (senior_risk_manager),
 * visits every page in the officer interface + the client portal, and saves
 * full-page PNG screenshots to docs/images/.
 *
 * Usage:
 *   1. Make sure the SPECTRA dev server is running:
 *        cd frontend && npm run dev
 *
 *   2. From the frontend/ directory, run:
 *        node scripts/screenshot.mjs
 *
 *   Screenshots are saved to:
 *        frontend/docs/images/<page-name>.png
 *
 * Requirements:
 *   npx playwright install chromium   (first time only)
 */

import { chromium } from 'playwright'
import { mkdirSync }  from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// 'commit' fires on first byte — avoids waiting for slow SSR/DB queries to complete
// before Playwright considers navigation done. waitForPageReady() handles the rest.
const GOTO_OPTS = { waitUntil: 'commit', timeout: 120_000 }

// Resume from a specific page name, e.g.:  START_FROM=08_portfolio node scripts/screenshot.mjs
const START_FROM = process.env.START_FROM ?? null

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR   = join(__dirname, '..', 'docs', 'images')
const BASE_URL  = process.env.SPECTRA_URL ?? 'http://localhost:3000'

// Login credentials (senior_risk_manager — full access to all pages)
const USERNAME = 'elion'
const PASSWORD = 'elionspectra'

// ── Pages to screenshot ───────────────────────────────────────────────────────
// Each entry: { name, path, waitFor?, afterLoad? }
//   name     — output filename (without .png)
//   path     — URL path
//   waitFor  — CSS selector to wait for before screenshotting (ensures data loaded)
//   afterLoad — optional async fn(page) for extra interaction before screenshot

const PAGES = [
  {
    name: '01_login',
    path: '/login',
    waitFor: 'form',
    skipAuth: true,   // screenshot before logging in
  },
  {
    name: '02_dashboard',
    path: '/',
    waitFor: '[data-testid="kpi-banner"], h1, main',
  },
  {
    name: '03_clients',
    path: '/clients',
    waitFor: 'table, [data-testid="clients-table"], main',
  },
  {
    name: '04_client_profile_overview',
    path: '/clients',
    waitFor: 'table, main',
    afterLoad: async (page) => {
      // Click the first client row to open the profile
      const firstRow = page.locator('table tbody tr').first()
      if (await firstRow.count() > 0) {
        await firstRow.click()
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
        await page.waitForTimeout(2000)
      }
    },
    name: '04_client_profile',
  },
  {
    name: '05_warnings',
    path: '/warnings',
    waitFor: 'main',
  },
  {
    name: '06_analytics',
    path: '/analytics',
    waitFor: 'main',
  },
  {
    name: '07_watchlist',
    path: '/watchlist',
    waitFor: 'main',
  },
  {
    name: '08_portfolio',
    path: '/portfolio',
    waitFor: 'main',
  },
  {
    name: '09_concentration',
    path: '/concentration',
    waitFor: 'main',
  },
  {
    name: '10_stress',
    path: '/stress',
    waitFor: 'main',
  },
  {
    name: '11_audit',
    path: '/audit',
    waitFor: 'main',
  },
  {
    name: '12_notifications',
    path: '/notifications',
    waitFor: 'main',
  },
  {
    name: '13_monitoring',
    path: '/monitoring',
    waitFor: 'main',
  },
]

// ── Client portal pages (separate session) ────────────────────────────────────
const PORTAL_PAGES = [
  {
    name: '14_portal_login',
    path: '/portal/login',
    waitFor: 'form',
    skipAuth: true,
  },
]

// ─────────────────────────────────────────────────────────────────────────────

async function waitForPageReady(page, selector = 'main', extraMs = 2000) {
  // goto uses waitUntil:'commit' (first byte) so we still need to wait for the
  // full HTML — SSR pages block on slow DB queries before sending the body.
  await page.waitForLoadState('load', { timeout: 180_000 }).catch(() => {})
  try {
    await page.waitForSelector(selector, { timeout: 20_000 })
  } catch {
    // Selector not found — proceed anyway
  }
  // Wait for client-side data fetches / charts to settle
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {})
  await page.waitForTimeout(extraMs)
}

async function login(context) {
  console.log('  🔐 Logging in via API...')
  // POST directly to the auth API — bypasses React form interaction which is
  // unreliable in headless mode when the page uses window.location.href redirects.
  const res = await context.request.post(`${BASE_URL}/api/auth/login`, {
    data: { username: USERNAME, password: PASSWORD },
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok()) {
    const body = await res.text().catch(() => '(unreadable)')
    throw new Error(`Login API returned ${res.status()}: ${body}`)
  }
  const body = await res.json().catch(() => ({}))
  if (!body.ok) throw new Error(`Login rejected: ${body.error ?? 'unknown'}`)
  // The spectra_session cookie is now stored in the context's cookie jar automatically.
  console.log('  ✅ Logged in')
}

async function screenshot(page, name) {
  const outPath = join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path: outPath, fullPage: true })
  console.log(`  📸 Saved → docs/images/${name}.png`)
}

async function run() {
  // Ensure output directory exists
  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`\n🚀 SPECTRA Screenshot Script`)
  console.log(`   Base URL : ${BASE_URL}`)
  console.log(`   Output   : frontend/docs/images/\n`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  // ── Officer pages ────────────────────────────────────────────────────────────
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()

  if (!START_FROM) {
    // Warm up: compile Next.js routes and wake Azure SQL connection pool
    console.log('⏳ Warming up server (this may take 30-60s on first run)...')
    await Promise.allSettled([
      context.request.get(`${BASE_URL}/login`),
      context.request.get(`${BASE_URL}/api/auth/login`),
    ])
    await page.waitForTimeout(5000)

    // Screenshot the login page first (no auth)
    console.log('📄 01_login')
    await page.goto(`${BASE_URL}/login`, GOTO_OPTS)
    await waitForPageReady(page, 'form', 500)
    await screenshot(page, '01_login')
  }

  // Log in once via API — session cookie persists for all subsequent pages
  await login(context)

  // Screenshot all officer pages (optionally resume from START_FROM)
  let resuming = START_FROM !== null
  for (const pg of PAGES.filter(p => !p.skipAuth)) {
    if (resuming) {
      if (pg.name === START_FROM) resuming = false
      else { console.log(`⏭  Skipping ${pg.name}`); continue }
    }
    console.log(`📄 ${pg.name}`)
    await page.goto(`${BASE_URL}${pg.path}`, GOTO_OPTS)
    await waitForPageReady(page, pg.waitFor ?? 'main')

    if (pg.afterLoad) {
      await pg.afterLoad(page)
    }

    await screenshot(page, pg.name)
  }

  // ── Client portal ────────────────────────────────────────────────────────────
  console.log('\n📄 14_portal_login')
  const portalContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const portalPage = await portalContext.newPage()
  await portalPage.goto(`${BASE_URL}/portal/login`, GOTO_OPTS)
  await waitForPageReady(portalPage, 'form', 500)
  await screenshot(portalPage, '14_portal_login')
  await portalContext.close()

  // ── Done ──────────────────────────────────────────────────────────────────────
  await context.close()
  await browser.close()

  console.log('\n✅ All screenshots complete.')
  console.log(`   Saved to: ${OUT_DIR}\n`)
}

run().catch(err => {
  console.error('\n❌ Screenshot script failed:', err.message)
  process.exit(1)
})
