// Reconnaissance vocale italienne (Web Speech API).
//
// - Web uniquement : Firefox ne supporte pas l'API, et la WebView native
//   (Capacitor) ne l'expose pas non plus — l'UI doit masquer proprement la
//   fonctionnalité quand `isSupported()` est faux.
// - Une écoute = un seul résultat final (`continuous: false`,
//   `interimResults: false`) : suffisant pour la répétition d'une phrase.
//
// Erreurs remontées telles quelles par `onError` (codes de l'API) :
// - 'not-allowed' / 'service-not-allowed' : permission micro refusée
// - 'no-speech' : silence / timeout sans parole détectée
// - 'audio-capture' : aucun micro disponible

const SpeechRecognitionImpl =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined

export function isSupported() {
  return Boolean(SpeechRecognitionImpl)
}

// Une seule écoute à la fois : démarrer une nouvelle écoute annule la
// précédente sans déclencher ses callbacks.
let recognition = null

export function startListening({ onResult, onError, onEnd } = {}) {
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
