import { NextRequest } from 'next/server'
import {
  createProject,
  listProjects,
  listPagesByProject,
  listStatesByPage,
} from '@/lib/projects'
import { errorToResponse, jsonResponse } from '@/lib/api-response'

export async function GET(): Promise<Response> {
  try {
    const projects = await listProjects()
    // 给列表 Card 用的 sample_thumbnail_url:取该项目第一个 page 的 canonical state 的 thumb
    const enriched = await Promise.all(
      projects.map(async (p) => {
        const pages = await listPagesByProject(p.id)
        const firstPage = pages[0]
        let sample_thumbnail_url: string | undefined
        if (firstPage?.canonical_state_id) {
          sample_thumbnail_url = `/api/thumbs/${firstPage.canonical_state_id}`
        } else if (firstPage) {
          // canonical 没设(state 还没上传):看看是否有任何 state
          const states = await listStatesByPage(firstPage.id)
          const s = states[0]
          if (s) sample_thumbnail_url = `/api/thumbs/${s.id}`
        }
        return { ...p, ...(sample_thumbnail_url ? { sample_thumbnail_url } : {}), pages_count: pages.length }
      }),
    )
    return jsonResponse(enriched)
  } catch (err) {
    return errorToResponse(err)
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json()) as {
      name: string
      description?: string
      tech_stack_hint?: string
      cdn_provider_id?: string
    }
    if (!body.name?.trim()) {
      return jsonResponse({ error: 'name required' }, { status: 400 })
    }
    const project = await createProject({
      name: body.name.trim(),
      ...(body.description ? { description: body.description } : {}),
      ...(body.tech_stack_hint ? { tech_stack_hint: body.tech_stack_hint } : {}),
      ...(body.cdn_provider_id ? { cdn_provider_id: body.cdn_provider_id } : {}),
    })
    return jsonResponse(project, { status: 201 })
  } catch (err) {
    return errorToResponse(err)
  }
}
