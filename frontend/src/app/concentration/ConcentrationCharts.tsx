'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList,
} from 'recharts'

const C = { navy: '#1D2B4E', muted: '#64748B', border: '#E2E8F0' }
const tipStyle = { fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }

const PRODUCT_COLORS: Record<string, string> = {
  'Consumer': '#1D2B4E',
  'Mortgage':  '#378ADD',
  'Overdraft': '#F59E0B',
  'Card':      '#10B981',
  'Micro':     '#EF4444',
  'Other':     '#64748B',
}

function fmt(n: number) {
  if (n >= 1_000_000) return '€' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '€' + (n / 1_000).toFixed(0) + 'K'
  return '€' + n.toLocaleString()
}

interface SegmentRow { segment: string; exposure: number; client_count: number }

export function ExposureHBarChart({
  data,
  colorByProduct = false,
}: {
  data: SegmentRow[]
  colorByProduct?: boolean
}) {
  const sorted = [...data].sort((a, b) => b.exposure - a.exposure)
  const height = Math.max(sorted.length * 38 + 24, 80)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={sorted} layout="vertical"
        margin={{ top: 4, right: 72, left: 0, bottom: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={v => fmt(v)}
          tick={{ fontSize: 9, fill: C.muted }}
          tickLine={false} axisLine={false}
        />
        <YAxis
          type="category" dataKey="segment"
          tick={{ fontSize: 10, fill: C.muted }}
          tickLine={false} axisLine={false}
          width={70}
        />
        <Tooltip
          formatter={(v, _name, props) => [
            `${fmt(v as number)} · ${(props as { payload?: { client_count?: number } }).payload?.client_count ?? ''} clients`,
            'Exposure',
          ]}
          contentStyle={tipStyle}
        />
        <Bar dataKey="exposure" radius={[0, 4, 4, 0]}>
          {sorted.map((r, i) => (
            <Cell
              key={i}
              fill={colorByProduct ? (PRODUCT_COLORS[r.segment] ?? C.navy) : C.navy}
              opacity={colorByProduct ? 1 : 0.75 + (i === 0 ? 0.25 : 0)}
            />
          ))}
          <LabelList
            dataKey="exposure"
            position="right"
            formatter={(v) => fmt(v as number)}
            style={{ fontSize: 10, fill: C.muted }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
