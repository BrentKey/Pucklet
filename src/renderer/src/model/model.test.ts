import { describe, expect, it } from 'vitest'
import { FigureDoc } from './doc'
import { deserialize, serialize } from './file'
import { resolveLine } from './geometry'
import { align, copyObjects, deleteObjects, distribute, groupObjects, pasteClip, reorder, ungroupObjects } from './ops'
import { resizeBox, rotateAbout, scaleAbout, translate } from './transform'
import type { FigObject, LineObj, RectObj } from './types'

const rect = (id: string, x: number, y: number, z: string, extra: Partial<RectObj> = {}): RectObj => ({
  id, type: 'rect', z, x, y, w: 100, h: 50, rotation: 0, opacity: 1,
  fill: '#ffffff', stroke: '#000000', strokeWidth: 1, dash: 'solid', radius: 0, ...extra
})

const line = (id: string, z: string, start: LineObj['start'], end: LineObj['end'], extra: Partial<LineObj> = {}): LineObj => ({
  id, type: 'line', z, start, end, route: 'straight', bend: 0, startCap: 'none', endCap: 'arrow',
  padding: 0, stroke: '#000000', strokeWidth: 2, dash: 'solid', opacity: 1, ...extra
})

function docWith(objects: FigObject[]) {
  return new FigureDoc({ meta: { width: 1000, height: 1000, background: '#ffffff' }, objects, assets: [] })
}

describe('connectors', () => {
  it('attach to the outline of bound objects and follow them', () => {
    const doc = docWith([
      rect('a', 0, 0, 'a0'),
      rect('b', 300, 0, 'a1'),
      line('l', 'a2', { x: 0, y: 0, bind: 'a' }, { x: 0, y: 0, bind: 'b' }, { padding: 5 })
    ])
    let g = resolveLine(doc.snapshot().get('l') as LineObj, doc.snapshot())
    expect(g.p1).toEqual({ x: 105, y: 25 })
    expect(g.p2).toEqual({ x: 295, y: 25 })

    doc.transact((tx) => tx.update('b', { y: 200 }))
    g = resolveLine(doc.snapshot().get('l') as LineObj, doc.snapshot())
    expect(g.p2.y).toBeLessThan(225)
    expect(g.p2.x).toBeGreaterThan(300)
  })

  it('freeze endpoints when the bound object is deleted', () => {
    const doc = docWith([rect('a', 0, 0, 'a0'), line('l', 'a1', { x: 0, y: 0, bind: 'a' }, { x: 400, y: 25 })])
    deleteObjects(doc, ['a'])
    const l = doc.snapshot().get('l') as LineObj
    expect(l.start.bind).toBeUndefined()
    expect(l.start).toEqual({ x: 100, y: 25 })
  })

  it('elbow routes use orthogonal segments', () => {
    const doc = docWith([line('l', 'a0', { x: 0, y: 0 }, { x: 200, y: 100 }, { route: 'elbow' })])
    const g = resolveLine(doc.snapshot().get('l') as LineObj, doc.snapshot())
    expect(g.pts).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }])
  })
})

describe('transforms', () => {
  it('resize keeps the opposite corner fixed, including when rotated', () => {
    const r = rect('a', 0, 0, 'a0')
    expect(resizeBox(r, 'se', { x: 200, y: 100 }, false)).toMatchObject({ x: 0, y: 0, w: 200, h: 100 })
    expect(resizeBox(r, 'nw', { x: -100, y: -50 }, false)).toMatchObject({ x: -100, y: -50, w: 200, h: 100 })
    expect(resizeBox(r, 'se', { x: 200, y: 60 }, true)).toMatchObject({ w: 200, h: 100 })

    const rot = { ...r, rotation: 90 }
    const out = resizeBox(rot, 'e', { x: 50, y: 125 }, false)
    // Rotated 90°: the box's local "east" points down the screen.
    expect(out.w).toBeCloseTo(150)
    expect(out.h).toBeCloseTo(50)
  })

  it('translate, scale and rotate groups through their children', () => {
    const doc = docWith([rect('a', 0, 0, 'a0'), rect('b', 200, 0, 'a1')])
    const gid = groupObjects(doc, ['a', 'b'])!
    const snap = doc.snapshot()
    expect(translate(snap, [gid], 10, 5).get('b')).toMatchObject({ x: 210, y: 5 })
    expect(scaleAbout(snap, [gid], { x: 0, y: 0 }, 2, 2).get('b')).toMatchObject({ x: 400, y: 0, w: 200, h: 100 })
    const r = rotateAbout(snap, [gid], { x: 150, y: 25 }, 180).get('a') as RectObj
    expect(r.x).toBeCloseTo(200)
    expect(r.rotation).toBe(180)
  })
})

describe('document operations', () => {
  it('group, ungroup and undo', () => {
    const doc = docWith([rect('a', 0, 0, 'a0'), rect('b', 200, 0, 'a1'), rect('c', 400, 0, 'a2')])
    const gid = groupObjects(doc, ['a', 'b'])!
    expect(doc.snapshot().children('').map((o) => o.id)).toEqual([gid, 'c'])
    ungroupObjects(doc, [gid])
    expect(doc.snapshot().children('').map((o) => o.id)).toEqual(['a', 'b', 'c'])
    doc.undo()
    expect(doc.snapshot().children('').map((o) => o.id)).toEqual([gid, 'c'])
    doc.undo()
    expect(doc.snapshot().get('a')!.parentId).toBeUndefined()
  })

  it('merges a continuous gesture into one undo step', () => {
    const doc = docWith([rect('a', 0, 0, 'a0')])
    doc.beginGesture()
    for (const opacity of [0.9, 0.7, 0.5]) doc.transact((tx) => tx.update('a', { opacity }))
    doc.endGesture()
    doc.transact((tx) => tx.update('a', { x: 50 }))
    doc.undo()
    expect(doc.snapshot().get('a')).toMatchObject({ x: 0, opacity: 0.5 })
    doc.undo()
    expect(doc.snapshot().get('a')!.opacity).toBe(1)
  })

  it('reorders within siblings', () => {
    const doc = docWith([rect('a', 0, 0, 'a0'), rect('b', 0, 0, 'a1'), rect('c', 0, 0, 'a2')])
    reorder(doc, ['a'], 'front')
    expect(doc.snapshot().children('').map((o) => o.id)).toEqual(['b', 'c', 'a'])
    reorder(doc, ['a'], 'backward')
    expect(doc.snapshot().children('').map((o) => o.id)).toEqual(['b', 'a', 'c'])
    reorder(doc, ['c'], 'back')
    expect(doc.snapshot().children('').map((o) => o.id)).toEqual(['c', 'b', 'a'])
  })

  it('aligns and distributes', () => {
    const doc = docWith([rect('a', 0, 0, 'a0'), rect('b', 130, 40, 'a1'), rect('c', 400, 90, 'a2')])
    align(doc, ['a', 'b', 'c'], 'top')
    expect(['a', 'b', 'c'].map((id) => (doc.snapshot().get(id) as RectObj).y)).toEqual([0, 0, 0])
    distribute(doc, ['a', 'b', 'c'], 'h')
    expect((doc.snapshot().get('b') as RectObj).x).toBe(200)
  })

  it('copy/paste remaps ids, groups and connector bindings', () => {
    const doc = docWith([
      rect('a', 0, 0, 'a0'),
      rect('b', 300, 0, 'a1'),
      line('l', 'a2', { x: 0, y: 0, bind: 'a' }, { x: 0, y: 0, bind: 'b' })
    ])
    const clip = copyObjects(doc.snapshot(), ['a', 'l'])
    const ids = pasteClip(doc, clip, '', 20, 20)
    expect(ids).toHaveLength(2)
    const snap = doc.snapshot()
    const newLine = snap.get(ids.find((i) => snap.get(i)!.type === 'line')!) as LineObj
    const newRect = ids.find((i) => snap.get(i)!.type === 'rect')!
    expect(newLine.start.bind).toBe(newRect)
    expect(newLine.end.bind).toBeUndefined()
  })
})

describe('file format', () => {
  it('round-trips objects and assets', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="#ff0000"/></svg>'
    const doc = new FigureDoc({
      meta: { width: 640, height: 480, background: '#fafafa' },
      objects: [
        rect('a', 1, 2, 'a0'),
        { id: 'i', type: 'icon', z: 'a1', x: 0, y: 0, w: 50, h: 50, rotation: 0, opacity: 1, assetId: 'svg-1', flipX: false, flipY: false, recolor: { '#ff0000': '#00ff00' } }
      ],
      assets: [{ id: 'svg-1', kind: 'svg', name: 'Square', data: svg, width: 10, height: 10, palette: ['#ff0000'], source: { library: 'Test', license: 'CC0' } }]
    })
    const back = deserialize(serialize(doc.toData()))
    expect(back.meta).toEqual({ width: 640, height: 480, background: '#fafafa' })
    expect(back.objects).toEqual(doc.toData().objects)
    expect(back.assets[0].data).toBe(svg)
  })

  it('rejects files that are not figures', () => {
    expect(() => deserialize(new Uint8Array([1, 2, 3]))).toThrow(/not a Pucklet/)
  })
})

describe('panels', () => {
  it('lays out frames with letters and re-letters in reading order', async () => {
    const { addPanelLayout, reletterPanels, PANEL_LAYOUTS, DEFAULT_PANEL_OPTIONS, panelLetter } = await import('./panels')
    const doc = new FigureDoc({ meta: { width: 1000, height: 600, background: '#ffffff' }, objects: [], assets: [] })
    addPanelLayout(doc, PANEL_LAYOUTS.find((l) => l.id === '2x2')!, DEFAULT_PANEL_OPTIONS)
    const labels = () =>
      [...doc.snapshot().objects.values()]
        .filter((o) => o.role === 'panel-label')
        .map((o) => ({ t: (o as never as { lines: { text: string }[][] }).lines[0][0].text, x: (o as RectObj).x, y: (o as RectObj).y }))
        .sort((a, b) => a.y - b.y || a.x - b.x)
    expect(labels().map((l) => l.t)).toEqual(['A', 'B', 'C', 'D'])
    const frames = [...doc.snapshot().objects.values()].filter((o) => o.role === 'panel-frame') as RectObj[]
    expect(frames).toHaveLength(4)
    expect(frames[0].w).toBeCloseTo((1000 - 48 - 24) / 2)

    // Swap two labels' positions, then re-letter.
    const [a, , , d] = [...doc.snapshot().objects.values()].filter((o) => o.role === 'panel-label') as RectObj[]
    doc.transact((tx) => {
      tx.update(a.id, { x: d.x, y: d.y })
      tx.update(d.id, { x: a.x, y: a.y })
    })
    reletterPanels(doc, '(a)')
    expect(labels().map((l) => l.t)).toEqual(['(a)', '(b)', '(c)', '(d)'])
    expect(panelLetter(27, 'A')).toBe('AB')
  })
})

describe('brushes', () => {
  it('spaces units evenly along open and closed paths', async () => {
    const { brushUnits, simplify, circlePoints } = await import('./brush')
    const open = brushUnits({ points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], closed: false, smooth: false, spacing: 10 })
    expect(open.units).toHaveLength(11)
    expect(open.units[10].p).toEqual({ x: 100, y: 0 })
    expect(open.units[0].angle).toBe(0)

    const ring = brushUnits({ points: circlePoints(0, 0, 100, 100, 12), closed: true, smooth: true, spacing: 12 })
    const gaps = ring.units.map((u, i) => Math.hypot(u.p.x - ring.units[(i + 1) % ring.units.length].p.x, u.p.y - ring.units[(i + 1) % ring.units.length].p.y))
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(1)
    expect(ring.s.length).toBeGreaterThan(620)

    const noisy = Array.from({ length: 50 }, (_, i) => ({ x: i * 2, y: i % 2 ? 0.3 : -0.3 }))
    expect(simplify(noisy, 1)).toHaveLength(2)
  })

  it('moves, scales and copies with the rest of the figure', async () => {
    const { makeBrush } = await import('./defaults')
    const b = { ...makeBrush('a0', 'bilayer', [{ x: 0, y: 0 }, { x: 100, y: 0 }], false), id: 'b' }
    const doc = docWith([b])
    expect(translate(doc.snapshot(), ['b'], 5, 5).get('b')).toMatchObject({ points: [{ x: 5, y: 5 }, { x: 105, y: 5 }] })
    expect(scaleAbout(doc.snapshot(), ['b'], { x: 0, y: 0 }, 2, 2).get('b')).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 200, y: 0 }] })
    const back = deserialize(serialize(doc.toData()))
    expect(back.objects[0]).toEqual(b)
  })
})
