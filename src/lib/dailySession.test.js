import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadDailySession,
  saveDailySession,
  clearDailySession,
  loadYesterdaySessionTypes,
} from './dailySession.js'

const DAY = 24 * 60 * 60 * 1000
// Un mercredi à midi, heure locale.
const NOW = new Date(2026, 6, 15, 12, 0).getTime()

beforeEach(() => {
  localStorage.clear()
})

function session(types) {
  return { duration: 10, objective: 'Test', steps: types.map((type) => ({ type, estimatedMinutes: 5 })) }
}

describe('loadDailySession / saveDailySession — reprise locale du jour', () => {
  it('retrouve la session sauvegardée le même jour calendaire', () => {
    saveDailySession(session(['lettura']), NOW)
    expect(loadDailySession(NOW + 60_000)).toEqual(session(['lettura']))
  })

  it('ne retrouve rien un autre jour calendaire', () => {
    saveDailySession(session(['lettura']), NOW)
    expect(loadDailySession(NOW + DAY)).toBeNull()
  })

  it('clearDailySession efface la session (et son souvenir de la veille)', () => {
    saveDailySession(session(['lettura']), NOW)
    clearDailySession()
    expect(loadDailySession(NOW + 60_000)).toBeNull()
    expect(loadYesterdaySessionTypes(NOW + DAY)).toBeNull()
  })

  it('isole les comptes : uid différent = stockage différent', () => {
    saveDailySession(session(['lettura']), NOW, 'uid-a')
    expect(loadDailySession(NOW + 60_000, 'uid-b')).toBeNull()
    expect(loadDailySession(NOW + 60_000, 'uid-a')).toEqual(session(['lettura']))
  })
})

describe('loadYesterdaySessionTypes — mémoire de la session RECOMMANDÉE la veille', () => {
  it('null quand rien n’a encore été sauvegardé', () => {
    expect(loadYesterdaySessionTypes(NOW)).toBeNull()
  })

  it('null tant que le jour n’a pas changé (la session du jour n’est pas encore « hier »)', () => {
    saveDailySession(session(['lettura', 'write']), NOW)
    expect(loadYesterdaySessionTypes(NOW + 60_000)).toBeNull()
  })

  it('retrouve les types de la veille le lendemain, même sans nouvelle sauvegarde entre-temps', () => {
    saveDailySession(session(['lettura', 'write']), NOW)
    // Le lendemain, HomeView appelle saveDailySession pour la nouvelle
    // session AVANT que loadYesterdaySessionTypes ne soit utile — mais la
    // bascule de jour doit déjà être détectée par la lecture seule.
    saveDailySession(session(['ascolto']), NOW + DAY)
    expect(loadYesterdaySessionTypes(NOW + DAY + 60_000)).toEqual(['lettura', 'write'])
  })

  it('ne remonte pas au-delà d’un jour (pas de faux souvenir après plusieurs jours d’absence)', () => {
    saveDailySession(session(['lettura', 'write']), NOW)
    expect(loadYesterdaySessionTypes(NOW + 3 * DAY)).toBeNull()
  })

  it('une recomposition le même jour ne remplace pas le souvenir de la veille déjà en place', () => {
    saveDailySession(session(['lettura', 'write']), NOW - DAY)
    saveDailySession(session(['ascolto']), NOW) // bascule de jour : « hier » = lettura/write
    saveDailySession(session(['ascolto', 'dialogo']), NOW + 3600_000) // recomposée plus tard le même jour
    // Toujours le même jour calendaire (NOW) : « hier » doit rester day-1
    // (lettura/write), pas avoir été effacé par la recomposition de tantôt.
    expect(loadYesterdaySessionTypes(NOW + 2 * 3600_000)).toEqual(['lettura', 'write'])
  })
})
