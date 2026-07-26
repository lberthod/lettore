import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clientIp,
  createIpLimiter,
  createRateWindow,
  IP_RATE_LIMIT_MESSAGE,
  IP_TRIAL_LIMIT_MESSAGE,
} from '../ratelimit.mjs'

function fakeReq(headers = {}, remoteAddress = '10.0.0.1') {
  return { headers, socket: { remoteAddress } }
}

// --- clientIp ---

test('clientIp prend la dernière valeur de X-Forwarded-For', () => {
  // Caddy ajoute l'IP qu'il a vue en fin de liste : tout ce qui précède est
  // fourni par le client et donc falsifiable.
  const req = fakeReq({ 'x-forwarded-for': '1.2.3.4, 203.0.113.9' })
  assert.equal(clientIp(req), '203.0.113.9')
})

test('clientIp ignore un X-Forwarded-For forgé quand on ne fait pas confiance au proxy', () => {
  const req = fakeReq({ 'x-forwarded-for': '9.9.9.9' }, '127.0.0.1')
  assert.equal(clientIp(req, { trustProxy: false }), '127.0.0.1')
})

test('clientIp retombe sur la socket sans en-tête', () => {
  assert.equal(clientIp(fakeReq({}, '198.51.100.7')), '198.51.100.7')
})

// --- Plafond de comptes d'essai par IP ---

test('plafonne le nombre de comptes distincts consommant leur essai depuis une IP', () => {
  const limiter = createIpLimiter({ maxTrialAccounts: 2 })
  const ip = '203.0.113.1'

  for (const uid of ['a', 'b']) {
    assert.equal(limiter.check(ip, { uid, trial: true }), null)
    limiter.record(ip, { uid, trial: true })
  }
  // Troisième compte jetable depuis la même connexion : refusé.
  assert.equal(limiter.check(ip, { uid: 'c', trial: true }), IP_TRIAL_LIMIT_MESSAGE)
  // Une autre IP n'est pas affectée.
  assert.equal(limiter.check('203.0.113.2', { uid: 'c', trial: true }), null)
})

test('un compte déjà connu de l\'IP ne consomme pas un siège supplémentaire', () => {
  const limiter = createIpLimiter({ maxTrialAccounts: 1 })
  const ip = '203.0.113.3'
  limiter.record(ip, { uid: 'a', trial: true })
  assert.equal(limiter.check(ip, { uid: 'a', trial: true }), null)
  assert.equal(limiter.check(ip, { uid: 'b', trial: true }), IP_TRIAL_LIMIT_MESSAGE)
})

test('un compte payant n\'est pas compté dans le plafond d\'essais', () => {
  const limiter = createIpLimiter({ maxTrialAccounts: 1 })
  const ip = '203.0.113.4'
  limiter.record(ip, { uid: 'abonne', trial: false })
  limiter.record(ip, { uid: 'abonne', trial: false })
  assert.equal(limiter.check(ip, { uid: 'nouveau', trial: true }), null)
})

// --- Plafond global par IP ---

test('plafonne le nombre total de générations par IP, tous rôles confondus', () => {
  const limiter = createIpLimiter({ maxGenerations: 3 })
  const ip = '203.0.113.5'
  for (let i = 0; i < 3; i++) limiter.record(ip, { uid: 'abonne', trial: false })
  assert.equal(limiter.check(ip, { uid: 'abonne', trial: false }), IP_RATE_LIMIT_MESSAGE)
})

// --- Fenêtre glissante ---

test('les entrées sortent du compte une fois la fenêtre écoulée', () => {
  let now = 1_000_000
  const limiter = createIpLimiter({
    windowMs: 1000,
    maxTrialAccounts: 1,
    now: () => now,
  })
  const ip = '203.0.113.6'
  limiter.record(ip, { uid: 'a', trial: true })
  assert.equal(limiter.check(ip, { uid: 'b', trial: true }), IP_TRIAL_LIMIT_MESSAGE)

  now += 1001
  assert.equal(limiter.check(ip, { uid: 'b', trial: true }), null)
  assert.equal(limiter.sweep(), 0, 'IP oubliée une fois toutes ses entrées expirées')
})

test('le nombre d\'IP suivies reste borné (éviction des plus anciennes)', () => {
  const limiter = createIpLimiter({ maxTrackedIps: 2 })
  limiter.record('a', { uid: 'u', trial: true })
  limiter.record('b', { uid: 'u', trial: true })
  limiter.record('c', { uid: 'u', trial: true })
  assert.equal(limiter.size(), 2)
})

// --- Compteur d'alerte ---

test('createRateWindow compte les événements de la fenêtre courante', () => {
  let now = 0
  const window = createRateWindow({ windowMs: 100, now: () => now })
  assert.equal(window.hit(), 1)
  assert.equal(window.hit(), 2)
  now += 101
  assert.equal(window.hit(), 1, 'les événements trop vieux sont oubliés')
})
