'use client'

import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, ReferenceLine } from 'recharts'
import type { VintageRow } from '@/lib/queries'

const C = { navy: '#1D2B4E', red: '#EF4444', green: '#10b981', muted: '#64748B', border: '#E2E8F0' }
const tipStyle = { fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }
const axTick   = { fontSize: 10, fill: C.muted }

type Metric = 'delinquency_rate_pct' | 'performing_pct' | 'avg_loan_amount'

interface Props {
  data:           VintageRow[]
  warnThreshold:  number
  metric?:        Metric
  onSelectYear?:  (year: number) => void
}

function fmtEur(n: number) {
  if (n >= 1_000_000) return '€' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return '€' + (n / 1_000).toFixed(0) + 'K'
  return '€' + n.toLocaleString()
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: VintageRow & { year: string } }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={tipStyle}>
      <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 12 }}>Vintage {d.year}</div>
      <div>{d.loan_count} loans</div>
      <div>Delinquency: <b>{d.delinquency_rate_pct}%</b></div>
      <div>Performing: <b>{d.performing_pct}%</b></div>
      <div>Avg Size: <b>{fmtEur(d.avg_loan_amount)}</b></div>
    </div>
  )
}

export default function VintageBarChart({ data, warnThreshold, metric = 'delinquency_rate_pct', onSelectYear }: Props) {
  const rows = data.map(v => ({
    ...v,
    year: String(v.vintage_year),
    value: v[metric],
    flagged: metric === 'delinquency_rate_pct' ? v.delinquency_rate_pct > warnThreshold : false,
  }))

  const isAmount = metric === 'avg_loan_amount'
  const isPerf   = metric === 'performing_pct'
  const barColor = (r: typeof rows[0]) =>
    isPerf ? C.green : r.flagged ? C.red : C.navy

  const formatter = isAmount
    ? (v: number) => fmtEur(v)
    : (v: number) => `${v}%`

  return (
    <ResponsiveContainer width="100%" height={170}>
      <BarChart data={rows} margin={{ top: 16, right: 16, left: 0, bottom: 16 }} barCategoryGap="35%"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onClick={onSelectYear ? ((e: any) => { if (e?.activePayload?.[0]) onSelectYear(e.activePayload[0].payload.vintage_year) }) as never : undefined}
        style={{ cursor: onSelectYear ? 'pointer' : 'default' }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="year" tick={axTick} tickLine={false} axisLine={false} />
        <YAxis tickFormatter={isAmount ? (v) => fmtEur(v) : (v) => `${v}%`} tick={axTick} tickLine={false} axisLine={false} width={isAmount ? 50 : 34} />
        <Tooltip content={<CustomTooltip />} />
        {!isAmount && !isPerf && (
          <ReferenceLine y={warnThreshold} stroke={C.red} strokeDasharray="4 2" strokeWidth={1}
            label={{ value: `${warnThreshold}%`, position: 'insideTopRight', fontSize: 9, fill: C.red }} />
        )}
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {rows.map((r, i) => <Cell key={i} fill={barColor(r)} />)}
          <LabelList dataKey="value" position="top"
            formatter={(v: unknown) => formatter(Number(v))}
            style={{ fontSize: 9, fill: C.muted }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
