import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db.server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'

export async function GET() {
  try {
    const pool = await getPool()
    const cols  = await pool.request().query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'DueDaysDaily' ORDER BY ORDINAL_POSITION`)
    const sample = await pool.request().query(`SELECT TOP 5 * FROM [dbo].[DueDaysDaily] WITH (NOLOCK) ORDER BY dateID DESC`)
    const dates  = await pool.request().query(`SELECT DISTINCT TOP 30 dateID FROM [dbo].[DueDaysDaily] WITH (NOLOCK) ORDER BY dateID DESC`)
    return NextResponse.json({ columns: cols.recordset, sample: sample.recordset, dates: dates.recordset })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await verifyToken(token)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { personalIds, columnMap, manualSlots, dpds: customDpds } = body

  const pidCol  = columnMap?.personalId  ?? 'PersonalID'
  const dpdCol  = columnMap?.dueDays     ?? 'DueDays'
  const dateCol = columnMap?.dateId      ?? 'dateID'
  const cntCol  = columnMap?.contractNum ?? null

  const pool = await getPool()

  let slots: string[]
  if (manualSlots) {
    slots = [manualSlots.slot0, manualSlots.slot1, manualSlots.slot2, manualSlots.slot3].filter(Boolean)
  } else {
    const datesRes = await pool.request().query(`SELECT DISTINCT TOP 30 dateID FROM [dbo].[DueDaysDaily] WITH (NOLOCK) ORDER BY dateID DESC`)
    const dateIDs: string[] = datesRes.recordset.map((r: Record<string, unknown>) => String(r.dateID))
    slots = [
      dateIDs[0],
      dateIDs[Math.min(6,  dateIDs.length - 1)],
      dateIDs[Math.min(13, dateIDs.length - 1)],
      dateIDs[Math.min(20, dateIDs.length - 1)],
    ]
  }

  // Rising DPD: oldest=5, 2w=15, 1w=30, now=45
  const dpds: number[] = customDpds ?? [45, 30, 15, 5]

  let inserted = 0
  let updated  = 0
  for (const pid of personalIds) {
    for (let i = 0; i < slots.length; i++) {
      const dateVal = slots[i]
      const dpdVal  = dpds[i]
      if (!dateVal) continue

      const exists = await pool.request()
        .input('pid', pid).input('dt', dateVal)
        .query(`SELECT COUNT(*) AS cnt FROM [dbo].[DueDaysDaily] WHERE ${pidCol} = @pid AND ${dateCol} = @dt`)

      if (exists.recordset[0].cnt > 0) {
        // Update existing row's DPD
        await pool.request().input('pid', pid).input('dt', dateVal).input('dpd', String(dpdVal))
          .query(`UPDATE [dbo].[DueDaysDaily] SET ${dpdCol} = @dpd WHERE ${pidCol} = @pid AND ${dateCol} = @dt`)
        updated++
      } else {
        const r = pool.request().input('pid', pid).input('dt', dateVal).input('dpd', String(dpdVal))
        if (cntCol) {
          await r.query(`INSERT INTO [dbo].[DueDaysDaily] (${pidCol}, ${dateCol}, ${dpdCol}, ${cntCol}) VALUES (@pid, @dt, @dpd, @pid)`)
        } else {
          await r.query(`INSERT INTO [dbo].[DueDaysDaily] (${pidCol}, ${dateCol}, ${dpdCol}) VALUES (@pid, @dt, @dpd)`)
        }
        inserted++
      }
    }
  }

  return NextResponse.json({ ok: true, inserted, updated, slots })
}
