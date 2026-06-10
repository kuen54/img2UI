// 统一的「总 audit run + state 状态机 + 内存锁」样板。
// pass1 / pass2 / validate / re-extract 四个路由共用,消除复制粘贴间的微妙分歧。
//
// 关键约束:createPipelineRun / updateState 等 side-effect 必须在 withStateLock 内执行。
// 否则两个并发 POST 都能通过 isStateLocked 预检,各自落一个 audit run 并翻转
// pipeline_status,输掉锁竞争的那个 run 永远卡在 running(TOCTOU 孤儿)。

import { withStateLock } from './run-lock'
import { createPipelineRun, updatePipelineRun } from './elements'
import { updateState } from './projects'
import { nowIso } from './id'
import type { PipelineRun, StateRecord, StatePipelineStatus } from './types'

export interface AuditJobInput {
  stateId: string
  /** 总 audit run stub(caller 构建,status='running') */
  auditRun: PipelineRun
  /** 进入运行态时打到 state 上的 patch(锁内执行);re-extract 等不动状态机的传 undefined */
  runningPatch?: Partial<StateRecord>
  /** job 成功后的 pipeline_status(不传则不动 state) */
  doneStatus?: StatePipelineStatus
  /** job 失败后的 pipeline_status(不传则不动 state) */
  failStatus?: StatePipelineStatus
  /** 写进 audit run.error.code */
  errorCode: string
  /** 实际工作;返回值写进 audit run.parsed_result */
  job: () => Promise<unknown>
}

/**
 * 启动一个带锁的后台 audit job。
 *
 * 返回的 promise 在「锁已拿到 + audit run 已落盘 + state 已置 running」后 resolve ——
 * route handler `await` 它之后即可安全返回 202(此时 run_id 一定可被轮询到)。
 * 若 state 已被锁,reject `StateBusyError` 且不产生任何 side-effect(route 返回 409)。
 * job 本体继续在后台跑,完成 / 失败都写回 audit run + state。
 */
export function beginAuditJob(input: AuditJobInput): Promise<void> {
  let resolveReady!: () => void
  let rejectReady!: (err: unknown) => void
  const ready = new Promise<void>((res, rej) => {
    resolveReady = res
    rejectReady = rej
  })

  withStateLock(input.stateId, async () => {
    // side-effect 全在锁内,杜绝 TOCTOU 孤儿 run
    try {
      await createPipelineRun(input.auditRun)
      if (input.runningPatch) {
        await updateState(input.stateId, input.runningPatch)
      }
    } catch (err) {
      rejectReady(err)
      return
    }
    resolveReady()

    try {
      const parsed = await input.job()
      await updatePipelineRun(input.auditRun.id, {
        status: 'completed',
        completed_at: nowIso(),
        ...(parsed !== undefined ? { parsed_result: parsed } : {}),
      })
      if (input.doneStatus) {
        await updateState(input.stateId, { pipeline_status: input.doneStatus })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[${input.auditRun.pass} audit ${input.auditRun.id}]`, message)
      await updatePipelineRun(input.auditRun.id, {
        status: 'failed',
        completed_at: nowIso(),
        error: { code: input.errorCode, message, retryable: true },
      }).catch(() => {})
      if (input.failStatus) {
        await updateState(input.stateId, { pipeline_status: input.failStatus }).catch(() => {})
      }
    }
  }).catch((err) => {
    // StateBusyError(锁被占)→ ready reject,route 返回 409。
    // ready 已 resolve 后这里是 no-op(Promise 只 settle 一次)。
    rejectReady(err)
  })

  return ready
}
