import { describe, it, expect } from 'vitest'
import { nextAfterQuiz, suggestProductionFromReview } from './continuity.js'

describe('nextAfterQuiz — continuité depuis la lecture/écoute (§9.1, §9.2)', () => {
  it('score faible en lecture → relire ce texte', () => {
    const next = nextAfterQuiz({ score: 1, total: 5, mode: 'lettura', textId: 't1' })
    expect(next.id).toBe('reread')
    expect(next.to).toEqual({ name: 'reader', params: { id: 't1' } })
  })

  it('score faible en écoute → réécouter avec le texte (action sur place)', () => {
    const next = nextAfterQuiz({ score: 1, total: 5, mode: 'ascolto', textId: 't1' })
    expect(next.id).toBe('reveal-relisten')
    expect(next.action).toBe('reveal')
  })

  it('texte de genre dialogue, bon score, Premium IA → jouer une situation proche', () => {
    const next = nextAfterQuiz({
      score: 5,
      total: 5,
      mode: 'lettura',
      genre: 'dialogo',
      textId: 't1',
      hasPremiumIA: true,
    })
    expect(next.id).toBe('dialogo')
    expect(next.to).toEqual({ name: 'dialogue' })
  })

  it('score correct mais beaucoup de traductions → relire sans traduction', () => {
    const next = nextAfterQuiz({
      score: 3,
      total: 5,
      mode: 'lettura',
      translatedWords: ['casa', 'mare', 'sole'],
      textId: 't1',
    })
    expect(next.id).toBe('reread-no-help')
  })

  it('vocabulaire nouveau (Premium IA) → réutiliser 3 mots en écriture', () => {
    const next = nextAfterQuiz({
      score: 4,
      total: 5,
      mode: 'lettura',
      translatedWords: ['casa', 'mare', 'sole', 'sole'],
      textId: 't1',
      hasPremiumIA: true,
    })
    expect(next.id).toBe('reuse-words')
    expect(next.to.query.words.split(',')).toHaveLength(3)
  })

  it('bon score en lecture, peu de traductions → écouter sans texte', () => {
    const next = nextAfterQuiz({ score: 5, total: 5, mode: 'lettura', textId: 't1' })
    expect(next.id).toBe('listen-no-text')
    expect(next.to).toEqual({ name: 'reader', params: { id: 't1' }, query: { mode: 'ascolto' } })
  })

  it('bon score en écoute, Premium IA → résumer', () => {
    const next = nextAfterQuiz({
      score: 5,
      total: 5,
      mode: 'ascolto',
      textId: 't1',
      hasPremiumIA: true,
    })
    expect(next.id).toBe('summarize')
  })

  it('sans indice pertinent (score moyen, pas de Premium IA) → aucune suite forcée', () => {
    const next = nextAfterQuiz({ score: 4, total: 5, mode: 'ascolto', textId: 't1' })
    expect(next).toBeNull()
  })
})

describe('suggestProductionFromReview — continuité depuis le vocabulaire (§9.3)', () => {
  it('propose 2-3 mots revus, jamais plus, seulement avec Premium IA', () => {
    const s = suggestProductionFromReview(['casa', 'mare', 'sole', 'pane'], { hasPremiumIA: true })
    expect(s.to.query.words.split(',')).toHaveLength(3)
  })

  it('un seul mot revu → pas de suggestion (la phrase serait artificielle)', () => {
    expect(suggestProductionFromReview(['casa'], { hasPremiumIA: true })).toBeNull()
  })

  it('sans Premium IA → pas de suggestion (l’écriture y est réservée)', () => {
    expect(suggestProductionFromReview(['casa', 'mare'], { hasPremiumIA: false })).toBeNull()
  })
})
