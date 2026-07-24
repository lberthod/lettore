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

// Durée indicative (secondes) selon la taille demandée, pour afficher une
// barre de progression. Purement cosmétique : le sondage fait foi.
const ESTIMATE_SECONDS = { corto: 60, medio: 120, lungo: 210, molto_lungo: 300 }
const DEFAULT_ESTIMATE = 120

export const generation = reactive({
  status: 'idle', // idle | working | done | error
  jobId: null,
  title: '', // titre demandé, pour l'affichage pendant la génération
  startedAt: null,
  elapsed: 0, // secondes écoulées
  estimate: DEFAULT_ESTIMATE, // durée indicative totale, pour la progression
  error: '',
  result: null,
  saveState: '', // '' | saving | saved | error
  saveError: '', // détail de l'erreur d'enregistrement (code + message)
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
        estimate: generation.estimate,
      })
    )
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

async function getIdToken() {
  const auth = await getAuthInstance()
  return (await auth?.currentUser?.getIdToken()) || null
}

// Se rattache à la génération active côté serveur (jobId perdu après un
// rechargement, autre onglet…). Renvoie true si un job a été retrouvé.
export async function attachActiveJob() {
  try {
    const idToken = await getIdToken()
    if (!idToken) return false
    const res = await fetch(`${API_BASE}/my-job`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.jobId) return false
    stopTimers()
    generation.status = 'working'
    generation.jobId = data.jobId
    generation.title = data.title || generation.title || 'votre texte'
    generation.startedAt = data.createdAt || Date.now()
    generation.estimate = ESTIMATE_SECONDS[data.size] || DEFAULT_ESTIMATE
    generation.error = ''
    generation.result = null
    startClock()
    persistJob()
    poll()
    return true
  } catch {
    return false
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
  generation.estimate = ESTIMATE_SECONDS[payload.size] || DEFAULT_ESTIMATE
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
    if (!res.ok) {
      // « Déjà en cours » : on retrouve ce job et on suit sa progression
      // plutôt que d'afficher une erreur sans issue.
      if (res.status === 429 && (await attachActiveJob())) return
      throw new Error(data.error || `Erreur ${res.status}`)
    }
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
      const idToken = await getIdToken()
      const res = await fetch(`${API_BASE}/jobs/${generation.jobId}`, {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      })
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
  generation.saveError = ''
  try {
    generation.savedEntry = await saveUserText(generation.result)
    generation.saveState = 'saved'
  } catch (err) {
    console.error('Enregistrement du texte :', err)
    generation.saveError = [err?.code, err?.message || String(err)]
      .filter(Boolean)
      .join(' — ')
    generation.saveState = 'error'
  }
}

// Reprend le sondage d'un job encore actif après un rechargement de page.
// À appeler au montage des vues concernées ; sans effet s'il n'y a rien.
// Si localStorage ne sait rien, on demande aussi au serveur (jobId perdu).
export function resumeGeneration() {
  if (generation.status !== 'idle') return
  let saved
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    saved = null
  }
  if (!saved?.jobId) {
    attachActiveJob()
    return
  }
  generation.status = 'working'
  generation.jobId = saved.jobId
  generation.title = saved.title || ''
  generation.startedAt = saved.startedAt || Date.now()
  generation.estimate = saved.estimate || DEFAULT_ESTIMATE
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
