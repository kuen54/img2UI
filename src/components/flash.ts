'use client'

import { keyframes } from '@emotion/react'
import { alpha } from '@mui/material/styles'

/**
 * 操作成功的微反馈:目标行/卡片绿底闪一下再淡出。
 * 用法:`sx={{ animation: `${successFlash} 700ms ${MD3_STANDARD_EASING}` }}`,
 * 配合一个递增 key(每次触发换 key 重放动画)。
 */
export const successFlash = keyframes`
  0% { background-color: ${alpha('#16a34a', 0.22)}; }
  100% { background-color: transparent; }
`

export const MD3_STANDARD_EASING = 'cubic-bezier(0.2, 0, 0, 1)'
