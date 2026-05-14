import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callImageGen } from '@/lib/llm-client'
import { defaultProviders } from '@/lib/seeds/default-providers'
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
    type Body = { image_urls?: string[] }
    let capturedBody: Body | null = null
    vi.mocked(global.fetch).mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string) as Body
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

    expect((capturedBody as Body | null)?.image_urls).toEqual([
      'data:image/png;base64,MAIN',
      'data:image/png;base64,REF1',
      'data:image/png;base64,REF2',
    ])
  })

  it('falls back to single image when only reference_image_base64 provided', async () => {
    type Body = { image_urls?: string[] }
    let capturedBody: Body | null = null
    vi.mocked(global.fetch).mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string) as Body
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
    expect((capturedBody as Body | null)?.image_urls).toEqual(['data:image/png;base64,SOLO'])
  })

  it('omits image_urls when no reference image given', async () => {
    type Body = { image_urls?: string[] }
    let capturedBody: Body | null = null
    vi.mocked(global.fetch).mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse((init as RequestInit).body as string) as Body
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
    expect((capturedBody as Body | null)?.image_urls).toBeUndefined()
  })

  it('Phase 8f BUG #2: defaults poll_max_attempts to 60 in apimart seed', () => {
    // 此前默认 24,实测 image_gen 单次 ~150-220s+,4 路并发拥挤 → 改 60(5 分钟兜底)
    const seeds = defaultProviders()
    const apimart = seeds.find((p) => p.api_format === 'apimart' && p.kind === 'image_gen')
    expect(apimart).toBeDefined()
    expect(apimart!.poll_max_attempts).toBe(60)
  })

  it('Phase 8f BUG #2: callImageGen honors provider.poll_max_attempts', async () => {
    const providerWith3 = {
      ...PROVIDER,
      poll_interval_seconds: 0,
      poll_initial_delay_seconds: 0,
      poll_max_attempts: 3,
    } as ProviderConfig

    let pollCount = 0
    vi.mocked(global.fetch).mockImplementation(async (url) => {
      const u = String(url)
      if (u.includes('/tasks/')) {
        pollCount++
        return new Response(
          JSON.stringify({ code: 200, data: { status: 'pending' } }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ code: 200, data: [{ task_id: 't1' }] }), { status: 200 })
    })

    await expect(
      callImageGen(providerWith3, {
        prompt: 'p',
        reference_image_base64: 'data:image/png;base64,M',
        size: '1:1',
        resolution: '1k',
        quality: 'high',
        n: 1,
      }),
    ).rejects.toThrow(/超时|timeout/i)
    expect(pollCount).toBe(3)
  }, 10_000)
})
