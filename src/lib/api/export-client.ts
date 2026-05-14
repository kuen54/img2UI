type ExportFolderResult = { path: string }

export async function exportFolderApi(
  pageId: string,
  outputDir: string,
): Promise<ExportFolderResult> {
  const res = await fetch(`/api/pages/${pageId}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'folder', output_dir: outputDir }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
  return (await res.json()) as ExportFolderResult
}

export async function downloadExportZip(pageId: string): Promise<void> {
  const res = await fetch(`/api/pages/${pageId}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'zip' }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`下载失败:HTTP ${res.status} ${text.slice(0, 200)}`)
  }
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') ?? ''
  const m = /filename="([^"]+)"/.exec(cd)
  const filename = m ? decodeURIComponent(m[1]!) : `export-${pageId}.zip`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function openFolderApi(folderPath: string): Promise<void> {
  const res = await fetch('/api/system/open-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? `HTTP ${res.status}`)
  }
}
