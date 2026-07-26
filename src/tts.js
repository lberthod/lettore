// Synthèse vocale. Sur le web : Web Speech API du navigateur (aucune API
// externe). Sur mobile natif (Capacitor/Android) : la WebView système
// n'implémente pas `speechSynthesis`, on passe donc par le moteur TTS
// natif Android via @capacitor-community/text-to-speech. La même API
// (speakItalian/stopSpeaking/pauseSpeaking/resumeSpeaking/ttsSupported)
// est exposée dans les deux cas, les vues n'ont rien à savoir de la
// plateforme.
import { Capacitor } from '@capacitor/core'

const isNative = Capacitor.isNativePlatform()

export const ttsSupported =
  isNative || (typeof window !== 'undefined' && 'speechSynthesis' in window)

let voices = []

function refreshVoices() {
  voices = window.speechSynthesis.getVoices()
}

if (!isNative && ttsSupported) {
  refreshVoices()
  window.speechSynthesis.onvoiceschanged = refreshVoices
}

function italianVoice() {
  return voices.find((v) => v.lang.toLowerCase().startsWith('it')) || null
}

// Android TTS n'a pas de notion de pause/reprise (contrairement à
// `speechSynthesis`) : seul stop() existe côté natif. `pauseSpeaking` y
// est donc un arrêt complet, `resumeSpeaking` un no-op — un compromis
// documenté plutôt qu'une fonctionnalité manquante silencieuse.
async function speakNative(text, { rate = 0.9, onEnd } = {}) {
  const { TextToSpeech } = await import('@capacitor-community/text-to-speech')
  try {
    await TextToSpeech.speak({
      text,
      lang: 'it-IT',
      rate,
      category: 'playback',
    })
  } finally {
    if (onEnd) onEnd()
  }
}

export function speakItalian(text, { rate = 0.9, onEnd } = {}) {
  if (!ttsSupported) return
  if (isNative) {
    speakNative(text, { rate, onEnd })
    return
  }
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'it-IT'
  const voice = italianVoice()
  if (voice) utterance.voice = voice
  utterance.rate = rate
  if (onEnd) {
    utterance.onend = onEnd
    utterance.onerror = onEnd
  }
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking() {
  if (!ttsSupported) return
  if (isNative) {
    import('@capacitor-community/text-to-speech').then(({ TextToSpeech }) =>
      TextToSpeech.stop()
    )
    return
  }
  window.speechSynthesis.cancel()
}

export function pauseSpeaking() {
  if (!ttsSupported) return
  if (isNative) {
    stopSpeaking()
    return
  }
  window.speechSynthesis.pause()
}

export function resumeSpeaking() {
  if (!ttsSupported || isNative) return
  window.speechSynthesis.resume()
}
