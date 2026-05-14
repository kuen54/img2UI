import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callImageGen } from '@/lib/llm-client'
import type { ProviderConfig } from '@/lib/types'

const PROVIDER: ProviderConfig = {
  id: 'p',
  name: 'apimart',
  kind: 'image_gen',
  api_format: 'apimart',
  is_async: true,
  base_url: 'https://api.apimart.ai/v1',
  api_key: 'k',
  model: 'gpt-image-2-official',
  active: true,
  default_quality: 'high',
} as never

describe('callImageGen multi-ref', () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('puts main + extra refs into image_urls array in order', async () => {
    let capturedBody: { image_urls?: string[] } | null = null
    vi.mocked(global.fetch).mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string) as typeof capturedBody
      return new Response(JSON.stringify({ code: 200, data: [{ task_id: 't1' }] }), { status: 200 })
    })
    callImageGen(PROVIDER, {
      prompt: 'p',
      reference_image_base64: 'data:image/png;base64,MAIN',
      reference_image_base64s: ['data:image/png;base64,REF1', 'data:image/png;base64,REF2'],
      size: '1:1',
      resolution: '1k',
      quality: 'high',
      n: 1,
    }).catch(() => null)
    await new Promise((r) => setTimeout(r, 50))

    expect(capturedBody?.image_urls).toEqual([
      'data:image/png;base64,MAIN',
      'data:image/png;base64,REF1',
      'data:image/png;base64,REF2',
    ])
  })

  it('falls back to single image when only reference_image_base64 provided', async () => {
    let capturedBody: { image_urls?: string[] } | null = null
    vi.mocked(global.fetch).mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string) as typeof capturedBody
      return new Response(JSON.stringify({ code: 200, data: [{ task_id: 't' }] }), { status: 200 })
    })
    callImageGen(PROVIDER, {
      prompt: 'p',
      reference_image_base64: 'data:image/png;base64,SOLO',
      size: '1:1',
      resolution: '1k',
      quality: 'high',
      n: 1,
    }).catch(() => null)
    await new Promise((r) => setTimeout(r, 50))
    expect(capturedBody?.image_urls).toEqual(['data:image/png;base64,SOLO'])
  })

  it('omits image_urls when no reference image given', async () => {
    let capturedBody: { image_urls?: string[] } | null = null
    vi.mocked(global.fetch).mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string) as typeof capturedBody
      return new Response(JSON.stringify({ code: 200, data: [{ task_id: 't' }] }), { status: 200 })
    })
    callImageGen(PROVIDER, {
      prompt: 'p',
      size: '1:1',
      resolution: '1k',
      quality: 'high',
      n: 1,
    }).catch(() => null)
    await new Promise((r) => setTimeout(r, 50))
    expect(capturedBody?.image_urls).toBeUndefined()
  })
})
