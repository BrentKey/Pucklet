// The figure document model. Everything here is plain JSON so it can be stored in a Yjs
// map (for undo now, real-time collaboration later) and written straight into the file.
//
// Conventions:
// - Coordinates are CSS pixels (96 per inch) in artboard space; (0,0) is the artboard's top-left.
// - `z` is a fractional index string; siblings render in ascending `z` order.
// - Hierarchy is flat: a child points at its group via `parentId`.

export type Id = string
/** '#rrggbb' or 'none' */
export type Color = string
export type Dash = 'solid' | 'dashed' | 'dotted'
export type Cap = 'none' | 'arrow' | 'open' | 'bar' | 'dot' | 'diamond'
export type Route = 'straight' | 'curved' | 'elbow'

export interface BaseObj {
  id: Id
  z: string
  parentId?: Id
  name?: string
  locked?: boolean
  /** Hidden objects are not drawn on the canvas or exported. */
  hidden?: boolean
  /** Special meaning for features like multi-panel layouts. */
  role?: 'panel-label' | 'panel-frame'
  opacity: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
  /** Degrees, clockwise, about the box center. */
  rotation: number
}

export interface StrokeStyle {
  stroke: Color
  strokeWidth: number
  dash: Dash
}

export interface Gradient {
  kind: 'linear' | 'radial'
  from: Color
  to: Color
  /** Linear only: direction in degrees (0 = left to right, 90 = top to bottom). */
  angle: number
}

export interface RectObj extends BaseObj, Box, StrokeStyle {
  type: 'rect'
  fill: Color
  /** When set, replaces the solid fill. */
  gradient?: Gradient
  radius: number
}

export interface EllipseObj extends BaseObj, Box, StrokeStyle {
  type: 'ellipse'
  fill: Color
  gradient?: Gradient
}

export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  script?: 'sub' | 'super'
  color?: Color
}
export type TextLine = TextRun[]

/** w/h are derived from the content (see text/layout.ts) and kept in sync on every edit. */
export interface TextObj extends BaseObj, Box {
  type: 'text'
  lines: TextLine[]
  fontFamily: string
  fontSize: number
  lineHeight: number
  color: Color
  align: 'left' | 'center' | 'right'
  /** Fixed box width that text wraps within; unset = the box grows to fit each line. */
  wrap?: number
}

/** An SVG icon or raster image placed from an asset. */
export interface IconObj extends BaseObj, Box {
  type: 'icon'
  assetId: string
  flipX: boolean
  flipY: boolean
  /** Original color (as listed in the asset's palette) -> replacement color. SVG assets only. */
  recolor: Record<string, Color>
  /** Visible part of the source, in 0–1 coordinates of the whole image. Unset = everything. */
  crop?: { x: number; y: number; w: number; h: number }
  /** Outline the image is clipped to. */
  cropShape?: 'rect' | 'rounded' | 'ellipse'
}

export interface Endpoint {
  /** Free position; for bound endpoints, the last resolved position (used if the target disappears). */
  x: number
  y: number
  bind?: Id
  /**
   * Where on the bound object's outline this end is pinned, in the object's own 0–1 box
   * coordinates. Without an anchor, a bound end aims at the object's centre and slides around
   * its outline to face the other end (used for small objects such as icons and step markers).
   */
  anchor?: { x: number; y: number }
}

export interface LineObj extends BaseObj, StrokeStyle {
  type: 'line'
  start: Endpoint
  end: Endpoint
  route: Route
  /** Curved route: signed offset of the control point from the chord midpoint, in px. */
  bend: number
  startCap: Cap
  endCap: Cap
  /** Gap kept between a bound endpoint and its target's outline. */
  padding: number
  /** Optional text shown at the middle of the connector (e.g. "phosphorylation"). */
  label?: string
  labelSize?: number
}

export type BrushKind = 'bilayer' | 'monolayer' | 'dna' | 'beads' | 'icon'

/** A pattern (membrane, DNA, filament, repeated icon) drawn along a path. See model/brush.ts. */
export interface BrushObj extends BaseObj {
  type: 'brush'
  kind: BrushKind
  points: { x: number; y: number }[]
  closed: boolean
  smooth: boolean
  /** Distance between repeated units along the path. */
  spacing: number
  /** Width of the pattern across the path. */
  thickness: number
  colors: Color[]
  /** Mirror the pattern across the path (e.g. which side a monolayer's heads face). */
  flip: boolean
  /** kind 'icon': the asset repeated along the path. */
  assetId?: string
}

/** Settings a "smart" group is generated from (see model/smart.ts). */
export interface SmartSpec {
  kind: 'protocol' | 'timeline'
  /** One entry per step/event; "Day 3: Inject" splits into a time and a label. */
  items: string[]
  direction: 'horizontal' | 'vertical'
  numbering: '1' | 'i' | 'a' | 'A' | 'none'
  color: Color
  spacing: number
}

export interface GroupObj extends BaseObj {
  type: 'group'
  smart?: SmartSpec
}

export type Cell = string | number | null

export interface DataTable {
  columns: string[]
  rows: Cell[][]
}

export interface TableStyle {
  fontFamily: string
  fontSize: number
  color: Color
  headerFill: Color
  headerColor: Color
  /** Fill for every other body row, or 'none'. */
  stripe: Color
  borderColor: Color
  borderWidth: number
  /** Number of decimals for numbers; null shows them as entered. */
  decimals: number | null
}

/** A data table. Its w/h follow from the content (see render/Table.tsx); resizing scales the font. */
export interface TableObj extends BaseObj, Box {
  type: 'table'
  data: DataTable
  style: TableStyle
}

export type ChartKind = 'bar' | 'dot' | 'box' | 'violin' | 'grouped' | 'stacked' | 'scatter' | 'line'

/**
 * A chart drawn from its own data table.
 * - bar / dot / box / violin: each column is a group, rows are replicates.
 * - grouped / stacked: first column holds category labels, other columns are series.
 * - scatter / line: first column is X, other columns are Y series.
 */
export interface ChartObj extends BaseObj, Box {
  type: 'chart'
  kind: ChartKind
  data: DataTable
  error: 'sd' | 'sem' | 'ci95' | 'none'
  showPoints: boolean
  colors: Color[]
  title: string
  xLabel: string
  yLabel: string
  fontFamily: string
  fontSize: number
  yMin: number | null
  yMax: number | null
  logY: boolean
  legend: boolean
  /** scatter / line: draw a least-squares line per series. */
  fit: boolean
  /** bar / dot / box / violin: significance tests drawn as brackets above the groups. */
  stats?: ChartStats
}

export type StatTest = 'none' | 'auto' | 'welch' | 'paired' | 'mannwhitney' | 'anova' | 'kruskal'

export interface ChartStats {
  test: StatTest
  /** all pairs, each group against the first, or the pairs listed in `pairs`. */
  compare: 'all' | 'first' | 'custom'
  /** Column indexes, used when compare is 'custom'. */
  pairs: [number, number][]
  display: 'stars' | 'p' | 'both'
  hideNs: boolean
}

export type BoxObj = RectObj | EllipseObj | TextObj | IconObj | TableObj | ChartObj
export type FigObject = BoxObj | LineObj | BrushObj | GroupObj
export type ObjType = FigObject['type']

export interface AssetSource {
  library: string
  author?: string
  license: string
  url?: string
}

export interface Asset {
  id: string
  kind: 'svg' | 'raster'
  name: string
  /** svg: sanitized, normalized markup of the root <svg>. raster: a data: URL. */
  data: string
  width: number
  height: number
  /** svg only: distinct colors used, normalized to '#rrggbb'. */
  palette?: string[]
  source?: AssetSource
}

export interface CanvasMeta {
  width: number
  height: number
  background: Color
}

export function isBoxObj(o: FigObject): o is BoxObj {
  return o.type === 'rect' || o.type === 'ellipse' || o.type === 'text' || o.type === 'icon' || o.type === 'table' || o.type === 'chart'
}
