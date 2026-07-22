// Schéma et validation des textes générés par LLM.
//
// Les structured outputs de l'API Claude n'acceptent pas les objets à clés
// dynamiques (additionalProperties doit être false) : le modèle renvoie donc
// le lexique et les phrases sous forme de tableaux {it, fr}, convertis ensuite
// au format de l'app (objets `words` / `sentences`).

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1']

const PAIR = {
  type: 'object',
  additionalProperties: false,
  required: ['it', 'fr'],
  properties: {
    it: { type: 'string' },
    fr: { type: 'string' },
  },
}

// Schéma imposé au modèle pour la génération complète d'un texte.
export const TEXT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'level', 'paragraphs', 'questions', 'words', 'sentences'],
  properties: {
    title: { type: 'string', description: 'Titre en italien' },
    level: { type: 'string', enum: LEVELS },
    paragraphs: {
      type: 'array',
      items: { type: 'string' },
      description: 'Paragraphes du texte en italien',
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
    words: {
      type: 'array',
      items: PAIR,
      description:
        'Lexique : chaque mot du texte (forme exacte, en minuscules) → traduction française',
    },
    sentences: {
      type: 'array',
      items: PAIR,
      description: 'Chaque phrase du texte (exacte) → traduction française',
    },
  },
}

// Schéma pour la passe de réparation (traductions manquantes uniquement).
export const REPAIR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['words', 'sentences'],
  properties: {
    words: { type: 'array', items: PAIR },
    sentences: { type: 'array', items: PAIR },
  },
}

// --- Reproductions exactes des découpages du lecteur (ReaderView / translate.js) ---

export function splitSentences(paragraph) {
  return (paragraph.match(/[^.!?]+[.!?]*\s*/g) || [paragraph]).map((s) =>
    s.trim()
  )
}

export function tokenizeWords(sentence) {
  return sentence
    .split(/(\p{L}[\p{L}'’-]*)/u)
    .filter((t) => /^\p{L}/u.test(t))
}

export function normalizeWord(word) {
  return word.toLowerCase().replace(/’/g, "'")
}

export function normalizeSentence(sentence) {
  return sentence.trim().replace(/\s+/g, ' ')
}

// Convertit la sortie LLM (tableaux) vers le format de l'app (objets).
export function toTextData(id, out) {
  const words = {}
  for (const { it, fr } of out.words) words[normalizeWord(it)] = fr
  const sentences = {}
  for (const { it, fr } of out.sentences) sentences[normalizeSentence(it)] = fr
  return {
    id,
    title: out.title,
    level: out.level,
    paragraphs: out.paragraphs,
    questions: out.questions,
    words,
    sentences,
  }
}

// Vérifie que le lexique couvre chaque mot et chaque phrase du texte,
// exactement comme le lecteur les cherchera (avec la tolérance apostrophe
// finale de translate.js).
export function validateCoverage(textData) {
  const missingWords = new Set()
  const missingSentences = new Set()
  for (const paragraph of textData.paragraphs) {
    for (const sentence of splitSentences(paragraph)) {
      if (!textData.sentences[normalizeSentence(sentence)]) {
        missingSentences.add(sentence)
      }
      for (const token of tokenizeWords(sentence)) {
        const key = normalizeWord(token)
        if (
          textData.words[key] === undefined &&
          textData.words[key.replace(/'$/, '')] === undefined
        ) {
          missingWords.add(key)
        }
      }
    }
  }
  return {
    missingWords: [...missingWords],
    missingSentences: [...missingSentences],
  }
}

// Contrôles structurels bloquants.
export function validateStructure(out) {
  const errors = []
  if (!out.paragraphs?.length) errors.push('paragraphs vide')
  if ((out.questions?.length ?? 0) < 3) errors.push('moins de 3 questions')
  for (const [i, q] of (out.questions ?? []).entries()) {
    if ((q.options?.length ?? 0) < 3) errors.push(`question ${i + 1} : moins de 3 options`)
    if (q.correct < 0 || q.correct >= (q.options?.length ?? 0))
      errors.push(`question ${i + 1} : index "correct" hors limites`)
  }
  return errors
}

export function countWords(paragraphs) {
  return paragraphs.reduce(
    (n, p) => n + tokenizeWords(p).length,
    0
  )
}

// Extrait pour l'index (même style que les entrées existantes).
export function makeExcerpt(paragraphs, max = 140) {
  const first = paragraphs[0] ?? ''
  return first.length <= max ? first : first.slice(0, max - 1).trimEnd() + '…'
}
