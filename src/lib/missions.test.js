import { describe, it, expect } from 'vitest'
import { missionsToday, MISSIONS } from './missions.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 6, 15, 12, 0).getTime()

function makeProgress(activity = []) {
  return { activity }
}

describe('missionsToday — missions courtes (§11.2)', () => {
  it('toutes les missions sont "pas encore faites" sans activité', () => {
    const missions = missionsToday(makeProgress(), NOW)
    expect(missions).toHaveLength(MISSIONS.length)
    expect(missions.every((m) => m.done === false)).toBe(true)
  })

  it('« écoute avant transcription » se reconnaît via textRevealed=false en ascolto', () => {
    const progress = makeProgress([{ skill: 'ascolto', ts: NOW, textRevealed: false }])
    const missions = missionsToday(progress, NOW)
    expect(missions.find((m) => m.id === 'ascolto_avant_transcription').done).toBe(true)
  })

  it('« corrige puis réécris » se reconnaît via retryCount > 0', () => {
    const progress = makeProgress([{ skill: 'scrittura', ts: NOW, retryCount: 1 }])
    const missions = missionsToday(progress, NOW)
    expect(missions.find((m) => m.id === 'corrige_et_reecris').done).toBe(true)
  })

  it('« réutilise des mots révisés » se reconnaît via reuseWordsUsed > 0', () => {
    const progress = makeProgress([{ skill: 'scrittura', ts: NOW, reuseWordsUsed: 2 }])
    const missions = missionsToday(progress, NOW)
    expect(missions.find((m) => m.id === 'reutilise_mots_revus').done).toBe(true)
  })

  it("ne compte que l'activité du jour calendaire local, pas la veille", () => {
    const progress = makeProgress([{ skill: 'scrittura', ts: NOW - DAY, retryCount: 1 }])
    const missions = missionsToday(progress, NOW)
    expect(missions.find((m) => m.id === 'corrige_et_reecris').done).toBe(false)
  })
})
