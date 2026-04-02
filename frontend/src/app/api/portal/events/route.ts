export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { verifyClientToken, CLIENT_COOKIE } from '@/lib/clientAuth'
import { eventBus } from '@/lib/eventBus'
import type { SpectraEvent } from '@/lib/eventBus'

const enc = new TextEncoder()
const sse = (data: unknown) => enc.encode(`data: ${JSON.stringify(data)}\n\n`)

export async function GET(req: NextRequest) {
  let clientId: string
  try {
    const jar   = await cookies()
    const token = jar.get(CLIENT_COOKIE)?.value
    if (!token) return new Response('Unauthorized', { status: 401 })
    const payload = await verifyClientToken(token)
    clientId = payload.clientId
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(sse({ type: 'connected', ts: new Date().toISOString() }))

      const handler = (event: SpectraEvent) => {
        // Only forward events relevant to this client
        if (event.clientId !== clientId) return
        try { controller.enqueue(sse(event)) } catch { /* client gone */ }
      }

      eventBus.on('spectra', handler)

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
