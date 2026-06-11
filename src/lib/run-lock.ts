/**
 * 单进程 Next.js 内存锁。
 * - `withStateLock`:同一 state_id 的 Pass 1 / Pass 2 / re-extract / re-key-via-api 互斥;
 *   并发触发返回 409(fail-fast,不排队)。
 * - `withLock`:通用排队锁,同 key 的调用串行执行(后到者等待前者完成,不报错)。
 *   用于 sub-crop 的 idx 分配、assign/unassign 的 Asset 读改写等短用户操作。
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
 * 在 key 上串行执行 fn:若已有持锁者,排到队尾等其完成后再跑(不抛错)。
 * 注意:fn 内不要再对同一 key 调 withLock(会死锁)。
 */
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  const run = prev.then(fn)
  // 存进 map 的 promise 吞掉错误,避免前序失败传染给后续排队者
  const settled = run.then(
    () => undefined,
    () => undefined,
  )
  locks.set(key, settled)
  void settled.then(() => {
    // 只有自己仍是队尾时才清理(期间可能有新排队者覆盖了 map 条目)
    if (locks.get(key) === settled) locks.delete(key)
  })
  return run
}

/**
 * 在 stateId 上跑 fn。若已有锁,抛 `StateBusyError`(HTTP 409 语义)。
 * 基于 withLock 实现;检查 + 上锁在同一同步段内完成,无 TOCTOU 窗口。
 */
export async function withStateLock<T>(
  stateId: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (locks.has(stateId)) {
    throw new StateBusyError(stateId)
  }
  return withLock(stateId, fn)
}

export function isStateLocked(stateId: string): boolean {
  return locks.has(stateId)
}
