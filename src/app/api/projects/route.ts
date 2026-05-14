import { NextRequest, NextResponse } from 'next/server'

import { listProjects, createProject } from '@/lib/projects'

export async function GET() {
  const projects = await listProjects()
  return NextResponse.json(projects)
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
