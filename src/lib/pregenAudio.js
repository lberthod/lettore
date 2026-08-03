// Lecture audio pré-généré (Chatterbox, haute qualité) avec repli automatique
// sur la synthèse vocale du navigateur (src/tts.js) quand aucun fichier
// pré-généré ne correspond exactement au texte demandé.
//
// Le manifest (public/audio/manifest.json) associe un hash du texte à l'id
// du fichier audio qui le prononce — généré par pregen_tts.py. Volontairement
// SANS le texte en clair : ce fichier est embarqué tel quel dans le build
// (dist/), donc public, et une partie du catalogue (chapitres Classici
// au-delà de l'aperçu) est payante — voir scripts/check-build-leaks.mjs, qui
// fait échouer le build si du texte réservé y apparaît. Le texte lui-même
// reste dans le manifest privé (audio-manifest/, jamais servi).
//
// Même API que src/tts.js (speak/stop/pause/resume) pour un remplacement
// direct.

import { speakItalian, stopSpeaking, pauseSpeaking, resumeSpeaking } from '../tts.js'

let manifestPromise = null
let currentAudio = null
let usingPregen = false

function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch('/audio/manifest.json')
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
  }
  return manifestPromise
}

// Doit produire exactement le même hash que content_hash() dans
// pregen_tts.py (sha256 du texte UTF-8, 16 premiers caractères hex).
async function hashText(text) {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
}

export async function speakItalianPregen(text, { rate = 0.9, onEnd } = {}) {
  const [manifest, hash] = await Promise.all([loadManifest(), hashText(text)])
  const id = manifest[hash] || null

  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }

  if (id) {
    stopSpeaking()
    usingPregen = true
    const audio = new Audio(`/audio/${id}.mp3`)
    audio.playbackRate = rate
    currentAudio = audio
    if (onEnd) audio.addEventListener('ended', onEnd, { once: true })
    audio.play()
    return
  }

  usingPregen = false
  speakItalian(text, { rate, onEnd })
}

export function stopPregenSpeaking() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  usingPregen = false
  stopSpeaking()
}

export function pausePregenSpeaking() {
  if (usingPregen && currentAudio) {
    currentAudio.pause()
    return
  }
  pauseSpeaking()
}

export function resumePregenSpeaking() {
  if (usingPregen && currentAudio) {
    currentAudio.play()
    return
  }
  resumeSpeaking()
}
