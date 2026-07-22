#!/usr/bin/env node
// Teste UNE combinaison genre × thème × niveau sur PLUSIEURS tailles, avec le
// MÊME sujet pour chacune (comparaison propre) — utile pour évaluer si un
// modèle respecte la longueur demandée (ex. GLM-4.7-FlashX vs glm-5.2) selon
// la taille. N'écrit PAS dans le catalogue réel (comme test-one.mjs).
//
// Usage :
//   node generator/test-sizes.mjs --genre dialogo --theme cucina --level A2 \
//     --sizes lungo,molto_lungo --model glm-4.7-flashx
//
//   node generator/test-sizes.mjs --theme cucina --level A2 --topic "Ordinare al ristorante" \
//     --sizes corto,medio,lungo,molto_lungo
//
// Options : voir test-one.mjs (--genre, --theme, --level, --topic, --model,
// --base-url) + --sizes <liste séparée par des virgules, défaut lungo,molto_lungo>

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i]
}

if (args.model) process.env.GLM_MODEL = args.model
if (args['base-url']) process.env.GLM_BASE_URL = args['base-url']

if (!process.env.GLM_API_KEY) {
  console.error('✗ GLM_API_KEY manquante (export GLM_API_KEY=...).')
  process.exit(1)
}

const { MODEL } = await import('./config.mjs')
const { loadCategoryData } = await import('./lib/category.mjs')
const { proposeTopic, generateText } = await import('./lib/generate.mjs')
const { countWords } = await import('./lib/schema.mjs')

const catData = loadCategoryData()
const genre = args.genre ? catData.genreById.get(args.genre) : undefined
const theme = catData.themeById.get(args.theme)
const level = args.level || 'A2'
const sizeIds = (args.sizes || 'lungo,molto_lungo').split(',').map((s) => s.trim())

if (args.genre && !genre) {
  console.error(
    `✗ Genre inconnu : "${args.genre}". Disponibles : ${catData.genres.map((g) => g.id).join(', ')}`
  )
  process.exit(1)
}
if (!theme) {
  console.error(
    `✗ --theme requis et doit exister dans category.json. Disponibles : ${catData.themes.map((t) => t.id).join(', ')}`
  )
  process.exit(1)
}
const sizes = sizeIds.map((id) => {
  const s = catData.sizes.find((sz) => sz.id === id)
  if (!s) {
    console.error(`✗ Taille inconnue : "${id}". Disponibles : ${catData.sizes.map((sz) => sz.id).join(', ')}`)
    process.exit(1)
  }
  return s
})

console.log(`Modèle  : ${MODEL}`)
console.log(`Cellule : ${genre?.id ?? '(récit par défaut)'} × ${theme.id} × ${level}`)
console.log(`Tailles : ${sizes.map((s) => s.id).join(', ')}\n`)

// Un seul sujet, réutilisé pour toutes les tailles (comparaison à contenu égal).
let topic = args.topic
if (!topic) {
  console.log('▶ Choix du sujet (unique, réutilisé pour toutes les tailles)…')
  const proposed = await proposeTopic({
    genre,
    category: theme,
    level,
    size: { words: sizes[0].targetWords, label: sizes[0].name },
    existingTitles: [],
  })
  topic = proposed.topic
  console.log(`  sujet : « ${topic} »\n`)
}

const outDir = path.join(HERE, 'test-output')
fs.mkdirSync(outDir, { recursive: true })

const results = []
for (const size of sizes) {
  const label = `${genre?.id ?? 'racconto'}_${theme.id}_${level}_${size.id}`
  console.log(`▶ Génération ${size.id} (~${size.targetWords} mots)…`)
  const t0 = Date.now()
  try {
    const textData = await generateText({
      id: `test_${label}`,
      level,
      topic,
      targetWords: size.targetWords,
      sizeId: size.id,
      categoryId: theme.id,
      genre,
    })
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
    const wordCount = countWords(textData.paragraphs)
    const ratio = Math.round((wordCount / size.targetWords) * 100)
    results.push({
      size: size.id,
      target: size.targetWords,
      actual: wordCount,
      ratio,
      paragraphs: textData.paragraphs.length,
      elapsed,
      title: textData.title,
    })
    const file = path.join(outDir, `${label}.json`)
    fs.writeFileSync(file, JSON.stringify(textData, null, 2) + '\n')
    console.log(
      `  ✓ ${wordCount} mots (${ratio}% de la cible), ${textData.paragraphs.length} paragraphes, ${elapsed}s → ${path.relative(process.cwd(), file)}`
    )
  } catch (err) {
    results.push({ size: size.id, target: size.targetWords, error: err.message })
    console.error(`  ✗ échec : ${err.message}`)
  }
}

console.log(`\n=== Résumé (modèle ${MODEL}, sujet « ${topic} ») ===\n`)
console.log('Taille        Cible   Réel   Ratio   Paragraphes   Temps')
for (const r of results) {
  if (r.error) {
    console.log(`${r.size.padEnd(14)}${String(r.target).padEnd(8)}ÉCHEC : ${r.error}`)
  } else {
    console.log(
      `${r.size.padEnd(14)}${String(r.target).padEnd(8)}${String(r.actual).padEnd(7)}${(r.ratio + '%').padEnd(8)}${String(r.paragraphs).padEnd(14)}${r.elapsed}s`
    )
  }
}

const ok = results.filter((r) => !r.error)
if (ok.length >= 2) {
  const drift = ok[ok.length - 1].ratio - ok[0].ratio
  console.log(
    `\nDérive du ratio entre ${ok[0].size} et ${ok[ok.length - 1].size} : ${drift > 0 ? '+' : ''}${drift} points.`
  )
  console.log(
    drift < -10
      ? '→ Le sous-dimensionnement s’aggrave avec la longueur : ce modèle est risqué pour les tailles lungo/molto_lungo.'
      : Math.abs(drift) <= 10
        ? '→ Le ratio reste stable : le sous-dimensionnement (s’il existe) est constant, pas aggravé par la longueur.'
        : '→ Le ratio s’améliore avec la longueur.'
  )
}
