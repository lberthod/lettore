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
import {
  ROOT,
  lockedContent,
  chapterDocId,
  loadTextsIndex,
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
const blob = files
  .filter((f) => /\.(js|html|css|json|txt)$/.test(f))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')

const leaks = []
const unverifiable = []

for (const item of items) {
  const nameLeak = [...assetNames].find((name) =>
    new RegExp(`^${item.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-[A-Za-z0-9_-]+\\.js$`).test(name)
  )
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
