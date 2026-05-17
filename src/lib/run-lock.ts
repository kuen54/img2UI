/**
 * 单进程 Next.js 内存锁。
 * 同一 state_id 的 Pass 1 / Pass 2 / re-extract / re-key-via-api 互斥;
 * 并发触发返回 409。
 */

const locks = new Map<string, Promise<unknown>>()

export class StateBusyError extends Error {
  readonly status = 409 as const
  constructor(stateId: string) {
    super(`state busy: ${stateId}`)
    this.name = 'StateBusyError'
  }
}

/**
 * 在 stateId 上跑 fn。若已有锁,抛 `StateBusyError`(HTTP 409 语义)。
 */
export async function withStateLock<T>(
  stateId: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (locks.has(stateId)) {
    throw new StateBusyError(stateId)
  }
  const promise = (async () => {
    try {
      return await fn()
    } finally {
      locks.delete(stateId)
    }
  })()
  locks.set(stateId, promise)
  return promise as Promise<T>
}

export function isStateLocked(stateId: string): boolean {
  return locks.has(stateId)
}
