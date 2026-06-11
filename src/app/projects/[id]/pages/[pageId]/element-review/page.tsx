import { Suspense } from 'react'
import type { Metadata } from 'next'
import { getPage } from '@/lib/projects'
import { ElementReviewClient } from './ElementReviewClient'

interface Props {
  params: Promise<{ id: string; pageId: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pageId } = await params
  const page = await getPage(pageId).catch(() => null)
  return { title: page ? `元素确认 · ${page.name}` : '元素确认' }
}

export default async function ElementReviewPage({ params }: Props): Promise<React.ReactElement> {
  const { id, pageId } = await params
  return (
    <Suspense fallback={null}>
      <ElementReviewClient projectId={id} pageId={pageId} />
    </Suspense>
  )
}
