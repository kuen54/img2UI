import { NextRequest, NextResponse } from 'next/server'

import { getRun, listSubRuns } from '@/lib/pipelines'
import type { PipelineRun } from '@/lib/types'

type RouteCtx = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { id } = await ctx.params
  const run = await getRun(id)
  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const includeSub = req.nextUrl.searchParams.get('include_sub') === 'true'
  if (!includeSub) {
    return NextResponse.json(run)
  }

  // pass1 / pass2 → 找同 state 同 parent 的 sub-runs(pass1_*, pass2_*)
  let subRuns: PipelineRun[] = []
  if (run.pass === 'pass1') {
    subRuns = await listSubRuns(run.state_id, 'pass1')
  } else if (run.pass === 'pass2') {
    subRuns = await listSubRuns(run.state_id, 'pass2')
  }
  return NextResponse.json({ run, sub_runs: subRuns })
}
