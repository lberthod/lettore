#!/usr/bin/env node
// Génère un texte Leggendo complet (paragraphes, lexique, quiz) via l'API Claude.
//
// Usage :
//   node scripts/generate-text.mjs --id vendemmia --level B1 --topic "Les vendanges au Piémont"
//
// Options :
//   --id <slug>        identifiant du texte (obligatoire)
//   --level <A1..C1>   niveau CECR (obligatoire)
//   --topic <sujet>    sujet, en français ou italien (obligatoire)
//   --words <n>        longueur cible en mots (défaut selon le niveau)
//   --sink <local|firestore>  destination (défaut : local)
//   --free             marque le texte comme gratuit (Firestore uniquement ; défaut : premium)
//
// Sink `local`    → écrit src/texts/<id>.json + met à jour src/texts/index.json
// Sink `firestore`→ écrit un brouillon dans la collection `texts` (à relire,
//                   puis publier avec scripts/publish-text.mjs)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import {
  LEVELS,
  TEXT_SCHEMA,
  REPAIR_SCHEMA,
  toTextData,
  normalizeWord,
  normalizeSentence,
  validateCoverage,
  validateStructure,
  countWords,
  makeExcerpt,
} from './lib/schema.mjs'

const MODEL = 'claude-opus-4-8'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Longueur cible par défaut, calquée sur les textes existants
const DEFAULT_WORDS = { A1: 90, A2: 230, B1: 250, B2: 280, C1: 350 }

// --- Arguments ---
const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a === '--free') args.free = true
  else if (a.startsWith('--')) args[a.slice(2)] = process.argv[++i]
}
const { id, level, topic } = args
if (!id || !level || !topic || !LEVELS.includes(level)) {
  console.error(
    'Usage : node scripts/generate-text.mjs --id <slug> --level <A1|A2|B1|B2|C1> --topic "<sujet>" [--words n] [--sink local|firestore] [--free]'
  )
  process.exit(1)
}
const targetWords = Number(args.words) || DEFAULT_WORDS[level]
const sink = args.sink || 'local'

const SYSTEM = `Tu écris des textes pour Leggendo, une application d'apprentissage de l'italien par la lecture destinée à des francophones. Chaque texte est en italien, gradué selon le CECR, et accompagné d'un lexique complet italien→français, de traductions de phrases et d'un quiz de compréhension en italien.

Style des textes existants : récits de vie quotidienne, voyages, culture et histoire italiennes ; phrases claires, vocabulaire strictement adapté au niveau demandé ; ton chaleureux et concret. Les paragraphes font 2 à 4 phrases.

Contraintes de format ABSOLUES :
- "words" doit contenir CHAQUE mot du texte, sous sa forme exacte telle qu'elle apparaît (fléchie, pas le lemme), en minuscules, apostrophe droite ('). Un mot répété n'apparaît qu'une fois. Traductions françaises courtes ; pour les mots grammaticaux ambigus, une glose brève entre parenthèses (ex. "gli": "lui (« gli piace » = il aime)").
- "sentences" doit contenir CHAQUE phrase du texte, reproduite à l'identique (mêmes mots, même ponctuation), avec sa traduction française naturelle.
- "questions" : exactement 3 questions de compréhension en italien, 3 options chacune, une seule correcte ("correct" = index de la bonne option). Les questions portent sur le contenu du texte.
- Le titre est en italien.`

const client = new Anthropic()

async function callClaude(prompt, schema) {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: prompt }],
  })
  const msg = await stream.finalMessage()
  if (msg.stop_reason === 'refusal') {
    throw new Error('Requête refusée par les classificateurs de sécurité.')
  }
  if (msg.stop_reason === 'max_tokens') {
    throw new Error('Sortie tronquée (max_tokens atteint).')
  }
  const text = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return JSON.parse(text)
}

console.log(`Génération « ${topic} » (${level}, ~${targetWords} mots, ${MODEL})…`)

const out = await callClaude(
  `Écris un texte de niveau ${level} d'environ ${targetWords} mots sur le sujet suivant : ${topic}.
Le champ "level" doit valoir "${level}".`,
  TEXT_SCHEMA
)

const structuralErrors = validateStructure(out)
if (structuralErrors.length) {
  console.error('Erreurs structurelles :', structuralErrors.join(' ; '))
  process.exit(1)
}

let textData = toTextData(id, out)

// Passes de réparation : le lecteur exige une couverture lexicale totale
for (let round = 1; round <= 2; round++) {
  const { missingWords, missingSentences } = validateCoverage(textData)
  if (!missingWords.length && !missingSentences.length) break
  console.log(
    `Réparation ${round} : ${missingWords.length} mot(s), ${missingSentences.length} phrase(s) sans traduction…`
  )
  const repair = await callClaude(
    `Voici un texte italien :\n\n${textData.paragraphs.join('\n\n')}\n\nTraduis en français les éléments suivants, tirés de ce texte (renvoie chaque élément à l'identique dans "it") :\n- Mots : ${missingWords.join(', ') || '(aucun)'}\n- Phrases : ${missingSentences.join(' | ') || '(aucune)'}`,
    REPAIR_SCHEMA
  )
  for (const { it, fr } of repair.words) textData.words[normalizeWord(it)] = fr
  for (const { it, fr } of repair.sentences)
    textData.sentences[normalizeSentence(it)] = fr
}

const remaining = validateCoverage(textData)
if (remaining.missingWords.length || remaining.missingSentences.length) {
  console.warn(
    `⚠ Couverture incomplète après réparation — mots : ${remaining.missingWords.join(', ')} ; phrases : ${remaining.missingSentences.length}`
  )
}

const wordCount = countWords(textData.paragraphs)
const indexEntry = {
  id,
  title: textData.title,
  level: textData.level,
  excerpt: makeExcerpt(textData.paragraphs),
  paragraphCount: textData.paragraphs.length,
  wordCount,
}

if (sink === 'firestore') {
  const { saveDraft } = await import('./lib/firestore.mjs')
  await saveDraft(textData, { premium: !args.free })
  console.log(
    `✓ Brouillon « ${textData.title} » (${wordCount} mots) écrit dans Firestore (texts/${id}).`
  )
  console.log('  Relisez-le, puis : node scripts/publish-text.mjs --id ' + id)
} else {
  const file = path.join(ROOT, 'src/texts', `${id}.json`)
  fs.writeFileSync(file, JSON.stringify(textData, null, 2) + '\n')
  const indexFile = path.join(ROOT, 'src/texts/index.json')
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'))
  const existing = index.findIndex((t) => t.id === id)
  if (existing >= 0) index[existing] = indexEntry
  else index.push(indexEntry)
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n')
  console.log(
    `✓ « ${textData.title} » (${wordCount} mots, ${textData.paragraphs.length} paragraphes) → ${path.relative(ROOT, file)} + index.json`
  )
}
