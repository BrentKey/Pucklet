import { generateNKeysBetween } from 'fractional-indexing'
import type { FigureDoc } from './doc'
import { newId } from './doc'
import { makeEllipse, makeLine, makeText } from './defaults'
import { objectBounds } from './geometry'
import { withTextSize } from './transform'
import type { FigObject, GroupObj, Id, SmartSpec, TextObj } from './types'

// "Smart" groups are generated from a small spec (steps of a protocol, events on a timeline)
// and can be regenerated from the properties panel at any time, like BioRender's Smart
// Templates. The output is ordinary shapes, text and connectors, so it stays fully editable.

export const DEFAULT_PROTOCOL: SmartSpec = {
  kind: 'protocol',
  items: ['Seed cells', 'Treat with drug', 'Incubate 24 h', 'Lyse cells', 'Western blot'],
  direction: 'horizontal',
  numbering: '1',
  color: '#0072b2',
  spacing: 170
}

export const DEFAULT_TIMELINE: SmartSpec = {
  kind: 'timeline',
  items: ['Day 0: Tumour implant', 'Day 7: Start treatment', 'Day 14: Imaging', 'Day 21: Endpoint'],
  direction: 'horizontal',
  numbering: 'none',
  color: '#d55e00',
  spacing: 200
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx']

export function stepNumber(i: number, style: SmartSpec['numbering']): string {
  if (style === 'i') return ROMAN[i] ?? String(i + 1)
  if (style === 'a') return String.fromCharCode(97 + (i % 26))
  if (style === 'A') return String.fromCharCode(65 + (i % 26))
  if (style === 'none') return ''
  return String(i + 1)
}

/** "Day 0: Inject" -> ["Day 0", "Inject"]; text without a colon has no time part. */
function splitItem(item: string): [string, string] {
  const i = item.indexOf(':')
  return i > 0 ? [item.slice(0, i).trim(), item.slice(i + 1).trim()] : ['', item.trim()]
}

function text(z: string, x: number, y: number, content: string, opts: Partial<TextObj>): TextObj {
  const lines = content.split('\n').map((l) => (l ? [{ text: l }] : []))
  return withTextSize({ ...makeText(z, x, y), lines, ...opts })
}

/** Place text centred on (cx, top). */
const centredAt = (t: TextObj, cx: number, top: number): TextObj => ({ ...t, x: cx - t.w / 2, y: top })

/** Builds the children for a spec, with (x, y) the top-left of the result. */
export function generate(spec: SmartSpec, x: number, y: number, parent: Id): FigObject[] {
  const items = spec.items.filter((s) => s.trim())
  const n = Math.max(1, items.length)
  const keys = generateNKeysBetween(null, null, n * 4 + 2)
  let k = 0
  const z = () => keys[k++]
  const out: FigObject[] = []
  const add = <T extends FigObject>(o: T): T => {
    const c = { ...o, parentId: parent }
    out.push(c)
    return c
  }
  const vertical = spec.direction === 'vertical'
  const pitch = Math.max(60, spec.spacing)

  if (spec.kind === 'timeline') {
    const len = (n - 1) * pitch
    const pad = 40
    const axis = vertical
      ? { x1: x + 8, y1: y, x2: x + 8, y2: y + len + pad * 2 }
      : { x1: x, y1: y + 40, x2: x + len + pad * 2, y2: y + 40 }
    const line = makeLine(z(), axis.x1, axis.y1, { route: 'straight', startCap: 'none', endCap: 'arrow' })
    add({ ...line, end: { x: axis.x2, y: axis.y2 }, stroke: '#333333', strokeWidth: 3, padding: 0, name: 'Timeline axis' })
    items.forEach((item, i) => {
      const [time, label] = splitItem(item)
      const px = vertical ? axis.x1 : x + pad + i * pitch
      const py = vertical ? y + pad + i * pitch : axis.y1
      const dot = makeEllipse(z(), px - 8, py - 8, 16, 16)
      add({ ...dot, fill: spec.color, stroke: '#ffffff', strokeWidth: 2, name: `Event ${i + 1}` })
      if (vertical) {
        if (time) add({ ...text(z(), px + 20, py - 22, time, { fontSize: 16, color: spec.color }), lines: [[{ text: time, bold: true }]] })
        add(text(z(), px + 20, py - (time ? 2 : 11), label, { fontSize: 16 }))
      } else {
        if (time) {
          const t = withTextSize({ ...text(z(), 0, 0, time, { fontSize: 16, color: spec.color }), lines: [[{ text: time, bold: true }]] })
          add(centredAt(t, px, py - 40))
        }
        add(centredAt(text(z(), 0, 0, label, { fontSize: 16, align: 'center' }), px, py + 18))
      }
    })
    return out
  }

  // Protocol: numbered markers joined by arrows, a label beside or below each.
  const d = 46
  const markers: Id[] = []
  items.forEach((item, i) => {
    const cx = vertical ? x + d / 2 : x + d / 2 + i * pitch
    const cy = vertical ? y + d / 2 + i * pitch : y + d / 2
    const marker = add({ ...makeEllipse(z(), cx - d / 2, cy - d / 2, d, d), fill: spec.color, stroke: 'none', strokeWidth: 0, name: `Step ${i + 1}` })
    markers.push(marker.id)
    const num = stepNumber(i, spec.numbering)
    if (num) {
      const t = withTextSize({ ...text(z(), 0, 0, num, { fontSize: 20, color: '#ffffff', align: 'center' }), lines: [[{ text: num, bold: true }]] })
      add({ ...t, x: cx - t.w / 2, y: cy - t.h / 2 })
    }
    const [head, body] = splitItem(item)
    const content = head ? `${head}\n${body}` : body
    if (vertical) {
      const t = text(z(), x + d + 16, 0, content, { fontSize: 17 })
      add({ ...t, y: cy - t.h / 2 })
    } else {
      add(centredAt(text(z(), 0, 0, content, { fontSize: 17, align: 'center' }), cx, y + d + 12))
    }
  })
  for (let i = 0; i < markers.length - 1; i++) {
    const l = makeLine(z(), 0, 0, { route: 'straight', startCap: 'none', endCap: 'arrow' })
    add({ ...l, start: { x: 0, y: 0, bind: markers[i] }, end: { x: 0, y: 0, bind: markers[i + 1] }, stroke: '#555555', strokeWidth: 2.5, padding: 8 })
  }
  return out
}

export function insertSmart(doc: FigureDoc, spec: SmartSpec, x: number, y: number, parent: Id | ''): Id {
  const group: GroupObj = {
    id: newId(),
    type: 'group',
    z: doc.snapshot().topZ(parent),
    opacity: 1,
    smart: spec,
    name: spec.kind === 'protocol' ? 'Protocol' : 'Timeline',
    ...(parent ? { parentId: parent } : {})
  }
  const children = generate(spec, x, y, group.id)
  doc.transact((tx) => {
    tx.add(group)
    children.forEach((c) => tx.add(c))
  })
  return group.id
}

/** Replaces a smart group's contents with a fresh layout from `spec`, keeping its position. */
export function regenerate(doc: FigureDoc, groupId: Id, spec: SmartSpec): void {
  const snap = doc.snapshot()
  const g = snap.get(groupId)
  if (!g || g.type !== 'group') return
  const b = objectBounds(g, snap)
  // Re-anchor at the old top-left so the group doesn't jump around while typing.
  const fresh = generate(spec, 0, 0, groupId)
  const probe = new Map(fresh.map((o) => [o.id, o]))
  const nb = objectBounds({ ...g, id: '__probe' }, {
    get: (id) => probe.get(id),
    children: (id) => (id === '__probe' ? fresh : [])
  })
  const dx = (b?.x ?? 0) - (nb?.x ?? 0)
  const dy = (b?.y ?? 0) - (nb?.y ?? 0)
  const children = generate(spec, dx, dy, groupId)
  doc.transact((tx) => {
    for (const id of snap.descendants([groupId])) tx.remove(id)
    tx.update<GroupObj>(groupId, { smart: spec })
    children.forEach((c) => tx.add(c))
  })
}
