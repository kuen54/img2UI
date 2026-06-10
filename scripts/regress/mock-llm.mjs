// 回归测试 mock server:同时模拟 mllm(openai chat)和 image_gen(openai sync)。
// 环境变量:
//   MOCK_PORT  监听端口(默认 4567)
//   IMG_DIR    gen-images.mjs 的输出目录(绿幕 PNG 所在)
// 失败注入:往 ${IMG_DIR}/control.json 写 { "failCategoriesCn": ["主体"] },
//   对应 category 的 pass2 image_gen 请求会返回 500(prompt 含「的主体类元素」)。
import http from 'node:http'
import { readFileSync } from 'node:fs'

const PORT = Number(process.env.MOCK_PORT ?? 4567)
const DIR = process.env.IMG_DIR
if (!DIR) {
  console.error('IMG_DIR env required')
  process.exit(1)
}

const img = (n) => readFileSync(`${DIR}/${n}`).toString('base64')

function control() {
  try {
    return JSON.parse(readFileSync(`${DIR}/control.json`, 'utf-8'))
  } catch {
    return {}
  }
}

// Pass 1 各路 canned elements:只有 subject / button 两路返回内容,
// 其余三路返回空(路次本身算成功,满足 ≥3/5 阈值)
const PASS1 = {
  subject: [
    {
      entity_name: '红色方块',
      type: 'static',
      bbox: [0.1, 0.1, 0.12, 0.12],
      z_index: 1,
      description: 'mock 红色方块主体',
    },
  ],
  button: [
    {
      entity_name: '蓝色方块',
      type: 'static',
      bbox: [0.5, 0.5, 0.12, 0.12],
      z_index: 1,
      description: 'mock 蓝色按钮',
    },
  ],
}

const VALIDATE = {
  elements: [
    {
      entity_name: '红色方块',
      complete: true,
      alpha_quality: 0.95,
      style_match: 0.9,
      contamination: false,
      notes: 'mock-validate-ok',
    },
    {
      entity_name: '蓝色方块',
      complete: true,
      alpha_quality: 0.88,
      style_match: 0.9,
      contamination: false,
      notes: 'mock-validate-ok',
    },
  ],
}

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const json = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(obj))
    }
    let parsed = {}
    try {
      parsed = JSON.parse(body || '{}')
    } catch {}

    // ── mllm:pass1 各路(按 system prompt 里的 category 区分)或 validate ──
    if (req.url?.endsWith('/chat/completions')) {
      const sys = String(
        (parsed.messages ?? []).find((m) => m.role === 'system')?.content ?? '',
      )
      let content
      if (sys.includes('quality validator')) {
        content = JSON.stringify(VALIDATE)
      } else {
        const m = sys.match(/focuses on .* \((\w+)\)/)
        const cat = m?.[1] ?? ''
        content = JSON.stringify({ elements: PASS1[cat] ?? [] })
        console.log(
          `[mock mllm] pass1 route=${cat} -> ${PASS1[cat]?.length ?? 0} elements`,
        )
      }
      return json(200, {
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      })
    }

    // ── image_gen:按 pass2 prompt 里的「的X类元素」选绿幕图 / 注入失败 ──
    if (req.url?.endsWith('/images/generations')) {
      const prompt = String(parsed.prompt ?? '')
      const fails = control().failCategoriesCn ?? []
      for (const cn of fails) {
        if (prompt.includes(`的${cn}类元素`)) {
          console.log(`[mock imagegen] FAIL injected for ${cn}`)
          return json(500, { error: `mock-injected-failure-${cn}` })
        }
      }
      let file = 'green-both.png'
      if (prompt.includes('的主体类元素')) file = 'green-subject.png'
      else if (prompt.includes('的按钮类元素')) file = 'green-button.png'
      else if (prompt.includes('红色方块')) file = 'green-subject.png' // re-extract
      else if (prompt.includes('蓝色方块')) file = 'green-button.png'
      console.log(`[mock imagegen] -> ${file}`)
      return json(200, { data: [{ b64_json: img(file) }] })
    }

    json(404, { error: `mock: unknown path ${req.url}` })
  })
})

server.listen(PORT, () => console.log(`mock llm on :${PORT}`))
