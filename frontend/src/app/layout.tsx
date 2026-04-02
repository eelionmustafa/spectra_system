import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import { cookies, headers } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { validateEnv } from '@/lib/validateEnv'
import ReactQueryProvider from '@/lib/queryClient'

validateEnv()

export const metadata: Metadata = {
  title: 'SPECTRA',
  description: 'Portfolio monitoring and risk trend discovery',
  icons: { icon: '/image.png', apple: '/image.png' },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList  = await headers()
  const pathname     = headersList.get('x-pathname') ?? ''
  const isPortal     = pathname.startsWith('/portal')

  // Portal routes always render without the SPECTRA sidebar
  if (isPortal) {
    return (
      <html lang="en">
        <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
        <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
          <ReactQueryProvider>{children}</ReactQueryProvider>
        </body>
      </html>
    )
  }

  const cookieStore = await cookies()
  const token = cookieStore.get('spectra_session')?.value

  let session = null
  if (token) {
    try { session = await verifyToken(token) } catch { /* expired / invalid */ }
  }

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="icon" href="/image.png" type="image/png" />
        <link rel="apple-touch-icon" href="/image.png" />
      </head>
      <body>
        <ReactQueryProvider>
          {session ? (
            <div className="wrap">
              <Sidebar session={session} />
              <div className="main">{children}</div>
            </div>
          ) : (
            children
          )}
        </ReactQueryProvider>
      </body>
    </html>
  )
}
