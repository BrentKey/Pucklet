import { generateNKeysBetween } from 'fractional-indexing'
import { circlePoints } from '../model/brush'
import { makeBrush, makeEllipse, makeLine, makeRect, makeText } from '../model/defaults'
import { newId } from '../model/doc'
import type { Clip } from '../model/ops'
import { DEFAULT_PROTOCOL, DEFAULT_TIMELINE, generate } from '../model/smart'
import { withTextSize } from '../model/transform'
import type { Cap, FigObject, GroupObj, LineObj, SmartSpec, TextObj } from '../model/types'

// Built-in starter templates, drawn entirely from Pucklet's own shapes, brushes and text
// (no third-party artwork), so they can be shipped and modified freely.

export interface Template {
  id: string
  name: string
  category: string
  description: string
  build(): Clip
}

/** Small helper that hands out increasing z keys and collects objects. */
function builder() {
  const keys = generateNKeysBetween(null, null, 400)
  let k = 0
  const objects: FigObject[] = []
  const z = () => keys[k++]
  return {
    z,
    objects,
    add<T extends FigObject>(o: T): T {
      objects.push(o)
      return o
    },
    text(x: number, y: number, content: string, opts: Partial<TextObj> = {}): TextObj {
      const lines = content.split('\n').map((l) => (l ? [{ text: l }] : []))
      const t = withTextSize({ ...makeText(z(), x, y), lines, ...opts })
      return this.add(opts.align === 'center' ? { ...t, x: x - t.w / 2 } : t)
    },
    arrow(from: string, to: string, end: Cap = 'arrow', extra: Partial<LineObj> = {}): LineObj {
      const l = makeLine(z(), 0, 0, { route: 'straight', startCap: 'none', endCap: end })
      return this.add({ ...l, start: { x: 0, y: 0, bind: from }, end: { x: 0, y: 0, bind: to }, strokeWidth: 2.5, ...extra })
    },
    box(x: number, y: number, w: number, h: number, label: string, fill: string, stroke: string) {
      const r = this.add({ ...makeRect(z(), x, y, w, h), fill, stroke, radius: Math.min(h / 2, 14), name: label })
      this.text(x + w / 2, y + h / 2 - 11, label, { fontSize: 17, align: 'center', lines: [[{ text: label, bold: true }]] })
      return r
    },
    smart(spec: SmartSpec, x: number, y: number) {
      const g: GroupObj = { id: newId(), type: 'group', z: z(), opacity: 1, smart: spec, name: spec.kind === 'protocol' ? 'Protocol' : 'Timeline' }
      this.add(g)
      objects.push(...generate(spec, x, y, g.id))
      return g
    }
  }
}

function signallingCell(): Clip {
  const b = builder()
  b.add({ ...makeBrush(b.z(), 'bilayer', circlePoints(420, 330, 380, 270, 16), true), name: 'Plasma membrane' })
  const nucleus = b.add({ ...makeBrush(b.z(), 'bilayer', circlePoints(560, 400, 150, 110, 12), true), thickness: 30, spacing: 10, colors: ['#9ecae1', '#c6dbef'], name: 'Nuclear envelope' })
  b.add({ ...makeBrush(b.z(), 'dna', [{ x: 470, y: 420 }, { x: 540, y: 380 }, { x: 610, y: 430 }, { x: 660, y: 390 }], false), thickness: 22, spacing: 50, name: 'DNA' })
  const receptor = b.box(160, 50, 70, 110, 'R', '#56b4e9', '#0072b2')
  const ligand = b.add({ ...makeEllipse(b.z(), 172, -40, 46, 46), fill: '#e69f00', stroke: '#b5651d', name: 'Ligand' })
  b.text(228, -32, 'Ligand', { fontSize: 16 })
  const k1 = b.box(230, 250, 130, 50, 'Kinase A', '#d9f0d3', '#009e73')
  const k2 = b.box(300, 360, 130, 50, 'Kinase B', '#d9f0d3', '#009e73')
  const tf = b.box(520, 300, 80, 44, 'TF', '#fde0c5', '#d55e00')
  const inhibitor = b.box(80, 380, 120, 44, 'Inhibitor', '#f2f2f2', '#595959')
  b.arrow(ligand.id, receptor.id)
  b.arrow(receptor.id, k1.id)
  b.arrow(k1.id, k2.id)
  b.arrow(k2.id, tf.id)
  b.arrow(inhibitor.id, k2.id, 'bar', { stroke: '#d55e00' })
  b.text(560, 480, 'Gene expression', { fontSize: 16, align: 'center', lines: [[{ text: 'Gene expression', italic: true }]] })
  b.text(20, 560, 'Cytoplasm', { fontSize: 15, color: '#595959' })
  void nucleus
  return { objects: b.objects, assets: [] }
}

function membraneTransport(): Clip {
  const b = builder()
  b.add({ ...makeBrush(b.z(), 'bilayer', [{ x: 0, y: 160 }, { x: 760, y: 160 }], false), smooth: false, name: 'Membrane' })
  const channel = b.add({ ...makeRect(b.z(), 170, 120, 60, 80), fill: '#56b4e9', stroke: '#0072b2', radius: 12, name: 'Channel' })
  const pump = b.add({ ...makeRect(b.z(), 470, 115, 90, 90), fill: '#cc79a7', stroke: '#8e3b6b', radius: 20, name: 'Pump' })
  b.text(200, 215, 'Channel', { fontSize: 15, align: 'center' })
  b.text(515, 215, 'Pump (ATP)', { fontSize: 15, align: 'center' })
  const ionOut = b.add({ ...makeEllipse(b.z(), 185, 30, 30, 30), fill: '#f0e442', stroke: '#b59b00', name: 'Ion' })
  const ionIn = b.add({ ...makeEllipse(b.z(), 185, 270, 30, 30), fill: '#f0e442', stroke: '#b59b00', name: 'Ion' })
  const sOut = b.add({ ...makeEllipse(b.z(), 500, 30, 30, 30), fill: '#009e73', stroke: '#006b4f', name: 'Substrate' })
  const sIn = b.add({ ...makeEllipse(b.z(), 500, 270, 30, 30), fill: '#009e73', stroke: '#006b4f', name: 'Substrate' })
  b.arrow(ionOut.id, ionIn.id)
  b.arrow(sIn.id, sOut.id)
  b.text(620, 40, 'Extracellular', { fontSize: 16, color: '#595959' })
  b.text(620, 270, 'Cytoplasm', { fontSize: 16, color: '#595959' })
  void channel
  void pump
  return { objects: b.objects, assets: [] }
}

function activationInhibition(): Clip {
  const b = builder()
  const a = b.box(0, 0, 120, 50, 'Gene A', '#cfe3f5', '#2f5f8f')
  const bb = b.box(220, 0, 120, 50, 'Gene B', '#cfe3f5', '#2f5f8f')
  const c = b.box(440, 0, 120, 50, 'Gene C', '#cfe3f5', '#2f5f8f')
  const d = b.box(220, 130, 120, 50, 'Repressor', '#fde0c5', '#d55e00')
  b.arrow(a.id, bb.id)
  b.arrow(bb.id, c.id)
  b.arrow(d.id, bb.id, 'bar', { stroke: '#d55e00' })
  b.text(100, 210, 'Activation →    Inhibition ⊣', { fontSize: 14, color: '#595959' })
  return { objects: b.objects, assets: [] }
}

function graphicalAbstract(): Clip {
  const b = builder()
  const titles = ['Problem', 'Approach', 'Finding']
  const colors = ['#e69f00', '#0072b2', '#009e73']
  const boxes = titles.map((t, i) => {
    const r = b.add({ ...makeRect(b.z(), i * 400, 0, 340, 300), fill: '#ffffff', stroke: colors[i], strokeWidth: 3, radius: 18, name: t })
    b.text(i * 400 + 170, 18, t, { fontSize: 24, align: 'center', color: colors[i], lines: [[{ text: t, bold: true }]] })
    b.text(i * 400 + 170, 250, 'Add icons and a short phrase', { fontSize: 15, align: 'center', color: '#595959' })
    return r
  })
  b.arrow(boxes[0].id, boxes[1].id, 'arrow', { strokeWidth: 5, stroke: '#595959', padding: 10 })
  b.arrow(boxes[1].id, boxes[2].id, 'arrow', { strokeWidth: 5, stroke: '#595959', padding: 10 })
  return { objects: b.objects, assets: [] }
}

function protocol(): Clip {
  const b = builder()
  b.smart(DEFAULT_PROTOCOL, 0, 0)
  return { objects: b.objects, assets: [] }
}

function timeline(): Clip {
  const b = builder()
  b.smart(DEFAULT_TIMELINE, 0, 0)
  return { objects: b.objects, assets: [] }
}

function verticalProtocol(): Clip {
  const b = builder()
  b.smart(
    {
      ...DEFAULT_PROTOCOL,
      direction: 'vertical',
      spacing: 90,
      color: '#009e73',
      items: ['Sample collection: blood, 5 mL', 'RNA extraction: column kit', 'Library prep: poly-A selection', 'Sequencing: 2 × 150 bp', 'Analysis: alignment & DE']
    },
    0,
    0
  )
  return { objects: b.objects, assets: [] }
}

export const BUILTIN_TEMPLATES: Template[] = [
  { id: 'protocol', name: 'Protocol steps', category: 'Smart', description: 'Numbered steps joined by arrows. Edit the steps in the right panel.', build: protocol },
  { id: 'protocol-v', name: 'Workflow (vertical)', category: 'Smart', description: 'A top-to-bottom workflow with a detail line per step.', build: verticalProtocol },
  { id: 'timeline', name: 'Study timeline', category: 'Smart', description: 'Events on a time axis. Edit “Day 3: Event” lines in the right panel.', build: timeline },
  { id: 'signalling', name: 'Cell signalling', category: 'Cell biology', description: 'Cell, nucleus, receptor, kinase cascade, inhibitor and gene expression.', build: signallingCell },
  { id: 'transport', name: 'Membrane transport', category: 'Cell biology', description: 'Bilayer with a channel and a pump moving molecules across.', build: membraneTransport },
  { id: 'regulation', name: 'Activation & inhibition', category: 'Pathways', description: 'Gene regulation motif with activating and inhibiting arrows.', build: activationInhibition },
  { id: 'abstract', name: 'Graphical abstract', category: 'Layouts', description: 'Problem → approach → finding, three linked panels.', build: graphicalAbstract }
]

// ---------------------------------------------------------------------------------------
// User templates

export interface UserTemplate {
  id: string
  name: string
  created: string
  clip: Clip
}
