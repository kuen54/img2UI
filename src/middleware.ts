import { NextRequest, NextResponse } from 'next/server'

/**
 * CSRF gate(HANDOFF §2):只接受 same-origin / none(直接导航 / curl)的请求。
 * 阻断跨站 fetch,防 DNS rebinding 类攻击。
 *
 * 仅针对 /api/* 路径生效;静态资源 / 页面渲染不受影响。
 */
export function middleware(req: NextRequest): NextResponse {
  const fetchSite = req.headers.get('sec-fetch-site')
  // 允许:无头(curl / dev tools / 直接导航) | same-origin
  const allowed =
    !fetchSite || fetchSite === 'same-origin' || fetchSite === 'none'
  if (!allowed) {
    return new NextResponse(
      JSON.stringify({ error: 'forbidden', reason: 'csrf' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
