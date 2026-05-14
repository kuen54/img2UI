// 纯字符串变换 — 不依赖 fs,可在 client bundle 里安全 import
// (config.ts 本身依赖 node:fs,会污染 client bundle,所以抽出来)

const MASK_RE = /^[\w-]{1,8}\*{3,}[\w-]{1,8}$|^\*{3,}[\w-]{1,8}$/

export function maskKey(raw: string): string {
  if (!raw) return ''
  if (raw.length <= 8) return '***' + raw.slice(-2)
  return raw.slice(0, 3) + '***' + raw.slice(-4)
}

export function isMasked(s: string): boolean {
  return MASK_RE.test(s)
}
