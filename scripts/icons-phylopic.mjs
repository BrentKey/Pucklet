#!/usr/bin/env node
// Builds the "PhyloPic" pack: organism silhouettes from https://www.phylopic.org.
//
//   npm run icons:phylopic             a curated set of model and commonly illustrated organisms
//   npm run icons:phylopic -- --all    every PhyloPic silhouette with a suitable licence (~12k, slow)
//
// Only public-domain, CC0 and CC BY images are used. Non-commercial (NC) images are always
// excluded (journal publication counts as commercial use) and share-alike (SA) images are
// excluded so figures carry no share-alike obligations.

import { join } from 'node:path'
import { fetchRetry, mb, optimizeSvg, packDir, pool, slug, writeFile, writePack } from './lib/packs.mjs'

const API = 'https://api.phylopic.org'
const HEAD = { headers: { Accept: 'application/vnd.phylopic.v2+json' } }

/** [scientific name, common name, category] */
const ORGANISMS = [
  ['Homo sapiens', 'Human', 'Mammals'],
  ['Mus musculus', 'House mouse', 'Mammals'],
  ['Rattus norvegicus', 'Brown rat', 'Mammals'],
  ['Macaca mulatta', 'Rhesus macaque', 'Mammals'],
  ['Macaca fascicularis', 'Crab-eating macaque', 'Mammals'],
  ['Pan troglodytes', 'Chimpanzee', 'Mammals'],
  ['Callithrix jacchus', 'Common marmoset', 'Mammals'],
  ['Sus scrofa', 'Pig', 'Mammals'],
  ['Bos taurus', 'Cattle', 'Mammals'],
  ['Ovis aries', 'Sheep', 'Mammals'],
  ['Capra hircus', 'Goat', 'Mammals'],
  ['Equus caballus', 'Horse', 'Mammals'],
  ['Canis familiaris', 'Dog', 'Mammals'],
  ['Felis catus', 'Cat', 'Mammals'],
  ['Oryctolagus cuniculus', 'Rabbit', 'Mammals'],
  ['Cavia porcellus', 'Guinea pig', 'Mammals'],
  ['Mesocricetus auratus', 'Golden hamster', 'Mammals'],
  ['Heterocephalus glaber', 'Naked mole-rat', 'Mammals'],
  ['Mustela furo', 'Ferret', 'Mammals'],
  ['Rousettus aegyptiacus', 'Egyptian fruit bat', 'Mammals'],
  ['Didelphis virginiana', 'Virginia opossum', 'Mammals'],
  ['Ornithorhynchus anatinus', 'Platypus', 'Mammals'],
  ['Tursiops truncatus', 'Bottlenose dolphin', 'Mammals'],
  ['Peromyscus maniculatus', 'Deer mouse', 'Mammals'],
  ['Gallus gallus', 'Chicken', 'Birds'],
  ['Taeniopygia guttata', 'Zebra finch', 'Birds'],
  ['Columba livia', 'Rock pigeon', 'Birds'],
  ['Anas platyrhynchos', 'Mallard duck', 'Birds'],
  ['Coturnix japonica', 'Japanese quail', 'Birds'],
  ['Xenopus laevis', 'African clawed frog', 'Amphibians & reptiles'],
  ['Xenopus tropicalis', 'Western clawed frog', 'Amphibians & reptiles'],
  ['Ambystoma mexicanum', 'Axolotl', 'Amphibians & reptiles'],
  ['Anolis carolinensis', 'Green anole', 'Amphibians & reptiles'],
  ['Pogona vitticeps', 'Bearded dragon', 'Amphibians & reptiles'],
  ['Danio rerio', 'Zebrafish', 'Fish'],
  ['Oryzias latipes', 'Medaka', 'Fish'],
  ['Nothobranchius furzeri', 'Turquoise killifish', 'Fish'],
  ['Salmo salar', 'Atlantic salmon', 'Fish'],
  ['Takifugu rubripes', 'Japanese pufferfish', 'Fish'],
  ['Astyanax mexicanus', 'Mexican tetra (cavefish)', 'Fish'],
  ['Gasterosteus aculeatus', 'Three-spined stickleback', 'Fish'],
  ['Petromyzon marinus', 'Sea lamprey', 'Fish'],
  ['Drosophila melanogaster', 'Fruit fly', 'Invertebrates'],
  ['Caenorhabditis elegans', 'C. elegans (nematode)', 'Invertebrates'],
  ['Apis mellifera', 'Honey bee', 'Invertebrates'],
  ['Anopheles gambiae', 'Malaria mosquito', 'Invertebrates'],
  ['Aedes aegypti', 'Yellow fever mosquito', 'Invertebrates'],
  ['Ixodes scapularis', 'Black-legged tick', 'Invertebrates'],
  ['Bombyx mori', 'Silkworm moth', 'Invertebrates'],
  ['Tribolium castaneum', 'Red flour beetle', 'Invertebrates'],
  ['Nematostella vectensis', 'Starlet sea anemone', 'Invertebrates'],
  ['Hydra vulgaris', 'Hydra', 'Invertebrates'],
  ['Schmidtea mediterranea', 'Planarian', 'Invertebrates'],
  ['Strongylocentrotus purpuratus', 'Purple sea urchin', 'Invertebrates'],
  ['Ciona intestinalis', 'Sea squirt', 'Invertebrates'],
  ['Octopus vulgaris', 'Common octopus', 'Invertebrates'],
  ['Aplysia californica', 'California sea hare', 'Invertebrates'],
  ['Daphnia pulex', 'Water flea', 'Invertebrates'],
  ['Acyrthosiphon pisum', 'Pea aphid', 'Invertebrates'],
  ['Saccharomyces cerevisiae', "Baker's yeast", 'Fungi & protists'],
  ['Schizosaccharomyces pombe', 'Fission yeast', 'Fungi & protists'],
  ['Candida albicans', 'Candida albicans', 'Fungi & protists'],
  ['Neurospora crassa', 'Red bread mould', 'Fungi & protists'],
  ['Aspergillus fumigatus', 'Aspergillus', 'Fungi & protists'],
  ['Plasmodium falciparum', 'Malaria parasite', 'Fungi & protists'],
  ['Trypanosoma brucei', 'Trypanosome', 'Fungi & protists'],
  ['Toxoplasma gondii', 'Toxoplasma', 'Fungi & protists'],
  ['Tetrahymena thermophila', 'Tetrahymena', 'Fungi & protists'],
  ['Dictyostelium discoideum', 'Slime mould', 'Fungi & protists'],
  ['Chlamydomonas reinhardtii', 'Chlamydomonas', 'Fungi & protists'],
  ['Escherichia coli', 'E. coli', 'Bacteria'],
  ['Staphylococcus aureus', 'Staphylococcus aureus', 'Bacteria'],
  ['Mycobacterium tuberculosis', 'Mycobacterium tuberculosis', 'Bacteria'],
  ['Bacillus subtilis', 'Bacillus subtilis', 'Bacteria'],
  ['Pseudomonas aeruginosa', 'Pseudomonas aeruginosa', 'Bacteria'],
  ['Vibrio cholerae', 'Vibrio cholerae', 'Bacteria'],
  ['Streptococcus pneumoniae', 'Streptococcus pneumoniae', 'Bacteria'],
  ['Helicobacter pylori', 'Helicobacter pylori', 'Bacteria'],
  ['Salmonella enterica', 'Salmonella', 'Bacteria'],
  ['Caulobacter crescentus', 'Caulobacter', 'Bacteria'],
  ['Arabidopsis thaliana', 'Thale cress', 'Plants'],
  ['Oryza sativa', 'Rice', 'Plants'],
  ['Zea mays', 'Maize', 'Plants'],
  ['Triticum aestivum', 'Wheat', 'Plants'],
  ['Hordeum vulgare', 'Barley', 'Plants'],
  ['Nicotiana benthamiana', 'Nicotiana benthamiana', 'Plants'],
  ['Solanum lycopersicum', 'Tomato', 'Plants'],
  ['Glycine max', 'Soybean', 'Plants'],
  ['Medicago truncatula', 'Barrel medic', 'Plants'],
  ['Physcomitrium patens', 'Spreading earthmoss', 'Plants'],
  ['Marchantia polymorpha', 'Common liverwort', 'Plants'],
  ['Populus trichocarpa', 'Black cottonwood', 'Plants']
]

const OK_LICENSES = {
  'https://creativecommons.org/publicdomain/mark/1.0/': 'public domain',
  'https://creativecommons.org/publicdomain/zero/1.0/': 'cc-0',
  'https://creativecommons.org/licenses/by/3.0/': 'cc-by-3.0',
  'https://creativecommons.org/licenses/by/4.0/': 'cc-by-4.0'
}

let build = null
async function currentBuild() {
  if (build === null) build = (await (await fetchRetry(`${API}/`, HEAD)).json()).build
  return build
}

/** Turns a PhyloPic image (with embedded links) into a pack entry, or null if unusable. */
async function save(img, out, name, category, sci) {
  const license = OK_LICENSES[img?._links?.license?.href]
  const vector = img?._links?.vectorFile?.href
  if (!license || !vector) return null
  const svg = optimizeSvg(await (await fetchRetry(vector)).text())
  const file = `svg/${slug(sci || name)}-${img.uuid.slice(0, 8)}.svg`
  writeFile(join(out, file), svg)
  return {
    id: img.uuid,
    name: sci && name !== sci ? `${name} (${sci})` : name,
    category,
    file,
    author: img.attribution || img._links?.contributor?.title || 'PhyloPic contributor',
    license,
    url: `https://www.phylopic.org/images/${img.uuid}`,
    bytes: svg.length
  }
}

async function curated(out) {
  const b = await currentBuild()
  const missing = []
  const icons = await pool(ORGANISMS, 4, async ([sci, common, category]) => {
    const url = `${API}/nodes?build=${b}&filter_name=${encodeURIComponent(sci.toLowerCase())}&embed_items=true&embed_primaryImage=true&page=0`
    try {
      const data = await (await fetchRetry(url, HEAD)).json()
      const node = data._embedded?.items?.[0]
      let icon = await save(node?._embedded?.primaryImage, out, common, category, sci)
      if (!icon && node?.uuid) {
        // The featured silhouette may be non-commercial; look for another one of the same taxon.
        const q = `${API}/images?build=${b}&filter_clade=${node.uuid}&filter_license_nc=false&filter_license_sa=false&embed_items=true&page=0`
        const imgs = (await (await fetchRetry(q, HEAD)).json())._embedded?.items ?? []
        for (const img of imgs.slice(0, 5)) if (!icon) icon = await save(img, out, common, category, sci)
      }
      if (!icon) missing.push(sci)
      return icon
    } catch {
      missing.push(sci)
      return null
    }
  })
  if (missing.length) console.log(`No suitably licensed silhouette for: ${missing.join(', ')}`)
  return icons.filter(Boolean)
}

async function everything(out) {
  const b = await currentBuild()
  const filters = 'filter_license_nc=false&filter_license_sa=false'
  const first = await (await fetchRetry(`${API}/images?build=${b}&${filters}`, HEAD)).json()
  console.log(`Fetching ${first.totalItems} silhouettes in ${first.totalPages} pages …`)
  const pages = Array.from({ length: first.totalPages }, (_, i) => i)
  const lists = await pool(pages, 3, async (page) => {
    const d = await (await fetchRetry(`${API}/images?build=${b}&${filters}&embed_items=true&page=${page}`, HEAD)).json()
    return d._embedded?.items ?? []
  })
  const images = lists.flat()
  let done = 0
  const icons = await pool(images, 6, async (img) => {
    const title = img._links?.specificNode?.title ?? 'Organism'
    const icon = await save(img, out, title, (img._links?.generalNode?.title ?? 'Other').slice(0, 40), '').catch(() => null)
    if (++done % 500 === 0) console.log(`  ${done}/${images.length}`)
    return icon
  })
  return icons.filter(Boolean)
}

async function main() {
  const out = packDir('phylopic')
  const icons = process.argv.includes('--all') ? await everything(out) : await curated(out)
  const total = icons.reduce((s, i) => s + i.bytes, 0)
  for (const i of icons) delete i.bytes
  writePack({
    id: 'phylopic',
    name: 'PhyloPic',
    description: 'Organism silhouettes from PhyloPic (public domain, CC0 and CC BY only).',
    homepage: 'https://www.phylopic.org',
    icons
  })
  console.log(`PhyloPic pack: ${icons.length} silhouettes, ${mb(total)}.`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
