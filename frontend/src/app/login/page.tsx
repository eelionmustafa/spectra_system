'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()

      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Invalid username or password.')
        return
      }

      // Hard navigate so the server re-reads the session cookie fresh
      window.location.href = '/'
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0D1B2A', fontFamily: 'var(--font)',
    }}>
      <div style={{
        background: '#112030', border: '1px solid #1E3A5F', borderRadius: '14px',
        padding: '44px 40px', width: '360px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '36px' }}>
          <img src="/logo.png" alt="SPECTRA" width={42} height={42} style={{ objectFit: 'contain', flexShrink: 0 }} />
          <div>
            <div style={{ color: 'white', fontWeight: 700, fontSize: '17px', letterSpacing: '0.12em' }}>SPECTRA</div>
            <div style={{ color: '#475569', fontSize: '10px', letterSpacing: '0.06em', marginTop: '1px' }}>Risk Intelligence Platform</div>
          </div>
        </div>

        <div style={{ color: 'white', fontSize: '19px', fontWeight: 700, marginBottom: '4px' }}>Sign in</div>
        <div style={{ color: '#64748B', fontSize: '12px', marginBottom: '30px' }}>
          Credit Risk Management System
        </div>

        <form onSubmit={handleSubmit} autoComplete="on">
          <div style={{ marginBottom: '18px' }}>
            <label style={{
              display: 'block', color: '#94A3B8', fontSize: '10px',
              fontWeight: 700, marginBottom: '7px', letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              placeholder=""
              style={{
                width: '100%', padding: '10px 13px', borderRadius: '7px',
                border: '1px solid #1E3A5F', background: '#0D1B2A',
                color: 'white', fontSize: '13px', outline: 'none',
                boxSizing: 'border-box', transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = '#C9A84C')}
              onBlur={e  => (e.target.style.borderColor = '#1E3A5F')}
            />
          </div>

          <div style={{ marginBottom: '26px' }}>
            <label style={{
              display: 'block', color: '#94A3B8', fontSize: '10px',
              fontWeight: 700, marginBottom: '7px', letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              style={{
                width: '100%', padding: '10px 13px', borderRadius: '7px',
                border: '1px solid #1E3A5F', background: '#0D1B2A',
                color: 'white', fontSize: '13px', outline: 'none',
                boxSizing: 'border-box', transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.target.style.borderColor = '#C9A84C')}
              onBlur={e  => (e.target.style.borderColor = '#1E3A5F')}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(127,29,29,0.18)', border: '1px solid #7F1D1D',
              borderRadius: '7px', padding: '9px 13px',
              color: '#FCA5A5', fontSize: '12px', marginBottom: '18px', lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px', borderRadius: '8px',
              background: loading ? '#A07830' : '#C9A84C',
              border: 'none', color: '#0D1B2A',
              fontWeight: 700, fontSize: '13px',
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.05em', transition: 'background 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

      </div>
    </div>
  )
}
