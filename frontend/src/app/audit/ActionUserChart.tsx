'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'

const C = { navy: '#0D1B2A', muted: '#6B7E95', border: '#DDE3EC' }

export default function ActionUserChart({ data }: { data: [string, number][] }) {
  const rows = data.map(([user, count]) => ({ user, count }))
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 36)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, left: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={C.border} strokeDasharray="3 3" />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="user" width={110}
          tick={{ fontSize: 10, fill: C.muted, fontFamily: 'IBM Plex Mono, monospace' }} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: '#F1F5F9' }}
          contentStyle={{ fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px' }}
          formatter={(v: any) => [v, 'Actions']} />
        <Bar dataKey="count" fill={C.navy} radius={[0, 3, 3, 0]} maxBarSize={18}>
          <LabelList dataKey="count" position="right"
            style={{ fontSize: 10, fontWeight: 700, fill: C.navy, fontFamily: 'IBM Plex Mono, monospace' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
