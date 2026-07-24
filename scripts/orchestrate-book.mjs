#!/usr/bin/env node
// Annote tous les chapitres d'un livre déjà récupéré (scripts/fetch-book.mjs)
// et (re)génère son manifeste src/books/<book-id>/book.json + l'entrée
// src/books/index.json. Idempotent : ignore les chapitres déjà annotés,
// relançable à volonté (cron-friendly, comme generator/orchestrate*.mjs).
//
// Usage :
//   node scripts/orchestrate-book.mjs --book-id pinocchio --title "Le avventure di Pinocchio" \
//     --author "Carlo Collodi" --language it --level B1 [--limit 5] [--concurrency 2] [--force]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { annotateChapter, splitRawChapter } from './lib/annotate.mjs'
import { countWords } from './lib/schema.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = { limit: '5', concurrency: '1' }
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a === '--force') args.force = true
  else if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i]
}
const { 'book-id': bookId, title, author, language, level } = args
if (!bookId || !title || !author || !language || !level) {
  console.error(
    'Usage : node scripts/orchestrate-book.mjs --book-id <slug> --title "<titre>" --author "<auteur>" --language <it|fr> --level <A1..C2> [--limit n] [--concurrency n] [--force]'
  )
  process.exit(1)
}
const limit = Number(args.limit)
const concurrency = Math.max(1, Number(args.concurrency))

const rawDir = path.join(ROOT, 'sources/raw', bookId)
const manifestFile = path.join(rawDir, 'manifest.json')
if (!fs.existsSync(manifestFile)) {
  console.error(
    `Introuvable : ${path.relative(ROOT, manifestFile)} — lance d'abord scripts/fetch-book.mjs.`
  )
  process.exit(1)
}
const rawManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))

const outDir = path.join(ROOT, 'src/books', bookId)
fs.mkdirSync(outDir, { recursive: true })

function chapterFile(num) {
  return path.join(outDir, `${bookId}-${num}.json`)
}

const todo = rawManifest.chapters.filter((c) => args.force || !fs.existsSync(chapterFile(c.id)))
const queue = todo.slice(0, limit)
console.log(
  `${rawManifest.chapters.length} chapitre(s) au total, ${todo.length} à annoter, ${queue.length} dans ce lot (concurrence ${concurrency}).`
)

let cursor = 0
async function worker() {
  while (cursor < queue.length) {
    const chapter = queue[cursor++]
    const rawFile = path.join(rawDir, `chapitre-${chapter.id}.txt`)
    const { title: chapterTitle, paragraphs } = splitRawChapter(fs.readFileSync(rawFile, 'utf8'))
    if (!paragraphs.length) {
      console.warn(`  ⚠ chapitre ${chapter.id} vide après retrait du titre, ignoré`)
      continue
    }
    const id = `${bookId}-${chapter.id}`
    try {
      const chapterData = await annotateChapter({
        id,
        title: chapterTitle,
        paragraphs,
        log: (m) => console.log(`  [${chapter.id}] ${m}`),
      })
      fs.writeFileSync(chapterFile(chapter.id), JSON.stringify(chapterData, null, 2) + '\n')
      console.log(`  ✓ [${chapter.id}] « ${chapterTitle} » (${countWords(paragraphs)} mots)`)
    } catch (err) {
      console.error(`  ✗ [${chapter.id}] ${err.message}`)
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))

// Reconstruit book.json à partir de tous les chapitres déjà annotés sur disque
// (pas seulement ceux de ce lot) — cohérent même après plusieurs runs partiels.
const chapters = rawManifest.chapters
  .filter((c) => fs.existsSync(chapterFile(c.id)))
  .map((c) => {
    const data = JSON.parse(fs.readFileSync(chapterFile(c.id), 'utf8'))
    return { id: c.id, title: data.title }
  })

const book = {
  id: bookId,
  title,
  author,
  language,
  level,
  levelNote: 'Niveau indicatif — texte authentique non simplifié',
  source: {
    provider: 'Wikisource',
    pageTitle: rawManifest.page,
    retrievedAt: rawManifest.retrievedAt,
  },
  chapters,
}
fs.writeFileSync(path.join(outDir, 'book.json'), JSON.stringify(book, null, 2) + '\n')

// Index léger des livres, séparé de src/texts/index.json (concept différent :
// voir LETTORE_EBOOK.md §4).
const indexFile = path.join(ROOT, 'src/books/index.json')
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : []
const wordCount = chapters.reduce((n, c) => {
  const data = JSON.parse(fs.readFileSync(chapterFile(c.id), 'utf8'))
  return n + countWords(data.paragraphs)
}, 0)
const entry = { id: bookId, title, author, language, level, chapterCount: chapters.length, totalChapterCount: rawManifest.chapters.length, wordCount }
const existing = index.findIndex((b) => b.id === bookId)
if (existing >= 0) index[existing] = entry
else index.push(entry)
fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n')

console.log(
  `✓ book.json : ${chapters.length}/${rawManifest.chapters.length} chapitre(s) annoté(s) → ${path.relative(ROOT, outDir)}`
)
if (chapters.length < rawManifest.chapters.length) {
  console.log(`  Relance la commande pour continuer (${rawManifest.chapters.length - chapters.length} restant(s)).`)
}
