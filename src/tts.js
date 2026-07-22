// Synthèse vocale via la Web Speech API du navigateur (aucune API externe).
// On choisit une voix italienne si disponible, sinon lang=it-IT suffit
// pour que le moteur applique la prononciation italienne.

export const ttsSupported =
  typeof window !== 'undefined' && 'speechSynthesis' in window

let voices = []

function refreshVoices() {
  voices = window.speechSynthesis.getVoices()
}

if (ttsSupported) {
  refreshVoices()
  window.speechSynthesis.onvoiceschanged = refreshVoices
}

function italianVoice() {
  return voices.find((v) => v.lang.toLowerCase().startsWith('it')) || null
}

export function speakItalian(text, { rate = 0.9, onEnd } = {}) {
  if (!ttsSupported) return
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
  if (ttsSupported) window.speechSynthesis.cancel()
}

export function pauseSpeaking() {
  if (ttsSupported) window.speechSynthesis.pause()
}

export function resumeSpeaking() {
  if (ttsSupported) window.speechSynthesis.resume()
}
