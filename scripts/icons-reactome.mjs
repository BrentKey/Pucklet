#!/usr/bin/env node
// Builds the "Reactome" icon pack: ~2,600 flat-style icons of proteins, receptors, compounds,
// cell elements and cell types from the Reactome icon library (https://reactome.org/icon-lib),
// licensed CC BY 4.0. Names, categories and designer credits come from the Reactome
// Content Service.
//
//   npm run icons:reactome

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE, fetchRetry, mb, optimizeSvg, packDir, writeFile, writePack } from './lib/packs.mjs'

const ARCHIVE = 'https://reactome.org/icon/icon-lib-svg.tgz'
const META = 'https://reactome.org/ContentService/search/query?query=*&types=Icon&rows=5000&cluster=false'

const CATEGORY = {
  arrow: 'Arrows',
  background: 'Backgrounds',
  cell_element: 'Cell elements',
  cell_type: 'Cell types',
  compound: 'Compounds',
  human_tissue: 'Human tissues',
  protein: 'Proteins',
  receptor: 'Receptors',
  therapeutic: 'Therapeutics',
  transporter: 'Transporters'
}

async function main() {
  mkdirSync(CACHE, { recursive: true })
  const tgz = join(CACHE, 'reactome-icons.tgz')
  if (!existsSync(tgz)) {
    console.log(`Downloading ${ARCHIVE} …`)
    writeFileSync(tgz, Buffer.from(await (await fetchRetry(ARCHIVE)).arrayBuffer()))
  }
  const src = join(CACHE, 'reactome-src')
  rmSync(src, { recursive: true, force: true })
  mkdirSync(src, { recursive: true })
  execFileSync('tar', ['-xzf', tgz, '-C', src])

  console.log('Fetching icon names and categories …')
  const meta = await (await fetchRetry(META)).json()
  const byId = new Map()
  for (const group of meta.results ?? []) for (const e of group.entries ?? []) byId.set(e.id, e)

  const out = packDir('reactome')
  const icons = []
  let bytesIn = 0
  let bytesOut = 0
  for (const file of readdirSync(src).filter((f) => f.endsWith('.svg'))) {
    const id = file.replace(/\.svg$/, '')
    const e = byId.get(id)
    const raw = readFileSync(join(src, file), 'utf8')
    const svg = optimizeSvg(raw)
    bytesIn += raw.length
    bytesOut += svg.length
    const cat = e?.iconCategories?.[0] ?? 'other'
    writeFile(join(out, 'svg', file), svg)
    const name = e?.iconName ?? id
    icons.push({
      id,
      // Use the full protein/compound name as a search term alongside the short symbol.
      name: e?.summation && e.summation !== name ? `${name} (${e.summation.replace(/<[^>]+>/g, '').slice(0, 60)})` : name,
      category: CATEGORY[cat] ?? cat,
      file: `svg/${file}`,
      author: e?.iconDesignerName ? `${e.iconDesignerName} / Reactome` : 'Reactome',
      license: 'cc-by-4.0',
      url: `https://reactome.org/icon-lib/icon/${id}`
    })
  }
  writePack({
    id: 'reactome',
    name: 'Reactome',
    description: 'Flat-style molecular and cellular icons from the Reactome pathway knowledgebase (CC BY 4.0).',
    homepage: 'https://reactome.org/icon-lib',
    icons
  })
  console.log(`Reactome pack: ${icons.length} icons, ${mb(bytesIn)} -> ${mb(bytesOut)} after SVGO.`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
