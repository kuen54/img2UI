import { Suspense } from 'react'
import { ProjectDetailClient } from './ProjectDetailClient'

interface Props {
  params: Promise<{ id: string }>
}

export const dynamic = 'force-dynamic'

export default async function ProjectDetailPage({ params }: Props): Promise<React.ReactElement> {
  const { id } = await params
  return (
    <Suspense fallback={null}>
      <ProjectDetailClient projectId={id} />
    </Suspense>
  )
}
