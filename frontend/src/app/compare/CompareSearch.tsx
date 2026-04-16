'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function CompareSearch({ idA, idB }: { idA: string; idB: string }) {
  const [a, setA] = useState(idA)
  const [b, setB] = useState(idB)
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (a.trim()) params.set('a', a.trim())
    if (b.trim()) params.set('b', b.trim())
    startTransition(() => {
      router.push(`/compare?${params.toString()}`)
    })
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 500 }}>Client A — ID</div>
        <input
          value={a}
          onChange={e => setA(e.target.value)}
          placeholder="e.g. 1234567890"
          style={{
            width: '100%', padding: '7px 10px', fontSize: 12,
            border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--card)', color: 'var(--text)',
            fontFamily: 'var(--mono)',
            outline: 'none',
          }}
        />
      </div>
      <div style={{ fontSize: 13, color: 'var(--muted)', paddingBottom: 8 }}>vs</div>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 500 }}>Client B — ID</div>
        <input
          value={b}
          onChange={e => setB(e.target.value)}
          placeholder="e.g. 9876543210"
          style={{
            width: '100%', padding: '7px 10px', fontSize: 12,
            border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--card)', color: 'var(--text)',
            fontFamily: 'var(--mono)',
            outline: 'none',
          }}
        />
      </div>
      <button
        type="submit"
        disabled={!a.trim() || !b.trim() || pending}
        style={{
          padding: '7px 18px', fontSize: 12, fontWeight: 700,
          background: 'var(--navy)', color: '#fff',
          border: 'none', borderRadius: 6, cursor: (!a.trim() || !b.trim()) ? 'not-allowed' : 'pointer',
          opacity: (!a.trim() || !b.trim()) ? 0.5 : 1,
          transition: 'opacity 0.15s',
          whiteSpace: 'nowrap',
          marginBottom: 1,
        }}
      >
        {pending ? 'Loading…' : 'Compare →'}
      </button>
    </form>
  )
}
