// 启动对账:进程重启会丢掉所有内存锁和后台 job,留下永久卡在
// `*_running` / `validating` 的 state 和 `running` 的 PipelineRun。
// 服务启动时(instrumentation.ts register)统一翻成终态,UI 立刻可重跑。
//
// ⚠️ 隐性时序假设(本模块正确性的唯一前提):
//   register 跑在任何请求之前,此刻不存在真正 in-flight 的 job,
//   所以磁盘上所有 status==='running' 的 run 都是上一个进程的遗孤,可以无脑翻 failed。
//
// 违反后果:若有 run 在对账执行时真的还在跑(比如另一个进程持有它),
//   这里会把活着的 in-flight run 误杀成 failed,而真正的 runner 之后还会继续
//   写盘,导致 run 记录在 failed / 后续状态之间被来回覆盖,状态机彻底错乱。
//
// 当前成立条件:单 Node 进程 + Next.js instrumentation register 先于一切请求。
// 以下任一形态出现时,此假设不再成立,必须重新评估(如改成按 run 心跳 / 持锁判活):
//   - 多 worker / 多实例共享同一 data/ 目录(别的实例的 run 不是遗孤)
//   - 预热请求 / serverless 冷启动等"register 与请求并发"的运行形态

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DATA_ROOT, paths, readJsonLenient, writeJsonAtomic } from './fs-utils'
import { nowIso } from './id'
import type { PipelineRun, StateRecord, StatePipelineStatus } from './types'

/** in-flight 状态 → 重启后的终态(validate 失败不降级 pass2 成果,退回 pass2_done) */
const STALE_STATUS_MAP: Partial<Record<StatePipelineStatus, StatePipelineStatus>> = {
  pass1_running: 'pass1_failed',
  pass2_running: 'pass2_failed',
  validating: 'pass2_done',
}

export async function reconcileStaleRuns(): Promise<void> {
  let staleStates = 0
  let staleRuns = 0

  // 1. 悬挂的 PipelineRun → failed(覆盖 audit run 和 sub-run)
  const runFiles = await readdirSafe(path.join(DATA_ROOT, 'pipelines'))
  for (const f of runFiles) {
    if (!f.endsWith('.json')) continue
    const run = await readJsonLenient<PipelineRun>(
      path.join(DATA_ROOT, 'pipelines', f),
    )
    if (!run || run.status !== 'running') continue
    await writeJsonAtomic(paths.pipelineRun(run.id), {
      ...run,
      status: 'failed',
      completed_at: nowIso(),
      error: {
        code: 'PROCESS_RESTART',
        message: '服务进程重启,运行中的任务已中断',
        retryable: true,
      },
    } satisfies PipelineRun)
    staleRuns++
  }

  // 2. 悬挂的 state 状态机 → 对应终态
  const stateFiles = await readdirSafe(path.join(DATA_ROOT, 'states'))
  for (const f of stateFiles) {
    if (!f.endsWith('.json')) continue
    const state = await readJsonLenient<StateRecord>(
      path.join(DATA_ROOT, 'states', f),
    )
    if (!state) continue
    const next = STALE_STATUS_MAP[state.pipeline_status]
    if (!next) continue
    await writeJsonAtomic(paths.state(state.id), {
      ...state,
      pipeline_status: next,
    } satisfies StateRecord)
    staleStates++
  }

  if (staleStates > 0 || staleRuns > 0) {
    console.warn(
      `[startup-reconcile] 对账完成:${staleStates} 个悬挂 state、${staleRuns} 个悬挂 run 已翻终态`,
    )
  }
}

async function readdirSafe(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir)
  } catch {
    return []
  }
}
