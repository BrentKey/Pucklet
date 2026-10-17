import type { Pt } from './geometry'
import { center, rotate } from './geometry'
import type { Handle } from './transform'
import type { IconObj } from './types'

// Cropping keeps the image's scale fixed: moving a crop edge reveals or hides part of the
// image instead of stretching it. The math works in "visual" crop coordinates (as the image
// appears on screen, i.e. after flips) and in the object's own unrotated frame.

type Crop = { x: number; y: number; w: number; h: number }
const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 }
const MIN = 0.02

function toVisual(o: IconObj): Crop {
  const c = o.crop ?? FULL
  return { x: o.flipX ? 1 - c.x - c.w : c.x, y: o.flipY ? 1 - c.y - c.h : c.y, w: c.w, h: c.h }
}

function fromVisual(o: IconObj, v: Crop): Crop {
  return { x: o.flipX ? 1 - v.x - v.w : v.x, y: o.flipY ? 1 - v.y - v.h : v.y, w: v.w, h: v.h }
}

const r4 = (n: number) => Math.round(n * 10000) / 10000

/** Rebuilds the box so that visual crop `v` shows at the same scale as now. */
function withVisualCrop(o: IconObj, v: Crop): IconObj {
  const cur = toVisual(o)
  const kx = o.w / cur.w
  const ky = o.h / cur.h
  // New box in the old box's unrotated frame, then back to world space.
  const left = o.x + (v.x - cur.x) * kx
  const top = o.y + (v.y - cur.y) * ky
  const w = v.w * kx
  const h = v.h * ky
  const c = rotate({ x: left + w / 2, y: top + h / 2 }, o.rotation, center(o))
  const crop = fromVisual(o, { x: r4(v.x), y: r4(v.y), w: r4(v.w), h: r4(v.h) })
  const full = crop.x <= 0 && crop.y <= 0 && crop.w >= 1 && crop.h >= 1
  const { crop: _drop, ...rest } = o
  void _drop
  return { ...rest, ...(full ? {} : { crop }), x: c.x - w / 2, y: c.y - h / 2, w, h }
}

/** Drag a crop handle to p (world coordinates). */
export function cropResize(o: IconObj, handle: Handle, p: Pt): IconObj {
  const v = toVisual(o)
  const q = rotate(p, -o.rotation, center(o))
  const kx = o.w / v.w
  const ky = o.h / v.h
  let { x, y, w, h } = v
  const right = v.x + v.w
  const bottom = v.y + v.h
  if (handle.includes('w')) {
    x = Math.min(Math.max(0, v.x + (q.x - o.x) / kx), right - MIN)
    w = right - x
  }
  if (handle.includes('e')) w = Math.min(Math.max(MIN, v.w + (q.x - (o.x + o.w)) / kx), 1 - x)
  if (handle.includes('n')) {
    y = Math.min(Math.max(0, v.y + (q.y - o.y) / ky), bottom - MIN)
    h = bottom - y
  }
  if (handle.includes('s')) h = Math.min(Math.max(MIN, v.h + (q.y - (o.y + o.h)) / ky), 1 - y)
  return withVisualCrop(o, { x, y, w, h })
}

/** Slide the image inside its crop window by (dx, dy) in world coordinates. */
export function cropPan(o: IconObj, dx: number, dy: number): IconObj {
  const v = toVisual(o)
  const d = rotate({ x: dx, y: dy }, -o.rotation)
  const kx = o.w / v.w
  const ky = o.h / v.h
  const x = Math.min(Math.max(0, v.x - d.x / kx), 1 - v.w)
  const y = Math.min(Math.max(0, v.y - d.y / ky), 1 - v.h)
  const crop = fromVisual(o, { x: r4(x), y: r4(y), w: v.w, h: v.h })
  return { ...o, crop }
}

/** Where the whole, uncropped image lies (in the object's unrotated frame), for the crop preview. */
export function fullImageBox(o: IconObj): { x: number; y: number; w: number; h: number } {
  const v = toVisual(o)
  const kx = o.w / v.w
  const ky = o.h / v.h
  return { x: o.x - v.x * kx, y: o.y - v.y * ky, w: kx, h: ky }
}

export function resetCrop(o: IconObj): IconObj {
  return withVisualCrop(o, FULL)
}
