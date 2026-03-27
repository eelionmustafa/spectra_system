'use client'
import { useState } from 'react'

interface Tab { id: string; label: string; count?: number }
interface Section { id: string; children: React.ReactNode }
interface Props { tabs: Tab[]; sections: Section[] }

export default function ClientTabView({ tabs, sections }: Props) {
  const [active, setActive] = useState(tabs[0]?.id ?? '')

  return (
    <>
      <div className="tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab${active === t.id ? ' active' : ''}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
            {t.count != null && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="content">
        {sections.map(s => (
          <div key={s.id} style={{
            display: active === s.id ? 'flex' : 'none',
            flexDirection: 'column',
            gap: '12px',
          }}>
            {s.children}
          </div>
        ))}
      </div>
    </>
  )
}
