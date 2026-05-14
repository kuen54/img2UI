'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { isMasked } from '@/lib/mask'

// =============================================================================
// ApiKeyInput:密码输入 + 显示/隐藏 + 「未改动」提示
//
// 当 value 是 mask 字符串(sk-***xxxx 等)时,提示用户「不输入即从磁盘还原」
// 用户输入后 mask pattern 不再 match,提示消失
// =============================================================================

export type ApiKeyInputProps = {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  id?: string
}

export function ApiKeyInput({ value, onChange, placeholder, id }: ApiKeyInputProps) {
  const [show, setShow] = useState(false)
  const masked = isMasked(value)

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? 'sk-...'}
          className="pr-10 font-mono"
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute top-0 right-0 h-full px-2"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
      {masked && (
        <p className="text-xs text-muted-foreground">
          当前为遮罩值。<span className="font-medium text-foreground">不修改</span>则保留磁盘上的原值;开始输入会替换为新值。
        </p>
      )}
    </div>
  )
}
