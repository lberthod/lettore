// Reconnaissance vocale italienne.
//
// - Sur le web : Web Speech API du navigateur (Firefox ne la supporte pas —
//   l'UI doit masquer proprement la fonctionnalité quand `isSupported()` est
//   faux).
// - En app native (Capacitor/Android/iOS) : la WebView n'expose pas l'API,
//   on passe donc par le plugin natif
//   @capacitor-community/speech-recognition (même pattern que src/tts.js).
// - Une écoute = un seul résultat final (`continuous: false`,
//   `interimResults: false` côté web, `partialResults: false` côté natif) :
//   suffisant pour la répétition d'une phrase.
//
// Erreurs remontées par `onError` (codes de la Web Speech API, les erreurs
// natives sont mappées sur les mêmes codes pour que l'UI reste identique) :
// - 'not-allowed' / 'service-not-allowed' : permission micro/reco refusée
// - 'no-speech' : silence / timeout sans parole détectée
// - 'audio-capture' : aucun micro disponible (ou micro déjà occupé)
// - 'not-supported' : fonctionnalité indisponible sur cet appareil

import { Capacitor } from '@capacitor/core'

const isNative = Capacitor.isNativePlatform()

const SpeechRecognitionImpl =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined

// Sur natif le plugin est toujours présent ; la vérification fine
// (`available()`) est asynchrone et faite au démarrage de l'écoute — en cas
// d'indisponibilité réelle, `onError('not-supported')` est remonté.
export function isSupported() {
  if (isNative) return true
  return Boolean(SpeechRecognitionImpl)
}

// ---------------------------------------------------------------------------
// Chemin natif (Capacitor)
// ---------------------------------------------------------------------------

// Le plugin natif remonte des messages texte (pas de codes) : on les mappe
// sur les codes de la Web Speech API attendus par PronunciationDrill.vue.
// Messages observés dans les sources du plugin (iOS Plugin.swift / Android
// SpeechRecognition.java).
function mapNativeError(err) {
  const msg = String(err?.message ?? err ?? '').toLowerCase()
  if (
    msg.includes('permission') || // "Missing permission", "Insufficient permissions"
    msg.includes('denied') || // "User denied access to …"
    msg.includes('restricted') // "Speech recognition restricted on this device"
  ) {
    return 'not-allowed'
  }
  if (
    msg.includes('no speech') || // iOS "No speech detected", Android "No speech input"
    msg.includes('no match') // Android ERROR_NO_MATCH
  ) {
    return 'no-speech'
  }
  if (
    msg.includes('audio recording') || // Android ERROR_AUDIO
    msg.includes('microphone is already in use') // iOS session occupée
  ) {
    return 'audio-capture'
  }
  if (msg.includes('not available')) {
    return 'not-supported'
  }
  return 'unknown'
}

// Une seule écoute native à la fois : chaque démarrage invalide la session
// précédente (ses callbacks ne sont plus appelés), comme `abort()` côté web.
let nativeSession = 0

async function startListeningNative({ onResult, onError, onEnd } = {}) {
  const session = ++nativeSession
  const active = () => nativeSession === session
  const finish = () => {
    if (active()) {
      nativeSession++
      if (onEnd) onEnd()
    }
  }

  let SpeechRecognition
  try {
    ;({ SpeechRecognition } = await import(
      '@capacitor-community/speech-recognition'
    ))

    const { available } = await SpeechRecognition.available()
    if (!active()) return
    if (!available) {
      if (onError) onError('not-supported')
      finish()
      return
    }

    const { speechRecognition: permission } =
      await SpeechRecognition.requestPermissions()
    if (!active()) return
    if (permission !== 'granted') {
      if (onError) onError('not-allowed')
      finish()
      return
    }
  } catch (err) {
    if (!active()) return
    if (onError) onError(mapNativeError(err))
    finish()
    return
  }

  try {
    const { matches } = await SpeechRecognition.start({
      language: 'it-IT',
      maxResults: 1,
      partialResults: false,
      popup: false,
    })
    if (!active()) return
    const transcript = matches?.[0] ?? ''
    if (transcript) {
      if (onResult) onResult(transcript)
    } else if (onError) {
      // Fin d'écoute sans aucune transcription : même sémantique que le
      // 'no-speech' du web.
      onError('no-speech')
    }
    finish()
  } catch (err) {
    if (!active()) return
    if (onError) onError(mapNativeError(err))
    finish()
  }
}

function stopListeningNative() {
  // Arrêt volontaire : on invalide la session (aucun résultat/erreur ne doit
  // remonter, comme l'`abort()` web) puis on coupe le micro natif.
  nativeSession++
  import('@capacitor-community/speech-recognition')
    .then(({ SpeechRecognition }) => SpeechRecognition.stop())
    .catch(() => {
      // plugin indisponible ou déjà arrêté : rien à faire
    })
}

// ---------------------------------------------------------------------------
// Chemin web (Web Speech API) — comportement historique, inchangé
// ---------------------------------------------------------------------------

// Une seule écoute à la fois : démarrer une nouvelle écoute annule la
// précédente sans déclencher ses callbacks.
let recognition = null

export function startListening({ onResult, onError, onEnd } = {}) {
  if (isNative) {
    startListeningNative({ onResult, onError, onEnd })
    return
  }
  if (!isSupported()) {
    if (onError) onError('not-supported')
    return
  }
  stopListening()

  const rec = new SpeechRecognitionImpl()
  recognition = rec
  rec.lang = 'it-IT'
  rec.continuous = false
  rec.interimResults = false
  rec.maxAlternatives = 1

  rec.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript ?? ''
    if (onResult) onResult(transcript)
  }
  rec.onerror = (event) => {
    if (onError) onError(event.error)
  }
  rec.onend = () => {
    if (recognition === rec) recognition = null
    if (onEnd) onEnd()
  }

  rec.start()
}

export function stopListening() {
  if (isNative) {
    stopListeningNative()
    return
  }
  if (!recognition) return
  const rec = recognition
  recognition = null
  // On coupe résultat et erreur ('aborted') : un arrêt volontaire ne doit
  // rien remonter à l'appelant, seul `onend` (état UI) reste actif.
  rec.onresult = null
  rec.onerror = null
  try {
    rec.abort()
  } catch {
    // déjà arrêtée : rien à faire
  }
}
