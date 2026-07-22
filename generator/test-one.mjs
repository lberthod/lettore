#!/usr/bin/env node
// Génère UN texte de test — pour évaluer un modèle ou une combinaison avant
// de lancer l'orchestrateur sur un vrai lot. N'écrit PAS dans index.json par
// défaut : le texte va dans generator/test-output/, pas dans le catalogue.
//
// Usage :
//   node generator/test-one.mjs --genre dialogo --theme cucina --level A2 --size corto
//   node generator/test-one.mjs --theme cucina --level A1 --size medio --topic "Une recette de famille"
//   node generator/test-one.mjs --genre poesia --theme natura_animali --level A1 --model glm-4.7-flashx
//   node generator/test-one.mjs --genre dialogo --theme cucina --level A2 --write   # écrit pour de vrai
//
// Options :
//   --genre <id>     genre de category.json (optionnel → récit par défaut)
//   --theme <id>     thème de category.json (obligatoire)
//   --level <A1..C1> défaut A2
//   --size <id>      corto|medio|lungo|molto_lungo, défaut corto
//   --topic "<txt>"  impose le sujet (sinon proposé par le LLM)
//   --id <slug>      impose l'id (sinon celui proposé par le LLM)
//   --model <id>     surcharge GLM_MODEL pour ce run seulement
//   --base-url <url> surcharge GLM_BASE_URL pour ce run seulement
//   --write          écrit réellement dans TEXTS_DIR/<id>.json + index.json
//
// Prérequis : export GLM_API_KEY=...

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a === '--write') args.write = true
  else if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i]
}

// Doit être fait AVANT d'importer config.mjs (qui lit process.env au chargement) :
// on passe donc par des imports dynamiques après avoir posé les surcharges.
if (args.model) process.env.GLM_MODEL = args.model
if (args['base-url']) process.env.GLM_BASE_URL = args['base-url']

if (!process.env.GLM_API_KEY) {
  console.error('✗ GLM_API_KEY manquante (export GLM_API_KEY=...).')
  process.exit(1)
}

const { MODEL, GLM_BASE_URL } = await import('./config.mjs')
const { loadCategoryData } = await import('./lib/category.mjs')
const { proposeTopic, generateText, writeText } = await import('./lib/generate.mjs')
const { countWords } = await import('./lib/schema.mjs')

const catData = loadCategoryData()
const genre = args.genre ? catData.genreById.get(args.genre) : undefined
const theme = catData.themeById.get(args.theme)
const level = args.level || 'A2'
const sizeId = args.size || 'corto'
const size = catData.sizes.find((s) => s.id === sizeId)

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
if (!size) {
  console.error(`✗ Taille inconnue : "${sizeId}". Disponibles : ${catData.sizes.map((s) => s.id).join(', ')}`)
  process.exit(1)
}

console.log(`Modèle   : ${MODEL} (${GLM_BASE_URL})`)
console.log(
  `Cellule  : ${genre?.id ?? '(récit par défaut)'} × ${theme.id} × ${level} × ${sizeId} (~${size.targetWords} mots)\n`
)

const t0 = Date.now()

let topic = args.topic
let slug = args.id
if (!topic) {
  console.log('▶ Choix du sujet…')
  const proposed = await proposeTopic({
    genre,
    category: theme,
    level,
    size: { words: size.targetWords, label: size.name },
    existingTitles: [],
  })
  topic = proposed.topic
  slug = slug || proposed.slug
  console.log(`  sujet : « ${topic} » (slug proposé : ${slug})`)
}
slug = slug || 'test'

console.log('\n▶ Génération du texte…')
const textData = await generateText({
  id: slug,
  level,
  topic,
  targetWords: size.targetWords,
  sizeId,
  categoryId: theme.id,
  genre,
})

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
const wordCount = countWords(textData.paragraphs)

console.log(`\n=== Résultat (${elapsed}s, modèle ${MODEL}) ===`)
console.log(`Titre       : ${textData.title}`)
console.log(`Niveau      : ${textData.level}`)
console.log(`Paragraphes : ${textData.paragraphs.length}`)
console.log(`Mots        : ${wordCount} (cible ${size.targetWords})`)
console.log(`Lexique     : ${Object.keys(textData.words).length} entrées`)
console.log(`Phrases     : ${Object.keys(textData.sentences).length} entrées`)
console.log(`Questions   : ${textData.questions.length}`)

console.log('\n--- Texte ---\n')
console.log(textData.paragraphs.join('\n\n'))

console.log('\n--- Quiz ---\n')
for (const q of textData.questions) {
  console.log(`Q: ${q.q}`)
  q.options.forEach((o, i) => console.log(`  ${i === q.correct ? '✓' : ' '} ${o}`))
}

console.log('\n--- Extrait du lexique (10 premières entrées) ---\n')
console.log(
  Object.entries(textData.words)
    .slice(0, 10)
    .map(([it, fr]) => `  ${it} → ${fr}`)
    .join('\n')
)

if (args.write) {
  const { file } = writeText(textData)
  console.log(`\n✓ Écrit dans le catalogue réel : ${path.relative(process.cwd(), file)} (+ index.json)`)
} else {
  const outDir = path.join(HERE, 'test-output')
  fs.mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, `${slug}.json`)
  fs.writeFileSync(file, JSON.stringify(textData, null, 2) + '\n')
  console.log(`\n✓ Sauvegardé hors catalogue (test) : ${path.relative(process.cwd(), file)}`)
  console.log('  index.json non modifié — relancer avec --write pour publier pour de vrai.')
}
