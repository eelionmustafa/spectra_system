'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

const C = { navy: '#1D2B4E', gold: '#C5A028', muted: '#64748B', border: '#E2E8F0' }
const MM: Record<string, string> = {
  '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun',
  '07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec',
}

interface TrendPoint { month: string; exposure: number }

function fmt(n: number) {
  if (n >= 1_000_000) return '€' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '€' + (n / 1_000).toFixed(0) + 'K'
  return '€' + n.toLocaleString()
}

interface CustomDotProps {
  cx?: number
  cy?: number
  index?: number
  totalPoints: number
}

function CustomDot({ cx, cy, index, totalPoints }: CustomDotProps) {
  if (index !== totalPoints - 1 || cx == null || cy == null) return null
  return <circle cx={cx} cy={cy} r={5} fill={C.navy} stroke={C.gold} strokeWidth={2} />
}

export function ExposureTrendChart({ data }: { data: TrendPoint[] }) {
  const rows = data.map((t, i) => ({
    month: MM[t.month.slice(5, 7)] ?? t.month,
    exposure: t.exposure,
    isCurrent: i === data.length - 1,
  }))

  const totalPoints = rows.length

  return (
    <ResponsiveContainer width="100%" height={150}>
      <AreaChart data={rows} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={C.navy} stopOpacity={0.25} />
            <stop offset="95%" stopColor={C.navy} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: C.muted }}
          tickLine={false} axisLine={false}
        />
        <YAxis
          tickFormatter={v => fmt(v)}
          tick={{ fontSize: 9, fill: C.muted }}
          tickLine={false} axisLine={false}
          width={46}
        />
        <Tooltip
          formatter={(v: unknown) => [fmt(v as number), 'Exposure']}
          contentStyle={{ fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }}
          labelStyle={{ fontWeight: 600, color: C.navy }}
        />
        <Area
          type="monotone" dataKey="exposure"
          stroke={C.navy} strokeWidth={2}
          fill="url(#expGrad)"
          dot={false}
          activeDot={{ r: 4, fill: C.navy }}
        />
        <Area
          type="monotone" dataKey="exposure"
          stroke="transparent" fill="transparent"
          dot={<CustomDot totalPoints={totalPoints} />}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
