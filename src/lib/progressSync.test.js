import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Firestore est entièrement simulé : ces tests portent sur la logique de
// synchronisation (quand pousser, quand s'abstenir), pas sur le SDK.
const { getDoc, setDoc } = vi.hoisted(() => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(),
}))

vi.mock('./firebase.js', () => ({
  firebaseReady: true,
  getDbInstance: () => Promise.resolve({}),
}))

vi.mock('firebase/firestore', () => ({
  doc: (db, collection, uid) => ({ collection, uid }),
  getDoc,
  setDoc,
}))

vi.mock('./auth.js', async () => {
  const { ref } = await import('vue')
  return { currentUser: ref(null) }
})

const { currentUser } = await import('./auth.js')
const { progress } = await import('../progress.js')
const { initProgressSync } = await import('./progressSync.js')

// Un seul graphe de modules pour tout le fichier : initProgressSync ne
// s'installe qu'une fois, et chaque test utilise un compte distinct plutôt
// que de réinitialiser les modules (les watchers d'un ancien graphe
// resteraient branchés sur le même `currentUser` et pousseraient en double).
initProgressSync()

function remoteSnap(data) {
  return { exists: () => true, data: () => ({ progress: data }) }
}

// Laisse passer les watchers Vue (flush « pre ») puis les continuations async
// de initProgressSync (getDbInstance, import dynamique, getDoc).
async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
}

async function login(uid) {
  currentUser.value = { uid }
  await flush()
}

function pushedProgress(call) {
  return call[1].progress
}

describe('initProgressSync — envoi de la fusion initiale', () => {
  beforeEach(() => {
    localStorage.clear()
    getDoc.mockReset()
    setDoc.mockReset()
    setDoc.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    currentUser.value = null
    await flush()
  })

  it('pousse le résultat de la fusion sans attendre une nouvelle action', async () => {
    // Progression du visiteur non connecté, que progress.js migrera vers
    // l'espace du compte à la première connexion.
    localStorage.setItem(
      'lettore.progress',
      JSON.stringify({ readTexts: ['locale'] })
    )
    getDoc.mockResolvedValue(remoteSnap({ readTexts: ['distante'] }))

    await login('migration')

    expect(progress.readTexts).toEqual(['locale', 'distante'])
    expect(setDoc).toHaveBeenCalledTimes(1)
    expect(pushedProgress(setDoc.mock.calls[0]).readTexts).toEqual([
      'locale',
      'distante',
    ])
  })

  it("pousse aussi quand le compte n'a encore aucun document distant", async () => {
    localStorage.setItem(
      'lettore.progress.vierge',
      JSON.stringify({ readTexts: ['locale'] })
    )
    getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) })

    await login('vierge')

    expect(setDoc).toHaveBeenCalledTimes(1)
    expect(pushedProgress(setDoc.mock.calls[0]).readTexts).toEqual(['locale'])
  })

  // setDoc({ merge: true }) remplace les tableaux entiers : pousser sans avoir
  // pu lire le distant effacerait la progression des autres appareils.
  it('ne pousse pas si la lecture du distant a échoué', async () => {
    localStorage.setItem(
      'lettore.progress.hors-ligne',
      JSON.stringify({ readTexts: ['locale'] })
    )
    getDoc.mockRejectedValue(new Error('offline'))

    await login('hors-ligne')

    expect(setDoc).not.toHaveBeenCalled()
  })

  // Streak multi-appareils : record = max des deux, série en cours = celle du
  // côté actif le plus récemment — jamais un écrasement naïf par le local.
  it('fusionne le streak : record = max, série courante = côté le plus récent', async () => {
    localStorage.setItem(
      'lettore.progress.streak-remote-gagne',
      JSON.stringify({
        streak: { current: 2, longest: 9, lastActiveDate: '2026-07-28' },
      })
    )
    getDoc.mockResolvedValue(
      remoteSnap({
        streak: { current: 4, longest: 6, lastActiveDate: '2026-07-30' },
      })
    )

    await login('streak-remote-gagne')

    const expected = { current: 4, longest: 9, lastActiveDate: '2026-07-30' }
    expect(progress.streak).toEqual(expected)
    expect(pushedProgress(setDoc.mock.calls[0]).streak).toEqual(expected)
  })

  it('garde la série locale quand elle est plus récente que la distante', async () => {
    localStorage.setItem(
      'lettore.progress.streak-local-gagne',
      JSON.stringify({
        streak: { current: 3, longest: 3, lastActiveDate: '2026-07-31' },
      })
    )
    getDoc.mockResolvedValue(
      remoteSnap({
        streak: { current: 7, longest: 7, lastActiveDate: '2026-07-20' },
      })
    )

    await login('streak-local-gagne')

    expect(progress.streak).toEqual({
      current: 3,
      longest: 7,
      lastActiveDate: '2026-07-31',
    })
  })

  it('tolère un document distant sans streak (profil pré-migration)', async () => {
    localStorage.setItem(
      'lettore.progress.streak-absent',
      JSON.stringify({
        streak: { current: 1, longest: 2, lastActiveDate: '2026-07-31' },
      })
    )
    getDoc.mockResolvedValue(remoteSnap({ readTexts: ['distante'] }))

    await login('streak-absent')

    expect(progress.streak).toEqual({
      current: 1,
      longest: 2,
      lastActiveDate: '2026-07-31',
    })
  })

  it('ne pousse pas si le compte a changé pendant la fusion', async () => {
    let resolveGet
    getDoc.mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve
      })
    )

    await login('lent')

    // Déconnexion pendant que getDoc est encore en vol.
    currentUser.value = null
    resolveGet(remoteSnap({ readTexts: ['distante'] }))
    await flush()

    expect(setDoc).not.toHaveBeenCalled()
  })
})

describe('initProgressSync — fusion du parcours (activity, errorCards, skills)', () => {
  beforeEach(() => {
    localStorage.clear()
    getDoc.mockReset()
    setDoc.mockReset()
    setDoc.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    currentUser.value = null
    await flush()
  })

  it('activity : union dédupliquée par ts, triée, et poussée vers Firestore', async () => {
    const shared = { skill: 'lettura', ts: 1000 }
    localStorage.setItem(
      'lettore.progress.activite-fusion',
      JSON.stringify({
        activity: [shared, { skill: 'scrittura', ts: 3000 }],
      })
    )
    getDoc.mockResolvedValue(
      remoteSnap({ activity: [shared, { skill: 'dialogo', ts: 2000 }] })
    )

    await login('activite-fusion')

    expect(progress.activity.map((a) => a.ts)).toEqual([1000, 2000, 3000])
    expect(pushedProgress(setDoc.mock.calls[0]).activity).toHaveLength(3)
  })

  it('errorCards : union par id ; en conflit, boîte la plus haute et due le plus lointain', async () => {
    localStorage.setItem(
      'lettore.progress.cartes-fusion',
      JSON.stringify({
        errorCards: [
          { id: 'aa', original: 'x', correction: 'y', box: 1, due: 500, addedTs: 1 },
          { id: 'bb', original: 'l', correction: 'l2', box: 0, due: 0, addedTs: 2 },
        ],
      })
    )
    getDoc.mockResolvedValue(
      remoteSnap({
        errorCards: [
          { id: 'aa', original: 'x', correction: 'y', box: 3, due: 100, addedTs: 1 },
          { id: 'cc', original: 'r', correction: 'r2', box: 2, due: 900, addedTs: 3 },
        ],
      })
    )

    await login('cartes-fusion')

    expect(progress.errorCards).toHaveLength(3)
    const merged = progress.errorCards.find((c) => c.id === 'aa')
    expect(merged.box).toBe(3)
    expect(merged.due).toBe(500)
    expect(pushedProgress(setDoc.mock.calls[0]).errorCards).toHaveLength(3)
  })

  it('skills : par compétence, le côté au lastTs le plus récent gagne', async () => {
    localStorage.setItem(
      'lettore.progress.skills-fusion',
      JSON.stringify({
        skills: {
          lettura: { count: 10, lastTs: 2000, avgScore: 0.8 },
          dialogo: { count: 1, lastTs: 100, sessions: 1 },
        },
      })
    )
    getDoc.mockResolvedValue(
      remoteSnap({
        skills: {
          lettura: { count: 3, lastTs: 500, avgScore: 0.4 },
          dialogo: { count: 5, lastTs: 900, sessions: 5 },
          pronuncia: { count: 2, lastTs: 300, avgScore: 0.6 },
        },
      })
    )

    await login('skills-fusion')

    expect(progress.skills.lettura).toEqual({ count: 10, lastTs: 2000, avgScore: 0.8 })
    expect(progress.skills.dialogo).toEqual({ count: 5, lastTs: 900, sessions: 5 })
    // Une compétence connue d'un seul côté est conservée telle quelle.
    expect(progress.skills.pronuncia).toEqual({ count: 2, lastTs: 300, avgScore: 0.6 })
    expect(pushedProgress(setDoc.mock.calls[0]).skills.pronuncia).toBeDefined()
  })

  it('tolère un document distant pré-parcours (sans activity/errorCards/skills)', async () => {
    localStorage.setItem(
      'lettore.progress.pre-parcours',
      JSON.stringify({
        activity: [{ skill: 'lettura', ts: 42 }],
        errorCards: [{ id: 'zz', original: 'a', correction: 'b', box: 0, due: 0 }],
      })
    )
    getDoc.mockResolvedValue(remoteSnap({ readTexts: ['distante'] }))

    await login('pre-parcours')

    expect(progress.activity).toHaveLength(1)
    expect(progress.errorCards).toHaveLength(1)
    expect(progress.skills).toEqual({})
  })
})
