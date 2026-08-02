import { describe, it, expect } from 'vitest'
import {
  activitiesSincePositioning,
  reviewPositioning,
  REVIEW_AFTER_ACTIVITIES,
} from './levelReview.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 6, 15, 12, 0).getTime()

function positioning(overrides = {}) {
  return { level: 'A2', confidence: 'moyen', source: 'qcm', ts: NOW - 10 * DAY, ...overrides }
}

describe('activitiesSincePositioning', () => {
  it('renvoie 0 sans positioning', () => {
    expect(activitiesSincePositioning({ activity: [] }, null)).toBe(0)
  })

  it("ne compte que les compétences authentiques après l'horodatage du positionnement", () => {
    const progress = {
      activity: [
        { skill: 'lettura', ts: positioning().ts + DAY },
        { skill: 'ascolto', ts: positioning().ts + 2 * DAY },
        { skill: 'vocabolario', ts: positioning().ts + 3 * DAY }, // pas authentique
        { skill: 'scrittura', ts: positioning().ts - DAY }, // avant le positionnement
      ],
    }
    expect(activitiesSincePositioning(progress, positioning())).toBe(2)
  })
})

describe('reviewPositioning', () => {
  it('pas prêt sans positioning enregistré', () => {
    const result = reviewPositioning({ activity: [] }, null, { observedLevel: 'B1', now: NOW })
    expect(result.ready).toBe(false)
    expect(result.reason).toBe('no-positioning')
  })

  it('pas prêt tant que moins de REVIEW_AFTER_ACTIVITIES activités authentiques', () => {
    const p = positioning()
    const progress = {
      activity: [
        { skill: 'lettura', ts: p.ts + DAY },
        { skill: 'ascolto', ts: p.ts + 2 * DAY },
      ],
    }
    const result = reviewPositioning(progress, p, { observedLevel: 'B1', now: NOW })
    expect(result.ready).toBe(false)
    expect(result.reason).toBe('not-enough-activity')
    expect(result.activitiesSince).toBe(2)
    expect(result.needed).toBe(REVIEW_AFTER_ACTIVITIES)
  })

  it('pas prêt sans niveau observé, même avec assez d’activités', () => {
    const p = positioning()
    const progress = {
      activity: [
        { skill: 'lettura', ts: p.ts + DAY },
        { skill: 'ascolto', ts: p.ts + 2 * DAY },
        { skill: 'scrittura', ts: p.ts + 3 * DAY },
      ],
    }
    const result = reviewPositioning(progress, p, { now: NOW })
    expect(result.ready).toBe(false)
    expect(result.reason).toBe('no-observed-level')
  })

  it('prêt et "adjusted" quand le niveau observé diffère du niveau conseillé', () => {
    const p = positioning({ level: 'A2' })
    const progress = {
      activity: [
        { skill: 'lettura', ts: p.ts + DAY },
        { skill: 'ascolto', ts: p.ts + 2 * DAY },
        { skill: 'scrittura', ts: p.ts + 3 * DAY },
      ],
    }
    const result = reviewPositioning(progress, p, { observedLevel: 'B1', now: NOW })
    expect(result.ready).toBe(true)
    expect(result.adjusted).toBe(true)
    expect(result.note).toContain('A2')
    expect(result.note).toContain('B1')
  })

  it('prêt et non "adjusted" quand le niveau observé confirme le niveau conseillé', () => {
    const p = positioning({ level: 'B1' })
    const progress = {
      activity: [
        { skill: 'lettura', ts: p.ts + DAY },
        { skill: 'ascolto', ts: p.ts + 2 * DAY },
        { skill: 'scrittura', ts: p.ts + 3 * DAY },
      ],
    }
    const result = reviewPositioning(progress, p, { observedLevel: 'B1', now: NOW })
    expect(result.ready).toBe(true)
    expect(result.adjusted).toBe(false)
  })
})
