// Lecture audio pré-généré (Chatterbox, haute qualité) avec repli sur
// speechSynthesis (src/tts.js) quand aucun fichier pré-généré n'existe pour
// le texte demandé.
//
// `speak(id)` : joue directement public/audio/<id>.mp3.
// `speakText(text, opts)` : cherche un fichier pré-généré dont le manifest
// référence exactement ce texte ; sinon retombe sur la synthèse du navigateur
// via src/tts.js, pour que l'app ne reste jamais muette.

import { speak as speakBrowser } from './src/tts.js'

const AUDIO_BASE = '/audio'

let manifestPromise = null
let currentAudio = null

async function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(`${AUDIO_BASE}/manifest.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
  }
  return manifestPromise
}

function stopCurrent() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    currentAudio = null
  }
}

// Joue un fichier pré-généré par son id (nom de fichier sans extension).
export function speak(id, { format = 'mp3', onEnd } = {}) {
  stopCurrent()
  const audio = new Audio(`${AUDIO_BASE}/${id}.${format}`)
  currentAudio = audio
  if (onEnd) audio.addEventListener('ended', onEnd, { once: true })
  return audio.play()
}

// Cherche un audio pré-généré correspondant à ce texte exact ; sinon utilise
// la synthèse vocale du navigateur.
export async function speakText(text, opts = {}) {
  const manifest = await loadManifest()
  const match = Object.entries(manifest).find(([, entry]) => entry.text === text)

  if (match) {
    const [id] = match
    return speak(id, opts)
  }

  return speakBrowser(text, opts)
}

export function stopSpeaking() {
  stopCurrent()
}
