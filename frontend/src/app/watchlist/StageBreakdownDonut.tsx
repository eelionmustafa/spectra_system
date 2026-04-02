'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const C = { muted: '#64748B', border: '#E2E8F0' }
const tipStyle = { fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px' }

interface StageSlice { label: string; count: number; color: string; desc: string }

export default function StageBreakdownDonut({ data, total }: { data: StageSlice[]; total: number }) {
  const slices = data.map(s => ({ ...s, value: s.count }))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div style={{ flexShrink: 0 }}>
        <ResponsiveContainer width={130} height={130}>
          <PieChart>
            <Pie data={slices} cx="50%" cy="50%" innerRadius={36} outerRadius={56}
              dataKey="value" strokeWidth={2} stroke="#fff">
              {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
            </Pie>
            <Tooltip
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, _: any, props: any) => [
                `${v} (${total ? ((Number(v) / total) * 100).toFixed(1) : 0}%)`,
                props.payload?.label,
              ]}
              contentStyle={tipStyle}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {slices.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: s.color, fontFamily: 'var(--mono)' }}>
                {s.count} <span style={{ fontSize: 10, fontWeight: 400, color: C.muted }}>
                  ({total ? ((s.count / total) * 100).toFixed(1) : 0}%)
                </span>
              </div>
              <div style={{ fontSize: 10, color: C.muted }}>{s.label} · {s.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
