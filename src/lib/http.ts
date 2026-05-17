// HTTP fetch with timeout + 3-retry exp backoff (1s / 4s / 9s) on 5xx/429/network.

const RETRY_DELAYS_MS = [1000, 4000, 9000]

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryable: boolean,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`)
    this.name = 'HttpError'
  }
}

export class LlmRefusalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmRefusalError'
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600)
}

interface FetchWithRetryOpts extends RequestInit {
  /** ms */
  timeoutMs: number
  /** 0 = no retry, default 3 */
  maxRetries?: number
  /** outer signal,用户主动 abort */
  externalSignal?: AbortSignal
}

export async function fetchWithRetry(
  url: string,
  opts: FetchWithRetryOpts,
): Promise<Response> {
  const { timeoutMs, maxRetries = 3, externalSignal, ...init } = opts

  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs)
    const cleanup = () => clearTimeout(timer)

    // wire external signal
    const onExternalAbort = () => ctrl.abort(externalSignal?.reason)
    if (externalSignal) {
      if (externalSignal.aborted) {
        cleanup()
        throw new Error('aborted by external signal')
      }
      externalSignal.addEventListener('abort', onExternalAbort, { once: true })
    }

    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal })
      cleanup()
      if (res.ok) return res

      const body = await res.text().catch(() => '')
      const retryable = isRetryableStatus(res.status)
      if (!retryable || attempt === maxRetries) {
        throw new HttpError(res.status, body, retryable)
      }
      lastErr = new HttpError(res.status, body, true)
    } catch (err) {
      cleanup()
      // network / timeout / abort 都算 retryable(除非外部主动 abort)
      if (externalSignal?.aborted) throw err
      if (attempt === maxRetries) throw err
      lastErr = err
    } finally {
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort)
      }
    }

    const delay = RETRY_DELAYS_MS[attempt] ?? 9000
    await sleep(delay)
  }
  throw lastErr ?? new Error('fetchWithRetry: exhausted')
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
