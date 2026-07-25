#!/usr/bin/env node
// Fusionne les lots générés par agents (scripts/data/batches/*.json) dans le
// dataset servi par le frontend (src/dictionary/). Purement déterministe,
// aucun appel LLM ici — signale les collisions (même lemme redéfini deux
// fois différemment) au lieu de les écraser silencieusement.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const BATCH_DIR = path.join(ROOT, 'scripts', 'data', 'batches')
const DICT_DIR = path.join(ROOT, 'src', 'dictionary')

const SKIPPED_PATH = path.join(ROOT, 'scripts', 'data', 'skipped-words.json')

const lemmas = JSON.parse(readFileSync(path.join(DICT_DIR, 'lemmas.json'), 'utf8'))
const conjugations = JSON.parse(readFileSync(path.join(DICT_DIR, 'conjugations.json'), 'utf8'))
const wordIndex = JSON.parse(readFileSync(path.join(DICT_DIR, 'word-index.json'), 'utf8'))
// Mots explicitement écartés (noms propres, bruit OCR...) par un lot
// précédent — à exclure des futurs lots, sinon ils reviennent à l'infini
// puisqu'ils ne rejoignent jamais word-index.json.
const skippedWords = new Set(existsSync(SKIPPED_PATH) ? JSON.parse(readFileSync(SKIPPED_PATH, 'utf8')) : [])

const batchFiles = readdirSync(BATCH_DIR)
  .filter((f) => /^phase\d+-chunk-\d+\.json$/.test(f))
  .sort()

let addedLemmas = 0
let updatedLemmas = 0
let addedConjugations = 0
let addedWordIndex = 0
let conflicts = 0
let skippedTotal = 0

for (const file of batchFiles) {
  const data = JSON.parse(readFileSync(path.join(BATCH_DIR, file), 'utf8'))

  for (const entry of data.lemmas ?? []) {
    if (!entry?.lemma) continue
    if (lemmas[entry.lemma]) {
      updatedLemmas++ // déjà connu (ex. verbe fréquent réintroduit par un autre lot) : on garde la version existante
      continue
    }
    lemmas[entry.lemma] = entry
    addedLemmas++
  }

  for (const [lemma, table] of Object.entries(data.conjugations ?? {})) {
    if (conjugations[lemma]) continue
    conjugations[lemma] = table
    addedConjugations++
  }

  for (const [form, lemma] of Object.entries(data.wordIndex ?? {})) {
    if (wordIndex[form] && wordIndex[form] !== lemma) {
      console.warn(`  ⚠ conflit sur "${form}" : "${wordIndex[form]}" (existant) vs "${lemma}" (${file})`)
      conflicts++
      continue
    }
    if (!wordIndex[form]) addedWordIndex++
    wordIndex[form] = lemma
  }

  for (const raw of data.skipped ?? []) {
    // Format attendu : "motSkippé — raison" (le séparateur peut varier légèrement) ;
    // on ne garde que le mot pour l'exclusion des futurs lots.
    const word = String(raw).split(/\s*[—-]\s/)[0].trim().toLowerCase()
    if (word) skippedWords.add(word)
  }
  skippedTotal += (data.skipped ?? []).length
}

// Applique les contractions article+préposition notées par prepare-batch.mjs
// (ex. "all'affidamento" -> mot de base "affidamento" envoyé à l'agent) :
// une fois le mot de base résolu ci-dessus, on relie la forme contractée au
// même lemme sans avoir dépensé d'appel agent pour elle.
const contractionFiles = readdirSync(BATCH_DIR).filter((f) => /^phase\d+-contractions\.json$/.test(f))
let resolvedContractions = 0
let unresolvedContractions = 0
for (const file of contractionFiles) {
  const map = JSON.parse(readFileSync(path.join(BATCH_DIR, file), 'utf8'))
  for (const [form, base] of Object.entries(map)) {
    if (wordIndex[form]) continue
    if (wordIndex[base]) {
      wordIndex[form] = wordIndex[base]
      resolvedContractions++
    } else if (skippedWords.has(base)) {
      skippedWords.add(form)
    } else {
      unresolvedContractions++ // le mot de base n'a pas encore été traité (lot suivant)
    }
  }
}

// Filet de sécurité : un lot peut indexer les formes fléchies d'un lemme
// sans jamais mapper le lemme lui-même (ex. "abbagliante" -> seul "abbaglianti"
// est indexé). Sans cette entrée, la recherche exacte et la fiche du mot
// échouent silencieusement. On complète, sans écraser un mapping existant
// (le lemme peut aussi être la forme fléchie d'un autre mot).
let selfMapped = 0
for (const lemma of Object.keys(lemmas)) {
  if (!wordIndex[lemma]) {
    wordIndex[lemma] = lemma
    selfMapped++
  }
}

writeFileSync(path.join(DICT_DIR, 'lemmas.json'), JSON.stringify(lemmas, null, 2) + '\n')
writeFileSync(path.join(DICT_DIR, 'conjugations.json'), JSON.stringify(conjugations, null, 2) + '\n')
writeFileSync(path.join(DICT_DIR, 'word-index.json'), JSON.stringify(wordIndex, null, 2) + '\n')
writeFileSync(SKIPPED_PATH, JSON.stringify([...skippedWords].sort(), null, 2) + '\n')

console.log(`Lots fusionnés : ${batchFiles.length}`)
console.log(`Lemmes ajoutés : ${addedLemmas} (doublons ignorés : ${updatedLemmas})`)
console.log(`Conjugaisons ajoutées : ${addedConjugations}`)
console.log(`Entrées word-index ajoutées : ${addedWordIndex} (conflits : ${conflicts})`)
console.log(`Formes ignorées (bruit) dans les lots : ${skippedTotal} (${skippedWords.size} mots exclus au total, cumulés)`)
console.log(`Contractions résolues après coup : ${resolvedContractions} (en attente d'un lot futur : ${unresolvedContractions})`)
console.log(`Lemmes auto-mappés sur eux-mêmes (filet de sécurité) : ${selfMapped}`)
console.log(`Total actuel : ${Object.keys(lemmas).length} lemmes, ${Object.keys(conjugations).length} conjugaisons, ${Object.keys(wordIndex).length} formes indexées`)
