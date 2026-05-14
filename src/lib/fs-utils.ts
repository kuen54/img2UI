import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { nanoid } from 'nanoid'

// 测试隔离:vitest 环境下重定向到 OS tmpdir,避免测试文件 afterEach 的
// `fs.rm(DATA_ROOT, { recursive: true, force: true })` 把用户真实 data/ 删光。
// 见 fix/test-data-isolation(2026-05-14 dogfood round 5 用户 data/ 被五件套删了 4+ 次)。
const isVitest = !!process.env.VITEST
export const DATA_ROOT = isVitest
  ? path.join(os.tmpdir(), `img2ui-test-${process.pid}`)
  : path.join(process.cwd(), 'data')

export async function writeAtomic(filepath: string, content: string | Buffer): Promise<void> {
  const dir = path.dirname(filepath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = `${filepath}.tmp.${nanoid(8)}`
  await fs.writeFile(tmp, content)
  await fs.rename(tmp, filepath)
}

export async function readJson<T>(filepath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filepath, 'utf8')
    return JSON.parse(content) as T
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw e
  }
}

export async function writeJson<T>(filepath: string, data: T): Promise<void> {
  await writeAtomic(filepath, JSON.stringify(data, null, 2))
}

export async function listJsonInDir<T>(dir: string): Promise<T[]> {
  try {
    const files = await fs.readdir(dir)
    const results: T[] = []
    for (const f of files) {
      if (f.endsWith('.json')) {
        const j = await readJson<T>(path.join(dir, f))
        if (j) results.push(j)
      }
    }
    return results
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw e
  }
}
