import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAppCheckGuard, APP_CHECK_MESSAGE } from '../appcheck.mjs'

const silent = { warn() {} }
const accept = async () => ({ appId: 'app' })
const reject = async () => {
  throw new Error('jeton expiré')
}

test('mode off : rien n\'est vérifié ni refusé', async () => {
  const guard = createAppCheckGuard({ mode: 'off' })
  assert.equal(await guard(undefined), null)
  assert.equal(await guard('n\'importe quoi'), null)
})

test('mode soft : laisse passer un jeton absent ou invalide, mais le journalise', async () => {
  const warnings = []
  const guard = createAppCheckGuard({
    mode: 'soft',
    verifyToken: reject,
    log: { warn: (m) => warnings.push(m) },
  })
  assert.equal(await guard(undefined, 'generate'), null)
  assert.equal(await guard('mauvais', 'generate'), null)
  assert.equal(warnings.length, 2)
  assert.match(warnings[0], /jeton absent/)
  assert.match(warnings[1], /jeton invalide/)
})

test('mode enforce : refuse en l\'absence de jeton', async () => {
  const guard = createAppCheckGuard({ mode: 'enforce', verifyToken: accept, log: silent })
  assert.equal(await guard(undefined), APP_CHECK_MESSAGE)
})

test('mode enforce : refuse un jeton invalide, accepte un jeton valide', async () => {
  const bad = createAppCheckGuard({ mode: 'enforce', verifyToken: reject, log: silent })
  assert.equal(await bad('périmé'), APP_CHECK_MESSAGE)

  const good = createAppCheckGuard({ mode: 'enforce', verifyToken: accept, log: silent })
  assert.equal(await good('valide'), null)
})

test('un mode inconnu échoue au démarrage plutôt que de désactiver silencieusement', () => {
  // Une faute de frappe dans APP_CHECK_MODE ne doit pas se traduire par une
  // protection désactivée sans que personne ne s'en aperçoive.
  assert.throws(() => createAppCheckGuard({ mode: 'enforced' }), /APP_CHECK_MODE invalide/)
})

test('un mode actif sans vérificateur échoue au démarrage', () => {
  assert.throws(() => createAppCheckGuard({ mode: 'enforce' }), /verifyToken requis/)
})
