#!/usr/bin/env node
// Builds the "Health Icons" pack: public-health and medical glyphs from Health Icons
// (https://healthicons.org, https://github.com/resolvetosavelives/healthicons). The icons are
// dedicated to the public domain under CC0 (the repository's code is MIT). Both the 48 px
// "filled" and "outline" styles are included; names, tags and categories come from the
// project's public/icons/meta-data.json.
//
//   node scripts/icons-healthicons.mjs

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE, fetchRetry, mb, packDir, writeFile, writePack } from './lib/packs.mjs'
import { HEADERS, cleanSvg, Skips } from './lib/svgcheck.mjs'

const REPO = 'https://github.com/resolvetosavelives/healthicons'
const TARBALL = 'https://codeload.github.com/resolvetosavelives/healthicons/tar.gz/refs/heads/main'
const STYLES = { filled: 'Filled', outline: 'Outline' }

const title = (s) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

async function main() {
  mkdirSync(CACHE, { recursive: true })
  const tgz = join(CACHE, 'healthicons-main.tgz')
  if (!existsSync(tgz)) {
    console.log(`Downloading ${TARBALL} (~180 MB) …`)
    writeFileSync(tgz, Buffer.from(await (await fetchRetry(TARBALL, { headers: HEADERS })).arrayBuffer()))
  }
  const src = join(CACHE, 'healthicons-src')
  rmSync(src, { recursive: true, force: true })
  mkdirSync(src, { recursive: true })
  const patterns = ['*/public/icons/meta-data.json', ...Object.keys(STYLES).map((s) => `*/public/icons/svg/${s}/*`)]
  execFileSync('tar', ['-xzf', tgz, '-C', src, ...(process.platform === 'linux' ? ['--wildcards'] : []), ...patterns])
  const root = join(src, readdirSync(src)[0], 'public/icons')

  const meta = JSON.parse(readFileSync(join(root, 'meta-data.json'), 'utf8'))
  const out = packDir('healthicons')
  const icons = []
  const skips = new Skips()
  let total = 0
  for (const m of meta) {
    for (const [style, label] of Object.entries(STYLES)) {
      const path = join(root, 'svg', style, `${m.path}.svg`)
      if (!existsSync(path)) {
        skips.add('missing file')
        continue
      }
      const r = cleanSvg(readFileSync(path, 'utf8'))
      if (r.skip) {
        skips.add(r.skip)
        continue
      }
      const file = `svg/${style}/${m.path}.svg`
      writeFile(join(out, file), r.svg)
      total += r.svg.length
      const tags = (m.tags ?? []).filter((t) => !t.includes(':') && t.toLowerCase() !== m.title.toLowerCase())
      icons.push({
        id: `${style}/${m.path}`,
        name: tags.length ? `${m.title} [${tags.slice(0, 6).join(', ')}]` : m.title,
        category: `${title(m.category)} (${label.toLowerCase()})`,
        file,
        author: 'Health Icons (Resolve to Save Lives)',
        license: 'cc0',
        url: `https://healthicons.org/icon/${style}/${m.path}`
      })
    }
  }
  writePack({
    id: 'healthicons',
    name: 'Health Icons',
    description: 'Public-health and medical glyphs from Health Icons, filled and outline styles (CC0).',
    homepage: 'https://healthicons.org',
    icons
  })
  console.log(`Health Icons pack: ${icons.length} icons (${meta.length} designs x 2 styles), ${mb(total)}; ${skips}. Source: ${REPO}`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
