'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { MessageRow } from '@/lib/messagingService'

interface Props { clientId: string; clientName: string }

function fmtTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function MessagingPanel({ clientId, clientName }: Props) {
  const [open, setOpen]               = useState(false)
  const [messages, setMessages]       = useState<MessageRow[]>([])
  const [loading, setLoading]         = useState(false)
  const [sending, setSending]         = useState(false)
  const [text, setText]               = useState('')
  const [attachment, setAttachment]   = useState<{ name: string; url: string; type: string } | null>(null)
  const [unread, setUnread]           = useState(0)
  const [error, setError]             = useState<string | null>(null)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fetchedRef   = useRef(false)

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/clients/' + clientId + '/messages')
      if (!res.ok) return
      const data = await res.json()
      const msgs: MessageRow[] = data.messages ?? []
      setMessages(msgs)
      if (!open) {
        setUnread(msgs.filter(m => m.sender_type === 'client' && !m.read_at).length)
      } else {
        setUnread(0)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [clientId, open])

  // Fetch on first open
  useEffect(() => {
    if (open && !fetchedRef.current) {
      fetchedRef.current = true
      setLoading(true)
      void fetchMessages()
    }
    if (open) setUnread(0)
  }, [open, fetchMessages])

  // Poll every 2s when open, every 30s when closed (for unread badge)
  useEffect(() => {
    const iv = setInterval(fetchMessages, open ? 2000 : 30000)
    return () => clearInterval(iv)
  }, [fetchMessages, open])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Max file size is 5 MB.'); e.target.value = ''; return }
    const reader = new FileReader()
    reader.onload = () => { setAttachment({ name: file.name, url: reader.result as string, type: file.type }); setError(null) }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleSend() {
    if (!text.trim() && !attachment) return
    setSending(true); setError(null)
    try {
      const res = await fetch('/api/clients/' + clientId + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text.trim() || null, attachment }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setMessages(prev => [...prev, data.message])
      setText(''); setAttachment(null)
    } catch { setError('Failed to send.') }
    finally { setSending(false) }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
  }

  const canSend = !sending && (!!text.trim() || !!attachment)

  return (
    <>
      <style>{`
        @keyframes msg-spin { to { transform: rotate(360deg) } }
        @keyframes msg-pop { from { opacity:0; transform: scale(0.92) translateY(8px) } to { opacity:1; transform: scale(1) translateY(0) } }
      `}</style>

      {/* Floating widget */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>

        {/* Chat window */}
        {open && (
          <div style={{
            width: 320, height: 420, background: 'white',
            borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            animation: 'msg-pop 0.18s ease',
          }}>
            {/* Header */}
            <div style={{ background: '#0D1B2A', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(201,168,76,0.2)', border: '1.5px solid #C9A84C', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#C9A84C', flexShrink: 0 }}>
                {clientName.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clientName}</div>
                <div style={{ fontSize: 9, color: 'rgba(201,168,76,0.8)' }}>Client · {clientId}</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 4, lineHeight: 1 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 4px', display: 'flex', flexDirection: 'column', gap: 8, background: '#F8FAFC' }}>
              {loading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid #E2E8F0', borderTopColor: '#C9A84C', animation: 'msg-spin 0.8s linear infinite' }} />
                </div>
              ) : messages.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 11, textAlign: 'center', padding: '0 20px' }}>
                  No messages yet.<br/>Start the conversation.
                </div>
              ) : messages.map(msg => {
                const isOfficer = msg.sender_type === 'officer'

                // System messages — full-width alert card
                if (msg.is_system) {
                  const body = msg.body ?? ''
                  const firstLine = body.split('\n')[0] ?? ''
                  const rest = body.split('\n').slice(1).join('\n').trim()
                  const isResolved   = body.includes('✅')
                  const isFreeze     = body.includes('🔒')
                  const isDocs       = body.includes('📄')
                  const borderColor  = isResolved ? '#22C55E' : isFreeze ? '#EF4444' : isDocs ? '#F59E0B' : '#3B82F6'
                  const bgColor      = isResolved ? '#F0FDF4' : isFreeze ? '#FEF2F2' : isDocs ? '#FFFBEB' : '#EFF6FF'
                  return (
                    <div key={msg.id} style={{ width: '100%', background: bgColor, border: `1px solid ${borderColor}40`, borderLeft: `3px solid ${borderColor}`, borderRadius: 8, padding: '9px 11px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#0D1B2A' }}>{firstLine}</span>
                        <span style={{ fontSize: 9, fontWeight: 600, color: '#64748B', flexShrink: 0, marginLeft: 6 }}>Auto-sent to client</span>
                      </div>
                      {rest && <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{rest}</div>}
                      <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 5 }}>{fmtTime(msg.created_at)} · {msg.read_at ? '✓✓ Read by client' : '✓ Delivered'}</div>
                    </div>
                  )
                }

                // Regular chat bubble
                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOfficer ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '80%', padding: '7px 11px', fontSize: 11, lineHeight: 1.5,
                      borderRadius: isOfficer ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                      background: isOfficer ? '#0D1B2A' : 'white',
                      color: isOfficer ? '#F1F5F9' : '#0D1B2A',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.07)',
                    }}>
                      {msg.body && <div>{msg.body}</div>}
                      {msg.attachment_name && (
                        <a href={msg.attachment_url ?? '#'} download={msg.attachment_name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: msg.body ? 4 : 0, fontSize: 10, color: isOfficer ? '#C9A84C' : '#3B82F6', textDecoration: 'none', fontWeight: 600 }}>
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 14h12M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          {msg.attachment_name}
                        </a>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 2, display: 'flex', gap: 6 }}>
                      <span>{fmtTime(msg.created_at)}</span>
                      {isOfficer && <span style={{ color: msg.read_at ? '#22C55E' : '#94A3B8' }}>{msg.read_at ? '✓✓' : '✓'}</span>}
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Error */}
            {error && <div style={{ padding: '4px 12px', background: '#FEF2F2', fontSize: 10, color: '#991B1B', flexShrink: 0 }}>{error}</div>}

            {/* Attachment preview */}
            {attachment && (
              <div style={{ padding: '5px 12px', background: '#FFFBEB', borderTop: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#92400E', flexShrink: 0 }}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M13 9l-5 5a4 4 0 0 1-5.66-5.66l6-6a2.5 2.5 0 0 1 3.54 3.54l-6 6a1 1 0 0 1-1.42-1.42l5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.name}</span>
                <button onClick={() => setAttachment(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400E', fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
              </div>
            )}

            {/* Input */}
            <div style={{ padding: '8px 10px', borderTop: '1px solid #E2E8F0', display: 'flex', gap: 6, alignItems: 'flex-end', background: 'white', flexShrink: 0 }}>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFile} accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" />
              <button onClick={() => fileInputRef.current?.click()} title="Attach" style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: 6, padding: '5px 6px', cursor: 'pointer', color: '#94A3B8', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M13 9l-5 5a4 4 0 0 1-5.66-5.66l6-6a2.5 2.5 0 0 1 3.54 3.54l-6 6a1 1 0 0 1-1.42-1.42l5-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
              </button>
              <textarea
                value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Message..." rows={1}
                style={{ flex: 1, resize: 'none', border: '1px solid #E2E8F0', borderRadius: 18, padding: '6px 12px', fontSize: 11, fontFamily: 'inherit', color: '#0D1B2A', outline: 'none', lineHeight: 1.4, maxHeight: 72, overflowY: 'auto', background: '#F8FAFC' }}
              />
              <button onClick={() => { void handleSend() }} disabled={!canSend} style={{ background: canSend ? '#0D1B2A' : '#E2E8F0', border: 'none', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canSend ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M14 2L2 7l5 2 2 5 5-12z" fill={canSend ? '#C9A84C' : '#94A3B8'}/></svg>
              </button>
            </div>
          </div>
        )}

        {/* Bubble button */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            width: 52, height: 52, borderRadius: '50%',
            background: '#0D1B2A', border: '2px solid #C9A84C',
            boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}
        >
          {open ? (
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M14 2L2 14" stroke="#C9A84C" strokeWidth="1.8" strokeLinecap="round"/></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M17 3H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4l3 3 3-3h4a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z" stroke="#C9A84C" strokeWidth="1.4" strokeLinejoin="round"/></svg>
          )}
          {!open && unread > 0 && (
            <span style={{ position: 'absolute', top: -4, right: -4, background: '#EF4444', color: 'white', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid white' }}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      </div>
    </>
  )
}
