'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, FolderOutput, Download, FolderOpen, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { Asset, Element, Page, State } from '@/lib/types'
import { getPageApi, listStatesApi } from '@/lib/api/projects-client'
import { listElementsApi } from '@/lib/api/elements-client'
import { listAssetsApi } from '@/lib/api/assets-client'
import {
  exportFolderApi,
  downloadExportZip,
  openFolderApi,
} from '@/lib/api/export-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type PageProps = { params: Promise<{ pid: string; id: string }> }

function buildTreePreview(
  page: Page,
  states: State[],
  elements: Element[],
  assets: Asset[],
): string {
  const projectName = '{project-slug}'
  const pageName = page.name || '{page-slug}'
  const staticAssetCount = elements.filter((e) => e.type === 'static').length
  const realAssetCount = assets.length

  const lines: string[] = []
  lines.push(`${projectName}/`)
  lines.push(`├── config.json`)
  lines.push(`└── pages/`)
  lines.push(`    └── ${pageName}/`)
  lines.push(`        ├── meta.json`)
  lines.push(`        ├── states/`)
  states.forEach((s, i) => {
    const last = i === states.length - 1
    lines.push(`        │   ${last ? '└──' : '├──'} ${s.name}.json`)
  })
  lines.push(`        ├── assets/`)
  lines.push(
    `        │   ├── manifest.json   ${realAssetCount > 0 ? `(${realAssetCount} 个 asset)` : '(空)'}`,
  )
  lines.push(`        │   └── *.png             ${staticAssetCount} 个 static asset`)
  lines.push(`        ├── spec.md          ← coding agent 主入口`)
  lines.push(`        └── raw/`)
  states.forEach((s) => {
    lines.push(`            ├── original-${s.name}.png`)
  })
  lines.push(`            └── extracted.png   (canonical chroma key 后)`)
  return lines.join('\n')
}

export default function ExportPage({ params }: PageProps) {
  const { pid, id: pageId } = use(params)

  const [page, setPage] = useState<Page | null>(null)
  const [states, setStates] = useState<State[]>([])
  const [elements, setElements] = useState<Element[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [outputDir, setOutputDir] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState<'folder' | 'zip' | null>(null)
  const [lastExportPath, setLastExportPath] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    try {
      setLoading(true)
      const [p, s, e, a] = await Promise.all([
        getPageApi(pageId),
        listStatesApi(pageId),
        listElementsApi(pageId),
        listAssetsApi(pageId),
      ])
      setPage(p)
      setStates(s)
      setElements(e)
      setAssets(a)
      // 默认输出目录:用 home 估算,真实值由用户填
      if (!outputDir) {
        setOutputDir('~/img2ui-out')
      }
    } catch (err) {
      toast.error('加载失败:' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [pageId, outputDir])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAll()
  }, [loadAll])

  const handleExportFolder = async () => {
    if (!outputDir.trim()) {
      toast.error('output_dir 必填')
      return
    }
    setExporting('folder')
    try {
      const result = await exportFolderApi(pageId, outputDir.trim())
      setLastExportPath(result.path)
      toast.success(`导出成功:${result.path}`)
    } catch (e) {
      toast.error('导出失败:' + (e as Error).message)
    } finally {
      setExporting(null)
    }
  }

  const handleDownloadZip = async () => {
    setExporting('zip')
    try {
      await downloadExportZip(pageId)
      toast.success('zip 已下载')
    } catch (e) {
      toast.error('下载失败:' + (e as Error).message)
    } finally {
      setExporting(null)
    }
  }

  const handleOpenFolder = async () => {
    if (!lastExportPath) return
    try {
      await openFolderApi(lastExportPath)
    } catch (e) {
      toast.error('打开失败:' + (e as Error).message)
    }
  }

  if (loading || !page) {
    return <p className="p-6 text-sm text-muted-foreground">加载中…</p>
  }

  const assetWithoutCdn = assets.filter((a) => !a.cdn_url).length
  const tree = buildTreePreview(page, states, elements, assets)

  return (
    <div className="flex flex-col h-full">
      <nav className="px-6 py-3 border-b flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link
          href={`/projects/${pid}/pages/${pageId}`}
          className="hover:text-foreground transition-colors"
        >
          {page.name}
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">Export</span>
      </nav>

      <div className="flex-1 overflow-y-auto p-6 pb-24 space-y-6 max-w-3xl">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">导出</h1>
          <p className="text-sm text-muted-foreground">
            把这个页面的全部产物(spec.md / layout / 透明 PNG / 原图)打包成 coding agent 可消费的文件夹。
          </p>
        </div>

        {assetWithoutCdn > 0 && (
          <div className="border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm space-y-1">
            <p className="font-medium text-amber-900 dark:text-amber-100">
              {assetWithoutCdn} 个 asset 还未上传 CDN
            </p>
            <p className="text-amber-800 dark:text-amber-200">
              manifest.json 中这些 asset 的 cdn_url 会写为 null,coding agent 会 fallback 到本地 assets/ 路径。
              {' '}
              <Link
                href={`/projects/${pid}/pages/${pageId}/assets`}
                className="underline hover:no-underline"
              >
                去 Asset Review 上传
              </Link>
            </p>
          </div>
        )}

        <section className="space-y-2">
          <h2 className="text-sm font-medium">预览</h2>
          <pre className="text-xs font-mono bg-muted/30 border rounded-md p-3 overflow-x-auto">
            {tree}
          </pre>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">导出到本地文件夹</h2>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="output-dir" className="text-xs text-muted-foreground">
                输出目录(绝对路径,~ 自动展开)
              </Label>
              <Input
                id="output-dir"
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
                placeholder="~/img2ui-out"
                className="font-mono text-sm"
              />
            </div>
            <Button
              onClick={() => void handleExportFolder()}
              disabled={exporting !== null}
            >
              {exporting === 'folder' ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : (
                <FolderOutput className="size-4 mr-1" />
              )}
              Export 到文件夹
            </Button>
          </div>
          {lastExportPath && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">已导出到</span>
              <code className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                {lastExportPath}
              </code>
              <Button
                onClick={() => void handleOpenFolder()}
                size="sm"
                variant="outline"
              >
                <FolderOpen className="size-3.5 mr-1" />
                Open(macOS)
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">下载 zip</h2>
          <p className="text-xs text-muted-foreground">
            zip 流式打包,大 page 也不会 OOM。
          </p>
          <Button
            onClick={() => void handleDownloadZip()}
            disabled={exporting !== null}
            variant="outline"
          >
            {exporting === 'zip' ? (
              <Loader2 className="size-4 mr-1 animate-spin" />
            ) : (
              <Download className="size-4 mr-1" />
            )}
            Download zip
          </Button>
        </section>
      </div>
    </div>
  )
}
