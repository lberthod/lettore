import { describe, it, expect } from 'vitest'
import { normalize, tokenize, comparePhrases } from './textSimilarity.js'

describe('normalize', () => {
  it('passe en minuscules et retire la ponctuation', () => {
    expect(normalize('Ciao, come stai?')).toBe('ciao come stai')
  })

  it("retire les accents par défaut, les garde sur demande", () => {
    expect(normalize('Perché è così')).toBe('perche e cosi')
    expect(normalize('Perché è così', { stripAccents: false })).toBe(
      'perché è così',
    )
  })

  it("conserve l'apostrophe (élision italienne) et uniformise la typographique", () => {
    expect(normalize('L’acqua è fredda')).toBe("l'acqua e fredda")
  })
})

describe('tokenize', () => {
  it('découpe sur les espaces', () => {
    expect(tokenize('Buongiorno a tutti!')).toEqual([
      'buongiorno',
      'a',
      'tutti',
    ])
  })

  it('retourne une liste vide pour une chaîne vide ou sans mots', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize('  ... !! ')).toEqual([])
  })
})

describe('comparePhrases', () => {
  it('phrase identique → score 100, tous les mots ok', () => {
    const { score, words } = comparePhrases(
      'Il gatto dorme sul divano',
      'Il gatto dorme sul divano',
    )
    expect(score).toBe(100)
    expect(words).toHaveLength(5)
    expect(words.every((w) => w.status === 'ok')).toBe(true)
  })

  it('ponctuation, majuscules et accents ignorés → score 100', () => {
    const { score } = comparePhrases('Perché piove, oggi?', 'perche piove oggi')
    expect(score).toBe(100)
  })

  it('mot manquant → score < 100 et mot marqué missed', () => {
    const { score, words } = comparePhrases(
      'Il gatto dorme bene',
      'Il gatto bene',
    )
    expect(score).toBe(75) // 3 mots sur 4
    expect(words).toEqual([
      { word: 'il', status: 'ok' },
      { word: 'gatto', status: 'ok' },
      { word: 'dorme', status: 'missed' },
      { word: 'bene', status: 'ok' },
    ])
  })

  it('mot en trop → pénalisé et marqué extra', () => {
    const { score, words } = comparePhrases(
      'Il gatto dorme',
      'Il grande gatto dorme',
    )
    expect(score).toBe(75) // 3 matchs / max(3, 4)
    expect(words).toEqual([
      { word: 'il', status: 'ok' },
      { word: 'grande', status: 'extra' },
      { word: 'gatto', status: 'ok' },
      { word: 'dorme', status: 'ok' },
    ])
  })

  it('mot substitué → cible missed + mot dit extra', () => {
    const { score, words } = comparePhrases('Il gatto dorme', 'Il cane dorme')
    expect(score).toBe(67) // 2 matchs sur 3
    expect(words).toContainEqual({ word: 'gatto', status: 'missed' })
    expect(words).toContainEqual({ word: 'cane', status: 'extra' })
  })

  it('rien reconnu (chaîne vide) → score 0, tous les mots missed', () => {
    const { score, words } = comparePhrases('Buona sera', '')
    expect(score).toBe(0)
    expect(words).toEqual([
      { word: 'buona', status: 'missed' },
      { word: 'sera', status: 'missed' },
    ])
  })

  it('cible vide → score 0 sans planter', () => {
    expect(comparePhrases('', '')).toEqual({ score: 0, words: [] })
    expect(comparePhrases('', 'ciao')).toEqual({
      score: 0,
      words: [{ word: 'ciao', status: 'extra' }],
    })
  })
})
