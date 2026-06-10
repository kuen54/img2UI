import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter'
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript'
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
    // suppressHydrationWarning:InitColorSchemeScript 在首帧前往 <html> 写
    // data-mui-color-scheme,服务端渲染的属性和客户端必然不一致,是预期行为
    <html
      lang="zh-CN"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <InitColorSchemeScript attribute="data" defaultMode="system" />
        <AppRouterCacheProvider>
          <ClientProviders>{children}</ClientProviders>
        </AppRouterCacheProvider>
      </body>
    </html>
  )
}
