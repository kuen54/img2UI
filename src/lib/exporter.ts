// HANDOFF §10:Export 文件结构 + spec.md 渲染。

import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  paths,
  readdirIfExists,
  readJsonIfExists,
  listPass2Batches,
} from './fs-utils'
import { getProject, listPagesByProject, listStatesByPage, getPage } from './projects'
import { getElementsForPage } from './elements'
import { listAssetsForPage } from './assets'
import { getConfig } from './config'
import { ALL_VISUAL_CATEGORIES, VISUAL_CATEGORY_CN } from './visual-category'
import type { Asset, LayoutElement, StateRecord, VisualCategory } from './types'

const VERSION = '0.1.0'

interface ExportPageInput {
  outputDir: string
  projectId: string
  pageId: string
  /** S3 上传后给定的 base url(若 null 则 manifest.cdn_url 全 null) */
  assetCdnBase?: string
}

export async function exportPageToFolder(input: ExportPageInput): Promise<void> {
  const project = await getProject(input.projectId)
  if (!project) throw new Error(`project ${input.projectId} not found`)
  const page = await getPage(input.pageId)
  if (!page) throw new Error(`page ${input.pageId} not found`)
  const states = await listStatesByPage(input.pageId)
  const elements = await getElementsForPage(input.pageId)
  const assets = await listAssetsForPage(input.pageId)
  const config = await getConfig()

  const projectDir = path.join(input.outputDir, sanitize(project.name))
  const pageDir = path.join(projectDir, 'pages', sanitize(page.name))
  await fs.mkdir(path.join(pageDir, 'states'), { recursive: true })
  await fs.mkdir(path.join(pageDir, 'assets'), { recursive: true })
  await fs.mkdir(path.join(pageDir, 'raw'), { recursive: true })

  // 1. project-level config.json(放在项目根)
  const projectConfigPath = path.join(projectDir, 'config.json')
  const existingConfig = (await readJsonIfExists<unknown>(projectConfigPath)) ?? null
  void existingConfig // 保留以备多 page 累积写;MVP 直接覆盖
  await fs.writeFile(
    projectConfigPath,
    JSON.stringify(
      {
        project,
        asset_cdn_base: input.assetCdnBase ?? null,
        img2ui_version: VERSION,
        exported_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  )

  // 2. pages/{page}/meta.json
  await fs.writeFile(
    path.join(pageDir, 'meta.json'),
    JSON.stringify(
      {
        page,
        states: states.map((s) => ({
          id: s.id,
          name: s.name,
          is_canonical: s.id === page.canonical_state_id,
          original_image_filename: `original-${sanitize(s.name)}.png`,
          width: s.width,
          height: s.height,
        })),
      },
      null,
      2,
    ),
  )

  // 3. raw/original-{state}.png + raw/extracted-{state}-{cat}.png(Pass 2 留底)
  for (const s of states) {
    try {
      const orig = await fs.readFile(paths.raw(s.id))
      await fs.writeFile(path.join(pageDir, 'raw', `original-${sanitize(s.name)}.png`), orig)
    } catch {
      // raw 缺失就跳过
    }
    for (const cat of ALL_VISUAL_CATEGORIES) {
      const batches = await listPass2Batches(s.id, cat)
      for (const b of batches) {
        try {
          const buf = await fs.readFile(b.pass2Path)
          const suffix = b.batchIdx > 0 ? `-batch${b.batchIdx}` : ''
          await fs.writeFile(
            path.join(
              pageDir,
              'raw',
              `extracted-${sanitize(s.name)}-${cat}${suffix}.png`,
            ),
            buf,
          )
        } catch {
          // 该 cat batch 无产物
        }
      }
    }
  }

  // 4. states/{state-name}.json
  for (const s of states) {
    const stateElements = elements.filter((e) => e.state_ids.includes(s.id))
    await fs.writeFile(
      path.join(pageDir, 'states', `${sanitize(s.name)}.json`),
      JSON.stringify(
        {
          state_id: s.id,
          state_name: s.name,
          image_size: [s.width, s.height],
          elements: stateElements.map((el) =>
            renderElementForExport(el, assets, s.width, s.height),
          ),
        },
        null,
        2,
      ),
    )
  }

  // 5. assets/{asset-id}.png + manifest.json
  const manifest: Record<string, unknown> = {}
  for (const a of assets) {
    try {
      const buf = await fs.readFile(paths.assetBin(a.id))
      await fs.writeFile(path.join(pageDir, 'assets', `${a.id}.png`), buf)
      manifest[a.id] = {
        filename: `${a.id}.png`,
        cdn_url: a.cdn_url ?? null,
        width: a.width,
        height: a.height,
        element_id: a.element_id,
      }
    } catch (err) {
      console.warn(`[export] asset ${a.id} bin missing:`, err)
    }
  }
  await fs.writeFile(path.join(pageDir, 'assets', 'manifest.json'), JSON.stringify(manifest, null, 2))

  // 6. spec.md
  const md = renderSpecMd({
    project,
    page,
    states,
    elements,
    assets,
    codingAgentIntro: config.prompts.coding_agent_intro,
  })
  await fs.writeFile(path.join(pageDir, 'spec.md'), md)
}

function renderElementForExport(
  el: LayoutElement,
  assets: Asset[],
  stateWidth: number,
  stateHeight: number,
): Record<string, unknown> {
  const a = assets.find((x) => x.element_id === el.id)
  return {
    id: el.id,
    type: el.type,
    name: el.name,
    bbox: el.bbox,
    bbox_pixels: [
      Math.round(el.bbox[0] * stateWidth),
      Math.round(el.bbox[1] * stateHeight),
      Math.round(el.bbox[2] * stateWidth),
      Math.round(el.bbox[3] * stateHeight),
    ],
    z_index: el.z_index,
    description: el.description,
    visual_category: el.visual_category,
    ...(a ? { asset_id: a.id } : {}),
    ...(el.shape_spec !== undefined ? { shape_spec: el.shape_spec } : {}),
    ...(el.material_spec !== undefined ? { material_spec: el.material_spec } : {}),
    ...(el.cross_state_notes !== undefined ? { cross_state_notes: el.cross_state_notes } : {}),
  }
}

function renderSpecMd(input: {
  project: Awaited<ReturnType<typeof getProject>>
  page: Awaited<ReturnType<typeof getPage>>
  states: StateRecord[]
  elements: LayoutElement[]
  assets: Asset[]
  codingAgentIntro: string
}): string {
  const { project, page, states, elements, assets, codingAgentIntro } = input
  if (!project || !page) return ''

  const lines: string[] = []
  lines.push(`# ${page.name}`)
  lines.push('')
  lines.push('## 项目信息')
  lines.push(`- 项目: ${project.name}`)
  lines.push(`- 路由: ${page.route_hint ?? '(未指定)'}`)
  lines.push(`- 状态: ${states.map((s) => s.name).join(' / ') || '(无)'}`)
  if (project.description) {
    lines.push('')
    lines.push('## 整体描述')
    lines.push(project.description)
  }

  for (const s of states) {
    lines.push('')
    lines.push(`## 状态: ${s.name}`)
    lines.push('### 元素列表')
    lines.push('| id | type | name | category | bbox (px) | description | asset / spec |')
    lines.push('|---|---|---|---|---|---|---|')
    const els = elements.filter((e) => e.state_ids.includes(s.id))
    for (const el of els) {
      const a = assets.find((x) => x.element_id === el.id)
      const assetCol =
        el.type === 'static'
          ? a?.cdn_url
            ? `↗ ${a.cdn_url}`
            : a
              ? `↗ assets/${a.id}.png`
              : '(待指派切片)'
          : `${el.shape_spec ? 'shape_spec' : ''}${el.shape_spec && el.material_spec ? ' + ' : ''}${el.material_spec ? 'material_spec' : ''}`
      const px = [
        Math.round(el.bbox[0] * s.width),
        Math.round(el.bbox[1] * s.height),
        Math.round(el.bbox[2] * s.width),
        Math.round(el.bbox[3] * s.height),
      ]
      const bboxStr = `x:${px[0]} y:${px[1]} ${px[2]}×${px[3]}`
      lines.push(
        `| ${el.id.slice(0, 6)} | ${el.type} | ${el.name} | ${VISUAL_CATEGORY_CN[el.visual_category as VisualCategory] ?? el.visual_category} | ${bboxStr} | ${el.description.replace(/\|/g, '\\|')} | ${assetCol || '(无)'} |`,
      )
    }
  }

  lines.push('')
  lines.push(codingAgentIntro)
  return lines.join('\n')
}

// 简化文件名(去掉非法字符)
function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80) || 'unnamed'
}

// 列出 export 目录里的内容(MVP:不做 zip,用户自己 cd 到目录)
export async function listExportContents(dir: string): Promise<string[]> {
  return readdirIfExists(dir)
}
