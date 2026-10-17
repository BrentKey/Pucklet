import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Snapshot } from '../model/doc'
import { objectBounds, resolveLine } from '../model/geometry'
import type { Cap, Dash, FigObject, LineObj, TextObj } from '../model/types'
import { Node } from '../render/Figure'
import { creditsFor, creditText, svgToPng } from './export'

// PowerPoint export. Text, rectangles, ellipses and straight connectors become native,
// editable PowerPoint objects; everything else (icons, brushes, curved connectors) is placed
// as a 300 dpi picture of exactly that object, so the slide stays editable piece by piece.

const IN = 96 // px per inch
const PT = 0.75 // pt per px
const DPI = 300

const hex = (c: string) => c.replace('#', '').toUpperCase()

const DASH: Record<Dash, 'solid' | 'dash' | 'sysDot'> = { solid: 'solid', dashed: 'dash', dotted: 'sysDot' }
const ARROW: Partial<Record<Cap, 'none' | 'arrow' | 'triangle' | 'oval' | 'diamond'>> = {
  none: 'none',
  arrow: 'triangle',
  open: 'arrow',
  dot: 'oval',
  diamond: 'diamond'
}

/** Paint-order list of drawable objects, with groups flattened (coordinates are absolute). */
function leaves(snap: Snapshot): FigObject[] {
  const out: FigObject[] = []
  const walk = (parent: string) => {
    for (const o of snap.children(parent)) {
      if (o.hidden) continue
      if (o.type === 'group') walk(o.id)
      else out.push(o)
    }
  }
  walk('')
  return out
}

/** Effective opacity including enclosing groups. */
function opacityOf(o: FigObject, snap: Snapshot): number {
  let a = o.opacity
  for (let p = snap.parentOf(o.id); p; p = snap.parentOf(p)) a *= snap.get(p)?.opacity ?? 1
  return a
}

async function objectPicture(o: FigObject, snap: Snapshot): Promise<{ data: string; x: number; y: number; w: number; h: number } | null> {
  const b = objectBounds(o, snap)
  if (!b) return null
  const pad = 2 + ('strokeWidth' in o ? o.strokeWidth * 3 : 0)
  const x = b.x - pad
  const y = b.y - pad
  const w = Math.max(1, b.w + pad * 2)
  const h = Math.max(1, b.h + pad * 2)
  const body = renderToStaticMarkup(createElement(Node, { o, snap, mode: 'export' }))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">${body}</svg>`
  // Keep very large objects within the renderer's limits.
  const scale = Math.min(DPI / IN, 8000 / w, 8000 / h)
  const png = await svgToPng(svg, w, h, scale, DPI)
  let bin = ''
  for (let i = 0; i < png.length; i += 0x8000) bin += String.fromCharCode(...png.subarray(i, i + 0x8000))
  return { data: `data:image/png;base64,${btoa(bin)}`, x, y, w, h }
}

function textRuns(t: TextObj) {
  const runs: { text: string; options: Record<string, unknown> }[] = []
  t.lines.forEach((line, li) => {
    const last = li === t.lines.length - 1
    if (!line.length) {
      runs.push({ text: '', options: { breakLine: !last } })
      return
    }
    line.forEach((r, ri) => {
      runs.push({
        text: r.text,
        options: {
          bold: !!r.bold,
          italic: !!r.italic,
          underline: r.underline ? { style: 'sng' } : undefined,
          superscript: r.script === 'super',
          subscript: r.script === 'sub',
          color: hex(r.color ?? t.color),
          breakLine: !last && ri === line.length - 1
        }
      })
    })
  })
  return runs
}

const nativeLine = (o: LineObj) => o.route === 'straight' && ARROW[o.startCap] !== undefined && ARROW[o.endCap] !== undefined

export async function figureToPptx(snap: Snapshot, opts: { transparent?: boolean } = {}): Promise<Uint8Array> {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  const { width: W, height: H, background } = snap.meta
  pptx.defineLayout({ name: 'FIGURE', width: W / IN, height: H / IN })
  pptx.layout = 'FIGURE'
  pptx.title = 'Figure'
  pptx.author = 'Pucklet'
  const slide = pptx.addSlide()
  if (!opts.transparent && background !== 'none') slide.background = { color: hex(background) }

  for (const o of leaves(snap)) {
    const alpha = opacityOf(o, snap)
    const transparency = Math.round((1 - alpha) * 100)
    if (o.type === 'text') {
      slide.addText(textRuns(o) as never, {
        x: o.x / IN,
        y: o.y / IN,
        w: (o.w + 4) / IN,
        h: o.h / IN,
        fontFace: o.fontFamily,
        fontSize: o.fontSize * PT,
        color: hex(o.color),
        align: o.align,
        valign: 'top',
        margin: 0,
        wrap: false,
        lineSpacingMultiple: o.lineHeight,
        rotate: o.rotation || undefined,
        transparency: transparency || undefined
      })
      continue
    }
    if (o.type === 'rect' || o.type === 'ellipse') {
      const shape = o.type === 'ellipse' ? pptx.ShapeType.ellipse : o.radius > 0 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect
      slide.addShape(shape, {
        x: o.x / IN,
        y: o.y / IN,
        w: o.w / IN,
        h: o.h / IN,
        rotate: o.rotation || undefined,
        fill: o.fill === 'none' ? { type: 'none' } : { color: hex(o.fill), transparency: transparency || undefined },
        line:
          o.stroke === 'none' || o.strokeWidth <= 0
            ? { type: 'none' }
            : { color: hex(o.stroke), width: o.strokeWidth * PT, dashType: DASH[o.dash], transparency: transparency || undefined },
        rectRadius: o.type === 'rect' && o.radius > 0 ? Math.min(1, o.radius / (Math.min(o.w, o.h) / 2)) : undefined
      } as never)
      continue
    }
    if (o.type === 'line' && nativeLine(o)) {
      const g = resolveLine(o, snap)
      const dx = g.p2.x - g.p1.x
      const dy = g.p2.y - g.p1.y
      slide.addShape(pptx.ShapeType.line, {
        x: Math.min(g.p1.x, g.p2.x) / IN,
        y: Math.min(g.p1.y, g.p2.y) / IN,
        w: Math.max(Math.abs(dx), 0.01) / IN,
        h: Math.max(Math.abs(dy), 0.01) / IN,
        flipH: dx < 0,
        flipV: dy < 0,
        line: {
          color: hex(o.stroke === 'none' ? '#000000' : o.stroke),
          width: o.strokeWidth * PT,
          dashType: DASH[o.dash],
          beginArrowType: ARROW[o.startCap],
          endArrowType: ARROW[o.endCap],
          transparency: transparency || undefined
        }
      } as never)
      continue
    }
    const pic = await objectPicture(o, snap)
    if (pic) slide.addImage({ data: pic.data, x: pic.x / IN, y: pic.y / IN, w: pic.w / IN, h: pic.h / IN, transparency: transparency || undefined } as never)
  }

  const credits = creditText(creditsFor(snap))
  if (credits) slide.addNotes(credits)
  return (await pptx.write({ outputType: 'uint8array' })) as Uint8Array
}
