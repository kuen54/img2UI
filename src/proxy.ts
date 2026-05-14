import { NextRequest, NextResponse } from 'next/server'

// CSRF gate via Sec-Fetch-Site:
//   - 只对 /api/* 应用
//   - GET / HEAD / OPTIONS 是安全方法,放行
//   - 写方法(POST/PUT/PATCH/DELETE):仅当 Sec-Fetch-Site === 'cross-site' 时拒绝
//   - same-origin / same-site / none(直接打开浏览器地址栏) / 缺失头(老 UA)→ 放行
//
// localhost-only 工具,无强认证,这层够用
//
// Next.js 16 改用 proxy.ts(原 middleware.ts 已废弃)

export function proxy(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next()
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return NextResponse.next()

  const site = req.headers.get('sec-fetch-site')
  if (site === 'cross-site') {
    return new NextResponse('CSRF blocked', { status: 403 })
  }
  return NextResponse.next()
}

export const config = { matcher: '/api/:path*' }
