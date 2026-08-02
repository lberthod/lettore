import { describe, it, expect } from 'vitest'
import { missionsToday, selectMissionsForToday, MISSIONS } from './missions.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 6, 15, 12, 0).getTime()

function makeProgress(activity = [], extra = {}) {
  return { activity, ...extra }
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

describe('selectMissionsForToday — sélection personnalisée (Sprint 2.1)', () => {
  it('sans aucun signal disponible, repli identique aux 3 missions fixes', () => {
    const progress = makeProgress()
    const selected = selectMissionsForToday(progress, NOW)
    const fixed = missionsToday(progress, NOW)
    expect(selected).toEqual(fixed)
    expect(selected.map((m) => m.id)).toEqual(MISSIONS.map((m) => m.id))
  })

  it('beaucoup de traductions cliquées récemment en lecture → propose « lis sans traduction »', () => {
    const progress = makeProgress([
      { skill: 'lettura', ts: NOW - 5 * DAY, translatedWordsCount: 6 },
      { skill: 'lettura', ts: NOW - 3 * DAY, translatedWordsCount: 4 },
    ])
    const selected = selectMissionsForToday(progress, NOW)
    expect(selected.some((m) => m.id === 'lettura_senza_traduzione')).toBe(true)
  })

  it('« lis sans traduction » se marque faite via translatedWordsCount=0 aujourd’hui', () => {
    const progress = makeProgress([
      { skill: 'lettura', ts: NOW - 5 * DAY, translatedWordsCount: 6 },
      { skill: 'lettura', ts: NOW - 3 * DAY, translatedWordsCount: 4 },
      { skill: 'lettura', ts: NOW, translatedWordsCount: 0 },
    ])
    const selected = selectMissionsForToday(progress, NOW)
    expect(selected.find((m) => m.id === 'lettura_senza_traduzione').done).toBe(true)
  })

  it('sans traductions récentes élevées, ne propose pas « lis sans traduction »', () => {
    const progress = makeProgress([
      { skill: 'lettura', ts: NOW - 5 * DAY, translatedWordsCount: 0 },
      { skill: 'lettura', ts: NOW - 3 * DAY, translatedWordsCount: 1 },
    ])
    const selected = selectMissionsForToday(progress, NOW)
    expect(selected.some((m) => m.id === 'lettura_senza_traduzione')).toBe(false)
  })

  it('une compétence en recul sur 4 semaines → propose de pratiquer cette compétence', () => {
    const progress = makeProgress([
      { skill: 'dialogo', ts: NOW - 20 * DAY },
      { skill: 'dialogo', ts: NOW - 21 * DAY },
      { skill: 'dialogo', ts: NOW - 22 * DAY },
    ])
    const selected = selectMissionsForToday(progress, NOW)
    expect(selected.some((m) => m.id === 'pratique_dialogo')).toBe(true)
    expect(selected.find((m) => m.id === 'pratique_dialogo').label).toContain('dialogue')
  })

  it('« pratique la compétence fragile » se marque faite via une activité de cette compétence aujourd’hui', () => {
    const progress = makeProgress([
      { skill: 'dialogo', ts: NOW - 20 * DAY },
      { skill: 'dialogo', ts: NOW - 21 * DAY },
      { skill: 'dialogo', ts: NOW - 22 * DAY },
      { skill: 'dialogo', ts: NOW },
    ])
    const selected = selectMissionsForToday(progress, NOW)
    expect(selected.find((m) => m.id === 'pratique_dialogo').done).toBe(true)
  })

  it('ne propose pas de compétence fragile avec trop peu de données (confiance faible)', () => {
    const progress = makeProgress([{ skill: 'dialogo', ts: NOW - 20 * DAY }])
    const selected = selectMissionsForToday(progress, NOW)
    expect(selected.some((m) => m.id === 'pratique_dialogo')).toBe(false)
  })

  it('une carte d’erreur récurrente → propose une révision ciblée', () => {
    const progress = makeProgress([], { errorCards: [{ history: [NOW - 10 * DAY, NOW - 3 * DAY] }] })
    const selected = selectMissionsForToday(progress, NOW)
    expect(selected.some((m) => m.id === 'revise_erreur_recurrente')).toBe(true)
  })

  it('« révise l’erreur récurrente » se marque faite via une révision de vocabulaire aujourd’hui', () => {
    const progress = makeProgress([{ skill: 'vocabolario', ts: NOW, reviewed: 3 }], {
      errorCards: [{ history: [NOW - 10 * DAY, NOW - 3 * DAY] }],
    })
    const selected = selectMissionsForToday(progress, NOW)
    expect(selected.find((m) => m.id === 'revise_erreur_recurrente').done).toBe(true)
  })

  it('sans carte récurrente (une seule occurrence), ne propose pas la révision ciblée', () => {
    const progress = makeProgress([], { errorCards: [{ history: [NOW - 3 * DAY] }] })
    const selected = selectMissionsForToday(progress, NOW)
    expect(selected.some((m) => m.id === 'revise_erreur_recurrente')).toBe(false)
  })

  it('deux profils différents voient des missions différentes le même jour', () => {
    const profileTraduction = makeProgress([
      { skill: 'lettura', ts: NOW - 5 * DAY, translatedWordsCount: 6 },
      { skill: 'lettura', ts: NOW - 3 * DAY, translatedWordsCount: 4 },
    ])
    const profileErreurRecurrente = makeProgress([], {
      errorCards: [{ history: [NOW - 10 * DAY, NOW - 3 * DAY] }],
    })
    const idsA = selectMissionsForToday(profileTraduction, NOW).map((m) => m.id)
    const idsB = selectMissionsForToday(profileErreurRecurrente, NOW).map((m) => m.id)
    expect(idsA).not.toEqual(idsB)
  })

  it('priorise les missions personnalisées sur les missions fixes quand plusieurs signaux sont présents', () => {
    const progress = makeProgress(
      [
        { skill: 'lettura', ts: NOW - 5 * DAY, translatedWordsCount: 6 },
        { skill: 'lettura', ts: NOW - 3 * DAY, translatedWordsCount: 4 },
        { skill: 'dialogo', ts: NOW - 20 * DAY },
        { skill: 'dialogo', ts: NOW - 21 * DAY },
        { skill: 'dialogo', ts: NOW - 22 * DAY },
      ],
      { errorCards: [{ history: [NOW - 10 * DAY, NOW - 3 * DAY] }] }
    )
    const selected = selectMissionsForToday(progress, NOW)
    expect(selected).toHaveLength(3)
    expect(selected.map((m) => m.id)).toEqual([
      'lettura_senza_traduzione',
      'pratique_dialogo',
      'revise_erreur_recurrente',
    ])
  })

  it('reste sur "fait / pas encore fait" — aucun champ de score, classement ou récompense', () => {
    const progress = makeProgress([
      { skill: 'lettura', ts: NOW - 5 * DAY, translatedWordsCount: 6 },
      { skill: 'lettura', ts: NOW - 3 * DAY, translatedWordsCount: 4 },
    ])
    const selected = selectMissionsForToday(progress, NOW)
    for (const m of selected) {
      expect(Object.keys(m).sort()).toEqual(['done', 'id', 'label'])
      expect(typeof m.done).toBe('boolean')
    }
  })
})
