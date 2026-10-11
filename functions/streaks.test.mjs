import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sendStreakReminders, localDateKey, reminderMessage } from './streaks.mjs'
import { makeFakeDb } from './fake-db.mjs'

// 18:00 à Zurich (UTC+2 en octobre) = 16:00 UTC
const NOW = new Date('2026-10-11T16:00:00Z')

const user = (lastActiveDate, current = 3, tokens = ['t']) => ({
  progress: { streak: { current, lastActiveDate } },
  fcmTokens: tokens,
})

test('localDateKey : suit le fuseau Europe/Zurich, pas UTC', () => {
  // 23:30 UTC le 10 = 01:30 le 11 à Zurich (été)
  assert.equal(localDateKey(new Date('2026-10-10T23:30:00Z'), 0), '2026-10-11')
  assert.equal(localDateKey(new Date('2026-10-10T23:30:00Z'), -1), '2026-10-10')
})

test('seules les séries dont la dernière activité date d’hier sont relancées', async () => {
  const db = makeFakeDb({
    users: {
      hier: user('2026-10-10'),
      aujourdhui: user('2026-10-11'),
      perdue: user('2026-10-05'),
      sansJeton: user('2026-10-10', 3, []),
      serieZero: user('2026-10-10', 0),
    },
  })
  const pushed = []
  const res = await sendStreakReminders({ db, sendPush: async (uid, n) => pushed.push([uid, n]), now: NOW })
  assert.deepEqual(pushed.map((p) => p[0]), ['hier'])
  assert.equal(res.sent, 1)
  assert.equal(pushed[0][1].data.type, 'streak_reminder')
})

test('> 1000 utilisateurs : pagination, jamais de lecture complète, concurrence bornée', async () => {
  const users = {}
  for (let i = 0; i < 1200; i++) users[`u${String(i).padStart(4, '0')}`] = user('2026-10-10')
  for (let i = 0; i < 500; i++) users[`z${i}`] = user('2026-09-01') // hors filtre
  const db = makeFakeDb({ users })
  let inFlight = 0
  let maxInFlight = 0
  const sendPush = async () => {
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise((r) => setImmediate(r))
    inFlight -= 1
  }
  const res = await sendStreakReminders({ db, sendPush, now: NOW, pageSize: 200, concurrency: 25 })
  assert.equal(res.sent, 1200)
  assert.equal(res.scanned, 1200) // les 500 hors filtre ne sont jamais chargés
  assert.ok(maxInFlight <= 25, `concurrence ${maxInFlight}`)
})

test('un envoi en échec n’interrompt pas les autres', async () => {
  const db = makeFakeDb({ users: { a: user('2026-10-10'), b: user('2026-10-10') } })
  const res = await sendStreakReminders({
    db,
    now: NOW,
    log: { error() {} },
    sendPush: async (uid) => {
      if (uid === 'a') throw new Error('boom')
    },
  })
  assert.deepEqual({ sent: res.sent, failed: res.failed }, { sent: 1, failed: 1 })
})

test('reminderMessage : pluriel', () => {
  assert.match(reminderMessage(1).body, /^1 jour de suite/)
  assert.match(reminderMessage(4).body, /^4 jours de suite/)
})
