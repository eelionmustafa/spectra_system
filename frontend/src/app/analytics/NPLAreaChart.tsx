'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { NPLTrend } from '@/lib/queries'

const C = { red: '#EF4444', amber: '#F59E0B', muted: '#64748B', border: '#E2E8F0' }
const MM: Record<string, string> = {
  '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun',
  '07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec',
}
const tipStyle = { fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }
const axTick   = { fontSize: 10, fill: C.muted }

export default function NPLAreaChart({ data }: { data: NPLTrend[] }) {
  const rows = data.map(n => ({ month: MM[n.month.slice(5, 7)] ?? n.month, pct: n.npl_ratio_pct }))
  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart data={rows} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="nplGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={C.red} stopOpacity={0.28} />
            <stop offset="95%" stopColor={C.red} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="month" tick={axTick} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={v => `${v}%`} tick={axTick} tickLine={false} axisLine={false} width={34} />
        <Tooltip formatter={(v: any) => [`${v}%`, 'NPL ratio']} contentStyle={tipStyle} />
        <ReferenceLine y={5} stroke={C.red}   strokeDasharray="4 2" strokeWidth={1}
          label={{ value: '5%', position: 'insideTopRight', fontSize: 9, fill: C.red }} />
        <ReferenceLine y={3} stroke={C.amber} strokeDasharray="4 2" strokeWidth={1}
          label={{ value: '3%', position: 'insideTopRight', fontSize: 9, fill: C.amber }} />
        <Area type="monotone" dataKey="pct" stroke={C.red} strokeWidth={2} fill="url(#nplGrad)"
          dot={{ r: 3, fill: C.red, strokeWidth: 0 }} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
