'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

const TABS = [
  { href: '/settings/models', label: '模型' },
  { href: '/settings/cdn', label: 'CDN' },
  { href: '/settings/prompts', label: 'Prompts' },
] as const

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 pt-6 pb-0">
        <h1 className="text-xl font-semibold mb-4">设置</h1>
        <nav className="flex gap-4 text-sm -mb-px">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                'pb-2 border-b-2 transition-colors',
                pathname.startsWith(t.href)
                  ? 'border-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex-1 overflow-y-auto p-6 pb-24">{children}</div>
    </div>
  )
}
