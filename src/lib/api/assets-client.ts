import type { Asset, AssetStatus, Element } from '@/lib/types'

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const listAssetsApi = (pageId: string) =>
  http<Asset[]>(`/api/pages/${pageId}/assets`)

export const getAssetApi = (id: string) => http<Asset>(`/api/assets/${id}`)

export const deleteAssetApi = (id: string) =>
  http<void>(`/api/assets/${id}`, { method: 'DELETE' })

export const updateAssetApi = (id: string, patch: { status?: AssetStatus }) =>
  http<Asset>(`/api/assets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })

export const triggerPass2Api = (stateId: string) =>
  http<{ status: string }>(`/api/states/${stateId}/pass2`, { method: 'POST' })

export const reExtractElementApi = (elementId: string) =>
  http<{ run_id: string }>(`/api/elements/${elementId}/re-extract`, { method: 'POST' })

export const uploadAssetApi = (id: string) =>
  http<Asset>(`/api/assets/${id}/upload`, { method: 'POST' })

export const uploadAllAssetsApi = (pageId: string) =>
  http<{ uploaded: string[]; failed: { id: string; error: string }[] }>(
    `/api/pages/${pageId}/upload-all-assets`,
    { method: 'POST' },
  )

export const reKeyViaApiClient = (stateId: string) =>
  http<{
    run_id: string
    refreshed: number
    failed_routes: { category: string; error: string }[]
  }>(`/api/states/${stateId}/re-key-via-api`, { method: 'POST' })

// 拿 elements(已存在 elements-client 里,re-export 方便组件用)
export type { Element }
