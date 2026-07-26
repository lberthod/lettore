// Synthèse vocale italienne.
//
// - Sur le web : Web Speech API du navigateur (aucune API externe).
// - En app native (Capacitor) : `speechSynthesis` n'existe pas dans la
//   WebView iOS/Android, on passe donc par le plugin natif
//   @capacitor-community/text-to-speech (moteur TTS du système).
//
// Limitation du plugin natif : pas de vraie pause/reprise (l'API native ne
// l'expose pas) — `pauseSpeaking` y équivaut à `stopSpeaking`.

import { Capacitor } from '@capacitor/core'

const isNative = Capacitor.isNativePlatform()

export const ttsSupported = isNative
  ? true
  : typeof window !== 'undefined' && 'speechSynthesis' in window

let voices = []
let nativeSpeaking = false

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

async function speakNative(text, { rate = 0.9, onEnd } = {}) {
  const { TextToSpeech } = await import('@capacitor-community/text-to-speech')
  nativeSpeaking = true
  try {
    await TextToSpeech.speak({
      text,
      lang: 'it-IT',
      rate,
      category: 'ambient',
    })
  } finally {
    if (nativeSpeaking) {
      nativeSpeaking = false
      if (onEnd) onEnd()
    }
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
    nativeSpeaking = false
    import('@capacitor-community/text-to-speech').then(({ TextToSpeech }) =>
      TextToSpeech.stop(),
    )
    return
  }
  window.speechSynthesis.cancel()
}

// Pas de pause native fiable côté plugin : on arrête la lecture. Les vues
// appelantes traitent l'état "en pause" côté UI indépendamment.
export function pauseSpeaking() {
  if (isNative) {
    stopSpeaking()
    return
  }
  if (ttsSupported) window.speechSynthesis.pause()
}

export function resumeSpeaking() {
  if (isNative) return
  if (ttsSupported) window.speechSynthesis.resume()
}
