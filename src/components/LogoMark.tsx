/**
 * img2UI 品牌 mark:2×2 点阵 + 一颗蓝点(从素材点阵里被"抠出"的元素)。
 * 与 src/app/icon.svg(favicon)同一几何,改这里记得同步那边。
 * 色用 ink 轴 CSS var:浅色近黑块浅点、深色近白块深点(反色胶囊语言);
 * favicon 没有 scheme 上下文,保持静态深色版。
 */
export function LogoMark({ size = 18 }: { size?: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
    >
      <rect width="32" height="32" rx="8" fill="var(--mui-palette-grey-900, #0a0a0a)" />
      <circle cx="11" cy="11" r="3" fill="var(--mui-palette-background-default, #fafafa)" />
      <circle cx="21" cy="11" r="3" fill="var(--mui-palette-background-default, #fafafa)" />
      <circle cx="11" cy="21" r="3" fill="var(--mui-palette-background-default, #fafafa)" />
      <circle cx="21" cy="21" r="3" fill="#0070f3" />
    </svg>
  )
}
