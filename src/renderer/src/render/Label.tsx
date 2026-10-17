import { layoutText } from '../text/layout'

// Single-line labels positioned from measured widths (no text-anchor / baseline tricks), so
// tables and charts look the same on screen and in SVG, PDF and PowerPoint exports.

export function textWidth(text: string, size: number, family: string, bold = false): number {
  return layoutText({ lines: [[{ text, bold }]], fontFamily: family, fontSize: size, lineHeight: 1, align: 'left' }).width
}

const r = (n: number) => Math.round(n * 100) / 100

export function Label({
  x,
  y,
  text,
  size,
  family,
  color = '#222222',
  anchor = 'start',
  bold = false,
  italic = false,
  rotate = 0
}: {
  x: number
  /** Baseline. */
  y: number
  text: string
  size: number
  family: string
  color?: string
  anchor?: 'start' | 'middle' | 'end'
  bold?: boolean
  italic?: boolean
  /** Degrees about (x, y). */
  rotate?: number
}) {
  if (!text) return null
  const w = anchor === 'start' ? 0 : textWidth(text, size, family, bold)
  const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x
  return (
    <text
      x={r(left)}
      y={r(y)}
      fontFamily={family}
      fontSize={size}
      fill={color}
      fontWeight={bold ? 'bold' : undefined}
      fontStyle={italic ? 'italic' : undefined}
      transform={rotate ? `rotate(${rotate} ${r(x)} ${r(y)})` : undefined}
      xmlSpace="preserve"
    >
      {text}
    </text>
  )
}
