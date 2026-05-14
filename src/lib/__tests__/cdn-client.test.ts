import { describe, it, expect, beforeEach } from 'vitest'
import { mockClient } from 'aws-sdk-client-mock'
import { S3Client, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3'

import {
  buildAssetKey,
  buildCdnUrl,
  parseAccessKey,
  pingCdn,
  uploadAsset,
  uploadAssetsBatch,
} from '@/lib/cdn-client'
import type { ProviderConfig } from '@/lib/types'

const s3Mock = mockClient(S3Client)

function makeCdnProvider(overrides?: Partial<ProviderConfig>): ProviderConfig {
  return {
    id: 'prv_test01',
    kind: 'cdn',
    name: 'test-cdn',
    api_format: 's3',
    base_url: '',
    api_key: 'AKIAFAKE:secretFakeValue',
    bucket: 'my-bucket',
    region: 'us-east-1',
    public_url_prefix: 'https://cdn.example.com/img2ui/',
    active: true,
    created_at: '2026-05-14T00:00:00Z',
    updated_at: '2026-05-14T00:00:00Z',
    ...overrides,
  }
}

describe('parseAccessKey', () => {
  it('拆分 ACCESS_KEY_ID:SECRET on first colon', () => {
    expect(parseAccessKey('AKIA123:secret/with:colons')).toEqual({
      id: 'AKIA123',
      secret: 'secret/with:colons',
    })
  })

  it('无冒号抛错', () => {
    expect(() => parseAccessKey('no-colon')).toThrow(/格式错/)
  })

  it('空 secret', () => {
    expect(parseAccessKey('id:')).toEqual({ id: 'id', secret: '' })
  })
})

describe('buildAssetKey', () => {
  it('拼出 project/page/asset.png', () => {
    expect(buildAssetKey('proj_abc', 'page_xyz', 'el_q')).toBe('proj_abc/page_xyz/el_q.png')
  })
})

describe('buildCdnUrl', () => {
  it('public_url_prefix 带尾部斜杠 → 单一 /', () => {
    const p = makeCdnProvider({ public_url_prefix: 'https://cdn.example.com/img2ui/' })
    expect(buildCdnUrl(p, 'foo/bar.png')).toBe('https://cdn.example.com/img2ui/foo/bar.png')
  })

  it('public_url_prefix 不带尾部斜杠', () => {
    const p = makeCdnProvider({ public_url_prefix: 'https://cdn.example.com/img2ui' })
    expect(buildCdnUrl(p, 'foo/bar.png')).toBe('https://cdn.example.com/img2ui/foo/bar.png')
  })

  it('public_url_prefix 缺失 + base_url 存在 → bucket 通过 custom endpoint', () => {
    const p = makeCdnProvider({
      public_url_prefix: '',
      base_url: 'https://minio.local:9000',
    })
    expect(buildCdnUrl(p, 'foo/bar.png')).toBe('https://minio.local:9000/my-bucket/foo/bar.png')
  })

  it('public_url_prefix 与 base_url 都缺 → AWS 默认形态', () => {
    const p = makeCdnProvider({ public_url_prefix: '', base_url: '' })
    expect(buildCdnUrl(p, 'foo/bar.png')).toBe(
      'https://my-bucket.s3.us-east-1.amazonaws.com/foo/bar.png',
    )
  })
})

describe('pingCdn', () => {
  beforeEach(() => s3Mock.reset())

  it('HeadBucket 成功 → ok=true + latency_ms', async () => {
    s3Mock.on(HeadBucketCommand).resolves({})
    const result = await pingCdn(makeCdnProvider())
    expect(result.ok).toBe(true)
    if (result.ok) expect(typeof result.latency_ms).toBe('number')
  })

  it('HeadBucket 失败 → ok=false + error', async () => {
    s3Mock.on(HeadBucketCommand).rejects(new Error('NotFound'))
    const result = await pingCdn(makeCdnProvider())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/NotFound/)
  })

  it('bucket 缺失 → ok=false', async () => {
    const result = await pingCdn(makeCdnProvider({ bucket: '' }))
    expect(result.ok).toBe(false)
  })
})

describe('uploadAsset', () => {
  beforeEach(() => s3Mock.reset())

  it('PutObject 调用,Bucket/Key/Body/ContentType 正确,返回 cdn_url', async () => {
    s3Mock.on(PutObjectCommand).resolves({})
    const body = Buffer.from('fake-png-bytes')
    const result = await uploadAsset(makeCdnProvider(), {
      body,
      projectId: 'proj_abc',
      pageId: 'page_xyz',
      assetId: 'el_q',
    })
    expect(result.cdn_url).toBe('https://cdn.example.com/img2ui/proj_abc/page_xyz/el_q.png')

    const calls = s3Mock.commandCalls(PutObjectCommand)
    expect(calls).toHaveLength(1)
    const input = calls[0]!.args[0].input
    expect(input.Bucket).toBe('my-bucket')
    expect(input.Key).toBe('proj_abc/page_xyz/el_q.png')
    expect(input.Body).toBe(body)
    expect(input.ContentType).toBe('image/png')
  })

  it('PutObject 抛错往上抛', async () => {
    s3Mock.on(PutObjectCommand).rejects(new Error('AccessDenied'))
    await expect(
      uploadAsset(makeCdnProvider(), {
        body: Buffer.from('x'),
        projectId: 'p',
        pageId: 'pg',
        assetId: 'a',
      }),
    ).rejects.toThrow(/AccessDenied/)
  })

  it('非 cdn provider → 抛错', async () => {
    const p = makeCdnProvider({ kind: 'mllm' })
    await expect(
      uploadAsset(p, { body: Buffer.from('x'), projectId: 'p', pageId: 'pg', assetId: 'a' }),
    ).rejects.toThrow(/kind 不是 cdn/)
  })
})

describe('uploadAssetsBatch', () => {
  beforeEach(() => s3Mock.reset())

  it('全部成功 → uploaded[3] / failed[0]', async () => {
    s3Mock.on(PutObjectCommand).resolves({})
    const result = await uploadAssetsBatch(makeCdnProvider(), 'proj_abc', 'page_xyz', [
      { assetId: 'el_a', body: Buffer.from('1') },
      { assetId: 'el_b', body: Buffer.from('2') },
      { assetId: 'el_c', body: Buffer.from('3') },
    ])
    expect(result.uploaded).toHaveLength(3)
    expect(result.failed).toHaveLength(0)
    expect(result.uploaded[0]!.cdn_url).toContain('el_a.png')
  })

  it('部分失败 → 不阻断后续', async () => {
    s3Mock
      .on(PutObjectCommand)
      .resolvesOnce({})
      .rejectsOnce(new Error('Quota exceeded'))
      .resolvesOnce({})
    const result = await uploadAssetsBatch(makeCdnProvider(), 'proj_abc', 'page_xyz', [
      { assetId: 'el_a', body: Buffer.from('1') },
      { assetId: 'el_b', body: Buffer.from('2') },
      { assetId: 'el_c', body: Buffer.from('3') },
    ])
    expect(result.uploaded.map((u) => u.id)).toEqual(['el_a', 'el_c'])
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0]!.id).toBe('el_b')
    expect(result.failed[0]!.error).toMatch(/Quota/)
  })
})
