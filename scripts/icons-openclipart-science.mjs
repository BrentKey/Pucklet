#!/usr/bin/env node
// Builds the "OpenClipart science" pack: public-domain science drawings from OpenClipart
// (https://openclipart.org; "All Clipart are Released into the Public Domain", see /faq).
// The old JSON search API is gone, so this walks the HTML tag/search listings for a list of science
// tags, reads each drawing's detail page (title, artist, tags, SFW flag) and downloads the SVG.
// Drawings that are NSFW, embed raster images or fail our SVG checks are skipped. Capped at
// MAX_ICONS drawings. Slow by design (one request at a time per worker, 2 workers).
//
//   node scripts/icons-openclipart-science.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CACHE, mb, packDir, pool, slug, writeFile, writePack } from './lib/packs.mjs'
import { HEADERS, cachedGet, cleanSvg, Skips } from './lib/svgcheck.mjs'

const SITE = 'https://openclipart.org'
const MAX_ICONS = 1500
const PAGES_PER_TAG = 4 // ~32 results per page
const TAGS = [
  'biology', 'cell', 'dna', 'anatomy', 'laboratory', 'chemistry', 'molecule', 'microscope', 'medical', 'virus',
  'bacteria', 'organ', 'brain', 'heart', 'lungs', 'kidney', 'skeleton', 'skull', 'tooth', 'eye anatomy', 'neuron',
  'protein', 'enzyme', 'chromosome', 'test tube', 'flask', 'beaker', 'pipette', 'syringe', 'petri dish', 'science',
  'botany', 'plant anatomy', 'insect', 'zoology', 'mouse', 'rat', 'frog', 'fish anatomy', 'medicine', 'pharmacy',
  'blood', 'immune', 'genetics', 'atom', 'physics', 'biochemistry', 'fungus', 'mushroom', 'flower anatomy'
]

const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * The site's search intermittently answers "Sorry, there was a problem while processing your
 * query" with HTTP 200, so retry those and only cache good pages.
 */
async function getPage(url, rel) {
  const path = join(CACHE, rel)
  if (existsSync(path)) return readFileSync(path, 'utf8')
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60000) })
      const html = await res.text()
      if (res.ok && !/problem while processing your query/i.test(html)) {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, html)
        return html
      }
    } catch {
      /* retry */
    }
    await sleep(2000 * (i + 1))
  }
  throw new Error(`OpenClipart page failed: ${url}`)
}

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase())

async function main() {
  // 1. Candidate ids per tag (first tag to find an id gives its category).
  const candidates = new Map() // id -> { id, path, tag }
  for (const tag of TAGS) {
    for (let p = 1; p <= PAGES_PER_TAG; p++) {
      // Page 1 of a tag listing is /tag/<tag>; later pages only work through /search/.
      const url = p === 1 ? `${SITE}/tag/${encodeURIComponent(tag)}` : `${SITE}/search/?p=${p}&query=${encodeURIComponent(tag)}`
      let html
      try {
        html = await getPage(url, `openclipart/search/${slug(tag)}-${p}.html`)
      } catch {
        console.log(`  (gave up on ${tag} page ${p})`)
        break
      }
      const hits = [...html.matchAll(/href="\/detail\/(\d+)\/([^"]*)"/g)]
      for (const [, id, s] of hits) if (!candidates.has(id)) candidates.set(id, { id, path: `/detail/${id}/${s}`, tag })
      if (!html.includes(`p=${p + 1}&`)) break
    }
  }
  console.log(`${candidates.size} candidate drawings from ${TAGS.length} tags.`)

  // 2. Detail page + SVG for each, until MAX_ICONS pass.
  const out = packDir('openclipart-science')
  const skips = new Skips()
  let total = 0
  let accepted = 0
  let done = 0
  const list = [...candidates.values()]
  const icons = await pool(list, 2, async (c) => {
    if (accepted >= MAX_ICONS) return null
    if (++done % 100 === 0) console.log(`  ${done}/${list.length} (${accepted} kept)`)
    let html
    try {
      html = await getPage(SITE + encodeURI(c.path), `openclipart/detail/${c.id}.html`)
    } catch {
      skips.add('detail failed')
      return null
    }
    if (/Safe for Work\?\s*(<[^>]*>\s*)*No/i.test(html)) {
      skips.add('nsfw')
      return null
    }
    const title = decode(html.match(/<h2>([^<]*)<\/h2>/)?.[1] ?? c.path.split('/').pop().replace(/-/g, ' '))
    const artist = decode(html.match(/by <a href="\/artist\/[^"]*">([^<]*)<\/a>/)?.[1] ?? '')
    const tags = [...new Set([...html.matchAll(/<a href="\/tag\/([^"]*)"/g)].map((m) => decode(decodeURIComponent(m[1]))))]
    let raw
    try {
      raw = (
        await cachedGet(`${SITE}/download/${c.id}`, `openclipart/svg/${c.id}.svg`, { headers: { Referer: SITE + encodeURI(c.path) } })
      ).toString('utf8')
    } catch {
      skips.add('download failed')
      return null
    }
    if (/openclipart-logo/i.test(raw.slice(0, 2000)) && !/<svg/i.test(raw.slice(0, 2000))) {
      skips.add('download blocked')
      return null
    }
    const r = cleanSvg(raw)
    if (r.skip) {
      skips.add(r.skip)
      return null
    }
    if (accepted >= MAX_ICONS) return null
    accepted++
    const file = `svg/${slug(title)}-${c.id}.svg`
    writeFile(join(out, file), r.svg)
    total += r.svg.length
    const extra = tags.filter((t) => t.toLowerCase() !== c.tag && !title.toLowerCase().includes(t.toLowerCase())).slice(0, 5)
    return {
      id: c.id,
      name: extra.length ? `${title} [${extra.join(', ')}]` : title,
      category: titleCase(c.tag),
      file,
      author: artist ? `${artist} / OpenClipart` : 'OpenClipart',
      license: 'public domain',
      url: SITE + c.path
    }
  })
  const kept = icons.filter(Boolean)
  writePack({
    id: 'openclipart-science',
    name: 'OpenClipart science',
    description: 'Public-domain science and medical drawings from OpenClipart.',
    homepage: SITE,
    icons: kept
  })
  console.log(`OpenClipart science pack: ${kept.length} drawings, ${mb(total)}; ${skips}.`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
