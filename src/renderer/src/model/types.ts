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

export interface RectObj extends BaseObj, Box, StrokeStyle {
  type: 'rect'
  fill: Color
  radius: number
}

export interface EllipseObj extends BaseObj, Box, StrokeStyle {
  type: 'ellipse'
  fill: Color
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
}

/** An SVG icon or raster image placed from an asset. */
export interface IconObj extends BaseObj, Box {
  type: 'icon'
  assetId: string
  flipX: boolean
  flipY: boolean
  /** Original color (as listed in the asset's palette) -> replacement color. SVG assets only. */
  recolor: Record<string, Color>
}

export interface Endpoint {
  /** Free position; for bound endpoints, the last resolved position (used if the target disappears). */
  x: number
  y: number
  bind?: Id
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
}

export interface GroupObj extends BaseObj {
  type: 'group'
}

export type BoxObj = RectObj | EllipseObj | TextObj | IconObj
export type FigObject = BoxObj | LineObj | GroupObj
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
  return o.type === 'rect' || o.type === 'ellipse' || o.type === 'text' || o.type === 'icon'
}
