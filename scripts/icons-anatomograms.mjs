#!/usr/bin/env node
// Builds the "Anatomograms" pack: whole-body, brain and plant organ maps from the EMBL-EBI
// Expression Atlas anatomogram package (https://github.com/ebi-gene-expression-group/anatomogram,
// npm @ebi-gene-expression-group/anatomogram). The images are licensed CC BY 4.0 (the code is
// Apache-2.0). (The originals tag tissues with UBERON / Plant Ontology ids; SVGO's id clean-up
// drops those, as they are not referenced inside the files.)
//
// Change made: in the original files every tissue is invisible (fill:none;stroke:none) until the
// Atlas widget colours it. We give those shapes the widget's default "shown" style (grey, 40 %
// opacity) so the organs are visible and recolourable. Credit as "EMBL-EBI Expression Atlas
// (CC BY 4.0), modified".
//
//   node scripts/icons-anatomograms.mjs

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { optimize } from 'svgo'
import { CACHE, fetchRetry, mb, packDir, slug, writeFile, writePack } from './lib/packs.mjs'
import { HEADERS, MAX_BYTES, cleanSvg, Skips } from './lib/svgcheck.mjs'

const VERSION = '2.4.0'
const TARBALL = `https://registry.npmjs.org/@ebi-gene-expression-group/anatomogram/-/anatomogram-${VERSION}.tgz`
const REPO = 'https://github.com/ebi-gene-expression-group/anatomogram'
const SHOWN = 'fill:#808080;fill-opacity:0.4;stroke:none'

const SPECIES = {
  anolis_carolinensis: ['Green anole', 'Animals'],
  arabidopsis_thaliana: ['Thale cress', 'Plants'],
  bos_taurus: ['Cattle', 'Animals'],
  brachypodium_distachyon: ['Purple false brome', 'Plants'],
  gallus_gallus: ['Chicken', 'Animals'],
  homo_sapiens: ['Human', 'Human'],
  hordeum_vulgare: ['Barley', 'Plants'],
  macaca_mulatta: ['Rhesus macaque', 'Animals'],
  monodelphis_domestica: ['Gray short-tailed opossum', 'Animals'],
  mus_musculus: ['Mouse', 'Animals'],
  oryza_sativa: ['Rice', 'Plants'],
  papio_anubis: ['Olive baboon', 'Animals'],
  rattus_norvegicus: ['Rat', 'Animals'],
  solanum_lycopersicum: ['Tomato', 'Plants'],
  solanum_tuberosum: ['Potato', 'Plants'],
  sorghum_bicolor: ['Sorghum', 'Plants'],
  tetraodon_nigroviridis: ['Green spotted pufferfish', 'Animals'],
  triticum_aestivum: ['Wheat', 'Plants'],
  xenopus_tropicalis: ['Western clawed frog', 'Animals'],
  zea_mays: ['Maize', 'Plants']
}
const VIEW = { male: 'male', female: 'female', brain: 'brain', whole_plant: 'whole plant', flower_parts: 'flower parts' }

/** Makes the invisible tissue shapes visible in the Atlas' default grey. */
function showTissues(svg) {
  return optimize(svg, {
    plugins: [
      {
        name: 'showTissues',
        fn: () => ({
          element: {
            enter(node) {
              const style = node.attributes.style
              if (style && /fill:\s*none/.test(style) && /stroke:\s*none/.test(style)) {
                node.attributes.style = style.replace(/(^|;)\s*(fill|stroke|fill-opacity)\s*:[^;]*/g, '').replace(/^;+/, '') + ';' + SHOWN
                node.attributes.style = node.attributes.style.replace(/^;/, '')
              }
            }
          }
        })
      }
    ]
  }).data
}

async function main() {
  mkdirSync(CACHE, { recursive: true })
  const tgz = join(CACHE, `anatomogram-${VERSION}.tgz`)
  if (!existsSync(tgz)) {
    console.log(`Downloading ${TARBALL} …`)
    writeFileSync(tgz, Buffer.from(await (await fetchRetry(TARBALL, { headers: HEADERS })).arrayBuffer()))
  }
  const src = join(CACHE, 'anatomogram-src')
  rmSync(src, { recursive: true, force: true })
  mkdirSync(src, { recursive: true })
  execFileSync('tar', ['-xzf', tgz, '-C', src])
  const lib = join(src, 'package/lib')
  const meta = JSON.parse(readFileSync(join(lib, 'json/svgsMetadata.json'), 'utf8'))

  const out = packDir('anatomograms')
  const icons = []
  const skips = new Skips()
  let total = 0
  for (const m of meta) {
    const raw = readFileSync(join(lib, 'svg', m.filename), 'utf8')
    // Inkscape files carry a lot of editor metadata, so the 400 KB cap applies to the optimized output.
    const r = cleanSvg(showTissues(raw), Infinity)
    if (!r.skip && r.svg.length > MAX_BYTES) r.skip = 'too large after optimization'
    if (r.skip) {
      skips.add(r.skip)
      continue
    }
    const file = `svg/${slug(m.filename.replace(/\.svg$/, ''))}.svg`
    writeFile(join(out, file), r.svg)
    total += r.svg.length
    const [common, category] = SPECIES[m.species] ?? [m.species.replace(/_/g, ' '), 'Other']
    const sci = m.species.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
    const view = VIEW[m.view] ?? m.view.replace(/_/g, ' ')
    icons.push({
      id: m.filename.replace(/\.svg$/, ''),
      name: `${common}${view ? ` (${view})` : ''} anatomogram - ${sci}`,
      category,
      file,
      author: 'EMBL-EBI Expression Atlas (modified)',
      license: 'cc-by-4.0',
      url: `${REPO}/blob/master/src/svg/${m.filename}`
    })
  }
  writePack({
    id: 'anatomograms',
    name: 'Anatomograms',
    description:
      'Organ and tissue maps of humans, animals and plants from the EMBL-EBI Expression Atlas (CC BY 4.0; tissues made visible).',
    homepage: 'https://www.ebi.ac.uk/gxa',
    icons
  })
  console.log(`Anatomograms pack: ${icons.length} of ${meta.length} maps, ${mb(total)}; ${skips}.`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
