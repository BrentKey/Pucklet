#!/usr/bin/env node
// Builds the "TogoTV" icon pack: life-science illustrations from the DBCLS Togo Picture Gallery
// (https://togotv.dbcls.jp/en/pics.html), licensed CC BY 4.0 ("© DBCLS TogoTV / CC-BY-4.0").
// Metadata (English names, tags, authors, DOIs, licence) comes from the TogoTV API that powers
// the gallery; SVGs come from the official archive (https://dbarchive.biosciencedbc.jp/data/togo-pic/image/).
// "Fake" SVGs that only wrap a raster <image> are skipped.
//
//   node scripts/icons-togotv.mjs

import { join } from 'node:path'
import { mb, packDir, pool, slug, writeFile, writePack } from './lib/packs.mjs'
import { cachedGet, cleanSvg, getJson, Skips } from './lib/svgcheck.mjs'

const API = 'https://togotv-api.dbcls.jp/api/entries?target=pictures&rows=40&from='
const FILES = 'https://dbarchive.biosciencedbc.jp/data/togo-pic/image/'
const LICENSES = {
  'https://creativecommons.org/licenses/by/4.0/': 'cc-by-4.0',
  'http://creativecommons.org/licenses/by/4.0/': 'cc-by-4.0',
  'https://creativecommons.org/publicdomain/zero/1.0/': 'cc0'
}

// The gallery's first English tag (e.g. "Lab equipment / Icon", "JSHG WebCast") is a broad
// grouping; fold it into a tidy set of categories.
const CATEGORY = {
  Organisms: 'Organisms',
  Plants: 'Plants',
  Bacteria: 'Microbes & viruses',
  Virus: 'Microbes & viruses',
  'Biological resources': 'Organisms',
  'Lab equipment': 'Lab equipment',
  'Lab apparatus': 'Lab equipment',
  Cell: 'Cells',
  'Cell structure': 'Cells',
  Organs: 'Organs & anatomy',
  'Anatomical diagram': 'Organs & anatomy',
  Molecules: 'Molecules',
  Pharmaceuticals: 'Pharmaceuticals',
  'Experimental diagram': 'Diagrams',
  'Schematic diagram': 'Diagrams',
  'Use cases': 'Diagrams',
  'JSHG WebCast': 'Medicine & people', // Japan Society of Human Genetics webcast illustrations
  JSPG: 'Clinical features', // dysmorphology drawings (Japanese Society for Pediatric Genetics)
  KBG: 'Heritage trees', // Koishikawa Botanical Garden heritage-tree series
  Researchers: 'People',
  Computer: 'Computers & documents',
  Documents: 'Computers & documents',
  Signage: 'Signage',
  Icon: 'Other'
}

function category(e) {
  const tag = (e.other_tags_en || '').split(',')[0].trim()
  if (/fossil/i.test(tag)) return 'Fossil organisms'
  const first = tag.split('/')[0].trim() || (e.other_tags_comma_en || '').split(',')[0].trim()
  return CATEGORY[first] ?? (first || 'Other')
}

async function main() {
  const first = await getJson(`${API}1`, 'togotv/api/page-1.json')
  const pages = Array.from({ length: first.last_page }, (_, i) => i + 1)
  console.log(`Fetching ${pages.length} pages of TogoTV metadata …`)
  const entries = (
    await pool(pages, 2, async (p) => (await getJson(`${API}${p}`, `togotv/api/page-${p}.json`)).data ?? [])
  ).flat()

  const seen = new Set()
  const todo = []
  const skips = new Skips()
  // A few records point at another record's SVG (metadata slips); skip those ambiguous files.
  const uses = {}
  for (const e of entries) if (e.svg && e.svg !== '-') uses[e.svg] = (uses[e.svg] ?? 0) + 1
  for (const e of entries) {
    if (!e.svg || e.svg === '-') {
      skips.add('no svg')
      continue
    }
    if (uses[e.svg] > 1) {
      skips.add('ambiguous svg')
      continue
    }
    if (seen.has(e.svg)) continue
    seen.add(e.svg)
    // A few records carry a file name instead of a licence URL; the whole gallery is CC BY 4.0.
    const license = /^https?:/.test(e.license ?? '') ? LICENSES[e.license] : 'cc-by-4.0'
    if (!license) {
      skips.add(`licence ${e.license}`)
      continue
    }
    todo.push({ e, license })
  }

  const out = packDir('togotv')
  let done = 0
  let total = 0
  const icons = await pool(todo, 4, async ({ e, license }) => {
    if (++done % 250 === 0) console.log(`  ${done}/${todo.length}`)
    let raw
    try {
      raw = (await cachedGet(FILES + encodeURIComponent(e.svg), `togotv/svg/${e.svg}`)).toString('utf8')
    } catch {
      skips.add('download failed')
      return null
    }
    const r = cleanSvg(raw)
    if (r.skip) {
      skips.add(r.skip)
      return null
    }
    const base = e.svg.replace(/\.svg$/i, '')
    const file = `svg/${slug(base)}.svg`
    writeFile(join(out, file), r.svg)
    total += r.svg.length
    const nameEn = (e.name_en || '').trim()
    const sci = (e.scientific_name || '').trim()
    let name = nameEn || sci || (e.name || base).trim()
    if (sci && sci !== '-' && !name.toLowerCase().includes(sci.toLowerCase())) name += ` (${sci})`
    const author = (e.author_str || e.author || '').trim()
    return {
      id: String(e.TogoTV_Image_ID ?? e.togopic_id ?? base),
      name,
      category: category(e),
      file,
      author: author ? `${author} / DBCLS TogoTV` : 'DBCLS TogoTV',
      license,
      url: e.id || `https://togotv.dbcls.jp/en/pics.html`,
      tags: (e.other_tags_comma_en || '').trim() || undefined
    }
  })
  const list = icons.filter(Boolean)
  // Keep the manifest to the documented fields; fold extra tags into the searchable name.
  for (const i of list) {
    if (i.tags) {
      const extra = i.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t, k, a) => t && a.indexOf(t) === k && t !== i.category && !/^(icon|organisms|life science)$/i.test(t) && !i.name.includes(t))
        .slice(0, 5)
      if (extra.length) i.name += ` [${extra.join(', ')}]`
    }
    delete i.tags
  }
  writePack({
    id: 'togotv',
    name: 'TogoTV',
    description: 'Life-science illustrations from the DBCLS Togo Picture Gallery (© DBCLS TogoTV, CC BY 4.0).',
    homepage: 'https://togotv.dbcls.jp/en/pics.html',
    icons: list
  })
  console.log(`TogoTV pack: ${list.length} icons, ${mb(total)}; ${skips}.`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
