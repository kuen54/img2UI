'use client'

import { Plus } from 'lucide-react'

import type { AppConfig, ProviderConfig } from '@/lib/types'
import { newProviderId } from '@/lib/id'
import { Button } from '@/components/ui/button'
import { ProviderCard } from '@/components/settings/provider-card'
import { StickySaveBar } from '@/components/ui/sticky-save-bar'
import { useConfigDraft } from '@/app/settings/_lib/use-config-draft'

export default function CdnPage() {
  const { saved, draft, setDraft, dirty, saving, loading, save } = useConfigDraft()

  if (loading || !draft) {
    return <p className="text-sm text-muted-foreground">加载中…</p>
  }

  const cdnProviders = draft.providers.filter((p) => p.kind === 'cdn')

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

  const setActive = (id: string) => {
    setDraft({
      ...draft,
      providers: draft.providers.map((p) =>
        p.kind === 'cdn' ? { ...p, active: p.id === id } : p,
      ),
    })
  }

  const addProvider = () => {
    const now = new Date().toISOString()
    const newProvider: ProviderConfig = {
      id: newProviderId(),
      kind: 'cdn',
      name: '新 CDN provider',
      api_format: 's3',
      base_url: '',
      api_key: '',
      bucket: '',
      region: 'us-east-1',
      public_url_prefix: '',
      active: false,
      created_at: now,
      updated_at: now,
    }
    setDraft({ ...draft, providers: [...draft.providers, newProvider] })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">CDN</h2>
          <p className="text-sm text-muted-foreground">
            用于上传切片后的资产 PNG。MVP-α 默认 AWS S3(api_format=&apos;s3&apos;)。
            凭据格式为 <code className="font-mono text-xs">ACCESS_KEY_ID:SECRET</code>(冒号分隔)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={addProvider}>
          <Plus className="size-3 mr-1" />+ 新增 CDN
        </Button>
      </div>

      {cdnProviders.length === 0 ? (
        <div className="text-sm text-muted-foreground border border-dashed rounded-md p-8 text-center">
          暂无 CDN provider,点上方按钮新增
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cdnProviders.map((p) => (
            <ProviderCard
              key={p.id}
              provider={p}
              onChange={(next) => updateProvider(p.id, next)}
              onDelete={() => deleteProvider(p.id)}
              onSetActive={() => setActive(p.id)}
              hasUnsavedChanges={dirty}
              isNew={!savedHasId(saved, p.id)}
            />
          ))}
        </div>
      )}

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
