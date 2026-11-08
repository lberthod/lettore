import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeFakeDb } from './fake-db.mjs'
import { deleteUserData } from './account.mjs'
import { emailKey, TRIAL_EMAILS, TRIAL_GRANTS } from './trial.mjs'
import { PURCHASE_TOKENS, claimPurchase } from './purchases.mjs'

function seed() {
  return makeFakeDb({
    users: { u1: { progress: {} }, u2: { progress: {} } },
    userTexts: { t1: { owner: 'u1' }, t2: { owner: 'u2' } },
    leggendoJobs: { j1: { uid: 'u1' }, j2: { uid: 'u2' } },
    leggendoQuotas: { u1: { used: 1 }, u2: { used: 2 } },
    leggendoCorrections: { c1: { uid: 'u1', text: 'Io sono' }, c2: { uid: 'u2' } },
    dialogueSessions: { d1: { uid: 'u1', turns: [] }, d2: { uid: 'u2' } },
    [TRIAL_GRANTS]: { u1: { at: 1 }, u2: { at: 2 } },
    [TRIAL_EMAILS]: {
      [emailKey('eleve@example.com')]: { uid: 'u1' },
      [emailKey('autre@example.com')]: { uid: 'u2' },
    },
    generationLogs: { l1: { uid: 'u1', email: 'eleve@example.com', totalTokens: 10 } },
  })
}

test('suppression de compte : toutes les collections du compte sont effacées, pas celles des autres', async () => {
  const db = seed()
  await claimPurchase(db, 'play', 'tokA', 'u1')
  await claimPurchase(db, 'play', 'tokB', 'u2')

  await deleteUserData(db, { uid: 'u1', email: 'eleve@example.com' })

  const ids = (name) => [...(db.cols.get(name)?.keys() || [])]
  assert.deepEqual(ids('users'), ['u2'])
  assert.deepEqual(ids('userTexts'), ['t2'])
  assert.deepEqual(ids('leggendoJobs'), ['j2'])
  assert.deepEqual(ids('leggendoQuotas'), ['u2'])
  assert.deepEqual(ids('leggendoCorrections'), ['c2'])
  assert.deepEqual(ids('dialogueSessions'), ['d2'])
  assert.deepEqual(ids(TRIAL_GRANTS), ['u2'])
  assert.deepEqual(ids(TRIAL_EMAILS), [emailKey('autre@example.com')])
  assert.equal(ids(PURCHASE_TOKENS).length, 1)
})

test('suppression de compte : les generationLogs restent, sans uid ni e-mail', async () => {
  const db = seed()
  await deleteUserData(db, { uid: 'u1', email: 'eleve@example.com' })
  const log = db.cols.get('generationLogs').get('l1')
  assert.equal(log.uid, null)
  assert.equal(log.email, null)
  assert.equal(log.totalTokens, 10)
})

test("suppression de compte sans e-mail (compte anonyme) : pas d'erreur", async () => {
  const db = seed()
  await deleteUserData(db, { uid: 'u1' })
  assert.equal(db.cols.get(TRIAL_EMAILS).size, 2)
})
