import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { currentUser } from './lib/auth.js'
import { progress, markRead } from './progress.js'

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
