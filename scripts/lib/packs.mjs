// Shared helpers for the icon-pack builder scripts.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { optimize } from 'svgo'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const CACHE = join(ROOT, '.cache')
export const PACKS = join(ROOT, 'src/renderer/public/icon-packs')

export const mb = (n) => (n / 1e6).toFixed(1) + ' MB'

/** Lossless SVG clean-up (keeps viewBox); returns the input unchanged if SVGO can't parse it. */
export function optimizeSvg(svg) {
  try {
    return optimize(svg, { multipass: true, plugins: ['preset-default'] }).data
  } catch {
    return svg
  }
}

/** Empties and returns the folder for a pack. */
export function packDir(id) {
  const dir = join(PACKS, id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}

export function writeFile(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
}

/** Writes manifest.json and registers the pack in icon-packs/index.json (keeping other packs). */
export function writePack({ id, name, description, homepage, icons }) {
  icons.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  writeFileSync(join(PACKS, id, 'manifest.json'), JSON.stringify({ id, name, description, homepage, icons }, null, 1))
  const indexFile = join(PACKS, 'index.json')
  let index = { packs: [] }
  try {
    index = JSON.parse(readFileSync(indexFile, 'utf8'))
  } catch {
    /* new index */
  }
  index.packs = index.packs.filter((p) => p.id !== id)
  index.packs.push({ id, name, manifest: `${id}/manifest.json` })
  writeFileSync(indexFile, JSON.stringify(index, null, 1))
}

/** fetch with retries; returns Response or throws after the last attempt. */
export async function fetchRetry(url, init = {}, tries = 4) {
  let last
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) })
      if (res.ok) return res
      last = new Error(`HTTP ${res.status} for ${url}`)
      if (res.status === 404) break
    } catch (e) {
      last = e
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)))
  }
  throw last
}

/** Runs `fn` over items with at most `n` in flight. */
export async function pool(items, n, fn) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i], i)
      }
    })
  )
  return out
}

export const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'icon'
