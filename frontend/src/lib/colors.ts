export function stageBadge(stage: string | null | undefined): string {
  if (stage === 'Stage 1') return 'bg'
  if (stage === 'Stage 2') return 'ba'
  return 'br'
}

export function stageColor(stage: string | null | undefined): string {
  if (stage === 'Stage 1') return 'var(--green)'
  if (stage === 'Stage 2') return 'var(--amber)'
  return 'var(--red)'
}

export function dpdColor(days: number): string {
  if (days >= 90) return 'var(--red)'
  if (days >= 30) return 'var(--amber)'
  if (days > 0)   return 'var(--amber)'
  return 'var(--green)'
}

export function pdColor(pd: number): string {
  if (pd > 0.3)  return 'var(--red)'
  if (pd > 0.1)  return 'var(--amber)'
  return 'var(--green)'
}
