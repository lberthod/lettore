import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generationDoneNotification } from '../notif.mjs'

test('notification de génération : générique, sans titre de texte', () => {
  const n = generationDoneNotification('job1')
  assert.equal(n.body, 'Votre texte est prêt.')
  assert.deepEqual(n.data, { type: 'generation_done', jobId: 'job1' })
  assert.doesNotMatch(JSON.stringify(n), /«|vient d'être/)
})
