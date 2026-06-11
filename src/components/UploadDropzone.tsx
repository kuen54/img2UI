'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errText } from '@/lib/error-text'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import LinearProgress from '@mui/material/LinearProgress'
import { FileUp as UploadFileIcon, X as CloseIcon } from 'lucide-react'
import { dotGridBg } from '@/theme'

/**
 * 两种模式互斥,discriminated union 让非法组合(什么都不传 / 两模式混传)
 * 在 tsc 阶段就报错,不靠运行时静默仲裁。
 */
export type UploadDropzoneProps = (
  | {
      /** 上传模式:选中文件立即 POST 到 /api/pages/{pageId}/states */
      pageId: string
      onUploaded: () => void
      onFileSelected?: never
      selectedFile?: never
    }
  | {
      pageId?: never
      onUploaded?: never
      /**
       * 选择模式(受控):仅回调选中文件,不上传;移除重选时回调 null。
       */
      onFileSelected: (file: File | null) => void
      /** 选择模式下当前已选文件(由调用方持有 state) */
      selectedFile: File | null
    }
) & {
  /** 紧凑版(Dialog 内用):小 padding / 小图标 / 小按钮 */
  compact?: boolean
  /** 禁用交互(拖放/选择/移除),表单提交在途时用 */
  disabled?: boolean
}

function isPng(file: File): boolean {
  return file.type.includes('png') || file.name.toLowerCase().endsWith('.png')
}

/**
 * PNG 设计稿拖拽上传区,两用:
 * - 上传模式(pageId + onUploaded):选中即上传,带 LinearProgress 进度态
 * - 选择模式(onFileSelected + selectedFile):仅选择不上传,
 *   已选文件显示缩略图 + 文件名,可移除重选(新建页面 Dialog 用)
 */
export function UploadDropzone(props: UploadDropzoneProps): React.ReactElement {
  const { compact = false, disabled = false } = props
  const [uploading, setUploading] = useState(false)
  const [uploadingName, setUploadingName] = useState('')
  const [drag, setDrag] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const selectMode = props.onFileSelected !== undefined
  const selectedFile = props.selectedFile ?? null

  // 选择模式缩略图:objectURL 随 selectedFile 重建并回收
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(selectedFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedFile])

  const upload = async (
    file: File,
    pageId: string,
    onUploaded: () => void,
  ): Promise<void> => {
    setUploading(true)
    setUploadingName(file.name)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/pages/${pageId}/states`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success('上传成功')
      onUploaded()
    } catch (err) {
      toast.error(`上传失败:${errText(err)}`)
    } finally {
      setUploading(false)
    }
  }

  const handleFile = (file: File): void => {
    if (disabled) return
    if (!isPng(file)) {
      toast.error('只接受 PNG 文件')
      return
    }
    if (props.onFileSelected) {
      props.onFileSelected(file)
      return
    }
    void upload(file, props.pageId, props.onUploaded)
  }

  // 选择模式 + 已有文件:显示文件名/缩略图 + 移除重选
  if (selectMode && selectedFile) {
    return (
      <Paper
        variant="outlined"
        sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}
      >
        {previewUrl && (
          <Box
            component="img"
            src={previewUrl}
            alt={selectedFile.name}
            sx={{
              width: 48,
              height: 48,
              objectFit: 'contain',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.default',
              flexShrink: 0,
            }}
          />
        )}
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="body2" noWrap>
            {selectedFile.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {Math.round(selectedFile.size / 1024)} KB
          </Typography>
        </Box>
        <IconButton
          size="small"
          aria-label="移除文件"
          disabled={disabled}
          onClick={() => props.onFileSelected?.(null)}
        >
          <CloseIcon size={16} />
        </IconButton>
      </Paper>
    )
  }

  const iconSize = compact ? 28 : 44

  return (
    <Paper
      variant="outlined"
      onDragOver={(e) => {
        // disabled 时仍 preventDefault,避免浏览器默认行为(导航到文件)
        e.preventDefault()
        if (!disabled) setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        if (disabled) return
        const file = e.dataTransfer.files[0]
        if (file) handleFile(file)
      }}
      sx={{
        py: compact ? 3 : 8,
        textAlign: 'center',
        borderStyle: 'dashed',
        borderWidth: 2,
        borderColor: drag ? 'primary.main' : 'divider',
        bgcolor: drag ? 'action.hover' : 'background.paper',
        // 草稿本叙事:dropzone 是"待绘制区域",点阵比页面背景加强一档
        ...dotGridBg(0.16),
        transition: 'all 0.2s',
        ...(disabled && { opacity: 0.5 }),
      }}
    >
      {uploading ? (
        <Stack alignItems="center" spacing={2} sx={{ px: 6 }}>
          <Box sx={{ color: 'primary.main', display: 'flex' }}>
            <UploadFileIcon size={iconSize} strokeWidth={1.5} />
          </Box>
          <Box sx={{ width: '100%', maxWidth: 360 }}>
            <LinearProgress />
          </Box>
          <Typography variant="body2" color="text.secondary">
            上传中 <code>{uploadingName}</code> …
          </Typography>
        </Stack>
      ) : (
        <Stack alignItems="center" spacing={compact ? 1 : 2}>
          <Box sx={{ color: 'text.secondary', display: 'flex' }}>
            <UploadFileIcon size={iconSize} strokeWidth={1.5} />
          </Box>
          <Typography variant={compact ? 'body2' : 'h5'}>
            拖拽 PNG 到此处 或
          </Typography>
          <Button
            variant="contained"
            size={compact ? 'small' : 'medium'}
            startIcon={<UploadFileIcon />}
            disabled={disabled}
            onClick={() => fileInput.current?.click()}
          >
            选择文件
          </Button>
          {!selectMode && (
            <Typography variant="body2" color="text.secondary">
              每个页面仅支持 1 张设计稿
            </Typography>
          )}
        </Stack>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".png,image/png"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ''
        }}
      />
    </Paper>
  )
}
