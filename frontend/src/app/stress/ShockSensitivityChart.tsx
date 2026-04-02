'use client'

import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const C = { muted: '#64748B', border: '#E2E8F0' }
const tipStyle = { fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }

interface ScenarioBar { name: string; avgPD: number; elr: number; color: string }

export default function ShockSensitivityChart({ data }: { data: ScenarioBar[] }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 14, right: 12, left: 0, bottom: 0 }} barCategoryGap="30%" barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.muted }} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} width={34} />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any, name: any) => [`${v}%`, name === 'avgPD' ? 'Avg PD' : 'Exp. Loss Rate']}
          contentStyle={tipStyle}
        />
        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
          formatter={(value: string) => (
            <span style={{ color: C.muted }}>{value === 'avgPD' ? 'Avg PD' : 'Exp. Loss Rate'}</span>
          )} />
        <Bar dataKey="avgPD" radius={[4,4,0,0]} name="avgPD">
          {data.map((s, i) => <Cell key={i} fill={s.color} />)}
        </Bar>
        <Bar dataKey="elr" radius={[4,4,0,0]} name="elr">
          {data.map((s, i) => <Cell key={i} fill={s.color} opacity={0.55} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
