export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { getNotificationsForUser } from '@/lib/notificationService'
import NotificationList from './NotificationList'
import type { NotificationRow } from './NotificationList'

function NotificationSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header skeleton */}
      <div style={{
        background: 'linear-gradient(135deg, var(--navy) 0%, #152638 100%)',
        padding: '16px 24px 14px', flexShrink: 0,
        borderBottom: '1px solid rgba(201,168,76,0.2)',
      }}>
        <div style={{ height: 18, width: 160, borderRadius: 4, background: 'rgba(255,255,255,0.12)', marginBottom: 8 }} />
        <div style={{ height: 12, width: 280, borderRadius: 3, background: 'rgba(255,255,255,0.07)' }} />
      </div>
      {/* Filter bar skeleton */}
      <div style={{
        display: 'flex', gap: 6, padding: '10px 24px', background: '#F8FAFC',
        borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        {[60, 72, 56, 68, 50].map((w, i) => (
          <div key={i} style={{ height: 28, width: w, borderRadius: 6, background: '#EEF2F7', animation: `pulse 1.4s ease-in-out ${i * 0.08}s infinite` }} />
        ))}
      </div>
      {/* Row skeletons */}
      <div style={{ flex: 1, padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            borderRadius: 10, border: '1px solid var(--border)', background: 'white',
            padding: '12px 16px', display: 'flex', gap: 14,
            animation: `pulse 1.4s ease-in-out ${i * 0.07}s infinite`,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, background: '#EEF2F7', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 13, width: '55%', borderRadius: 3, background: '#EEF2F7', marginBottom: 8 }} />
              <div style={{ height: 11, width: '80%', borderRadius: 3, background: '#F1F5F9', marginBottom: 4 }} />
              <div style={{ height: 11, width: '65%', borderRadius: 3, background: '#F1F5F9' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

async function NotificationsContent() {
  let notifications: NotificationRow[] = []
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('spectra_session')?.value
    if (token) {
      const session = await verifyToken(token)
      notifications = await getNotificationsForUser(session.username, 50)
    }
  } catch { /* unauthenticated or DB down — render empty list */ }

  return <NotificationList initialNotifications={notifications} />
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<NotificationSkeleton />}>
      <NotificationsContent />
    </Suspense>
  )
}
