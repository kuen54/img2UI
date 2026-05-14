import { NextRequest, NextResponse } from 'next/server'

import { getProject, updateProject, deleteProject } from '@/lib/projects'
import { listPagesByProject, deletePagesByProject } from '@/lib/pages'
import { listStatesByPage, deleteStatesByPage } from '@/lib/states'
import { deleteElementsForPage } from '@/lib/elements'
import type { Project } from '@/lib/types'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const project = await getProject(id)
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(project)
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const patch = (await req.json().catch(() => null)) as Partial<Project> | null
  if (!patch) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  const updated = await updateProject(id, patch)
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(updated)
}

// 级联删除:project → 全部 pages → 全部 states + raw PNG + elements
export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const pages = await listPagesByProject(id)
  for (const page of pages) {
    const states = await listStatesByPage(page.id)
    if (states.length > 0) await deleteStatesByPage(page.id)
    await deleteElementsForPage(page.id)
  }
  await deletePagesByProject(id)
  await deleteProject(id)
  return new NextResponse(null, { status: 204 })
}
