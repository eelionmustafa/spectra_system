'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export default function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // KPIs only change when the ML pipeline runs (nightly) — 5 min is safe
            staleTime: 5 * 60_000,
            gcTime:    10 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
          },
        },
      })
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
