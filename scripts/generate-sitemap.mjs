#!/usr/bin/env node
// Génère public/robots.txt et public/sitemap.xml avant chaque build (voir
// "prebuild" dans package.json) à partir de src/seo/staticPages.js (pages
// statiques) et src/texts/index.json (catalogue de textes).
//
// Usage : node scripts/generate-sitemap.mjs

import { writeFileSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { SITE_URL, ROUTES } from '../src/seo/staticPages.js'
import { loadBooksIndex, loadBookManifest } from './lib/free-content.mjs'
import { getSeoDictionaryEntries } from '../src/seo/dictionaryPages.js'
import { getSeoConjugations } from '../src/seo/conjugationPages.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(root, '../public')

// <lastmod> (SEO-7) : date du dernier commit qui a touché le fichier source
// (un seul `git log` pour tout le dépôt), sinon mtime du fichier, sinon date
// du jour. On évite ainsi de dater toutes les URL du jour du build, ce qui
// ôterait tout signal de fraîcheur aux moteurs.
const repoRoot = path.join(root, '..')
const gitDates = new Map()
try {
  const out = execFileSync(
    'git',
    ['log', '--format=@%cI', '--name-only', '--no-renames', '--', 'src'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
  )
  let current = null
  for (const line of out.split('\n')) {
    if (line.startsWith('@')) current = line.slice(1, 11)
    else if (line && current && !gitDates.has(line)) gitDates.set(line, current)
  }
} catch {
  // pas de dépôt git (copie de travail, CI sans historique) : mtime ci-dessous
}
const today = new Date().toISOString().slice(0, 10)
function lastmodOf(...relPaths) {
  let best = ''
  for (const rel of relPaths) {
    let d = gitDates.get(rel)
    if (!d) {
      try {
        d = statSync(path.join(repoRoot, rel)).mtime.toISOString().slice(0, 10)
      } catch {
        d = ''
      }
    }
    if (d > best) best = d
  }
  return best || today
}
function newestUnder(prefix) {
  let best = ''
  for (const [file, d] of gitDates) if (file.startsWith(prefix) && d > best) best = d
  return best
}
// Pages statiques : plus récente modification des vues ou des métadonnées SEO.
const staticLastmod =
  [newestUnder('src/views/'), newestUnder('src/seo/')].sort().pop() ||
  lastmodOf('src/seo/staticPages.js')
const dictLastmod = newestUnder('src/dictionary/') || lastmodOf('src/seo/dictionaryPages.js')

const textsIndex = JSON.parse(
  readFileSync(path.join(root, '../src/texts/index.json'), 'utf8')
)

const staticUrls = ROUTES.filter((r) => !r.noindex).map((r) => ({
  loc: `${SITE_URL}${r.path}`,
  changefreq: r.path === '/textes' || r.path === '/' ? 'weekly' : 'monthly',
  priority: r.path === '/' ? '1.0' : r.path === '/textes' ? '0.9' : '0.6',
  lastmod: staticLastmod,
}))

const textUrls = textsIndex.map((t) => ({
  loc: `${SITE_URL}/testo/${t.id}`,
  changefreq: 'monthly',
  priority: '0.7',
  lastmod: lastmodOf(`src/texts/${t.id}.json`),
}))

// Classici : une URL par chapitre, même logique que les textes (fiche
// publique + paywall pour les chapitres non gratuits — voir prerender.mjs).
const chapterUrls = loadBooksIndex().flatMap((book) =>
  loadBookManifest(book.id).chapters.map((chapter) => ({
    loc: `${SITE_URL}/classici/${book.id}/${chapter.id}`,
    changefreq: 'monthly',
    priority: '0.6',
    lastmod: lastmodOf(`src/books/${book.id}/${book.id}-${chapter.id}.json`),
  }))
)

// Dictionnaire/conjugaison : premier lot seulement (voir dictionaryPages.js,
// conjugationPages.js) — pas les ~11 275 lemmes du dictionnaire complet.
const dictionaryUrls = getSeoDictionaryEntries().map((e) => ({
  loc: `${SITE_URL}/dizionario/${encodeURIComponent(e.lemma)}`,
  changefreq: 'yearly',
  priority: '0.5',
  lastmod: dictLastmod,
}))
const conjugationUrls = getSeoConjugations().map((c) => ({
  loc: `${SITE_URL}/coniugazione/${encodeURIComponent(c.lemma)}`,
  changefreq: 'yearly',
  priority: '0.5',
  lastmod: dictLastmod,
}))

const urls = [
  ...staticUrls,
  ...textUrls,
  ...chapterUrls,
  ...dictionaryUrls,
  ...conjugationUrls,
]

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
  )
  .join('\n')}
</urlset>
`

const robots = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /profil
Disallow: /connexion
Disallow: /creer-son-texte
Disallow: /mes-textes
Disallow: /parole
Disallow: /vocabolario
Disallow: /condividi/

Sitemap: ${SITE_URL}/sitemap.xml
`

writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap)
writeFileSync(path.join(publicDir, 'robots.txt'), robots)

console.log(
  `✓ sitemap.xml (${urls.length} URLs) et robots.txt générés dans public/`
)
