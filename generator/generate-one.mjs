#!/usr/bin/env node
// Génère UN texte, hors matrice (sujet imposé à la main).
//
// Usage :
//   node generator/generate-one.mjs --id vendemmia --level B1 --category cucina \
//     --size medio --topic "Les vendanges au Piémont"
//
// Prérequis : export GLM_API_KEY=...

import { LEVELS, SIZES, CATEGORIES } from './config.mjs'
import { generateText, writeText } from './lib/generate.mjs'

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i]
}

const { id, level, topic } = args
const size = SIZES.find((s) => s.id === (args.size || 'medio'))
const category = CATEGORIES.find((c) => c.id === args.category)
if (!id || !topic || !LEVELS.includes(level) || !size || !category) {
  console.error(
    `Usage : node generator/generate-one.mjs --id <slug> --level <${LEVELS.join('|')}> --category <${CATEGORIES.map((c) => c.id).join('|')}> --topic "<sujet>" [--size ${SIZES.map((s) => s.id).join('|')}] [--words n]`
  )
  process.exit(1)
}
const targetWords = Number(args.words) || size.words

if (!process.env.GLM_API_KEY) {
  console.error('✗ GLM_API_KEY manquante (export GLM_API_KEY=...).')
  process.exit(1)
}

console.log(`Génération « ${topic} » (${level}, ${category.id}, ~${targetWords} mots)…`)
const textData = await generateText({
  id,
  level,
  topic,
  targetWords,
  sizeId: size.id,
  categoryId: category.id,
})
const { file, wordCount } = writeText(textData)
console.log(`✓ « ${textData.title} » (${wordCount} mots) → ${file}`)
