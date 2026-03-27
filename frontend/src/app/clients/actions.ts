'use server'

import { revalidatePath } from 'next/cache'
import { query } from '@/lib/db.server'
import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth'

export interface ClientUpdatePayload {
  phone:      string
  email:      string
  address:    string
  occupation: string
  status:     string
  notes:      string
}

async function getActingUser(): Promise<string> {
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE_NAME)?.value
    if (!token) return 'risk_officer'
    const payload = await verifyToken(token)
    return (payload as { sub?: string }).sub ?? 'risk_officer'
  } catch {
    return 'risk_officer'
  }
}

export async function updateClient(
  personalId: string,
  data: ClientUpdatePayload
): Promise<{ ok: boolean; error?: string }> {
  if (!personalId) return { ok: false, error: 'Missing client ID' }

  try {
    // Parameterized UPDATE — no string interpolation of user input
    await query(`
      UPDATE [SPECTRA].[dbo].[Customer]
      SET Tel        = @phone,
          email      = @email,
          Address    = @address,
          Occupation = @occupation,
          Status     = @status
      WHERE PersonalID = @personalId
    `, {
      phone:      data.phone.trim(),
      email:      data.email.trim(),
      address:    data.address.trim(),
      occupation: data.occupation.trim(),
      status:     data.status.trim(),
      personalId,
    })

    // Save notes as a ClientActions entry if provided
    if (data.notes.trim()) {
      const actor = await getActingUser()
      await query(`
        INSERT INTO [SPECTRA].[dbo].[ClientActions]
          (id, clientId, action, status, actionedBy, notes, createdAt)
        VALUES
          (NEWID(), @clientId, 'Profile Update', 'completed', @actionedBy, @notes, GETDATE())
      `, {
        clientId:   personalId,
        actionedBy: actor,
        notes:      data.notes.trim(),
      })
    }

    revalidatePath('/clients')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
