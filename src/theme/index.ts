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
      secondary: N[600],
      disabled: N[400],
    },
    grey: N,
    action: {
      hover: 'rgba(15, 23, 42, 0.04)',
      selected: 'rgba(13, 153, 255, 0.08)',
      disabled: N[300],
      disabledBackground: N[100],
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
      color: N[500],
    },
    body1: { fontSize: '0.9375rem', lineHeight: 1.55 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5 },
    caption: { fontSize: '0.75rem', lineHeight: 1.45, color: N[500] },
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
      color: N[500],
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
    // 全局关 ripple — Material 默认水波纹是廉价感的最大来源之一
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
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
          letterSpacing: 0,
        },
        sizeSmall: {
          fontSize: '0.8125rem',
          padding: '4px 12px',
          minHeight: 28,
        },
        sizeMedium: {
          padding: '6px 14px',
          minHeight: 34,
        },
        outlined: {
          borderColor: HAIRLINE_STRONG,
          '&:hover': {
            borderColor: N[400],
            backgroundColor: alpha(N[900], 0.03),
          },
        },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        },
        text: {
          '&:hover': {
            backgroundColor: alpha(N[900], 0.04),
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          color: N[600],
          '&:hover': {
            backgroundColor: alpha(N[900], 0.05),
            color: N[800],
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
          letterSpacing: 0,
        },
        sizeSmall: {
          height: 22,
          fontSize: '0.75rem',
        },
        outlined: {
          borderColor: HAIRLINE_STRONG,
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          borderRadius: 8,
          fontSize: '0.875rem',
          '& fieldset': {
            borderColor: HAIRLINE_STRONG,
            transition: 'border-color 0.15s ease',
          },
          '&:hover fieldset': {
            borderColor: `${N[400]} !important`,
          },
          '&.Mui-focused fieldset': {
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
          color: N[500],
        },
      },
    },
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
    MuiTooltip: {
      defaultProps: {
        arrow: false,
      },
      styleOverrides: {
        tooltip: {
          fontSize: '0.75rem',
          fontWeight: 500,
          backgroundColor: N[900],
          padding: '6px 10px',
          borderRadius: 6,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: HAIRLINE },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          // dialog 提一档 — 让弹层从背景"浮"出来
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '1.0625rem',
          fontWeight: 600,
          padding: '20px 24px 8px',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '8px 24px 16px',
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
    MuiSwitch: {
      styleOverrides: {
        root: {
          width: 36,
          height: 20,
          padding: 0,
        },
        switchBase: {
          padding: 2,
          '&.Mui-checked': {
            transform: 'translateX(16px)',
            '& + .MuiSwitch-track': {
              opacity: 1,
              backgroundColor: '#0d99ff',
            },
          },
        },
        thumb: {
          width: 16,
          height: 16,
          boxShadow: `0 1px 2px ${alpha(N[900], 0.2)}`,
        },
        track: {
          borderRadius: 10,
          backgroundColor: N[300],
          opacity: 1,
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          boxShadow: `0 4px 12px ${alpha('#0d99ff', 0.3)}, 0 0 0 1px ${alpha('#0d99ff', 0.15)}`,
          '&:hover': {
            boxShadow: `0 8px 20px ${alpha('#0d99ff', 0.4)}, 0 0 0 1px ${alpha('#0d99ff', 0.2)}`,
            transform: 'translateY(-1px)',
          },
          transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
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
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          height: 4,
          backgroundColor: alpha(N[900], 0.06),
        },
        bar: {
          borderRadius: 999,
        },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: {
          // 默认 thickness 太细
        },
      },
    },
  },
})
