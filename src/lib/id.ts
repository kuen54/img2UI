import { customAlphabet } from 'nanoid'

// 避开易混淆字符,但保留大小写
const ALPHABET = '0123456789ABCDEFGHIJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz'

const id6 = customAlphabet(ALPHABET, 6)
const id8 = customAlphabet(ALPHABET, 8)

/** Provider id(短) */
export const newProviderId = (): string => id6()

/** Project / Page / State / Element / Asset / PipelineRun id */
export const newId = (): string => id8()

/** ISO datetime now */
export const nowIso = (): string => new Date().toISOString()

/** 严格 ID 校验:^[a-zA-Z0-9_-]{1,32}$,用于路由参数防注入 */
const ID_RE = /^[a-zA-Z0-9_-]{1,32}$/
export function isValidId(s: string): boolean {
  return ID_RE.test(s)
}
