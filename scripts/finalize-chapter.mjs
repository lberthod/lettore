#!/usr/bin/env node
// Valide et écrit un chapitre annoté par un agent Claude Code (au lieu de
// l'API Anthropic directe, voir scripts/annotate-chapter.mjs) : lit le texte
// brut (sources/raw/<book-id>/chapitre-<NN>.txt) + une annotation JSON
// { words: [{it,fr}], sentences: [{it,fr}], questions: [...] } fournie sur
// disque, vérifie la couverture lexicale totale, et écrit
// src/books/<book-id>/<book-id>-<NN>.json si tout est couvert.
//
// En cas de couverture incomplète, n'écrit rien et imprime les mots/phrases
// manquants (JSON sur stdout) pour permettre une passe de réparation.
//
// Usage :
//   node scripts/finalize-chapter.mjs --book-id pinocchio --chapter 01 --annotation /tmp/ann-01.json [--force]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeWord, validateCoverage, countWords } from './lib/schema.mjs'
import { splitRawChapter } from './lib/annotate.mjs'
import { remapSentences } from './lib/book-schema.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a === '--force') args.force = true
  else if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i]
}
const { 'book-id': bookId, chapter, annotation } = args
if (!bookId || !chapter || !annotation) {
  console.error(
    'Usage : node scripts/finalize-chapter.mjs --book-id <slug> --chapter <NN> --annotation <fichier.json> [--force]'
  )
  process.exit(1)
}

const rawFile = path.join(ROOT, 'sources/raw', bookId, `chapitre-${chapter}.txt`)
const { title: parsedTitle, paragraphs } = splitRawChapter(fs.readFileSync(rawFile, 'utf8'))
const title = args.title || parsedTitle

const ann = JSON.parse(fs.readFileSync(annotation, 'utf8'))
const words = {}
for (const { it, fr } of ann.words) words[normalizeWord(it)] = fr
const { sentences, unmatched } = remapSentences(paragraphs, ann.sentences)

const chapterData = { id: `${bookId}-${chapter}`, title, paragraphs, words, sentences, questions: ann.questions }

const { missingWords, missingSentences } = validateCoverage(chapterData)
if ((missingWords.length || missingSentences.length || unmatched.length) && !args.force) {
  console.log(JSON.stringify({ ok: false, missingWords, missingSentences, unmatchedSentences: unmatched }, null, 2))
  process.exit(2)
}

const outDir = path.join(ROOT, 'src/books', bookId)
fs.mkdirSync(outDir, { recursive: true })
const file = path.join(outDir, `${bookId}-${chapter}.json`)
fs.writeFileSync(file, JSON.stringify(chapterData, null, 2) + '\n')
console.log(
  JSON.stringify(
    {
      ok: true,
      file: path.relative(ROOT, file),
      wordCount: countWords(paragraphs),
      forced: !!args.force && (missingWords.length > 0 || missingSentences.length > 0),
      missingWords,
      missingSentences,
    },
    null,
    2
  )
)
