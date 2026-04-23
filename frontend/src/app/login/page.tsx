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
        background: '#0F1E2D', border: '1px solid rgba(201,168,76,0.12)', borderRadius: '16px',
        padding: '40px 36px', width: '380px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '13px', marginBottom: '32px' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
            background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L3 6v6c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V6L12 2z" fill="rgba(201,168,76,0.2)" stroke="#C9A84C" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M9 12l2 2 4-4" stroke="#C9A84C" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '16px', letterSpacing: '0.14em' }}>SPECTRA</div>
            <div style={{ color: '#475569', fontSize: '10.5px', letterSpacing: '0.05em', marginTop: '2px' }}>Risk Intelligence Platform</div>
          </div>
        </div>

        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '28px' }} />

        <div style={{ color: '#F1F5F9', fontSize: '18px', fontWeight: 700, marginBottom: '5px', letterSpacing: '-0.01em' }}>Welcome back</div>
        <div style={{ color: '#64748B', fontSize: '12.5px', marginBottom: '28px', lineHeight: 1.5 }}>
          Sign in to your credit risk workspace
        </div>

        <form onSubmit={handleSubmit} autoComplete="on">
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block', color: '#8FA3B8', fontSize: '10px',
              fontWeight: 700, marginBottom: '8px', letterSpacing: '0.08em', textTransform: 'uppercase',
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
                width: '100%', padding: '11px 14px', borderRadius: '8px',
                border: '1px solid #1E3A5F', background: '#071422',
                color: '#F1F5F9', fontSize: '13px', outline: 'none',
                boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = '#C9A84C'; e.target.style.boxShadow = '0 0 0 3px rgba(201,168,76,0.12)' }}
              onBlur={e  => { e.target.style.borderColor = '#1E3A5F'; e.target.style.boxShadow = 'none' }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block', color: '#8FA3B8', fontSize: '10px',
              fontWeight: 700, marginBottom: '8px', letterSpacing: '0.08em', textTransform: 'uppercase',
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
                width: '100%', padding: '11px 14px', borderRadius: '8px',
                border: '1px solid #1E3A5F', background: '#071422',
                color: '#F1F5F9', fontSize: '13px', outline: 'none',
                boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = '#C9A84C'; e.target.style.boxShadow = '0 0 0 3px rgba(201,168,76,0.12)' }}
              onBlur={e  => { e.target.style.borderColor = '#1E3A5F'; e.target.style.boxShadow = 'none' }}
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
              letterSpacing: '0.04em', transition: 'background 0.15s, opacity 0.15s',
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>

          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
            <span style={{ fontSize: '10px', color: '#334155', letterSpacing: '0.03em' }}>
              SPECTRA · Credit Risk Management System · v2.0
            </span>
          </div>
        </form>

      </div>
    </div>
  )
}
