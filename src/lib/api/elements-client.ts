import type { Element } from '@/lib/types'

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${init?.method ?? 'GET'} ${url} → HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const listElementsApi = (pageId: string) =>
  http<Element[]>(`/api/pages/${pageId}/elements`)

export const saveElementsApi = (pageId: string, elements: Element[]) =>
  http<Element[]>(`/api/pages/${pageId}/elements`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(elements),
  })
