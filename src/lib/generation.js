// État partagé de la génération « Créer son texte » : vit au niveau module
// (et non dans une vue) pour que la génération continue pendant qu'on navigue,
// et le job actif est persisté dans localStorage pour reprendre le sondage
// après un rechargement de page. À la fin, le texte est enregistré dans
// Firestore automatiquement, quelle que soit la vue affichée.

import { reactive } from 'vue'
import { getAuthInstance } from './firebase.js'
import { saveUserText } from './userTexts.js'

export const API_BASE =
  import.meta.env.VITE_LEGGENDO_API || 'https://api.loicberthod.ch/leggendo'

const STORAGE_KEY = 'leggendo-generation-job'

export const generation = reactive({
  status: 'idle', // idle | working | done | error
  jobId: null,
  title: '', // titre demandé, pour l'affichage pendant la génération
  startedAt: null,
  elapsed: 0, // secondes écoulées
  error: '',
  result: null,
  saveState: '', // '' | saving | saved | error
  savedEntry: null, // entrée d'index Firestore une fois enregistré
})

let pollTimer = null
let clockTimer = null

function stopTimers() {
  clearTimeout(pollTimer)
  clearInterval(clockTimer)
  pollTimer = clockTimer = null
}

function startClock() {
  clearInterval(clockTimer)
  generation.elapsed = Math.max(
    0,
    Math.round((Date.now() - generation.startedAt) / 1000)
  )
  clockTimer = setInterval(() => generation.elapsed++, 1000)
}

function persistJob() {
  if (generation.status === 'working' && generation.jobId) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        jobId: generation.jobId,
        title: generation.title,
        startedAt: generation.startedAt,
      })
    )
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

export async function startGeneration(payload) {
  generation.status = 'working'
  generation.error = ''
  generation.result = null
  generation.saveState = ''
  generation.savedEntry = null
  generation.title = payload.title
  generation.startedAt = Date.now()
  startClock()

  try {
    const auth = await getAuthInstance()
    const idToken = await auth?.currentUser?.getIdToken()
    if (!idToken) throw new Error('Connectez-vous pour créer un texte.')

    const res = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
    generation.jobId = data.jobId
    persistJob()
    poll()
  } catch (err) {
    fail(err.message)
  }
}

function poll() {
  clearTimeout(pollTimer)
  pollTimer = setTimeout(async () => {
    try {
      const res = await fetch(`${API_BASE}/jobs/${generation.jobId}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
      if (data.status === 'done') {
        stopTimers()
        generation.result = data.result
        generation.status = 'done'
        persistJob()
        saveResult()
      } else if (data.status === 'error') {
        throw new Error(data.error || 'La génération a échoué.')
      } else {
        poll()
      }
    } catch (err) {
      fail(err.message)
    }
  }, 4000)
}

function fail(message) {
  stopTimers()
  generation.error = message
  generation.status = 'error'
  persistJob()
}

export async function saveResult() {
  if (!generation.result) return
  generation.saveState = 'saving'
  try {
    generation.savedEntry = await saveUserText(generation.result)
    generation.saveState = 'saved'
  } catch (err) {
    console.error('Enregistrement du texte :', err)
    generation.saveState = 'error'
  }
}

// Reprend le sondage d'un job encore actif après un rechargement de page.
// À appeler au montage des vues concernées ; sans effet s'il n'y a rien.
export function resumeGeneration() {
  if (generation.status !== 'idle') return
  let saved
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    saved = null
  }
  if (!saved?.jobId) return
  generation.status = 'working'
  generation.jobId = saved.jobId
  generation.title = saved.title || ''
  generation.startedAt = saved.startedAt || Date.now()
  startClock()
  poll()
}

// Repart pour une nouvelle demande (efface le résultat affiché).
export function clearGeneration() {
  stopTimers()
  generation.status = 'idle'
  generation.jobId = null
  generation.title = ''
  generation.error = ''
  generation.result = null
  generation.saveState = ''
  generation.savedEntry = null
  persistJob()
}
