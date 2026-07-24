#!/usr/bin/env node
// Annote UN chapitre déjà récupéré (voir scripts/fetch-book.mjs) : lexique,
// phrases traduites, quiz — via l'API Claude, sans jamais modifier le texte
// source. Écrit src/books/<book-id>/<book-id>-<NN>.json.
//
// Usage :
//   node scripts/annotate-chapter.mjs --book-id pinocchio --chapter 01

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { annotateChapter, splitRawChapter } from './lib/annotate.mjs'
import { countWords } from './lib/schema.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i]
}
const { 'book-id': bookId, chapter } = args
if (!bookId || !chapter) {
  console.error(
    'Usage : node scripts/annotate-chapter.mjs --book-id <slug> --chapter <NN> [--title "..."]'
  )
  process.exit(1)
}

const rawFile = path.join(ROOT, 'sources/raw', bookId, `chapitre-${chapter}.txt`)
if (!fs.existsSync(rawFile)) {
  console.error(
    `Introuvable : ${path.relative(ROOT, rawFile)} — lance d'abord scripts/fetch-book.mjs.`
  )
  process.exit(1)
}

const { title: parsedTitle, paragraphs } = splitRawChapter(fs.readFileSync(rawFile, 'utf8'))
const title = args.title || parsedTitle
if (!paragraphs.length) {
  console.error('Chapitre vide après retrait du titre.')
  process.exit(1)
}

const id = `${bookId}-${chapter}`
const chapterData = await annotateChapter({ id, title, paragraphs })

const outDir = path.join(ROOT, 'src/books', bookId)
fs.mkdirSync(outDir, { recursive: true })
const file = path.join(outDir, `${id}.json`)
fs.writeFileSync(file, JSON.stringify(chapterData, null, 2) + '\n')
console.log(
  `✓ « ${title} » (${countWords(paragraphs)} mots) → ${path.relative(ROOT, file)}`
)
