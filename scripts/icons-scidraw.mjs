#!/usr/bin/env node
// Builds the "SciDraw" pack: neuroscience/biology drawings (lab animals, cells, apparatus) from
// SciDraw (https://scidraw.io). Each drawing is CC BY 4.0 or CC0 and archived on Zenodo with a
// DOI. Metadata (name, category, authors, licence, DOI) comes from the public SciDraw API
// (/api/v1/drawings/, filtered to SVG uploads); per-drawing author lists come from the detail
// endpoint. Raster-only and "fake" SVGs (wrapping an <image>) are skipped.
//
//   node scripts/icons-scidraw.mjs

import { join } from 'node:path'
import { mb, packDir, pool, slug, writeFile, writePack } from './lib/packs.mjs'
import { cachedGet, cleanSvg, getJson, Skips } from './lib/svgcheck.mjs'

const API = 'https://scidraw.io/api/v1'
const LICENSES = { 'cc-by': 'cc-by-4.0', cc0: 'cc0' }
const CATEGORY = {
  mouse: 'Mice',
  rat: 'Rats',
  fish: 'Fish',
  drosophila: 'Drosophila',
  human: 'Human',
  bird: 'Birds',
  cell: 'Cells',
  other: 'Other'
}

const https = (u) => u.replace(/^http:\/\//, 'https://')

async function main() {
  const drawings = []
  let url = `${API}/drawings/?image_type=svg`
  for (let page = 0; url; page++) {
    const d = await getJson(https(url), `scidraw/api/list-${page}.json`)
    drawings.push(...(d.results ?? []))
    url = d.next
  }
  console.log(`${drawings.length} SVG drawings listed.`)

  const out = packDir('scidraw')
  const skips = new Skips()
  let total = 0
  let done = 0
  const icons = await pool(drawings, 3, async (d) => {
    if (++done % 100 === 0) console.log(`  ${done}/${drawings.length}`)
    const license = LICENSES[d.license]
    if (!license) {
      skips.add(`licence ${d.license}`)
      return null
    }
    if (d.image_type !== 'svg' || !d.is_vector) {
      skips.add('not vector')
      return null
    }
    let raw
    let detail = null
    try {
      raw = (await cachedGet(https(d.image_url), `scidraw/svg/${d.id}.svg`)).toString('utf8')
      detail = await getJson(`${API}/drawings/${d.slug}/`, `scidraw/api/drawing-${d.id}.json`).catch(() => null)
    } catch {
      skips.add('download failed')
      return null
    }
    const r = cleanSvg(raw)
    if (r.skip) {
      skips.add(r.skip)
      return null
    }
    const file = `svg/${slug(d.slug || d.name)}.svg`
    writeFile(join(out, file), r.svg)
    total += r.svg.length
    const authors = (detail?.authors ?? []).map((a) => a.full_name?.trim()).filter(Boolean)
    if (!authors.length && d.primary_author?.full_name) authors.push(d.primary_author.full_name.trim())
    const name = d.name.trim().replace(/\s+/g, ' ')
    return {
      id: d.id,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      category: CATEGORY[d.category_slug] ?? (d.category_name || 'Other'),
      file,
      author: authors.length ? `${authors.join(', ')} / SciDraw` : 'SciDraw contributor',
      license,
      url: d.doi ? `https://doi.org/${d.doi}` : `https://scidraw.io/drawing/${d.slug}`
    }
  })
  const list = icons.filter(Boolean)
  writePack({
    id: 'scidraw',
    name: 'SciDraw',
    description: 'Lab animals, cells and apparatus drawn by researchers, from SciDraw (CC BY 4.0 and CC0).',
    homepage: 'https://scidraw.io',
    icons: list
  })
  console.log(`SciDraw pack: ${list.length} drawings, ${mb(total)}; ${skips}.`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
