import { promises as fs } from 'node:fs'
import path from 'node:path'
import { nanoid } from 'nanoid'

/**
 * 数据根目录:`data/`,启动时确保存在。所有持久化文件落在它下面。
 */
export const DATA_ROOT = path.resolve(process.cwd(), 'data')

const SUBDIRS = [
  'projects',
  'pages',
  'states',
  'elements',
  'assets',
  'pipelines',
  'raw',
  'thumbs',
  'pass2',
  'keyed',
  'slices',
  'assets-bin',
] as const

let ensureRootPromise: Promise<void> | null = null

/** 首次调用建好 data/ 及全部子目录,后续调用 idempotent */
export async function ensureDataRoot(): Promise<void> {
  if (!ensureRootPromise) {
    ensureRootPromise = (async () => {
      await fs.mkdir(DATA_ROOT, { recursive: true })
      await Promise.all(
        SUBDIRS.map((d) =>
          fs.mkdir(path.join(DATA_ROOT, d), { recursive: true }),
        ),
      )
    })()
  }
  return ensureRootPromise
}

/**
 * 原子写:写到 tmp 文件再 rename。
 * 防止进程被 kill 时留下半截文件。
 */
export async function writeAtomic(
  filePath: string,
  content: string | Uint8Array,
): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmp = `${filePath}.tmp.${nanoid(8)}`
  await fs.writeFile(tmp, content)
  await fs.rename(tmp, filePath)
}

/**
 * 读 JSON,文件不存在返回 null;JSON 损坏照常抛。
 * 用于单记录读取(getProject/getPage/getState/elements/config 等):
 * 损坏必须响(500),静默当 null 会把数据损坏伪装成 404 / 空集,
 * 下游(如 Pass 2 跑在空 elements 上)会安静地产出错误结果。
 */
export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const buf = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(buf) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/**
 * 宽容版:文件不存在或 JSON 损坏都返回 null(损坏时 warn 带路径)。
 * 只给目录扫描类调用方(listProjects 等 Promise.all 扫盘):
 * data/ 用户可手动编辑,单个坏文件不该 500 整个列表。其他 IO 错误继续抛。
 */
export async function readJsonLenient<T>(filePath: string): Promise<T | null> {
  let buf: string
  try {
    buf = await fs.readFile(filePath, 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  try {
    return JSON.parse(buf) as T
  } catch (err) {
    console.warn(
      `[readJsonLenient] JSON 解析失败,跳过 ${filePath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return null
  }
}

/** 读 JSON,文件不存在抛错 */
export async function readJson<T>(filePath: string): Promise<T> {
  const buf = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(buf) as T
}

/** 写 JSON(美化两空格,原子写) */
export async function writeJsonAtomic(
  filePath: string,
  data: unknown,
): Promise<void> {
  await writeAtomic(filePath, JSON.stringify(data, null, 2))
}

/** 删文件,不存在不报错 */
export async function unlinkIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

/** 递归删目录,不存在不报错 */
export async function rmIfExists(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

/** 列目录,不存在返回空数组 */
export async function readdirIfExists(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

// ─── 路径助手 ────────────────────────────────────────────────────────────────

export const paths = {
  config: () => path.join(DATA_ROOT, 'config.json'),
  project: (id: string) => path.join(DATA_ROOT, 'projects', `${id}.json`),
  page: (id: string) => path.join(DATA_ROOT, 'pages', `${id}.json`),
  state: (id: string) => path.join(DATA_ROOT, 'states', `${id}.json`),
  /** elements 是按 page 整文件存(整批替换,非字段级 patch) */
  elements: (pageId: string) => path.join(DATA_ROOT, 'elements', `${pageId}.json`),
  asset: (id: string) => path.join(DATA_ROOT, 'assets', `${id}.json`),
  pipelineRun: (id: string) => path.join(DATA_ROOT, 'pipelines', `${id}.json`),
  raw: (stateId: string) => path.join(DATA_ROOT, 'raw', `${stateId}.png`),
  thumb: (id: string) => path.join(DATA_ROOT, 'thumbs', `${id}.png`),
  pass2GreenScreen: (stateId: string, category: string, batchIdx?: number) =>
    path.join(
      DATA_ROOT,
      'pass2',
      `${stateId}-${category}${batchIdx && batchIdx > 0 ? `-batch${batchIdx}` : ''}.png`,
    ),
  keyed: (stateId: string, category: string, batchIdx?: number) =>
    path.join(
      DATA_ROOT,
      'keyed',
      `${stateId}-${category}${batchIdx && batchIdx > 0 ? `-batch${batchIdx}` : ''}.png`,
    ),
  sliceDir: (stateId: string, category: string) =>
    path.join(DATA_ROOT, 'slices', `${stateId}-${category}`),
  slice: (stateId: string, category: string, idx: number) =>
    path.join(DATA_ROOT, 'slices', `${stateId}-${category}`, `${idx}.png`),
  sliceSidecar: (stateId: string, category: string, idx: number) =>
    path.join(DATA_ROOT, 'slices', `${stateId}-${category}`, `${idx}.json`),
  assetBin: (assetId: string) =>
    path.join(DATA_ROOT, 'assets-bin', `${assetId}.png`),
} as const

/**
 * 列出某 (state, category) 对应所有 pass2 / keyed batch 文件。
 * 返回 [{batchIdx, pass2Path, keyedPath}, ...] 按 idx 排序。
 * 兼容老数据(无 batch 后缀的视为 batch 0)。
 */
export async function listPass2Batches(
  stateId: string,
  category: string,
): Promise<Array<{ batchIdx: number; pass2Path: string; keyedPath: string }>> {
  const dir = path.join(DATA_ROOT, 'keyed')
  let names: string[] = []
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: Array<{ batchIdx: number; pass2Path: string; keyedPath: string }> = []
  // 兼容老数据(无 batch 后缀的视为 batch 0)
  if (names.includes(`${stateId}-${category}.png`)) {
    out.push({
      batchIdx: 0,
      pass2Path: paths.pass2GreenScreen(stateId, category),
      keyedPath: paths.keyed(stateId, category),
    })
  }
  const re = new RegExp(`^${stateId}-${category}-batch(\\d+)\\.png$`)
  for (const n of names) {
    const m = re.exec(n)
    if (m) {
      const idx = parseInt(m[1]!, 10)
      out.push({
        batchIdx: idx,
        pass2Path: paths.pass2GreenScreen(stateId, category, idx),
        keyedPath: paths.keyed(stateId, category, idx),
      })
    }
  }
  out.sort((a, b) => a.batchIdx - b.batchIdx)
  return out
}
