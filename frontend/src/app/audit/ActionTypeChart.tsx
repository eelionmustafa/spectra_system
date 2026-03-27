'use client'

import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'

const C = { navy: '#0D1B2A', green: '#1EA97C', amber: '#D97706', red: '#D94040', blue: '#2563EB', muted: '#6B7E95', border: '#DDE3EC' }

const ACTION_COLORS: Record<string, string> = {
  'Freeze Account': C.red, 'Freeze account': C.red,
  'Unfreeze Account': C.green, 'Unfreeze account': C.green,
  'Escalate Case': C.red, 'Escalate case': C.red,
  'Add to Watchlist': C.amber, 'Add to watchlist': C.amber,
  'Remove from Watchlist': C.blue,
  'Schedule Review': C.blue, 'Schedule review': C.blue,
  'Contact Client': C.blue, 'Contact immediately': C.red,
  'Send Reminder': C.blue,
  'Legal Review': C.red, 'Legal review': C.red,
  'Monitor': C.green,
}

export default function ActionTypeChart({ data }: { data: [string, number][] }) {
  const rows = data.map(([action, count]) => ({ action, count }))
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, rows.length * 36)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, left: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={C.border} strokeDasharray="3 3" />
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="action" width={130}
          tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: '#F1F5F9' }}
          contentStyle={{ fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px' }}
          formatter={(v: any) => [v, 'Count']} />
        <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={18}>
          {rows.map((r, i) => <Cell key={i} fill={ACTION_COLORS[r.action] ?? C.muted} />)}
          <LabelList dataKey="count" position="right"
            style={{ fontSize: 10, fontWeight: 700, fill: C.navy, fontFamily: 'IBM Plex Mono, monospace' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
