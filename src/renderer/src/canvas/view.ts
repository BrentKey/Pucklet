import { useEditor } from '../state/editor'

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 16

const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

/** Zoom by `factor`, keeping the screen point (sx, sy) fixed. */
export function zoomAt(factor: number, sx?: number, sy?: number): void {
  const s = useEditor.getState()
  const { zoom, panX, panY } = s.view
  const x = sx ?? s.viewport.w / 2
  const y = sy ?? s.viewport.h / 2
  const z = clamp(zoom * factor)
  const k = z / zoom
  s.set({ view: { zoom: z, panX: x - (x - panX) * k, panY: y - (y - panY) * k } })
}

export function setZoom(z: number): void {
  zoomAt(clamp(z) / useEditor.getState().view.zoom)
}

/** Fit the whole artboard in the viewport with a margin. */
export function fitView(): void {
  const s = useEditor.getState()
  const { width, height } = s.doc.snapshot().meta
  const { w, h } = s.viewport
  const margin = 48
  const zoom = clamp(Math.min((w - margin * 2) / width, (h - margin * 2) / height, 4))
  s.set({ view: { zoom, panX: (w - width * zoom) / 2, panY: (h - height * zoom) / 2 } })
}
