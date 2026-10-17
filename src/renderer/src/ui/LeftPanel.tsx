import { useEffect, useMemo, useState } from 'react'
import { importImages } from '../app/commands'
import { licenseLabel } from '../export/export'
import type { IconEntry, IconPack, LibraryItem } from '../library/place'
import { LIBRARY_DRAG_TYPE, placeAsset, placeLibraryIcon } from '../library/place'
import type { Asset } from '../model/types'
import { useEditor, useSnapshot } from '../state/editor'
import { Icon } from './icons'
import { LayersPanel } from './LayersPanel'
import { TemplatesPanel } from './TemplatesPanel'

interface PackIndex {
  packs: { id: string; name: string; manifest: string }[]
}

interface LoadedPack extends IconPack {
  base: string
}

const PAGE = 120

function useIconPacks(): { packs: LoadedPack[]; error: string | null; loading: boolean } {
  const [state, setState] = useState<{ packs: LoadedPack[]; error: string | null; loading: boolean }>({ packs: [], error: null, loading: true })
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('icon-packs/index.json')
        if (!res.ok) throw new Error('No icon packs installed yet.')
        const index = (await res.json()) as PackIndex
        const packs = await Promise.all(
          index.packs.map(async (p) => {
            const m = (await (await fetch(`icon-packs/${p.manifest}`)).json()) as IconPack
            const base = `icon-packs/${p.manifest.replace(/[^/]+$/, '')}`
            return { ...m, base }
          })
        )
        if (!cancelled) setState({ packs, error: null, loading: false })
      } catch (e) {
        if (!cancelled) setState({ packs: [], error: (e as Error).message, loading: false })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

const prettyCategory = (c: string) => c.replace(/[_-]+/g, ' ')

function IconTile({ item }: { item: LibraryItem }) {
  return (
    <button
      className="icon-tile"
      title={`${item.icon.name}\n${item.pack.name}${item.icon.author ? ' · ' + item.icon.author : ''} · ${licenseLabel(item.icon.license)}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(LIBRARY_DRAG_TYPE, JSON.stringify(item))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => void placeLibraryIcon(item)}
    >
      <img src={item.href} alt="" loading="lazy" draggable={false} />
      <span>{item.icon.name}</span>
    </button>
  )
}

function Library() {
  const { packs, error, loading } = useIconPacks()
  const [query, setQuery] = useState('')
  const [packFilter, setPackFilter] = useState('all')
  const [category, setCategory] = useState('all')
  const [limit, setLimit] = useState(PAGE)

  const all = useMemo(
    () =>
      packs.flatMap((p) =>
        p.icons.map((icon: IconEntry): LibraryItem & { haystack: string } => ({
          pack: { id: p.id, name: p.name },
          icon,
          href: p.base + icon.file,
          haystack: `${icon.name} ${prettyCategory(icon.category)} ${icon.author ?? ''}`.toLowerCase()
        }))
      ),
    [packs]
  )
  const inPack = packFilter === 'all' ? all : all.filter((i) => i.pack.id === packFilter)
  const categories = useMemo(() => [...new Set(inPack.map((i) => i.icon.category))].sort(), [inPack])
  const terms = query.toLowerCase().split(/[\s,]+/).filter(Boolean)
  const results = useMemo(() => {
    const hits = inPack.filter((i) => (category === 'all' || i.icon.category === category) && terms.every((t) => i.haystack.includes(t)))
    if (!terms.length) return hits
    // Best matches first: name starts with the query, then name contains it, then other fields.
    const score = (i: (typeof hits)[number]) => {
      const name = i.icon.name.toLowerCase()
      return terms.reduce((s, t) => s + (name.startsWith(t) ? 3 : name.split(/[\s(_-]+/).some((w) => w.startsWith(t)) ? 2 : name.includes(t) ? 1 : 0), 0)
    }
    return hits.map((i) => ({ i, s: score(i) })).sort((a, b) => b.s - a.s).map((x) => x.i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inPack, category, query])

  useEffect(() => setLimit(PAGE), [query, packFilter, category])

  return (
    <div className="library">
      <div className="search">
        <Icon.search />
        <input placeholder="Search icons…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="lib-filters">
        <select value={packFilter} onChange={(e) => (setPackFilter(e.target.value), setCategory('all'))} title="Icon library">
          <option value="all">All libraries ({all.length})</option>
          {packs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.icons.length})
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} title="Category">
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {prettyCategory(c)}
            </option>
          ))}
        </select>
      </div>
      {loading && <p className="muted pad">Loading icon libraries…</p>}
      {error && (
        <div className="empty-lib">
          <p>{error}</p>
          <p className="muted">
            Run <code>npm run icons</code> to download the open-licensed Bioicons pack, then reload.
          </p>
        </div>
      )}
      <div className="icon-grid">
        {results.slice(0, limit).map((i) => (
          <IconTile key={i.pack.id + i.icon.id} item={i} />
        ))}
      </div>
      {results.length > limit && (
        <button className="more" onClick={() => setLimit(limit + PAGE * 2)}>
          Show more ({results.length - limit} left)
        </button>
      )}
      {!loading && !error && !results.length && <p className="muted pad">No icons match “{query}”.</p>}
    </div>
  )
}

function Uploads() {
  const snap = useSnapshot()
  const uploads = [...snap.assets.values()].filter((a) => !a.source)
  return (
    <div className="uploads">
      <button className="wide" onClick={() => void importImages()}>
        <Icon.upload /> Import SVG or image…
      </button>
      <p className="muted pad">You can also drag files onto the canvas, or paste SVG/images from other apps.</p>
      <div className="icon-grid">
        {uploads.map((a: Asset) => (
          <button key={a.id} className="icon-tile" title={a.name} onClick={() => placeAsset(a)}>
            <img src={a.kind === 'svg' ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(a.data)}` : a.data} alt="" />
            <span>{a.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function LeftPanel() {
  const panel = useEditor((s) => s.leftPanel)
  const set = useEditor((s) => s.set)
  return (
    <aside className="left-panel">
      <div className="tabs">
        {(
          [
            ['library', 'Icons', <Icon.library key="i" />],
            ['templates', 'Templates', <Icon.template key="t" />],
            ['uploads', 'Uploads', <Icon.upload key="u" />],
            ['layers', 'Layers', <Icon.layers key="l" />]
          ] as const
        ).map(([id, label, icon]) => (
          <button key={id} className={panel === id ? 'on' : ''} onClick={() => set({ leftPanel: id })} title={label}>
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>
      {panel === 'library' && <Library />}
      {panel === 'templates' && <TemplatesPanel />}
      {panel === 'uploads' && <Uploads />}
      {panel === 'layers' && <LayersPanel />}
    </aside>
  )
}
