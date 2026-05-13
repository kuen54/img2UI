import { describe, it, expect, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { writeAtomic, readJson, writeJson, listJsonInDir, DATA_ROOT } from '../fs-utils'

const TEST_DIR = path.join(DATA_ROOT, '_test')

afterEach(async () => {
  await fs.rm(TEST_DIR, { recursive: true, force: true })
})

describe('fs-utils', () => {
  it('writeJson + readJson roundtrip', async () => {
    const tmp = path.join(TEST_DIR, 'roundtrip.json')
    await writeJson(tmp, { hello: 'world' })
    const back = await readJson<{ hello: string }>(tmp)
    expect(back?.hello).toBe('world')
  })

  it('readJson returns null on missing file', async () => {
    const back = await readJson(path.join(TEST_DIR, 'nope.json'))
    expect(back).toBeNull()
  })

  it('listJsonInDir returns empty on missing dir', async () => {
    const list = await listJsonInDir(path.join(TEST_DIR, 'missing'))
    expect(list).toEqual([])
  })

  it('listJsonInDir returns parsed objects from .json files', async () => {
    await writeJson(path.join(TEST_DIR, 'a.json'), { x: 1 })
    await writeJson(path.join(TEST_DIR, 'b.json'), { x: 2 })
    await writeJson(path.join(TEST_DIR, 'ignore.txt'), { x: 3 } as never)
    const list = await listJsonInDir<{ x: number }>(TEST_DIR)
    const xs = list.map((o) => o.x).sort()
    expect(xs).toEqual([1, 2])
  })

  it('writeAtomic creates parent dir if missing', async () => {
    const tmp = path.join(TEST_DIR, 'deep', 'nested', 'file.txt')
    await writeAtomic(tmp, 'hello')
    const content = await fs.readFile(tmp, 'utf8')
    expect(content).toBe('hello')
  })
})
