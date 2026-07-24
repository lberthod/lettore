// Génère un texte gradué d'actualité à partir d'un article RSS italien
// (formule Premium+, voir PREMIUM_PLUS_ANALYSIS.md). Même pipeline que
// generate.mjs (génération → validation de couverture lexicale → réparation),
// avec un system prompt qui impose la reformulation fidèle (jamais de
// republication de l'article source) et interdit d'inventer des faits.

import { callLLM } from './llm.mjs'
import {
  TEXT_SCHEMA,
  REPAIR_SCHEMA,
  toTextData,
  normalizeWord,
  normalizeSentence,
  validateCoverage,
  validateStructure,
  countWords,
  makeExcerpt,
} from './schema.mjs'

const SYSTEM = `Tu écris des textes d'actualité pour Leggendo, une application d'apprentissage de l'italien par la lecture destinée à des francophones. Tu reçois un article d'actualité italien (titre + résumé) et tu dois écrire un texte ORIGINAL qui en reformule fidèlement les faits, gradué selon le CECR, avec un lexique complet italien→français, des traductions de phrases et un quiz de compréhension en italien.

Règles absolues sur les faits :
- Ne reproduis JAMAIS le texte source mot pour mot : c'est une reformulation pédagogique originale, pas une republication.
- N'invente et ne déforme AUCUN fait, nom, date ou chiffre présent dans l'article source. Si une information n'est pas claire dans le résumé fourni, reste vague plutôt que d'inventer un détail.
- Reste neutre : pas d'opinion, pas de sensationnalisme ajouté.

Contraintes de format ABSOLUES :
- "words" doit contenir CHAQUE mot du texte, sous sa forme exacte telle qu'elle apparaît (fléchie, pas le lemme), en minuscules, apostrophe droite ('). Un mot répété n'apparaît qu'une fois. Traductions françaises courtes ; pour les mots grammaticaux ambigus, une glose brève entre parenthèses.
- "sentences" doit contenir CHAQUE phrase du texte, reproduite à l'identique (mêmes mots, même ponctuation), avec sa traduction française naturelle.
- "questions" : exactement 3 questions de compréhension en italien, 3 options chacune, une seule correcte ("correct" = index de la bonne option). Les questions portent sur le contenu du texte.
- Le titre est en italien, différent du titre de l'article source (reformulé).`

const TARGET_WORDS = { A2: 180, B1: 300, B2: 420, C1: 550 }

// `item` = {title, description, link, pubDate} tel que renvoyé par rss.mjs.
export async function generateNewsText({ id, level, item }) {
  const targetWords = TARGET_WORDS[level] || 300
  const maxTokens = Math.min(64000, Math.max(16000, Math.round(targetWords * 35)))

  const out = await callLLM({
    system: SYSTEM,
    schema: TEXT_SCHEMA,
    maxTokens,
    prompt: `Article d'actualité source (ANSA, ${item.pubDate || 'date inconnue'}) :

Titre : « ${item.title} »
Résumé : ${item.description}

Écris un texte de niveau ${level} d'environ ${targetWords} mots qui reformule fidèlement cette actualité pour un apprenant francophone, sans reproduire le texte source. Le champ "level" doit valoir "${level}".`,
  })

  const structuralErrors = validateStructure(out)
  if (structuralErrors.length) {
    throw new Error(`Erreurs structurelles : ${structuralErrors.join(' ; ')}`)
  }

  const textData = toTextData(id, out)
  textData.category = 'societa'
  textData.genre = 'documentario'
  textData.size = level === 'A2' ? 'corto' : level === 'B1' ? 'medio' : 'lungo'
  textData.sourceTitle = item.title
  textData.sourcePublishedAt = item.pubDate || null

  // Passes de réparation : le lecteur exige une couverture lexicale totale
  // (même logique que generate.mjs).
  for (let round = 1; round <= 2; round++) {
    const { missingWords, missingSentences } = validateCoverage(textData)
    if (!missingWords.length && !missingSentences.length) break
    const repairMaxTokens = Math.min(
      64000,
      Math.max(8000, (missingWords.length + missingSentences.length) * 120)
    )
    const repair = await callLLM({
      system: SYSTEM,
      schema: REPAIR_SCHEMA,
      maxTokens: repairMaxTokens,
      prompt: `Voici un texte italien :\n\n${textData.paragraphs.join('\n\n')}\n\nTraduis en français les éléments suivants, tirés de ce texte (renvoie chaque élément à l'identique dans "it") :\n- Mots : ${missingWords.join(', ') || '(aucun)'}\n- Phrases : ${missingSentences.join(' | ') || '(aucune)'}`,
    })
    for (const { it, fr } of repair.words) textData.words[normalizeWord(it)] = fr
    const looseKey = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
    const missingByLoose = new Map(
      missingSentences.map((s) => [looseKey(s), normalizeSentence(s)])
    )
    for (const { it, fr } of repair.sentences) {
      const key = missingByLoose.get(looseKey(it)) ?? normalizeSentence(it)
      textData.sentences[key] = fr
    }
  }

  const remaining = validateCoverage(textData)
  if (remaining.missingWords.length || remaining.missingSentences.length > 2) {
    throw new Error(
      `Couverture incomplète après réparation — mots : ${remaining.missingWords.join(', ')} ; phrases : ${remaining.missingSentences.length}`
    )
  }

  textData.wordCount = countWords(textData.paragraphs)
  textData.excerpt = makeExcerpt(textData.paragraphs)
  return textData
}
