import { describe, it, expect } from 'vitest'
import {
  selectPriorityErrors,
  checkRewrite,
  hintFor,
  MAX_RETRY_ERRORS,
  isDelayedReview,
  DELAYED_REVIEW_MIN_DAYS,
} from './correctionRetry.js'

const DAY = 24 * 60 * 60 * 1000

describe('selectPriorityErrors', () => {
  it('ne sélectionne rien pour une liste vide', () => {
    expect(selectPriorityErrors([])).toEqual([])
    expect(selectPriorityErrors(null)).toEqual([])
    expect(selectPriorityErrors(undefined)).toEqual([])
  })

  it('ne dépasse jamais MAX_RETRY_ERRORS (2) même avec beaucoup d’erreurs', () => {
    const errors = Array.from({ length: 6 }, (_, i) => ({
      original: `o${i}`,
      correction: `c${i}`,
      type: 'grammatica',
    }))
    const selected = selectPriorityErrors(errors)
    expect(selected.length).toBe(MAX_RETRY_ERRORS)
  })

  it('priorise grammatica avant lessico, ortografia, registro (section 5.3)', () => {
    const errors = [
      { original: 'a', correction: 'A', type: 'registro' },
      { original: 'b', correction: 'B', type: 'ortografia' },
      { original: 'c', correction: 'C', type: 'lessico' },
      { original: 'd', correction: 'D', type: 'grammatica' },
    ]
    const selected = selectPriorityErrors(errors, { max: 4 })
    expect(selected.map((e) => e.type)).toEqual([
      'grammatica',
      'lessico',
      'ortografia',
      'registro',
    ])
  })

  it('à rang égal, le type qui revient le plus souvent (erreur récurrente) passe devant', () => {
    const errors = [
      { original: 'a', correction: 'A', type: 'lessico' },
      { original: 'b', correction: 'B', type: 'grammatica' },
      { original: 'c', correction: 'C', type: 'grammatica' },
    ]
    const selected = selectPriorityErrors(errors, { max: 3 })
    // Les deux erreurs de grammaire (récurrentes) passent avant l'erreur lexicale isolée.
    expect(selected[0].type).toBe('grammatica')
    expect(selected[1].type).toBe('grammatica')
    expect(selected[2].type).toBe('lessico')
  })

  it('ignore les entrées sans original/correction exploitables', () => {
    const errors = [
      { original: '', correction: 'X', type: 'grammatica' },
      { original: 'y', correction: '', type: 'grammatica' },
      { original: 'z', correction: 'Z', type: 'grammatica' },
    ]
    const selected = selectPriorityErrors(errors, { max: 5 })
    expect(selected).toEqual([{ original: 'z', correction: 'Z', type: 'grammatica' }])
  })
})

describe('checkRewrite', () => {
  it('valide une reformulation identique à la correction attendue', () => {
    const { success, score } = checkRewrite(
      'Sono andato a Roma ieri mattina.',
      'Sono andato a Roma ieri mattina.',
    )
    expect(success).toBe(true)
    expect(score).toBe(100)
  })

  it('rejette une reformulation trop éloignée', () => {
    const { success } = checkRewrite('Ciao come stai', 'Sono andato a Roma ieri mattina.')
    expect(success).toBe(false)
  })
})

describe('hintFor', () => {
  it('renvoie la première moitié des mots, jamais la phrase entière', () => {
    expect(hintFor('Sono andato a Roma ieri mattina')).toBe('Sono andato a …')
  })

  it('gère une correction vide sans planter', () => {
    expect(hintFor('')).toBe('')
    expect(hintFor(undefined)).toBe('')
  })

  it('gère un seul mot', () => {
    expect(hintFor('Ciao')).toBe('Ciao …')
  })
})

describe('isDelayedReview — réussite différée vs reprise immédiate (Sprint 1.2)', () => {
  it('faux sans horodatage de correction', () => {
    expect(isDelayedReview(null)).toBe(false)
    expect(isDelayedReview(undefined)).toBe(false)
    expect(isDelayedReview(0)).toBe(false)
  })

  it('faux le jour même de la correction (reprise immédiate)', () => {
    const now = Date.now()
    expect(isDelayedReview(now, now)).toBe(false)
    expect(isDelayedReview(now - (DELAYED_REVIEW_MIN_DAYS * DAY - 1), now)).toBe(false)
  })

  it('vrai au moins DELAYED_REVIEW_MIN_DAYS jours après la correction', () => {
    const now = Date.now()
    expect(isDelayedReview(now - DELAYED_REVIEW_MIN_DAYS * DAY, now)).toBe(true)
    expect(isDelayedReview(now - 10 * DAY, now)).toBe(true)
  })
})
