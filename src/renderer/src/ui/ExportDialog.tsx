import { useMemo, useState } from 'react'
import { creditsFor, creditText, figureSvg, MAX_PIXELS, MAX_SIDE, svgToPng } from '../export/export'
import { platform } from '../platform'
import { useEditor, useSnapshot } from '../state/editor'
import { Segmented } from './controls'

type Format = 'png' | 'svg' | 'pdf' | 'pptx'

const DPIS = [72, 150, 300, 600, 1200]

export function ExportDialog() {
  const snap = useSnapshot()
  const fileName = useEditor((s) => s.fileName)
  const close = () => useEditor.getState().set({ exportOpen: false })
  const [format, setFormat] = useState<Format>('png')
  const [dpi, setDpi] = useState(300)
  const [transparent, setTransparent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const pages = useEditor((s) => s.pages)
  const [allPages, setAllPages] = useState(true)
  const multi = pages.length > 1 && (format === 'pdf' || format === 'pptx')
  const { width: W, height: H } = snap.meta
  const credits = useMemo(() => creditText(creditsFor(snap)), [snap])
  const scale = dpi / 96
  const pw = Math.round(W * scale)
  const ph = Math.round(H * scale)
  const tooBig = format === 'png' && (pw > MAX_SIDE || ph > MAX_SIDE || pw * ph > MAX_PIXELS)
  const base = fileName.replace(/\.pucklet$/, '')

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const svg = figureSvg(snap, { transparent: format !== 'pdf' && transparent })
      // PDF and PowerPoint can hold every page; the image formats export the current page.
      const snaps = multi && allPages ? pages.map((p) => p.doc.snapshot()) : [snap]
      let bytes: Uint8Array
      if (format === 'svg') bytes = new TextEncoder().encode(svg)
      else if (format === 'pptx') bytes = await (await import('../export/pptx')).figureToPptx(snaps, { transparent })
      else if (format === 'png') bytes = await svgToPng(svg, W, H, scale, dpi)
      else bytes = await platform.svgToPdf!(snaps.map((s) => ({ svg: figureSvg(s), widthIn: s.meta.width / 96, heightIn: s.meta.height / 96 })))
      if (await platform.exportFile(bytes, `${base}.${format}`)) {
        useEditor.getState().showToast(`Exported ${base}.${format}`)
        close()
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-label="Export figure" onKeyDown={(e) => e.key === 'Escape' && close()}>
        <h2>Export figure</h2>
        <div className="field">
          <label>Format</label>
          <Segmented<Format>
            value={format}
            onChange={setFormat}
            options={[
              { value: 'png', label: 'PNG' },
              { value: 'svg', label: 'SVG (vector)' },
              { value: 'pdf', label: 'PDF (vector)', title: platform.svgToPdf ? undefined : 'Available in the desktop app' },
              { value: 'pptx', label: 'PowerPoint' }
            ]}
          />
          <p className="muted small">
            {format === 'png' && 'Raster image for slides, documents and journal uploads.'}
            {format === 'svg' && 'Fully editable vectors for Illustrator, Inkscape, Affinity or the web.'}
            {format === 'pdf' && 'Vector PDF, accepted by most journals and print shops.'}
            {format === 'pptx' &&
              'One slide the size of your canvas. Text, shapes and straight arrows stay editable; icons and brushes become 300 dpi pictures. Credits go in the speaker notes.'}
          </p>
        </div>

        {format === 'png' && (
          <div className="field">
            <label>Resolution</label>
            <Segmented value={String(dpi)} onChange={(v) => setDpi(Number(v))} options={DPIS.map((d) => ({ value: String(d), label: `${d} dpi` }))} />
            <p className={`small ${tooBig ? 'error' : 'muted'}`}>
              {pw.toLocaleString()} × {ph.toLocaleString()} px · {(W / 96).toFixed(2)} × {(H / 96).toFixed(2)} in
              {tooBig && ' — too large to render; choose a lower resolution.'}
            </p>
          </div>
        )}

        {pages.length > 1 && (
          <div className="field">
            <label>Pages</label>
            {multi ? (
              <Segmented
                value={allPages ? 'all' : 'one'}
                onChange={(v) => setAllPages(v === 'all')}
                options={[
                  { value: 'all', label: `All ${pages.length} pages` },
                  { value: 'one', label: 'This page' }
                ]}
              />
            ) : (
              <p className="muted small">{format.toUpperCase()} exports the current page. Use PDF or PowerPoint for all pages at once.</p>
            )}
          </div>
        )}

        {format !== 'pdf' && (
          <label className="check">
            <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
            Transparent background
          </label>
        )}

        {format === 'pdf' && !platform.svgToPdf && <p className="error small">PDF export is available in the desktop app. Use SVG in the browser.</p>}

        <div className="field">
          <label>Credits</label>
          {credits ? (
            <>
              <p className="credits-text">{credits}</p>
              <button
                className="link"
                onClick={() => {
                  void navigator.clipboard.writeText(credits)
                  setCopied(true)
                }}
              >
                {copied ? 'Copied ✓' : 'Copy credit line for your figure legend'}
              </button>
            </>
          ) : (
            <p className="muted small">No third-party icons used — nothing to credit.</p>
          )}
          <p className="muted small">No watermark, no licence fee: you can publish this figure anywhere.</p>
        </div>

        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button onClick={close}>Cancel</button>
          <button className="primary" disabled={busy || tooBig || (format === 'pdf' && !platform.svgToPdf)} onClick={() => void run()}>
            {busy ? 'Exporting…' : `Export ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  )
}
