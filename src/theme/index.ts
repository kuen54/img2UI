'use client'

import { createElement } from 'react'
import { keyframes } from '@emotion/react'
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
//
// Dark mode(MUI colorSchemes + CSS vars,SSR 两套变量都输出,无闪白):
// 灰阶按「语义反转」定义 —— grey[900] 永远是 ink、grey[100] 永远是底纹,
// 所以 theme 和应用层所有 grey[n] / surface.* 引用在两个 scheme 下语义自动成立。
// styleOverrides 里凡是要翻转的颜色一律走 (theme.vars || theme).palette;
// 选择器级差异(毛玻璃 AppBar、Skeleton)用 theme.applyStyles('dark', …)。

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

// dark:同一语义轴(数字越大越接近前景 ink),不是亮度直译
const N_DARK = {
  50: '#111111',
  100: '#1a1a1a',
  200: '#262626',
  300: '#333333',
  400: '#5c5c5c',
  500: '#8f8f8f',
  600: '#a1a1a1',
  700: '#c2c2c2',
  800: '#e0e0e0',
  900: '#ededed',
} as const

// 主色:Vercel 蓝。只出现在 contained 主按钮、链接、focus ring、Tab 指示条、选择控件
export const PRIMARY = '#0070f3'
const PRIMARY_LIGHT = '#3291ff'
const PRIMARY_DARK = '#0761d1'

// mono 字体栈:数字 / ID / 坐标 / 路径用(StatChip 等消费)
export const FONT_MONO =
  'var(--font-geist-mono), ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'

// ─── 草稿本点阵 / 棋盘格 ─────────────────────────────────────────────────
// 设计工具画布的"草稿纸"质感:页面背景铺阈下点阵(1px 点 / 20px 间距 / ≤6% 透明度),
// 卡片与弹层是实底,内容浮在点阵之上。调参只动这两个常量。
// 点/格的墨色走 --img2ui-dot-rgb(CssBaseline 里按 scheme 定义:浅色黑墨、深色白墨),
// 这样 dotGridBg / checkerboardBg 的产物天然跟随配色方案。
const DOT_SPACING = 20
const DOT_ALPHA = 0.11

/** dot grid 背景(dropzone 等"待绘制区域"可传更高 alpha 加强一档) */
export function dotGridBg(alpha: number = DOT_ALPHA, spacing: number = DOT_SPACING): {
  backgroundImage: string
  backgroundSize: string
} {
  return {
    backgroundImage: `radial-gradient(circle, rgba(var(--img2ui-dot-rgb), ${alpha}) 1px, transparent 1px)`,
    backgroundSize: `${spacing}px ${spacing}px`,
  }
}

/** 透明 PNG 底纹棋盘格(slice 缩略图 / keyed 预览),跟随配色方案 */
export function checkerboardBg(size = 12): string {
  return `repeating-conic-gradient(rgba(var(--img2ui-dot-rgb), 0.10) 0% 25%, transparent 0% 50%) 50%/${size}px ${size}px`
}

// ─── 进场动效 ─────────────────────────────────────────────────────────────
// 「出现」的统一语言:fade + 4px rise,120ms,只用于内容首次出现
// (skeleton → 实内容、Dialog 弹出)。hover/按压等反馈动效不走这里,
// 局部展开收起继续用 Collapse。

export const ENTER_EASING = 'cubic-bezier(0.05, 0.7, 0.1, 1)' // = transitions.easing.easeOut

export const riseIn = keyframes`
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
`

/**
 * skeleton → 实内容切换:套在「加载完成」分支的根元素 sx 上。
 * 注意 fill=both 动画期间元素带 transform,内部如有 position:fixed 子元素
 * 会被它当作 containing block —— 浮动保存条等都在用户操作后才出现,安全。
 */
export const riseInSx = {
  animation: `${riseIn} 120ms ${ENTER_EASING} both`,
} as const

// ─── surface token ───────────────────────────────────────────────────────
// key 沿用 MD3 命名(应用层有 6 处引用,保持兼容),值重映射到单色系:
// 表面一律实底,层级靠 outlineVariant hairline 划分;container 系只给
// 极少数需要"凹下去"的占位区(空状态底、kbd 胶囊);containerLow 是浮层
// (Menu/Dialog/Popover)的实底 —— 浅色下与 paper 同白,深色下抬升一档
interface SurfaceTokens {
  containerLowest: string
  containerLow: string
  container: string
  containerHigh: string
  containerHighest: string
  outline: string
  outlineVariant: string
}

const SURFACE: SurfaceTokens = {
  containerLowest: '#ffffff',
  containerLow: '#ffffff',
  container: N[50],
  containerHigh: N[100],
  containerHighest: N[200],
  outline: N[300],
  outlineVariant: N[200],
}

const SURFACE_DARK: SurfaceTokens = {
  containerLowest: '#0a0a0a',
  containerLow: '#141414',
  container: '#161616',
  containerHigh: '#1f1f1f',
  containerHighest: '#292929',
  outline: '#3d3d3d',
  outlineVariant: '#262626',
}

declare module '@mui/material/styles' {
  interface Palette {
    surface: SurfaceTokens
  }
  interface PaletteOptions {
    surface?: SurfaceTokens
  }
}

// 字体栈:Geist Sans(latin)+ CJK fallback
const FONT_STACK =
  'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Hiragino Sans GB", system-ui, sans-serif'

// ambient 阴影:只给浮层,低透明度 + 大偏移,绝不用 0.30 级黑影
// (深色下阴影基本不可见,层级本来就靠 hairline + 浮层抬色,两个 scheme 共用)
const SHADOW = {
  xs: '0 1px 2px rgba(0, 0, 0, 0.05)',
  sm: '0 4px 12px rgba(0, 0, 0, 0.08)',
  md: '0 8px 24px rgba(0, 0, 0, 0.10)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.12)',
  xl: '0 16px 48px rgba(0, 0, 0, 0.16)',
} as const

export const theme = createTheme({
  cssVariables: {
    // html[data-mui-color-scheme="dark"] 作为切换选择器;
    // InitColorSchemeScript 在首帧前写好属性,SSR 不闪白
    colorSchemeSelector: 'data',
  },
  colorSchemes: {
    light: {
      palette: {
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
    },
    dark: {
      palette: {
        // 蓝色保留位与浅色同值(Vercel 深色也不换主蓝);状态色换更亮的档,
        // *.light 仍是「同色系 tinted 底」语义(深色 = 深色调底)
        primary: {
          main: PRIMARY,
          light: PRIMARY_LIGHT,
          dark: PRIMARY_DARK,
          contrastText: '#ffffff',
        },
        secondary: {
          main: N_DARK[600],
          light: N_DARK[400],
          dark: N_DARK[800],
          contrastText: '#0a0a0a',
        },
        error: { main: '#ef4444', light: '#3b1212', dark: '#fca5a5', contrastText: '#fff' },
        success: { main: '#22c55e', light: '#11291a', dark: '#86efac', contrastText: '#fff' },
        warning: { main: '#f59e0b', light: '#33230a', dark: '#fbbf24', contrastText: '#fff' },
        info: { main: '#38bdf8', light: '#0a2533', dark: '#7dd3fc', contrastText: '#fff' },
        background: {
          // 同一哲学的镜像:整面近黑实底,层级靠 hairline;浮层用 surface.containerLow 抬一档
          default: '#0a0a0a',
          paper: '#0a0a0a',
        },
        divider: SURFACE_DARK.outlineVariant,
        surface: SURFACE_DARK,
        text: {
          primary: N_DARK[900],
          secondary: N_DARK[600],
          disabled: N_DARK[400],
        },
        grey: N_DARK,
        action: {
          // 深色 state layer 要比浅色重一档才看得见
          hover: 'rgba(255, 255, 255, 0.06)',
          hoverOpacity: 0.06,
          selected: 'rgba(255, 255, 255, 0.09)',
          selectedOpacity: 0.09,
          focus: 'rgba(255, 255, 255, 0.12)',
          focusOpacity: 0.12,
          disabled: N_DARK[400],
          disabledBackground: N_DARK[100],
          disabledOpacity: 0.38,
        },
      },
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
    // (颜色引用 CSS var,跟随 scheme;typography 块拿不到 theme 回调)
    h6: {
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: 'var(--mui-palette-grey-600)',
    },
    body1: { fontSize: '1rem', lineHeight: '1.5rem', letterSpacing: 0 },
    body2: { fontSize: '0.875rem', lineHeight: '1.25rem', letterSpacing: 0 },
    caption: {
      fontSize: '0.75rem',
      lineHeight: '1rem',
      letterSpacing: 0,
      color: 'var(--mui-palette-grey-600)',
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
      color: 'var(--mui-palette-grey-600)',
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
        // 点阵/棋盘格墨色:浅色黑墨、深色白墨(dotGridBg / checkerboardBg 消费)
        ':root': {
          '--img2ui-dot-rgb': '0, 0, 0',
        },
        '[data-mui-color-scheme="dark"]': {
          '--img2ui-dot-rgb': '255, 255, 255',
        },
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
        root: ({ theme }) => ({
          borderRadius: 6,
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          letterSpacing: 0,
          // 行尾按钮被 flex 挤压时不允许 label 折行(min-content 兜底)
          whiteSpace: 'nowrap',
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
                color: (theme.vars || theme).palette.grey[800],
                borderColor: (theme.vars || theme).palette.surface.outlineVariant,
                '&:hover': {
                  borderColor: (theme.vars || theme).palette.surface.outline,
                  backgroundColor: (theme.vars || theme).palette.action.hover,
                },
                '&:focus-visible, &:active': {
                  backgroundColor: (theme.vars || theme).palette.action.selected,
                },
              },
            },
          ],
        }),
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
          // hover 压暗 10%(对任意语义色都成立,深色同理)
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
        text: ({ theme }) => ({
          paddingLeft: 10,
          paddingRight: 10,
          '&:hover': {
            backgroundColor: (theme.vars || theme).palette.action.hover,
          },
          '&:focus-visible, &:active': {
            backgroundColor: (theme.vars || theme).palette.action.selected,
          },
        }),
      },
    },
    // icon button:圆改方(6px 圆角),工具感;hover 中性灰
    MuiIconButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          width: 36,
          height: 36,
          borderRadius: 6,
          color: (theme.vars || theme).palette.grey[700],
          '&:hover': {
            backgroundColor: (theme.vars || theme).palette.action.hover,
            color: (theme.vars || theme).palette.grey[900],
          },
          '&:focus-visible, &:active': {
            backgroundColor: (theme.vars || theme).palette.action.focus,
          },
        }),
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
        root: ({ theme }) => ({
          borderRadius: 6,
          height: 28,
          fontSize: '0.8125rem',
          fontWeight: 500,
          letterSpacing: 0,
          '&:hover': {
            backgroundColor: (theme.vars || theme).palette.action.hover,
          },
        }),
        sizeSmall: {
          height: 22,
          fontSize: '0.75rem',
        },
        outlined: ({ theme }) => ({
          borderColor: (theme.vars || theme).palette.surface.outlineVariant,
        }),
        filled: ({ theme }) => ({
          '&.MuiChip-colorDefault': {
            backgroundColor: (theme.vars || theme).palette.grey[100],
          },
        }),
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },
    // Select 下拉箭头换 lucide(默认 ArrowDropDown 是 Material 填充三角,混搭穿帮)
    MuiSelect: {
      defaultProps: { IconComponent: ChevronDown },
      styleOverrides: {
        icon: ({ theme }) => ({
          width: 16,
          height: 16,
          top: 'calc(50% - 8px)',
          right: 10,
          color: (theme.vars || theme).palette.grey[500],
        }),
      },
    },
    // 输入框:6px 圆角 / 1px 边 / focus = 1px primary 边 + 3px 浅蓝 ring(shadcn 式)
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: (theme.vars || theme).palette.background.paper,
          borderRadius: 6,
          fontSize: '0.875rem',
          transition: 'box-shadow 150ms cubic-bezier(0.2, 0, 0, 1)',
          '& fieldset': {
            borderColor: (theme.vars || theme).palette.surface.outline,
            borderWidth: '1px',
            transition: 'border-color 150ms cubic-bezier(0.2, 0, 0, 1)',
          },
          '&:hover fieldset': {
            borderColor: `${(theme.vars || theme).palette.grey[400]} !important`,
          },
          '&.Mui-focused': {
            boxShadow: `0 0 0 3px ${alpha(PRIMARY, 0.15)}`,
          },
          '&.Mui-focused fieldset': {
            borderColor: `${PRIMARY} !important`,
            borderWidth: '1px !important',
          },
        }),
        input: {
          padding: '8px 12px',
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontSize: '0.875rem',
          color: (theme.vars || theme).palette.grey[600],
        }),
      },
    },
    // 选择控件:checked 态保留 primary(语义,不是装饰),hover 中性
    MuiRadio: {
      styleOverrides: {
        root: ({ theme }) => ({
          width: 36,
          height: 36,
          padding: 0,
          color: (theme.vars || theme).palette.grey[400],
          '&:hover': {
            backgroundColor: (theme.vars || theme).palette.action.hover,
          },
          '&.Mui-checked': {
            color: PRIMARY,
            '&:hover': {
              backgroundColor: (theme.vars || theme).palette.action.hover,
            },
          },
          '& .MuiSvgIcon-root': { fontSize: 20 },
        }),
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: ({ theme }) => ({
          width: 36,
          height: 36,
          padding: 0,
          color: (theme.vars || theme).palette.grey[400],
          '&:hover': {
            backgroundColor: (theme.vars || theme).palette.action.hover,
          },
          '&.Mui-checked': {
            color: PRIMARY,
            '&:hover': {
              backgroundColor: (theme.vars || theme).palette.action.hover,
            },
          },
          '& .MuiSvgIcon-root': { fontSize: 20 },
        }),
      },
    },
    // 浮层:实底(浅白/深抬升)+ hairline 边 + ambient 阴影
    MuiMenu: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: 8,
          marginTop: 4,
          backgroundColor: (theme.vars || theme).palette.surface.containerLow,
          border: `1px solid ${(theme.vars || theme).palette.surface.outlineVariant}`,
          boxShadow: SHADOW.md,
        }),
        list: {
          paddingTop: 4,
          paddingBottom: 4,
        },
      },
    },
    // menu item:36h 紧凑 + 4px 内嵌圆角(Linear 式),hover/selected 中性灰
    MuiMenuItem: {
      styleOverrides: {
        root: ({ theme }) => ({
          minHeight: 36,
          margin: '0 4px',
          borderRadius: 4,
          paddingLeft: 12,
          paddingRight: 12,
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          letterSpacing: 0,
          '&:hover': {
            backgroundColor: (theme.vars || theme).palette.action.hover,
          },
          '&.Mui-selected': {
            backgroundColor: (theme.vars || theme).palette.action.selected,
            '&:hover': {
              backgroundColor: (theme.vars || theme).palette.action.focus,
            },
          },
        }),
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
        separator: ({ theme }) => ({
          marginLeft: 8,
          marginRight: 8,
          color: (theme.vars || theme).palette.grey[400],
        }),
      },
    },
    // 卡片:实底 + hairline 边,resting 无阴影(层级靠边线)
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 8,
          backgroundColor: (theme.vars || theme).palette.background.paper,
          border: `1px solid ${(theme.vars || theme).palette.surface.outlineVariant}`,
          transition:
            'border-color 200ms cubic-bezier(0.2, 0, 0, 1), box-shadow 200ms cubic-bezier(0.2, 0, 0, 1)',
        }),
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        outlined: ({ theme }) => ({
          borderColor: (theme.vars || theme).palette.surface.outlineVariant,
        }),
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(12px) saturate(180%)',
          WebkitBackdropFilter: 'blur(12px) saturate(180%)',
          borderBottom: `1px solid ${(theme.vars || theme).palette.surface.outlineVariant}`,
          color: (theme.vars || theme).palette.text.primary,
          boxShadow: 'none',
          ...theme.applyStyles('dark', {
            backgroundColor: 'rgba(10, 10, 10, 0.75)',
          }),
        }),
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
        root: ({ theme }) => ({
          '&:before': { display: 'none' },
          backgroundColor: (theme.vars || theme).palette.background.paper,
          border: `1px solid ${(theme.vars || theme).palette.surface.outlineVariant}`,
          borderRadius: '8px !important',
          boxShadow: 'none',
          overflow: 'hidden',
          transition: 'border-color 150ms cubic-bezier(0.2, 0, 0, 1)',
          // hover / expanded 都只是边线加深 —— 不再用蓝边表达展开态
          '&:hover': {
            borderColor: (theme.vars || theme).palette.surface.outline,
          },
          '&.Mui-expanded': {
            borderColor: (theme.vars || theme).palette.surface.outline,
          },
        }),
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
    // tooltip:反色胶囊(浅色近黑底白字 / 深色近白底黑字,Vercel 式)
    MuiTooltip: {
      defaultProps: {
        arrow: false,
      },
      styleOverrides: {
        tooltip: ({ theme }) => ({
          fontSize: '0.75rem',
          fontWeight: 400,
          lineHeight: '1rem',
          letterSpacing: 0,
          backgroundColor: (theme.vars || theme).palette.grey[900],
          color: (theme.vars || theme).palette.background.default,
          padding: '4px 8px',
          borderRadius: 6,
        }),
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderColor: (theme.vars || theme).palette.surface.outlineVariant,
        }),
      },
    },
    // 对话框:10px 圆角 + hairline 边 + xl ambient(告别 28px 大圆角)
    // 进场 = 统一的 rise-in(paper 上跑 keyframe,默认 Fade 只管 backdrop 同步淡入)
    MuiDialog: {
      defaultProps: {
        transitionDuration: { enter: 120, exit: 150 },
      },
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: 10,
          backgroundColor: (theme.vars || theme).palette.surface.containerLow,
          border: `1px solid ${(theme.vars || theme).palette.surface.outlineVariant}`,
          animation: `${riseIn} 120ms ${ENTER_EASING} both`,
        }),
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
        switchBase: ({ theme }) => ({
          padding: 5,
          transitionDuration: '180ms',
          '&:hover': {
            backgroundColor: (theme.vars || theme).palette.action.hover,
          },
          '&:focus-visible, &:active': {
            backgroundColor: (theme.vars || theme).palette.action.focus,
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
        }),
        thumb: ({ theme }) => ({
          width: 10,
          height: 10,
          boxShadow: 'none',
          backgroundColor: (theme.vars || theme).palette.grey[500],
          transition:
            'width 200ms cubic-bezier(0.2, 0, 0, 1), height 200ms cubic-bezier(0.2, 0, 0, 1), background-color 200ms cubic-bezier(0.2, 0, 0, 1)',
        }),
        track: ({ theme }) => ({
          borderRadius: 10,
          border: `1.5px solid ${(theme.vars || theme).palette.grey[400]}`,
          backgroundColor: (theme.vars || theme).palette.grey[100],
          opacity: 1,
          boxSizing: 'border-box',
          transition:
            'background-color 200ms cubic-bezier(0.2, 0, 0, 1), border-color 200ms cubic-bezier(0.2, 0, 0, 1)',
        }),
      },
    },
    MuiFormControlLabel: {
      styleOverrides: {
        // gap 而非 label.marginLeft:label 传自定义节点(非 string)时
        // 不带 .MuiFormControlLabel-label class,marginLeft 会失效
        root: {
          gap: 8,
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
        root: ({ theme }) => ({
          minHeight: 32,
          paddingLeft: 12,
          paddingRight: 12,
          fontSize: '0.8125rem',
          fontWeight: 500,
          lineHeight: '1.25rem',
          letterSpacing: 0,
          textTransform: 'none',
          borderColor: (theme.vars || theme).palette.surface.outlineVariant,
          color: (theme.vars || theme).palette.grey[600],
          '&:hover': {
            backgroundColor: (theme.vars || theme).palette.action.hover,
          },
          '&.Mui-selected': {
            backgroundColor: (theme.vars || theme).palette.grey[100],
            color: (theme.vars || theme).palette.grey[900],
            '&:hover': {
              backgroundColor: (theme.vars || theme).palette.grey[200],
            },
          },
          '& svg': { fontSize: 16, width: 16, height: 16 },
        }),
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
        rail: ({ theme }) => ({
          height: 4,
          opacity: 1,
          backgroundColor: (theme.vars || theme).palette.action.focus,
        }),
        track: {
          height: 4,
          border: 'none',
        },
        thumb: ({ theme }) => ({
          width: 16,
          height: 16,
          backgroundColor: (theme.vars || theme).palette.background.paper,
          border: `1.5px solid ${(theme.vars || theme).palette.grey[400]}`,
          boxShadow: SHADOW.xs,
          '&:hover, &.Mui-focusVisible': {
            boxShadow: `0 0 0 6px ${(theme.vars || theme).palette.action.selected}`,
          },
          '&.Mui-active': {
            boxShadow: `0 0 0 8px ${(theme.vars || theme).palette.action.focus}`,
          },
        }),
        valueLabel: ({ theme }) => ({
          backgroundColor: (theme.vars || theme).palette.grey[900],
          color: (theme.vars || theme).palette.background.default,
          fontSize: '0.75rem',
          padding: '4px 8px',
          borderRadius: 6,
        }),
      },
    },
    // tab:选中 = ink 文字 + 2px primary 指示条(蓝色保留位之一)
    MuiTab: {
      styleOverrides: {
        root: ({ theme }) => ({
          minHeight: 44,
          paddingLeft: 12,
          paddingRight: 12,
          fontSize: '0.875rem',
          fontWeight: 500,
          lineHeight: '1.25rem',
          letterSpacing: 0,
          textTransform: 'none',
          color: (theme.vars || theme).palette.grey[600],
          '&:hover': {
            color: (theme.vars || theme).palette.grey[900],
          },
          '&.Mui-selected': {
            color: (theme.vars || theme).palette.grey[900],
            fontWeight: 500,
          },
          '& svg': { fontSize: 20, width: 20, height: 20 },
        }),
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: ({ theme }) => ({
          minHeight: 44,
          borderBottom: `1px solid ${(theme.vars || theme).palette.surface.outlineVariant}`,
        }),
        indicator: {
          height: 2,
          backgroundColor: PRIMARY,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRight: `1px solid ${(theme.vars || theme).palette.surface.outlineVariant}`,
          boxShadow: 'none',
        }),
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: 'rgba(0, 0, 0, 0.05)',
          ...theme.applyStyles('dark', {
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
          }),
        }),
      },
    },
    // snackbar:反色胶囊(同 tooltip)
    MuiSnackbarContent: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 8,
          backgroundColor: (theme.vars || theme).palette.grey[900],
          color: (theme.vars || theme).palette.background.default,
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          letterSpacing: 0,
          minHeight: 44,
          paddingLeft: 16,
          paddingRight: 16,
          boxShadow: SHADOW.md,
        }),
        action: { paddingLeft: 16 },
      },
    },
    // alert:8px 圆角 + 同色系 hairline 边(tinted bg 上加边线更"印刷感")
    // standard 变体的 tinted 底色由 MUI 按 scheme 自动计算
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
        root: ({ theme }) => ({
          fontSize: '0.875rem',
          fontWeight: 500,
          backgroundColor: (theme.vars || theme).palette.grey[100],
          color: (theme.vars || theme).palette.grey[600],
        }),
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: 'rgba(0, 0, 0, 0.32)',
          ...theme.applyStyles('dark', {
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
          }),
          '&.MuiBackdrop-invisible': {
            backgroundColor: 'transparent',
          },
        }),
      },
    },
    MuiPopover: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: 8,
          marginTop: 4,
          backgroundColor: (theme.vars || theme).palette.surface.containerLow,
          border: `1px solid ${(theme.vars || theme).palette.surface.outlineVariant}`,
          boxShadow: SHADOW.md,
        }),
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: 8,
          backgroundColor: (theme.vars || theme).palette.surface.containerLow,
          border: `1px solid ${(theme.vars || theme).palette.surface.outlineVariant}`,
          boxShadow: SHADOW.md,
        }),
        listbox: ({ theme }) => ({
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
              backgroundColor: (theme.vars || theme).palette.action.hover,
            },
            '&[aria-selected="true"]': {
              backgroundColor: (theme.vars || theme).palette.action.selected,
              '&:hover, &.Mui-focused': {
                backgroundColor: (theme.vars || theme).palette.action.focus,
              },
            },
          },
        }),
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 9999,
          height: 4,
          backgroundColor: (theme.vars || theme).palette.action.selected,
        }),
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
