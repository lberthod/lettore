import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notifyNewContentIfDue, PUSH_INTERVAL_MS, MAX_PUSH_PER_DAY } from '../news-push.mjs'
import { makeFakePushDb, makeFakeMessaging } from './fake-push.mjs'

const NOW = Date.parse('2026-10-11T12:00:00Z')
const today = '2026-10-11'

function usersWithTokens(n, perUser = 1) {
  const users = {}
  for (let i = 0; i < n; i++) {
    users[`u${i}`] = { fcmTokens: Array.from({ length: perUser }, (_, j) => `t${i}_${j}`) }
  }
  return users
}

test('> 500 jetons : plusieurs appels sendEachForMulticast de <= 500', async () => {
  const users = usersWithTokens(700)
  const { db } = makeFakePushDb({ users })
  const messaging = makeFakeMessaging()
  const res = await notifyNewContentIfDue({
    db,
    messaging,
    now: NOW,
    listUids: async () => Object.keys(users),
  })
  assert.equal(messaging.calls.length, 2)
  assert.ok(messaging.calls.every((c) => c.tokens.length <= 500))
  assert.equal(res.sent, 700)
})

test('compteur incrémenté après un envoi réussi', async () => {
  const users = usersWithTokens(3)
  const { db, state } = makeFakePushDb({ users })
  await notifyNewContentIfDue({ db, messaging: makeFakeMessaging(), now: NOW, listUids: async () => Object.keys(users) })
  assert.equal(state.newsState.pushCountToday, 1)
  assert.equal(state.newsState.lastPushAt, NOW)
  assert.equal(state.newsState.pushDate, today)
})

test('compteur NON incrémenté si tous les envois échouent', async () => {
  const users = usersWithTokens(3)
  const { db, state } = makeFakePushDb({ users })
  const messaging = makeFakeMessaging((b) =>
    b.map(() => ({ success: false, error: { code: 'messaging/internal-error' } }))
  )
  const res = await notifyNewContentIfDue({ db, messaging, now: NOW, listUids: async () => Object.keys(users) })
  assert.equal(res.sent, 0)
  assert.equal(state.newsState, undefined)
})

test('compteur NON incrémenté si FCM lève une exception', async () => {
  const users = usersWithTokens(2)
  const { db, state } = makeFakePushDb({ users })
  const messaging = makeFakeMessaging(() => {
    throw new Error('panne')
  })
  const orig = console.error
  console.error = () => {}
  try {
    await notifyNewContentIfDue({ db, messaging, now: NOW, listUids: async () => Object.keys(users) })
  } finally {
    console.error = orig
  }
  assert.equal(state.newsState, undefined)
})

test('intervalle de 4 h et plafond quotidien respectés', async () => {
  const users = usersWithTokens(1)
  const listUids = async () => Object.keys(users)
  let f = makeFakePushDb({ users, newsState: { lastPushAt: NOW - PUSH_INTERVAL_MS + 1000, pushDate: today, pushCountToday: 1 } })
  let messaging = makeFakeMessaging()
  let res = await notifyNewContentIfDue({ db: f.db, messaging, now: NOW, listUids })
  assert.equal(res.skipped, 'interval')
  assert.equal(messaging.calls.length, 0)

  f = makeFakePushDb({ users, newsState: { lastPushAt: NOW - PUSH_INTERVAL_MS - 1, pushDate: today, pushCountToday: MAX_PUSH_PER_DAY } })
  messaging = makeFakeMessaging()
  res = await notifyNewContentIfDue({ db: f.db, messaging, now: NOW, listUids })
  assert.equal(res.skipped, 'daily-cap')
  assert.equal(messaging.calls.length, 0)
})

test('nouveau jour : le compteur repart de 1', async () => {
  const users = usersWithTokens(1)
  const f = makeFakePushDb({ users, newsState: { lastPushAt: NOW - 86400000, pushDate: '2026-10-10', pushCountToday: 6 } })
  await notifyNewContentIfDue({ db: f.db, messaging: makeFakeMessaging(), now: NOW, listUids: async () => ['u0'] })
  assert.equal(f.state.newsState.pushCountToday, 1)
})
