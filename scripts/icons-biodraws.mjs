#!/usr/bin/env node
// Builds the "BioDraws (share-alike)" pack: scientific illustrations (protein motifs, DNA, cell
// culture plates, immunology assays, neuroanatomy, organelles …) from BioDraws
// (https://biodraws.com). The site footer licenses everything under CC BY-SA 4.0, so this is an
// OPT-IN share-alike library: figures that adapt these drawings must be shared under CC BY-SA.
// The SVG list comes from the site's WordPress REST API (media with mime type image/svg+xml);
// names, links and categories come from the post each SVG is attached to.
//
//   node scripts/icons-biodraws.mjs

import { join } from 'node:path'
import { mb, packDir, pool, slug, writeFile, writePack } from './lib/packs.mjs'
import { cachedGet, cleanSvg, getJson, Skips } from './lib/svgcheck.mjs'

const SITE = 'https://biodraws.com'
const API = `${SITE}/wp-json/wp/v2`

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&#8211;|&#8212;/g, '-')
    .replace(/&#8217;|&#039;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim()

async function all(endpoint, rel) {
  const out = []
  for (let page = 1; ; page++) {
    const sep = endpoint.includes('?') ? '&' : '?'
    let items
    try {
      items = await getJson(`${API}/${endpoint}${sep}per_page=100&page=${page}`, `biodraws/${rel}-${page}.json`)
    } catch {
      break // WordPress answers 400 past the last page
    }
    if (!Array.isArray(items) || !items.length) break
    out.push(...items)
    if (items.length < 100) break
  }
  return out
}

/** "biodraws_golgi body_3dv" -> "Golgi body 3dv" */
const fromFile = (t) => {
  const s = decode(t).replace(/^biodraws?[_ -]*/i, '').replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

async function main() {
  const media = await all('media?mime_type=image/svg%2Bxml&_fields=id,title,source_url,post,link', 'media')
  const posts = await all('posts?_fields=id,title,link,categories,content', 'posts')
  const cats = await all('categories?_fields=id,name', 'categories')
  const postById = new Map(posts.map((p) => [p.id, p]))
  const catName = new Map(cats.map((c) => [c.id, decode(c.name)]))
  // Most uploads aren't formally attached to a post, so find the post whose main image is the file
  // (<img class="wp-image-<media id>">; the related-posts strip at the bottom is ignored).
  const base = (u) => decodeURIComponent(u.split('/').pop()).toLowerCase()
  const postByFile = new Map()
  const postByMedia = new Map()
  for (const p of posts) {
    for (const [tag] of (p.content?.rendered ?? '').matchAll(/<img\b[^>]*>/gi)) {
      if (/ays-arp/.test(tag)) continue
      const src = tag.match(/src="([^"]+\.svg)"/i)?.[1]
      const mid = tag.match(/wp-image-(\d+)/)?.[1]
      if (mid && !postByMedia.has(+mid)) postByMedia.set(+mid, p)
      if (src && !postByFile.has(base(src))) postByFile.set(base(src), p)
    }
  }
  const postOf = (m) => postById.get(m.post) ?? postByMedia.get(m.id) ?? postByFile.get(base(m.source_url))
  const perPost = {}
  for (const m of media) {
    const p = postOf(m)
    if (p) perPost[p.id] = (perPost[p.id] ?? 0) + 1
  }
  console.log(`${media.length} SVG uploads, ${posts.length} posts.`)

  const out = packDir('biodraws')
  const skips = new Skips()
  let total = 0
  const icons = await pool(media, 3, async (m) => {
    let raw
    try {
      raw = (await cachedGet(m.source_url, `biodraws/svg/${m.id}.svg`)).toString('utf8')
    } catch {
      skips.add('download failed')
      return null
    }
    const r = cleanSvg(raw)
    if (r.skip) {
      skips.add(r.skip)
      return null
    }
    const post = postOf(m)
    const postTitle = post ? decode(post.title?.rendered ?? '') : ''
    // One SVG per post: use the post title; several: the file title distinguishes the variants.
    const name = postTitle && perPost[post.id] === 1 ? postTitle : fromFile(m.title?.rendered ?? String(m.id))
    const category =
      (post?.categories ?? []).map((id) => catName.get(id)).find((n) => n && !/^uncategori[sz]ed$/i.test(n)) ?? 'Other'
    const file = `svg/${slug(m.source_url.split('/').pop().replace(/\.svg$/i, ''))}-${m.id}.svg`
    writeFile(join(out, file), r.svg)
    total += r.svg.length
    return {
      id: String(m.id),
      name: postTitle && name !== postTitle ? `${name} (${postTitle})` : name,
      category,
      file,
      author: 'BioDraws',
      license: 'cc-by-sa-4.0',
      url: post?.link ?? m.link ?? SITE
    }
  })
  const list = icons.filter(Boolean)
  writePack({
    id: 'biodraws',
    name: 'BioDraws (share-alike)',
    description:
      'Scientific illustrations from BioDraws under CC BY-SA 4.0: figures that adapt them must also be shared under CC BY-SA.',
    homepage: SITE,
    icons: list
  })
  console.log(`BioDraws pack: ${list.length} of ${media.length} SVGs, ${mb(total)}; ${skips}.`)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
