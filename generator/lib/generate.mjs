// Génération d'un texte complet (sujet → texte → réparations → écriture).
// Utilisé par l'orchestrateur ; utilisable aussi seul via generate-one.mjs.

import fs from 'node:fs'
import path from 'node:path'
import { TEXTS_DIR } from '../config.mjs'
import { callLLM } from './llm.mjs'
import {
  TEXT_SCHEMA,
  REPAIR_SCHEMA,
  TOPIC_SCHEMA,
  toTextData,
  normalizeWord,
  normalizeSentence,
  validateCoverage,
  validateStructure,
  countWords,
  makeExcerpt,
} from './schema.mjs'

const SYSTEM = `Tu écris des textes pour Leggendo, une application d'apprentissage de l'italien par la lecture destinée à des francophones. Chaque texte est en italien, gradué selon le CECR, et accompagné d'un lexique complet italien→français, de traductions de phrases et d'un quiz de compréhension en italien.

Style des textes existants : récits de vie quotidienne, voyages, culture et histoire italiennes ; phrases claires, vocabulaire strictement adapté au niveau demandé ; ton chaleureux et concret. Les paragraphes font 2 à 4 phrases.

Contraintes de format ABSOLUES :
- "words" doit contenir CHAQUE mot du texte, sous sa forme exacte telle qu'elle apparaît (fléchie, pas le lemme), en minuscules, apostrophe droite ('). Un mot répété n'apparaît qu'une fois. Traductions françaises courtes ; pour les mots grammaticaux ambigus, une glose brève entre parenthèses (ex. "gli": "lui (« gli piace » = il aime)").
- "sentences" doit contenir CHAQUE phrase du texte, reproduite à l'identique (mêmes mots, même ponctuation), avec sa traduction française naturelle.
- "questions" : exactement 3 questions de compréhension en italien, 3 options chacune, une seule correcte ("correct" = index de la bonne option). Les questions portent sur le contenu du texte.
- Le titre est en italien.`

// Propose un sujet précis et un slug pour une case (genre optionnel, catégorie,
// niveau, taille), en évitant les sujets déjà traités.
export async function proposeTopic({ genre, category, level, size, existingTitles }) {
  const existing = existingTitles.length
    ? `Sujets déjà traités dans cette catégorie (à ÉVITER, ne pas répéter ni paraphraser) :\n${existingTitles.map((t) => `- ${t}`).join('\n')}`
    : 'Aucun sujet encore traité dans cette catégorie.'
  const genreLine = genre
    ? `Genre / forme du texte : « ${genre.name} » (${genre.hint})\n`
    : ''
  const out = await callLLM({
    system: SYSTEM,
    // Certains modèles (ex. variantes "flash") sont verbeux même sur une
    // sortie minuscule : marge large pour éviter une troncature évitable.
    maxTokens: 4000,
    schema: TOPIC_SCHEMA,
    prompt: `${genreLine}Propose UN sujet de texte pour le thème « ${category.name} » (${category.hint}).
Niveau CECR : ${level}. Longueur prévue : environ ${size.words} mots (texte ${size.label}).

${existing}

Choisis un sujet concret, original par rapport à la liste, adapté au niveau ${level} et assez riche pour ${size.words} mots${genre ? `, et cohérent avec le genre « ${genre.name} »` : ''}. Renvoie un slug court en italien (minuscules, _, sans accents) et le sujet en une ou deux phrases en français.`,
  })
  return out
}

// Génère le texte complet pour un sujet donné et valide/répare la couverture.
// `genre` (optionnel) impose la forme du texte (dialogue, poésie, fable…) en
// plus du niveau/thème — rétro-compatible : sans genre, comportement inchangé
// (récit/article en prose, comme avant).
export async function generateText({
  id,
  level,
  topic,
  targetWords,
  sizeId,
  categoryId,
  genre,
}) {
  const sizeNote =
    targetWords >= 850
      ? `\nC'est un texte LONG : vise vraiment ${targetWords} mots (compte-les), en 10 à 16 paragraphes, avec une progression narrative claire. Le vocabulaire reste strictement de niveau ${level} : la longueur vient du récit, pas de mots plus difficiles.`
      : ''
  const genreNote = genre
    ? `\nCe texte doit respecter la forme « ${genre.name} » : ${genre.hint}\nChaque paragraphe du tableau "paragraphs" doit suivre cette forme (par exemple, pour un dialogue ou du théâtre, chaque réplique commence par "NOM — " ; pour un poème, un paragraphe peut être une strophe avec des sauts de ligne "\\n" entre les vers).`
    : ''
  // Le JSON complet (texte + lexique intégral + traductions de phrases + quiz)
  // pèse largement plus que le texte seul — un budget fixe tronque les
  // tailles lungo/molto_lungo avant la fin. On le dimensionne sur la cible.
  const maxTokens = Math.min(64000, Math.max(8000, Math.round(targetWords * 28)))
  const out = await callLLM({
    system: SYSTEM,
    schema: TEXT_SCHEMA,
    maxTokens,
    prompt: `Écris un texte de niveau ${level} d'environ ${targetWords} mots sur le sujet suivant : ${topic}.
Le champ "level" doit valoir "${level}".${sizeNote}${genreNote}`,
  })

  const structuralErrors = validateStructure(out)
  if (structuralErrors.length) {
    throw new Error(`Erreurs structurelles : ${structuralErrors.join(' ; ')}`)
  }

  const textData = toTextData(id, out)
  textData.category = categoryId
  textData.size = sizeId
  if (genre) textData.genre = genre.id

  // Passes de réparation : le lecteur exige une couverture lexicale totale
  for (let round = 1; round <= 2; round++) {
    const { missingWords, missingSentences } = validateCoverage(textData)
    if (!missingWords.length && !missingSentences.length) break
    console.log(
      `  réparation ${round} : ${missingWords.length} mot(s), ${missingSentences.length} phrase(s) sans traduction…`
    )
    // Budget proportionnel au volume à réparer — un modèle qui laisse
    // beaucoup de trous au premier passage (fréquent avec les variantes
    // "flash") a aussi besoin de plus de place pour tout traduire d'un coup.
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
    for (const { it, fr } of repair.sentences)
      textData.sentences[normalizeSentence(it)] = fr
  }

  const remaining = validateCoverage(textData)
  if (remaining.missingWords.length || remaining.missingSentences.length) {
    throw new Error(
      `Couverture incomplète après réparation — mots : ${remaining.missingWords.join(', ')} ; phrases : ${remaining.missingSentences.length}`
    )
  }

  return textData
}

// Écrit <id>.json et met à jour index.json dans TEXTS_DIR.
export function writeText(textData) {
  const wordCount = countWords(textData.paragraphs)
  const indexEntry = {
    id: textData.id,
    title: textData.title,
    level: textData.level,
    excerpt: makeExcerpt(textData.paragraphs),
    paragraphCount: textData.paragraphs.length,
    wordCount,
    category: textData.category,
    size: textData.size,
    ...(textData.genre ? { genre: textData.genre } : {}),
  }

  fs.mkdirSync(TEXTS_DIR, { recursive: true })
  const file = path.join(TEXTS_DIR, `${textData.id}.json`)
  fs.writeFileSync(file, JSON.stringify(textData, null, 2) + '\n')

  const indexFile = path.join(TEXTS_DIR, 'index.json')
  const index = fs.existsSync(indexFile)
    ? JSON.parse(fs.readFileSync(indexFile, 'utf8'))
    : []
  const existing = index.findIndex((t) => t.id === textData.id)
  if (existing >= 0) index[existing] = indexEntry
  else index.push(indexEntry)
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n')

  return { file, wordCount }
}
