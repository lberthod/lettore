// Génération d'un texte à la demande d'un utilisateur : il fournit le thème,
// le genre, un titre et un résumé de ce qu'il veut lire. Même pipeline que
// generator/lib/generate.mjs (texte → validation → réparations), sans écriture
// sur disque : le texte est renvoyé au client.

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

const SYSTEM = `Tu écris des textes pour Leggendo, une application d'apprentissage de l'italien par la lecture destinée à des francophones. Chaque texte est en italien, gradué selon le CECR, et accompagné d'un lexique complet italien→français, de traductions de phrases et d'un quiz de compréhension en italien.

Style des textes existants : récits de vie quotidienne, voyages, culture et histoire italiennes ; phrases claires, vocabulaire strictement adapté au niveau demandé ; ton chaleureux et concret. Les paragraphes font 2 à 4 phrases.

Contraintes de format ABSOLUES :
- "words" doit contenir CHAQUE mot du texte, sous sa forme exacte telle qu'elle apparaît (fléchie, pas le lemme), en minuscules, apostrophe droite ('). Un mot répété n'apparaît qu'une fois. Traductions françaises courtes ; pour les mots grammaticaux ambigus, une glose brève entre parenthèses (ex. "gli": "lui (« gli piace » = il aime)").
- "sentences" doit contenir CHAQUE phrase du texte, reproduite à l'identique (mêmes mots, même ponctuation), avec sa traduction française naturelle.
- "questions" : exactement 3 questions de compréhension en italien, 3 options chacune, une seule correcte ("correct" = index de la bonne option). Les questions portent sur le contenu du texte.
- Le titre est en italien.`

// Génère un texte complet à partir de la demande utilisateur.
// `theme` et `genre` sont les objets de la taxonomie (name + hint), `title` et
// `summary` viennent de l'utilisateur, `size` = {targetWords, name}, `level` CECR.
export async function generateUserText({ id, level, theme, genre, title, summary, size }) {
  const targetWords = size.targetWords
  const sizeNote =
    targetWords >= 850
      ? `\nC'est un texte LONG : vise vraiment ${targetWords} mots (compte-les), en 10 à 16 paragraphes, avec une progression narrative claire. Le vocabulaire reste strictement de niveau ${level} : la longueur vient du récit, pas de mots plus difficiles.`
      : ''
  const genreNote = genre
    ? `\nCe texte doit respecter la forme « ${genre.name} » : ${genre.hint}\nChaque paragraphe du tableau "paragraphs" doit suivre cette forme (par exemple, pour un dialogue ou du théâtre, chaque réplique commence par "NOM — " ; pour un poème, un paragraphe peut être une strophe avec des sauts de ligne "\\n" entre les vers).`
    : ''

  // Le JSON complet pèse largement plus que le texte seul : budget proportionnel.
  const maxTokens = Math.min(64000, Math.max(8000, Math.round(targetWords * 28)))
  const out = await callLLM({
    system: SYSTEM,
    schema: TEXT_SCHEMA,
    maxTokens,
    prompt: `Un utilisateur demande un texte sur mesure. Écris un texte de niveau ${level} d'environ ${targetWords} mots.

Thème : « ${theme.name} » (${theme.hint})${genreNote}

Titre souhaité par l'utilisateur : « ${title} » — reprends-le tel quel comme titre (ou traduis-le en italien s'il est en français).
Ce que l'utilisateur veut lire (son résumé) : ${summary}

Respecte fidèlement la demande de l'utilisateur tant qu'elle est cohérente avec le niveau ${level}. Le champ "level" doit valoir "${level}".${sizeNote}`,
  })

  const structuralErrors = validateStructure(out)
  if (structuralErrors.length) {
    throw new Error(`Erreurs structurelles : ${structuralErrors.join(' ; ')}`)
  }

  const textData = toTextData(id, out)
  textData.category = theme.id
  textData.size = size.id
  if (genre) textData.genre = genre.id

  // Passes de réparation : le lecteur exige une couverture lexicale totale.
  for (let round = 1; round <= 2; round++) {
    const { missingWords, missingSentences } = validateCoverage(textData)
    if (!missingWords.length && !missingSentences.length) break
    console.log(
      `  réparation ${round} : ${missingWords.length} mot(s), ${missingSentences.length} phrase(s) sans traduction…`
    )
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
    // Le modèle renvoie parfois la phrase légèrement retouchée (ponctuation,
    // majuscule…) : on rapproche alors de la phrase manquante la plus proche,
    // en ignorant casse et ponctuation, pour stocker sous la clé que le
    // lecteur cherchera vraiment.
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
  if (remaining.missingWords.length || remaining.missingSentences.length) {
    throw new Error(
      `Couverture incomplète après réparation — mots : ${remaining.missingWords.join(', ')} ; phrases : ${remaining.missingSentences.length}`
    )
  }

  textData.wordCount = countWords(textData.paragraphs)
  textData.excerpt = makeExcerpt(textData.paragraphs)
  return textData
}
