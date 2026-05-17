'use client'

import { createTheme } from '@mui/material/styles'

// PLAN §1.1 / §14.3:Material Design 3 视觉语言 + Figma 蓝主色 #0d99ff
// 替换 MD3 baseline 紫,其他 MD3 token(大圆角 / ripple / elevation)保留。

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0d99ff', // Figma blue
      light: '#5cb8ff',
      dark: '#006fc7',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#5e6b7a',
      light: '#8b97a5',
      dark: '#3a4651',
      contrastText: '#ffffff',
    },
    background: {
      default: '#fafbfc',
      paper: '#ffffff',
    },
    divider: 'rgba(0, 0, 0, 0.08)',
    text: {
      primary: '#1f2933',
      secondary: '#52606d',
    },
  },
  shape: {
    borderRadius: 16, // MD3 大圆角(Card 默认)
  },
  typography: {
    fontFamily:
      '"Roboto", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif',
    h1: { fontSize: '2rem', fontWeight: 600 },
    h2: { fontSize: '1.5rem', fontWeight: 600 },
    h3: { fontSize: '1.25rem', fontWeight: 600 },
    h4: { fontSize: '1.125rem', fontWeight: 600 },
    h5: { fontSize: '1rem', fontWeight: 600 },
    h6: { fontSize: '0.875rem', fontWeight: 600 },
    body1: { fontSize: '0.9375rem' },
    body2: { fontSize: '0.875rem' },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 12, // MD3 中圆角
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },
    MuiCard: {
      defaultProps: { elevation: 1 },
      styleOverrides: {
        root: {
          transition: 'box-shadow 0.2s, transform 0.2s',
        },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
    },
  },
})
