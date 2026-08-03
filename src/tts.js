// Synthèse vocale italienne.
//
// - Sur le web : Web Speech API du navigateur (aucune API externe).
// - En app native (Capacitor/Android/iOS) : `speechSynthesis` n'existe pas
//   dans la WebView, on passe donc par le plugin natif
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

function voiceFor(lang) {
  const prefix = lang.slice(0, 2).toLowerCase()
  return voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) || null
}

async function speakNative(text, { rate = 0.9, lang = 'it-IT', onEnd } = {}) {
  const { TextToSpeech } = await import('@capacitor-community/text-to-speech')
  nativeSpeaking = true
  try {
    await TextToSpeech.speak({
      text,
      lang,
      rate,
      category: 'playback',
    })
  } finally {
    if (nativeSpeaking) {
      nativeSpeaking = false
      if (onEnd) onEnd()
    }
  }
}

// `lang` (optionnel, défaut 'it-IT') : code de langue BCP 47 — permet de lire
// une traduction française (« fr-FR ») avec la bonne voix plutôt que de
// prononcer le texte français avec un accent italien.
// `onWordBoundary({ charIndex })` (optionnel) : appelé à chaque frontière de
// mot pendant la lecture — web uniquement, via l'événement `onboundary` de
// SpeechSynthesisUtterance. Le plugin natif n'expose pas cet événement, et
// certains moteurs web ne l'émettent pas non plus (Chrome avec des voix
// distantes) : le callback peut donc ne jamais être appelé — les appelants
// doivent le traiter comme une amélioration progressive.
export function speakItalian(text, { rate = 0.9, lang = 'it-IT', onEnd, onWordBoundary } = {}) {
  if (!ttsSupported) return
  if (isNative) {
    speakNative(text, { rate, lang, onEnd })
    return
  }
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  const voice = voiceFor(lang)
  if (voice) utterance.voice = voice
  utterance.rate = rate
  if (onEnd) {
    utterance.onend = onEnd
    utterance.onerror = onEnd
  }
  if (onWordBoundary) {
    utterance.onboundary = (event) => {
      // `name` vaut 'word' ou 'sentence' ; certains moteurs (anciens Safari)
      // ne le renseignent pas — on ne filtre que les frontières explicitement
      // non-mot.
      if (event.name && event.name !== 'word') return
      onWordBoundary({ charIndex: event.charIndex })
    }
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
