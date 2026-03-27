'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ClientLogin() {
  const router = useRouter()
  const [accountId, setAccountId] = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [showPw, setShowPw]       = useState(false)
  const [focused, setFocused]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res  = await fetch('/api/portal/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: accountId.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Login failed.'); return }
      router.push(`/portal/${data.clientId}`)
    } catch {
      setError('Unable to connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }

        /* ── Outer wrapper ───────────────────────────────────── */
        .p-wrap {
          display: flex;
          min-height: 100vh;
          min-height: 100dvh;
          font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        }

        /* ══════════════════════════════════════════════════════
           LEFT PANEL — Brand panel
        ══════════════════════════════════════════════════════ */
        .p-left {
          flex: 0 0 42%;
          background: #07111C;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          padding: 44px 48px;
        }

        /* Dot grid overlay */
        .p-left::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(201,168,76,0.12) 1px, transparent 1px);
          background-size: 28px 28px;
          pointer-events: none;
        }

        /* Radial glow – bottom left */
        .p-left::after {
          content: '';
          position: absolute;
          bottom: -120px; left: -80px;
          width: 480px; height: 480px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(30,58,95,0.55) 0%, transparent 65%);
          pointer-events: none;
        }

        /* Top-right gold glow */
        .p-glow {
          position: absolute;
          top: -60px; right: -60px;
          width: 320px; height: 320px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(201,168,76,0.1) 0%, transparent 65%);
          pointer-events: none;
        }

        /* Giant waveform watermark */
        .p-watermark {
          position: absolute;
          bottom: 80px; right: -40px;
          opacity: 0.045;
          pointer-events: none;
          transform: scaleX(-1);
        }

        /* Horizontal gold accent line */
        .p-left-line {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(201,168,76,0.5), transparent);
        }

        /* Content inside left panel */
        .p-left-body {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          flex: 1;
        }

        /* Logo row */
        .p-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          animation: fadeUp 0.5s ease both;
        }
        .p-logo-icon {
          width: 44px; height: 44px;
          border-radius: 12px;
          background: linear-gradient(145deg, rgba(201,168,76,0.22), rgba(201,168,76,0.06));
          border: 1px solid rgba(201,168,76,0.4);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 0 24px rgba(201,168,76,0.15);
        }
        .p-logo-name {
          font-size: 20px; font-weight: 800;
          color: white; letter-spacing: 0.14em;
        }
        .p-logo-sub {
          font-size: 9px; font-weight: 600;
          color: rgba(255,255,255,0.35);
          letter-spacing: 0.22em;
          text-transform: uppercase;
          margin-top: 1px;
        }

        /* Tagline */
        .p-tagline {
          margin-top: auto;
          padding-bottom: 8px;
          animation: fadeUp 0.5s 0.1s ease both;
        }
        .p-tagline-main {
          font-size: 32px; font-weight: 800;
          color: white; line-height: 1.18;
          letter-spacing: -0.02em;
        }
        .p-tagline-gold {
          color: #C9A84C;
        }
        .p-tagline-sub {
          margin-top: 14px;
          font-size: 13px; color: rgba(255,255,255,0.42);
          line-height: 1.65; max-width: 280px;
        }

        /* Feature list */
        .p-features {
          margin-top: 32px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          animation: fadeUp 0.5s 0.2s ease both;
        }
        .p-feature {
          display: flex; align-items: center; gap: 12px;
        }
        .p-feature-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #C9A84C; flex-shrink: 0;
          box-shadow: 0 0 8px rgba(201,168,76,0.6);
        }
        .p-feature-text {
          font-size: 12.5px; color: rgba(255,255,255,0.55);
          font-weight: 500;
        }

        /* Bottom strip */
        .p-left-foot {
          position: relative; z-index: 1;
          margin-top: 36px;
          padding-top: 20px;
          border-top: 1px solid rgba(255,255,255,0.07);
          display: flex; align-items: center; gap: 8px;
          animation: fadeUp 0.5s 0.25s ease both;
        }
        .p-left-foot-text {
          font-size: 10px; color: rgba(255,255,255,0.25);
          font-weight: 500; letter-spacing: 0.03em;
        }
        .p-left-foot-dot {
          width: 3px; height: 3px; border-radius: 50%;
          background: rgba(255,255,255,0.2); flex-shrink: 0;
        }

        /* ══════════════════════════════════════════════════════
           RIGHT PANEL — Form
        ══════════════════════════════════════════════════════ */
        .p-right {
          flex: 1;
          background: #F0F4F8;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
          position: relative;
        }

        /* Subtle top decoration */
        .p-right::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #C9A84C 0%, #E8C96A 50%, #C9A84C 100%);
          background-size: 200% 100%;
          animation: shimmer 3s linear infinite;
        }

        .p-form-outer {
          width: 100%; max-width: 420px;
          animation: fadeUp 0.55s 0.05s ease both;
        }

        /* Mobile logo (hidden desktop) */
        .p-mobile-logo {
          display: none;
          align-items: center; gap: 10px;
          margin-bottom: 28px;
        }
        .p-mobile-logo-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: #07111C; display: flex;
          align-items: center; justify-content: center;
        }
        .p-mobile-logo-name {
          font-size: 17px; font-weight: 800;
          color: #0D1B2A; letter-spacing: 0.1em;
        }

        /* Card */
        .p-card {
          background: white;
          border-radius: 20px;
          overflow: hidden;
          box-shadow:
            0 1px 3px rgba(0,0,0,0.06),
            0 8px 32px rgba(0,0,0,0.08),
            0 24px 64px rgba(0,0,0,0.06);
          border: 1px solid rgba(0,0,0,0.06);
        }

        /* Header strip inside card */
        .p-card-head {
          padding: 26px 28px 22px;
          border-bottom: 1px solid #F1F5F9;
          background: linear-gradient(to bottom, #FAFBFC, white);
        }
        .p-card-title {
          font-size: 20px; font-weight: 800;
          color: #0D1B2A; letter-spacing: -0.02em;
        }
        .p-card-sub {
          font-size: 12.5px; color: #94A3B8;
          margin-top: 4px; line-height: 1.5;
        }

        /* Portal badge (inside header) */
        .p-portal-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 10px; border-radius: 20px;
          background: rgba(201,168,76,0.1);
          border: 1px solid rgba(201,168,76,0.3);
          font-size: 9.5px; font-weight: 700;
          color: #B8952A; letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        .p-portal-badge-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: #C9A84C;
          position: relative;
        }
        .p-portal-badge-dot::after {
          content: '';
          position: absolute; inset: -2px;
          border-radius: 50%;
          background: rgba(201,168,76,0.4);
          animation: pulse-ring 1.5s ease-out infinite;
        }

        /* Form body */
        .p-form-body {
          padding: 24px 28px 22px;
        }

        /* Field group */
        .p-field {
          margin-bottom: 16px;
        }
        .p-label {
          display: block;
          font-size: 11px; font-weight: 700;
          color: #374151;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        /* Input wrapper */
        .p-input-wrap {
          position: relative;
          display: flex; align-items: center;
        }
        .p-input-icon {
          position: absolute; left: 12px;
          color: #94A3B8; display: flex;
          pointer-events: none;
          transition: color 0.15s;
        }
        .p-input-wrap:focus-within .p-input-icon {
          color: #0D1B2A;
        }

        .p-input {
          width: 100%;
          padding: 11px 14px 11px 38px;
          border-radius: 10px;
          border: 1.5px solid #E2E8F0;
          font-size: 15px;
          font-family: inherit;
          outline: none;
          color: #0D1B2A;
          background: #F8FAFC;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
          -webkit-appearance: none;
          appearance: none;
        }
        .p-input::placeholder { color: #CBD5E1; }
        .p-input:focus {
          border-color: #0D1B2A;
          background: white;
          box-shadow: 0 0 0 3px rgba(13,27,42,0.08);
        }
        .p-input-mono { font-family: 'SF Mono', 'Fira Mono', monospace; letter-spacing: 0.06em; }

        /* Password toggle */
        .p-pw-btn {
          position: absolute; right: 10px;
          background: none; border: none; cursor: pointer;
          color: #94A3B8; padding: 6px;
          display: flex; align-items: center;
          border-radius: 6px;
          transition: color 0.15s, background 0.15s;
          -webkit-tap-highlight-color: transparent;
        }
        .p-pw-btn:hover { color: #0D1B2A; background: #F1F5F9; }

        /* Error message */
        .p-error {
          display: flex; align-items: flex-start; gap: 9px;
          padding: 11px 14px;
          border-radius: 10px;
          background: #FEF2F2;
          border: 1px solid #FECACA;
          font-size: 12.5px; color: #991B1B;
          line-height: 1.45;
          margin-bottom: 16px;
        }
        .p-error-icon { flex-shrink: 0; margin-top: 1px; }

        /* Submit button */
        .p-btn {
          width: 100%;
          padding: 13px 20px;
          border-radius: 10px;
          border: none;
          font-size: 13.5px; font-weight: 700;
          color: white; cursor: pointer;
          letter-spacing: 0.06em;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: linear-gradient(135deg, #07111C 0%, #0D1B2A 40%, #1A2F45 100%);
          box-shadow: 0 2px 8px rgba(7,17,28,0.3), 0 1px 2px rgba(7,17,28,0.2);
          transition: box-shadow 0.15s, transform 0.1s, opacity 0.15s;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
          margin-top: 4px;
        }
        .p-btn:not(:disabled):hover {
          box-shadow: 0 4px 16px rgba(7,17,28,0.4), 0 2px 4px rgba(7,17,28,0.25);
        }
        .p-btn:not(:disabled):active { transform: scale(0.985); }
        .p-btn:disabled { opacity: 0.55; cursor: not-allowed; }

        /* Spinner inside button */
        .p-spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.75s linear infinite;
          flex-shrink: 0;
        }

        /* Divider */
        .p-divider {
          display: flex; align-items: center; gap: 12px;
          margin: 20px 0 16px;
        }
        .p-divider-line { flex: 1; height: 1px; background: #F1F5F9; }
        .p-divider-text { font-size: 10px; color: #CBD5E1; font-weight: 600; letter-spacing: 0.05em; white-space: nowrap; }

        /* Security badges */
        .p-badges {
          display: flex; justify-content: center; gap: 0;
          border: 1px solid #F1F5F9; border-radius: 10px;
          overflow: hidden;
        }
        .p-badge {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; gap: 3px;
          padding: 10px 8px;
          border-right: 1px solid #F1F5F9;
          background: #FAFBFC;
        }
        .p-badge:last-child { border-right: none; }
        .p-badge-label { font-size: 9px; color: #94A3B8; font-weight: 700; letter-spacing: 0.04em; text-align: center; }

        /* Help footer */
        .p-card-foot {
          padding: 14px 28px 16px;
          border-top: 1px solid #F8FAFC;
          background: #FAFBFC;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          font-size: 11.5px; color: #94A3B8;
        }
        .p-card-foot a { color: #0D1B2A; font-weight: 700; text-decoration: none; }
        .p-card-foot a:hover { text-decoration: underline; }

        /* Copyright below card */
        .p-copy {
          margin-top: 20px;
          font-size: 10px; color: #94A3B8;
          text-align: center; letter-spacing: 0.03em;
        }

        /* ══════════════════════════════════════════════════════
           RESPONSIVE — Mobile (< 768px)
        ══════════════════════════════════════════════════════ */
        @media (max-width: 768px) {
          .p-wrap {
            flex-direction: column;
            background: #07111C;
          }
          .p-left { display: none; }
          .p-right {
            background: #07111C;
            justify-content: flex-start;
            padding: 40px 20px 40px;
            min-height: 100vh;
          }
          .p-right::before { display: none; }
          .p-mobile-logo { display: flex; }
          .p-mobile-logo-icon { background: rgba(201,168,76,0.12); border: 1px solid rgba(201,168,76,0.3); }
          .p-mobile-logo-name { color: white; }
          .p-card {
            box-shadow: 0 4px 40px rgba(0,0,0,0.6);
            border-color: rgba(255,255,255,0.08);
          }
          .p-copy { color: rgba(255,255,255,0.25); }
        }

        @media (max-width: 420px) {
          .p-card-head { padding: 22px 22px 18px; }
          .p-form-body { padding: 20px 22px 18px; }
          .p-card-foot { padding: 12px 22px 14px; }
        }
      `}</style>

      <div className="p-wrap">

        {/* ── LEFT PANEL ─────────────────────────────────── */}
        <div className="p-left">
          <div className="p-glow" />

          {/* Giant waveform watermark */}
          <div className="p-watermark">
            <svg width="420" height="260" viewBox="0 0 16 16" fill="none">
              <path d="M2 8h4l2-6 2 12 2-6h2" stroke="white" strokeWidth="0.35"
                strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <div className="p-left-line" />

          <div className="p-left-body">
            {/* Logo */}
            <div className="p-logo">
              <div className="p-logo-icon">
                <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8h4l2-6 2 12 2-6h2" stroke="#C9A84C"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div className="p-logo-name">SPECTRA</div>
                <div className="p-logo-sub">Banking Group</div>
              </div>
            </div>

            {/* Main tagline */}
            <div className="p-tagline">
              <div className="p-tagline-main">
                Your finances,<br/>
                <span className="p-tagline-gold">always in sight.</span>
              </div>
              <div className="p-tagline-sub">
                Secure access to your accounts, credit facilities,
                and financial documents — all in one place.
              </div>
            </div>

            {/* Features */}
            <div className="p-features">
              {[
                'Real-time account overview & balances',
                'Credit facility status & repayment history',
                'Document centre — statements & reports',
              ].map(text => (
                <div key={text} className="p-feature">
                  <div className="p-feature-dot" />
                  <div className="p-feature-text">{text}</div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-left-foot">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1.5" y="5" width="9" height="6" rx="1" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2"/>
                <path d="M3.5 5V3.5a2.5 2.5 0 0 1 5 0V5" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              <span className="p-left-foot-text">256-bit TLS encryption</span>
              <div className="p-left-foot-dot" />
              <span className="p-left-foot-text">Regulated portal</span>
              <div className="p-left-foot-dot" />
              <span className="p-left-foot-text">Data protected</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────── */}
        <div className="p-right">
          <div className="p-form-outer">

            {/* Mobile logo */}
            <div className="p-mobile-logo">
              <div className="p-mobile-logo-icon">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8h4l2-6 2 12 2-6h2" stroke="#C9A84C"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="p-mobile-logo-name">SPECTRA</div>
            </div>

            <div className="p-card">

              {/* Card header */}
              <div className="p-card-head">
                <div className="p-portal-badge">
                  <div className="p-portal-badge-dot" />
                  Client Portal
                </div>
                <div className="p-card-title">Welcome back</div>
                <div className="p-card-sub">
                  Sign in to access your accounts and statements
                </div>
              </div>

              {/* Form */}
              <div className="p-form-body">
                <form onSubmit={handleSubmit} noValidate>

                  {/* Account number */}
                  <div className="p-field">
                    <label className="p-label" htmlFor="p-account">Account Number</label>
                    <div className="p-input-wrap">
                      <div className="p-input-icon">
                        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                          <rect x="1" y="3.5" width="13" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M1 6.5h13" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M3.5 9.5h4M10 9.5h1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <input
                        id="p-account"
                        className="p-input p-input-mono"
                        type="text"
                        inputMode="numeric"
                        autoComplete="username"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="e.g. 1000012345"
                        value={accountId}
                        onChange={e => setAccountId(e.target.value)}
                        onFocus={() => setFocused('account')}
                        onBlur={() => setFocused(null)}
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="p-field" style={{ marginBottom: '20px' }}>
                    <label className="p-label" htmlFor="p-password">Password</label>
                    <div className="p-input-wrap">
                      <div className="p-input-icon">
                        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                          <rect x="2.5" y="6.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                          <path d="M4.5 6.5v-2a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          <circle cx="7.5" cy="10" r="1" fill="currentColor"/>
                        </svg>
                      </div>
                      <input
                        id="p-password"
                        className="p-input"
                        style={{ paddingRight: '44px' }}
                        type={showPw ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onFocus={() => setFocused('password')}
                        onBlur={() => setFocused(null)}
                        required
                      />
                      <button
                        type="button"
                        className="p-pw-btn"
                        aria-label={showPw ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPw(v => !v)}
                        tabIndex={-1}
                      >
                        {showPw ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="p-error" role="alert">
                      <svg className="p-error-icon" width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="7" r="6" stroke="#EF4444" strokeWidth="1.5"/>
                        <path d="M7 4v3M7 9.5h.01" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      {error}
                    </div>
                  )}

                  {/* Submit */}
                  <button type="submit" className="p-btn" disabled={loading}>
                    {loading ? (
                      <>
                        <span className="p-spinner" />
                        Authenticating…
                      </>
                    ) : (
                      <>
                        Access Portal
                        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                          <path d="M3 7.5h9M8.5 4l3.5 3.5L8.5 11"
                            stroke="currentColor" strokeWidth="1.5"
                            strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </>
                    )}
                  </button>
                </form>

                {/* Security badges */}
                <div className="p-divider">
                  <div className="p-divider-line"/>
                  <div className="p-divider-text">Secured by</div>
                  <div className="p-divider-line"/>
                </div>
                <div className="p-badges">
                  {[
                    { icon: (
                      <svg width="16" height="16" viewBox="0 0 15 15" fill="none">
                        <path d="M7.5 1L2 3.5v4.5C2 11 4.5 13.5 7.5 14c3-0.5 5.5-3 5.5-6V3.5L7.5 1z"
                          stroke="#10B981" strokeWidth="1.2" strokeLinejoin="round"/>
                        <path d="M5 7.5l2 2 3-3" stroke="#10B981" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ), label: '256-bit SSL' },
                    { icon: (
                      <svg width="16" height="16" viewBox="0 0 15 15" fill="none">
                        <rect x="2.5" y="6.5" width="10" height="7" rx="1.5" stroke="#3B82F6" strokeWidth="1.2"/>
                        <path d="M4.5 6.5v-2a3 3 0 0 1 6 0v2" stroke="#3B82F6" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                    ), label: 'Secure Session' },
                    { icon: (
                      <svg width="16" height="16" viewBox="0 0 15 15" fill="none">
                        <path d="M7.5 1.5L2 4v4c0 3.5 2.5 5.5 5.5 6 3-0.5 5.5-2.5 5.5-6V4L7.5 1.5z"
                          stroke="#C9A84C" strokeWidth="1.2" strokeLinejoin="round"/>
                      </svg>
                    ), label: 'Bank Grade' },
                  ].map(b => (
                    <div key={b.label} className="p-badge">
                      {b.icon}
                      <span className="p-badge-label">{b.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card footer */}
              <div className="p-card-foot">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="#94A3B8" strokeWidth="1.1"/>
                  <path d="M6 4v3M6 8.5h.01" stroke="#94A3B8" strokeWidth="1.1" strokeLinecap="round"/>
                </svg>
                Need help? Call{' '}
                <a href="tel:+38338000000">+383 38 000-000</a>
                {' '}· Mon–Fri 9:00–17:00
              </div>

            </div>{/* /card */}

            <div className="p-copy">
              © 2025 SPECTRA Banking Group · Secure Client Portal
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
