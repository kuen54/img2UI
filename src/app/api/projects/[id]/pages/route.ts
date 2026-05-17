import { NextRequest } from 'next/server'
import {
  createPage,
  listPagesByProject,
  listStatesByPage,
  getProject,
} from '@/lib/projects'
import { getPageStats } from '@/lib/page-stats'
import { errorToResponse, jsonResponse } from '@/lib/api-response'
import { isValidId } from '@/lib/id'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const pages = await listPagesByProject(id)
    const enriched = await Promise.all(
      pages.map(async (p) => {
        let thumbnail_url: string | undefined
        let canonicalStateId: string | null = null
        if (p.canonical_state_id) {
          thumbnail_url = `/api/thumbs/${p.canonical_state_id}`
          canonicalStateId = p.canonical_state_id
        } else {
          const states = await listStatesByPage(p.id)
          const s = states[0]
          if (s) {
            thumbnail_url = `/api/thumbs/${s.id}`
            canonicalStateId = s.id
          }
        }
        const stats = await getPageStats(p.id, canonicalStateId)
        return {
          ...p,
          ...(thumbnail_url ? { thumbnail_url } : {}),
          has_state: !!p.canonical_state_id || canonicalStateId !== null,
          stats,
        }
      }),
    )
    return jsonResponse(enriched)
  } catch (err) {
    return errorToResponse(err)
  }
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params
    if (!isValidId(id)) return jsonResponse({ error: 'invalid id' }, { status: 400 })
    const project = await getProject(id)
    if (!project) return jsonResponse({ error: 'project not found' }, { status: 404 })

    const body = (await req.json()) as { name: string; route_hint?: string }
    if (!body.name?.trim()) {
      return jsonResponse({ error: 'name required' }, { status: 400 })
    }
    const page = await createPage({
      project_id: id,
      name: body.name.trim(),
      ...(body.route_hint ? { route_hint: body.route_hint } : {}),
    })
    return jsonResponse(page, { status: 201 })
  } catch (err) {
    return errorToResponse(err)
  }
}
