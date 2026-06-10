import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getPage, getProject } from '@/lib/projects'
import { PageDetailClient } from './PageDetailClient'

interface Props {
  params: Promise<{ id: string; pageId: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, pageId } = await params
  const [project, page] = await Promise.all([
    getProject(id).catch(() => null),
    getPage(pageId).catch(() => null),
  ])
  if (!page) return { title: '页面' }
  return { title: project ? `${page.name} · ${project.name}` : page.name }
}

export default async function PageDetailPage({ params }: Props): Promise<React.ReactElement> {
  const { id, pageId } = await params
  return (
    <Suspense fallback={null}>
      <PageDetailClient projectId={id} pageId={pageId} />
    </Suspense>
  )
}
