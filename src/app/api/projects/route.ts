import { NextRequest, NextResponse } from 'next/server'

import { listProjects, createProject } from '@/lib/projects'
import { listPages } from '@/lib/pages'
import type { Project } from '@/lib/types'

export async function GET() {
  const [projects, pages] = await Promise.all([listProjects(), listPages()])
  // 给每个 project 找一张 thumbnail(优先 created_at 早的)挂到 sample_thumbnail_url
  // pages 已通过 listPages 拿到全量,内存做映射开销可忽略(MVP 无 pagination)
  const sortedPages = [...pages].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const decorated: Project[] = projects.map((proj) => {
    const sample = sortedPages.find((p) => p.project_id === proj.id && p.thumbnail_path)
    if (sample) {
      return { ...proj, sample_thumbnail_url: `/api/thumbs/${sample.id}` }
    }
    return proj
  })
  return NextResponse.json(decorated)
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { name?: string; description?: string; tech_stack_hint?: string; cdn_provider_id?: string }
    | null
  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name 必填' }, { status: 400 })
  }
  const project = await createProject({
    name: body.name.trim(),
    ...(body.description !== undefined && { description: body.description }),
    ...(body.tech_stack_hint !== undefined && { tech_stack_hint: body.tech_stack_hint }),
    ...(body.cdn_provider_id !== undefined && { cdn_provider_id: body.cdn_provider_id }),
  })
  return NextResponse.json(project, { status: 201 })
}
