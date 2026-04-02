import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyClientToken, CLIENT_COOKIE } from '@/lib/clientAuth'
import { getUnreadCount } from '@/lib/messagingService'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get(CLIENT_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let payload
  try {
    payload = await verifyClientToken(token)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (payload.clientId !== id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const count = await getUnreadCount(id, 'client')
  return NextResponse.json({ count })
}
