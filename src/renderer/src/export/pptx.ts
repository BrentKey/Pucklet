import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Snapshot } from '../model/doc'
import { lineMidpoint, objectBounds, resolveLine } from '../model/geometry'
import type { Cap, Dash, FigObject, LineObj, TextObj } from '../model/types'
import { Node } from '../render/Figure'
import { layoutTable } from '../render/Table'
import { formatCell } from '../model/data'
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

/**
 * One slide per page. PowerPoint uses a single slide size per file, so every slide takes the
 * first page's size; other pages are centred and scaled to fit.
 */
export async function figureToPptx(snaps: Snapshot[], opts: { transparent?: boolean } = {}): Promise<Uint8Array> {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  const { width: W, height: H } = snaps[0].meta
  pptx.defineLayout({ name: 'FIGURE', width: W / IN, height: H / IN })
  pptx.layout = 'FIGURE'
  pptx.title = 'Figure'
  pptx.author = 'Pucklet'
  for (const snap of snaps) await addSlide(pptx, snap, W, H, opts)
  return (await pptx.write({ outputType: 'uint8array' })) as Uint8Array
}

async function addSlide(pptx: InstanceType<typeof import('pptxgenjs').default>, snap: Snapshot, W: number, H: number, opts: { transparent?: boolean }) {
  const { background } = snap.meta
  // Fit this page into the slide (identity when sizes match).
  const k = Math.min(W / snap.meta.width, H / snap.meta.height)
  const ox = (W - snap.meta.width * k) / 2
  const oy = (H - snap.meta.height * k) / 2
  const IN = 96 / k
  const X = (v: number) => (v + ox / k) / IN
  const Y = (v: number) => (v + oy / k) / IN
  const slide = pptx.addSlide()
  if (!opts.transparent && background !== 'none') slide.background = { color: hex(background) }

  for (const o of leaves(snap)) {
    const alpha = opacityOf(o, snap)
    const transparency = Math.round((1 - alpha) * 100)
    if (o.type === 'text') {
      slide.addText(textRuns(o) as never, {
        x: X(o.x),
        y: Y(o.y),
        w: (o.w + 4) / IN,
        h: o.h / IN,
        fontFace: o.fontFamily,
        fontSize: o.fontSize * PT * k,
        color: hex(o.color),
        align: o.align,
        valign: 'top',
        margin: 0,
        wrap: !!o.wrap,
        lineSpacingMultiple: o.lineHeight,
        rotate: o.rotation || undefined,
        transparency: transparency || undefined
      })
      continue
    }
    if (o.type === 'table' && !o.rotation) {
      // Native PowerPoint table, so the numbers stay editable.
      const l = layoutTable(o)
      const st = o.style
      const sc = o.h / l.h
      const border = st.borderWidth > 0 ? { type: 'solid', pt: st.borderWidth * PT * k, color: hex(st.borderColor) } : { type: 'none' }
      const none = { type: 'none' }
      const cell = (text: string, i: number, row: number) => ({
        text,
        options: {
          bold: row === 0,
          color: hex(row === 0 ? st.headerColor : st.color),
          align: l.numeric[i] ? 'right' : 'left',
          fill: row === 0 && st.headerFill !== 'none' ? { color: hex(st.headerFill) } : st.stripe !== 'none' && row > 0 && row % 2 === 0 ? { color: hex(st.stripe) } : undefined,
          // Publication rules: line above and below the header, and under the last row.
          border: [row === 0 ? border : none, none, row === 0 || row === o.data.rows.length ? border : none, none]
        }
      })
      const rows = [o.data.columns.map((c, i) => cell(c, i, 0)), ...o.data.rows.map((r, ri) => o.data.columns.map((_, i) => cell(formatCell(r[i] ?? null, st.decimals), i, ri + 1)))]
      slide.addTable(rows as never, {
        x: X(o.x),
        y: Y(o.y),
        w: o.w / IN,
        colW: l.colW.map((w) => (w * sc) / IN),
        rowH: (l.rowH * sc) / IN,
        fontFace: st.fontFamily,
        fontSize: st.fontSize * sc * PT * k,
        margin: (l.padX * sc * PT * k) / 1.5,
        valign: 'middle'
      } as never)
      continue
    }
    if ((o.type === 'rect' || o.type === 'ellipse') && !o.gradient) {
      const shape = o.type === 'ellipse' ? pptx.ShapeType.ellipse : o.radius > 0 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect
      slide.addShape(shape, {
        x: X(o.x),
        y: Y(o.y),
        w: o.w / IN,
        h: o.h / IN,
        rotate: o.rotation || undefined,
        fill: o.fill === 'none' ? { type: 'none' } : { color: hex(o.fill), transparency: transparency || undefined },
        line:
          o.stroke === 'none' || o.strokeWidth <= 0
            ? { type: 'none' }
            : { color: hex(o.stroke), width: o.strokeWidth * PT * k, dashType: DASH[o.dash], transparency: transparency || undefined },
        rectRadius: o.type === 'rect' && o.radius > 0 ? Math.min(1, o.radius / (Math.min(o.w, o.h) / 2)) : undefined
      } as never)
      continue
    }
    if (o.type === 'line' && nativeLine(o)) {
      const g = resolveLine(o, snap)
      const dx = g.p2.x - g.p1.x
      const dy = g.p2.y - g.p1.y
      slide.addShape(pptx.ShapeType.line, {
        x: X(Math.min(g.p1.x, g.p2.x)),
        y: Y(Math.min(g.p1.y, g.p2.y)),
        w: Math.max(Math.abs(dx), 0.01) / IN,
        h: Math.max(Math.abs(dy), 0.01) / IN,
        flipH: dx < 0,
        flipV: dy < 0,
        line: {
          color: hex(o.stroke === 'none' ? '#000000' : o.stroke),
          width: o.strokeWidth * PT * k,
          dashType: DASH[o.dash],
          beginArrowType: ARROW[o.startCap],
          endArrowType: ARROW[o.endCap],
          transparency: transparency || undefined
        }
      } as never)
      if (o.label?.trim()) {
        const m = lineMidpoint(g)
        const size = o.labelSize ?? 14
        const w = Math.max(40, o.label.length * size * 0.6)
        slide.addText(o.label, {
          x: X(m.x - w / 2),
          y: Y(m.y - size),
          w: w / IN,
          h: (size * 2) / IN,
          fontFace: 'Arial',
          fontSize: size * PT * k,
          color: hex(o.stroke === 'none' ? '#333333' : o.stroke),
          align: 'center',
          valign: 'middle',
          margin: 0,
          fill: { color: hex(background === 'none' ? '#ffffff' : background) }
        } as never)
      }
      continue
    }
    const pic = await objectPicture(o, snap)
    if (pic) slide.addImage({ data: pic.data, x: X(pic.x), y: Y(pic.y), w: pic.w / IN, h: pic.h / IN, transparency: transparency || undefined } as never)
  }

  const credits = creditText(creditsFor(snap))
  if (credits) slide.addNotes(credits)
}
