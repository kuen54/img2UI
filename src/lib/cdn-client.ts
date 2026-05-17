import { S3Client, HeadBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import type { ProviderConfig } from './types'
import { HttpError } from './http'

function makeS3(provider: ProviderConfig): S3Client {
  if (!provider.access_key_id || !provider.api_key) {
    throw new HttpError(401, 'cdn provider missing access_key_id or api_key', false)
  }
  if (!provider.bucket) {
    throw new HttpError(400, 'cdn provider missing bucket', false)
  }
  return new S3Client({
    region: provider.region ?? 'us-east-1',
    ...(provider.base_url ? { endpoint: provider.base_url } : {}),
    credentials: {
      accessKeyId: provider.access_key_id,
      secretAccessKey: provider.api_key,
    },
    forcePathStyle: true,
  })
}

export async function pingCdn(provider: ProviderConfig): Promise<void> {
  const s3 = makeS3(provider)
  try {
    await s3.send(new HeadBucketCommand({ Bucket: provider.bucket! }))
  } finally {
    s3.destroy()
  }
}

export async function uploadAssetToCdn(
  provider: ProviderConfig,
  key: string,
  body: Buffer,
  contentType = 'image/png',
): Promise<string> {
  const s3 = makeS3(provider)
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: provider.bucket!,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    )
    const prefix = provider.public_url_prefix?.replace(/\/+$/, '') ?? ''
    return `${prefix}/${key}`.replace(/([^:])\/\//g, '$1/')
  } finally {
    s3.destroy()
  }
}
