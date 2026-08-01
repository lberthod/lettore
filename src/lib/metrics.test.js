import { describe, it, expect } from 'vitest'
import {
  retryRate,
  retrySuccessRate,
  recurringErrorStats,
  recallWithoutHelpRate,
  transferRate,
  autonomousListeningRate,
  readingHelpDependency,
  sessionCompletionRate,
  confidenceLevel,
  skillTrend,
} from './metrics.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 6, 15, 12, 0).getTime()

function makeProgress(over = {}) {
  return { activity: [], errorCards: [], sessionLog: [], ...over }
}

describe('retryRate / retrySuccessRate — seconde tentative après feedback (§15.1)', () => {
  it('null sans corrections proposées', () => {
    expect(retryRate(makeProgress())).toBeNull()
    expect(retrySuccessRate(makeProgress())).toBeNull()
  })

  it("compte les reprises parmi les corrections qui contenaient des erreurs", () => {
    const progress = makeProgress({
      activity: [
        { skill: 'scrittura', errorCount: 2, retryCount: 1, retrySuccess: true },
        { skill: 'scrittura', errorCount: 3, retryCount: 0 },
        { skill: 'scrittura', errorCount: 0 }, // pas de correction proposée : ignoré
        { skill: 'dialogo', errorCount: 1, retryCount: 2, retrySuccess: false },
      ],
    })
    expect(retryRate(progress)).toBeCloseTo(2 / 3)
    expect(retrySuccessRate(progress)).toBeCloseTo(1 / 2)
  })
})

describe('recurringErrorStats — erreurs récurrentes (§15.1)', () => {
  it('ignore les cartes vues une seule fois', () => {
    const progress = makeProgress({ errorCards: [{ history: [NOW] }] })
    expect(recurringErrorStats(progress, { now: NOW })).toEqual({
      totalCards: 1,
      withRecurrence: 0,
      recurredAfter7Days: 0,
      recurredAfter30Days: 0,
    })
  })

  it('détecte un retour à 7 jours et à 30 jours', () => {
    const progress = makeProgress({
      errorCards: [
        { history: [NOW - 40 * DAY, NOW - 32 * DAY] }, // écart 8j : récurrente à 7j
        { history: [NOW - 40 * DAY, NOW] }, // écart 40j : récurrente à 7 ET 30j
        { history: [NOW - 2 * DAY, NOW] }, // écart 2j : pas encore récurrente
      ],
    })
    const stats = recurringErrorStats(progress)
    expect(stats.totalCards).toBe(3)
    expect(stats.withRecurrence).toBe(3)
    expect(stats.recurredAfter7Days).toBe(2)
    expect(stats.recurredAfter30Days).toBe(1)
  })
})

describe('recallWithoutHelpRate — rappel sans aide (§15.1)', () => {
  it('null sans événement scrittura avec helpUsed', () => {
    expect(recallWithoutHelpRate(makeProgress())).toBeNull()
  })

  it("proportion de productions sans aucune aide utilisée", () => {
    const progress = makeProgress({
      activity: [
        { skill: 'scrittura', helpUsed: [] },
        { skill: 'scrittura', helpUsed: ['idees'] },
        { skill: 'scrittura', helpUsed: [] },
        { skill: 'lettura', helpUsed: [] }, // autre compétence : ignoré
      ],
    })
    expect(recallWithoutHelpRate(progress)).toBeCloseTo(2 / 3)
  })
})

describe('transferRate — mots revus retrouvés en production (§15.1)', () => {
  it('null sans mots proposés en réutilisation', () => {
    expect(transferRate(makeProgress())).toBeNull()
  })

  it('ratio mots réutilisés / mots proposés', () => {
    const progress = makeProgress({
      activity: [
        { skill: 'scrittura', reuseWordsOffered: 3, reuseWordsUsed: 2 },
        { skill: 'scrittura', reuseWordsOffered: 2, reuseWordsUsed: 0 },
      ],
    })
    expect(transferRate(progress)).toBeCloseTo(2 / 5)
  })
})

describe('autonomousListeningRate — écoute autonome (§15.1)', () => {
  it('null sans événement ascolto renseignant textRevealed', () => {
    expect(autonomousListeningRate(makeProgress())).toBeNull()
  })

  it('quiz réussi avant transcription affichée', () => {
    const progress = makeProgress({
      activity: [
        { skill: 'ascolto', score: 4, total: 5, textRevealed: false }, // réussi, autonome
        { skill: 'ascolto', score: 4, total: 5, textRevealed: true }, // réussi mais transcription vue
        { skill: 'ascolto', score: 1, total: 5, textRevealed: false }, // échoué
      ],
    })
    expect(autonomousListeningRate(progress)).toBeCloseTo(1 / 3)
  })
})

describe('readingHelpDependency — dépendance aux aides en lecture (§15.1)', () => {
  it('null tant que la fenêtre précédente est vide', () => {
    const progress = makeProgress({
      activity: [
        { skill: 'lettura', translatedWordsCount: 2 },
        { skill: 'lettura', translatedWordsCount: 4 },
      ],
    })
    const r = readingHelpDependency(progress, { windowSize: 5 })
    expect(r.previousAvg).toBeNull()
    expect(r.trend).toBeNull()
  })

  it('tendance à la baisse entre deux fenêtres comparables', () => {
    const older = Array.from({ length: 5 }, () => ({ skill: 'lettura', translatedWordsCount: 6 }))
    const recent = Array.from({ length: 5 }, () => ({ skill: 'ascolto', translatedWordsCount: 1 }))
    const progress = makeProgress({ activity: [...older, ...recent] })
    const r = readingHelpDependency(progress, { windowSize: 5 })
    expect(r.previousAvg).toBe(6)
    expect(r.recentAvg).toBe(1)
    expect(r.trend).toBe('down')
  })
})

describe('sessionCompletionRate — achèvement de session (§15.1)', () => {
  it('null sans session démarrée dans la fenêtre', () => {
    expect(sessionCompletionRate(makeProgress(), { now: NOW })).toBeNull()
  })

  it('taux terminées/démarrées sur la fenêtre', () => {
    const progress = makeProgress({
      sessionLog: [
        { date: '2026-07-10', startedTs: NOW - 5 * DAY, completed: true },
        { date: '2026-07-12', startedTs: NOW - 3 * DAY, completed: false },
        { date: '2026-05-01', startedTs: NOW - 200 * DAY, completed: true }, // hors fenêtre
      ],
    })
    expect(sessionCompletionRate(progress, { now: NOW, days: 30 })).toEqual({
      started: 2,
      completed: 1,
      rate: 0.5,
    })
  })
})

describe('confidenceLevel — indicateur de confiance (§10.2/10.3)', () => {
  it('faible < 3, moyen < 10, suffisant au-delà', () => {
    expect(confidenceLevel(0)).toBe('faible')
    expect(confidenceLevel(2)).toBe('faible')
    expect(confidenceLevel(3)).toBe('moyen')
    expect(confidenceLevel(9)).toBe('moyen')
    expect(confidenceLevel(10)).toBe('suffisant')
  })
})

describe('skillTrend — tendance à 4 semaines (§10.3)', () => {
  it('direction null sans donnée sur la fenêtre précédente', () => {
    const progress = makeProgress({ activity: [{ skill: 'lettura', ts: NOW - DAY }] })
    expect(skillTrend(progress, 'lettura', { now: NOW }).direction).toBeNull()
  })

  it('compare les deux dernières semaines aux deux précédentes', () => {
    const progress = makeProgress({
      activity: [
        { skill: 'lettura', ts: NOW - 20 * DAY }, // fenêtre précédente
        { skill: 'lettura', ts: NOW - 3 * DAY }, // fenêtre récente
        { skill: 'lettura', ts: NOW - 2 * DAY },
      ],
    })
    const trend = skillTrend(progress, 'lettura', { now: NOW })
    expect(trend).toEqual({ recentCount: 2, previousCount: 1, direction: 'up' })
  })
})
