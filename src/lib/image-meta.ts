import sharp from 'sharp'

export type ImageDimensions = { width: number; height: number }

export async function readImageDimensions(buffer: Buffer): Promise<ImageDimensions> {
  const meta = await sharp(buffer).metadata()
  if (!meta.width || !meta.height) {
    throw new Error('图像缺失尺寸 metadata')
  }
  return { width: meta.width, height: meta.height }
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function isPng(buffer: Buffer): boolean {
  if (buffer.length < PNG_MAGIC.length) return false
  return buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
}
