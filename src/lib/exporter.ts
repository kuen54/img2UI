// Phase 6 Export 主体 — 把 page 的全部产物(meta / states / assets / spec.md)输出到磁盘
// SPEC § Export 文件结构 是契约,改这里要同步改 SPEC.md

import path from 'node:path'
import { promises as fs } from 'node:fs'
import { Readable } from 'node:stream'

import archiver from 'archiver'

import type {
  Asset,
  Element,
  Page,
  Project,
  ProviderConfig,
  State,
} from '@/lib/types'
import { DATA_ROOT } from '@/lib/fs-utils'
import { getPage } from '@/lib/pages'
import { getProject } from '@/lib/projects'
import { listStatesByPage } from '@/lib/states'
import { getElementsByPage } from '@/lib/elements'
import { listAssetsByPage } from '@/lib/assets'
import { loadConfig } from '@/lib/config'

// =============================================================================
// 类型 + 加载
// =============================================================================

export type ExportPayload = {
  project: Project
  page: Page
  states: State[]                // canonical 在前
  elements: Element[]
  assets: Asset[]
  cdnProvider: ProviderConfig | null
  codingAgentIntro: string
  imgUiVersion: string
  exportedAt: string             // ISO
}

export async function loadExportPayload(pageId: string): Promise<ExportPayload> {
  const page = await getPage(pageId)
  if (!page) throw new Error('page not found')
  const project = await getProject(page.project_id)
  if (!project) throw new Error('project not found')
  const states = await listStatesByPage(pageId)
  // canonical 排前
  states.sort((a, b) => {
    if (a.id === page.canonical_state_id) return -1
    if (b.id === page.canonical_state_id) return 1
    return a.created_at.localeCompare(b.created_at)
  })
  const elements = await getElementsByPage(pageId)
  const assets = await listAssetsByPage(pageId)
  const config = await loadConfig()
  const cdnProvider =
    config.providers.find((p) => p.id === project.cdn_provider_id && p.kind === 'cdn') ??
    config.providers.find((p) => p.kind === 'cdn' && p.active) ??
    null
  return {
    project,
    page,
    states,
    elements,
    assets,
    cdnProvider,
    codingAgentIntro: config.prompts.coding_agent_intro,
    imgUiVersion: config.version,
    exportedAt: new Date().toISOString(),
  }
}

// =============================================================================
// slug:文件名安全的展示名(保留中文)
// =============================================================================

export function slug(s: string): string {
  const trimmed = (s ?? '').trim()
  if (!trimmed) return 'untitled'
  // 替换非「字母数字下划线连字符 中文」为 -
  // 一-龥 是常用中文范围,够 MVP 用
  const cleaned = trimmed
    .replace(/[^\w一-龥-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'untitled'
}

// =============================================================================
// 渲染纯函数(可单测)
// =============================================================================

export function renderConfigJson(payload: ExportPayload): unknown {
  const assetCdnBase =
    payload.cdnProvider?.public_url_prefix?.replace(/\/+$/, '') ?? null
  return {
    project: payload.project,
    asset_cdn_base: assetCdnBase ? `${assetCdnBase}/${payload.project.id}/` : null,
    img2ui_version: payload.imgUiVersion,
    exported_at: payload.exportedAt,
  }
}

export function renderMetaJson(payload: ExportPayload): unknown {
  return {
    page: payload.page,
    states: payload.states.map((s) => ({
      id: s.id,
      name: s.name,
      is_canonical: s.id === payload.page.canonical_state_id,
      original_image_filename: `original-${slug(s.name)}.png`,
    })),
  }
}

export function renderStateJson(
  state: State,
  page: Page,
  elements: Element[],
  assets: Asset[],
): unknown {
  const elementsInState = elements.filter((e) => e.state_ids.includes(state.id))
  const assetByElementId = new Map(assets.map((a) => [a.element_id, a]))
  return {
    state_id: state.id,
    state_name: state.name,
    is_canonical: state.id === page.canonical_state_id,
    image_size: [state.width, state.height],
    elements: elementsInState.map((el) => {
      const [nx, ny, nw, nh] = el.bbox
      const bboxPixels: [number, number, number, number] = [
        Math.round(nx * state.width),
        Math.round(ny * state.height),
        Math.round(nw * state.width),
        Math.round(nh * state.height),
      ]
      const asset = el.type === 'static' ? assetByElementId.get(el.id) : undefined
      return {
        id: el.id,
        type: el.type,
        name: el.name,
        bbox: el.bbox,
        bbox_pixels: bboxPixels,
        z_index: el.z_index,
        description: el.description,
        ...(asset && { asset_id: asset.id }),
        ...(el.shape_spec !== undefined && { shape_spec: el.shape_spec }),
        ...(el.material_spec !== undefined && { material_spec: el.material_spec }),
        ...(el.cross_state_notes !== undefined && {
          cross_state_notes: el.cross_state_notes,
        }),
      }
    }),
  }
}

export function renderManifestJson(
  assets: Asset[],
  elements: Element[],
): Record<string, unknown> {
  const elById = new Map(elements.map((e) => [e.id, e]))
  const out: Record<string, unknown> = {}
  for (const a of assets) {
    const el = elById.get(a.element_id)
    if (!el || el.type !== 'static') continue
    out[a.id] = {
      filename: `${a.id}.png`,
      cdn_url: a.cdn_url ?? null,
      width: a.width,
      height: a.height,
      element_id: a.element_id,
    }
  }
  return out
}

export function renderSpecMd(payload: ExportPayload): string {
  const { project, page, states, elements, assets } = payload

  const assetByElementId = new Map(assets.map((a) => [a.element_id, a]))

  const lines: string[] = []
  lines.push(`# ${page.name}`, '')

  // 项目信息
  lines.push('## 项目信息', '')
  lines.push(`- 项目: ${project.name}`)
  if (page.route_hint) lines.push(`- 路由: ${page.route_hint}`)
  if (project.tech_stack_hint) lines.push(`- 技术栈: ${project.tech_stack_hint}`)
  lines.push(`- 状态: ${states.map((s) => s.name).join(' / ')}`)
  if (project.description) {
    lines.push('', '## 整体描述', '', project.description)
  }
  lines.push('')

  // 每个状态
  for (const state of states) {
    const isCanonical = state.id === page.canonical_state_id
    const elementsInState = elements.filter((e) => e.state_ids.includes(state.id))
    lines.push(
      `## 状态: ${state.name}${isCanonical ? '(canonical)' : ''}`,
      '',
      `画布尺寸: ${state.width}×${state.height}`,
      '',
    )

    // 元素表
    if (elementsInState.length > 0) {
      lines.push('### 元素列表', '')
      lines.push('| id | type | name | description | asset / spec |')
      lines.push('|---|---|---|---|---|')
      for (const el of elementsInState) {
        const desc = el.description.replace(/\|/g, '\\|')
        let assetCell = '—'
        if (el.type === 'static') {
          const a = assetByElementId.get(el.id)
          assetCell = a ? `↗ assets/${a.id}.png` : '(未提取)'
        } else if (el.shape_spec) {
          const truncated =
            el.shape_spec.length > 60 ? el.shape_spec.slice(0, 60) + '…' : el.shape_spec
          assetCell = `shape: \`${truncated.replace(/\|/g, '\\|')}\``
        }
        lines.push(
          `| ${el.id} | ${el.type} | ${el.name.replace(/\|/g, '\\|')} | ${desc} | ${assetCell} |`,
        )
      }
      lines.push('')

      // 布局描述(按 z_index 排,bbox 像素拼自然语言)
      lines.push('### 布局描述', '')
      const sorted = [...elementsInState].sort((a, b) => a.z_index - b.z_index)
      for (const el of sorted) {
        const [nx, ny, nw, nh] = el.bbox
        const px = Math.round(nx * state.width)
        const py = Math.round(ny * state.height)
        const pw = Math.round(nw * state.width)
        const ph = Math.round(nh * state.height)
        lines.push(`- ${el.name} (${el.type}, z=${el.z_index}) — ${px},${py} ${pw}×${ph}`)
      }
      lines.push('')

      // 异形容器的 spec(type=code 且有 shape_spec/material_spec)
      const codeWithSpec = elementsInState.filter(
        (e) => e.type === 'code' && (e.shape_spec || e.material_spec),
      )
      if (codeWithSpec.length > 0) {
        lines.push('### Code 元素 spec', '')
        for (const el of codeWithSpec) {
          lines.push(`#### ${el.name} (\`${el.id}\`)`, '')
          if (el.shape_spec) {
            lines.push('shape:', '', '```', el.shape_spec, '```', '')
          }
          if (el.material_spec) {
            lines.push('material:', '', '```', el.material_spec, '```', '')
          }
        }
      }
    } else {
      lines.push('(该状态没有识别出元素)', '')
    }
  }

  // Cross-state notes(只列有 notes 的元素)
  const withCrossNotes = elements.filter((e) => e.cross_state_notes)
  if (withCrossNotes.length > 0) {
    lines.push('## 跨状态变化', '')
    for (const el of withCrossNotes) {
      lines.push(`- **${el.name}** (\`${el.id}\`): ${el.cross_state_notes}`)
    }
    lines.push('')
  }

  // Coding agent 指令(用户可改的 intro 模板)
  lines.push(
    payload.codingAgentIntro
      .replace(/\{tech_stack_hint\}/g, project.tech_stack_hint ?? '未指定'),
  )

  return lines.join('\n')
}

// =============================================================================
// 写入磁盘
// =============================================================================

export async function writeExportFolder(
  payload: ExportPayload,
  outputDir: string,
): Promise<{ path: string }> {
  const projectDir = path.join(outputDir, slug(payload.project.name))
  const pageDir = path.join(projectDir, 'pages', slug(payload.page.name))
  const statesDir = path.join(pageDir, 'states')
  const assetsDir = path.join(pageDir, 'assets')
  const rawDir = path.join(pageDir, 'raw')

  await fs.mkdir(statesDir, { recursive: true })
  await fs.mkdir(assetsDir, { recursive: true })
  await fs.mkdir(rawDir, { recursive: true })

  // config.json(项目级)
  await fs.writeFile(
    path.join(projectDir, 'config.json'),
    JSON.stringify(renderConfigJson(payload), null, 2),
  )

  // meta.json
  await fs.writeFile(
    path.join(pageDir, 'meta.json'),
    JSON.stringify(renderMetaJson(payload), null, 2),
  )

  // state JSON × N
  const usedStateNames = new Set<string>()
  for (const state of payload.states) {
    let name = slug(state.name)
    let i = 2
    while (usedStateNames.has(name)) name = `${slug(state.name)}-${i++}`
    usedStateNames.add(name)
    await fs.writeFile(
      path.join(statesDir, `${name}.json`),
      JSON.stringify(
        renderStateJson(state, payload.page, payload.elements, payload.assets),
        null,
        2,
      ),
    )
    // raw/original-{name}.png:从 data/raw/{state.id}.png 拷
    const src = path.join(DATA_ROOT, 'raw', `${state.id}.png`)
    const dst = path.join(rawDir, `original-${name}.png`)
    await fs.copyFile(src, dst).catch(() => {
      // 原图不存在时不阻断 export(用户可能删过 raw)
    })
  }

  // assets/manifest.json + 每个 asset PNG
  const manifest = renderManifestJson(payload.assets, payload.elements)
  await fs.writeFile(
    path.join(assetsDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  )
  for (const a of payload.assets) {
    const src = path.join(DATA_ROOT, 'assets-bin', `${a.id}.png`)
    const dst = path.join(assetsDir, `${a.id}.png`)
    await fs.copyFile(src, dst).catch(() => {
      // asset binary 不存在(失败的 asset)→ 不阻断
    })
  }

  // raw/extracted.png:canonical 的 keyed PNG 留底
  const canonicalState = payload.states.find(
    (s) => s.id === payload.page.canonical_state_id,
  )
  if (canonicalState) {
    const keyed = path.join(DATA_ROOT, 'keyed', `${canonicalState.id}.png`)
    const dst = path.join(rawDir, 'extracted.png')
    await fs.copyFile(keyed, dst).catch(() => {})
  }

  // spec.md
  await fs.writeFile(path.join(pageDir, 'spec.md'), renderSpecMd(payload))

  return { path: projectDir }
}

// =============================================================================
// streamExportZip — 流式打包,不缓存到内存
// =============================================================================

export function streamExportZip(payload: ExportPayload): {
  stream: ReadableStream<Uint8Array>
  filename: string
} {
  const archive = archiver('zip', { zlib: { level: 6 } })
  const projectSlug = slug(payload.project.name)
  const pageSlug = slug(payload.page.name)
  const filename = `${projectSlug}-${pageSlug}.zip`

  // 添加文件 — archiver 边添加边写入 stream,finalize() 不能 await(否则全缓存)
  // config.json
  archive.append(JSON.stringify(renderConfigJson(payload), null, 2), {
    name: `${projectSlug}/config.json`,
  })
  // meta.json
  archive.append(JSON.stringify(renderMetaJson(payload), null, 2), {
    name: `${projectSlug}/pages/${pageSlug}/meta.json`,
  })
  // state JSON × N + raw/original-{name}.png
  const usedStateNames = new Set<string>()
  for (const state of payload.states) {
    let name = slug(state.name)
    let i = 2
    while (usedStateNames.has(name)) name = `${slug(state.name)}-${i++}`
    usedStateNames.add(name)
    archive.append(
      JSON.stringify(
        renderStateJson(state, payload.page, payload.elements, payload.assets),
        null,
        2,
      ),
      { name: `${projectSlug}/pages/${pageSlug}/states/${name}.json` },
    )
    const rawSrc = path.join(DATA_ROOT, 'raw', `${state.id}.png`)
    archive.file(rawSrc, {
      name: `${projectSlug}/pages/${pageSlug}/raw/original-${name}.png`,
    })
  }
  // manifest.json + asset PNGs
  archive.append(
    JSON.stringify(renderManifestJson(payload.assets, payload.elements), null, 2),
    { name: `${projectSlug}/pages/${pageSlug}/assets/manifest.json` },
  )
  for (const a of payload.assets) {
    archive.file(path.join(DATA_ROOT, 'assets-bin', `${a.id}.png`), {
      name: `${projectSlug}/pages/${pageSlug}/assets/${a.id}.png`,
    })
  }
  // raw/extracted.png
  const canonicalState = payload.states.find(
    (s) => s.id === payload.page.canonical_state_id,
  )
  if (canonicalState) {
    archive.file(path.join(DATA_ROOT, 'keyed', `${canonicalState.id}.png`), {
      name: `${projectSlug}/pages/${pageSlug}/raw/extracted.png`,
    })
  }
  // spec.md
  archive.append(renderSpecMd(payload), {
    name: `${projectSlug}/pages/${pageSlug}/spec.md`,
  })

  // 缺文件 archiver 会发 'warning' 事件(ENOENT),不让它崩
  archive.on('warning', (err) => {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // 真错误,abort 流(消费者看到 stream 早结束)
      archive.abort()
    }
  })
  archive.on('error', () => {
    archive.abort()
  })

  // fire-and-forget
  void archive.finalize()

  // Node Readable → Web ReadableStream
  return {
    stream: Readable.toWeb(archive) as ReadableStream<Uint8Array>,
    filename,
  }
}
