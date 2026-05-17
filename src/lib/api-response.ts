import { NextResponse } from 'next/server'
import { HttpError } from './http'

/** 把任意 error 转换成 NextResponse JSON */
export function errorToResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: err.message, status: err.status, retryable: err.retryable },
      { status: err.status >= 400 && err.status < 600 ? err.status : 500 },
    )
  }
  if (err instanceof Error) {
    // 已知的 status 类
    const maybeStatus = (err as Error & { status?: number }).status
    if (typeof maybeStatus === 'number') {
      return NextResponse.json(
        { error: err.message, status: maybeStatus },
        { status: maybeStatus },
      )
    }
    return NextResponse.json(
      { error: err.message ?? 'internal error' },
      { status: 500 },
    )
  }
  return NextResponse.json({ error: 'unknown error' }, { status: 500 })
}

export function jsonResponse<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init)
}
