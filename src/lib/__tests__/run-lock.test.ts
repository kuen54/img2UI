import { describe, it, expect, afterEach } from 'vitest'
import { acquireLock, releaseLock, isLocked, getLockOwner, RunLockConflictError } from '../run-lock'

const KEY = 'state:test-only'

afterEach(() => {
  releaseLock(KEY)
})

describe('run-lock', () => {
  it('acquire then release', () => {
    acquireLock(KEY, 'run_1')
    expect(isLocked(KEY)).toBe(true)
    expect(getLockOwner(KEY)).toBe('run_1')
    releaseLock(KEY)
    expect(isLocked(KEY)).toBe(false)
    expect(getLockOwner(KEY)).toBeNull()
  })

  it('double acquire throws RunLockConflictError', () => {
    acquireLock(KEY, 'run_1')
    expect(() => acquireLock(KEY, 'run_2')).toThrow(RunLockConflictError)
    expect(() => acquireLock(KEY, 'run_2')).toThrow(/run_1/)
  })

  it('release on non-existent key is a no-op', () => {
    expect(() => releaseLock('state:nonexistent')).not.toThrow()
  })
})
