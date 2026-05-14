import { NextRequest, NextResponse } from 'next/server'

import { getProject } from '@/lib/projects'
import { listPagesByProject, createPage } from '@/lib/pages'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const project = await getProject(id)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })
  const pages = await listPagesByProject(id)
  return NextResponse.json(pages)
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { id: projectId } = await ctx.params
  const project = await getProject(projectId)
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as
    | { name?: string; route_hint?: string }
    | null
  if (!body || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name 必填' }, { status: 400 })
  }

  const page = await createPage({
    project_id: projectId,
    name: body.name.trim(),
    ...(body.route_hint !== undefined && { route_hint: body.route_hint }),
  })
  return NextResponse.json(page, { status: 201 })
}
