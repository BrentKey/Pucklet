#!/usr/bin/env node
// Builds the "SwissBioPics" pack: whole-cell illustrations (animal, plant, fungal, protist,
// archaeal and bacterial cells) from SwissBioPics (https://www.swissbiopics.org), SIB Swiss
// Institute of Bioinformatics, licensed CC BY 4.0. The cell list is read from the
// SwissBioPics home page and each SVG is downloaded from its public API (/api/image/<name>).
// The originals tag organelles with UniProt subcellular-location ids (SLxxxx); SVGO's id clean-up
// drops those, and the hidden <text> name/description labels are removed too.
// Cells that embed raster bitmaps are skipped.
//
// Credit as: "SwissBioPics, SIB Swiss Institute of Bioinformatics (CC BY 4.0)".
//
//   node scripts/icons-swissbiopics.mjs

import { join } from 'node:path'
import { optimize } from 'svgo'
import { mb, packDir, pool, slug, writeFile, writePack } from './lib/packs.mjs'
import { cachedGet, cleanSvg, MAX_BYTES, Skips } from './lib/svgcheck.mjs'

const SITE = 'https://www.swissbiopics.org'

// Home-page card colours group the cells by kingdom.
const GROUP = {
  '#ffe0e6': 'Animal cells',
  '#e5d6f2': 'Protist cells',
  '#fed8a7': 'Fungal cells',
  '#e0ffe6': 'Plant & algal cells',
  '#e4ffea': 'Plant & algal cells',
  '#e0e2e2': 'Archaeal cells',
  '#c0e6fb': 'Bacterial cells'
}

/** Removes the invisible name/description <text> labels (metadata for the web component). */
function dropHiddenText(svg) {
  return optimize(svg, {
    plugins: [
      {
        name: 'dropHiddenText',
        fn: () => ({
          element: {
            enter(node, parent) {
              if (node.name === 'text' && node.attributes.visibility === 'hidden') {
                parent.children = parent.children.filter((c) => c !== node)
              }
            }
          }
        })
      }
    ]
  }).data
}

async function main() {
  const home = (await cachedGet(`${SITE}/`, 'swissbiopics/home.html')).toString('utf8')
  const cards = [...home.matchAll(/<div class="inj"([^>]*)>/g)].map(([, attrs]) => {
    const a = (k) => attrs.match(new RegExp(`data-${k}="([^"]*)"`))?.[1]
    return { name: a('name').replace(/\.svg$/, ''), title: a('title'), target: a('target'), color: a('color') }
  })
  if (!cards.length) throw new Error('No cell images found on the SwissBioPics home page')

  const out = packDir('swissbiopics')
  const skips = new Skips()
  let total = 0
  const icons = await pool(cards, 2, async (c) => {
    let raw
    try {
      raw = (await cachedGet(`${SITE}/api/image/${c.name}.svg`, `swissbiopics/${c.name}.svg`)).toString('utf8')
    } catch {
      skips.add('download failed')
      return null
    }
    // Whole-cell drawings are big (200 KB-1.8 MB raw), so for this pack the 400 KB cap is applied
    // to the optimized output rather than the download; that keeps the animal, plant and fungal cells.
    let stripped
    try {
      stripped = dropHiddenText(raw)
    } catch {
      skips.add('parse error')
      return null
    }
    const r = cleanSvg(stripped, Infinity)
    if (!r.skip && r.svg.length > MAX_BYTES) r.skip = 'too large after optimization'
    if (r.skip) {
      skips.add(r.skip)
      return null
    }
    const file = `svg/${slug(c.name)}.svg`
    writeFile(join(out, file), r.svg)
    total += r.svg.length
    const title = c.title.replace(/\s+/g, ' ').trim()
    return {
      id: c.name,
      name: title.charAt(0).toUpperCase() + title.slice(1),
      category: GROUP[(c.color ?? '').toLowerCase()] ?? 'Cells',
      file,
      author: 'SwissBioPics, SIB Swiss Institute of Bioinformatics',
      license: 'cc-by-4.0',
      url: `${SITE}/${c.target || `name/${c.name}`}`
    }
  })
  const list = icons.filter(Boolean)
  writePack({
    id: 'swissbiopics',
    name: 'SwissBioPics',
    description: 'Whole-cell illustrations with UniProt-tagged organelles from SwissBioPics, SIB (CC BY 4.0).',
    homepage: SITE,
    icons: list
  })
  console.log(`SwissBioPics pack: ${list.length} of ${cards.length} cells, ${mb(total)}; ${skips}.`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
