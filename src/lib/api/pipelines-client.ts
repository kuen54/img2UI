import type { PipelineRun } from '@/lib/types'

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export type RunWithSub = { run: PipelineRun; sub_runs: PipelineRun[] }

export const getRunApi = (id: string) => http<PipelineRun>(`/api/pipeline-runs/${id}`)

export const getRunWithSubApi = (id: string) =>
  http<RunWithSub>(`/api/pipeline-runs/${id}?include_sub=true`)
