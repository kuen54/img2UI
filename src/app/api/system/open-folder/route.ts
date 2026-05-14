import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import os from 'node:os'

import { loadConfig } from '@/lib/config'

const execAsync = promisify(exec)

// 仅支持 macOS,且白名单到 default_export_dir 或 ~/img2ui-out 内,防命令注入

export async function POST(req: NextRequest) {
  if (process.platform !== 'darwin') {
    return NextResponse.json(
      { error: '当前只支持 macOS。请手动打开:' },
      { status: 501 },
    )
  }

  let body: { path?: string }
  try {
    body = (await req.json()) as { path?: string }
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  const target = body.path
  if (!target || !path.isAbsolute(target)) {
    return NextResponse.json({ error: 'path 必须是绝对路径' }, { status: 400 })
  }

  // 白名单:必须落在 default_export_dir 或 ~/img2ui-out 下
  const config = await loadConfig()
  const allowedRoots = [
    config.settings.default_export_dir,
    path.join(os.homedir(), 'img2ui-out'),
  ]
  const resolved = path.resolve(target)
  const ok = allowedRoots.some((root) => {
    const r = path.resolve(root)
    return resolved === r || resolved.startsWith(r + path.sep)
  })
  if (!ok) {
    return NextResponse.json(
      { error: `path 必须在 ${allowedRoots.join(' 或 ')} 之内` },
      { status: 400 },
    )
  }

  // 用 spawn-style 参数避免 shell 注入(execFile 才彻底安全,exec 也用单引号包路径)
  // 这里用 execFile via exec('open', [arg]) 不行;直接 quote 单引号 + 转义内部单引号
  const safe = resolved.replace(/'/g, `'\\''`)
  try {
    await execAsync(`open '${safe}'`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
