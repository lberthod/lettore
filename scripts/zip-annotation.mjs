#!/usr/bin/env node
// Combine la liste exacte mots/phrases d'un chapitre (scripts/list-required.mjs)
// avec deux tableaux de traductions parallèles (même ordre, même longueur)
// en un fichier d'annotation prêt pour scripts/finalize-chapter.mjs.
//
// Usage :
//   node scripts/zip-annotation.mjs <required.json> <wordTranslations.json> <sentenceTranslations.json> <questions.json> <out.json>

import fs from 'node:fs'

const [reqFile, wtFile, stFile, qFile, outFile] = process.argv.slice(2)
if (!outFile) {
  console.error(
    'Usage : node scripts/zip-annotation.mjs <required.json> <wordTranslations.json> <sentenceTranslations.json> <questions.json> <out.json>'
  )
  process.exit(1)
}

const req = JSON.parse(fs.readFileSync(reqFile, 'utf8'))
const wt = JSON.parse(fs.readFileSync(wtFile, 'utf8'))
const st = JSON.parse(fs.readFileSync(stFile, 'utf8'))
const questions = JSON.parse(fs.readFileSync(qFile, 'utf8'))

if (wt.length !== req.words.length) {
  console.error(`✗ words length mismatch : ${wt.length} traductions pour ${req.words.length} mots requis`)
  process.exit(2)
}
if (st.length !== req.sentences.length) {
  console.error(`✗ sentences length mismatch : ${st.length} traductions pour ${req.sentences.length} phrases requises`)
  process.exit(2)
}

const words = req.words.map((it, i) => ({ it, fr: wt[i] }))
const sentences = req.sentences.map((it, i) => ({ it, fr: st[i] }))
fs.writeFileSync(outFile, JSON.stringify({ words, sentences, questions }, null, 2) + '\n')
console.log(`✓ ${words.length} mot(s), ${sentences.length} phrase(s) → ${outFile}`)
