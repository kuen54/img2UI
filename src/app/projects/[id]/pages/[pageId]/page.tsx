import { Suspense } from 'react'
import { PageDetailClient } from './PageDetailClient'

interface Props {
  params: Promise<{ id: string; pageId: string }>
}

export const dynamic = 'force-dynamic'

export default async function PageDetailPage({ params }: Props): Promise<React.ReactElement> {
  const { id, pageId } = await params
  return (
    <Suspense fallback={null}>
      <PageDetailClient projectId={id} pageId={pageId} />
    </Suspense>
  )
}
