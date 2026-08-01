// Lien carte d'erreur → section précise de GrammarView.vue
// (IntegartioNOptimsaitonPedago.MD §9.4). Heuristique volontairement simple
// et locale (pas d'appel IA) : quelques indices lexicaux suffisent à orienter
// vers la bonne section de référence dans la plupart des cas fréquents chez
// des francophones. Une erreur qui ne correspond à aucun indice ne propose
// simplement pas de lien plutôt que d'en deviner un mauvais.
// Ordre volontaire : les indices les plus spécifiques (formes verbales,
// négation double, comparatifs…) sont testés avant les indices les plus
// ambigus — l'article « la » et le pronom « la » s'écrivent pareil, ce que
// seule une analyse grammaticale complète pourrait vraiment distinguer.
const RULES = [
  { topic: 'piacere', test: /\bpiac(e|ciono|iuto)\b/i },
  { topic: 'negation', test: /\bnon\b.*\b(mai|niente|nessuno)\b|\b(mai|niente|nessuno)\b.*\bnon\b/i },
  { topic: 'comparatif', test: /\b(più|meno|issimo|issima)\b/i },
  { topic: 'quantite', test: /\b(molto|molti|molta|molte|tanto|poco|troppo)\b/i },
  { topic: 'possessifs', test: /\b(mio|mia|miei|mie|tuo|tua|tuoi|tue|suo|sua|nostro|vostro|loro)\b/i },
  { topic: 'prepositions', test: /\b(del|dello|della|dei|degli|delle|al|allo|alla|ai|agli|alle|dal|dallo|dalla|nel|nello|nella|sul|sullo|sulla)\b/i },
  { topic: 'pronoms', test: /\b(mi|ti|gli|le|ci|vi|lo|la|li|ne)\b/i },
  { topic: 'demonstratifs', test: /\b(questo|questa|quello|quella|quei|quegli)\b/i },
  { topic: 'articles', test: /\b(il|lo|la|i|gli|le|un|uno|una)\b/i },
  { topic: 'ortho-accents', test: /[àèéìòù]/i },
]

// Devine la section de grammaire la plus pertinente à partir du texte de
// l'erreur (original + correction). `null` si rien ne correspond : mieux
// vaut ne pas proposer de lien qu'un lien hors sujet.
export function guessGrammarTopic(original, correction) {
  const text = `${original || ''} ${correction || ''}`
  for (const rule of RULES) {
    if (rule.test.test(text)) return rule.topic
  }
  return null
}
