// 缩略图生成:把状态图原图缩到最长边 256px,写入 data/thumbs/{page-id}.png
// 见 SPEC.md § 缩略图生成 + CLAUDE.md(Phase 8e dogfood feedback)

import path from 'node:path'
import { promises as fs } from 'node:fs'
import sharp from 'sharp'

import { DATA_ROOT } from '@/lib/fs-utils'

const THUMBS_DIR = path.join(DATA_ROOT, 'thumbs')

export const thumbnailPathFor = (pageId: string): string =>
  path.join(THUMBS_DIR, `${pageId}.png`)

/**
 * 把 PNG buffer 缩到最长边 256px,写入 data/thumbs/{pageId}.png 并返回路径
 * - fit: 'inside' 保留宽高比,不裁切
 * - withoutEnlargement: true,小图不放大
 * - quality 85,目标 < 50KB
 */
export async function generateThumbnail(pageId: string, src: Buffer): Promise<string> {
  await fs.mkdir(THUMBS_DIR, { recursive: true })
  const outPath = thumbnailPathFor(pageId)
  await sharp(src)
    .resize({ width: 256, height: 256, fit: 'inside', withoutEnlargement: true })
    .png({ quality: 85, compressionLevel: 9 })
    .toFile(outPath)
  return outPath
}
