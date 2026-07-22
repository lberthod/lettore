// Traduction locale : recherche dans le lexique du texte courant (src/texts.json).
// Aucune API externe — tout est généré à l'avance.

function normalizeWord(word) {
  return word.toLowerCase().replace(/’/g, "'")
}

export function lookupWord(textData, word) {
  const key = normalizeWord(word)
  return (
    textData.words[key] ??
    // tolère un apostrophe final absent du lexique (ex. « po' » vs « po »)
    textData.words[key.replace(/'$/, '')] ??
    null
  )
}

export function lookupSentence(textData, sentence) {
  const key = sentence.trim().replace(/\s+/g, ' ')
  return textData.sentences[key] ?? null
}
