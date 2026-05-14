// CDN provider:S3 PutObject 上传 + HeadBucket 测试连通性
// 凭据约定:`api_key` 字段存 `ACCESS_KEY_ID:SECRET_ACCESS_KEY`(冒号分隔)
// 这样 mask/unmask 复用同一套字符串变换,不为 cdn 引入特殊路径

import { S3Client, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3'

import type { ProviderConfig } from '@/lib/types'
import type { PingResult } from '@/lib/llm-client'

export async function pingCdn(provider: ProviderConfig): Promise<PingResult> {
  if (provider.kind !== 'cdn') {
    return { ok: false, error: `provider kind 不是 cdn: ${provider.kind}` }
  }
  if (!provider.bucket) return { ok: false, error: 'bucket 未填' }
  if (!provider.region) return { ok: false, error: 'region 未填' }
  if (!provider.api_key) return { ok: false, error: 'api_key(凭据)未填' }

  let creds: { id: string; secret: string }
  try {
    creds = parseAccessKey(provider.api_key)
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }

  const t0 = Date.now()
  try {
    const client = makeS3Client(provider, creds)
    await client.send(new HeadBucketCommand({ Bucket: provider.bucket }))
    return { ok: true, latency_ms: Date.now() - t0 }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export function parseAccessKey(raw: string): { id: string; secret: string } {
  const idx = raw.indexOf(':')
  if (idx < 0) {
    throw new Error('CDN 凭据格式错:应为 "ACCESS_KEY_ID:SECRET_ACCESS_KEY"')
  }
  return { id: raw.slice(0, idx), secret: raw.slice(idx + 1) }
}

// =============================================================================
// 上传 — Phase 6
// =============================================================================

export function buildAssetKey(projectId: string, pageId: string, assetId: string): string {
  return `${projectId}/${pageId}/${assetId}.png`
}

export function buildCdnUrl(provider: ProviderConfig, key: string): string {
  // public_url_prefix 可能带 / 也可能不带;用 URL 拼接最稳但 prefix 不一定是绝对 URL
  // 简单 normalize:trim 末尾 /,加单一 /,前 + key
  const prefix = (provider.public_url_prefix ?? '').replace(/\/+$/, '')
  if (prefix) return `${prefix}/${key}`
  // fallback:base_url 自定义 endpoint(MinIO 等);否则 AWS 默认 virtual-hosted style
  if (provider.base_url) {
    const base = provider.base_url.replace(/\/+$/, '')
    return `${base}/${provider.bucket}/${key}`
  }
  return `https://${provider.bucket}.s3.${provider.region}.amazonaws.com/${key}`
}

export type UploadAssetOpts = {
  body: Buffer
  projectId: string
  pageId: string
  assetId: string
  contentType?: string
}

export async function uploadAsset(
  provider: ProviderConfig,
  opts: UploadAssetOpts,
): Promise<{ cdn_url: string }> {
  if (provider.kind !== 'cdn') {
    throw new Error(`provider kind 不是 cdn: ${provider.kind}`)
  }
  if (!provider.bucket) throw new Error('bucket 未填')
  if (!provider.region) throw new Error('region 未填')
  if (!provider.api_key) throw new Error('api_key(凭据)未填')

  const creds = parseAccessKey(provider.api_key)
  const client = makeS3Client(provider, creds)
  const key = buildAssetKey(opts.projectId, opts.pageId, opts.assetId)
  await client.send(
    new PutObjectCommand({
      Bucket: provider.bucket,
      Key: key,
      Body: opts.body,
      ContentType: opts.contentType ?? 'image/png',
    }),
  )
  return { cdn_url: buildCdnUrl(provider, key) }
}

export type BatchUploadItem = {
  assetId: string
  body: Buffer
}

export type BatchUploadResult = {
  uploaded: { id: string; cdn_url: string }[]
  failed: { id: string; error: string }[]
}

export async function uploadAssetsBatch(
  provider: ProviderConfig,
  projectId: string,
  pageId: string,
  items: BatchUploadItem[],
): Promise<BatchUploadResult> {
  const uploaded: { id: string; cdn_url: string }[] = []
  const failed: { id: string; error: string }[] = []
  for (const item of items) {
    try {
      const { cdn_url } = await uploadAsset(provider, {
        body: item.body,
        projectId,
        pageId,
        assetId: item.assetId,
      })
      uploaded.push({ id: item.assetId, cdn_url })
    } catch (e) {
      failed.push({ id: item.assetId, error: (e as Error).message })
    }
  }
  return { uploaded, failed }
}

function makeS3Client(provider: ProviderConfig, creds: { id: string; secret: string }): S3Client {
  return new S3Client({
    region: provider.region!,
    // 自定义 endpoint(MinIO / 七牛兼容 S3 等);exactOptionalPropertyTypes 下不能传 undefined
    ...(provider.base_url ? { endpoint: provider.base_url } : {}),
    credentials: {
      accessKeyId: creds.id,
      secretAccessKey: creds.secret,
    },
    forcePathStyle: !!provider.base_url,
  })
}
