#!/usr/bin/env node
// Orchestrateur « matrice genre × thème » — basé sur src/texts/category.json
// (voir ANALYSE_CATEGORIES.md). Contrairement à orchestrate.mjs (1 texte par
// thème × niveau × taille, tous en genre "récit"), ce script parcourt la
// liste curée `curatedMatrix` de category.json et garantit, pour chaque
// combinaison genre × thème retenue : 1 texte par niveau × par taille.
//
// Par défaut : niveaux A1, A2, B1, B2 (C1 exclu) × tailles court, moyen, long
// (molto_lungo exclu) — ajustable en ligne de commande.
//
// Usage :
//   node generator/orchestrate-matrix.mjs --dry-run --all       # voir le plan
//   node generator/orchestrate-matrix.mjs                       # génère 5 textes manquants
//   node generator/orchestrate-matrix.mjs --all --concurrency 3 # remplit toute la matrice curée
//   node generator/orchestrate-matrix.mjs --genre dialogo       # une seule ligne de la matrice
//   node generator/orchestrate-matrix.mjs --priority 1          # seulement la phase 1
//   node generator/orchestrate-matrix.mjs --levels A1,A2 --sizes corto,medio
//
// Prérequis : export GLM_API_KEY=...

import fs from 'node:fs'
import path from 'node:path'
import { TEXTS_DIR, STATE_FILE, MODEL } from './config.mjs'
import { loadCategoryData, expandMatrix } from './lib/category.mjs'
import { proposeTopic, generateText, writeText } from './lib/generate.mjs'

const DEFAULT_LEVELS = ['A1', 'A2', 'B1', 'B2']
const DEFAULT_SIZES = ['corto', 'medio', 'lungo']

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
const levels = (args.levels ? args.levels.split(',') : DEFAULT_LEVELS).map((s) => s.trim())
const sizes = (args.sizes ? args.sizes.split(',') : DEFAULT_SIZES).map((s) => s.trim())
const maxPriority = args.priority ? Number(args.priority) : undefined

const cellKey = (genreId, themeId, level, sizeId) => `${genreId}|${themeId}|${level}|${sizeId}`

// --- Taxonomie ---
const catData = loadCategoryData()
const plan = expandMatrix(catData, {
  levels,
  sizes,
  genre: args.genre,
  theme: args.theme,
  maxPriority,
})
if (!plan.length) {
  console.error(
    'Aucune cellule à traiter — vérifie --genre/--theme/--priority/--levels/--sizes et curatedMatrix dans category.json.'
  )
  process.exit(1)
}

// --- Catalogue existant ---
const indexFile = path.join(TEXTS_DIR, 'index.json')
const index = fs.existsSync(indexFile)
  ? JSON.parse(fs.readFileSync(indexFile, 'utf8'))
  : []

const covered = new Set()
for (const entry of index) {
  if (!entry.genre || !entry.category || !entry.size) continue
  covered.add(cellKey(entry.genre, entry.category, entry.level, entry.size))
}
const existingIds = new Set(index.map((t) => t.id))
const titlesByTheme = new Map()
for (const entry of index) {
  if (!entry.category) continue
  if (!titlesByTheme.has(entry.category)) titlesByTheme.set(entry.category, [])
  titlesByTheme.get(entry.category).push(entry.title)
}

// --- État (journal des runs, échecs compris) ---
let state = { done: {}, failed: {} }
if (fs.existsSync(STATE_FILE)) {
  state = { done: {}, failed: {}, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }
}
const saveState = () =>
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n')

// --- Cellules manquantes ---
const missing = plan.filter(
  (cell) => !covered.has(cellKey(cell.genre.id, cell.theme.id, cell.level, cell.size.id))
)

// Priorité de la matrice d'abord, puis les jamais-tentées avant les échecs répétés.
missing.sort((a, b) => {
  if (a.priority !== b.priority) return a.priority - b.priority
  const fa = state.failed[cellKey(a.genre.id, a.theme.id, a.level, a.size.id)]?.attempts ?? 0
  const fb = state.failed[cellKey(b.genre.id, b.theme.id, b.level, b.size.id)]?.attempts ?? 0
  return fa - fb
})

console.log(
  `Matrice curée : ${plan.length} cellules (niveaux ${levels.join('/')} × tailles ${sizes.join('/')}${args.genre ? ` × genre=${args.genre}` : ''}${args.theme ? ` × theme=${args.theme}` : ''}${maxPriority ? ` × priorité≤${maxPriority}` : ''})`
)
console.log(`Couvertes : ${plan.length - missing.length} — manquantes : ${missing.length}`)

const batch = missing.slice(0, limit)
if (!batch.length) {
  console.log('✓ Rien à générer.')
  process.exit(0)
}

console.log(`\nÀ générer dans ce run (${batch.length}, modèle ${MODEL}) :`)
for (const { genre, theme, level, size } of batch) {
  console.log(`  - ${genre.id} × ${theme.id} × ${level} × ${size.id} (~${size.targetWords} mots)`)
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

async function processCell({ genre, theme, level, size }) {
  const key = cellKey(genre.id, theme.id, level, size.id)
  const label = `${genre.id} × ${theme.id} × ${level} × ${size.id}`
  try {
    console.log(`\n▶ ${label} : choix du sujet…`)
    const { slug, topic } = await proposeTopic({
      genre,
      category: theme,
      level,
      size: { words: size.targetWords, label: size.name },
      existingTitles: titlesByTheme.get(theme.id) ?? [],
    })
    const id = uniqueSlug(slug)
    console.log(`▶ ${label} : « ${topic} » (id: ${id}) — génération…`)
    const textData = await generateText({
      id,
      level,
      topic,
      targetWords: size.targetWords,
      sizeId: size.id,
      categoryId: theme.id,
      genre,
    })
    const { file, wordCount } = writeText(textData)
    titlesByTheme.set(theme.id, [...(titlesByTheme.get(theme.id) ?? []), textData.title])
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
    while (queue.length) await processCell(queue.shift())
  })
)

console.log(`\nTerminé : ${ok} généré(s), ${ko} échec(s).`)
if (ko) {
  console.log('Relancez le script pour retenter les échecs (voir generator/state.json).')
  process.exitCode = 1
}
