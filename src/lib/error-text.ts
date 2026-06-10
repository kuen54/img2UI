// 把 unknown error 转成适合 toast 的人话。客户端组件共用,无 node 依赖。
//
// 背景:客户端统一用 `throw new Error(await res.text())` 抛 API 错误,而
// Route Handler 的 errorToResponse 返回的是 `{"error":"...","status":...}`
// JSON 字符串 —— 直接塞进 toast 就是一坨机器味。这里负责拆开翻译。

/** JSON body / 网络错误 / 超长堆栈 → 简短可读的错误描述 */
export function errText(err: unknown): string {
  let msg = (err instanceof Error ? err.message : String(err)).trim()
  if (!msg) return '未知错误'

  // errorToResponse 的 {"error":...} body(或其他 JSON 错误体)
  if (msg.startsWith('{')) {
    try {
      const parsed = JSON.parse(msg) as { error?: unknown; message?: unknown }
      const inner =
        typeof parsed.error === 'string'
          ? parsed.error
          : typeof parsed.message === 'string'
            ? parsed.message
            : null
      if (inner) msg = inner.trim()
    } catch {
      // 不是合法 JSON,原样继续
    }
  }

  // HTML 错误页(dev overlay / 代理 502)没有人能读
  if (msg.startsWith('<')) return '服务返回了异常响应,请稍后重试'

  // fetch 网络层失败(本地工具 = 服务多半没在跑)
  if (
    msg === 'Failed to fetch' ||
    msg === 'Load failed' ||
    msg.startsWith('NetworkError')
  ) {
    return '无法连接服务,请确认 img2UI 正在运行'
  }

  if (msg.length > 160) msg = `${msg.slice(0, 160)}…`
  return msg
}
