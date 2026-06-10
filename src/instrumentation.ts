// Next.js instrumentation:服务进程启动时跑一次(任何请求之前)。
// 用于启动对账 —— 把上一个进程遗留的悬挂 running 状态翻成终态。

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { reconcileStaleRuns } = await import('./lib/startup-reconcile')
    await reconcileStaleRuns()
  }
}
