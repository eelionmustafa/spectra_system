/**
 * GET /api/events
 *
 * Server-Sent Events stream for real-time staff collaboration.
 * Each authenticated staff tab connects once; when any action route calls
 * emitSpectraEvent(), this handler forwards the event to every subscriber.
 *
 * The browser's EventSource API reconnects automatically if the connection
 * drops, so no client-side retry logic is needed.
 */

export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'
import { eventBus } from '@/lib/eventBus'
import type { SpectraEvent } from '@/lib/eventBus'

const enc = new TextEncoder()
const sse  = (data: unknown) => enc.encode(`data: ${JSON.stringify(data)}\n\n`)

export async function GET(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  try {
    const jar   = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return new Response('Unauthorized', { status: 401 })
    await verifyToken(token)
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }

  // ── Stream ────────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    start(controller) {
      // Confirm connection immediately
      controller.enqueue(sse({ type: 'connected', ts: new Date().toISOString() }))

      const handler = (event: SpectraEvent) => {
        try { controller.enqueue(sse(event)) } catch { /* client gone */ }
      }

      eventBus.on('spectra', handler)

      // Clean up when the client navigates away or closes the tab
      req.signal.addEventListener('abort', () => {
        eventBus.off('spectra', handler)
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream; charset=utf-8',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
