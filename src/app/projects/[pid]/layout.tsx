import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { getProject } from '@/lib/projects'

type LayoutProps = {
  children: React.ReactNode
  params: Promise<{ pid: string }>
}

export default async function ProjectLayout({ children, params }: LayoutProps) {
  const { pid } = await params
  const project = await getProject(pid)
  if (!project) notFound()

  return (
    <div className="flex flex-col h-full">
      <nav className="border-b px-6 py-3 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground transition-colors">项目</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">{project.name}</span>
      </nav>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
