import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { readImageDimensions, isPng } from '../image-meta'

const POC_PNG = path.join(process.cwd(), 'poc/inputs/canonical-512.png')

describe('image-meta', () => {
  it('readImageDimensions reads 236x512 from PoC fixture', async () => {
    const buffer = await fs.readFile(POC_PNG)
    const dims = await readImageDimensions(buffer)
    expect(dims).toEqual({ width: 236, height: 512 })
  })

  it('isPng detects PNG magic bytes', async () => {
    const buffer = await fs.readFile(POC_PNG)
    expect(isPng(buffer)).toBe(true)
  })

  it('isPng rejects JPEG (FF D8 FF)', () => {
    const fakeJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])
    expect(isPng(fakeJpg)).toBe(false)
  })

  it('isPng handles short buffers', () => {
    expect(isPng(Buffer.from([0x89]))).toBe(false)
  })
})
