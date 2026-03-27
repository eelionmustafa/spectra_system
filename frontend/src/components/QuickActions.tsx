'use client'
import Link from 'next/link'

interface Action {
  label: string
  href?: string
  onClick?: () => void
}

export default function QuickActions({ actions }: { actions: Action[] }) {
  return (
    <>
      {actions.map((a, i) =>
        a.href ? (
          <Link key={i} href={a.href} className="act-btn">{a.label}</Link>
        ) : (
          <button key={i} className="act-btn" onClick={a.onClick}>{a.label}</button>
        )
      )}
    </>
  )
}
