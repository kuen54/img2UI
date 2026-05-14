'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Folder, Settings, Image as ImageIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

const NAV = [
  { href: '/projects', label: '项目', icon: Folder },
  { href: '/settings', label: '设置', icon: Settings },
] as const

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-52 shrink-0 border-r bg-muted/20 flex flex-col">
      <div className="px-4 py-4 border-b flex items-center gap-2">
        <ImageIcon className="size-5" />
        <span className="font-medium">img2UI</span>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                active
                  ? 'bg-foreground/10 font-medium'
                  : 'hover:bg-foreground/5 text-foreground/80',
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
