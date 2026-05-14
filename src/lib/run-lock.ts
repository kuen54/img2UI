// 单进程内存锁:同一 state_id 的 Pass 1 / Pass 2 / re-extract 互斥
// SPEC.md § 文件系统布局 § 并发锁:冲突返回 409 Conflict
//
// LockKey 形如 `state:${state_id}` 或 `element:${element_id}`

export type LockKey = string

type LockEntry = { run_id: string; acquired_at: number }

const locks = new Map<LockKey, LockEntry>()

export class RunLockConflictError extends Error {
  constructor(
    public lockKey: LockKey,
    public existingRunId: string,
  ) {
    super(`Lock conflict: ${lockKey} held by ${existingRunId}`)
    this.name = 'RunLockConflictError'
  }
}

export function acquireLock(key: LockKey, run_id: string): void {
  const existing = locks.get(key)
  if (existing) throw new RunLockConflictError(key, existing.run_id)
  locks.set(key, { run_id, acquired_at: Date.now() })
}

export function releaseLock(key: LockKey): void {
  locks.delete(key)
}

export function isLocked(key: LockKey): boolean {
  return locks.has(key)
}

export function getLockOwner(key: LockKey): string | null {
  return locks.get(key)?.run_id ?? null
}
