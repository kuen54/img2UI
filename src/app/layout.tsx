import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter'
import { ClientProviders } from '@/components/ClientProviders'

export const metadata: Metadata = {
  title: { default: 'img2UI', template: '%s · img2UI' },
  description:
    'AI 生图设计稿 → 静态素材 + layout 描述,喂给 coding agent',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="zh-CN" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <AppRouterCacheProvider>
          <ClientProviders>{children}</ClientProviders>
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
