import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getPage } from '@/lib/projects'
import { AssetReviewClient } from './AssetReviewClient'

interface Props {
  params: Promise<{ id: string; pageId: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pageId } = await params
  const page = await getPage(pageId).catch(() => null)
  return { title: page ? `Asset Review · ${page.name}` : 'Asset Review' }
}

export default async function AssetReviewPage({ params }: Props): Promise<React.ReactElement> {
  const { id, pageId } = await params
  return (
    <Suspense fallback={null}>
      <AssetReviewClient projectId={id} pageId={pageId} />
    </Suspense>
  )
}
