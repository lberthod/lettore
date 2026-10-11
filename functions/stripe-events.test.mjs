import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleStripeEvent } from './stripe-events.mjs'

const NOW = 1_800_000_000
function setup() {
  const calls = []
  return {
    calls,
    deps: {
      nowS: NOW,
      stripe: { subscriptions: { update: async () => ({ current_period_end: NOW + 1000 }) } },
      applyRole: async (...a) => calls.push(a),
      roleForSession: async () => 'premium_plus',
    },
  }
}
const updated = (status, extra = {}) => ({
  type: 'customer.subscription.updated',
  data: {
    object: {
      status,
      metadata: { firebaseUid: 'u1', role: 'premium_plus' },
      current_period_end: NOW + 500,
      current_period_start: NOW - 100,
      ...extra,
    },
  },
})

for (const status of ['active', 'trialing']) {
  test(`updated/${status} : premium conservé avec periodEnd`, async () => {
    const { calls, deps } = setup()
    await handleStripeEvent(updated(status), deps)
    assert.deepEqual(calls, [['u1', true, 'premium_plus', NOW + 500]])
  })
}

for (const status of ['unpaid', 'incomplete', 'incomplete_expired', 'canceled']) {
  test(`updated/${status} : rétrogradation`, async () => {
    const { calls, deps } = setup()
    await handleStripeEvent(updated(status), deps)
    assert.deepEqual(calls, [['u1', false, 'gratuit']])
  })
}

test('updated/past_due : grâce puis rétrogradation', async () => {
  let s = setup()
  await handleStripeEvent(updated('past_due'), s.deps)
  assert.equal(s.calls[0][1], true)
  s = setup()
  await handleStripeEvent(updated('past_due', { current_period_start: NOW - 10 * 86400 }), s.deps)
  assert.deepEqual(s.calls, [['u1', false, 'gratuit']])
})

test('updated sans firebaseUid : ignoré', async () => {
  const { calls, deps } = setup()
  const ev = updated('active')
  ev.data.object.metadata = {}
  await handleStripeEvent(ev, deps)
  assert.equal(calls.length, 0)
})

test('checkout.session.completed : rôle + periodEnd de l’abonnement', async () => {
  const { calls, deps } = setup()
  await handleStripeEvent(
    { type: 'checkout.session.completed', data: { object: { client_reference_id: 'u9', subscription: 'sub_1' } } },
    deps
  )
  assert.deepEqual(calls, [['u9', true, 'premium_plus', NOW + 1000]])
})

test('subscription.deleted : droits retirés', async () => {
  const { calls, deps } = setup()
  await handleStripeEvent({ type: 'customer.subscription.deleted', data: { object: { metadata: { firebaseUid: 'u1' } } } }, deps)
  assert.deepEqual(calls, [['u1', false, 'gratuit']])
})
