// Schéma et helpers pour l'annotation de chapitres de livres du domaine
// public. Contrairement à scripts/lib/schema.mjs
// (génération d'un texte depuis un sujet), ici le texte italien est fixe :
// l'agent Claude ne produit QUE le lexique, les phrases traduites et le quiz.

const PAIR = {
  type: 'object',
  additionalProperties: false,
  required: ['it', 'fr'],
  properties: {
    it: { type: 'string' },
    fr: { type: 'string' },
  },
}

export const ANNOTATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['words', 'sentences', 'questions'],
  properties: {
    words: {
      type: 'array',
      items: PAIR,
      description:
        'Chaque mot du texte fourni (forme exacte, en minuscules) → traduction française',
    },
    sentences: {
      type: 'array',
      items: PAIR,
      description:
        'Chaque phrase du texte fourni (exacte, ponctuation et orthographe d\'époque incluses) → traduction française',
    },
    questions: {
      type: 'array',
      description: 'Quiz de compréhension (3 questions, en italien)',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['q', 'options', 'correct'],
        properties: {
          q: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          correct: { type: 'integer', description: 'Index de la bonne réponse' },
        },
      },
    },
  },
}

// Les agents (API ou Claude Code) peuvent renvoyer des phrases avec une
// apostrophe différente de l'original (typographique ’ vs droite ') sans
// toucher au sens — normalizeSentence() (schema.mjs) ne plie pas ce cas, elle
// doit rester un miroir EXACT du découpage du lecteur. On rattache donc
// chaque phrase reçue à la vraie phrase source par comparaison tolérante,
// puis on l'indexe sous la clé EXACTE issue du texte source (jamais celle de
// l'agent) — ainsi translate.js/ReaderView retrouvent toujours la traduction.
import { splitSentences, normalizeSentence } from './schema.mjs'

function fuzzyKey(s) {
  return s
    .toLowerCase()
    .replace(/[’‘']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// Chaque phrase source (avec doublons : la même phrase peut apparaître deux
// fois dans un chapitre) devient une entrée "disponible" une seule fois —
// consommée au premier match (exact d'abord, fuzzy en repli). Une simple Map
// fuzzyKey→texte perdrait les doublons qui ne diffèrent que par la casse
// (ex. "Dàlli!" / "dàlli!" dans Le novelle della nonna) : leur fuzzyKey est
// identique, donc l'un écrasait l'autre et la couverture ne pouvait jamais
// être satisfaite quelle que soit la traduction fournie.
export function remapSentences(paragraphs, annSentences) {
  const realSentences = []
  for (const p of paragraphs) {
    for (const s of splitSentences(p)) {
      realSentences.push({ text: normalizeSentence(s), fuzzy: fuzzyKey(s), used: false })
    }
  }
  const sentences = {}
  const unmatched = []
  for (const { it, fr } of annSentences) {
    const itNorm = normalizeSentence(it)
    const itFuzzy = fuzzyKey(it)
    let match = realSentences.find((r) => !r.used && r.text === itNorm)
    if (!match) match = realSentences.find((r) => !r.used && r.fuzzy === itFuzzy)
    if (match) {
      match.used = true
      sentences[match.text] = fr
    } else {
      unmatched.push(it)
    }
  }
  return { sentences, unmatched }
}

export const ANNOTATE_SYSTEM = `Tu annotes des extraits d'œuvres du domaine public pour Leggendo, une application d'apprentissage de l'italien par la lecture destinée à des francophones.

IMPORTANT : le texte italien fourni est un texte authentique (œuvre classique) — tu ne dois JAMAIS le reformuler, le simplifier, le moderniser ou en corriger l'orthographe/la syntaxe d'époque. Ton rôle est uniquement d'annoter : lexique italien→français, traduction de chaque phrase, quiz de compréhension. Le texte lui-même n'est jamais dans ta sortie.

Contraintes de format ABSOLUES :
- "words" doit contenir CHAQUE mot du texte fourni, sous sa forme exacte telle qu'elle apparaît (fléchie, pas le lemme), en minuscules, apostrophe droite ('). Un mot répété n'apparaît qu'une fois. Traductions françaises courtes ; pour le vocabulaire daté (XIXe siècle) ou les mots grammaticaux ambigus, une glose brève entre parenthèses.
- "sentences" doit contenir CHAQUE phrase du texte, reproduite À L'IDENTIQUE (mêmes mots, même ponctuation, ne pas corriger l'orthographe d'époque), avec sa traduction française naturelle.
- "questions" : exactement 3 questions de compréhension en italien, 3 options chacune, une seule correcte ("correct" = index de la bonne option).`
