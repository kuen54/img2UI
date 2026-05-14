'use client'

import { Plus } from 'lucide-react'

import type { ProviderConfig, ProviderKind, AppConfig } from '@/lib/types'
import { newProviderId } from '@/lib/id'
import { Button } from '@/components/ui/button'
import { ProviderCard } from '@/components/settings/provider-card'
import { StickySaveBar } from '@/components/ui/sticky-save-bar'
import { useConfigDraft } from '@/app/settings/_lib/use-config-draft'

export default function ModelsPage() {
  const { saved, draft, setDraft, dirty, saving, loading, save } = useConfigDraft()

  if (loading || !draft) {
    return <p className="text-sm text-muted-foreground">加载中…</p>
  }

  const mllmProviders = draft.providers.filter((p) => p.kind === 'mllm')
  const imageGenProviders = draft.providers.filter((p) => p.kind === 'image_gen')

  const updateProvider = (id: string, next: ProviderConfig) => {
    setDraft({
      ...draft,
      providers: draft.providers.map((p) => (p.id === id ? next : p)),
    })
  }

  const deleteProvider = (id: string) => {
    setDraft({
      ...draft,
      providers: draft.providers.filter((p) => p.id !== id),
    })
  }

  const setActive = (id: string, kind: ProviderKind) => {
    setDraft({
      ...draft,
      providers: draft.providers.map((p) =>
        p.kind === kind ? { ...p, active: p.id === id } : p,
      ),
    })
  }

  const addProvider = (kind: 'mllm' | 'image_gen') => {
    const now = new Date().toISOString()
    const newProvider: ProviderConfig =
      kind === 'mllm'
        ? {
            id: newProviderId(),
            kind: 'mllm',
            name: '新 MLLM provider',
            api_format: 'openai',
            base_url: 'https://api.openai.com/v1',
            api_key: '',
            model: '',
            default_temperature: 1,
            default_max_tokens: 12000,
            vision_capable: true,
            active: false,
            created_at: now,
            updated_at: now,
          }
        : {
            id: newProviderId(),
            kind: 'image_gen',
            name: '新 ImageGen provider',
            api_format: 'apimart',
            base_url: 'https://api.apimart.ai/v1',
            api_key: '',
            model: '',
            endpoint_kind: 'image_generation',
            is_async: true,
            poll_interval_seconds: 5,
            poll_initial_delay_seconds: 12,
            poll_max_attempts: 24,
            default_quality: 'high',
            active: false,
            created_at: now,
            updated_at: now,
          }
    setDraft({ ...draft, providers: [...draft.providers, newProvider] })
  }

  return (
    <div className="space-y-8">
      <Section
        title="Multimodal LLM"
        description="用于 Pass 1 布局分析。MVP-α 推荐 sankuai gemini-3.1-pro-preview(CJK 准确度高)"
        addLabel="+ 新增 MLLM"
        onAdd={() => addProvider('mllm')}
      >
        {mllmProviders.length === 0 ? (
          <EmptyHint>暂无 MLLM provider,点上方按钮新增</EmptyHint>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {mllmProviders.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                onChange={(next) => updateProvider(p.id, next)}
                onDelete={() => deleteProvider(p.id)}
                onSetActive={() => setActive(p.id, 'mllm')}
                hasUnsavedChanges={dirty}
                isNew={!savedHasId(saved, p.id)}
              />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="ImageGen"
        description="用于 Pass 2 资产提取。MVP-α 推荐 apimart gpt-image-2-official + quality=high(绿幕路径已验证)"
        addLabel="+ 新增 ImageGen"
        onAdd={() => addProvider('image_gen')}
      >
        {imageGenProviders.length === 0 ? (
          <EmptyHint>暂无 ImageGen provider</EmptyHint>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {imageGenProviders.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                onChange={(next) => updateProvider(p.id, next)}
                onDelete={() => deleteProvider(p.id)}
                onSetActive={() => setActive(p.id, 'image_gen')}
                hasUnsavedChanges={dirty}
                isNew={!savedHasId(saved, p.id)}
              />
            ))}
          </div>
        )}
      </Section>

      <StickySaveBar
        dirty={dirty}
        saving={saving}
        onSave={save}
        onCancel={() => saved && setDraft(saved)}
      />
    </div>
  )
}

function savedHasId(saved: AppConfig | null, id: string): boolean {
  return !!saved?.providers.some((p) => p.id === id)
}

function Section({
  title,
  description,
  addLabel,
  onAdd,
  children,
}: {
  title: string
  description: string
  addLabel: string
  onAdd: () => void
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="size-3 mr-1" />
          {addLabel}
        </Button>
      </div>
      {children}
    </section>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-muted-foreground border border-dashed rounded-md p-6 text-center">
      {children}
    </div>
  )
}
