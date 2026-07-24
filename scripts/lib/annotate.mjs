// Fonction partagée : annote un chapitre (texte italien fixe) via l'API
// Claude — lexique, phrases traduites, quiz — avec passes de réparation pour
// garantir la couverture lexicale totale exigée par le lecteur.
// Utilisée par scripts/annotate-chapter.mjs (un chapitre) et
// scripts/orchestrate-book.mjs (un livre entier).

import Anthropic from '@anthropic-ai/sdk'
import {
  REPAIR_SCHEMA,
  normalizeWord,
  normalizeSentence,
  validateCoverage,
  countWords,
} from './schema.mjs'
import { ANNOTATE_SCHEMA, ANNOTATE_SYSTEM, remapSentences } from './book-schema.mjs'

const MODEL = 'claude-opus-4-8'

let client = null
function getClient() {
  if (!client) client = new Anthropic()
  return client
}

async function callClaude(prompt, schema) {
  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    system: ANNOTATE_SYSTEM,
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

// paragraphs : corps du chapitre SANS le titre (déjà retiré par l'appelant).
export async function annotateChapter({ id, title, paragraphs, log = console.log }) {
  log(`Annotation « ${title} » — ${countWords(paragraphs)} mots (${MODEL})…`)

  const out = await callClaude(
    `Voici le texte italien à annoter (chapitre "${title}") :\n\n${paragraphs.join('\n\n')}`,
    ANNOTATE_SCHEMA
  )

  const words = {}
  for (const { it, fr } of out.words) words[normalizeWord(it)] = fr
  const { sentences } = remapSentences(paragraphs, out.sentences)

  const chapterData = { id, title, paragraphs, words, sentences, questions: out.questions }

  for (let round = 1; round <= 2; round++) {
    const { missingWords, missingSentences } = validateCoverage(chapterData)
    if (!missingWords.length && !missingSentences.length) break
    log(
      `  Réparation ${round} : ${missingWords.length} mot(s), ${missingSentences.length} phrase(s) sans traduction…`
    )
    const repair = await callClaude(
      `Voici un texte italien :\n\n${paragraphs.join('\n\n')}\n\nTraduis en français les éléments suivants, tirés de ce texte (renvoie chaque élément à l'identique dans "it") :\n- Mots : ${missingWords.join(', ') || '(aucun)'}\n- Phrases : ${missingSentences.join(' | ') || '(aucune)'}`,
      REPAIR_SCHEMA
    )
    for (const { it, fr } of repair.words) chapterData.words[normalizeWord(it)] = fr
    for (const { it, fr } of repair.sentences)
      chapterData.sentences[normalizeSentence(it)] = fr
  }

  const remaining = validateCoverage(chapterData)
  if (remaining.missingWords.length || remaining.missingSentences.length) {
    log(
      `  ⚠ Couverture incomplète après réparation — mots : ${remaining.missingWords.join(', ')} ; phrases : ${remaining.missingSentences.length}`
    )
  }

  return chapterData
}

// Lit un fichier brut sources/raw/<book-id>/chapitre-<NN>.txt : le premier
// paragraphe sert de titre de chapitre (convention Wikisource, voir
// scripts/fetch-book.mjs), le reste est le corps à annoter.
export function splitRawChapter(rawText) {
  const paragraphs = rawText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  return { title: paragraphs[0] ?? '', paragraphs: paragraphs.slice(1) }
}
