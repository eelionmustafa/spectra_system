'use client'

import { useState, useTransition, useEffect } from 'react'
import type { ClientTableRow } from '@/lib/queries'
import { updateClient } from './actions'
import { fmt, fmtDate } from '@/lib/formatters'

function stageBg(stage: string) {
  if (stage === 'Stage 1') return { bg: 'rgba(46,204,138,0.12)', color: '#1A9E60', border: 'rgba(46,204,138,0.3)' }
  if (stage === 'Stage 2') return { bg: 'rgba(240,160,75,0.12)',  color: '#B45309', border: 'rgba(240,160,75,0.3)' }
  return                          { bg: 'rgba(232,87,87,0.12)',   color: '#C43A3A', border: 'rgba(232,87,87,0.3)' }
}

function dpdColor(d: number) {
  if (d >= 90) return '#E85757'
  if (d >= 30) return '#F0A04B'
  return '#2ECC8A'
}

function initials(row: ClientTableRow) {
  if (row.name || row.surname)
    return [(row.name[0] ?? ''), (row.surname[0] ?? '')].join('').toUpperCase()
  return row.personal_id.slice(0, 2).toUpperCase()
}

interface Props {
  row: ClientTableRow | null
  onClose: () => void
}

export default function ClientDrawer({ row, onClose }: Props) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [toast, setToast]   = useState<{ ok: boolean; msg: string } | null>(null)

  const [phone,      setPhone]      = useState('')
  const [email,      setEmail]      = useState('')
  const [address,    setAddress]    = useState('')
  const [occupation, setOccupation] = useState('')
  const [status,     setStatus]     = useState('')
  const [notes,      setNotes]      = useState('')

  // Reset form whenever the selected row changes
  useEffect(() => {
    if (!row) return
    setPhone(row.phone)
    setEmail(row.email)
    setAddress(row.address)
    setOccupation(row.occupation)
    setStatus(row.status)
    setNotes('')
    setEditing(false)
    setToast(null)
  }, [row])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!row) return null

  const sc     = stageBg(row.stage)
  const inits  = initials(row)
  const hasDpd = row.current_dpd > 0

  function handleSave() {
    startTransition(async () => {
      const res = await updateClient(row!.personal_id, { phone, email, address, occupation, status, notes })
      setToast(res.ok
        ? { ok: true,  msg: 'Changes saved successfully.' }
        : { ok: false, msg: res.error ?? 'Save failed.' })
      if (res.ok) setEditing(false)
    })
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(13,27,42,0.45)',
          zIndex: 50, animation: 'fade-in 0.15s ease',
        }}
      />

      {/* Drawer panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(480px, 100vw)',
        background: 'white', zIndex: 51,
        boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column',
        animation: 'slide-in-right 0.22s cubic-bezier(0.25,0.46,0.45,0.94)',
        overflowY: 'auto',
      }}>
        <style>{`
          @keyframes fade-in { from { opacity:0 } to { opacity:1 } }
          @keyframes slide-in-right { from { transform:translateX(100%) } to { transform:translateX(0) } }
          .dr-field { display:flex; flex-direction:column; gap:4px; }
          .dr-label { font-size:10px; font-weight:600; color:var(--muted); letter-spacing:1px; text-transform:uppercase; }
          .dr-value { font-size:13px; color:var(--text); }
          .dr-input {
            width:100%; box-sizing:border-box;
            padding:8px 11px; font-size:13px;
            border:1.5px solid var(--border); border-radius:6px;
            font-family:var(--font); color:var(--text); outline:none;
            background:white;
          }
          .dr-input:focus { border-color:var(--navy); box-shadow:0 0 0 3px rgba(29,43,78,0.07); }
          .dr-select {
            width:100%; padding:8px 11px; font-size:13px;
            border:1.5px solid var(--border); border-radius:6px;
            font-family:var(--font); color:var(--text); background:white;
            outline:none; cursor:pointer;
          }
          .dr-textarea {
            width:100%; box-sizing:border-box; resize:vertical; min-height:72px;
            padding:8px 11px; font-size:13px;
            border:1.5px solid var(--border); border-radius:6px;
            font-family:var(--font); color:var(--text); outline:none;
          }
          .dr-textarea:focus { border-color:var(--navy); box-shadow:0 0 0 3px rgba(29,43,78,0.07); }
          .dr-btn-primary {
            flex:1; padding:9px 0; border-radius:7px; border:none; cursor:pointer;
            font-size:12px; font-weight:600; font-family:var(--font);
            background:var(--navy); color:white; transition:opacity 0.12s;
          }
          .dr-btn-primary:hover { opacity:0.88; }
          .dr-btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
          .dr-btn-secondary {
            flex:1; padding:9px 0; border-radius:7px; cursor:pointer;
            font-size:12px; font-weight:600; font-family:var(--font);
            background:white; color:var(--text);
            border:1.5px solid var(--border); transition:background 0.1s;
          }
          .dr-btn-secondary:hover { background:#F7F9FC; }
          .dr-divider { height:1px; background:var(--border); margin:16px 0; }
          .dr-section { font-size:10px; font-weight:700; color:var(--muted); letter-spacing:1.5px; text-transform:uppercase; margin-bottom:12px; }
        `}</style>

        {/* ── Header ── */}
        <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
            background: sc.bg, border: `2px solid ${sc.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '15px', fontWeight: 700, color: sc.color, fontFamily: 'var(--mono)',
          }}>
            {inits}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '3px' }}>
              {row.full_name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--muted)' }}>{row.personal_id}</span>
              <span style={{
                fontSize: '10px', fontWeight: 700, padding: '2px 9px', borderRadius: '5px',
                background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
              }}>{row.stage}</span>
              {hasDpd && (
                <span style={{ fontSize: '10px', fontWeight: 700, color: dpdColor(row.current_dpd), fontFamily: 'var(--mono)' }}>
                  {row.current_dpd}d DPD
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', fontSize: '20px', padding: '0 4px', lineHeight: 1,
          }} aria-label="Close">×</button>
        </div>

        {/* ── Body ── */}
        <div style={{ padding: '20px 22px', flex: 1 }}>

          {/* Risk summary row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: 'Exposure',     value: fmt(row.exposure) },
              { label: 'Product',      value: row.product_type || '—' },
              { label: 'Last Activity',value: fmtDate(row.last_activity) || '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#F8FAFC', borderRadius: '7px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '9px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Toast */}
          {toast && (
            <div style={{
              padding: '9px 14px', borderRadius: '7px', marginBottom: '14px',
              fontSize: '12px', fontWeight: 500,
              background: toast.ok ? 'rgba(46,204,138,0.1)' : 'rgba(232,87,87,0.1)',
              color: toast.ok ? '#1A9E60' : '#C43A3A',
              border: `1px solid ${toast.ok ? 'rgba(46,204,138,0.3)' : 'rgba(232,87,87,0.3)'}`,
            }}>
              {toast.msg}
            </div>
          )}

          {/* Personal Info section */}
          <div className="dr-section">Personal Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div className="dr-field">
              <div className="dr-label">Date of Birth</div>
              <div className="dr-value">{fmtDate(row.dob) || '—'}</div>
            </div>
            <div className="dr-field">
              <div className="dr-label">Gender</div>
              <div className="dr-value">{row.gender === 'M' ? 'Male' : row.gender === 'F' ? 'Female' : row.gender || '—'}</div>
            </div>
            <div className="dr-field">
              <div className="dr-label">Customer Type</div>
              <div className="dr-value">{row.customer_type || '—'}</div>
            </div>
            <div className="dr-field">
              <div className="dr-label">Branch</div>
              <div className="dr-value">{row.branch || '—'}</div>
            </div>
            <div className="dr-field" style={{ gridColumn: '1 / -1' }}>
              <div className="dr-label">Registered</div>
              <div className="dr-value">{fmtDate(row.date_of_register) || '—'}</div>
            </div>
          </div>

          <div className="dr-divider" />

          {/* Editable fields section */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div className="dr-section" style={{ margin: 0 }}>Contact &amp; Status</div>
            {!editing && (
              <button onClick={() => setEditing(true)} style={{
                fontSize: '11px', fontWeight: 600, color: 'var(--blue)',
                background: '#EFF6FF', border: '1px solid #BFDBFE',
                borderRadius: '5px', padding: '3px 10px', cursor: 'pointer',
              }}>Edit</button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {/* Phone */}
            <div className="dr-field">
              <label className="dr-label">Phone</label>
              {editing
                ? <input className="dr-input" value={phone} onChange={e => setPhone(e.target.value)} />
                : <div className="dr-value">{row.phone || '—'}</div>}
            </div>
            {/* Email */}
            <div className="dr-field">
              <label className="dr-label">Email</label>
              {editing
                ? <input className="dr-input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
                : <div className="dr-value" style={{ wordBreak: 'break-all' }}>{row.email || '—'}</div>}
            </div>
            {/* Status */}
            <div className="dr-field">
              <label className="dr-label">KYC / Status</label>
              {editing
                ? <select className="dr-select" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Suspended">Suspended</option>
                    <option value="Deceased">Deceased</option>
                  </select>
                : <div className="dr-value">{row.status || '—'}</div>}
            </div>
            {/* Occupation */}
            <div className="dr-field">
              <label className="dr-label">Occupation</label>
              {editing
                ? <input className="dr-input" value={occupation} onChange={e => setOccupation(e.target.value)} />
                : <div className="dr-value">{row.occupation || '—'}</div>}
            </div>
            {/* Address */}
            <div className="dr-field" style={{ gridColumn: '1 / -1' }}>
              <label className="dr-label">Address</label>
              {editing
                ? <input className="dr-input" value={address} onChange={e => setAddress(e.target.value)} />
                : <div className="dr-value">{row.address || '—'}</div>}
            </div>
          </div>

          {/* Notes — only in edit mode */}
          {editing && (
            <div className="dr-field" style={{ marginBottom: '16px' }}>
              <label className="dr-label">Notes (saved to activity log)</label>
              <textarea
                className="dr-textarea"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add a note about this update…"
              />
            </div>
          )}

          {editing && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button className="dr-btn-secondary" onClick={() => { setEditing(false); setToast(null) }}>
                Cancel
              </button>
              <button className="dr-btn-primary" onClick={handleSave} disabled={pending}>
                {pending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
