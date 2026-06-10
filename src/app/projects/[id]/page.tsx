import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getProject } from '@/lib/projects'
import { ProjectDetailClient } from './ProjectDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const project = await getProject(id).catch(() => null)
  return { title: project?.name ?? '项目' }
}

export default async function ProjectDetailPage({ params }: Props): Promise<React.ReactElement> {
  const { id } = await params
  return (
    <Suspense fallback={null}>
      <ProjectDetailClient projectId={id} />
    </Suspense>
  )
}
