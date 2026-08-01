import { describe, it, expect } from 'vitest'
import { buildExercise, checkExerciseAnswer } from './errorExercises.js'

describe('errorExercises — types d’exercices sur les cartes d’erreur (§8.2)', () => {
  it('grammatica/ortografia → texte à trou sur le premier mot qui diffère', () => {
    const card = {
      type: 'grammatica',
      original: 'Io ho andato a Roma ieri.',
      correction: 'Io sono andato a Roma ieri.',
    }
    const ex = buildExercise(card)
    expect(ex.kind).toBe('fillBlank')
    expect(ex.answer.toLowerCase()).toBe('sono')
    expect(ex.prompt).toContain('____')
    expect(ex.prompt).not.toContain('sono')
  })

  it('registro → choisir entre deux formulations proches', () => {
    const card = {
      type: 'registro',
      original: 'Ciao prof, come va?',
      correction: 'Buongiorno professore, come sta?',
      contrastExample: 'Ehi prof, tutto bene?',
    }
    const ex = buildExercise(card)
    expect(ex.kind).toBe('chooseBetween')
    expect(ex.options).toHaveLength(2)
    expect(ex.options).toContain(card.correction)
    expect(ex.correct).toBe(card.correction)
  })

  it('lessico (et tout type par défaut) → corriger la phrase entière', () => {
    const card = {
      type: 'lessico',
      original: 'Ho fatto una fotografia bellissima.',
      correction: 'Ho scattato una fotografia bellissima.',
    }
    const ex = buildExercise(card)
    expect(ex.kind).toBe('correct')
    expect(ex.prompt).toBe(card.original)
    expect(ex.answer).toBe(card.correction)
  })

  it('fillBlank : la comparaison ignore la casse et la ponctuation', () => {
    const ex = buildExercise({
      type: 'ortografia',
      original: 'ho magiato la pizza.',
      correction: 'ho mangiato la pizza.',
    })
    expect(checkExerciseAnswer(ex, 'Mangiato')).toBe(true)
    expect(checkExerciseAnswer(ex, 'magiato')).toBe(false)
  })

  it('chooseBetween : seule la correction exacte est acceptée', () => {
    const ex = buildExercise({
      type: 'registro',
      original: 'Ciao',
      correction: 'Buongiorno',
    })
    expect(checkExerciseAnswer(ex, ex.correct)).toBe(true)
    expect(checkExerciseAnswer(ex, 'autre chose')).toBe(false)
  })

  it('correct : tolère les petites variations (comme checkRewrite)', () => {
    const ex = buildExercise({
      type: 'lessico',
      original: 'Vado al mercato.',
      correction: 'Vado al mercato oggi.',
    })
    expect(checkExerciseAnswer(ex, 'Vado al mercato oggi')).toBe(true)
    expect(checkExerciseAnswer(ex, 'Sono andato altrove')).toBe(false)
  })
})
