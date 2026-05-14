import type { Metadata } from 'next'
import { Toaster } from '@/components/ui/sonner'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { Sidebar } from '@/components/sidebar'
import './globals.css'

export const metadata: Metadata = {
  title: 'img2UI',
  description: '把 AI 生图设计稿转成 coding agent 可消费的素材包',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex h-screen overflow-hidden">
        <ConfirmProvider>
          <Sidebar />
          <main className="flex-1 overflow-y-auto">{children}</main>
          <Toaster position="bottom-right" />
        </ConfirmProvider>
      </body>
    </html>
  )
}
