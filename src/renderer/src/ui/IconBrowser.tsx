import { useEffect, useMemo, useState } from 'react'
import { setPrefs } from '../app/prefs'
import { licenseLabel } from '../export/export'
import type { IconEntry, IconPack, LibraryItem } from '../library/place'
import { LIBRARY_DRAG_TYPE, loadRecentIcons, placeLibraryIcon } from '../library/place'
import { CATEGORIES, classify } from '../library/taxonomy'
import { useEditor } from '../state/editor'
import { Icon } from './icons'

interface PackIndex {
  packs: { id: string; name: string; manifest: string }[]
}

interface LoadedPack extends IconPack {
  base: string
}

/** A library icon with its place in the shared category tree (null = hidden from browsing). */
type Item = LibraryItem & { haystack: string; cat: string | null; sub: string | null }

const PAGE = 120
const isShareAlike = (license: string) => /-sa\b|by-sa/i.test(license)
/** Libraries whose artwork represents a category best, used for the preview thumbnails. */
const PREVIEW_ORDER = ['bioicons', 'scidraw', 'reactome', 'swissbiopics', 'arcadia', 'phylopic', 'biodraws', 'anatomograms', 'healthicons', 'iconify-science']

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
            return { ...m, base: `icon-packs/${p.manifest.replace(/[^/]+$/, '')}` }
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

function Grid({ items }: { items: Item[] }) {
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => setLimit(PAGE), [items])
  return (
    <>
      <div className="icon-grid">
        {items.slice(0, limit).map((i) => (
          <IconTile key={i.pack.id + i.icon.id} item={i} />
        ))}
      </div>
      {items.length > limit && (
        <button className="more" onClick={() => setLimit(limit + PAGE * 2)}>
          Show more ({items.length - limit} left)
        </button>
      )}
    </>
  )
}

/** Up to n icons that best represent a set, preferring detailed scientific libraries. */
function previews(items: Item[], n: number): Item[] {
  const ranked = [...items].sort((a, b) => PREVIEW_ORDER.indexOf(a.pack.id) - PREVIEW_ORDER.indexOf(b.pack.id))
  const out: Item[] = []
  const step = Math.max(1, Math.floor(Math.min(ranked.length, 40) / n))
  for (let i = 0; out.length < n && i < ranked.length; i += step) out.push(ranked[i])
  return out
}

function Thumbs({ items }: { items: Item[] }) {
  return (
    <span className="cat-thumbs">
      {previews(items, 3).map((i) => (
        <img key={i.pack.id + i.icon.id} src={i.href} alt="" loading="lazy" draggable={false} />
      ))}
    </span>
  )
}

export function IconLibrary() {
  const { packs, error, loading } = useIconPacks()
  const [query, setQuery] = useState('')
  const [packFilter, setPackFilter] = useState('all')
  const [path, setPath] = useState<{ cat?: string; sub?: string }>({})
  const shareAlike = useEditor((s) => s.prefs.shareAlike)
  const recent = useEditor((s) => s.recentIcons)

  useEffect(() => {
    void loadRecentIcons()
  }, [])

  const all = useMemo<Item[]>(
    () =>
      packs.flatMap((p) =>
        p.icons.map((icon: IconEntry) => {
          const place = classify(p.id, icon.name, icon.category)
          return {
            pack: { id: p.id, name: p.name },
            icon,
            href: p.base + icon.file,
            haystack: `${icon.name} ${icon.category.replace(/[_-]+/g, ' ')} ${icon.author ?? ''}`.toLowerCase(),
            cat: place?.cat ?? null,
            sub: place?.sub ?? null
          }
        })
      ),
    [packs]
  )
  const allowed = useMemo(() => (shareAlike ? all : all.filter((i) => !isShareAlike(i.icon.license))), [all, shareAlike])
  const inPack = useMemo(() => (packFilter === 'all' ? allowed : allowed.filter((i) => i.pack.id === packFilter)), [allowed, packFilter])
  const browsable = useMemo(() => inPack.filter((i) => i.cat), [inPack])
  const byCat = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const i of browsable) {
      const k = i.cat!
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(i)
    }
    return m
  }, [browsable])

  const terms = query.toLowerCase().split(/[\s,]+/).filter(Boolean)
  const searching = terms.length > 0
  // Searching inside a category keeps to that category; from the top it covers everything.
  const scope = path.cat ? inPack.filter((i) => i.cat === path.cat && (!path.sub || i.sub === path.sub)) : inPack
  const results = useMemo(() => {
    if (!searching) return []
    const hits = scope.filter((i) => terms.every((t) => i.haystack.includes(t)))
    const score = (i: Item) => {
      const name = i.icon.name.toLowerCase()
      return terms.reduce((s, t) => s + (name.startsWith(t) ? 3 : name.split(/[\s(_-]+/).some((x) => x.startsWith(t)) ? 2 : name.includes(t) ? 1 : 0), 0)
    }
    return hits.map((i) => ({ i, s: score(i) })).sort((a, b) => b.s - a.s).map((x) => x.i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, query])

  const cat = CATEGORIES.find((c) => c.id === path.cat)
  const sub = cat?.subs.find((s) => s.id === path.sub)
  const catItems = path.cat ? byCat.get(path.cat) ?? [] : []
  const subItems = sub ? catItems.filter((i) => i.sub === sub.id) : []

  return (
    <div className="library">
      <div className="search">
        <Icon.search />
        <input placeholder={cat ? `Search ${sub?.name ?? cat.name}…` : 'Search all icons…'} value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && (
          <button className="search-clear" title="Clear search" onClick={() => setQuery('')}>
            ×
          </button>
        )}
      </div>
      <div className="lib-filters">
        <select value={packFilter} onChange={(e) => setPackFilter(e.target.value)} title="Icon library">
          <option value="all">All libraries ({allowed.length.toLocaleString()})</option>
          {packs
            .map((p) => ({ p, n: allowed.filter((i) => i.pack.id === p.id).length }))
            .filter(({ n }) => n > 0)
            .map(({ p, n }) => (
              <option key={p.id} value={p.id}>
                {p.name} ({n.toLocaleString()})
              </option>
            ))}
        </select>
      </div>
      {(path.cat || searching) && (
        <div className="crumbs">
          <button className="link" onClick={() => (setPath({}), setQuery(''))}>
            All icons
          </button>
          {cat && (
            <>
              <span>›</span>
              <button className="link" onClick={() => setPath({ cat: cat.id })} disabled={!sub}>
                {cat.name}
              </button>
            </>
          )}
          {sub && (
            <>
              <span>›</span>
              <span className="crumb-current">{sub.name}</span>
            </>
          )}
        </div>
      )}

      {loading && <p className="muted pad">Loading icon libraries…</p>}
      {error && (
        <div className="empty-lib">
          <p>{error}</p>
          <p className="muted">
            Run <code>npm run icons</code> to download the open-licensed icon libraries, then reload.
          </p>
        </div>
      )}

      {searching ? (
        <>
          <p className="muted small pad">
            {results.length.toLocaleString()} result{results.length === 1 ? '' : 's'}
            {cat ? ` in ${sub?.name ?? cat.name}` : ''}
            {cat && (
              <>
                {' · '}
                <button className="link" onClick={() => setPath({})}>
                  search everything
                </button>
              </>
            )}
          </p>
          <Grid items={results} />
          {!results.length && <p className="muted pad">No icons match “{query}”.</p>}
        </>
      ) : sub ? (
        <Grid items={subItems} />
      ) : cat ? (
        <div className="cat-list">
          {cat.subs
            .map((s) => ({ s, items: catItems.filter((i) => i.sub === s.id) }))
            .filter(({ items }) => items.length)
            .map(({ s, items }) => (
              <button key={s.id} className="cat-row" onClick={() => setPath({ cat: cat.id, sub: s.id })}>
                <Thumbs items={items} />
                <span className="cat-name">{s.name}</span>
                <span className="cat-count">{items.length}</span>
                <span className="chev">›</span>
              </button>
            ))}
        </div>
      ) : (
        !loading &&
        !error && (
          <>
            {recent.length > 0 && (
              <>
                <div className="section-label pad">Recently used</div>
                <div className="icon-grid">
                  {recent.slice(0, 6).map((i) => (
                    <IconTile key={i.pack.id + i.icon.id} item={i} />
                  ))}
                </div>
              </>
            )}
            <div className="section-label pad">Browse</div>
            <div className="cat-grid">
              {CATEGORIES.map((c) => ({ c, items: byCat.get(c.id) ?? [] }))
                .filter(({ items }) => items.length)
                .map(({ c, items }) => (
                  <button key={c.id} className="cat-card" onClick={() => setPath({ cat: c.id })}>
                    <Thumbs items={items} />
                    <span className="cat-name">{c.name}</span>
                    <span className="cat-count">{items.length.toLocaleString()} icons</span>
                  </button>
                ))}
            </div>
          </>
        )
      )}

      {all.some((i) => isShareAlike(i.icon.license)) && (
        <label className="check small pad sa-toggle" title="CC BY-SA icons require you to release the figure under the same licence. Most journals accept this, but check before publishing.">
          <input type="checkbox" checked={shareAlike} onChange={(e) => setPrefs({ shareAlike: e.target.checked })} />
          Include share-alike (CC BY-SA) libraries
        </label>
      )}
    </div>
  )
}
