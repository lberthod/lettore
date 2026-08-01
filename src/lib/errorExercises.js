// Exercices de révision sur les cartes d'erreur (IntegartioNOptimsaitonPedago.MD
// §8.2) : corriger la phrase, compléter la forme manquante, choisir entre
// deux formulations proches. Module pur — la sélection du type dépend de
// `card.type`, WordsView.vue se charge seulement de l'affichage et de la
// saisie.
import { comparePhrases } from './textSimilarity.js'

function tokenize(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean)
}

function stripPunctuation(s) {
  return String(s || '').toLowerCase().replace(/[.,;:!?«»"“”()]/g, '').trim()
}

// Complète la forme manquante : trouve le premier mot où la correction
// diffère de la production fautive et le remplace par un blanc. Repli sur
// le dernier mot de la correction si aucune différence mot-à-mot n'est
// détectée (ex. réordonnancement complet).
function buildFillBlank(card) {
  const origWords = tokenize(card.original)
  const corrWords = tokenize(card.correction)
  let idx = corrWords.findIndex(
    (w, i) => stripPunctuation(w) !== stripPunctuation(origWords[i])
  )
  if (idx === -1) idx = corrWords.length - 1
  const answer = stripPunctuation(corrWords[idx])
  const prompt = corrWords.map((w, i) => (i === idx ? '____' : w)).join(' ')
  return { kind: 'fillBlank', card, prompt, answer }
}

// Choisir entre deux formulations proches : la correction contre soit un
// exemple contrastif fourni (registre/nuance), soit la production fautive
// d'origine à défaut.
function buildChooseBetween(card) {
  const alt = card.contrastExample || card.original
  const options = [card.correction, alt].filter(
    (v, i, arr) => v && arr.indexOf(v) === i
  )
  if (options.length < 2) options.push(card.original)
  return { kind: 'chooseBetween', card, options: shuffle(options), correct: card.correction }
}

// Corriger la phrase : la production fautive est affichée, l'apprenant doit
// retrouver la correction complète (comme la reprise après feedback, §5).
function buildCorrectSentence(card) {
  return { kind: 'correct', card, prompt: card.original, answer: card.correction }
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5)
}

// Le type d'erreur suggère l'exercice le plus utile (§8.2) : un article ou
// une terminaison se prête à un texte à trou, un problème de registre à un
// choix contextualisé, un problème lexical à une reformulation complète.
export function buildExercise(card) {
  const type = card?.type
  if (type === 'grammatica' || type === 'ortografia') return buildFillBlank(card)
  if (type === 'registro') return buildChooseBetween(card)
  return buildCorrectSentence(card)
}

// Seuil de tolérance pour 'correct' (typos, ponctuation) : même mécanique
// que checkRewrite (lib/correctionRetry.js).
export const EXERCISE_SUCCESS_THRESHOLD = 85

export function checkExerciseAnswer(exercise, attempt) {
  if (!exercise) return false
  if (exercise.kind === 'chooseBetween') return attempt === exercise.correct
  if (exercise.kind === 'fillBlank') {
    return stripPunctuation(attempt) === stripPunctuation(exercise.answer)
  }
  const { score } = comparePhrases(exercise.answer, attempt)
  return score >= EXERCISE_SUCCESS_THRESHOLD
}
