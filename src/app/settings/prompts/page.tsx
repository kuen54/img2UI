'use client'

import { RotateCcw } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StickySaveBar } from '@/components/ui/sticky-save-bar'
import { useConfigDraft } from '@/app/settings/_lib/use-config-draft'
import {
  DEFAULT_PASS1_LAYOUT,
  DEFAULT_PASS2_EXTRACT,
  DEFAULT_PASS2_VALIDATE,
  DEFAULT_CODING_AGENT_INTRO,
} from '@/lib/seeds/default-prompts'

const SECTIONS = [
  {
    key: 'pass1_layout' as const,
    title: 'Pass 1 — 布局分析',
    description: '发给 mllm 的 system message,识别页面元素 + 输出 bbox + 二分类(static/code)。',
    placeholders: [],
    default: DEFAULT_PASS1_LAYOUT,
  },
  {
    key: 'pass2_extract' as const,
    title: 'Pass 2 — 资产提取',
    description: '发给 image-edit 模型(gpt-image-2-official),输出绿幕 #00FF00 背景的元素拆解图。',
    placeholders: ['{{page_description}}', '{{element_summary}}', '{{element_count}}'],
    default: DEFAULT_PASS2_EXTRACT,
  },
  {
    key: 'pass2_validate' as const,
    title: 'Pass 2 反向校验',
    description: '发给 mllm 的 system message,评估每个元素的提取质量(complete / alpha_quality / contamination)。',
    placeholders: [],
    default: DEFAULT_PASS2_VALIDATE,
  },
  {
    key: 'coding_agent_intro' as const,
    title: 'Coding agent 指令',
    description: '写到 Export 出来的 spec.md 顶部,告诉 coding agent 怎么消费这套素材。',
    placeholders: [],
    default: DEFAULT_CODING_AGENT_INTRO,
  },
]

export default function PromptsPage() {
  const { saved, draft, setDraft, dirty, saving, loading, save } = useConfigDraft()

  if (loading || !draft) {
    return <p className="text-sm text-muted-foreground">加载中…</p>
  }

  const update = (key: keyof typeof draft.prompts, value: string) => {
    setDraft({ ...draft, prompts: { ...draft.prompts, [key]: value } })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Prompts</h2>
        <p className="text-sm text-muted-foreground">
          四段 prompt 模板,跑 Pass 1 / Pass 2 / 校验时用。改了点底部保存,后续每次 pipeline 跑都用新版本。
        </p>
      </div>

      {SECTIONS.map((sec) => (
        <Card key={sec.key}>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">{sec.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{sec.description}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => update(sec.key, sec.default)}
                title="重置为默认值"
              >
                <RotateCcw className="size-3 mr-1" /> 重置默认
              </Button>
            </div>
            {sec.placeholders.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap pt-2">
                <span className="text-xs text-muted-foreground">必须保留的占位符:</span>
                {sec.placeholders.map((p) => (
                  <Badge key={p} variant="secondary" className="font-mono text-xs">{p}</Badge>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Textarea
              value={draft.prompts[sec.key]}
              onChange={(e) => update(sec.key, e.target.value)}
              rows={12}
              className="font-mono text-xs leading-relaxed"
              spellCheck={false}
            />
          </CardContent>
        </Card>
      ))}

      <StickySaveBar
        dirty={dirty}
        saving={saving}
        onSave={save}
        onCancel={() => saved && setDraft(saved)}
      />
    </div>
  )
}
