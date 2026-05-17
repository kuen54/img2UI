import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import { paths } from '@/lib/fs-utils'
import { isValidId } from '@/lib/id'

interface RouteParams {
  params: Promise<{ id: string }>
}

/** 原图 (data/raw/{state-id}.png) — page 详情页展示用 */
export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const { id } = await params
  if (!isValidId(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }
  try {
    const buf = await fs.readFile(paths.raw(id))
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
