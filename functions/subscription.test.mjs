import { test } from 'node:test'
import assert from 'node:assert/strict'
import { subscriptionAccess, PAST_DUE_GRACE_DAYS } from './subscription.mjs'

const NOW = 1_800_000_000
const DAY = 86400

for (const status of ['active', 'trialing']) {
  test(`statut ${status} : droits conservés`, () => {
    assert.equal(subscriptionAccess({ status }, NOW).premium, true)
  })
}

for (const status of ['unpaid', 'incomplete', 'incomplete_expired', 'canceled', 'paused', undefined, 'inconnu']) {
  test(`statut ${status} : rétrogradation`, () => {
    assert.equal(subscriptionAccess({ status }, NOW).premium, false)
  })
}

test('past_due : grâce courte puis rétrogradation', () => {
  const dans = { status: 'past_due', current_period_start: NOW - (PAST_DUE_GRACE_DAYS - 1) * DAY }
  const hors = { status: 'past_due', current_period_start: NOW - (PAST_DUE_GRACE_DAYS + 1) * DAY }
  assert.equal(subscriptionAccess(dans, NOW).premium, true)
  assert.equal(subscriptionAccess(hors, NOW).premium, false)
  assert.equal(subscriptionAccess({ status: 'past_due' }, NOW).premium, false)
})
