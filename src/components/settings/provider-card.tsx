'use client'

import { Trash2, Star } from 'lucide-react'

import type { ApiFormat, ProviderConfig, ProviderKind } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { ApiKeyInput } from '@/components/settings/api-key-input'
import { TestConnectionButton } from '@/components/settings/test-connection-button'
import { useConfirm } from '@/components/ui/confirm-dialog'

// =============================================================================
// ProviderCard:kind-aware,字段按 kind 渲染
//
// 注意:ProviderCard 的 onChange 接收完整的 next provider,父组件负责把它合并回 draft
// =============================================================================

export type ProviderCardProps = {
  provider: ProviderConfig
  onChange: (next: ProviderConfig) => void
  onDelete: () => void
  onSetActive: () => void
  /** 父组件 dirty 时为 true,Test Connection 禁用 */
  hasUnsavedChanges: boolean
  /** 该 provider 是否是新建未保存的(testing 完全不可用) */
  isNew: boolean
}

const MLLM_FORMATS: ApiFormat[] = ['openai', 'anthropic', 'sankuai']
const IMAGEGEN_FORMATS: ApiFormat[] = ['openai', 'apimart']
const CDN_FORMATS: ApiFormat[] = ['s3']

function apiFormatOptions(kind: ProviderKind): ApiFormat[] {
  switch (kind) {
    case 'mllm':
      return MLLM_FORMATS
    case 'image_gen':
      return IMAGEGEN_FORMATS
    case 'cdn':
      return CDN_FORMATS
  }
}

export function ProviderCard({
  provider,
  onChange,
  onDelete,
  onSetActive,
  hasUnsavedChanges,
  isNew,
}: ProviderCardProps) {
  const confirm = useConfirm()
  const update = <K extends keyof ProviderConfig>(key: K, value: ProviderConfig[K]) => {
    onChange({ ...provider, [key]: value, updated_at: new Date().toISOString() })
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: `删除「${provider.name || '未命名'}」?`,
      description: '此操作不可撤销。删除后底部点保存才生效。',
      confirmText: '删除',
      destructive: true,
    })
    if (ok) onDelete()
  }

  return (
    <Card className="relative">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1 flex-1 min-w-0">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="truncate">{provider.name || <span className="text-muted-foreground italic">未命名</span>}</span>
            {provider.active && <Badge variant="default">使用中</Badge>}
            {isNew && <Badge variant="outline">未保存</Badge>}
          </CardTitle>
          {provider.model && (
            <p className="text-xs text-muted-foreground font-mono">{provider.model}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!provider.active && (
            <Button variant="ghost" size="sm" onClick={onSetActive} title="设为该 kind 的 active">
              <Star className="size-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void handleDelete()} title="删除">
            <Trash2 className="size-4 text-red-500" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 通用字段 */}
        <Field label="名称">
          <Input value={provider.name} onChange={(e) => update('name', e.target.value)} />
        </Field>
        <Field label="API 格式">
          <Select value={provider.api_format} onValueChange={(v) => update('api_format', v as ApiFormat)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {apiFormatOptions(provider.kind).map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Base URL(API 接口地址)">
          <Input
            value={provider.base_url}
            onChange={(e) => update('base_url', e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="font-mono text-sm"
          />
        </Field>
        <Field
          label={
            provider.kind === 'cdn'
              ? '凭据(格式:ACCESS_KEY_ID:SECRET)'
              : 'API Key'
          }
        >
          <ApiKeyInput value={provider.api_key} onChange={(v) => update('api_key', v)} />
        </Field>

        {/* mllm / image_gen 都要 model */}
        {provider.kind !== 'cdn' && (
          <Field label="模型 ID">
            <Input
              value={provider.model ?? ''}
              onChange={(e) => update('model', e.target.value)}
              placeholder={provider.kind === 'mllm' ? 'gpt-4o / gemini-3.1-pro-preview' : 'gpt-image-2-official'}
              className="font-mono text-sm"
            />
          </Field>
        )}

        {/* mllm 专属 */}
        {provider.kind === 'mllm' && (
          <>
            <Field label={`默认温度(temperature = ${provider.default_temperature ?? 1})`}>
              <Slider
                value={[provider.default_temperature ?? 1]}
                onValueChange={(v) => {
                  const num = Array.isArray(v) ? v[0] : v
                  if (typeof num === 'number') update('default_temperature', num)
                }}
                min={0}
                max={2}
                step={0.1}
              />
            </Field>
            <Field label="默认最大 token(中文 30+ 元素建议 ≥ 32000)">
              <Input
                type="number"
                value={provider.default_max_tokens ?? 12000}
                onChange={(e) => update('default_max_tokens', Number(e.target.value))}
              />
            </Field>
            <Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={provider.vision_capable ?? false}
                  onCheckedChange={(v) => update('vision_capable', !!v)}
                />
                支持视觉输入(必须勾选才能跑 Pass 1 布局分析)
              </label>
            </Field>
          </>
        )}

        {/* image_gen 专属 */}
        {provider.kind === 'image_gen' && (
          <>
            <Field label="接口类型">
              <Select
                value={provider.endpoint_kind ?? 'image_generation'}
                onValueChange={(v) => update('endpoint_kind', v as 'image_edit' | 'image_generation')}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="image_generation">文生图 image_generation(POST /images/generations)</SelectItem>
                  <SelectItem value="image_edit">图生图 image_edit(POST /images/edits)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={provider.is_async ?? false}
                  onCheckedChange={(v) => update('is_async', !!v)}
                />
                异步模式(submit + poll,如 apimart)
              </label>
            </Field>
            <Field label="默认画质">
              <Select
                value={provider.default_quality ?? 'high'}
                onValueChange={(v) => update('default_quality', v as 'low' | 'medium' | 'high')}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">high(必选,否则文字乱码)</SelectItem>
                  <SelectItem value="medium">medium</SelectItem>
                  <SelectItem value="low">low</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </>
        )}

        {/* cdn 专属 */}
        {provider.kind === 'cdn' && (
          <>
            <Field label="Bucket(对象存储 bucket 名)">
              <Input value={provider.bucket ?? ''} onChange={(e) => update('bucket', e.target.value)} />
            </Field>
            <Field label="区域 Region">
              <Input value={provider.region ?? ''} onChange={(e) => update('region', e.target.value)} placeholder="us-east-1" />
            </Field>
            <Field label="公网 URL 前缀(Public URL prefix)">
              <Input
                value={provider.public_url_prefix ?? ''}
                onChange={(e) => update('public_url_prefix', e.target.value)}
                placeholder="https://cdn.foo.com/img2ui/"
                className="font-mono text-sm"
              />
            </Field>
          </>
        )}

        {/* Test Connection */}
        {!isNew && (
          <div className="pt-2">
            <div className="flex items-center gap-2 flex-wrap">
              <TestConnectionButton providerId={provider.id} disabled={hasUnsavedChanges} />
              {hasUnsavedChanges && (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠ 有未保存改动,请先点底部「保存」再测试连通
                </span>
              )}
            </div>
          </div>
        )}
        {isNew && (
          <p className="text-xs text-muted-foreground pt-2">新增 provider 需先「保存」后才能测试连通。</p>
        )}
      </CardContent>
    </Card>
  )
}

function Field({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && <Label className="text-xs">{label}</Label>}
      {children}
    </div>
  )
}
