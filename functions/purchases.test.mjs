import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { HttpsError } from 'firebase-functions/v2/https'
import {
  claimPurchase,
  checkPlayAccount,
  deletePurchaseTokensFor,
  verifyAppleReceipt,
  pickActiveAppleTransaction,
  purchaseKey,
  PURCHASE_TOKENS,
  APPLE_BUNDLE_ID,
} from './purchases.mjs'
import { makeFakeDb } from './fake-db.mjs'

const code = (c) => (e) => e instanceof HttpsError && e.code === c

test('même jeton Play, deux uid : le second est refusé', async () => {
  const db = makeFakeDb()
  await claimPurchase(db, 'play', 'tok1', 'u1')
  await assert.rejects(claimPurchase(db, 'play', 'tok1', 'u2'), code('permission-denied'))
  assert.equal(db.cols.get(PURCHASE_TOKENS).get(purchaseKey('play', 'tok1')).uid, 'u1')
})

test('restauration par le même uid : acceptée', async () => {
  const db = makeFakeDb()
  await claimPurchase(db, 'apple', 'otid', 'u1')
  await claimPurchase(db, 'apple', 'otid', 'u1')
})

test('Play et Apple ne partagent pas d’espace de clés', async () => {
  const db = makeFakeDb()
  await claimPurchase(db, 'play', 'x', 'u1')
  await claimPurchase(db, 'apple', 'x', 'u2')
})

test('Play : obfuscatedExternalAccountId d’un autre compte refusé, clair ou haché accepté', () => {
  assert.throws(() => checkPlayAccount({ obfuscatedExternalAccountId: 'autre' }, 'u1'), code('permission-denied'))
  assert.doesNotThrow(() => checkPlayAccount({ obfuscatedExternalAccountId: 'u1' }, 'u1'))
  assert.doesNotThrow(() =>
    checkPlayAccount({ obfuscatedExternalAccountId: createHash('sha256').update('u1').digest('hex') }, 'u1')
  )
  assert.doesNotThrow(() => checkPlayAccount({}, 'u1'))
})

const future = String(Date.now() + 86400000)

test('Apple : mauvais bundle_id refusé', () => {
  assert.throws(
    () => pickActiveAppleTransaction({ receipt: { bundle_id: 'com.autre.app' }, latest_receipt_info: [] }),
    code('permission-denied')
  )
})

test('Apple : bon bundle, transaction active la plus récente retenue', () => {
  const body = {
    receipt: { bundle_id: APPLE_BUNDLE_ID },
    latest_receipt_info: [
      { expires_date_ms: String(Date.now() - 1000), original_transaction_id: 'old' },
      { expires_date_ms: future, original_transaction_id: 'cur' },
    ],
  }
  assert.equal(pickActiveAppleTransaction(body).original_transaction_id, 'cur')
  assert.equal(pickActiveAppleTransaction({ receipt: { bundle_id: APPLE_BUNDLE_ID } }), null)
})

test('Apple : réponse HTTP non ok => erreur propre', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) })
  await assert.rejects(verifyAppleReceipt('r', 's', { url: 'https://p', fetchImpl }), code('unavailable'))
})

test('Apple : timeout => deadline-exceeded', async () => {
  const fetchImpl = (url, { signal }) =>
    new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' })))
    })
  await assert.rejects(
    verifyAppleReceipt('r', 's', { url: 'https://p', fetchImpl, timeoutMs: 20 }),
    code('deadline-exceeded')
  )
})

test('Apple : 21007 => nouvel essai contre le sandbox', async () => {
  const urls = []
  const fetchImpl = async (url) => {
    urls.push(url)
    return { ok: true, json: async () => ({ status: url === 'https://sb' ? 0 : 21007 }) }
  }
  const body = await verifyAppleReceipt('r', 's', { url: 'https://p', sandboxUrl: 'https://sb', fetchImpl })
  assert.equal(body.status, 0)
  assert.deepEqual(urls, ['https://p', 'https://sb'])
})

test('Play : MD5(uid) hex, valeur réellement produite par cordova-plugin-purchase (Utils.md5), accepté', () => {
  // Obfuscator 'legacy' sur Google Play = CdvPurchase.Utils.md5(applicationUsername).
  // Valeur obtenue en exécutant store.js du plugin : Utils.md5('u1').
  const pluginValue = 'e4774cdda0793f86414e8b9140bb6db4'
  assert.doesNotThrow(() => checkPlayAccount({ obfuscatedExternalAccountId: pluginValue }, 'u1'))
  assert.throws(() => checkPlayAccount({ obfuscatedExternalAccountId: pluginValue }, 'u2'), code('permission-denied'))
})

test('suppression de compte : les liaisons d’achat de l’uid sont libérées, pas celles des autres', async () => {
  const db = makeFakeDb()
  await claimPurchase(db, 'play', 'tokA', 'u1')
  await claimPurchase(db, 'play', 'tokB', 'u2')
  assert.equal(await deletePurchaseTokensFor(db, 'u1'), 1)
  // Le nouveau compte de l'abonné peut restaurer son achat.
  await claimPurchase(db, 'play', 'tokA', 'u1bis')
  assert.equal(db.cols.get(PURCHASE_TOKENS).get(purchaseKey('play', 'tokB')).uid, 'u2')
})
