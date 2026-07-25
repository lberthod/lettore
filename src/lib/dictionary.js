// Dictionnaire italien-français : fiches lexicographiques (définition, nature
// grammaticale, exemples, synonymes) + tables de conjugaison, pré-générées
// une fois par lots (voir scripts/data/pilot/) puis stockées ici en JSON
// statique. Aucun appel réseau/LLM au runtime.
//
// PILOTE : ce jeu de données ne couvre encore qu'un petit échantillon
// (~30 lemmes autour de « abbandonare ») le temps de valider le format
// avant de lancer la génération complète (~10-12k lemmes estimés).
import lemmas from '../dictionary/lemmas.json'
import conjugations from '../dictionary/conjugations.json'
import wordIndex from '../dictionary/word-index.json'

function normalize(word) {
  return word
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[’‘´`]/g, "'")
}

// Résout n'importe quelle forme rencontrée dans un texte (ex. « abbandonava »)
// vers son lemme (« abbandonare »), puis retourne la fiche complète.
export function lookupDictionary(word) {
  const key = normalize(word)
  const lemma = wordIndex[key]
  if (!lemma) return null
  const entry = lemmas[lemma]
  if (!entry) return null
  return { ...entry, conjugation: entry.isVerb ? conjugations[lemma] ?? null : null }
}

export function getConjugation(verb) {
  const key = normalize(verb)
  const lemma = wordIndex[key] ?? key
  return conjugations[lemma] ?? null
}

// Recherche libre (page /dizionario) : correspondance sur le lemme, les
// formes fléchies indexées, ou la traduction française.
export function searchDictionary(query) {
  const q = normalize(query)
  if (!q) return []
  const matchedLemmas = new Set()
  for (const [form, lemma] of Object.entries(wordIndex)) {
    if (form.startsWith(q)) matchedLemmas.add(lemma)
  }
  for (const [lemma, entry] of Object.entries(lemmas)) {
    if (entry.fr.toLowerCase().includes(q)) matchedLemmas.add(lemma)
  }
  return [...matchedLemmas]
    .map((lemma) => lemmas[lemma])
    .filter(Boolean)
    .sort((a, b) => a.lemma.localeCompare(b.lemma, 'it'))
}

export function allLemmas() {
  return Object.values(lemmas).sort((a, b) => a.lemma.localeCompare(b.lemma, 'it'))
}

export function allVerbs() {
  return allLemmas().filter((l) => l.isVerb)
}

export function dictionaryEntryCount() {
  return Object.keys(lemmas).length
}
