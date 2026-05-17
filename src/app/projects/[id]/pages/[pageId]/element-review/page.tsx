import { Suspense } from 'react'
import { ElementReviewClient } from './ElementReviewClient'

interface Props {
  params: Promise<{ id: string; pageId: string }>
}

export const dynamic = 'force-dynamic'

export default async function ElementReviewPage({ params }: Props): Promise<React.ReactElement> {
  const { id, pageId } = await params
  return (
    <Suspense fallback={null}>
      <ElementReviewClient projectId={id} pageId={pageId} />
    </Suspense>
  )
}
