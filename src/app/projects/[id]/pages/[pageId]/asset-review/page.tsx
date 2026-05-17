import { Suspense } from 'react'
import { AssetReviewClient } from './AssetReviewClient'

interface Props {
  params: Promise<{ id: string; pageId: string }>
}

export const dynamic = 'force-dynamic'

export default async function AssetReviewPage({ params }: Props): Promise<React.ReactElement> {
  const { id, pageId } = await params
  return (
    <Suspense fallback={null}>
      <AssetReviewClient projectId={id} pageId={pageId} />
    </Suspense>
  )
}
