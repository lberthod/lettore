#!/usr/bin/env node
// Prépare le prochain lot de mots à envoyer aux agents : exclut ce qui est
// déjà résolu (word-index) ou explicitement écarté (skipped-words), et
// résout localement (sans agent) les formes contractées article+préposition
// (ex. "all'affidamento" -> "affidamento") quand le mot de base est déjà
// connu — sinon substitue le mot de base dans le lot et note la contraction
// pour la résoudre après la fusion (voir merge-dictionary-batches.mjs).
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadShardedDictionary, writeWordIndexShards } from './dictionary-shards.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const BATCH_DIR = path.join(ROOT, 'scripts', 'data', 'batches')

const phase = process.argv[2]
const BATCH_SIZE = Number(process.argv[3] ?? 20)
const N_CHUNKS = Number(process.argv[4] ?? 10)
if (!phase) {
  console.error('Usage: node scripts/prepare-batch.mjs <phaseName> [batchSize=20] [nChunks=10]')
  process.exit(1)
}

const CONTRACTION_RE = /^(all|dell|nell|sull|dall|coll|quell|degli|dagli|negli|agli|sugli|sull|nient|sant|bell|quest|un|l|d|gl)'(.+)$/

const allWords = JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'data', 'dictionary-words.json'), 'utf8')).map((w) => w.word)
const { wordIndex } = loadShardedDictionary()
let skipped
try {
  skipped = new Set(JSON.parse(readFileSync(path.join(ROOT, 'scripts', 'data', 'skipped-words.json'), 'utf8')))
} catch {
  skipped = new Set()
}

const filtered = allWords.filter((w) => !/^\d+$/.test(w))
let resolvedNow = 0

const remaining = []
for (const w of filtered) {
  if (wordIndex[w] || skipped.has(w)) continue
  const m = w.match(CONTRACTION_RE)
  if (m) {
    const base = m[2]
    if (wordIndex[base]) {
      // Le mot de base est déjà résolu : on peut résoudre tout de suite,
      // sans agent.
      wordIndex[w] = wordIndex[base]
      resolvedNow++
      continue
    }
  }
  remaining.push(w)
}

if (resolvedNow > 0) {
  writeWordIndexShards(wordIndex)
}

console.log(`Mots restants (bruts) : ${filtered.length - Object.keys(wordIndex).length - skipped.size + resolvedNow}`)
console.log(`Contractions résolues localement (sans agent) : ${resolvedNow}`)
console.log(`Mots à traiter : ${remaining.length}`)

// Deuxième passe sur le lot retenu : substitue les formes contractées
// restantes par leur mot de base (dédupliqué), et note la correspondance
// pour la ré-appliquer après la génération de ce lot.
const seen = new Set()
const targetWords = []
const contractions = {} // forme contractée -> mot de base envoyé à l'agent
for (const w of remaining.slice(0, BATCH_SIZE * N_CHUNKS)) {
  const m = w.match(CONTRACTION_RE)
  const target = m ? m[2] : w
  if (m) contractions[w] = target
  if (seen.has(target)) continue
  seen.add(target)
  targetWords.push(target)
}

const chunks = []
for (let i = 0; i < N_CHUNKS; i++) {
  const chunk = targetWords.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
  if (chunk.length) chunks.push(chunk)
}

writeFileSync(path.join(BATCH_DIR, `${phase}-input.json`), JSON.stringify(chunks, null, 2) + '\n')
writeFileSync(path.join(BATCH_DIR, `${phase}-contractions.json`), JSON.stringify(contractions, null, 2) + '\n')

console.log(`Lot "${phase}" : ${chunks.length} chunks, ${targetWords.length} mots uniques (dont ${Object.keys(contractions).length} contractions substituées)`)
console.log(JSON.stringify(chunks))
