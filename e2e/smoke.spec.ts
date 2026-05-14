import { test, expect } from '@playwright/test'

// 不依赖真 LLM key,只验证页面渲染 / 路由通畅 / 关键 UI 元素出现
// 真实端到端(Pass 1/2)由 dogfood 手工跑过(见 docs/plans/phase-7-polish-dogfood.md)

test.describe('页面渲染 smoke test', () => {
  test('/ 重定向到 /projects', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/projects/)
    await expect(page.locator('aside').getByText('img2UI')).toBeVisible()
  })

  test('/projects 渲染 + 「新建项目」按钮', async ({ page }) => {
    await page.goto('/projects')
    await expect(page.getByRole('button', { name: '新建项目' })).toBeVisible()
  })

  test('/settings/models 渲染 + 4 张 provider 卡片', async ({ page }) => {
    await page.goto('/settings/models')
    await expect(page.getByRole('heading', { name: 'Multimodal LLM' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'ImageGen' })).toBeVisible()
    // sankuai gemini default + OpenAI 备选 = 2 张 mllm + 2 张 image_gen = 4 张
    const testButtons = page.getByRole('button', { name: 'Test Connection' })
    await expect(testButtons).toHaveCount(4)
  })

  test('/settings/cdn 渲染', async ({ page }) => {
    await page.goto('/settings/cdn')
    await expect(page.getByRole('button', { name: '+ 新增 CDN' })).toBeVisible()
  })

  test('/settings/prompts 渲染', async ({ page }) => {
    await page.goto('/settings/prompts')
    // prompts 页面有 textarea
    const textareas = page.locator('textarea')
    await expect(textareas.first()).toBeVisible()
  })

  test('console 无 error / warning', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/projects')
    await page.goto('/settings/models')
    await page.goto('/settings/cdn')

    // React DevTools 推广 / Fast Refresh 等 info / log 不算
    expect(errors).toEqual([])
  })
})

test.describe('CRUD 烟测', () => {
  test('UI 创建项目 → 列表显示', async ({ page }) => {
    const projectName = `e2e-test-${Date.now()}`

    await page.goto('/projects')
    await page.getByRole('button', { name: '新建项目' }).click()
    await page.getByRole('textbox', { name: '项目名 *' }).fill(projectName)
    await page.getByRole('button', { name: '创建', exact: true }).click()

    // 等列表刷新 + 新项目卡片(用 link role 避开 toast 文字撞)
    await expect(
      page.getByRole('link', { name: new RegExp(projectName) }).first(),
    ).toBeVisible({ timeout: 10000 })
  })

  test('API 创建 → URL 进入项目页 → 显示「暂无页面」EmptyState', async ({ page, request }) => {
    const projectName = `e2e-api-${Date.now()}`

    const res = await request.post('/api/projects', {
      data: { name: projectName },
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    })
    expect(res.ok()).toBe(true)
    const project = (await res.json()) as { id: string }
    expect(project.id).toMatch(/^proj_/)

    await page.goto(`/projects/${project.id}`)
    await expect(page.getByText('暂无页面')).toBeVisible({ timeout: 5000 })
  })
})
