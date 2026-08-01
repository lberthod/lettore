import { describe, it, expect } from 'vitest'
import { guessGrammarTopic } from './grammarLinks.js'

describe('guessGrammarTopic — lien carte d’erreur → section de grammaire (§9.4)', () => {
  it('détecte un pronom complément', () => {
    expect(guessGrammarTopic('Io lo vedo', 'Lo vedo')).toBe('pronoms')
  })

  it('détecte une négation double', () => {
    expect(guessGrammarTopic('Non ho visto niente di strano', 'Non ho visto niente')).toBe(
      'negation'
    )
  })

  it('détecte piacere', () => {
    expect(guessGrammarTopic('Io piaccio la pizza', 'Mi piace la pizza')).toBe('piacere')
  })

  it('renvoie null quand rien ne correspond', () => {
    expect(guessGrammarTopic('', '')).toBeNull()
  })
})
