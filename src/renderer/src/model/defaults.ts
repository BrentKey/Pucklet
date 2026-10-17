import { newId } from './doc'
import type { Asset, Cap, EllipseObj, IconObj, LineObj, RectObj, Route, TextObj } from './types'
import { withTextSize } from './transform'

/** Fonts available on both macOS and Windows, so figures look the same everywhere. */
export const FONTS = ['Arial', 'Helvetica', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Trebuchet MS']

/** Okabe–Ito: a widely used palette that stays distinguishable for colour-blind readers. */
export const SAFE_COLORS = ['#000000', '#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7']
export const NEUTRALS = ['#ffffff', '#f2f2f2', '#d9d9d9', '#a6a6a6', '#595959', '#262626']

export interface CanvasPreset {
  name: string
  width: number
  height: number
}

const mm = (v: number) => Math.round((v / 25.4) * 96)

export const CANVAS_PRESETS: CanvasPreset[] = [
  { name: 'Figure (1200 × 800 px)', width: 1200, height: 800 },
  { name: 'Journal, 1 column (89 mm)', width: mm(89), height: mm(67) },
  { name: 'Journal, 1.5 column (120 mm)', width: mm(120), height: mm(90) },
  { name: 'Journal, 2 columns (183 mm)', width: mm(183), height: mm(120) },
  { name: 'Graphical abstract, square', width: 1200, height: 1200 },
  { name: 'Graphical abstract, wide (Elsevier)', width: 1328, height: 531 },
  { name: 'Slide 16:9', width: 1280, height: 720 },
  { name: 'Slide 4:3', width: 1024, height: 768 },
  { name: 'US Letter', width: 816, height: 1056 },
  { name: 'A4', width: mm(210), height: mm(297) },
  { name: 'Poster 48 × 36 in', width: 48 * 96, height: 36 * 96 },
  { name: 'Poster A0', width: mm(841), height: mm(1189) }
]

export const SYMBOLS = [
  'α', 'β', 'γ', 'δ', 'ε', 'κ', 'λ', 'μ', 'π', 'σ', 'τ', 'φ', 'χ', 'ψ', 'ω', 'Δ', 'Σ', 'Ω',
  '±', '×', '÷', '°', '≤', '≥', '≈', '≠', '∞', '→', '←', '↔', '⇌', '↑', '↓', 'Å', '‰', '·', '⁺', '⁻'
]

const base = (z: string) => ({ id: newId(), z, opacity: 1 })

export function makeRect(z: string, x: number, y: number, w: number, h: number): RectObj {
  return { ...base(z), type: 'rect', x, y, w, h, rotation: 0, fill: '#cfe3f5', stroke: '#2f5f8f', strokeWidth: 2, dash: 'solid', radius: 8 }
}

export function makeEllipse(z: string, x: number, y: number, w: number, h: number): EllipseObj {
  return { ...base(z), type: 'ellipse', x, y, w, h, rotation: 0, fill: '#fbe3c8', stroke: '#b5651d', strokeWidth: 2, dash: 'solid' }
}

export function makeText(z: string, x: number, y: number, text = ''): TextObj {
  return withTextSize({
    ...base(z),
    type: 'text',
    x,
    y,
    w: 1,
    h: 1,
    rotation: 0,
    lines: [text ? [{ text }] : []],
    fontFamily: 'Arial',
    fontSize: 20,
    lineHeight: 1.25,
    color: '#1f1f1f',
    align: 'left'
  })
}

export function makeLine(z: string, x: number, y: number, style: { route: Route; startCap: Cap; endCap: Cap }): LineObj {
  return {
    ...base(z),
    type: 'line',
    start: { x, y },
    end: { x, y },
    ...style,
    bend: 0,
    padding: 6,
    stroke: '#333333',
    strokeWidth: 2,
    dash: 'solid'
  }
}

export function makeIcon(z: string, asset: Asset, cx: number, cy: number, maxSize?: number): IconObj {
  const max = maxSize ?? (asset.kind === 'raster' ? 320 : 140)
  const s = Math.min(max / asset.width, max / asset.height, asset.kind === 'raster' ? 1 : Infinity)
  const w = Math.max(4, asset.width * s)
  const h = Math.max(4, asset.height * s)
  return { ...base(z), type: 'icon', assetId: asset.id, x: cx - w / 2, y: cy - h / 2, w, h, rotation: 0, flipX: false, flipY: false, recolor: {}, name: asset.name }
}
