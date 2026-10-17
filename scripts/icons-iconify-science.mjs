#!/usr/bin/env node
// Builds the "Science pictograms" pack: lab, biology and medical glyphs gathered from the open
// icon sets served by the Iconify API (https://api.iconify.design). For each search term we take
// at most PER_SET icons from each set (and PER_TERM overall; the term must be a whole word of
// the icon name), and only from sets whose licence (from /collections,
// license.spdx) is MIT, Apache-2.0, ISC, CC0-1.0 or CC-BY-4.0. The Health Icons set is skipped
// (it has its own pack). Icon bodies come from /<prefix>.json?icons=... and are wrapped in an
// <svg> with the icon's viewBox; most use currentColor, which the app maps to a recolourable black.
//
//   node scripts/icons-iconify-science.mjs

import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { mb, packDir, pool, slug, writeFile, writePack } from './lib/packs.mjs'
import { cleanSvg, getJson, Skips } from './lib/svgcheck.mjs'

const API = 'https://api.iconify.design'
const PER_SET = 6
const LICENSES = { MIT: 'mit', 'Apache-2.0': 'apache-2.0', ISC: 'isc', 'CC0-1.0': 'cc0', 'CC-BY-4.0': 'cc-by-4.0' }
const PER_TERM = 150
// Health Icons has its own pack; brand-logo, file-type and flag sets add only noise.
const SKIP_SETS = new Set([
  'healthicons', 'logos', 'simple-icons', 'selfhst', 'vscode-icons', 'file-icons', 'material-icon-theme',
  'catppuccin', 'token', 'token-branded', 'skill-icons', 'devicon', 'devicon-plain', 'devicon-line', 'cib', 'bxl',
  'fa-brands', 'fa6-brands', 'fa7-brands', 'thesvg', 'thesvg-color', 'flag', 'flagpack', 'circle-flags', 'cif', 'fxemoji'
])
// Per-term exclusions for words that mostly match non-science glyphs.
const EXCLUDE = {
  mouse: /button|scroll|click|pointer|cursor|keyboard|wireless|mickey|monetization|computer|trap/,
  cell: /tower|phone|cellular|table|merge|split|signal|battery/,
  scale: /expand|resize|enlarge|shrink|3d|frame|unit|aspect|up|down|horizontal|vertical|fit/,
  tissue: /box|paper|bathroom|toilet/,
  eye: /off|slash|closed|password|dropper/,
  heart: /broken|off|plus|minus|handshake|crack|break|outline-off|like|favorite|arrow|message|chat|comment|bolt|music|search|cog|star|spade|suit|card|ribbon|hand|lock|code|book/,
  egg: /fried|easter|painted|boiled/,
  lab: /label|gitlab/,
  chart: /gantt|flow|org/,
  organ: /organization|organic/,
  rat: /rate|ratio|rating|rattle/,
  gene: /general|generate|generator/
}
// Does the icon name contain the term as a whole word (plurals allowed)?
const matches = (name, term) => {
  const words = name.split('-')
  const t = term.split('-')
  for (let i = 0; i + t.length <= words.length; i++) {
    const seg = words.slice(i, i + t.length)
    const last = seg[seg.length - 1]
    if (seg.slice(0, -1).join('-') === t.slice(0, -1).join('-') && [t.at(-1), t.at(-1) + 's', t.at(-1) + 'es'].includes(last)) return true
  }
  return false
}
const TERMS = [
  'microscope', 'dna', 'rna', 'virus', 'bacteria', 'cell', 'neuron', 'brain', 'heart', 'lungs', 'kidney', 'liver',
  'antibody', 'molecule', 'atom', 'flask', 'beaker', 'test-tube', 'pipette', 'petri', 'centrifuge', 'syringe', 'pill',
  'vaccine', 'mouse', 'rat', 'fish', 'plant', 'leaf', 'seed', 'tooth', 'bone', 'blood', 'droplet', 'thermometer',
  'scale', 'chart', 'lab', 'chemistry', 'biology', 'medical', 'hospital', 'patient', 'doctor', 'gene', 'protein',
  'enzyme', 'tissue', 'organ', 'eye', 'ear', 'stomach', 'intestine', 'muscle', 'skeleton', 'sperm', 'egg', 'embryo',
  'fungus', 'mushroom'
]

const titleCase = (s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

async function main() {
  const sets = await getJson(`${API}/collections`, 'iconify/collections.json')
  const skips = new Skips()

  // term -> picks; first term to claim an icon keeps it (dedupe across terms).
  const seen = new Set()
  const picks = [] // { prefix, name, term }
  for (const term of TERMS) {
    const res = await getJson(`${API}/search?query=${encodeURIComponent(term)}&limit=999`, `iconify/search/${slug(term)}.json`)
    const perSet = {}
    let picksForTerm = 0
    for (const full of res.icons ?? []) {
      const [prefix, name] = full.split(':')
      const set = sets[prefix]
      if (!set || SKIP_SETS.has(prefix)) continue
      if (!LICENSES[set.license?.spdx]) {
        skips.add('set licence')
        continue
      }
      if (seen.has(full) || !matches(name, term) || EXCLUDE[term]?.test(name)) continue
      if (picksForTerm >= PER_TERM) break
      if ((perSet[prefix] = (perSet[prefix] ?? 0) + 1) > PER_SET) continue
      seen.add(full)
      picks.push({ prefix, name, term })
      picksForTerm++
    }
  }
  console.log(`${picks.length} icons picked from ${new Set(picks.map((p) => p.prefix)).size} sets for ${TERMS.length} terms.`)

  // Fetch icon data per set in batches.
  const byPrefix = {}
  for (const p of picks) (byPrefix[p.prefix] ??= []).push(p)
  const jobs = []
  for (const [prefix, list] of Object.entries(byPrefix)) {
    for (let i = 0; i < list.length; i += 80) jobs.push({ prefix, list: list.slice(i, i + 80) })
  }
  const out = packDir('iconify-science')
  let total = 0
  const icons = (
    await pool(jobs, 4, async ({ prefix, list }) => {
      const names = list.map((p) => p.name).sort()
      const key = `iconify/icons/${prefix}-${createHash('sha1').update(names.join(',')).digest('hex').slice(0, 12)}.json`
      let data
      try {
        data = await getJson(`${API}/${prefix}.json?icons=${names.map(encodeURIComponent).join(',')}`, key)
      } catch {
        list.forEach(() => skips.add('download failed'))
        return []
      }
      const set = sets[prefix]
      return list.map(({ name, term }) => {
        let ic = data.icons?.[name]
        let alias = data.aliases?.[name]
        let extra = {}
        if (!ic && alias) {
          extra = alias
          ic = data.icons?.[alias.parent]
        }
        if (!ic) {
          skips.add('missing data')
          return null
        }
        const d = { ...ic, ...extra }
        if (d.rotate || d.hFlip || d.vFlip) {
          skips.add('transformed alias')
          return null
        }
        const left = d.left ?? data.left ?? 0
        const top = d.top ?? data.top ?? 0
        const w = d.width ?? data.width ?? 16
        const h = d.height ?? data.height ?? 16
        const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${w} ${h}">${ic.body}</svg>`
        const r = cleanSvg(raw)
        if (r.skip) {
          skips.add(r.skip)
          return null
        }
        const file = `svg/${prefix}/${name}.svg`
        writeFile(join(out, file), r.svg)
        total += r.svg.length
        const author = set.author?.name ? `${set.name} / ${set.author.name}` : set.name
        return {
          id: `${prefix}:${name}`,
          name: `${titleCase(name)} (${set.name})`,
          category: titleCase(term),
          file,
          author,
          license: LICENSES[set.license.spdx],
          url: `https://icon-sets.iconify.design/${prefix}/${name}/`
        }
      })
    })
  )
    .flat()
    .filter(Boolean)
  writePack({
    id: 'iconify-science',
    name: 'Science pictograms',
    description:
      'Lab, biology and medical glyphs from permissively licensed open icon sets (MIT, Apache-2.0, ISC, CC0, CC BY 4.0) via Iconify.',
    homepage: 'https://icon-sets.iconify.design',
    icons
  })
  const licCount = {}
  for (const i of icons) licCount[i.license] = (licCount[i.license] ?? 0) + 1
  console.log(`Science pictograms pack: ${icons.length} icons, ${mb(total)}; ${JSON.stringify(licCount)}; ${skips}.`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
