import { describe, it, expect } from 'vitest'
import {
  LEVELS,
  QUESTIONS_BY_LEVEL,
  pickQuestion,
  estimateLevel,
  summarizeSelfAssessment,
  describeRecommendation,
} from './levelTestEngine.js'

describe('pickQuestion — anti-répétition partagée (§3.1)', () => {
  it("renvoie une question du niveau demandé, avec q/options/correct", () => {
    const usedByLevel = {}
    const q = pickQuestion('A1', usedByLevel)
    expect(q.level).toBe('A1')
    expect(typeof q.q).toBe('string')
    expect(Array.isArray(q.options)).toBe(true)
    expect(typeof q.correct).toBe('number')
  })

  it('ne repose jamais la même question tant que la banque du niveau n’est pas épuisée', () => {
    const usedByLevel = {}
    const bankSize = QUESTIONS_BY_LEVEL.A1.length
    const seen = new Set()
    for (let i = 0; i < bankSize; i++) {
      const q = pickQuestion('A1', usedByLevel)
      seen.add(q.index)
    }
    expect(seen.size).toBe(bankSize)
  })

  it('relâche la contrainte (sans planter) une fois toutes les questions posées', () => {
    const usedByLevel = {}
    const bankSize = QUESTIONS_BY_LEVEL.A1.length
    for (let i = 0; i < bankSize; i++) pickQuestion('A1', usedByLevel)
    const extra = pickQuestion('A1', usedByLevel)
    expect(extra).toBeTruthy()
    expect(extra.level).toBe('A1')
  })

  it('accepte un usedByLevel déjà peuplé avec un tableau (compat sérialisation)', () => {
    const usedByLevel = { A1: [0, 1, 2] }
    const q = pickQuestion('A1', usedByLevel)
    expect(q).toBeTruthy()
    expect(usedByLevel.A1 instanceof Set).toBe(true)
  })

  it('renvoie null pour un niveau sans banque', () => {
    expect(pickQuestion('X0', {})).toBeNull()
  })
})

describe('estimateLevel — majorité par niveau + confiance (§3.1)', () => {
  it('estime le plus haut niveau où la majorité des réponses sont correctes', () => {
    const history = [
      { level: 'A1', correct: true },
      { level: 'A1', correct: true },
      { level: 'A2', correct: true },
      { level: 'B1', correct: false },
    ]
    const result = estimateLevel(history)
    expect(result.estimated).toBe('A2')
  })

  it('renvoie estimated=null quand aucun niveau n’atteint la majorité (pré-A1)', () => {
    const history = [{ level: 'A1', correct: false }]
    const result = estimateLevel(history)
    expect(result.estimated).toBeNull()
  })

  it('confiance faible avec peu de questions, suffisante avec beaucoup', () => {
    const few = estimateLevel([{ level: 'A1', correct: true }])
    expect(few.confidence).toBe('faible')

    const many = Array.from({ length: 12 }, () => ({ level: 'A1', correct: true }))
    const manyResult = estimateLevel(many)
    expect(manyResult.confidence).toBe('suffisant')
  })

  it('sampleSize reflète le nombre total de réponses, tous niveaux confondus', () => {
    const history = [
      { level: 'A1', correct: true },
      { level: 'A2', correct: false },
    ]
    expect(estimateLevel(history).sampleSize).toBe(2)
  })

  it('gère un historique vide sans planter', () => {
    const result = estimateLevel([])
    expect(result.estimated).toBeNull()
    expect(result.sampleSize).toBe(0)
    expect(result.confidence).toBe('faible')
  })

  it('stats couvre tous les niveaux CECR, même non tentés', () => {
    const result = estimateLevel([{ level: 'B2', correct: true }])
    expect(result.stats.map((s) => s.level)).toEqual(LEVELS)
    expect(result.stats.find((s) => s.level === 'A1').attempts).toBe(0)
  })
})

describe('summarizeSelfAssessment — auto-évaluation situationnelle (§3.1)', () => {
  it('compte oui/plutôt/non sans planter sur un objet vide', () => {
    expect(summarizeSelfAssessment({})).toEqual({ total: 0, yes: 0, partial: 0, no: 0 })
  })

  it('compte correctement chaque réponse', () => {
    const summary = summarizeSelfAssessment({ restaurant: 'oui', telephone: 'plutot', presse: 'non' })
    expect(summary).toEqual({ total: 3, yes: 1, partial: 1, no: 1 })
  })
})

describe('describeRecommendation — formulation « conseillé », pas une certification', () => {
  it('mentionne le niveau, la confiance et le nombre de questions', () => {
    const estimate = { estimated: 'B1', confidence: 'moyen', sampleSize: 8 }
    const text = describeRecommendation(estimate, {})
    expect(text).toContain('B1')
    expect(text).toContain('confiance moyenne')
    expect(text).toContain('8 questions')
    expect(text).toContain("pas une certification")
  })

  it('ajoute l’auto-évaluation et la production aux sources citées quand fournies', () => {
    const estimate = { estimated: 'A2', confidence: 'faible', sampleSize: 3 }
    const text = describeRecommendation(estimate, {
      selfAssessment: { total: 3, yes: 2, partial: 1, no: 0 },
      hasProduction: true,
    })
    expect(text).toContain('auto-évaluation')
    expect(text).toContain('production écrite')
  })

  it('reste sur le seul QCM quand aucun autre signal n’est fourni', () => {
    const estimate = { estimated: 'A1', confidence: 'faible', sampleSize: 1 }
    const text = describeRecommendation(estimate, {})
    expect(text).toContain('choix multiples')
    expect(text).not.toContain('auto-évaluation')
  })

  it('gère un estimate sans niveau trouvé (pré-A1)', () => {
    const estimate = { estimated: null, confidence: 'faible', sampleSize: 2 }
    const text = describeRecommendation(estimate, {})
    expect(text).toContain('pré-A1')
  })
})
