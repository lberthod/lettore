// Progression locale : textes lus, mots favoris, préférences.
// Tout est stocké dans localStorage — aucun compte, aucune API.

import { reactive, watch } from 'vue'

const KEY = 'lettore.progress'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {}
  } catch {
    return {}
  }
}

const saved = load()

// Répétition espacée (boîtes de Leitner) : intervalle avant la prochaine
// révision selon la boîte du mot (0 = nouveau … 5 = bien connu).
const DAY = 24 * 60 * 60 * 1000
const INTERVALS = [0, 1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY]
export const MAX_BOX = INTERVALS.length - 1

// Migration : les favoris enregistrés avant la répétition espacée
// reçoivent une boîte 0 et sont immédiatement révisables.
const favorites = (saved.favorites || []).map((f) => ({
  box: 0,
  due: 0,
  ...f,
}))

export const progress = reactive({
  readTexts: saved.readTexts || [], // ids des textes terminés (quiz réussi)
  favorites, // { word, translation, textId, box, due }
  knownWords: saved.knownWords || [], // mots déjà maîtrisés (mode vocabulaire)
  vocabTexts: saved.vocabTexts || [], // ids des textes ajoutés au mode vocabulaire
  ttsRate: saved.ttsRate || 0.9,
  hintDismissed: saved.hintDismissed || false,
})

watch(
  progress,
  () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(progress))
    } catch {
      // stockage plein ou indisponible : on continue sans persister
    }
  },
  { deep: true }
)

export function isRead(id) {
  return progress.readTexts.includes(id)
}

export function markRead(id) {
  if (!isRead(id)) progress.readTexts.push(id)
}

export function isFavorite(word) {
  return progress.favorites.some((f) => f.word === word)
}

export function isKnown(word) {
  return progress.knownWords.includes(word.toLowerCase())
}

export function markKnown(word) {
  const w = word.toLowerCase()
  if (!isKnown(w)) progress.knownWords.push(w)
}

export function unmarkKnown(word) {
  const i = progress.knownWords.indexOf(word.toLowerCase())
  if (i >= 0) progress.knownWords.splice(i, 1)
}

export function isInVocabMode(id) {
  return progress.vocabTexts.includes(id)
}

export function toggleVocabText(id) {
  const i = progress.vocabTexts.indexOf(id)
  if (i >= 0) progress.vocabTexts.splice(i, 1)
  else progress.vocabTexts.push(id)
}

export function toggleFavorite(entry) {
  const i = progress.favorites.findIndex((f) => f.word === entry.word)
  if (i >= 0) progress.favorites.splice(i, 1)
  else progress.favorites.push({ ...entry, box: 0, due: 0 })
}

// Mots dont la révision est arrivée à échéance
export function dueFavorites() {
  const now = Date.now()
  return progress.favorites.filter((f) => (f.due || 0) <= now)
}

// Résultat d'une révision : réussite → boîte suivante (intervalle plus long),
// échec → retour à la boîte 0 (revu dès la prochaine session).
export function reviewWord(word, success) {
  const f = progress.favorites.find((x) => x.word === word)
  if (!f) return
  f.box = success ? Math.min((f.box || 0) + 1, MAX_BOX) : 0
  f.due = Date.now() + INTERVALS[f.box]
}
