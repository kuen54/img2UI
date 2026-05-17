import { NextRequest } from 'next/server'
import { getPipelineRun } from '@/lib/elements'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const run = await getPipelineRun(id)
    if (!run) return jsonResponse({ error: 'not found' }, { status: 404 })
    return jsonResponse(run)
  } catch (err) {
    return errorToResponse(err)
  }
}
