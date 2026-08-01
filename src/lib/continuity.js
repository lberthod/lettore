// Continuité entre les activités (IntegartioNOptimsaitonPedago.MD §9) : une
// seule suite recommandée à la fois (§3.1 — une seule intention par écran),
// jamais une liste d'options équivalentes. Module pur, branché sur les
// écrans existants (ReaderView, WordsView, GrammarView) plutôt que de créer
// une navigation parallèle.

export const LOW_SCORE_RATIO = 0.6
export const GOOD_SCORE_RATIO = 0.8
export const MANY_TRANSLATIONS = 3

// §9.1 — depuis la lecture (ou l'écoute, qui partage le même quiz) : LA
// suite recommandée après le quiz, selon le score, l'usage des traductions
// et le genre du texte. `null` quand rien de plus utile qu'une lecture libre
// n'est identifiable — l'appelant garde alors son repli habituel
// (recommendText / bibliothèque).
export function nextAfterQuiz({
  score = 0,
  total = 0,
  mode = 'lettura',
  genre = null,
  translatedWords = [],
  textId = null,
  hasPremiumIA = false,
} = {}) {
  const ratio = total > 0 ? score / total : 1
  const distinctWords = [...new Set(translatedWords)]

  // Score faible : (ré)écouter avec le texte, ou relire.
  if (ratio < LOW_SCORE_RATIO) {
    if (mode === 'ascolto') {
      return {
        id: 'reveal-relisten',
        title: 'Réécouter avec le texte',
        reason: 'Le score est encore bas — affichez le texte pour réécouter avec le support écrit.',
        action: 'reveal',
        cta: 'Afficher le texte',
      }
    }
    return {
      id: 'reread',
      title: 'Relire ce texte',
      reason: 'Le score est encore bas — une seconde lecture aide à mieux comprendre.',
      to: textId ? { name: 'reader', params: { id: textId } } : null,
      cta: 'Relire',
    }
  }

  // Texte de type dialogue : jouer une situation proche (Premium IA requis).
  if (genre === 'dialogo' && hasPremiumIA) {
    return {
      id: 'dialogo',
      title: 'Jouer une situation proche',
      reason: 'Ce texte est un dialogue — entraînez-vous à une situation proche à l’oral.',
      to: { name: 'dialogue' },
      cta: 'Dialoguer',
    }
  }

  // Score correct mais beaucoup de traductions utilisées : relire sans aides.
  if (ratio < GOOD_SCORE_RATIO && distinctWords.length >= MANY_TRANSLATIONS) {
    return {
      id: 'reread-no-help',
      title: 'Relire sans traduction',
      reason: 'Bon score, mais beaucoup de mots traduits — relisez sans ouvrir les traductions.',
      to: textId ? { name: 'reader', params: { id: textId } } : null,
      cta: 'Relire',
    }
  }

  // Vocabulaire nouveau : le réutiliser tout de suite en production.
  if (distinctWords.length >= MANY_TRANSLATIONS && hasPremiumIA) {
    return {
      id: 'reuse-words',
      title: 'Réutiliser 3 mots',
      reason: 'Réutilisez tout de suite le vocabulaire découvert dans une courte phrase.',
      to: {
        name: 'write',
        query: {
          mode: 'contenuto',
          action: 'riuso',
          sourceTextId: textId || undefined,
          words: distinctWords.slice(0, 3).join(','),
        },
      },
      cta: 'Écrire',
    }
  }

  // Bon score : résumer (production) ou écouter sans texte (compréhension
  // orale pure), selon l'activité déjà pratiquée.
  if (ratio >= GOOD_SCORE_RATIO) {
    if (mode === 'ascolto' && hasPremiumIA) {
      return {
        id: 'summarize',
        title: 'Résumer ce texte',
        reason: 'Bon score à l’écoute — résumez ce que vous avez compris.',
        to: { name: 'write', query: { mode: 'contenuto', action: 'riassumere', sourceTextId: textId || undefined } },
        cta: 'Écrire',
      }
    }
    if (mode !== 'ascolto') {
      return {
        id: 'listen-no-text',
        title: 'Écouter sans texte',
        reason: 'Bon score en lecture — essayez la même histoire à l’oral, sans le texte.',
        to: textId ? { name: 'reader', params: { id: textId }, query: { mode: 'ascolto' } } : null,
        cta: 'Écouter',
      }
    }
  }

  return null
}

// §9.3 — depuis une révision de vocabulaire : après une session de
// répétition espacée, une seule proposition de production réutilisant 2-3
// mots revus (jamais l'exigence de tous les mots — la phrase deviendrait
// artificielle).
export function suggestProductionFromReview(reviewedWords, { hasPremiumIA = false } = {}) {
  const words = [...new Set(reviewedWords)].filter(Boolean).slice(0, 3)
  if (words.length < 2 || !hasPremiumIA) return null
  return {
    id: 'reuse-reviewed-words',
    title: 'Écrire avec ces mots',
    reason: `Réutilisez ${words.length} mot${words.length > 1 ? 's' : ''} que vous venez de réviser.`,
    to: { name: 'write', query: { mode: 'contenuto', action: 'riuso', words: words.join(',') } },
    cta: 'Écrire',
  }
}
