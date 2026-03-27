'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { ECLByStage } from '@/lib/queries'

const C = { navy: '#1D2B4E', blue: '#378ADD', amber: '#F59E0B', muted: '#64748B', border: '#E2E8F0' }
const tipStyle = { fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }
const axTick   = { fontSize: 10, fill: C.muted }

export default function ECLGroupedChart({ data }: { data: ECLByStage[] }) {
  const rows = data.map(r => ({
    stage: r.stage_descr,
    Exposure:     +(r.total_exposure  / 1_000_000).toFixed(2),
    'Bank Prov.': +(r.bank_provision  / 1_000_000).toFixed(2),
    'Calc. ECL':  +(r.calculated_ecl  / 1_000_000).toFixed(2),
  }))
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={rows} margin={{ top: 12, right: 16, left: 0, bottom: 0 }} barCategoryGap="25%" barGap={3}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="stage" tick={axTick} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={v => `€${v}M`} tick={axTick} tickLine={false} axisLine={false} width={46} />
        <Tooltip formatter={(v: any, name: any) => [`€${v}M`, name]} contentStyle={tipStyle} />
        <Bar dataKey="Exposure"    fill={`${C.navy}30`} stroke={C.navy}  strokeWidth={1} radius={[3,3,0,0]} />
        <Bar dataKey="Bank Prov."  fill={C.blue}        radius={[3,3,0,0]} />
        <Bar dataKey="Calc. ECL"   fill={C.amber}       radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
