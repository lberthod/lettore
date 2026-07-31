import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { currentUser } from './lib/auth.js'
import { progress, markRead, touchStreak, hasLocalTtsRate } from './progress.js'

// progress.js est un singleton (état de module) : ces tests s'enchaînent
// comme un scénario réel de connexion/déconnexion plutôt que d'isoler
// chaque cas — c'est justement ce que AUD-08 doit garantir.
describe('progress.js — isolation de la progression par compte', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('deux comptes différents sur le même navigateur ne partagent pas leur progression', async () => {
    currentUser.value = { uid: 'user-a' }
    await nextTick()
    markRead('texte-1')
    await nextTick()

    currentUser.value = { uid: 'user-b' }
    await nextTick()
    expect(progress.readTexts).toEqual([])
    markRead('texte-2')
    await nextTick()

    currentUser.value = { uid: 'user-a' }
    await nextTick()
    expect(progress.readTexts).toEqual(['texte-1'])

    currentUser.value = { uid: 'user-b' }
    await nextTick()
    expect(progress.readTexts).toEqual(['texte-2'])
  })

  it('la progression anonyme n’est reprise qu’une seule fois, par le premier compte connecté', async () => {
    currentUser.value = null
    await nextTick()
    markRead('anon-texte')
    await nextTick()

    currentUser.value = { uid: 'user-c' }
    await nextTick()
    expect(progress.readTexts).toEqual(['anon-texte'])

    // Un deuxième compte, plus tard sur le même navigateur, ne doit pas
    // hériter de la même progression anonyme déjà consommée par user-c.
    currentUser.value = null
    await nextTick()
    currentUser.value = { uid: 'user-d' }
    await nextTick()
    expect(progress.readTexts).toEqual([])
  })

  // hasLocalTtsRate décide si progressSync applique la vitesse audio distante :
  // évalué pour le mauvais compte, il ferait fuiter le réglage d'un espace vers
  // un autre (ou écraserait celui du compte connecté).
  it('la préférence audio locale est réévaluée à chaque changement de compte', async () => {
    currentUser.value = { uid: 'user-f' }
    await nextTick()
    progress.ttsRate = 1.2
    await nextTick()

    currentUser.value = { uid: 'user-g' }
    await nextTick()
    expect(hasLocalTtsRate.value).toBe(false)

    currentUser.value = { uid: 'user-f' }
    await nextTick()
    expect(hasLocalTtsRate.value).toBe(true)
  })

  it('un profil enregistré avant les streaks est migré avec un streak vierge', async () => {
    localStorage.setItem(
      'lettore.progress.ancien',
      JSON.stringify({ readTexts: ['vieux-texte'] })
    )
    currentUser.value = { uid: 'ancien' }
    await nextTick()
    expect(progress.streak).toEqual({
      current: 0,
      longest: 0,
      lastActiveDate: null,
    })
    expect(progress.readTexts).toEqual(['vieux-texte'])
  })

  it('la déconnexion repart sur un espace anonyme vide', async () => {
    currentUser.value = { uid: 'user-e' }
    await nextTick()
    markRead('texte-e')
    await nextTick()

    currentUser.value = null
    await nextTick()
    expect(progress.readTexts).toEqual([])
  })
})

// La série quotidienne repose sur la date calendaire LOCALE ('YYYY-MM-DD'),
// jamais sur un timestamp : ces tests figent l'horloge en heure locale.
describe('touchStreak — série quotidienne', () => {
  beforeEach(async () => {
    localStorage.clear()
    currentUser.value = { uid: 'streak' }
    await nextTick()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("scénario sur 3 jours : 1 → no-op le même jour → 2 le lendemain → retombe à 1 après un saut", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 1, 12, 0))
    touchStreak()
    expect(progress.streak).toEqual({
      current: 1,
      longest: 1,
      lastActiveDate: '2026-07-01',
    })

    // Deuxième activité le même jour : no-op.
    vi.setSystemTime(new Date(2026, 6, 1, 22, 0))
    touchStreak()
    expect(progress.streak.current).toBe(1)

    // Lendemain : la série continue.
    vi.setSystemTime(new Date(2026, 6, 2, 9, 0))
    touchStreak()
    expect(progress.streak).toEqual({
      current: 2,
      longest: 2,
      lastActiveDate: '2026-07-02',
    })

    // Saut d'un jour : retombe à 1, le record est conservé.
    vi.setSystemTime(new Date(2026, 6, 4, 9, 0))
    touchStreak()
    expect(progress.streak.current).toBe(1)
    expect(progress.streak.longest).toBe(2)
    expect(progress.streak.lastActiveDate).toBe('2026-07-04')
  })

  it('23h50 puis 00h10 en heure locale comptent bien deux jours consécutifs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 31, 23, 50))
    touchStreak()
    expect(progress.streak.lastActiveDate).toBe('2026-07-31')

    // Passage de minuit (et de mois) : jour suivant, la série s'incrémente.
    vi.setSystemTime(new Date(2026, 7, 1, 0, 10))
    touchStreak()
    expect(progress.streak).toEqual({
      current: 2,
      longest: 2,
      lastActiveDate: '2026-08-01',
    })
  })
})
