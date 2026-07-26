// Agrégation du vocabulaire du corpus (lexique mot → traduction de chaque
// texte), par niveau CECR.
//
// Module volontairement pur (ni Vue, ni Firebase, ni accès disque) : il
// tourne côté Node dans scripts/sync-content.mjs, qui parcourt les fichiers
// du catalogue et publie le résultat dans Firestore (`contentStats`). La page
// d'administration lit cet agrégat au lieu de recalculer — le contenu réservé
// n'étant plus dans le build, le recalcul côté navigateur téléchargerait tout
// le catalogue (462 lectures Firestore).

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

// Normalise une clé du lexique pour que deux entrées désignant le même mot
// italien ne soient jamais comptées comme deux mots distincts : différences
// de casse, variantes d'apostrophe, accents décomposés (NFD), ponctuation ou
// annotation grammaticale résiduelle (ex. « improvvisata (agg.) »), et le
// suffixe numérique parfois ajouté par la génération pour éviter une
// collision de clé JSON quand un même mot apparaît deux fois dans un texte
// avec deux sens différents (ex. « cosa2 » à côté de « cosa »).
export function normalizeWord(word) {
  return word
    .normalize('NFC')
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, '') // "improvvisata (agg.)" -> "improvvisata"
    .replace(/[,.;:!?…]+$/, '') // "tempo," -> "tempo"
    .replace(/(\p{L})\d+$/u, '$1') // "cosa2" -> "cosa"
    .trim()
    .toLowerCase()
    .replace(/[’‘´`]/g, "'") // variantes d'apostrophe -> apostrophe droite
}

// Ajoute un mot à la map en fusionnant les traductions quand une même clé
// normalisée porte plusieurs sens (au lieu d'en écraser silencieusement une) :
// « cosa » -> « quoi » puis « cosa2 » -> « chose » donnent « quoi / chose ».
function addWord(map, word, translation) {
  if (!word) return
  const existing = map.get(word)
  if (existing == null) {
    map.set(word, translation)
    return
  }
  if (translation && translation !== existing) {
    const parts = new Set(existing.split(' / ').map((p) => p.trim()))
    parts.add(translation.trim())
    map.set(word, [...parts].join(' / '))
  }
}

// Accumulateur : on lui passe chaque texte du corpus ({ level, words }), il
// rend les listes triées par niveau et l'ensemble global.
export function createVocabAggregator() {
  const byLevel = new Map(LEVELS.map((level) => [level, new Map()]))
  const overall = new Map()

  const toSortedList = (map) =>
    [...map.entries()]
      .map(([word, translation]) => ({ word, translation }))
      .sort((a, b) => a.word.localeCompare(b.word, 'it'))

  return {
    add(text) {
      if (!text?.words || !LEVELS.includes(text.level)) return
      const levelMap = byLevel.get(text.level)
      for (const [rawWord, translation] of Object.entries(text.words)) {
        const word = normalizeWord(rawWord)
        addWord(overall, word, translation)
        addWord(levelMap, word, translation)
      }
    },
    result() {
      const levels = LEVELS.map((level) => {
        const words = toSortedList(byLevel.get(level))
        return { level, count: words.length, words }
      })
      const words = toSortedList(overall)
      return { totalCount: words.length, words, levels }
    },
  }
}
