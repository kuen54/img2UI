'use client'

import { useState, type MouseEvent, type ReactNode } from 'react'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'
import { MoreHorizontal } from 'lucide-react'

export interface MoreMenuItem {
  label: string
  /** lucide icon,16-18px,如 <Trash2 size={16} /> */
  icon?: ReactNode
  /** 危险操作:红字 + 红 icon;与普通项混排时自动加 Divider */
  danger?: boolean
  disabled?: boolean
  /** Menu 关闭后执行;二次确认(ConfirmDialog)由调用方自己管 */
  onClick: () => void
}

export interface MoreMenuProps {
  items: MoreMenuItem[]
  size?: 'small' | 'medium'
  tooltip?: string
}

/**
 * 「⋯ 更多菜单」基件:危险操作不直接曝光为红色按钮,统一收进这里。
 * 可放在卡片链接(Link 卡片)内使用——触发按钮与 MenuItem 的点击都做了
 * stopPropagation + preventDefault,不会触发卡片跳转(Menu 本身在 Portal 里)。
 */
export function MoreMenu({
  items,
  size = 'small',
  tooltip = '更多操作',
}: MoreMenuProps): React.ReactElement {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)

  const swallow = (e: MouseEvent): void => {
    e.stopPropagation()
    e.preventDefault()
  }

  const handleOpen = (e: MouseEvent<HTMLButtonElement>): void => {
    swallow(e)
    setAnchorEl(e.currentTarget)
  }

  const handleClose = (): void => setAnchorEl(null)

  const handleItem = (e: MouseEvent, item: MoreMenuItem): void => {
    swallow(e)
    handleClose()
    item.onClick()
  }

  // 展平成 ReactNode[]:danger 项与普通项的边界处自动插 Divider
  const children: ReactNode[] = []
  items.forEach((item, i) => {
    const prev = items[i - 1]
    if (prev && Boolean(prev.danger) !== Boolean(item.danger)) {
      children.push(<Divider key={`divider-${i}`} />)
    }
    children.push(
      <MenuItem
        key={i}
        disabled={item.disabled ?? false}
        onClick={(e) => handleItem(e, item)}
        sx={item.danger ? { color: 'error.main' } : {}}
      >
        {item.icon ? (
          <ListItemIcon sx={item.danger ? { color: 'error.main' } : {}}>
            {item.icon}
          </ListItemIcon>
        ) : null}
        <ListItemText>{item.label}</ListItemText>
      </MenuItem>,
    )
  })

  return (
    <>
      <Tooltip title={tooltip}>
        <IconButton size={size} aria-label={tooltip} onClick={handleOpen}>
          <MoreHorizontal size={18} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </Menu>
    </>
  )
}
