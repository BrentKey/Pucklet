import type { TextLine, TextObj, TextRun } from '../model/types'

// Text is laid out by us, not by the SVG engine: every run gets an absolute x/y. That keeps
// on-screen rendering, selection bounds and exported SVG/PDF identical, and avoids relying on
// baseline-shift / text-anchor support, which varies between Illustrator, Inkscape and browsers.

export const SCRIPT_SCALE = 0.7
const SUPER_SHIFT = -0.36
const SUB_SHIFT = 0.18
const ASCENT = 0.8

export interface LaidRun {
  run: TextRun
  x: number
  /** Baseline offset relative to the line's baseline. */
  dy: number
  fontSize: number
  width: number
}

export interface LaidLine {
  runs: LaidRun[]
  width: number
  /** Offset of the left edge of this line within the text box (depends on alignment). */
  left: number
  baseline: number
}

export interface TextLayout {
  lines: LaidLine[]
  width: number
  height: number
}

type TextStyle = Pick<TextObj, 'lines' | 'fontFamily' | 'fontSize' | 'lineHeight' | 'align'>

let ctx: CanvasRenderingContext2D | null | undefined

function measure(text: string, font: string, size: number): number {
  if (ctx === undefined) {
    ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  }
  if (!ctx) return text.length * size * 0.55
  ctx.font = font
  return ctx.measureText(text).width
}

export function cssFont(run: TextRun, size: number, family: string): string {
  return `${run.italic ? 'italic ' : ''}${run.bold ? '700 ' : '400 '}${size}px ${family}`
}

export function layoutText(t: TextStyle): TextLayout {
  const fs = t.fontSize
  const lh = fs * t.lineHeight
  const lines: LaidLine[] = t.lines.map((line, i) => {
    let x = 0
    const runs: LaidRun[] = line.map((run) => {
      const size = run.script ? fs * SCRIPT_SCALE : fs
      const width = measure(run.text, cssFont(run, size, t.fontFamily), size)
      const dy = run.script === 'super' ? fs * SUPER_SHIFT : run.script === 'sub' ? fs * SUB_SHIFT : 0
      const laid = { run, x, dy, fontSize: size, width }
      x += width
      return laid
    })
    return { runs, width: x, left: 0, baseline: i * lh + (lh - fs) / 2 + fs * ASCENT }
  })
  const width = Math.max(1, ...lines.map((l) => l.width))
  for (const l of lines) {
    l.left = t.align === 'center' ? (width - l.width) / 2 : t.align === 'right' ? width - l.width : 0
  }
  return { lines, width: Math.ceil(width), height: Math.max(1, Math.ceil(lines.length * lh)) }
}

// ---------------------------------------------------------------------------------------
// Conversions between runs and the HTML used by the in-place editor (contentEditable).

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function linesToHtml(lines: TextLine[]): string {
  return lines
    .map((line) => {
      if (!line.length || line.every((r) => !r.text)) return '<div><br></div>'
      const inner = line
        .map((r) => {
          let h = esc(r.text)
          if (r.script === 'super') h = `<sup>${h}</sup>`
          if (r.script === 'sub') h = `<sub>${h}</sub>`
          if (r.underline) h = `<u>${h}</u>`
          if (r.italic) h = `<i>${h}</i>`
          if (r.bold) h = `<b>${h}</b>`
          if (r.color) h = `<span style="color:${r.color}">${h}</span>`
          return h
        })
        .join('')
      return `<div>${inner}</div>`
    })
    .join('')
}

type Style = Omit<TextRun, 'text'>

const BLOCK = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])

function toHex(color: string): string | undefined {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (m) return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase()
  return undefined
}

function sameStyle(a: TextRun, b: TextRun): boolean {
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underline === !!b.underline && a.script === b.script && a.color === b.color
}

export function htmlToLines(root: Node): TextLine[] {
  const lines: TextLine[] = [[]]
  let pendingBreak = false
  const cur = () => lines[lines.length - 1]
  const newLine = () => lines.push([])

  const walk = (node: Node, style: Style) => {
    if (node.nodeType === 3) {
      const text = (node.textContent ?? '').replace(/ /g, ' ').replace(/[\r\n]+/g, '')
      if (!text) return
      if (pendingBreak) {
        newLine()
        pendingBreak = false
      }
      cur().push({ text, ...style })
      return
    }
    if (node.nodeType !== 1) return
    const el = node as HTMLElement
    const tag = el.tagName
    if (tag === 'BR') {
      // A trailing <br> is only the browser's placeholder that keeps an empty line open.
      if (el.nextSibling || el.parentNode === root) {
        if (pendingBreak) newLine()
        pendingBreak = false
        newLine()
      } else if (pendingBreak) {
        newLine()
        pendingBreak = false
      }
      return
    }
    const s: Style = { ...style }
    if (tag === 'B' || tag === 'STRONG') s.bold = true
    if (tag === 'I' || tag === 'EM') s.italic = true
    if (tag === 'U') s.underline = true
    if (tag === 'SUP') s.script = 'super'
    if (tag === 'SUB') s.script = 'sub'
    const st = el.style
    if (st) {
      if (st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) s.bold = true
      if (st.fontStyle === 'italic') s.italic = true
      if (st.textDecoration?.includes('underline') || st.textDecorationLine?.includes('underline')) s.underline = true
      if (st.verticalAlign === 'super') s.script = 'super'
      if (st.verticalAlign === 'sub') s.script = 'sub'
      if (st.color) s.color = toHex(st.color) ?? s.color
    }
    if (tag === 'FONT' && el.getAttribute('color')) s.color = toHex(el.getAttribute('color')!) ?? s.color
    const block = BLOCK.has(tag) && el !== root
    if (block) {
      if (cur().length || pendingBreak) newLine()
      pendingBreak = false
    }
    el.childNodes.forEach((c) => walk(c, s))
    if (block) pendingBreak = true
  }
  root.childNodes.forEach((c) => walk(c, {}))
  return normalizeLines(lines)
}

export function normalizeLines(lines: TextLine[]): TextLine[] {
  const out = lines.map((line) => {
    const merged: TextRun[] = []
    for (const r of line) {
      if (!r.text) continue
      const clean: TextRun = { text: r.text }
      if (r.bold) clean.bold = true
      if (r.italic) clean.italic = true
      if (r.underline) clean.underline = true
      if (r.script) clean.script = r.script
      if (r.color) clean.color = r.color
      const prev = merged[merged.length - 1]
      if (prev && sameStyle(prev, clean)) prev.text += clean.text
      else merged.push(clean)
    }
    return merged
  })
  return out.length ? out : [[]]
}

export const plainText = (lines: TextLine[]): string => lines.map((l) => l.map((r) => r.text).join('')).join('\n')

export const linesFromPlain = (s: string): TextLine[] => s.split('\n').map((t) => (t ? [{ text: t }] : []))
