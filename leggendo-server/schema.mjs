// Schéma et validation des textes générés par LLM.
// Copie autonome de scripts/lib/schema.mjs (le dossier generator/ doit
// pouvoir partir seul sur le VPS).
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
        required: ['q', 'options', 'correct', 'explanation'],
        properties: {
          q: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          correct: { type: 'integer', description: 'Index de la bonne réponse' },
          explanation: {
            type: 'string',
            description:
              'Justification de la bonne réponse : 1 phrase en français simple, citant si possible le passage du texte',
          },
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

// Schéma pour la correction pédagogique d'une production écrite (Phase 5).
// Le niveau estimé va jusqu'à C2 : un élève peut écrire au-delà des niveaux
// proposés en lecture (LEVELS s'arrête à C1 côté génération).
export const CORRECTION_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
export const CORRECTION_ERROR_TYPES = ['grammatica', 'lessico', 'registro', 'ortografia']

export const CORRECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['corrected', 'errors', 'level_estimate'],
  properties: {
    corrected: {
      type: 'string',
      description:
        "Le texte de l'élève corrigé, en italien, en préservant au maximum son style et ses choix",
    },
    errors: {
      type: 'array',
      description: "Chaque erreur relevée dans le texte de l'élève",
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['original', 'correction', 'explanation', 'type'],
        properties: {
          original: { type: 'string', description: "Le passage fautif, tel qu'écrit par l'élève" },
          correction: { type: 'string', description: 'Le passage corrigé' },
          explanation: {
            type: 'string',
            description: "Explication pédagogique en français simple (1 à 2 phrases)",
          },
          type: { type: 'string', enum: CORRECTION_ERROR_TYPES },
        },
      },
    },
    level_estimate: {
      type: 'string',
      enum: CORRECTION_LEVELS,
      description: 'Niveau CECR estimé de la production écrite',
    },
  },
}

// Contrôles structurels bloquants sur la sortie de correction (même rôle que
// validateStructure pour la génération : on ne fait pas confiance au modèle).
export function validateCorrectionStructure(out) {
  const errors = []
  if (typeof out?.corrected !== 'string' || !out.corrected.trim()) {
    errors.push('corrected manquant ou vide')
  }
  if (!Array.isArray(out?.errors)) {
    errors.push('errors absent ou non-tableau')
  } else {
    for (const [i, e] of out.errors.entries()) {
      for (const field of ['original', 'correction', 'explanation']) {
        if (typeof e?.[field] !== 'string' || !e[field].trim()) {
          errors.push(`erreur ${i + 1} : ${field} manquant`)
        }
      }
      if (!CORRECTION_ERROR_TYPES.includes(e?.type)) {
        errors.push(`erreur ${i + 1} : type invalide`)
      }
    }
  }
  if (!CORRECTION_LEVELS.includes(out?.level_estimate)) {
    errors.push('level_estimate invalide')
  }
  return errors
}

// --- Dialogue simulé (Phase 7) ---
// Schéma d'un tour : la réplique du personnage, 2-3 suggestions de réponse
// (béquilles pour les niveaux A1-A2) et le jugement « scène terminée ».
export const DIALOGUE_TURN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'suggested_replies', 'done'],
  properties: {
    reply: {
      type: 'string',
      description: 'Réplique du personnage, en italien, courte (2 à 3 phrases)',
    },
    suggested_replies: {
      type: 'array',
      items: { type: 'string' },
      description:
        "2 à 3 réponses possibles très courtes (en italien, adaptées au niveau demandé) que l'élève pourrait faire",
    },
    done: {
      type: 'boolean',
      description: 'true seulement quand la scène est naturellement terminée',
    },
  },
}

// Schéma du bilan de clôture : corrections légères des répliques de l'élève,
// expliquées en français.
export const DIALOGUE_FEEDBACK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['feedback'],
  properties: {
    feedback: {
      type: 'array',
      description: "Points d'amélioration relevés dans les répliques de l'élève (5 maximum)",
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['original', 'better', 'explanation'],
        properties: {
          original: { type: 'string', description: "Ce que l'élève a écrit (passage exact)" },
          better: { type: 'string', description: 'Formulation plus correcte ou plus naturelle' },
          explanation: {
            type: 'string',
            description: 'Explication pédagogique en français simple (1 à 2 phrases)',
          },
        },
      },
    },
  },
}

// Contrôles structurels bloquants sur la sortie d'un tour de dialogue (on ne
// fait pas confiance au modèle, même contraint par le schéma).
export function validateDialogueTurnStructure(out) {
  const errors = []
  if (typeof out?.reply !== 'string' || !out.reply.trim()) {
    errors.push('reply manquant ou vide')
  }
  if (!Array.isArray(out?.suggested_replies)) {
    errors.push('suggested_replies absent ou non-tableau')
  } else if (out.suggested_replies.some((s) => typeof s !== 'string' || !s.trim())) {
    errors.push('suggested_replies : entrée vide ou non-texte')
  }
  if (typeof out?.done !== 'boolean') {
    errors.push('done absent ou non-booléen')
  }
  return errors
}

// Contrôles structurels bloquants sur le bilan de clôture. Un tableau vide
// est valide (aucune erreur notable relevée).
export function validateDialogueFeedbackStructure(out) {
  const errors = []
  if (!Array.isArray(out?.feedback)) {
    errors.push('feedback absent ou non-tableau')
  } else {
    for (const [i, f] of out.feedback.entries()) {
      for (const field of ['original', 'better', 'explanation']) {
        if (typeof f?.[field] !== 'string' || !f[field].trim()) {
          errors.push(`feedback ${i + 1} : ${field} manquant`)
        }
      }
    }
  }
  return errors
}

// Schéma pour la proposition de sujet (orchestrateur).
export const TOPIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['slug', 'topic'],
  properties: {
    slug: {
      type: 'string',
      description:
        'Identifiant court en italien, minuscules, mots séparés par _, sans accents (ex. "mercato_rialto")',
    },
    topic: {
      type: 'string',
      description: 'Sujet du texte, une ou deux phrases en français',
    },
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
    if (typeof q.explanation !== 'string' || !q.explanation.trim())
      errors.push(`question ${i + 1} : explication manquante`)
  }
  return errors
}

export function countWords(paragraphs) {
  return paragraphs.reduce((n, p) => n + tokenizeWords(p).length, 0)
}

// Extrait pour l'index (même style que les entrées existantes).
export function makeExcerpt(paragraphs, max = 140) {
  const first = paragraphs[0] ?? ''
  return first.length <= max ? first : first.slice(0, max - 1).trimEnd() + '…'
}
