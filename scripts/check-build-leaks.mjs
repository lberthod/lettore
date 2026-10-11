#!/usr/bin/env node
// Garde-fou : aucun contenu réservé ne doit se retrouver dans dist/.
//
// Les gardes de route et les vérifications de rôle ne protègent que
// l'affichage : tant qu'un texte payant est émis comme chunk (ou inséré dans
// une page prérendue), il reste téléchargeable par qui en connaît l'URL.
// C'est exactement la régression corrigée par le module virtuel
// `virtual:free-content` (vite.config.js) — ce script échoue le build si elle
// revient, par exemple parce qu'un `import.meta.glob('../texts/*.json')` a été
// réintroduit quelque part.
//
// Usage : node scripts/check-build-leaks.mjs (exécuté en postbuild)

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { SITE_URL, ROUTES } from '../src/seo/staticPages.js'
import {
  ROOT,
  lockedContent,
  chapterDocId,
  loadTextsIndex,
  freeContentIds,
} from './lib/free-content.mjs'

const distDir = path.join(ROOT, 'dist')

if (!existsSync(distDir)) {
  console.error('dist/ introuvable — lancez « vite build » avant ce script.')
  process.exit(1)
}

function walk(dir) {
  const files = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else files.push(full)
  }
  return files
}

// Empreinte textuelle d'un contenu : une fenêtre du texte italien sans
// caractère susceptible d'être échappé différemment dans un bundle
// (guillemets, apostrophes, antislash). Suffisamment longue pour qu'une
// collision fortuite soit impossible.
//
// La fenêtre est prise APRÈS l'extrait : le début du premier paragraphe est
// publié volontairement (index.json, pages prérendues /testo/<id>) comme
// teaser SEO — le retrouver dans dist/ est normal, seule la suite du texte
// signale une fuite.
const EXCERPT_MARGIN = 220

// Caractères écartés d'une fenêtre : ils sont échappés différemment selon
// qu'on regarde un chunk JavaScript ou une page HTML.
const AMBIGUOUS = /["'\\\n\r‘’&<>]/

function marker(json, excerpt = '') {
  const text = (json.paragraphs || []).join(' ').replace(/\s+/g, ' ')
  const windows = (size, from) => {
    const out = []
    for (let i = from; i + size <= text.length; i += 5) {
      const window = text.slice(i, i + size)
      if (!AMBIGUOUS.test(window)) out.push(window)
    }
    return out
  }
  // 1. Cas courant : une fenêtre située après l'extrait publié.
  const [afterExcerpt] = windows(40, EXCERPT_MARGIN)
  if (afterExcerpt) return afterExcerpt
  // 2. Textes très courts (comptines, poèmes) : première fenêtre entièrement
  //    située après l'extrait publié, quitte à la raccourcir.
  const excerptEnd = excerpt.replace(/…\s*$/, '').length
  for (const size of [40, 24]) {
    const [found] = windows(size, excerptEnd)
    if (found) return found
  }
  return null
}

// Extrait publié de chaque texte (index.json) : teaser SEO légitime, à ne
// pas confondre avec une fuite du contenu complet.
const excerpts = new Map(loadTextsIndex().map((t) => [t.id, t.excerpt || '']))

const { texts, chapters } = lockedContent()
const items = [
  ...texts.map((t) => ({
    label: `texte ${t.id}`,
    id: t.id,
    file: t.file,
    excerpt: excerpts.get(t.id) || '',
  })),
  ...chapters.map((c) => ({
    label: `chapitre ${c.bookId}/${c.chapterId}`,
    id: chapterDocId(c.bookId, c.chapterId),
    file: c.file,
  })),
]

const files = walk(distDir)
// Un chunk Vite porte le nom de son module source (« miracolo-a1b2c3.js ») :
// un simple coup d'œil aux noms de fichiers repère la régression la plus
// probable, avant même de comparer le contenu.
const assetNames = new Set(files.map((f) => path.basename(f)))

// Préfixes de chunk légitimement gratuits (ex. chapitre de livre
// « gatto-con-gli-stivali-01 ») : un identifiant réservé peut être un
// préfixe d'un identifiant gratuit plus long (texte « gatto » vs livre
// « gatto-con-gli-stivali ») — sans cette liste, la détection par préfixe de
// nom de fichier ci-dessous produirait un faux positif.
const free = freeContentIds()
const freeChunkNames = new Set([
  ...free.texts,
  ...free.chapters.map(({ bookId, chapterId }) => `${bookId}-${chapterId}`),
])
const blob = files
  .filter((f) => /\.(js|html|css|json|txt)$/.test(f))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')

const leaks = []
const unverifiable = []

for (const item of items) {
  const nameLeak = [...assetNames].find((name) => {
    if (
      !new RegExp(
        `^${item.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-[A-Za-z0-9_-]+\\.js$`
      ).test(name)
    ) {
      return false
    }
    const base = name.replace(/-[A-Za-z0-9_]+\.js$/, '')
    return !freeChunkNames.has(base)
  })
  if (nameLeak) {
    leaks.push(`${item.label} — chunk émis : dist/assets/${nameLeak}`)
    continue
  }
  const needle = marker(
    JSON.parse(readFileSync(item.file, 'utf8')),
    item.excerpt
  )
  if (!needle) {
    unverifiable.push(item.label)
    continue
  }
  if (blob.includes(needle)) {
    leaks.push(`${item.label} — contenu présent dans dist/ (« ${needle.slice(0, 30)}… »)`)
  }
}

if (unverifiable.length) {
  console.warn(
    `⚠ ${unverifiable.length} contenu(s) sans empreinte exploitable, non vérifiés : ${unverifiable
      .slice(0, 5)
      .join(', ')}`
  )
}

if (leaks.length) {
  console.error(`✗ Contenu réservé présent dans le build (${leaks.length}) :`)
  for (const leak of leaks.slice(0, 10)) console.error(`  - ${leak}`)
  if (leaks.length > 10) console.error(`  … et ${leaks.length - 10} de plus`)
  console.error(
    "\nLe contenu payant doit être servi depuis Firestore (src/lib/protectedContent.js),\n" +
      'jamais émis dans dist/. Vérifiez les import.meta.glob sur src/texts ou src/books.'
  )
  process.exit(1)
}

console.log(
  `✓ Aucun contenu réservé dans dist/ (${items.length} contenus vérifiés).`
)

// --- Non-régression SEO (SEO-8) ---------------------------------------------
// Pages prérendues vides, canonical faux, shell SPA manquant, sitemap
// incomplet : les régressions silencieuses que l'audit 2026-10 a trouvées.
const seoErrors = []
const seoWarnings = []

const MIN_WORDS_ERROR = 50 // en dessous : page quasi vide pour un robot sans JS
const MIN_WORDS_WARN = 150

function mainWords(html) {
  const m =
    html.match(/<main>([\s\S]*?)<\/main>/) ||
    html.match(/<div id="app">([\s\S]*?)<\/div>\s*<script/)
  const text = (m ? m[1] : '')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&\w+;/g, ' ')
  return text.split(/\s+/).filter(Boolean).length
}

// 1. Shell SPA (repli Caddy pour les routes sans page prérendue).
const spaPath = path.join(distDir, 'spa.html')
if (!existsSync(spaPath)) {
  seoErrors.push('dist/spa.html absent (repli SPA du Caddyfile)')
} else if (!/<div id="app"><\/div>/.test(readFileSync(spaPath, 'utf8'))) {
  seoErrors.push('dist/spa.html doit contenir un <div id="app"></div> vide')
}

// 2. Pages statiques indexables : fichier présent, non vide, canonical exact.
for (const route of ROUTES) {
  if (route.noindex) continue
  const slug = route.path === '/' ? 'index' : route.path.slice(1)
  const file = path.join(distDir, `${slug}.html`)
  if (!existsSync(file)) {
    seoErrors.push(`page prérendue absente : ${route.path}`)
    continue
  }
  const html = readFileSync(file, 'utf8')
  const words = mainWords(html)
  if (words < MIN_WORDS_ERROR) {
    seoErrors.push(`page quasi vide (${words} mots) : ${route.path}`)
  } else if (words < MIN_WORDS_WARN) {
    seoWarnings.push(`contenu mince (${words} mots) : ${route.path}`)
  }
}

// 3. Canonical de chaque page prérendue = son propre chemin.
let canonicalChecked = 0
for (const file of files) {
  if (!file.endsWith('.html')) continue
  const rel = path.relative(distDir, file).split(path.sep).join('/')
  if (rel === 'spa.html' || rel === '404.html') continue
  const expectedPath = rel === 'index.html' ? '/' : '/' + rel.replace(/\.html$/, '')
  const m = readFileSync(file, 'utf8').match(/<link rel="canonical" href="([^"]*)"/)
  canonicalChecked++
  if (!m) {
    seoErrors.push(`canonical manquant : ${rel}`)
  } else if (decodeURIComponent(m[1]) !== SITE_URL + expectedPath) {
    seoErrors.push(`canonical incorrect : ${rel} -> ${m[1]}`)
  }
}

// 4. Sitemap : lastmod partout, /dizionario présent.
const sitemapPath = path.join(distDir, 'sitemap.xml')
if (!existsSync(sitemapPath)) {
  seoErrors.push('dist/sitemap.xml absent')
} else {
  const sitemap = readFileSync(sitemapPath, 'utf8')
  const blocks = sitemap.match(/<url>[\s\S]*?<\/url>/g) || []
  const noLastmod = blocks.filter((b) => !/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(b))
  if (noLastmod.length) seoErrors.push(`${noLastmod.length} URL du sitemap sans <lastmod>`)
  if (!sitemap.includes(`<loc>${SITE_URL}/dizionario</loc>`)) {
    seoErrors.push('/dizionario absent du sitemap')
  }
  for (const b of blocks) {
    const loc = b.match(/<loc>([^<]*)<\/loc>/)?.[1] || ''
    const p = decodeURIComponent(loc.replace(SITE_URL, '')) || '/'
    const f = path.join(distDir, p === '/' ? 'index.html' : `${p.slice(1)}.html`)
    if (!existsSync(f)) {
      seoErrors.push(`URL du sitemap sans page prérendue : ${p}`)
      break
    }
  }
}

for (const w of seoWarnings) console.warn(`⚠ SEO : ${w}`)
if (seoErrors.length) {
  console.error(`✗ Régression SEO (${seoErrors.length}) :`)
  for (const e of seoErrors.slice(0, 15)) console.error(`  - ${e}`)
  if (seoErrors.length > 15) console.error(`  … et ${seoErrors.length - 15} de plus`)
  process.exit(1)
}
console.log(`✓ SEO : shell SPA, ${canonicalChecked} canonical, sitemap et pages non vides OK.`)
