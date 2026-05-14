// 缩略图生成:把设计稿原图缩到最长边 512px(retina 1:1 显示),写入 data/thumbs/{page-id}.png
// 见 SPEC.md § 缩略图生成 + CLAUDE.md(Phase 8e/8f dogfood feedback)

import path from 'node:path'
import { promises as fs } from 'node:fs'
import sharp from 'sharp'

import { DATA_ROOT } from '@/lib/fs-utils'

const THUMBS_DIR = path.join(DATA_ROOT, 'thumbs')

export const thumbnailPathFor = (pageId: string): string =>
  path.join(THUMBS_DIR, `${pageId}.png`)

/**
 * 把 PNG buffer 缩到最长边 512px,写入 data/thumbs/{pageId}.png 并返回路径
 * - fit: 'inside' 保留宽高比,不裁切
 * - withoutEnlargement: true,小图不放大
 * - quality 85,目标 < 100KB(retina 显示需要 2x DPR,256 → 512)
 */
export async function generateThumbnail(pageId: string, src: Buffer): Promise<string> {
  await fs.mkdir(THUMBS_DIR, { recursive: true })
  const outPath = thumbnailPathFor(pageId)
  await sharp(src)
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
    .png({ quality: 85, compressionLevel: 9 })
    .toFile(outPath)
  return outPath
}
