import * as Y from 'yjs'
import { generateKeyBetween } from 'fractional-indexing'
import type { Lookup } from './geometry'
import type { Asset, CanvasMeta, FigObject, Id } from './types'

/** Transaction origin for user edits; only these are recorded for undo. */
export const USER = 'user'

export const DEFAULT_META: CanvasMeta = { width: 1200, height: 800, background: '#ffffff' }

/**
 * Immutable view of the document at one moment, cheap to rebuild because Yjs hands back the
 * same object references for entries that did not change (so React.memo can skip them).
 */
export class Snapshot implements Lookup {
  readonly objects: ReadonlyMap<Id, FigObject>
  readonly assets: ReadonlyMap<string, Asset>
  readonly meta: CanvasMeta
  private readonly childIds: Map<Id | '', Id[]>

  constructor(objects: Map<Id, FigObject>, assets: Map<string, Asset>, meta: CanvasMeta) {
    this.objects = objects
    this.assets = assets
    this.meta = meta
    this.childIds = new Map()
    for (const o of objects.values()) {
      const p = o.parentId && objects.has(o.parentId) ? o.parentId : ''
      let list = this.childIds.get(p)
      if (!list) this.childIds.set(p, (list = []))
      list.push(o.id)
    }
    for (const list of this.childIds.values()) {
      list.sort((a, b) => {
        const za = objects.get(a)!.z
        const zb = objects.get(b)!.z
        return za < zb ? -1 : za > zb ? 1 : a < b ? -1 : 1
      })
    }
  }

  get(id: Id): FigObject | undefined {
    return this.objects.get(id)
  }

  /** Children of a group, or top-level objects for '' — in paint order. */
  children(id: Id | ''): FigObject[] {
    return (this.childIds.get(id) ?? []).map((c) => this.objects.get(c)!)
  }

  childIdsOf(id: Id | ''): readonly Id[] {
    return this.childIds.get(id) ?? []
  }

  parentOf(id: Id): Id | '' {
    const p = this.objects.get(id)?.parentId
    return p && this.objects.has(p) ? p : ''
  }

  /** All descendants of the given ids (not including them), depth first. */
  descendants(ids: Iterable<Id>): Id[] {
    const out: Id[] = []
    const walk = (id: Id) => {
      for (const c of this.childIds.get(id) ?? []) {
        out.push(c)
        walk(c)
      }
    }
    for (const id of ids) walk(id)
    return out
  }

  /** Chain from the top level down to `id`, inclusive. */
  ancestry(id: Id): Id[] {
    const chain: Id[] = []
    let cur: Id | '' = id
    while (cur) {
      chain.unshift(cur)
      cur = this.parentOf(cur)
    }
    return chain
  }

  /** A new z key that places an object above every current sibling under `parent`. */
  topZ(parent: Id | ''): string {
    const list = this.childIds.get(parent)
    const last = list?.length ? this.objects.get(list[list.length - 1])!.z : null
    return generateKeyBetween(last, null)
  }

  /** Same snapshot with some objects replaced by transient versions (e.g. mid-drag). */
  withOverrides(over: ReadonlyMap<Id, FigObject>): Snapshot {
    if (!over.size) return this
    const objects = new Map(this.objects)
    for (const [id, o] of over) objects.set(id, o)
    return new Snapshot(objects, this.assets as Map<string, Asset>, this.meta)
  }
}

export interface DocData {
  meta: CanvasMeta
  objects: FigObject[]
  assets: Asset[]
}

export interface Tx {
  add(o: FigObject): void
  put(o: FigObject): void
  update<T extends FigObject>(id: Id, patch: Partial<T>): void
  remove(id: Id): void
  putAsset(a: Asset): void
  setMeta(patch: Partial<CanvasMeta>): void
  readonly snap: Snapshot
}

export class FigureDoc {
  readonly ydoc = new Y.Doc()
  readonly objects: Y.Map<FigObject> = this.ydoc.getMap('objects')
  readonly assets: Y.Map<Asset> = this.ydoc.getMap('assets')
  readonly meta: Y.Map<unknown> = this.ydoc.getMap('meta')
  readonly undoManager: Y.UndoManager
  /** Increments on every change; compare against a saved value to know if there are unsaved edits. */
  version = 0

  private cached: Snapshot | null = null
  private listeners = new Set<() => void>()

  constructor(data?: DocData) {
    this.ydoc.transact(() => {
      const meta = { ...DEFAULT_META, ...data?.meta }
      for (const [k, v] of Object.entries(meta)) this.meta.set(k, v)
      for (const a of data?.assets ?? []) this.assets.set(a.id, a)
      for (const o of data?.objects ?? []) this.objects.set(o.id, o)
    }, 'load')
    this.undoManager = new Y.UndoManager([this.objects, this.assets, this.meta], {
      trackedOrigins: new Set([USER]),
      captureTimeout: 0
    })
    this.ydoc.on('update', () => {
      this.cached = null
      this.version++
      for (const l of this.listeners) l()
    })
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  snapshot = (): Snapshot => {
    if (!this.cached) {
      const objects = new Map<Id, FigObject>()
      this.objects.forEach((v, k) => objects.set(k, v))
      const assets = new Map<string, Asset>()
      this.assets.forEach((v, k) => assets.set(k, v))
      const meta = { ...DEFAULT_META } as CanvasMeta
      this.meta.forEach((v, k) => ((meta as unknown as Record<string, unknown>)[k] = v))
      this.cached = new Snapshot(objects, assets, meta)
    }
    return this.cached
  }

  /** Apply a batch of edits as one undo step. */
  transact(fn: (tx: Tx) => void): void {
    const self = this
    this.ydoc.transact(() => {
      const tx: Tx = {
        add: (o) => this.objects.set(o.id, o),
        put: (o) => this.objects.set(o.id, o),
        update: (id, patch) => {
          const cur = this.objects.get(id)
          if (cur) this.objects.set(id, { ...cur, ...patch } as FigObject)
        },
        remove: (id) => this.objects.delete(id),
        putAsset: (a) => {
          if (!this.assets.has(a.id)) this.assets.set(a.id, a)
        },
        setMeta: (patch) => {
          for (const [k, v] of Object.entries(patch)) this.meta.set(k, v)
        },
        // Reads inside the transaction see the edits made so far.
        get snap() {
          self.cached = null
          return self.snapshot()
        }
      }
      fn(tx)
    }, USER)
  }

  undo(): void {
    this.undoManager.undo()
  }
  redo(): void {
    this.undoManager.redo()
  }

  toData(): DocData {
    const s = this.snapshot()
    return { meta: s.meta, objects: [...s.objects.values()], assets: [...s.assets.values()] }
  }
}

export const newId = (): Id => crypto.randomUUID().replace(/-/g, '').slice(0, 16)
