'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'

const C = { muted: '#64748B', border: '#E2E8F0' }
const PRODUCT_COLORS: Record<string, string> = {
  'Consumer': '#1D2B4E',
  'Mortgage':  '#378ADD',
  'Overdraft': '#F59E0B',
  'Card':      '#10B981',
  'Micro':     '#EF4444',
}

function fmt(n: number) {
  if (n >= 1_000_000) return '€' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '€' + (n / 1_000).toFixed(0) + 'K'
  return '€' + n.toLocaleString()
}

interface ProductRow { product_type: string; exposure: number; pct: number }

export function ProductExposureChart({ data }: { data: ProductRow[] }) {
  const sorted = [...data].sort((a, b) => b.exposure - a.exposure)
  const rows = sorted.map(r => ({
    name: r.product_type,
    exposure: r.exposure,
    pct: r.pct,
  }))
  const height = Math.max(rows.length * 40 + 24, 100)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={rows} layout="vertical"
        margin={{ top: 4, right: 80, left: 0, bottom: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={v => fmt(v)}
          tick={{ fontSize: 10, fill: C.muted }}
          tickLine={false} axisLine={false}
        />
        <YAxis
          type="category" dataKey="name"
          tick={{ fontSize: 10, fill: C.muted }}
          tickLine={false} axisLine={false}
          width={64}
        />
        <Tooltip
          formatter={(v, _name, props) => [
            `${fmt(v as number)} (${(props as { payload?: { pct?: number } }).payload?.pct?.toFixed(1)}%)`,
            'Exposure',
          ]}
          contentStyle={{ fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }}
        />
        <Bar dataKey="exposure" radius={[0, 4, 4, 0]}>
          {rows.map((r, i) => (
            <Cell key={i} fill={PRODUCT_COLORS[r.name] ?? '#1D2B4E'} />
          ))}
          <LabelList
            dataKey="pct"
            position="right"
            formatter={(v) => `${Number(v).toFixed(1)}%`}
            style={{ fontSize: 10, fill: C.muted, fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
