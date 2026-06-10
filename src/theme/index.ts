'use client'

import { createElement } from 'react'
import { createTheme, alpha } from '@mui/material/styles'
import {
  ChevronDown,
  CircleCheck,
  Info,
  TriangleAlert,
  CircleAlert,
} from 'lucide-react'

// 视觉语言:Vercel/Geist 单色系(2026-06 焕新,替代此前的 MD3 方向)
// 核心原则:
// 1. 单色为底 —— 纯白表面 + 纯中性灰阶 + 近黑 ink;颜色只用于含义(主操作/链接/状态),
//    hover/selected/focus 等 state layer 一律中性灰,蓝色从装饰位全面撤出
// 2. 边线代替阴影 —— 1px hairline(#eaeaea)划分层级;阴影只给真正浮起的层
//    (Menu/Popover/Dialog),且是低透明度大偏移的 ambient,不用黑色重影
// 3. 圆角两档 —— 控件 6 / 容器 8(Dialog 10),告别 pill 与 28px 大圆角
// 4. 排印即品牌 —— Geist 负 tracking 标题、零 tracking 正文、mono 数字
// 5. 克制的微状态 —— hover 4% / selected 6% / focus 8%,过渡 150-250ms

// ─── 纯中性灰阶(无色温) ──────────────────────────────────────────────────
const N = {
  50: '#fafafa',
  100: '#f5f5f5',
  200: '#eaeaea',
  300: '#d4d4d4',
  400: '#a1a1a1',
  500: '#737373',
  600: '#525252',
  700: '#3f3f3f',
  800: '#262626',
  900: '#0a0a0a',
} as const

// 主色:Vercel 蓝。只出现在 contained 主按钮、链接、focus ring、Tab 指示条、选择控件
export const PRIMARY = '#0070f3'
const PRIMARY_LIGHT = '#3291ff'
const PRIMARY_DARK = '#0761d1'

// mono 字体栈:数字 / ID / 坐标 / 路径用(StatChip 等消费)
export const FONT_MONO =
  'var(--font-geist-mono), ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'

// ─── 草稿本点阵 ──────────────────────────────────────────────────────────
// 设计工具画布的"草稿纸"质感:页面背景铺阈下点阵(1px 点 / 20px 间距 / ≤6% 透明度),
// 卡片与弹层是纯白实底,内容浮在点阵之上。调参只动这两个常量。
const DOT_SPACING = 20
const DOT_ALPHA = 0.11

/** dot grid 背景(dropzone 等"待绘制区域"可传更高 alpha 加强一档) */
export function dotGridBg(alpha: number = DOT_ALPHA, spacing: number = DOT_SPACING): {
  backgroundImage: string
  backgroundSize: string
} {
  return {
    backgroundImage: `radial-gradient(circle, rgba(0, 0, 0, ${alpha}) 1px, transparent 1px)`,
    backgroundSize: `${spacing}px ${spacing}px`,
  }
}

// ─── surface token ───────────────────────────────────────────────────────
// key 沿用 MD3 命名(应用层有 6 处引用,保持兼容),值重映射到单色系:
// 表面一律纯白,层级靠 outlineVariant hairline 划分;container 系只给
// 极少数需要"凹下去"的占位区(空状态底、kbd 胶囊)
const SURFACE = {
  containerLowest: '#ffffff',
  containerLow: '#ffffff',
  container: N[50],
  containerHigh: N[100],
  containerHighest: N[200],
  outline: N[300],
  outlineVariant: N[200],
} as const

declare module '@mui/material/styles' {
  interface Palette {
    surface: typeof SURFACE
  }
  interface PaletteOptions {
    surface?: typeof SURFACE
  }
}

// 字体栈:Geist Sans(latin)+ CJK fallback
const FONT_STACK =
  'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Hiragino Sans GB", system-ui, sans-serif'

// ambient 阴影:只给浮层,低透明度 + 大偏移,绝不用 0.30 级黑影
const SHADOW = {
  xs: '0 1px 2px rgba(0, 0, 0, 0.05)',
  sm: '0 4px 12px rgba(0, 0, 0, 0.08)',
  md: '0 8px 24px rgba(0, 0, 0, 0.10)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.12)',
  xl: '0 16px 48px rgba(0, 0, 0, 0.16)',
} as const

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: PRIMARY,
      light: PRIMARY_LIGHT,
      dark: PRIMARY_DARK,
      contrastText: '#ffffff',
    },
    secondary: {
      main: N[600],
      light: N[400],
      dark: N[800],
      contrastText: '#ffffff',
    },
    // 状态色维持降饱和版本(语义色,不参与"装饰")
    error: { main: '#b91c1c', light: '#fee2e2', dark: '#991b1b', contrastText: '#fff' },
    success: { main: '#16a34a', light: '#dcfce7', dark: '#15803d', contrastText: '#fff' },
    warning: { main: '#d97706', light: '#fef3c7', dark: '#b45309', contrastText: '#fff' },
    info: { main: '#0ea5e9', light: '#e0f2fe', dark: '#0369a1', contrastText: '#fff' },
    background: {
      // 表面归白:page 与 paper 都是纯白,层级靠 1px 边线,不靠灰阶染色
      default: '#ffffff',
      paper: '#ffffff',
    },
    divider: SURFACE.outlineVariant,
    surface: SURFACE,
    text: {
      primary: N[900],
      // 14px 中文在浅灰下显薄(历史教训),secondary 用 N600(#525252,
      // 对白底约 7.4:1)而非 Vercel 默认的 #666
      secondary: N[600],
      disabled: N[400],
    },
    grey: N,
    action: {
      // 中性 state layer:hover 4% / selected 6% / focus 8% —— 全部去蓝
      hover: 'rgba(0, 0, 0, 0.04)',
      hoverOpacity: 0.04,
      selected: 'rgba(0, 0, 0, 0.06)',
      selectedOpacity: 0.06,
      focus: 'rgba(0, 0, 0, 0.08)',
      focusOpacity: 0.08,
      disabled: N[300],
      disabledBackground: N[100],
      disabledOpacity: 0.38,
    },
  },
  shape: {
    // sx borderRadius 数值的乘数基:1 = 8px(容器档),0.75 = 6px(控件档)
    borderRadius: 8,
  },
  // 过渡:比 MD3 更快半拍(snappy = premium),easing 维持 standard 曲线
  transitions: {
    duration: {
      shortest: 100,
      shorter: 150,
      short: 200,
      standard: 250,
      complex: 300,
      enteringScreen: 200,
      leavingScreen: 150,
    },
    easing: {
      easeInOut: 'cubic-bezier(0.2, 0, 0, 1)',
      easeOut: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
      easeIn: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
      sharp: 'cubic-bezier(0.2, 0, 0, 1)',
    },
  },
  typography: {
    fontFamily: FONT_STACK,
    // Geist 排印:标题 600 + 负 tracking(字号越大收得越紧),正文零 tracking
    // (MD3 的正 tracking 是"Material 味"的来源之一,全部去掉)
    h1: { fontSize: '2.25rem', fontWeight: 600, letterSpacing: '-0.035em', lineHeight: '2.75rem' },
    h2: { fontSize: '1.75rem', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: '2.25rem' },
    h3: { fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.025em', lineHeight: '2rem' },
    h4: { fontSize: '1.375rem', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: '1.75rem' },
    h5: { fontSize: '1rem', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: '1.5rem' },
    // h6:section label(uppercase 12px),不映射标题层级
    h6: {
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: N[600],
    },
    body1: { fontSize: '1rem', lineHeight: '1.5rem', letterSpacing: 0 },
    body2: { fontSize: '0.875rem', lineHeight: '1.25rem', letterSpacing: 0 },
    caption: {
      fontSize: '0.75rem',
      lineHeight: '1rem',
      letterSpacing: 0,
      color: N[600],
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: '1.25rem',
      letterSpacing: 0,
      textTransform: 'none',
    },
    overline: {
      fontSize: '0.6875rem',
      fontWeight: 600,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      lineHeight: '1rem',
      color: N[600],
    },
  },
  // 25 槽 shadows 重映射到 ambient 阴影:resting 几乎无影(层级靠边线),
  // sx boxShadow: 3 之类的交互升起用 sm,浮层用 md/lg,Dialog 用 xl
  shadows: [
    'none', // 0
    SHADOW.xs, SHADOW.xs, // 1-2
    SHADOW.sm, SHADOW.sm, SHADOW.sm, // 3-5 hover Card
    SHADOW.md, SHADOW.md, // 6-7 dropdown
    SHADOW.lg, SHADOW.lg, SHADOW.lg, SHADOW.lg, // 8-11
    SHADOW.xl, SHADOW.xl, SHADOW.xl, SHADOW.xl, SHADOW.xl, SHADOW.xl,
    SHADOW.xl, SHADOW.xl, SHADOW.xl, SHADOW.xl, SHADOW.xl, SHADOW.xl, // 12-23
    SHADOW.xl, // 24 Dialog default
  ] as unknown as import('@mui/material/styles').Shadows,
  components: {
    // state layer 用 CSS bg overlay,不要 ripple 动效
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          // 草稿本点阵:AppBar 的半透明 blur 会把它糊成隐约纹理,正好
          ...dotGridBg(),
        },
        '*': {
          fontFamily: 'inherit',
        },
        // focus ring:键盘 focus 时 2px primary outline(蓝色保留位之一)
        '*:focus-visible': {
          outline: `2px solid ${PRIMARY}`,
          outlineOffset: 2,
        },
        '.MuiButtonBase-root:focus-visible, .MuiChip-root:focus-visible': {
          outline: 'none',
        },
      },
    },
    // 按钮:6px 圆角 / 36h(small 30 / large 44)/ padding 收紧
    // contained = 蓝色保留位;outlined 是中性"secondary button"(灰边深字,
    // 不再蓝边蓝字 —— 蓝 outlined 是界面发蓝的主要来源)
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 6,
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          letterSpacing: 0,
          minHeight: 36,
          paddingLeft: 16,
          paddingRight: 16,
          '& .MuiButton-startIcon': { marginLeft: -4, marginRight: 6 },
          '& .MuiButton-endIcon': { marginLeft: 6, marginRight: -4 },
          // fontSize 管 MUI SvgIcon,width/height 管 lucide(svg 属性尺寸)
          '& .MuiButton-startIcon > *:nth-of-type(1), & .MuiButton-endIcon > *:nth-of-type(1)':
            { fontSize: 16, width: 16, height: 16 },
          variants: [
            // outlined + primary(即默认 outlined)→ 中性化
            {
              props: { variant: 'outlined', color: 'primary' },
              style: {
                color: N[800],
                borderColor: SURFACE.outlineVariant,
                '&:hover': {
                  borderColor: SURFACE.outline,
                  backgroundColor: 'rgba(0, 0, 0, 0.04)',
                },
                '&:focus-visible, &:active': {
                  backgroundColor: 'rgba(0, 0, 0, 0.06)',
                },
              },
            },
          ],
        },
        sizeSmall: {
          fontSize: '0.8125rem',
          paddingLeft: 12,
          paddingRight: 12,
          minHeight: 30,
        },
        sizeMedium: {
          minHeight: 36,
        },
        sizeLarge: {
          minHeight: 44,
          fontSize: '0.9375rem',
          paddingLeft: 20,
          paddingRight: 20,
        },
        contained: {
          boxShadow: 'none',
          // hover 压暗 10%(对任意语义色都成立)
          '&:hover': {
            boxShadow: 'none',
            backgroundImage:
              'linear-gradient(rgba(0,0,0,0.10), rgba(0,0,0,0.10))',
          },
          '&:focus-visible, &:active': {
            boxShadow: 'none',
            backgroundImage:
              'linear-gradient(rgba(0,0,0,0.16), rgba(0,0,0,0.16))',
          },
        },
        text: {
          paddingLeft: 10,
          paddingRight: 10,
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
          },
          '&:focus-visible, &:active': {
            backgroundColor: 'rgba(0, 0, 0, 0.06)',
          },
        },
      },
    },
    // icon button:圆改方(6px 圆角),工具感;hover 中性灰
    MuiIconButton: {
      styleOverrides: {
        root: {
          width: 36,
          height: 36,
          borderRadius: 6,
          color: N[700],
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
            color: N[900],
          },
          '&:focus-visible, &:active': {
            backgroundColor: 'rgba(0, 0, 0, 0.08)',
          },
        },
        sizeSmall: {
          width: 30,
          height: 30,
        },
        sizeLarge: {
          width: 44,
          height: 44,
        },
      },
    },
    // chip:6px 圆角 / 28h 收紧(small 22),hairline 边
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          height: 28,
          fontSize: '0.8125rem',
          fontWeight: 500,
          letterSpacing: 0,
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.05)',
          },
        },
        sizeSmall: {
          height: 22,
          fontSize: '0.75rem',
        },
        outlined: {
          borderColor: SURFACE.outlineVariant,
        },
        filled: {
          '&.MuiChip-colorDefault': {
            backgroundColor: N[100],
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },
    // Select 下拉箭头换 lucide(默认 ArrowDropDown 是 Material 填充三角,混搭穿帮)
    MuiSelect: {
      defaultProps: { IconComponent: ChevronDown },
      styleOverrides: {
        icon: {
          width: 16,
          height: 16,
          top: 'calc(50% - 8px)',
          right: 10,
          color: N[500],
        },
      },
    },
    // 输入框:6px 圆角 / 1px 边 / focus = 1px primary 边 + 3px 浅蓝 ring(shadcn 式)
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          borderRadius: 6,
          fontSize: '0.875rem',
          transition: 'box-shadow 150ms cubic-bezier(0.2, 0, 0, 1)',
          '& fieldset': {
            borderColor: SURFACE.outline,
            borderWidth: '1px',
            transition: 'border-color 150ms cubic-bezier(0.2, 0, 0, 1)',
          },
          '&:hover fieldset': {
            borderColor: `${N[400]} !important`,
          },
          '&.Mui-focused': {
            boxShadow: `0 0 0 3px ${alpha(PRIMARY, 0.15)}`,
          },
          '&.Mui-focused fieldset': {
            borderColor: `${PRIMARY} !important`,
            borderWidth: '1px !important',
          },
        },
        input: {
          padding: '8px 12px',
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          color: N[600],
        },
      },
    },
    // 选择控件:checked 态保留 primary(语义,不是装饰),hover 中性
    MuiRadio: {
      styleOverrides: {
        root: {
          width: 36,
          height: 36,
          padding: 0,
          color: N[400],
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
          },
          '&.Mui-checked': {
            color: PRIMARY,
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.04)',
            },
          },
          '& .MuiSvgIcon-root': { fontSize: 20 },
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          width: 36,
          height: 36,
          padding: 0,
          color: N[400],
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
          },
          '&.Mui-checked': {
            color: PRIMARY,
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.04)',
            },
          },
          '& .MuiSvgIcon-root': { fontSize: 20 },
        },
      },
    },
    // 浮层:白底 + hairline 边 + ambient 阴影
    MuiMenu: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        paper: {
          borderRadius: 8,
          marginTop: 4,
          backgroundColor: '#ffffff',
          border: `1px solid ${SURFACE.outlineVariant}`,
          boxShadow: SHADOW.md,
        },
        list: {
          paddingTop: 4,
          paddingBottom: 4,
        },
      },
    },
    // menu item:36h 紧凑 + 4px 内嵌圆角(Linear 式),hover/selected 中性灰
    MuiMenuItem: {
      styleOverrides: {
        root: {
          minHeight: 36,
          margin: '0 4px',
          borderRadius: 4,
          paddingLeft: 12,
          paddingRight: 12,
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          letterSpacing: 0,
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(0, 0, 0, 0.06)',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.08)',
            },
          },
        },
        dense: {
          minHeight: 32,
          paddingTop: 2,
          paddingBottom: 2,
        },
      },
    },
    MuiDialogContentText: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          letterSpacing: 0,
        },
      },
    },
    MuiBreadcrumbs: {
      styleOverrides: {
        separator: {
          marginLeft: 8,
          marginRight: 8,
          color: N[400],
        },
      },
    },
    // 卡片:白底 + hairline 边,resting 无阴影(层级靠边线)
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: '#ffffff',
          border: `1px solid ${SURFACE.outlineVariant}`,
          transition:
            'border-color 200ms cubic-bezier(0.2, 0, 0, 1), box-shadow 200ms cubic-bezier(0.2, 0, 0, 1)',
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        outlined: {
          borderColor: SURFACE.outlineVariant,
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(12px) saturate(180%)',
          WebkitBackdropFilter: 'blur(12px) saturate(180%)',
          borderBottom: `1px solid ${SURFACE.outlineVariant}`,
          color: N[900],
          boxShadow: 'none',
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: '56px !important',
          paddingLeft: '20px !important',
          paddingRight: '20px !important',
        },
      },
    },
    MuiAccordion: {
      defaultProps: { disableGutters: true, elevation: 0 },
      styleOverrides: {
        root: {
          '&:before': { display: 'none' },
          backgroundColor: '#ffffff',
          border: `1px solid ${SURFACE.outlineVariant}`,
          borderRadius: '8px !important',
          boxShadow: 'none',
          overflow: 'hidden',
          transition: 'border-color 150ms cubic-bezier(0.2, 0, 0, 1)',
          // hover / expanded 都只是边线加深 —— 不再用蓝边表达展开态
          '&:hover': {
            borderColor: SURFACE.outline,
          },
          '&.Mui-expanded': {
            borderColor: SURFACE.outline,
          },
        },
      },
    },
    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          minHeight: 52,
          padding: '0 16px',
          '&.Mui-expanded': { minHeight: 52 },
        },
        content: {
          margin: '12px 0',
          '&.Mui-expanded': { margin: '12px 0' },
        },
      },
    },
    MuiTooltip: {
      defaultProps: {
        arrow: false,
      },
      styleOverrides: {
        tooltip: {
          fontSize: '0.75rem',
          fontWeight: 400,
          lineHeight: '1rem',
          letterSpacing: 0,
          backgroundColor: N[900],
          padding: '4px 8px',
          borderRadius: 6,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: SURFACE.outlineVariant },
      },
    },
    // 对话框:10px 圆角 + hairline 边 + xl ambient(告别 28px 大圆角)
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 10,
          backgroundColor: '#ffffff',
          border: `1px solid ${SURFACE.outlineVariant}`,
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '1.125rem',
          fontWeight: 600,
          lineHeight: '1.625rem',
          letterSpacing: '-0.01em',
          padding: '20px 24px 12px',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '0 24px 20px',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '12px 24px 20px',
          gap: 8,
        },
      },
    },
    // switch:几何沿用紧凑 36×20,on = primary(语义)
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 36,
          height: 20,
          padding: 0,
          overflow: 'visible',
        },
        switchBase: {
          padding: 5,
          transitionDuration: '180ms',
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
          },
          '&:focus-visible, &:active': {
            backgroundColor: 'rgba(0, 0, 0, 0.08)',
          },
          '&.Mui-checked': {
            transform: 'translateX(16px)',
            padding: 2,
            color: '#fff',
            '&:hover': {
              backgroundColor: alpha(PRIMARY, 0.06),
            },
            '&:focus-visible, &:active': {
              backgroundColor: alpha(PRIMARY, 0.1),
            },
            '& + .MuiSwitch-track': {
              opacity: 1,
              backgroundColor: PRIMARY,
              borderColor: 'transparent',
            },
            '& .MuiSwitch-thumb': {
              width: 16,
              height: 16,
              backgroundColor: '#fff',
            },
          },
          '&.Mui-disabled + .MuiSwitch-track': {
            opacity: 0.38,
          },
        },
        thumb: {
          width: 10,
          height: 10,
          boxShadow: 'none',
          backgroundColor: N[500],
          transition:
            'width 200ms cubic-bezier(0.2, 0, 0, 1), height 200ms cubic-bezier(0.2, 0, 0, 1), background-color 200ms cubic-bezier(0.2, 0, 0, 1)',
        },
        track: {
          borderRadius: 10,
          border: `1.5px solid ${N[400]}`,
          backgroundColor: N[100],
          opacity: 1,
          boxSizing: 'border-box',
          transition:
            'background-color 200ms cubic-bezier(0.2, 0, 0, 1), border-color 200ms cubic-bezier(0.2, 0, 0, 1)',
        },
      },
    },
    MuiFormControlLabel: {
      styleOverrides: {
        label: {
          marginLeft: 8,
        },
      },
    },
    MuiFab: {
      defaultProps: { color: 'primary' },
      styleOverrides: {
        root: {
          width: 52,
          height: 52,
          borderRadius: 10,
          boxShadow: SHADOW.md,
          '&:hover': {
            boxShadow: SHADOW.lg,
            backgroundImage:
              'linear-gradient(rgba(0,0,0,0.10), rgba(0,0,0,0.10))',
          },
          '&:focus-visible, &:active': {
            backgroundImage:
              'linear-gradient(rgba(0,0,0,0.16), rgba(0,0,0,0.16))',
          },
          transition:
            'box-shadow 200ms cubic-bezier(0.2, 0, 0, 1), background-image 200ms cubic-bezier(0.2, 0, 0, 1)',
        },
        sizeSmall: { width: 40, height: 40, borderRadius: 8 },
        sizeMedium: { width: 52, height: 52, borderRadius: 10 },
        extended: {
          width: 'auto',
          height: 48,
          paddingLeft: 16,
          paddingRight: 20,
        },
      },
    },
    // segmented control:选中 = 中性灰底深字(不再蓝底蓝字)
    MuiToggleButton: {
      styleOverrides: {
        root: {
          minHeight: 32,
          paddingLeft: 12,
          paddingRight: 12,
          fontSize: '0.8125rem',
          fontWeight: 500,
          lineHeight: '1.25rem',
          letterSpacing: 0,
          textTransform: 'none',
          borderColor: SURFACE.outlineVariant,
          color: N[600],
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
          },
          '&.Mui-selected': {
            backgroundColor: N[100],
            color: N[900],
            '&:hover': {
              backgroundColor: N[200],
            },
          },
          '& svg': { fontSize: 16, width: 16, height: 16 },
        },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        grouped: {
          '&:not(:first-of-type)': { marginLeft: -1 },
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          height: 4,
          padding: '13px 0',
        },
        rail: {
          height: 4,
          opacity: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.08)',
        },
        track: {
          height: 4,
          border: 'none',
        },
        thumb: {
          width: 16,
          height: 16,
          backgroundColor: '#ffffff',
          border: `1.5px solid ${N[400]}`,
          boxShadow: SHADOW.xs,
          '&:hover, &.Mui-focusVisible': {
            boxShadow: `0 0 0 6px rgba(0, 0, 0, 0.06)`,
          },
          '&.Mui-active': {
            boxShadow: `0 0 0 8px rgba(0, 0, 0, 0.08)`,
          },
        },
        valueLabel: {
          backgroundColor: N[900],
          fontSize: '0.75rem',
          padding: '4px 8px',
          borderRadius: 6,
        },
      },
    },
    // tab:选中 = 近黑文字 + 2px primary 指示条(蓝色保留位之一)
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 44,
          paddingLeft: 12,
          paddingRight: 12,
          fontSize: '0.875rem',
          fontWeight: 500,
          lineHeight: '1.25rem',
          letterSpacing: 0,
          textTransform: 'none',
          color: N[600],
          '&:hover': {
            color: N[900],
          },
          '&.Mui-selected': {
            color: N[900],
            fontWeight: 500,
          },
          '& svg': { fontSize: 20, width: 20, height: 20 },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 44,
          borderBottom: `1px solid ${SURFACE.outlineVariant}`,
        },
        indicator: {
          height: 2,
          backgroundColor: PRIMARY,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: `1px solid ${SURFACE.outlineVariant}`,
          boxShadow: 'none',
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(0, 0, 0, 0.05)',
        },
      },
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: N[900],
          color: '#ffffff',
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          letterSpacing: 0,
          minHeight: 44,
          paddingLeft: 16,
          paddingRight: 16,
          boxShadow: SHADOW.md,
        },
        action: { paddingLeft: 16 },
      },
    },
    // alert:8px 圆角 + 同色系 hairline 边(tinted bg 上加边线更"印刷感")
    MuiAlert: {
      defaultProps: {
        variant: 'standard',
        // severity icon 换 lucide 线性风格
        iconMapping: {
          success: createElement(CircleCheck, { size: 18 }),
          info: createElement(Info, { size: 18 }),
          warning: createElement(TriangleAlert, { size: 18 }),
          error: createElement(CircleAlert, { size: 18 }),
        },
      },
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '6px 14px',
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          letterSpacing: 0,
          alignItems: 'center',
        },
        icon: { fontSize: 20 },
        message: { padding: '8px 0' },
        standardError: { border: `1px solid ${alpha('#b91c1c', 0.2)}` },
        standardSuccess: { border: `1px solid ${alpha('#16a34a', 0.2)}` },
        standardWarning: { border: `1px solid ${alpha('#d97706', 0.25)}` },
        standardInfo: { border: `1px solid ${alpha('#0ea5e9', 0.25)}` },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          fontWeight: 500,
          backgroundColor: N[100],
          color: N[600],
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(0, 0, 0, 0.32)',
          '&.MuiBackdrop-invisible': {
            backgroundColor: 'transparent',
          },
        },
      },
    },
    MuiPopover: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        paper: {
          borderRadius: 8,
          marginTop: 4,
          backgroundColor: '#ffffff',
          border: `1px solid ${SURFACE.outlineVariant}`,
          boxShadow: SHADOW.md,
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          border: `1px solid ${SURFACE.outlineVariant}`,
          boxShadow: SHADOW.md,
        },
        listbox: {
          padding: '4px 0',
          '& .MuiAutocomplete-option': {
            minHeight: 36,
            margin: '0 4px',
            borderRadius: 4,
            paddingLeft: 12,
            paddingRight: 12,
            fontSize: '0.875rem',
            lineHeight: '1.25rem',
            letterSpacing: 0,
            '&:hover, &.Mui-focused': {
              backgroundColor: 'rgba(0, 0, 0, 0.04)',
            },
            '&[aria-selected="true"]': {
              backgroundColor: 'rgba(0, 0, 0, 0.06)',
              '&:hover, &.Mui-focused': {
                backgroundColor: 'rgba(0, 0, 0, 0.08)',
              },
            },
          },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 9999,
          height: 4,
          backgroundColor: 'rgba(0, 0, 0, 0.06)',
        },
        bar: {
          borderRadius: 9999,
        },
      },
    },
    MuiCircularProgress: {
      defaultProps: { thickness: 4, size: 40 },
      styleOverrides: {
        root: {},
      },
    },
  },
})
