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
