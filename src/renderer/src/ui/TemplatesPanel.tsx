import { createElement, useEffect, useMemo, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { resanitizeAsset } from '../assets/svg'
import type { Template, UserTemplate } from '../library/templates'
import { BUILTIN_TEMPLATES } from '../library/templates'
import { viewportCenter } from '../library/place'
import { FigureDoc } from '../model/doc'
import { validObject } from '../model/file'
import type { Clip } from '../model/ops'
import { boundsOf, copyObjects, pasteClip } from '../model/ops'
import { platform } from '../platform'
import { SceneContent } from '../render/Figure'
import { useEditor } from '../state/editor'

const STORE = 'templates'

function clipDoc(clip: Clip) {
  const snap = new FigureDoc({ meta: { width: 100, height: 100, background: 'none' }, objects: clip.objects, assets: clip.assets }).snapshot()
  const b = boundsOf(
    snap,
    snap.children('').map((o) => o.id)
  ) ?? { x: 0, y: 0, w: 1, h: 1 }
  return { snap, b }
}

/** SVG preview of a clip as a data URL. */
function thumbnail(clip: Clip): string {
  const { snap, b } = clipDoc(clip)
  const pad = 10
  const body = renderToStaticMarkup(createElement(SceneContent, { snap, mode: 'export' }))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}">${body}</svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

/** Drops a template's objects onto the canvas, centred in the view, and selects them. */
function insertClip(clip: Clip): void {
  const s = useEditor.getState()
  const { b } = clipDoc(clip)
  const c = viewportCenter()
  const ids = pasteClip(s.doc, clip, s.context, c.x - (b.x + b.w / 2), c.y - (b.y + b.h / 2))
  s.set({ selection: ids, tool: 'select' })
}

async function loadUserTemplates(): Promise<UserTemplate[]> {
  try {
    const raw = await platform.readUserData(STORE)
    const list = raw ? (JSON.parse(raw) as UserTemplate[]) : []
    // Stored data is treated like any file: validated and re-sanitized.
    return list.map((t) => ({
      ...t,
      clip: {
        objects: (t.clip?.objects ?? []).filter(validObject),
        assets: (t.clip?.assets ?? []).flatMap((a) => {
          try {
            return [resanitizeAsset(a)]
          } catch {
            return []
          }
        })
      }
    }))
  } catch {
    return []
  }
}

function Card({ name, description, thumb, onInsert, onDelete }: { name: string; description?: string; thumb: string; onInsert: () => void; onDelete?: () => void }) {
  return (
    <div className="template-card" title={description}>
      <button className="template-thumb" onClick={onInsert}>
        <img src={thumb} alt="" />
      </button>
      <div className="template-meta">
        <span className="template-name">{name}</span>
        {description && <span className="template-desc">{description}</span>}
      </div>
      {onDelete && (
        <button className="template-delete" title="Delete template" onClick={onDelete}>
          ×
        </button>
      )}
    </div>
  )
}

export function TemplatesPanel() {
  const selection = useEditor((s) => s.selection)
  const [mine, setMine] = useState<UserTemplate[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadUserTemplates().then(setMine)
  }, [])

  const builtins = useMemo(
    () => BUILTIN_TEMPLATES.map((t: Template) => ({ t, clip: t.build() })).map((x) => ({ ...x, thumb: thumbnail(x.clip) })),
    []
  )
  const mineThumbs = useMemo(() => mine.map((t) => ({ t, thumb: thumbnail(t.clip) })), [mine])
  const categories = [...new Set(BUILTIN_TEMPLATES.map((t) => t.category))]

  const persist = async (list: UserTemplate[]) => {
    try {
      await platform.writeUserData(STORE, JSON.stringify(list))
      setMine(list)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const save = () => {
    const s = useEditor.getState()
    if (!s.selection.length || !name.trim()) return
    const clip = copyObjects(s.doc.snapshot(), s.selection)
    const t: UserTemplate = { id: crypto.randomUUID(), name: name.trim(), created: new Date().toISOString(), clip }
    void persist([t, ...mine])
    setName('')
    s.showToast(`Saved template “${t.name}”`)
  }

  return (
    <div className="templates">
      <div className="template-save">
        <div className="section-label">My templates</div>
        {selection.length ? (
          <div className="row">
            <input placeholder="Name for the selection…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
            <button disabled={!name.trim()} onClick={save}>
              Save
            </button>
          </div>
        ) : (
          <p className="muted small">Select objects on the canvas to save them as a reusable template.</p>
        )}
        {error && <p className="error small">{error}</p>}
        <div className="template-list">
          {mineThumbs.map(({ t, thumb }) => (
            <Card
              key={t.id}
              name={t.name}
              thumb={thumb}
              onInsert={() => insertClip(t.clip)}
              onDelete={() => {
                if (window.confirm(`Delete the template “${t.name}”?`)) void persist(mine.filter((x) => x.id !== t.id))
              }}
            />
          ))}
        </div>
      </div>
      {categories.map((cat) => (
        <div key={cat}>
          <div className="section-label">{cat}</div>
          <div className="template-list">
            {builtins
              .filter((x) => x.t.category === cat)
              .map(({ t, clip, thumb }) => (
                <Card key={t.id} name={t.name} description={t.description} thumb={thumb} onInsert={() => insertClip(clip)} />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
