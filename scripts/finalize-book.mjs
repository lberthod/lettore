#!/usr/bin/env node
// Reconstruit book.json + src/books/index.json à partir des chapitres déjà
// écrits sur disque (scripts/finalize-chapter.mjs). Complète
// scripts/orchestrate-book.mjs pour le flux "annotation par agent Claude Code"
// (pas d'appel API direct).
//
// Usage :
//   node scripts/finalize-book.mjs --book-id pinocchio --title "Le avventure di Pinocchio" \
//     --author "Carlo Collodi" --language it --level B1

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { countWords } from './lib/schema.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i]
}
const { 'book-id': bookId, title, author, language, level } = args
if (!bookId || !title || !author || !language || !level) {
  console.error(
    'Usage : node scripts/finalize-book.mjs --book-id <slug> --title "<titre>" --author "<auteur>" --language <it|fr> --level <A1..C2>'
  )
  process.exit(1)
}

const rawManifestFile = path.join(ROOT, 'sources/raw', bookId, 'manifest.json')
const rawManifest = JSON.parse(fs.readFileSync(rawManifestFile, 'utf8'))
const outDir = path.join(ROOT, 'src/books', bookId)

function chapterFile(num) {
  return path.join(outDir, `${bookId}-${num}.json`)
}

const chapters = rawManifest.chapters
  .filter((c) => fs.existsSync(chapterFile(c.id)))
  .map((c) => {
    const data = JSON.parse(fs.readFileSync(chapterFile(c.id), 'utf8'))
    return { id: c.id, title: data.title, wordCount: countWords(data.paragraphs) }
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
  chapters: chapters.map(({ id, title }) => ({ id, title })),
}
fs.writeFileSync(path.join(outDir, 'book.json'), JSON.stringify(book, null, 2) + '\n')

const indexFile = path.join(ROOT, 'src/books/index.json')
const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : []
const wordCount = chapters.reduce((n, c) => n + c.wordCount, 0)
const entry = {
  id: bookId,
  title,
  author,
  language,
  level,
  chapterCount: chapters.length,
  totalChapterCount: rawManifest.chapters.length,
  wordCount,
}
const existing = index.findIndex((b) => b.id === bookId)
if (existing >= 0) index[existing] = entry
else index.push(entry)
fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n')

console.log(
  `✓ book.json : ${chapters.length}/${rawManifest.chapters.length} chapitre(s) → ${path.relative(ROOT, outDir)}`
)
