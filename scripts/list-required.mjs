#!/usr/bin/env node
// Liste les mots et phrases EXACTS qu'un chapitre exige (mêmes découpages que
// ReaderView/translate.js) — à fournir tels quels à l'agent d'annotation pour
// qu'il n'ait qu'à traduire, sans jamais avoir à deviner un découpage
// (source des désaccords "unmatchedSentences" sinon, voir book-schema.mjs).
//
// Usage :
//   node scripts/list-required.mjs --book-id pinocchio --chapter 01

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitSentences, tokenizeWords, normalizeWord } from './lib/schema.mjs'
import { splitRawChapter } from './lib/annotate.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i]
}
const { 'book-id': bookId, chapter } = args
if (!bookId || !chapter) {
  console.error('Usage : node scripts/list-required.mjs --book-id <slug> --chapter <NN>')
  process.exit(1)
}

const rawFile = path.join(ROOT, 'sources/raw', bookId, `chapitre-${chapter}.txt`)
const { title, paragraphs } = splitRawChapter(fs.readFileSync(rawFile, 'utf8'))

const sentences = []
const seenWords = new Set()
const words = []
for (const p of paragraphs) {
  for (const s of splitSentences(p)) {
    sentences.push(s)
    for (const token of tokenizeWords(s)) {
      const key = normalizeWord(token)
      if (!seenWords.has(key)) {
        seenWords.add(key)
        words.push(token)
      }
    }
  }
}

console.log(JSON.stringify({ title, paragraphCount: paragraphs.length, words, sentences }, null, 2))
