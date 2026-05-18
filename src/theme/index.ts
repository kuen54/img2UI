'use client'

import { createTheme, alpha } from '@mui/material/styles'

// PLAN §1.1 / §14.3:Material Design 3 视觉骨架 + Figma 蓝主色 + Linear/Vercel 风格的克制细节
// 设计目标:从 "MUI default" 跳到 "production tool",通过:
// 1. typography:Geist Sans(英)+ 苹方/HarmonyOS Sans(中),scale + 字重对比拉开
// 2. neutral 9 阶 token,所有 text/border 走阶梯,不硬编码灰
// 3. 圆角整体 -4(Card 12 / Button 8 / Chip 6),MD3 大圆角在工具类显幼稚
// 4. 关 ripple,改为 outline ring hover(高级感核心)
// 5. AppBar backdrop blur,1px hairline 而非 divider 灰条
// 6. status 色降饱和(error #b91c1c 而非 MUI default #d32f2f)
// 7. 阴影改细腻 hairline shadow,不要 MUI default elevation

// ─── neutral 9 阶 ────────────────────────────────────────────────────────
const N = {
  50: '#fafbfc',
  100: '#f4f5f7',
  200: '#e8ebee',
  300: '#d1d5db',
  400: '#9aa1ad',
  500: '#6b7280',
  600: '#4b5563',
  700: '#363a42',
  800: '#1f2329',
  900: '#0a0a0a',
} as const

// 1px hairline border / divider
const HAIRLINE = 'rgba(15, 23, 42, 0.06)'
const HAIRLINE_STRONG = 'rgba(15, 23, 42, 0.1)'

// 字体栈:Geist Sans(latin)+ CJK fallback
const FONT_STACK =
  'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", "Hiragino Sans GB", system-ui, sans-serif'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0d99ff',
      light: '#5cb8ff',
      dark: '#006fc7',
      contrastText: '#ffffff',
    },
    secondary: {
      main: N[600],
      light: N[400],
      dark: N[800],
      contrastText: '#ffffff',
    },
    // 状态色降饱和 — 不要 MUI default 的"警报感"
    error: { main: '#b91c1c', light: '#fee2e2', dark: '#991b1b', contrastText: '#fff' },
    success: { main: '#16a34a', light: '#dcfce7', dark: '#15803d', contrastText: '#fff' },
    warning: { main: '#d97706', light: '#fef3c7', dark: '#b45309', contrastText: '#fff' },
    info: { main: '#0ea5e9', light: '#e0f2fe', dark: '#0369a1', contrastText: '#fff' },
    background: {
      default: '#eef0f3', // 暗半阶 — 让 Card paper(#fff) 真"浮"出来,Linear/Vercel 关键 surface elevation
      paper: '#ffffff',
    },
    divider: HAIRLINE,
    text: {
      primary: N[900],
      // 上轮误把 text.secondary 跟 caption 都用了 N[500]/N[600],中文字符在 14px 下显薄看不清。
      // 拉到 N[700] 提升对比度,接近 MD3 on-surface-variant 的语义深度
      secondary: N[700],
      disabled: N[400],
    },
    grey: N,
    action: {
      // MD3 state-layer:hover 8% / focus & pressed 12% / dragged 16%(以 on-surface 为底)
      hover: 'rgba(15, 23, 42, 0.08)',
      hoverOpacity: 0.08,
      selected: 'rgba(13, 153, 255, 0.12)',
      selectedOpacity: 0.12,
      focus: 'rgba(15, 23, 42, 0.12)',
      focusOpacity: 0.12,
      disabled: N[300],
      disabledBackground: N[100],
      disabledOpacity: 0.38,
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: FONT_STACK,
    // h1-h6:大处更大,letter-spacing 紧 — Inter 在大字号下需要负 spacing 才精致
    h1: { fontSize: '2.25rem', fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.15 },
    h2: { fontSize: '1.75rem', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 },
    h3: { fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.3 },
    h4: { fontSize: '1.0625rem', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.35 },
    h5: { fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.4 },
    h6: {
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: N[700],
    },
    body1: { fontSize: '0.9375rem', lineHeight: 1.55 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5 },
    caption: { fontSize: '0.75rem', lineHeight: 1.45, color: N[700] },
    button: {
      fontSize: '0.875rem',
      fontWeight: 500,
      textTransform: 'none',
      letterSpacing: 0,
    },
    overline: {
      fontSize: '0.6875rem',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: N[700],
    },
  },
  // 自定义阴影栈 — hairline + 微妙偏移 + 真实 lift,不要 MUI 默认"模糊大球"也不要削太狠
  // resting (1) → hover (3) → popover (5+) 三档跳跃要可见
  shadows: [
    'none',
    `0 1px 2px ${alpha(N[900], 0.06)}, 0 1px 1px ${alpha(N[900], 0.04)}, 0 0 0 1px ${HAIRLINE}`, // 1 resting
    `0 2px 4px ${alpha(N[900], 0.07)}, 0 1px 2px ${alpha(N[900], 0.05)}, 0 0 0 1px ${HAIRLINE}`, // 2
    `0 4px 12px ${alpha(N[900], 0.08)}, 0 2px 4px ${alpha(N[900], 0.04)}, 0 0 0 1px ${HAIRLINE}`, // 3 hover
    `0 6px 16px ${alpha(N[900], 0.09)}, 0 2px 6px ${alpha(N[900], 0.05)}, 0 0 0 1px ${HAIRLINE}`, // 4
    `0 8px 24px ${alpha(N[900], 0.1)}, 0 4px 8px ${alpha(N[900], 0.05)}, 0 0 0 1px ${HAIRLINE}`, // 5 popover
    `0 12px 32px ${alpha(N[900], 0.11)}, 0 6px 12px ${alpha(N[900], 0.06)}, 0 0 0 1px ${HAIRLINE}`, // 6
    `0 16px 40px ${alpha(N[900], 0.12)}, 0 8px 16px ${alpha(N[900], 0.07)}, 0 0 0 1px ${HAIRLINE}`, // 7
    `0 20px 48px ${alpha(N[900], 0.14)}, 0 10px 20px ${alpha(N[900], 0.07)}, 0 0 0 1px ${HAIRLINE}`, // 8 dialog
    `0 24px 56px ${alpha(N[900], 0.16)}, 0 12px 24px ${alpha(N[900], 0.08)}, 0 0 0 1px ${HAIRLINE}`, // 9
    `0 28px 64px ${alpha(N[900], 0.18)}, 0 14px 28px ${alpha(N[900], 0.09)}, 0 0 0 1px ${HAIRLINE}`, // 10
    `0 32px 72px ${alpha(N[900], 0.2)}, 0 16px 32px ${alpha(N[900], 0.1)}, 0 0 0 1px ${HAIRLINE}`, // 11
    `0 36px 80px ${alpha(N[900], 0.22)}, 0 18px 36px ${alpha(N[900], 0.11)}, 0 0 0 1px ${HAIRLINE}`, // 12
    `0 40px 88px ${alpha(N[900], 0.24)}, 0 20px 40px ${alpha(N[900], 0.12)}, 0 0 0 1px ${HAIRLINE}`, // 13
    `0 44px 96px ${alpha(N[900], 0.26)}, 0 22px 44px ${alpha(N[900], 0.13)}, 0 0 0 1px ${HAIRLINE}`, // 14
    `0 48px 104px ${alpha(N[900], 0.28)}, 0 24px 48px ${alpha(N[900], 0.14)}, 0 0 0 1px ${HAIRLINE}`, // 15
    `0 52px 112px ${alpha(N[900], 0.3)}, 0 26px 52px ${alpha(N[900], 0.15)}, 0 0 0 1px ${HAIRLINE}`, // 16
    `0 56px 120px ${alpha(N[900], 0.32)}, 0 28px 56px ${alpha(N[900], 0.16)}, 0 0 0 1px ${HAIRLINE}`, // 17
    `0 60px 128px ${alpha(N[900], 0.34)}, 0 30px 60px ${alpha(N[900], 0.17)}, 0 0 0 1px ${HAIRLINE}`, // 18
    `0 64px 136px ${alpha(N[900], 0.36)}, 0 32px 64px ${alpha(N[900], 0.18)}, 0 0 0 1px ${HAIRLINE}`, // 19
    `0 68px 144px ${alpha(N[900], 0.38)}, 0 34px 68px ${alpha(N[900], 0.19)}, 0 0 0 1px ${HAIRLINE}`, // 20
    `0 72px 152px ${alpha(N[900], 0.4)}, 0 36px 72px ${alpha(N[900], 0.2)}, 0 0 0 1px ${HAIRLINE}`, // 21
    `0 76px 160px ${alpha(N[900], 0.42)}, 0 38px 76px ${alpha(N[900], 0.21)}, 0 0 0 1px ${HAIRLINE}`, // 22
    `0 80px 168px ${alpha(N[900], 0.44)}, 0 40px 80px ${alpha(N[900], 0.22)}, 0 0 0 1px ${HAIRLINE}`, // 23
    `0 84px 176px ${alpha(N[900], 0.46)}, 0 42px 84px ${alpha(N[900], 0.23)}, 0 0 0 1px ${HAIRLINE}`, // 24
  ],
  components: {
    // MD3 state layer 是 hover/focus/press 时叠的颜色 overlay,实现机制是 CSS bg overlay
    // 而非动画 ripple。MUI 的 ripple 动效偏 MD2 风格,这里关闭以避免和 state layer 重复
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          // Geist 自带优化默认,不需要 Inter 的 cv11/ss01 alternates
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
        '*': {
          // 让 native confirm 类元素也用 Geist
          fontFamily: 'inherit',
        },
      },
    },
    // MD3 spec (v0.192):container 40h / corner-full(9999px = pill)
    // / label-large 14/20 medium tracking 0.1px / leading-trailing 24px
    // / with-icon side 16px / icon 18px / state layer hover 8% focus/pressed 12%
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 9999,
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          letterSpacing: '0.00625rem',
          minHeight: 40,
          paddingLeft: 24,
          paddingRight: 24,
          // 注:不要在这里设 gap — startIcon/endIcon 自己有 marginRight/Left 控制间距,
          // 设 gap 会跟 marginRight 叠加,icon 离文字越来越远
          '& .MuiButton-startIcon': { marginLeft: -8, marginRight: 8 },
          '& .MuiButton-endIcon': { marginLeft: 8, marginRight: -8 },
          '& .MuiButton-startIcon > *:nth-of-type(1), & .MuiButton-endIcon > *:nth-of-type(1)':
            { fontSize: 18 },
        },
        // size="small" 是 MUI 习惯,MD3 没有官方 small button — 这里用 32h 作为紧凑变体
        sizeSmall: {
          fontSize: '0.8125rem',
          paddingLeft: 16,
          paddingRight: 16,
          minHeight: 32,
        },
        sizeMedium: {
          minHeight: 40,
        },
        sizeLarge: {
          minHeight: 48,
          fontSize: '0.9375rem',
        },
        outlined: {
          borderColor: HAIRLINE_STRONG,
          // MD3 outlined hover:state layer = primary @ 8%
          '&:hover': {
            borderColor: N[400],
            backgroundColor: alpha('#0d99ff', 0.08),
          },
          '&:focus-visible': {
            backgroundColor: alpha('#0d99ff', 0.12),
          },
          '&:active': {
            backgroundColor: alpha('#0d99ff', 0.12),
          },
        },
        contained: {
          boxShadow: 'none',
          // MD3 filled hover:state layer = on-primary @ 8%(白色叠加 8%)
          '&:hover': {
            boxShadow: 'none',
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.08), rgba(255,255,255,0.08))',
          },
          '&:focus-visible': {
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.12), rgba(255,255,255,0.12))',
          },
          '&:active': {
            boxShadow: 'none',
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.12), rgba(255,255,255,0.12))',
          },
        },
        text: {
          paddingLeft: 12,
          paddingRight: 12,
          // MD3 text hover:state layer = primary @ 8%
          '&:hover': {
            backgroundColor: alpha('#0d99ff', 0.08),
          },
          '&:focus-visible': {
            backgroundColor: alpha('#0d99ff', 0.12),
          },
          '&:active': {
            backgroundColor: alpha('#0d99ff', 0.12),
          },
        },
      },
    },
    // MD3 spec:state-layer 40×40 / icon 24px / corner-full / state layer hover 8% focus/pressed 12%
    // 注:icon 比文字需要更强对比才显形,resting color 用 N[800]
    MuiIconButton: {
      styleOverrides: {
        root: {
          width: 40,
          height: 40,
          borderRadius: '50%',
          color: N[800],
          '&:hover': {
            backgroundColor: alpha(N[900], 0.08),
            color: N[900],
          },
          '&:focus-visible': {
            backgroundColor: alpha(N[900], 0.12),
          },
          '&:active': {
            backgroundColor: alpha(N[900], 0.12),
          },
        },
        sizeSmall: {
          width: 32,
          height: 32,
        },
        sizeLarge: {
          width: 48,
          height: 48,
        },
      },
    },
    // MD3 spec:assist/filter chip container 32h / corner-small(8) / outline 1px
    // / label-large 14/20 medium / state layer hover 8% focus/pressed 12%
    // size="small" 保留为 24h 紧凑变体(MUI 习惯,MD3 无官方 small chip)
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          height: 32,
          fontSize: '0.875rem',
          fontWeight: 500,
          letterSpacing: '0.00625rem',
          // MD3 chip hover:state layer = on-surface @ 8%
          '&:hover': {
            backgroundColor: alpha(N[900], 0.08),
          },
        },
        sizeSmall: {
          height: 24,
          fontSize: '0.75rem',
          letterSpacing: '0.03125rem',
        },
        outlined: {
          borderColor: HAIRLINE_STRONG,
        },
        filled: {
          // 只给 color="default" 的 filled chip 加浅灰底,不要盖 color="primary" 等的语义色
          '&.MuiChip-colorDefault': {
            backgroundColor: N[100],
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },
    // MD3 spec:outlined text-field corner-extra-small(4) / outline 1px / focus outline 2px
    // / body-large 16/24 regular(我们 size="small" 用 14)
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          borderRadius: 4,
          fontSize: '0.875rem',
          '& fieldset': {
            borderColor: HAIRLINE_STRONG,
            borderWidth: '1px',
            transition: 'border-color 0.15s ease, border-width 0.15s ease',
          },
          '&:hover fieldset': {
            borderColor: `${N[500]} !important`,
          },
          // MD3 focus:outline 提到 2px(标志性视觉反馈),不再覆盖回 1px
          '&.Mui-focused fieldset': {
            borderColor: '#0d99ff !important',
            borderWidth: '2px !important',
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
          color: N[700],
        },
      },
    },
    // MD3 spec:radio state-layer 40×40 / icon 20px / state layer hover 8% focus/pressed 12%
    MuiRadio: {
      styleOverrides: {
        root: {
          width: 40,
          height: 40,
          padding: 0,
          color: N[600],
          '&:hover': {
            backgroundColor: alpha(N[900], 0.08),
          },
          '&.Mui-checked': {
            color: '#0d99ff',
            '&:hover': {
              backgroundColor: alpha('#0d99ff', 0.08),
            },
          },
          '& .MuiSvgIcon-root': { fontSize: 20 },
        },
      },
    },
    // MD3 spec:checkbox state-layer 40 / container 18 / shape corner-extra-small(2) / icon 18
    MuiCheckbox: {
      styleOverrides: {
        root: {
          width: 40,
          height: 40,
          padding: 0,
          color: N[600],
          '&:hover': {
            backgroundColor: alpha(N[900], 0.08),
          },
          '&.Mui-checked': {
            color: '#0d99ff',
            '&:hover': {
              backgroundColor: alpha('#0d99ff', 0.08),
            },
          },
          '& .MuiSvgIcon-root': { fontSize: 20 },
        },
      },
    },
    // MD3 spec:menu container corner-extra-small(4) / level-2 elevation
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 4,
          marginTop: 4,
        },
        list: {
          paddingTop: 8,
          paddingBottom: 8,
        },
      },
    },
    // MD3 spec:list-item one-line 56h / leading-trailing 16px / icon 24 / label-large 14/20
    // / state layer hover 8% focus/pressed 12% / selected = secondary-container fill
    // 紧凑 dense 变体保留 40h(MUI 习惯,适合 Select 弹窗)
    MuiMenuItem: {
      styleOverrides: {
        root: {
          minHeight: 48,
          paddingLeft: 16,
          paddingRight: 16,
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          letterSpacing: '0.00625rem',
          '&:hover': {
            backgroundColor: alpha(N[900], 0.08),
          },
          '&.Mui-selected': {
            backgroundColor: alpha('#0d99ff', 0.12),
            '&:hover': {
              backgroundColor: alpha('#0d99ff', 0.16),
            },
          },
        },
        dense: {
          minHeight: 40,
          paddingTop: 4,
          paddingBottom: 4,
        },
      },
    },
    // MD3 spec:dialog supporting-text body-medium 14/20 regular tracking 0.25px
    MuiDialogContentText: {
      styleOverrides: {
        root: {
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          letterSpacing: '0.015625rem',
        },
      },
    },
    // breadcrumb separator 不属于 MD3 标准组件,保持现有视觉,只确保 link 状态层一致
    MuiBreadcrumbs: {
      styleOverrides: {
        separator: {
          marginLeft: 8,
          marginRight: 8,
          color: N[500],
        },
      },
    },
    // MD3 spec:elevated/filled/outlined card 都是 corner-medium(12) / outline 1px(outlined)
    MuiCard: {
      defaultProps: { elevation: 1 },
      styleOverrides: {
        root: {
          borderRadius: 12,
          // 用 elevation 1 的 hairline+ shadow,不要 MUI default 的模糊大球
          transition:
            'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.18s ease',
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        outlined: {
          borderColor: HAIRLINE_STRONG,
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(12px) saturate(180%)',
          WebkitBackdropFilter: 'blur(12px) saturate(180%)',
          borderBottom: `1px solid ${HAIRLINE}`,
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
          border: `1px solid ${HAIRLINE_STRONG}`,
          borderRadius: '12px !important',
          boxShadow: 'none',
          overflow: 'hidden',
          transition: 'border-color 0.15s ease',
          '&:hover': {
            borderColor: N[300],
          },
          '&.Mui-expanded': {
            borderColor: alpha('#0d99ff', 0.3),
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
    // MD3 spec:plain tooltip corner-extra-small(4) / body-small 12/16 regular tracking 0.4px
    // / 容器深色 inverse-surface 背景
    MuiTooltip: {
      defaultProps: {
        arrow: false,
      },
      styleOverrides: {
        tooltip: {
          fontSize: '0.75rem',
          fontWeight: 400,
          lineHeight: '1rem',
          letterSpacing: '0.025rem',
          backgroundColor: N[900],
          padding: '4px 8px',
          borderRadius: 4,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: HAIRLINE },
      },
    },
    // MD3 spec:basic dialog corner-extra-large(28) / headline-small 24/32 regular
    // / 24px padding / level 3 elevation
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 28,
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '1.5rem',
          fontWeight: 400,
          lineHeight: '2rem',
          letterSpacing: 0,
          padding: '24px 24px 16px',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '0 24px 24px',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: '16px 24px 24px',
          gap: 8,
        },
      },
    },
    // MD3 spec:track 52×32 / corner-full / outline 2px / handle off 16(outline 色) on 24(白)
    //          pressed 28 / state-layer 40×40 / track on 填 primary off 填 surface-container-highest
    // 偏离 spec:为本工具内紧凑布局,track 缩到 36×20(handle 比例同步),
    //          其余视觉规则(off 描边 / on 填色 / handle 大小差异 / 过渡)按 spec
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
          // MD3 state layer:hover 8% / focus & pressed 12%(unchecked 用 on-surface,checked 用 primary)
          '&:hover': {
            backgroundColor: alpha(N[900], 0.08),
          },
          '&:focus-visible': {
            backgroundColor: alpha(N[900], 0.12),
          },
          '&:active': {
            backgroundColor: alpha(N[900], 0.12),
          },
          '&.Mui-checked': {
            transform: 'translateX(16px)',
            padding: 2,
            color: '#fff',
            '&:hover': {
              backgroundColor: alpha('#0d99ff', 0.08),
            },
            '&:focus-visible': {
              backgroundColor: alpha('#0d99ff', 0.12),
            },
            '&:active': {
              backgroundColor: alpha('#0d99ff', 0.12),
            },
            '& + .MuiSwitch-track': {
              opacity: 1,
              backgroundColor: '#0d99ff',
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
            'width 180ms ease, height 180ms ease, background-color 180ms ease',
        },
        track: {
          borderRadius: 10,
          border: `1.5px solid ${N[400]}`,
          backgroundColor: N[100],
          opacity: 1,
          boxSizing: 'border-box',
          transition: 'background-color 180ms ease, border-color 180ms ease',
        },
      },
    },
    // 我们 override 了 Switch/Checkbox/Radio 的 padding=0 让控件紧贴 track,
    // 后果是 FormControlLabel 的 label 直接贴到控件右边。补 8px 间距。
    MuiFormControlLabel: {
      styleOverrides: {
        label: {
          marginLeft: 8,
        },
      },
    },
    // MD3 spec:primary fab 56×56 / corner-large(16) / icon 24px / level-3 elevation
    MuiFab: {
      defaultProps: { color: 'primary' },
      styleOverrides: {
        root: {
          width: 56,
          height: 56,
          borderRadius: 16,
          // MD3 level-3 elevation:resting,hover 提到 level-4
          boxShadow:
            '0 4px 8px 3px rgba(0,0,0,0.10), 0 1px 3px 0 rgba(0,0,0,0.12)',
          '&:hover': {
            boxShadow:
              '0 6px 10px 4px rgba(0,0,0,0.12), 0 2px 3px 0 rgba(0,0,0,0.14)',
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.08), rgba(255,255,255,0.08))',
          },
          '&:focus-visible': {
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.12), rgba(255,255,255,0.12))',
          },
          '&:active': {
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.12), rgba(255,255,255,0.12))',
          },
          transition:
            'box-shadow 0.18s cubic-bezier(0.4, 0, 0.2, 1), background-image 0.18s ease',
        },
        sizeSmall: { width: 40, height: 40, borderRadius: 12 },
        sizeMedium: { width: 56, height: 56, borderRadius: 16 },
        extended: {
          width: 'auto',
          height: 56,
          paddingLeft: 16,
          paddingRight: 20,
        },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(N[900], 0.04),
        },
      },
    },
    // MD3 spec:linear progress active-indicator-height 4px
    // 偏离 spec:track/bar shape 用 pill(9999) 而非 corner-none(0)。pill 是
    // 现代 web 通行做法(GitHub / Vercel / Linear 都是 pill),保留
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 9999,
          height: 4,
          backgroundColor: alpha(N[900], 0.06),
        },
        bar: {
          borderRadius: 9999,
        },
      },
    },
    // MD3 spec:circular progress active-indicator-width 4px / size 48px
    MuiCircularProgress: {
      defaultProps: { thickness: 4, size: 48 },
      styleOverrides: {
        root: {},
      },
    },
  },
})
