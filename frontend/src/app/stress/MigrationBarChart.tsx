'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const C = { blue: '#378ADD', amber: '#F59E0B', red: '#EF4444', muted: '#64748B', border: '#E2E8F0' }
const tipStyle = { fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }

interface LabelMigration { label: string; Base: number; Adverse: number; Severe: number }

export default function MigrationBarChart({ data }: { data: LabelMigration[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 14, right: 12, left: 0, bottom: 0 }} barCategoryGap="25%" barGap={3}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} width={40} />
        <Tooltip formatter={(v: unknown, name: string) => [Number(v).toLocaleString(), name]} contentStyle={tipStyle} />
        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 6 }}
          formatter={(value: string) => <span style={{ color: C.muted }}>{value}</span>} />
        <Bar dataKey="Base"    fill={C.blue}  radius={[3,3,0,0]} name="Base" />
        <Bar dataKey="Adverse" fill={C.amber} radius={[3,3,0,0]} name="Adverse" />
        <Bar dataKey="Severe"  fill={C.red}   radius={[3,3,0,0]} name="Severe" />
      </BarChart>
    </ResponsiveContainer>
  )
}
