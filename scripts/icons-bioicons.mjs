#!/usr/bin/env node
// Builds the "Bioicons" icon pack from https://github.com/duerrsimon/bioicons.
//
//   npm run icons                      download the repository archive and build the pack
//   npm run icons -- --from <dir|tgz>  use an already downloaded archive or extracted folder
//   npm run icons -- --include-sa      also include CC BY-SA icons (share-alike obligations!)
//
// Only licences that allow bundling and commercial reuse are included by default:
// CC0, MIT, BSD, CC BY 3.0 and CC BY 4.0. Every icon keeps its author and licence in the
// manifest so the app can generate credit lines automatically.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, '.cache')
const OUT_ROOT = join(ROOT, 'src/renderer/public/icon-packs')
const OUT = join(OUT_ROOT, 'bioicons')
const ARCHIVE_URL = 'https://codeload.github.com/duerrsimon/bioicons/tar.gz/refs/heads/main'
const MAX_BYTES = 400 * 1024 // very large files are usually embedded bitmaps; skip them

const args = process.argv.slice(2)
const fromIdx = args.indexOf('--from')
const from = fromIdx >= 0 ? resolve(args[fromIdx + 1]) : null
const LICENSES = ['cc-0', 'mit', 'bsd', 'cc-by-3.0', 'cc-by-4.0', ...(args.includes('--include-sa') ? ['cc-by-sa-3.0', 'cc-by-sa-4.0'] : [])]

async function download() {
  mkdirSync(CACHE, { recursive: true })
  const file = join(CACHE, 'bioicons.tgz')
  if (existsSync(file)) return file
  console.log(`Downloading ${ARCHIVE_URL} …`)
  const res = await fetch(ARCHIVE_URL)
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  return file
}

function extract(tgz) {
  const dest = join(CACHE, 'bioicons-src')
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  const top = execFileSync('tar', ['-tzf', tgz]).toString().split('\n')[0].split('/')[0]
  console.log('Extracting icons …')
  execFileSync('tar', ['-xzf', tgz, '-C', dest, `${top}/static/icons`])
  return join(dest, top)
}

function findIconsDir(root) {
  for (const c of [join(root, 'static/icons'), root]) if (existsSync(join(c, 'cc-0'))) return c
  throw new Error(`No Bioicons icon folders found under ${root}`)
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) yield* walk(p)
    else if (name.toLowerCase().endsWith('.svg')) yield p
  }
}

const prettyName = (file) =>
  file
    .replace(/\.svg$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const prettyAuthor = (a) => a.replace(/-/g, ' ').replace(/\s+/g, ' ').trim()

async function main() {
  let src
  if (from && statSync(from).isDirectory()) src = from
  else src = extract(from ?? (await download()))
  const iconsDir = findIconsDir(src)
  let authorsUrl = {}
  try {
    authorsUrl = JSON.parse(readFileSync(join(iconsDir, 'authors.json'), 'utf8'))
  } catch {
    /* optional */
  }

  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const icons = []
  let skipped = 0
  for (const license of LICENSES) {
    const dir = join(iconsDir, license)
    if (!existsSync(dir)) continue
    for (const file of walk(dir)) {
      const rel = relative(dir, file).split(sep) // Category/Author/name.svg
      if (rel.length < 3) continue
      if (statSync(file).size > MAX_BYTES) {
        skipped++
        continue
      }
      const [category, author] = rel
      const outRel = [license, ...rel].join('/')
      mkdirSync(dirname(join(OUT, outRel)), { recursive: true })
      copyFileSync(file, join(OUT, outRel))
      const authorName = prettyAuthor(author)
      icons.push({
        id: createHash('sha1').update(outRel).digest('hex').slice(0, 12),
        name: prettyName(rel[rel.length - 1]),
        category,
        file: outRel,
        author: authorName,
        license,
        url: authorsUrl[authorName] || authorsUrl[author] || 'https://bioicons.com'
      })
    }
  }
  icons.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
  writeFileSync(
    join(OUT, 'manifest.json'),
    JSON.stringify(
      {
        id: 'bioicons',
        name: 'Bioicons',
        description: 'Open-source life-science icons collected by Simon Dürr and contributors.',
        homepage: 'https://bioicons.com',
        icons
      },
      null,
      1
    )
  )

  // Register the pack in the index, keeping any other packs that are installed.
  const indexFile = join(OUT_ROOT, 'index.json')
  let index = { packs: [] }
  try {
    index = JSON.parse(readFileSync(indexFile, 'utf8'))
  } catch {
    /* new index */
  }
  index.packs = index.packs.filter((p) => p.id !== 'bioicons')
  index.packs.push({ id: 'bioicons', name: 'Bioicons', manifest: 'bioicons/manifest.json' })
  writeFileSync(indexFile, JSON.stringify(index, null, 1))

  const byLicense = icons.reduce((m, i) => ((m[i.license] = (m[i.license] ?? 0) + 1), m), {})
  console.log(`Bioicons pack: ${icons.length} icons (${JSON.stringify(byLicense)}), skipped ${skipped} oversized files.`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
