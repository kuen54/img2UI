import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import {
  slug,
  renderConfigJson,
  renderMetaJson,
  renderStateJson,
  renderManifestJson,
  renderSpecMd,
  writeExportFolder,
  type ExportPayload,
} from '@/lib/exporter'
import type { Asset, Element, Page, Project, ProviderConfig, State } from '@/lib/types'

// =============================================================================
// Fixture
// =============================================================================

const project: Project = {
  id: 'proj_abc',
  name: '奶茶盲盒活动页',
  description: '一个抽奶茶盲盒的运营活动页',
  tech_stack_hint: 'Next.js + Tailwind',
  cdn_provider_id: 'prv_test01',
  created_at: '2026-05-14T00:00:00Z',
  updated_at: '2026-05-14T00:00:00Z',
}

const page: Page = {
  id: 'page_xyz',
  project_id: 'proj_abc',
  name: '抽中页',
  route_hint: '/blind-box/win',
  canonical_state_id: 'state_canon',
  created_at: '2026-05-14T00:00:00Z',
  updated_at: '2026-05-14T00:00:00Z',
}

const states: State[] = [
  {
    id: 'state_canon',
    page_id: 'page_xyz',
    name: 'canonical',
    original_image_path: 'data/raw/state_canon.png',
    width: 750,
    height: 1334,
    pipeline_status: 'pass2_done',
    created_at: '2026-05-14T00:00:00Z',
  },
  {
    id: 'state_hover',
    page_id: 'page_xyz',
    name: 'hover',
    original_image_path: 'data/raw/state_hover.png',
    width: 750,
    height: 1334,
    pipeline_status: 'pass2_done',
    created_at: '2026-05-14T00:01:00Z',
  },
]

const elements: Element[] = [
  {
    id: 'el_doll',
    page_id: 'page_xyz',
    state_ids: ['state_canon', 'state_hover'],
    name: '卡通娃娃',
    type: 'static',
    bbox: [0.2, 0.3, 0.6, 0.4],
    z_index: 5,
    description: '蓬松云朵头发的小娃娃,蓝色羽绒服',
    reviewed: true,
    created_at: '2026-05-14T00:00:00Z',
    updated_at: '2026-05-14T00:00:00Z',
  },
  {
    id: 'el_chip',
    page_id: 'page_xyz',
    state_ids: ['state_canon'],
    name: '奶茶 chip',
    type: 'static',
    bbox: [0.1, 0.7, 0.3, 0.1],
    z_index: 6,
    description: '黑糖珍珠水牛乳粉色 chip',
    reviewed: true,
    created_at: '2026-05-14T00:00:00Z',
    updated_at: '2026-05-14T00:00:00Z',
  },
  {
    id: 'el_frame',
    page_id: 'page_xyz',
    state_ids: ['state_canon', 'state_hover'],
    name: '粉色异形容器',
    type: 'code',
    bbox: [0.05, 0.2, 0.9, 0.7],
    z_index: 1,
    description: '圆角矩形,顶部 notch,渐变粉色',
    shape_spec: 'M0,40 L20,40 A10,10 0 0,1 30,30 ...',
    material_spec: 'linear-gradient(180deg, #FFE0EC 0%, #FFB7D5 100%)',
    cross_state_notes: 'hover 时 scale 1.02',
    reviewed: true,
    created_at: '2026-05-14T00:00:00Z',
    updated_at: '2026-05-14T00:00:00Z',
  },
]

const assets: Asset[] = [
  {
    id: 'el_doll',
    element_id: 'el_doll',
    page_id: 'page_xyz',
    local_path: 'data/assets-bin/el_doll.png',
    cdn_url: 'https://cdn.example.com/img2ui/proj_abc/page_xyz/el_doll.png',
    width: 450,
    height: 534,
    alpha_quality: 0.91,
    status: 'uploaded',
    created_at: '2026-05-14T00:00:00Z',
    updated_at: '2026-05-14T00:00:00Z',
  },
  {
    id: 'el_chip',
    element_id: 'el_chip',
    page_id: 'page_xyz',
    local_path: 'data/assets-bin/el_chip.png',
    width: 225,
    height: 134,
    alpha_quality: 0.78,
    status: 'extracted', // 未上传 CDN,cdn_url 留 undefined
    created_at: '2026-05-14T00:00:00Z',
    updated_at: '2026-05-14T00:00:00Z',
  },
]

const cdnProvider: ProviderConfig = {
  id: 'prv_test01',
  kind: 'cdn',
  name: 'test-cdn',
  api_format: 's3',
  base_url: '',
  api_key: 'AKIA:secret',
  bucket: 'my-bucket',
  region: 'us-east-1',
  public_url_prefix: 'https://cdn.example.com/img2ui/',
  active: true,
  created_at: '2026-05-14T00:00:00Z',
  updated_at: '2026-05-14T00:00:00Z',
}

const codingAgentIntro = `## Coding agent 指令

- 优先使用项目现有组件库({tech_stack_hint})
- 异形容器用 SVG path 或 CSS clip-path 实现,具体参数见上方 spec
- 静态资产引用 CDN URL(见 manifest.json),不要本地化;manifest.json 中 cdn_url 为 null 时 fallback 用本地 assets/ 路径
- 多状态用 React state 切换,共享同一组件
- raw/original-*.png 是原始设计稿,实施过程中可以肉眼参考视觉风格`

function makePayload(overrides?: Partial<ExportPayload>): ExportPayload {
  return {
    project,
    page,
    states,
    elements,
    assets,
    cdnProvider,
    codingAgentIntro,
    imgUiVersion: '0.1.0',
    exportedAt: '2026-05-14T12:00:00Z',
    ...overrides,
  }
}

// =============================================================================
// slug
// =============================================================================

describe('slug', () => {
  it('保留中文', () => {
    expect(slug('抽中页')).toBe('抽中页')
  })

  it('替换空格为 -', () => {
    expect(slug('hello world')).toBe('hello-world')
  })

  it('合并多个非法字符为单一 -', () => {
    expect(slug('a / b @ c')).toBe('a-b-c')
  })

  it('空字符串 → untitled', () => {
    expect(slug('')).toBe('untitled')
    expect(slug('   ')).toBe('untitled')
  })

  it('保留下划线和连字符', () => {
    expect(slug('foo_bar-baz')).toBe('foo_bar-baz')
  })
})

// =============================================================================
// renderConfigJson
// =============================================================================

describe('renderConfigJson', () => {
  it('asset_cdn_base 拼接 project.id', () => {
    const r = renderConfigJson(makePayload()) as Record<string, unknown>
    expect(r.asset_cdn_base).toBe('https://cdn.example.com/img2ui/proj_abc/')
    expect(r.img2ui_version).toBe('0.1.0')
  })

  it('cdn provider 缺失 → asset_cdn_base = null', () => {
    const r = renderConfigJson(makePayload({ cdnProvider: null })) as Record<string, unknown>
    expect(r.asset_cdn_base).toBeNull()
  })
})

// =============================================================================
// renderManifestJson
// =============================================================================

describe('renderManifestJson', () => {
  it('cdn_url 缺失 → 写 null,不丢字段', () => {
    const m = renderManifestJson(assets, elements)
    expect(m).toEqual({
      el_doll: {
        filename: 'el_doll.png',
        cdn_url: 'https://cdn.example.com/img2ui/proj_abc/page_xyz/el_doll.png',
        width: 450,
        height: 534,
        element_id: 'el_doll',
      },
      el_chip: {
        filename: 'el_chip.png',
        cdn_url: null,
        width: 225,
        height: 134,
        element_id: 'el_chip',
      },
    })
  })

  it('type=code 元素的 asset 不进 manifest', () => {
    const codeAsset: Asset = {
      ...(assets[0] as Asset),
      id: 'el_frame',
      element_id: 'el_frame',
    }
    const m = renderManifestJson([...assets, codeAsset], elements)
    expect(Object.keys(m)).not.toContain('el_frame')
  })
})

// =============================================================================
// renderStateJson
// =============================================================================

describe('renderStateJson', () => {
  it('canonical state 含全部 3 元素 + bbox_pixels 反归一化', () => {
    const s = renderStateJson(states[0]!, page, elements, assets) as {
      elements: Array<{ id: string; bbox_pixels: number[]; asset_id?: string }>
    }
    expect(s.elements).toHaveLength(3)
    const doll = s.elements.find((e) => e.id === 'el_doll')!
    expect(doll.bbox_pixels).toEqual([150, 400, 450, 534])
    expect(doll.asset_id).toBe('el_doll')
  })

  it('hover state 不含 chip(state_ids 不包含)', () => {
    const s = renderStateJson(states[1]!, page, elements, assets) as {
      elements: Array<{ id: string }>
    }
    expect(s.elements.map((e) => e.id)).toEqual(['el_doll', 'el_frame'])
  })
})

// =============================================================================
// renderSpecMd snapshot
// =============================================================================

describe('renderSpecMd', () => {
  it('完整 fixture snapshot', () => {
    expect(renderSpecMd(makePayload())).toMatchInlineSnapshot(`
      "# 抽中页

      ## 项目信息

      - 项目: 奶茶盲盒活动页
      - 路由: /blind-box/win
      - 技术栈: Next.js + Tailwind
      - 状态: canonical / hover

      ## 整体描述

      一个抽奶茶盲盒的运营活动页

      ## 状态: canonical(canonical)

      画布尺寸: 750×1334

      ### 元素列表

      | id | type | name | description | asset / spec |
      |---|---|---|---|---|
      | el_doll | static | 卡通娃娃 | 蓬松云朵头发的小娃娃,蓝色羽绒服 | ↗ assets/el_doll.png |
      | el_chip | static | 奶茶 chip | 黑糖珍珠水牛乳粉色 chip | ↗ assets/el_chip.png |
      | el_frame | code | 粉色异形容器 | 圆角矩形,顶部 notch,渐变粉色 | shape: \`M0,40 L20,40 A10,10 0 0,1 30,30 ...\` |

      ### 布局描述

      - 粉色异形容器 (code, z=1) — 38,267 675×934
      - 卡通娃娃 (static, z=5) — 150,400 450×534
      - 奶茶 chip (static, z=6) — 75,934 225×133

      ### Code 元素 spec

      #### 粉色异形容器 (\`el_frame\`)

      shape:

      \`\`\`
      M0,40 L20,40 A10,10 0 0,1 30,30 ...
      \`\`\`

      material:

      \`\`\`
      linear-gradient(180deg, #FFE0EC 0%, #FFB7D5 100%)
      \`\`\`

      ## 状态: hover

      画布尺寸: 750×1334

      ### 元素列表

      | id | type | name | description | asset / spec |
      |---|---|---|---|---|
      | el_doll | static | 卡通娃娃 | 蓬松云朵头发的小娃娃,蓝色羽绒服 | ↗ assets/el_doll.png |
      | el_frame | code | 粉色异形容器 | 圆角矩形,顶部 notch,渐变粉色 | shape: \`M0,40 L20,40 A10,10 0 0,1 30,30 ...\` |

      ### 布局描述

      - 粉色异形容器 (code, z=1) — 38,267 675×934
      - 卡通娃娃 (static, z=5) — 150,400 450×534

      ### Code 元素 spec

      #### 粉色异形容器 (\`el_frame\`)

      shape:

      \`\`\`
      M0,40 L20,40 A10,10 0 0,1 30,30 ...
      \`\`\`

      material:

      \`\`\`
      linear-gradient(180deg, #FFE0EC 0%, #FFB7D5 100%)
      \`\`\`

      ## 跨状态变化

      - **粉色异形容器** (\`el_frame\`): hover 时 scale 1.02

      ## Coding agent 指令

      - 优先使用项目现有组件库(Next.js + Tailwind)
      - 异形容器用 SVG path 或 CSS clip-path 实现,具体参数见上方 spec
      - 静态资产引用 CDN URL(见 manifest.json),不要本地化;manifest.json 中 cdn_url 为 null 时 fallback 用本地 assets/ 路径
      - 多状态用 React state 切换,共享同一组件
      - raw/original-*.png 是原始设计稿,实施过程中可以肉眼参考视觉风格"
    `)
  })

  it('tech_stack_hint 缺失时 → 「未指定」', () => {
    const noTech = makePayload({
      project: { ...project, tech_stack_hint: undefined as unknown as string },
    })
    // exactOptionalPropertyTypes:undefined 不能直接赋值,这里强转模拟
    const out = renderSpecMd(noTech)
    expect(out).toContain('优先使用项目现有组件库(未指定)')
  })

  it('无 cross_state_notes 元素时不出现「跨状态变化」段', () => {
    const cleanedElements = elements.map((e) => {
      const { cross_state_notes, ...rest } = e
      void cross_state_notes
      return rest as Element
    })
    const out = renderSpecMd(makePayload({ elements: cleanedElements }))
    expect(out).not.toContain('## 跨状态变化')
  })
})

// =============================================================================
// writeExportFolder e2e(写到 tmp dir,验证文件齐全)
// =============================================================================

describe('writeExportFolder', () => {
  it('文件结构齐全', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'img2ui-export-'))
    try {
      const result = await writeExportFolder(makePayload(), tmp)
      const projectDir = result.path
      expect(projectDir).toBe(path.join(tmp, '奶茶盲盒活动页'))

      // 期望文件
      const expected = [
        'config.json',
        'pages/抽中页/meta.json',
        'pages/抽中页/states/canonical.json',
        'pages/抽中页/states/hover.json',
        'pages/抽中页/assets/manifest.json',
        'pages/抽中页/spec.md',
        'pages/抽中页/raw',
      ]
      for (const rel of expected) {
        await fs.access(path.join(projectDir, rel))
      }

      // manifest.json cdn_url=null 干净写入
      const manifest = JSON.parse(
        await fs.readFile(
          path.join(projectDir, 'pages/抽中页/assets/manifest.json'),
          'utf8',
        ),
      )
      expect(manifest.el_chip.cdn_url).toBeNull()
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  })

  it('cdnProvider=null → manifest.json 全部 cdn_url=null', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'img2ui-export-nocdn-'))
    try {
      const noCdnPayload = makePayload({
        cdnProvider: null,
        // 模拟用户跳过 CDN:asset.cdn_url 都未设置
        assets: assets.map((a) => {
          const { cdn_url, ...rest } = a
          void cdn_url
          return rest as Asset
        }),
      })
      const result = await writeExportFolder(noCdnPayload, tmp)
      const manifest = JSON.parse(
        await fs.readFile(
          path.join(result.path, 'pages/抽中页/assets/manifest.json'),
          'utf8',
        ),
      )
      expect(manifest.el_doll.cdn_url).toBeNull()
      expect(manifest.el_chip.cdn_url).toBeNull()

      // config.json 的 asset_cdn_base 也是 null
      const config = JSON.parse(
        await fs.readFile(path.join(result.path, 'config.json'), 'utf8'),
      )
      expect(config.asset_cdn_base).toBeNull()
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  })
})

// 用 renderMetaJson 避免 unused import
describe('renderMetaJson', () => {
  it('生成 states 列表,canonical 标记', () => {
    const m = renderMetaJson(makePayload()) as { states: Array<{ id: string; is_canonical: boolean }> }
    expect(m.states).toHaveLength(2)
    expect(m.states[0]!.is_canonical).toBe(true)
    expect(m.states[1]!.is_canonical).toBe(false)
  })
})
