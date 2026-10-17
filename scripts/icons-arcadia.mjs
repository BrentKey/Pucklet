#!/usr/bin/env node
// Builds the "Arcadia organisms" pack: research-organism illustrations from the Arcadia Science
// organism illustration library (Zenodo https://doi.org/10.5281/zenodo.17203577, all versions;
// the latest version is resolved through the Zenodo API). The Zenodo record is licensed CC0
// ("All images are released under CC0, which has no usage restrictions"). Both the
// silhouette and the "tricolor + stroke" SVG of each organism are included.
// Organisms marked in the record as adapted from PhyloPic silhouettes are credited as such.
//
//   node scripts/icons-arcadia.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import { CACHE, fetchRetry, mb, packDir, slug, writeFile, writePack } from './lib/packs.mjs'
import { HEADERS, cleanSvg, getJson, Skips } from './lib/svgcheck.mjs'

const CONCEPT = 'https://zenodo.org/api/records/17203577'
const STYLES = { 'Silhouette SVGs': 'Silhouettes', 'Tricolor + stroke SVGs': 'Tricolor' }

const COMMON = {
  'Aedes aegypti': 'Yellow fever mosquito', 'Agaricus bisporus': 'Button mushroom', 'Anolis carolinensis': 'Green anole',
  'Arabidopsis thaliana': 'Thale cress', 'Aspergillus nidulans': 'Aspergillus', 'Caenorhabditis elegans': 'Nematode worm',
  'Callithrix jacchus': 'Common marmoset', 'Callorhinchus milii': 'Elephant shark', 'Candida albicans': 'Candida yeast',
  'Carlito syrichta': 'Philippine tarsier', 'Chlamydomonas reinhardtii': 'Green alga', 'Chlorella vulgaris': 'Green alga',
  'Ciona intestinalis': 'Sea squirt', 'Clytia hemisphaerica': 'Jellyfish', 'Danio rerio': 'Zebrafish',
  'Dictyostelium discoideum': 'Slime mould', 'Drosophila melanogaster': 'Fruit fly', 'Entamoeba histolytica': 'Amoeba',
  'Escherichia coli': 'E. coli bacterium', 'Euglena gracilis': 'Euglena', 'Exaiptasia diaphana': 'Sea anemone',
  'Gallus gallus': 'Chicken', 'Giardia intestinalis': 'Giardia', 'Hofstenia miamia': 'Three-banded panther worm',
  'Homo sapiens': 'Human', 'Human immunodeficiency virus': 'HIV', 'Hydra vulgaris': 'Hydra',
  'Hypsibius dujardini': 'Tardigrade (water bear)', 'Influenza virus': 'Influenza virus', 'Macaca mulatta': 'Rhesus macaque',
  'Microcebus murinus': 'Grey mouse lemur', 'Mnemiopsis leidyi': 'Comb jelly', 'Mus musculus': 'House mouse',
  'Naegleria gruberi': 'Amoeboflagellate', 'Nematostella vectensis': 'Starlet sea anemone', 'Neurospora crassa': 'Bread mould',
  'Pan troglodytes': 'Chimpanzee', 'Paramecium tetraurelia': 'Paramecium', 'Penicillium chrysogenum': 'Penicillium mould',
  'Petromyzon marinus': 'Sea lamprey', 'Plasmodium falciparum': 'Malaria parasite', 'Porphyra yezoensis': 'Nori seaweed',
  'Rattus norvegicus': 'Brown rat', 'Saccharomyces cerevisiae': "Baker's yeast", 'Salpingoeca rosetta': 'Choanoflagellate',
  'SARS-CoV-2': 'Coronavirus', 'Schistosoma mansoni': 'Blood fluke', 'Schizosaccharomyces pombe': 'Fission yeast',
  'Schmidtea mediterranea': 'Planarian', 'Sus scrofa domestica': 'Pig', 'Taeniopygia guttata': 'Zebra finch',
  'Tetrahymena thermophila': 'Tetrahymena', 'Ustilago maydis': 'Corn smut fungus', 'Volvox carteri': 'Volvox',
  'Xenopus tropicalis': 'Western clawed frog', 'Monosiga brevicollis': 'Choanoflagellate', 'Phaeodactylum tricornutum': 'Diatom',
  'Isochrysis galbana': 'Haptophyte alga', 'Symbiodinium sp.': 'Dinoflagellate', 'Nannochloropsis sp.': 'Microalga',
  'Pristionchus pacificus': 'Nematode worm', 'Perkinsus marinus': 'Oyster parasite', 'Ostreococcus tauri': 'Picoalga',
  'Micromonas commoda': 'Picoalga', 'Bathycoccus prasinos': 'Picoalga', 'Yarrowia lipolytica': 'Yeast',
  'Tetraselmis striata': 'Green alga', 'Bodo saltans': 'Kinetoplastid', 'Diplonema papillatum': 'Diplonemid',
  'Abeoforma whisleri': 'Ichthyosporean', 'Sphaeroforma arctica': 'Ichthyosporean', 'Amorphochlora amoebiformis': 'Chlorarachniophyte alga'
}

async function main() {
  const rec = await getJson(`${CONCEPT}/versions/latest`, 'arcadia/record-latest.json')
  if (rec.metadata?.license?.id !== 'cc-zero') throw new Error(`Unexpected licence ${rec.metadata?.license?.id}`)
  const zipFile = rec.files.find((f) => f.key.endsWith('.zip'))
  const path = join(CACHE, 'arcadia', zipFile.key)
  if (!existsSync(path)) {
    console.log(`Downloading ${zipFile.key} (${mb(zipFile.size)}) …`)
    mkdirSync(join(CACHE, 'arcadia'), { recursive: true })
    writeFileSync(path, Buffer.from(await (await fetchRetry(zipFile.links.self, { headers: HEADERS })).arrayBuffer()))
  }
  const desc = (rec.metadata.description ?? '').replace(/<[^>]+>/g, '\n')
  const phylopic = new Set(
    desc
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.endsWith('*'))
      .map((s) => s.replace(/\s*\*$/, ''))
  )

  const files = unzipSync(new Uint8Array(readFileSync(path)), {
    filter: (f) => f.name.toLowerCase().endsWith('.svg')
  })
  const out = packDir('arcadia')
  const icons = []
  const skips = new Skips()
  let total = 0
  for (const [name, data] of Object.entries(files)) {
    const [folder, base] = name.split('/').slice(-2)
    const style = STYLES[folder]
    if (!style) continue
    const r = cleanSvg(Buffer.from(data).toString('utf8'))
    if (r.skip) {
      skips.add(r.skip)
      continue
    }
    const sci = base.replace(/-(silhouette|tricolorstroke)\.svg$/i, '').replace(/-/g, ' ').replace(/^SARS CoV 2$/, 'SARS-CoV-2')
    const file = `svg/${style.toLowerCase()}/${slug(sci)}.svg`
    writeFile(join(out, file), r.svg)
    total += r.svg.length
    const common = COMMON[sci]
    icons.push({
      id: `${style.toLowerCase()}/${slug(sci)}`,
      name: common && common !== sci ? `${common} (${sci})` : sci,
      category: style,
      file,
      author: phylopic.has(sci) ? 'Arcadia Science (adapted from a PhyloPic silhouette)' : 'Arcadia Science',
      license: 'cc0',
      url: rec.doi_url ?? `https://doi.org/${rec.doi}`
    })
  }
  writePack({
    id: 'arcadia',
    name: 'Arcadia organisms',
    description: 'Research-organism illustrations (silhouette and tricolour) from the Arcadia Science library (CC0).',
    homepage: 'https://doi.org/10.5281/zenodo.17203577',
    icons
  })
  console.log(`Arcadia pack: ${icons.length} illustrations (${rec.metadata.version}), ${mb(total)}; ${skips}.`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
