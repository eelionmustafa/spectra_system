'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

interface DemoClient {
  client_id: string
  full_name: string
  risk_score: number
  risk_label: string
  stage: number
  due_days: number
}

function riskColor(score: number) {
  if (score >= 0.75) return '#ef4444'
  if (score >= 0.50) return '#f97316'
  if (score >= 0.40) return '#eab308'
  return '#10b981'
}

function stageMeta(stage: number) {
  if (stage === 3) return { label: 'Stage 3 · NPL',    color: '#ef4444' }
  if (stage === 2) return { label: 'Stage 2 · Watch',  color: '#f97316' }
  return                  { label: 'Stage 1 · Active', color: '#10b981' }
}

export default function QRCardCarousel({ clients, baseUrl }: { clients: DemoClient[], baseUrl: string }) {
  const [idx, setIdx] = useState(0)

  if (!clients.length) return null

  const client = clients[idx]
  const url = `${baseUrl}/demo/pay?client=${encodeURIComponent(client.client_id)}`
  const color = riskColor(client.risk_score)
  const sm = stageMeta(client.stage)
  const pct = Math.round(client.risk_score * 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>

      {/* Card counter */}
      <div style={{ display: 'flex', gap: 6 }}>
        {clients.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            style={{
              width: i === idx ? 20 : 6,
              height: 6,
              borderRadius: 3,
              background: i === idx ? '#C9A84C' : '#1e3a5f',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.25s',
              padding: 0,
            }}
          />
        ))}
      </div>

      {/* Main card */}
      <div style={{
        background: 'linear-gradient(135deg, #0f1f35 0%, #0a1628 100%)',
        border: `1px solid ${color}40`,
        borderTop: `3px solid ${color}`,
        borderRadius: 20,
        padding: '24px 20px',
        width: 300,
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${color}10`,
        transition: 'all 0.3s cubic-bezier(0.34,1.2,0.64,1)',
      }}>
        {/* Client info */}
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#475569', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
            Client
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 }}>
            {client.full_name}
          </div>
          <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>
            ID: {client.client_id}
          </div>
        </div>

        {/* Risk badge + score */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{
            background: `${color}18`,
            color,
            border: `1px solid ${color}40`,
            borderRadius: 10,
            padding: '4px 12px',
            fontSize: 11, fontWeight: 700,
          }}>
            {sm.label}
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            padding: '4px 12px',
            fontSize: 11, fontWeight: 700, color,
            fontFamily: 'monospace',
          }}>
            {pct}% risk
          </div>
        </div>

        {/* QR Code */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{
            background: '#fff',
            borderRadius: 12,
            padding: 10,
            boxShadow: `0 0 20px ${color}30`,
          }}>
            <QRCodeSVG value={url} size={140} />
          </div>
          <div style={{ fontSize: 9, color: '#334155', fontFamily: 'monospace', textAlign: 'center', wordBreak: 'break-all', maxWidth: 260 }}>
            {url}
          </div>
        </div>
      </div>

      {/* Prev / Next */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={() => setIdx(i => Math.max(0, i - 1))}
          disabled={idx === 0}
          style={{
            background: idx === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(201,168,76,0.12)',
            border: `1px solid ${idx === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(201,168,76,0.3)'}`,
            color: idx === 0 ? '#334155' : '#C9A84C',
            borderRadius: 10, padding: '8px 18px',
            fontSize: 13, fontWeight: 600, cursor: idx === 0 ? 'default' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          ← Prev
        </button>
        <span style={{ fontSize: 11, color: '#475569' }}>
          {idx + 1} / {clients.length}
        </span>
        <button
          onClick={() => setIdx(i => Math.min(clients.length - 1, i + 1))}
          disabled={idx === clients.length - 1}
          style={{
            background: idx === clients.length - 1 ? 'rgba(255,255,255,0.04)' : 'rgba(201,168,76,0.12)',
            border: `1px solid ${idx === clients.length - 1 ? 'rgba(255,255,255,0.08)' : 'rgba(201,168,76,0.3)'}`,
            color: idx === clients.length - 1 ? '#334155' : '#C9A84C',
            borderRadius: 10, padding: '8px 18px',
            fontSize: 13, fontWeight: 600, cursor: idx === clients.length - 1 ? 'default' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Next →
        </button>
      </div>
    </div>
  )
}
