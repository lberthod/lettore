import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  EXAMPLE_TEXT_IDS,
  EXAMPLE_COUNT,
  FREE_CLASSICI_BOOK_IDS,
  FREE_CLASSICI_PREVIEW_BOOK_IDS,
  isFreeClassiciChapter,
  getUserRole,
  refreshUserRole,
  markRoleMayHaveChanged,
  hasCatalogAccess,
} from './access.js'
import { currentUser } from './auth.js'
import textsIndex from '../texts/index.json'

describe('EXAMPLE_TEXT_IDS (aperçu gratuit)', () => {
  it('propose exactement EXAMPLE_COUNT textes', () => {
    expect(EXAMPLE_TEXT_IDS).toHaveLength(EXAMPLE_COUNT)
  })

  it('ne contient pas de doublon', () => {
    expect(new Set(EXAMPLE_TEXT_IDS).size).toBe(EXAMPLE_TEXT_IDS.length)
  })

  it('ne référence que des textes existant réellement dans le catalogue', () => {
    const ids = new Set(textsIndex.map((t) => t.id))
    for (const id of EXAMPLE_TEXT_IDS) expect(ids.has(id)).toBe(true)
  })

  it('couvre plusieurs niveaux différents (pas tous le même)', () => {
    const levels = new Set(
      EXAMPLE_TEXT_IDS.map((id) => textsIndex.find((t) => t.id === id).level)
    )
    expect(levels.size).toBeGreaterThan(1)
  })
})

describe('isFreeClassiciChapter', () => {
  it('les livres entièrement gratuits sont accessibles à tous les chapitres', () => {
    for (const bookId of FREE_CLASSICI_BOOK_IDS) {
      expect(isFreeClassiciChapter(bookId, '01')).toBe(true)
      expect(isFreeClassiciChapter(bookId, '05')).toBe(true)
    }
  })

  it('les livres en aperçu (hors livres entièrement gratuits) ne libèrent que le premier chapitre', () => {
    const previewOnly = FREE_CLASSICI_PREVIEW_BOOK_IDS.filter(
      (id) => !FREE_CLASSICI_BOOK_IDS.includes(id)
    )
    expect(previewOnly.length).toBeGreaterThan(0)
    for (const bookId of previewOnly) {
      expect(isFreeClassiciChapter(bookId, '01')).toBe(true)
      expect(isFreeClassiciChapter(bookId, '02')).toBe(false)
    }
  })

  it('un identifiant de livre inconnu est traité comme payant', () => {
    expect(isFreeClassiciChapter('livre-inexistant', '01')).toBe(false)
  })
})

describe('getUserRole', () => {
  // Compte factice : seuls uid et getIdTokenResult sont utilisés.
  function fakeUser(getIdTokenResult, uid = 'u1') {
    return { uid, getIdTokenResult }
  }

  const offline = () => Promise.reject(new Error('network-request-failed'))
  const claims = (c) => () => Promise.resolve({ claims: c })

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    currentUser.value = null
  })

  it('renvoie « gratuit » sans compte connecté', async () => {
    expect(await getUserRole()).toBe('gratuit')
  })

  it('lit le rôle des custom claims du token', async () => {
    currentUser.value = fakeUser(claims({ role: 'premium_plus' }))
    expect(await getUserRole()).toBe('premium_plus')
  })

  it('accepte l’ancienne claim booléenne « premium »', async () => {
    currentUser.value = fakeUser(claims({ premium: true }))
    expect(await getUserRole()).toBe('premium')
  })

  it('utilise le token en cache, sans renouvellement réseau forcé', async () => {
    const getIdTokenResult = vi.fn(claims({ role: 'premium' }))
    currentUser.value = fakeUser(getIdTokenResult)
    await getUserRole()
    expect(getIdTokenResult).toHaveBeenCalledWith(false)
  })

  it('hors ligne, conserve le dernier rôle connu du compte', async () => {
    currentUser.value = fakeUser(claims({ role: 'premium' }))
    expect(await getUserRole()).toBe('premium')

    currentUser.value = fakeUser(offline)
    expect(await getUserRole()).toBe('premium')
    expect(await hasCatalogAccess()).toBe(true)
  })

  it('hors ligne sans rôle mémorisé, retombe sur « gratuit »', async () => {
    currentUser.value = fakeUser(offline)
    expect(await getUserRole()).toBe('gratuit')
  })

  it('ne réutilise pas le rôle mémorisé d’un autre compte', async () => {
    currentUser.value = fakeUser(claims({ role: 'enseignant' }), 'u1')
    await getUserRole()

    currentUser.value = fakeUser(offline, 'u2')
    expect(await getUserRole()).toBe('gratuit')
  })

  it('refreshUserRole force le renouvellement du token', async () => {
    const getIdTokenResult = vi.fn(claims({ role: 'premium' }))
    currentUser.value = fakeUser(getIdTokenResult)
    await refreshUserRole()
    expect(getIdTokenResult).toHaveBeenCalledWith(true)
  })

  it('après un paiement, renouvelle une fois puis revient au token en cache', async () => {
    const getIdTokenResult = vi.fn(claims({ role: 'premium' }))
    currentUser.value = fakeUser(getIdTokenResult)
    markRoleMayHaveChanged()

    await getUserRole()
    expect(getIdTokenResult).toHaveBeenLastCalledWith(true)
    await getUserRole()
    expect(getIdTokenResult).toHaveBeenLastCalledWith(false)
  })

  it('un renouvellement échoué ne consomme pas le marqueur de paiement', async () => {
    const getIdTokenResult = vi.fn(offline)
    currentUser.value = fakeUser(getIdTokenResult)
    markRoleMayHaveChanged()

    await getUserRole()
    await getUserRole()
    expect(getIdTokenResult).toHaveBeenLastCalledWith(true)
  })
})
