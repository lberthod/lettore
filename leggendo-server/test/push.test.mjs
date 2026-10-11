import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  INVALID_TOKEN_CODES,
  isStaleTokenError,
  sendPushToUsers,
  FCM_BATCH_SIZE,
} from '../push.mjs'
import { makeFakePushDb, makeFakeMessaging } from './fake-push.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

test('les deux copies de push.mjs (functions/ et leggendo-server/) sont identiques', () => {
  const vps = fs.readFileSync(path.join(HERE, '..', 'push.mjs'), 'utf8')
  const fns = fs.readFileSync(path.join(HERE, '..', '..', 'functions', 'push.mjs'), 'utf8')
  assert.equal(fns, vps)
})

test('isStaleTokenError : seuls les deux codes de jeton mort sont élagués', () => {
  assert.equal(isStaleTokenError('messaging/registration-token-not-registered'), true)
  assert.equal(isStaleTokenError('messaging/invalid-registration-token'), true)
  assert.equal(isStaleTokenError('messaging/invalid-argument'), false)
  assert.equal(isStaleTokenError('messaging/internal-error'), false)
  assert.equal(isStaleTokenError(undefined), false)
  assert.equal(INVALID_TOKEN_CODES.size, 2)
})

test('sendPushToUsers : élague les jetons morts, garde ceux en invalid-argument', async () => {
  const { db, updates } = makeFakePushDb({ users: { u1: { fcmTokens: ['a', 'b', 'c'] } } })
  const messaging = makeFakeMessaging(() => [
    { success: true },
    { success: false, error: { code: 'messaging/registration-token-not-registered' } },
    { success: false, error: { code: 'messaging/invalid-argument' } },
  ])
  const res = await sendPushToUsers(db, ['u1'], { title: 't', body: 'b' }, { messaging })
  assert.deepEqual(res, { sent: 1, failed: 2 })
  assert.equal(updates.length, 1)
  assert.equal(updates[0].uid, 'u1')
  // arrayRemove ne reçoit que le jeton « b » (registration-token-not-registered)
  assert.deepEqual(updates[0].patch.fcmTokens.elements, ['b'])
})

test('sendPushToUsers : plusieurs lots de <= 500 jetons', async () => {
  const tokens = Array.from({ length: 1203 }, (_, i) => `tok${i}`)
  const { db } = makeFakePushDb({ users: { u1: { fcmTokens: tokens } } })
  const messaging = makeFakeMessaging()
  const res = await sendPushToUsers(db, ['u1'], { title: 't', body: 'b' }, { messaging })
  assert.equal(messaging.calls.length, 3)
  assert.ok(messaging.calls.every((c) => c.tokens.length <= FCM_BATCH_SIZE))
  assert.equal(res.sent, 1203)
})

test('sendPushToUsers : un lot qui lève ne bloque pas les suivants', async () => {
  const tokens = Array.from({ length: 600 }, (_, i) => `tok${i}`)
  const { db } = makeFakePushDb({ users: { u1: { fcmTokens: tokens } } })
  const messaging = makeFakeMessaging((batch, i) => {
    if (i === 0) throw new Error('FCM indisponible')
    return batch.map(() => ({ success: true }))
  })
  const origError = console.error
  console.error = () => {}
  try {
    const res = await sendPushToUsers(db, ['u1'], { title: 't', body: 'b' }, { messaging })
    assert.deepEqual(res, { sent: 100, failed: 500 })
  } finally {
    console.error = origError
  }
})

test('sendPushToUsers : sans destinataire ni jeton, aucun appel FCM', async () => {
  const { db } = makeFakePushDb({ users: { u1: {} } })
  const messaging = makeFakeMessaging()
  assert.deepEqual(await sendPushToUsers(db, [], {}, { messaging }), { sent: 0, failed: 0 })
  assert.deepEqual(await sendPushToUsers(db, ['u1', 'absent'], {}, { messaging }), { sent: 0, failed: 0 })
  assert.equal(messaging.calls.length, 0)
})
