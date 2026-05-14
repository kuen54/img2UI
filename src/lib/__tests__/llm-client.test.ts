import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { pingMllm, pingImageGen } from '../llm-client'
import type { ProviderConfig } from '../types'

type FetchCall = [url: string, init: RequestInit]
const callOf = (mock: { mock: { calls: unknown[][] } }, idx: number): FetchCall =>
  mock.mock.calls[idx] as unknown as FetchCall

const baseProvider = (overrides: Partial<ProviderConfig>): ProviderConfig => ({
  id: 'prv_test',
  kind: 'mllm',
  name: 'test',
  api_format: 'openai',
  base_url: 'https://example.com/v1',
  api_key: 'sk-test',
  model: 'test-model',
  active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const okResponse = () =>
  new Response(JSON.stringify({ data: [{ task_id: 'task_test', status: 'submitted' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const errResponse = (status: number, body: string) =>
  new Response(body, { status })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('pingMllm', () => {
  it('openai api_format 用 Bearer 认证 + /chat/completions', async () => {
    const fetchSpy = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchSpy)

    const res = await pingMllm(baseProvider({ api_format: 'openai' }))

    expect(res.ok).toBe(true)
    const [url, init] = callOf(fetchSpy, 0)
    expect(url).toBe('https://example.com/v1/chat/completions')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer sk-test',
    })
  })

  it('sankuai api_format 用 raw token(无 Bearer 前缀)', async () => {
    const fetchSpy = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchSpy)

    const res = await pingMllm(baseProvider({ api_format: 'sankuai' }))

    expect(res.ok).toBe(true)
    const [, init] = callOf(fetchSpy, 0)
    expect(init.headers).toMatchObject({
      Authorization: 'sk-test',
    })
  })

  it('anthropic api_format 用 x-api-key + /messages', async () => {
    const fetchSpy = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchSpy)

    const res = await pingMllm(baseProvider({ api_format: 'anthropic' }))

    expect(res.ok).toBe(true)
    const [url, init] = callOf(fetchSpy, 0)
    expect(url).toBe('https://example.com/v1/messages')
    expect(init.headers).toMatchObject({
      'x-api-key': 'sk-test',
      'anthropic-version': '2023-06-01',
    })
  })

  it('返回 4xx 时 ok=false 带状态码', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => errResponse(401, 'Unauthorized')),
    )
    const res = await pingMllm(baseProvider({}))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('401')
  })

  it('api_key 未填时直接 fail,不发请求', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const res = await pingMllm(baseProvider({ api_key: '' }))
    expect(res.ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('不支持的 api_format(s3)直接 fail', async () => {
    const res = await pingMllm(baseProvider({ api_format: 's3' }))
    expect(res.ok).toBe(false)
  })
})

describe('pingImageGen', () => {
  it('apimart submit 模式只校验 task_id(不轮询)', async () => {
    const fetchSpy = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchSpy)

    const res = await pingImageGen(
      baseProvider({
        kind: 'image_gen',
        api_format: 'apimart',
        is_async: true,
        model: 'gpt-image-2-official',
        default_quality: 'high',
      }),
    )

    expect(res.ok).toBe(true)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = callOf(fetchSpy, 0)
    expect(url).toBe('https://example.com/v1/images/generations')
    const body = JSON.parse(init.body as string)
    expect(body.quality).toBe('high')
    expect(body.resolution).toBe('1k')
  })

  it('apimart 返回不含 task_id 时 ok=false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 500, data: [] }), { status: 200 }),
      ),
    )
    const res = await pingImageGen(
      baseProvider({ kind: 'image_gen', api_format: 'apimart', is_async: true }),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('task_id')
  })

  it('openai sync 模式用 generations 端点,256x256', async () => {
    const fetchSpy = vi.fn(async () => okResponse())
    vi.stubGlobal('fetch', fetchSpy)

    const res = await pingImageGen(
      baseProvider({
        kind: 'image_gen',
        api_format: 'openai',
        is_async: false,
        model: 'gpt-image-1',
      }),
    )

    expect(res.ok).toBe(true)
    const [, init] = callOf(fetchSpy, 0)
    const body = JSON.parse(init.body as string)
    expect(body.size).toBe('256x256')
  })
})
