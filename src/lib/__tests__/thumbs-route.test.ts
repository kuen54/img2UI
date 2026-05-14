import { describe, it, expect, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

import { DATA_ROOT } from '@/lib/fs-utils'
import { GET } from '@/app/api/thumbs/[id]/route'
import { generateThumbnail } from '@/lib/thumbnails'

afterEach(async () => {
  await fs.rm(DATA_ROOT, { recursive: true, force: true })
})

async function makePng(): Promise<Buffer> {
  return sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer()
}

function mkReq(): NextRequest {
  return new NextRequest('http://localhost/api/thumbs/x')
}

describe('GET /api/thumbs/[id]', () => {
  it('200 + image/png + Cache-Control header for existing thumbnail', async () => {
    const id = 'page_abc123'
    await generateThumbnail(id, await makePng())

    const res = await GET(mkReq(), { params: Promise.resolve({ id }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toMatch(/public.*max-age=86400/)
    const body = Buffer.from(await res.arrayBuffer())
    expect(body.length).toBeGreaterThan(0)
    // PNG magic bytes
    expect(body[0]).toBe(0x89)
    expect(body[1]).toBe(0x50)
  })

  it('404 when thumbnail does not exist', async () => {
    const res = await GET(mkReq(), { params: Promise.resolve({ id: 'page_no_xxx' }) })
    expect(res.status).toBe(404)
  })

  it('400 on path-traversal attempt with slash', async () => {
    const res = await GET(mkReq(), {
      params: Promise.resolve({ id: '../etc/passwd' }),
    })
    expect(res.status).toBe(400)
  })

  it('400 on path-traversal attempt with dotdot', async () => {
    const res = await GET(mkReq(), { params: Promise.resolve({ id: '..' }) })
    expect(res.status).toBe(400)
  })

  it('400 on empty id', async () => {
    const res = await GET(mkReq(), { params: Promise.resolve({ id: '' }) })
    expect(res.status).toBe(400)
  })

  it('400 on id with disallowed characters', async () => {
    const res = await GET(mkReq(), { params: Promise.resolve({ id: 'page_abc!@#' }) })
    expect(res.status).toBe(400)
  })

  it('400 on id longer than 32 chars', async () => {
    const res = await GET(mkReq(), {
      params: Promise.resolve({ id: 'a'.repeat(33) }),
    })
    expect(res.status).toBe(400)
  })

  it('does not read files outside data/thumbs directory', async () => {
    // 写一个文件到 data/raw 但不写到 data/thumbs
    const id = 'page_xyz999'
    await fs.mkdir(path.join(DATA_ROOT, 'raw'), { recursive: true })
    await fs.writeFile(path.join(DATA_ROOT, 'raw', `${id}.png`), await makePng())

    const res = await GET(mkReq(), { params: Promise.resolve({ id }) })
    // 没在 thumbs/ 下,应 404
    expect(res.status).toBe(404)
  })
})
