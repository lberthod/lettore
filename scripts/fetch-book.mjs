#!/usr/bin/env node
// Récupère une œuvre du domaine public sur Wikisource, chapitre par chapitre,
// et écrit du texte brut nettoyé dans sources/raw/<book-id>/.
//
// Usage :
//   node scripts/fetch-book.mjs --site it --page "Le avventure di Pinocchio" --book-id pinocchio
//
// Options :
//   --site <it|fr>     wikisource visé (obligatoire)
//   --page <titre>     titre de la page racine de l'œuvre, sans les sous-pages (obligatoire)
//   --book-id <slug>   identifiant du livre, dossier de sortie sources/raw/<book-id>/ (obligatoire)
//   --prefix <texte>   préfixe des sous-pages si différent de --page (ex. "Capitolo", "Chapitre")
//   --pages "a,b,c"    liste explicite de sous-pages (relatives à --page), DANS L'ORDRE voulu —
//                      remplace la découverte par préfixe. Nécessaire quand les sous-pages
//                      utilisent des chiffres romains (ex. "Capitolo XV") que le tri
//                      numérique automatique ne sait pas ordonner, ou pour une sélection
//                      curée (quelques chants/chapitres, pas l'œuvre entière).
//   --single           --page EST la page à récupérer (pas de sous-pages) — œuvre courte
//                      tenant sur une seule page (ex. une nouvelle).
//
// Ne touche à rien dans src/ : sortie uniquement dans sources/raw/, à relire
// avant de passer à scripts/annotate-chapter.mjs.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const BOOLEAN_FLAGS = new Set(['single', 'strip-verse-numbers'])
const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (!a.startsWith('--')) continue
  const key = a.slice(2)
  args[key] = BOOLEAN_FLAGS.has(key) ? true : process.argv[++i]
}
const { site, page, 'book-id': bookId } = args
if (!site || !page || !bookId || !['it', 'fr'].includes(site)) {
  console.error(
    'Usage : node scripts/fetch-book.mjs --site <it|fr> --page "<Titre racine>" --book-id <slug> [--prefix <texte>]'
  )
  process.exit(1)
}

const API = `https://${site}.wikisource.org/w/api.php`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function apiGet(params, retries = 6) {
  const url = new URL(API)
  for (const [k, v] of Object.entries({ format: 'json', formatversion: 2, ...params })) {
    url.searchParams.set(k, v)
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'leggendo-book-import/1.0 (contact: app admin)' } })
    if (res.status === 429 && attempt < retries) {
      const wait = 3000 * 2 ** attempt
      console.log(`  … 429, nouvelle tentative dans ${wait}ms`)
      await sleep(wait)
      continue
    }
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
    return res.json()
  }
}

// Trie "Capitolo 2" avant "Capitolo 10" (l'API retourne l'ordre alphabétique).
function chapterNumber(title) {
  const m = title.match(/(\d+)\s*$/)
  return m ? Number(m[1]) : Infinity
}

async function listChapters() {
  if (args.single) return [page]
  if (args.pages) return args.pages.split(',').map((p) => `${page}/${p.trim()}`)

  const prefix = args.prefix ? `${page}/${args.prefix}` : `${page}/`
  const chapters = []
  let apcontinue
  do {
    const data = await apiGet({
      action: 'query',
      list: 'allpages',
      apprefix: prefix,
      apnamespace: 0,
      aplimit: 'max',
      ...(apcontinue ? { apcontinue } : {}),
    })
    chapters.push(...data.query.allpages.map((p) => p.title))
    apcontinue = data.continue?.apcontinue
  } while (apcontinue)
  chapters.sort((a, b) => chapterNumber(a) - chapterNumber(b))
  return chapters
}

// Retire les blocs <tagName ...>...</tagName> dont la balise ouvrante vérifie
// `isTarget`, en respectant l'imbrication (ex. figures d'illustration avec
// légende imbriquée, blocs de métadonnées cachés) — un simple regex non-gourmand
// coupe au premier tag fermant rencontré, y compris ceux d'un enfant imbriqué,
// ce qui tronque et recolle le texte de façon incohérente.
function stripBalanced(html, tagName, isTarget) {
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, 'g')
  let out = ''
  let i = 0
  while (i < html.length) {
    openRe.lastIndex = i
    const m = openRe.exec(html)
    if (!m) {
      out += html.slice(i)
      break
    }
    if (!isTarget(m[0])) {
      out += html.slice(i, m.index + m[0].length)
      i = m.index + m[0].length
      continue
    }
    out += html.slice(i, m.index)
    let depth = 1
    let j = m.index + m[0].length
    const closeTag = `</${tagName}>`
    while (depth > 0 && j < html.length) {
      openRe.lastIndex = j
      const nextOpen = openRe.exec(html)
      const nextClose = html.indexOf(closeTag, j)
      if (nextClose === -1) {
        j = html.length
        break
      }
      if (nextOpen && nextOpen.index < nextClose) {
        depth++
        j = nextOpen.index + nextOpen[0].length
      } else {
        depth--
        j = nextClose + closeTag.length
      }
    }
    i = j
  }
  return out
}

// Nettoyage HTML → texte brut : on retire les blocs non-prose (métadonnées
// Dublin Core cachées, figures d'illustration flottantes avec légende,
// scripts/styles/tables), puis on ne garde que les <p> du corps du texte,
// en décodant les entités HTML et en retirant les marqueurs de pagination du
// mode "page à page" Wikisource ("[p. 6 modifica]").
function htmlToParagraphs(html) {
  let cleaned = html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<table[\s\S]*?<\/table>/g, '')
  cleaned = stripBalanced(cleaned, 'div', (tag) => /style="[^"]*display:\s*none/.test(tag))
  cleaned = stripBalanced(
    cleaned,
    'span',
    (tag) => /(?:class|id)="[^"]*(?:mySpan\d|floatnone|floatingCenter|newFreedImg|freedImg)/.test(tag)
  )

  const paragraphs = []
  const pRegex = /<p>([\s\S]*?)<\/p>/g
  let match
  while ((match = pRegex.exec(cleaned))) {
    const raw = match[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&#160;|&nbsp;/g, ' ')
      .replace(/&#32;/g, ' ')
      .replace(/&#95;/g, '_')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#x25ba;|&#9658;/g, '')
      .replace(/\[p\.\s*[ivxlcdm\d]+\s*modifica\]/gi, '')
    // Certaines pages (ex. Le novelle della nonna) mettent tout un récit dans
    // un seul <p>, les paragraphes/répliques n'étant séparés que par des
    // retours à la ligne littéraux (\n) plutôt que par des balises <p>
    // distinctes — on les traite donc comme des ruptures de paragraphe.
    for (const line of raw.split('\n')) {
      const text = line.replace(/\s+/g, ' ').trim()
      if (text) paragraphs.push(text)
    }
  }
  return paragraphs
}

// Le premier paragraphe est souvent un simple numéro/chiffre romain de
// chapitre (ex. "I.", "CAPITOLO XV.", "CHAPITRE III") — bruit, pas du
// contenu ; le vrai titre (s'il existe) devient alors le premier paragraphe.
function dropChapterNumeral(paragraphs) {
  if (
    paragraphs.length &&
    /^([IVXLCDM]{1,6}\.?|(CAPITOLO|CHAPITRE)\s+[IVXLCDM]{1,6}\.?)$/i.test(paragraphs[0])
  ) {
    return paragraphs.slice(1)
  }
  return paragraphs
}

// Éditions versifiées (ex. Divina Commedia) : chaque tercet porte un numéro
// de vers en fin de ligne ("...la paura! 6") — bruit typographique, pas du
// texte du poème.
function stripVerseNumbers(paragraphs) {
  return paragraphs.map((p) => p.replace(/\s+\d{1,4}$/, ''))
}

async function fetchChapter(title) {
  const data = await apiGet({ action: 'parse', page: title, prop: 'text' })
  let paragraphs = dropChapterNumeral(htmlToParagraphs(data.parse.text))
  if (args['strip-verse-numbers']) paragraphs = stripVerseNumbers(paragraphs)
  return paragraphs
}

console.log(`Récupération de « ${page} » (${site}.wikisource.org)…`)
const chapters = await listChapters()
if (!chapters.length) {
  console.error('Aucun chapitre trouvé — vérifie --page / --prefix.')
  process.exit(1)
}
console.log(`${chapters.length} chapitre(s) trouvé(s).`)

const outDir = path.join(ROOT, 'sources/raw', bookId)
fs.mkdirSync(outDir, { recursive: true })

const manifest = []
for (const [i, title] of chapters.entries()) {
  if (i > 0) await sleep(1500)
  const paragraphs = await fetchChapter(title)
  const num = String(i + 1).padStart(2, '0')
  const file = path.join(outDir, `chapitre-${num}.txt`)
  fs.writeFileSync(file, paragraphs.join('\n\n') + '\n')
  const wordCount = paragraphs.join(' ').split(/\s+/).filter(Boolean).length
  console.log(`  ${num}. ${title} — ${paragraphs.length} paragraphe(s), ~${wordCount} mots`)
  manifest.push({ id: num, wikisourceTitle: title, chapterTitle: paragraphs[0] ?? '', wordCount })
}

fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  JSON.stringify({ site, page, bookId, retrievedAt: new Date().toISOString().slice(0, 10), chapters: manifest }, null, 2) + '\n'
)
console.log(`✓ ${chapters.length} chapitre(s) → sources/raw/${bookId}/`)
