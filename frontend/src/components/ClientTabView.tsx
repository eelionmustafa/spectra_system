'use client'
import { useState } from 'react'

interface Tab { id: string; label: string; count?: number }
interface Section { id: string; children: React.ReactNode }
interface Props { tabs: Tab[]; sections: Section[] }

export default function ClientTabView({ tabs, sections }: Props) {
  const [active, setActive] = useState(tabs[0]?.id ?? '')
  // Track which tabs have been opened — mount their content once and keep it mounted
  const [mounted, setMounted] = useState<Set<string>>(() => new Set([tabs[0]?.id ?? '']))

  function handleTabClick(id: string) {
    setActive(id)
    setMounted(prev => { const next = new Set(prev); next.add(id); return next })
  }

  return (
    <>
      <div className="tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab${active === t.id ? ' active' : ''}`}
            onClick={() => handleTabClick(t.id)}
          >
            {t.label}
            {t.count != null && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="content">
        {sections.map(s => (
          // Only render content once the tab has been visited; hide inactive tabs without unmounting
          mounted.has(s.id) ? (
            <div key={s.id} style={{
              display: active === s.id ? 'flex' : 'none',
              flexDirection: 'column',
              gap: '12px',
            }}>
              {s.children}
            </div>
          ) : null
        ))}
      </div>
    </>
  )
}
