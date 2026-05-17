import sharp from 'sharp'
import { paths, writeAtomic } from './fs-utils'

/** 生成 256×256 cover 缩略图 PNG,落 data/thumbs/{id}.png */
export async function generateThumbnail(
  imageBuffer: Buffer,
  id: string,
): Promise<void> {
  const thumb = await sharp(imageBuffer)
    .resize(256, 256, { fit: 'cover', position: 'centre' })
    .png({ quality: 85 })
    .toBuffer()
  await writeAtomic(paths.thumb(id), thumb)
}

export async function getImageDimensions(
  imageBuffer: Buffer,
): Promise<{ width: number; height: number }> {
  const meta = await sharp(imageBuffer).metadata()
  if (!meta.width || !meta.height) {
    throw new Error('failed to read image dimensions')
  }
  return { width: meta.width, height: meta.height }
}
