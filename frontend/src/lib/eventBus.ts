/**
 * Server-side in-process event bus for real-time staff collaboration.
 *
 * Uses a global singleton so that all Next.js API route handlers in the same
 * Node.js process share one EventEmitter — meaning when one route emits an
 * event, every connected SSE client (subscribed in /api/events) receives it.
 *
 * Works perfectly for a single-server / local-dev setup.  For multi-process
 * production deployments swap the emitter for Redis pub/sub.
 */

import { EventEmitter } from 'events'

const g = globalThis as typeof globalThis & { __spectraBus?: EventEmitter }
if (!g.__spectraBus) {
  g.__spectraBus = new EventEmitter()
  g.__spectraBus.setMaxListeners(200)   // one per connected staff tab
}
export const eventBus = g.__spectraBus

// ── Event shape ─────────────────────────────────────────────────────────────

export type SpectraEventType =
  | 'freeze' | 'unfreeze'
  | 'committee' | 'recovery' | 'restructuring'
  | 'engagement' | 'document' | 'sweep'
  | 'notification'
  | 'resolve' | 'unresolve'

export interface SpectraEvent {
  type:      SpectraEventType
  clientId:  string
  actor:     string
  message:   string
  ts:        string
}

export function emitSpectraEvent(event: Omit<SpectraEvent, 'ts'>) {
  eventBus.emit('spectra', { ...event, ts: new Date().toISOString() } satisfies SpectraEvent)
}
