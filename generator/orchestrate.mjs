#!/usr/bin/env node
// Orchestrateur : garantit 1 texte par (catégorie × niveau × taille).
//
// Il lit le catalogue existant (index.json), calcule les cases manquantes de
// la matrice, puis génère les textes manquants via l'API GLM. Idempotent :
// on peut le relancer autant de fois qu'on veut (cron sur le VPS), il ne
// génère que ce qui manque.
//
// Usage :
//   node generator/orchestrate.mjs                    # génère 5 textes manquants
//   node generator/orchestrate.mjs --limit 20         # en génère 20
//   node generator/orchestrate.mjs --all               # remplit toute la matrice
//   node generator/orchestrate.mjs --dry-run           # montre le plan sans rien générer
//   node generator/orchestrate.mjs --category cucina --level A1 --size molto_lungo
//   node generator/orchestrate.mjs --concurrency 3
//
// Prérequis : export GLM_API_KEY=...

import fs from 'node:fs'
import path from 'node:path'
import {
  LEVELS,
  SIZES,
  CATEGORIES,
  TEXTS_DIR,
  STATE_FILE,
  MODEL,
  sizeForWordCount,
} from './config.mjs'
import { proposeTopic, generateText, writeText } from './lib/generate.mjs'

// --- Arguments ---
const args = { limit: 5, concurrency: 2 }
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a === '--dry-run') args.dryRun = true
  else if (a === '--all') args.all = true
  else if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i]
}
const limit = args.all ? Infinity : Number(args.limit)
const concurrency = Math.max(1, Number(args.concurrency) || 1)

const comboKey = (c, l, s) => `${c}|${l}|${s}`

// --- Catalogue existant ---
const indexFile = path.join(TEXTS_DIR, 'index.json')
const index = fs.existsSync(indexFile)
  ? JSON.parse(fs.readFileSync(indexFile, 'utf8'))
  : []

const covered = new Set()
for (const entry of index) {
  if (!entry.category) continue
  const size = entry.size || sizeForWordCount(entry.wordCount ?? 0)
  if (size) covered.add(comboKey(entry.category, entry.level, size))
}
const existingIds = new Set(index.map((t) => t.id))
const titlesByCategory = new Map()
for (const entry of index) {
  if (!entry.category) continue
  if (!titlesByCategory.has(entry.category)) titlesByCategory.set(entry.category, [])
  titlesByCategory.get(entry.category).push(entry.title)
}

// --- État (journal des runs, échecs compris) ---
let state = { done: {}, failed: {} }
if (fs.existsSync(STATE_FILE)) {
  state = { done: {}, failed: {}, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }
}
const saveState = () =>
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n')

// --- Plan : cases manquantes de la matrice ---
const missing = []
for (const category of CATEGORIES) {
  if (args.category && category.id !== args.category) continue
  for (const level of LEVELS) {
    if (args.level && level !== args.level) continue
    for (const size of SIZES) {
      if (args.size && size.id !== args.size) continue
      if (!covered.has(comboKey(category.id, level, size.id))) {
        missing.push({ category, level, size })
      }
    }
  }
}

// Les cases jamais tentées d'abord, puis les échecs (les moins retentés en premier).
missing.sort((a, b) => {
  const fa = state.failed[comboKey(a.category.id, a.level, a.size.id)]?.attempts ?? 0
  const fb = state.failed[comboKey(b.category.id, b.level, b.size.id)]?.attempts ?? 0
  return fa - fb
})

const total = CATEGORIES.length * LEVELS.length * SIZES.length
console.log(
  `Matrice : ${total} cases (${CATEGORIES.length} catégories × ${LEVELS.length} niveaux × ${SIZES.length} tailles)`
)
console.log(`Couvertes : ${total - missing.length} — manquantes : ${missing.length}`)

const batch = missing.slice(0, limit)
if (!batch.length) {
  console.log('✓ Rien à générer.')
  process.exit(0)
}

console.log(`\nÀ générer dans ce run (${batch.length}, modèle ${MODEL}) :`)
for (const { category, level, size } of batch) {
  console.log(`  - ${category.id} × ${level} × ${size.id} (~${size.words} mots)`)
}
if (args.dryRun) {
  console.log('\n(dry-run : rien n’a été généré)')
  process.exit(0)
}

if (!process.env.GLM_API_KEY) {
  console.error('✗ GLM_API_KEY manquante (export GLM_API_KEY=...).')
  process.exit(1)
}

// --- Génération, avec un petit pool de workers ---
function uniqueSlug(slug) {
  let id = slug
  let n = 2
  while (existingIds.has(id)) id = `${slug}_${n++}`
  existingIds.add(id)
  return id
}

let ok = 0
let ko = 0

async function processCombo({ category, level, size }) {
  const key = comboKey(category.id, level, size.id)
  const label = `${category.id} × ${level} × ${size.id}`
  try {
    console.log(`\n▶ ${label} : choix du sujet…`)
    const { slug, topic } = await proposeTopic({
      category,
      level,
      size,
      existingTitles: titlesByCategory.get(category.id) ?? [],
    })
    const id = uniqueSlug(slug)
    console.log(`▶ ${label} : « ${topic} » (id: ${id}) — génération…`)
    const textData = await generateText({
      id,
      level,
      topic,
      targetWords: size.words,
      sizeId: size.id,
      categoryId: category.id,
    })
    const { file, wordCount } = writeText(textData)
    titlesByCategory.set(category.id, [
      ...(titlesByCategory.get(category.id) ?? []),
      textData.title,
    ])
    state.done[key] = { id, wordCount, at: new Date().toISOString() }
    delete state.failed[key]
    saveState()
    ok++
    console.log(`✓ ${label} : « ${textData.title} » (${wordCount} mots) → ${file}`)
  } catch (err) {
    ko++
    const prev = state.failed[key]?.attempts ?? 0
    state.failed[key] = {
      attempts: prev + 1,
      error: String(err.message || err),
      at: new Date().toISOString(),
    }
    saveState()
    console.error(`✗ ${label} : ${err.message}`)
  }
}

const queue = [...batch]
await Promise.all(
  Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await processCombo(queue.shift())
  })
)

console.log(`\nTerminé : ${ok} généré(s), ${ko} échec(s).`)
if (ko) {
  console.log('Relancez le script pour retenter les échecs (voir generator/state.json).')
  process.exitCode = 1
}
