// 客户端 fetch 封装(Project / Page / State 通用 helpers)
// 注意:这些函数只能在 client component 或客户端代码里用;服务端 lib 直接走 @/lib/projects

import type { Project, Page, State } from '@/lib/types'

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// =============================================================================
// Project
// =============================================================================

export const listProjectsApi = () => http<Project[]>('/api/projects')

export const createProjectApi = (input: {
  name: string
  description?: string
  tech_stack_hint?: string
  cdn_provider_id?: string
}) =>
  http<Project>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

export const getProjectApi = (id: string) => http<Project>(`/api/projects/${id}`)

export const updateProjectApi = (id: string, patch: Partial<Project>) =>
  http<Project>(`/api/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

export const deleteProjectApi = (id: string) =>
  http<void>(`/api/projects/${id}`, { method: 'DELETE' })

// =============================================================================
// Page
// =============================================================================

export const listPagesApi = (projectId: string) =>
  http<Page[]>(`/api/projects/${projectId}/pages`)

export const createPageApi = (projectId: string, input: { name: string; route_hint?: string }) =>
  http<Page>(`/api/projects/${projectId}/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

export const getPageApi = (id: string) => http<Page>(`/api/pages/${id}`)

export const deletePageApi = (id: string) =>
  http<void>(`/api/pages/${id}`, { method: 'DELETE' })

// =============================================================================
// State
// =============================================================================

export const listStatesApi = (pageId: string) =>
  http<State[]>(`/api/pages/${pageId}/states`)

export const uploadStatesApi = async (
  pageId: string,
  uploads: Array<{ file: File; name: string; is_canonical: boolean }>,
): Promise<{ created: State[]; errors: Array<{ filename: string; error: string }> }> => {
  const form = new FormData()
  for (const u of uploads) form.append('files', u.file)
  form.append(
    'meta',
    JSON.stringify({
      states: uploads.map((u) => ({
        filename: u.file.name,
        name: u.name,
        is_canonical: u.is_canonical,
      })),
    }),
  )
  const res = await fetch(`/api/pages/${pageId}/states`, { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`POST states → HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return (await res.json()) as { created: State[]; errors: Array<{ filename: string; error: string }> }
}

export const deleteStateApi = (id: string) =>
  http<void>(`/api/states/${id}`, { method: 'DELETE' })

export const triggerPass1Api = (stateId: string) =>
  http<{ status: string }>(`/api/states/${stateId}/pass1`, { method: 'POST' })
