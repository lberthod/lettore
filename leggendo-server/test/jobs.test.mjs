import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FakeFirestore } from './fake-firestore.mjs'
import { createJobStore, JOB_STUCK_MS } from '../jobs.mjs'
import { QuotaExceededError, FREE_STARTER_CREDITS } from '../quota.mjs'

function makeStore() {
  return createJobStore(new FakeFirestore())
}

test('reserveJob crée le job et consomme le quota dans la même opération', async () => {
  const store = makeStore()
  const user = { uid: 'u1', role: 'gratuit', premium: false }
  const jobRef = store.jobsCollection.doc('job-1')
  const q = await store.reserveJob(user, jobRef, 'Mon titre')
  assert.equal(q.totalCount, 1)

  const jobDoc = await jobRef.get()
  assert.equal(jobDoc.exists, true)
  assert.equal(jobDoc.data().uid, 'u1')
  assert.equal(jobDoc.data().status, 'pending')
})

test('reserveJob refuse et ne crée rien quand le quota gratuit est épuisé', async () => {
  const store = makeStore()
  const user = { uid: 'u1', role: 'gratuit', premium: false }

  // Épuise les crédits de bienvenue.
  for (let i = 0; i < FREE_STARTER_CREDITS; i++) {
    await store.reserveJob(user, store.jobsCollection.doc(`job-${i}`), `Titre ${i}`)
    // On marque chaque job comme terminé pour ne pas être bloqué par "un seul job actif".
    await store.jobsCollection.doc(`job-${i}`).update({ status: 'done' })
  }

  const jobRef = store.jobsCollection.doc('job-refused')
  await assert.rejects(() => store.reserveJob(user, jobRef, 'Titre refusé'), QuotaExceededError)

  const jobDoc = await jobRef.get()
  assert.equal(jobDoc.exists, false, 'le job ne doit pas être créé si le quota est refusé')
})

test('activeJobFor retrouve le job en cours puis ne retrouve plus rien une fois terminé', async () => {
  const store = makeStore()
  const user = { uid: 'u1', role: 'gratuit', premium: false }
  const jobRef = store.jobsCollection.doc('job-1')
  await store.reserveJob(user, jobRef, 'Mon titre')

  const active = await store.activeJobFor('u1')
  assert.equal(active.id, 'job-1')

  await jobRef.update({ status: 'done' })
  assert.equal(await store.activeJobFor('u1'), null)
})

test('activeJobFor marque en erreur puis ignore un job bloqué depuis trop longtemps', async () => {
  const store = makeStore()
  const jobRef = store.jobsCollection.doc('job-stuck')
  await jobRef.set({
    uid: 'u1',
    status: 'running',
    createdAt: Date.now() - JOB_STUCK_MS - 1000,
    title: 'Bloqué',
  })

  const active = await store.activeJobFor('u1')
  assert.equal(active, null)

  const job = await jobRef.get()
  assert.equal(job.data().status, 'error')
})

test('jobFor ne renvoie le job qu\'à son propriétaire', async () => {
  const store = makeStore()
  const jobRef = store.jobsCollection.doc('job-1')
  await jobRef.set({ uid: 'u1', status: 'done', title: 'Mon titre', result: { text: 'ciao' } })

  assert.deepEqual((await store.jobFor('u1', 'job-1')).uid, 'u1')
  assert.equal(await store.jobFor('u2', 'job-1'), null)
  assert.equal(await store.jobFor('u1', 'job-inconnu'), null)
})
