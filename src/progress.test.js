import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { currentUser } from './lib/auth.js'
import {
  progress,
  markRead,
  touchStreak,
  hasLocalTtsRate,
  logActivity,
  addErrorCard,
  dueErrorCards,
  reviewErrorCard,
  removeErrorCard,
  measuredLevel,
  errorCardId,
  ACTIVITY_CAP,
  ERROR_CARDS_CAP,
  MAX_BOX,
} from './progress.js'

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

describe('logActivity — journal et agrégats par compétence', () => {
  beforeEach(async () => {
    localStorage.clear()
    currentUser.value = { uid: `activite-${Math.random()}` }
    await nextTick()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ajoute un événement horodaté et met à jour count/lastTs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 10, 10, 0))
    logActivity({ skill: 'ascolto', textId: 't1' })
    expect(progress.activity).toHaveLength(1)
    expect(progress.activity[0]).toMatchObject({
      skill: 'ascolto',
      textId: 't1',
      ts: Date.now(),
    })
    expect(progress.skills.ascolto).toMatchObject({ count: 1, lastTs: Date.now() })
  })

  it('une activité loggée compte comme journée active (streak)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 10, 10, 0))
    logActivity({ skill: 'lettura', score: 4, total: 5 })
    expect(progress.streak.current).toBe(1)
    expect(progress.streak.lastActiveDate).toBe('2026-07-10')
  })

  it('plafonne le journal aux 500 événements les plus récents', () => {
    for (let i = 0; i < ACTIVITY_CAP + 10; i++) {
      logActivity({ skill: 'ascolto', n: i })
    }
    expect(progress.activity).toHaveLength(ACTIVITY_CAP)
    // Les 10 plus anciens ont été éjectés, les plus récents conservés.
    expect(progress.activity[0].n).toBe(10)
    expect(progress.activity.at(-1).n).toBe(ACTIVITY_CAP + 9)
    expect(progress.skills.ascolto.count).toBe(ACTIVITY_CAP + 10)
  })

  it('lettura.avgScore = moyenne glissante des score/total des 20 derniers quiz', () => {
    // 5 vieux quiz à 0/5 qui doivent sortir de la fenêtre de 20…
    for (let i = 0; i < 5; i++) logActivity({ skill: 'lettura', score: 0, total: 5 })
    // …suivis de 20 quiz parfaits : la moyenne ne voit plus les vieux zéros.
    for (let i = 0; i < 20; i++) logActivity({ skill: 'lettura', score: 5, total: 5 })
    expect(progress.skills.lettura.avgScore).toBe(1)

    logActivity({ skill: 'lettura', score: 0, total: 5 })
    expect(progress.skills.lettura.avgScore).toBeCloseTo(19 / 20)
  })

  it('scrittura : garde les 10 derniers niveaux CECR et cumule les erreurs', () => {
    for (let i = 0; i < 12; i++) {
      logActivity({ skill: 'scrittura', level: i < 6 ? 'A2' : 'B1', errorCount: 2 })
    }
    expect(progress.skills.scrittura.levels).toHaveLength(10)
    expect(progress.skills.scrittura.levels.at(-1)).toBe('B1')
    expect(progress.skills.scrittura.errorCount).toBe(24)
  })

  it('dialogo.sessions et pronuncia.avgScore', () => {
    logActivity({ skill: 'dialogo', mode: 'ristorante' })
    logActivity({ skill: 'dialogo', mode: 'mercato' })
    expect(progress.skills.dialogo.sessions).toBe(2)

    logActivity({ skill: 'pronuncia', score: 8, total: 10 })
    logActivity({ skill: 'pronuncia', score: 6, total: 10 })
    expect(progress.skills.pronuncia.avgScore).toBeCloseTo(0.7)
  })

  it('ignore une entrée sans compétence', () => {
    expect(logActivity({ score: 3 })).toBeNull()
    expect(progress.activity).toHaveLength(0)
  })
})

describe('errorCards — cartes d’erreur en répétition espacée', () => {
  beforeEach(async () => {
    localStorage.clear()
    currentUser.value = { uid: `erreurs-${Math.random()}` }
    await nextTick()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const sample = {
    original: 'io ho andato',
    correction: 'io sono andato',
    explanation: 'andare se conjugue avec essere',
    type: 'grammatica',
    source: 'scrivi',
  }

  it('ajoute une carte en boîte 0, révisable immédiatement, dédupliquée par contenu', () => {
    const card = addErrorCard(sample)
    expect(card).toMatchObject({
      id: errorCardId(sample.original, sample.correction),
      box: 0,
      due: 0,
    })
    // La même erreur re-signalée ne crée pas de doublon et ne remet pas la
    // boîte à zéro.
    reviewErrorCard(card.id, true)
    const again = addErrorCard(sample)
    expect(progress.errorCards).toHaveLength(1)
    expect(again.box).toBe(1)
    expect(dueErrorCards()).toHaveLength(0)
  })

  it('reviewErrorCard suit le Leitner : succès monte (max 5), échec retombe à 0', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 10))
    const { id } = addErrorCard(sample)
    for (let i = 0; i < 8; i++) reviewErrorCard(id, true)
    const card = progress.errorCards[0]
    expect(card.box).toBe(MAX_BOX)
    expect(card.due).toBe(Date.now() + 30 * 24 * 60 * 60 * 1000)

    reviewErrorCard(id, false)
    expect(card.box).toBe(0)
    expect(card.due).toBe(Date.now())
    expect(dueErrorCards()).toHaveLength(1)
  })

  it('plafonne à 200 cartes en éjectant d’abord les plus anciennes maîtrisées', () => {
    // Une vieille carte bien maîtrisée (boîte haute)…
    const mastered = addErrorCard({ ...sample, original: 'maîtrisée' })
    for (let i = 0; i < 5; i++) reviewErrorCard(mastered.id, true)
    // …et une vieille carte encore fragile (boîte 0).
    const fragile = addErrorCard({ ...sample, original: 'fragile' })

    for (let i = 0; i < ERROR_CARDS_CAP - 1; i++) {
      addErrorCard({ ...sample, original: `erreur-${i}` })
    }
    expect(progress.errorCards).toHaveLength(ERROR_CARDS_CAP)
    // La carte maîtrisée a été sacrifiée, la fragile est toujours là.
    expect(progress.errorCards.find((c) => c.id === mastered.id)).toBeUndefined()
    expect(progress.errorCards.find((c) => c.id === fragile.id)).toBeDefined()
  })

  it('removeErrorCard retire la carte', () => {
    const { id } = addErrorCard(sample)
    removeErrorCard(id)
    expect(progress.errorCards).toHaveLength(0)
  })
})

describe('measuredLevel — niveau CECR mesuré', () => {
  beforeEach(async () => {
    localStorage.clear()
    currentUser.value = { uid: `niveau-${Math.random()}` }
    await nextTick()
  })

  it('null tant qu’aucune production écrite n’a été évaluée', () => {
    expect(measuredLevel()).toEqual({ scrittura: null, global: null })
  })

  it('mode des 5 derniers niveaux estimés ; global = scrittura', () => {
    for (const level of ['A1', 'A1', 'A1', 'B1', 'A2', 'B1', 'B1', 'A2']) {
      logActivity({ skill: 'scrittura', level })
    }
    // Fenêtre des 5 derniers : A2, B1, B1, A2 → à égalité, le plus récent (A2)…
    // non : ['A2','B1','B1','A2'] = 4 derniers ; les 5 derniers sont
    // ['B1','A2','B1','B1','A2'] → B1 majoritaire.
    expect(measuredLevel()).toEqual({ scrittura: 'B1', global: 'B1' })
  })

  it('à égalité dans la fenêtre, le niveau le plus récent gagne', () => {
    for (const level of ['A2', 'A2', 'B1', 'B1']) {
      logActivity({ skill: 'scrittura', level })
    }
    expect(measuredLevel()).toEqual({ scrittura: 'B1', global: 'B1' })
  })
})

describe('normalize — migration des anciens profils', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('un profil pré-parcours reçoit activity/skills/errorCards vides', async () => {
    localStorage.setItem(
      'lettore.progress.vieux-profil',
      JSON.stringify({
        readTexts: ['t1'],
        favorites: [{ word: 'casa' }],
        streak: { current: 3, longest: 5, lastActiveDate: '2026-07-30' },
      })
    )
    currentUser.value = { uid: 'vieux-profil' }
    await nextTick()
    expect(progress.readTexts).toEqual(['t1'])
    expect(progress.activity).toEqual([])
    expect(progress.skills).toEqual({})
    expect(progress.errorCards).toEqual([])
    // Les champs déjà migrés ne sont pas perdus au passage.
    expect(progress.streak.current).toBe(3)
    expect(progress.favorites[0]).toMatchObject({ word: 'casa', box: 0, due: 0 })
  })
})
