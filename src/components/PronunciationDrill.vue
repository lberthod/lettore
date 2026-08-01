<script setup>
// Exercice de prononciation d'une phrase : écouter le modèle (TTS), la
// répéter au micro (Web Speech API), puis afficher un score et les mots
// ratés. Exercice de diction (exactitude des mots) — on ne juge ni l'accent
// ni la prosodie.
//
// Sans reconnaissance vocale (Firefox, WebView native), le composant ne
// rend rien : la fonctionnalité disparaît sans erreur.
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { speakItalian, stopSpeaking, ttsSupported } from '../tts.js'
import {
  isSupported,
  startListening,
  stopListening,
} from '../lib/speechRecognition.js'
import { comparePhrases } from '../lib/textSimilarity.js'
import { logActivity, addErrorCard } from '../progress.js'

const props = defineProps({
  phrase: { type: String, required: true },
})

const supported = isSupported()

// Score en-dessous duquel une seconde répétition est proposée (section 5.2).
// Jamais bloquant : sans reconnaissance vocale disponible/fonctionnelle,
// `supported` est déjà false (le composant ne rend rien) ou une erreur
// s'affiche sans empêcher un nouvel essai via le bouton « Répéter » habituel.
const RETRY_THRESHOLD = 80

const speaking = ref(false)
const listening = ref(false)
const result = ref(null) // { score, words } de comparePhrases
const transcript = ref('')
const error = ref('') // message d'erreur affichable, '' si aucun
const addedToReview = ref(false) // carte de révision déjà créée pour ce score

// Mots de la phrase cible non reconnus dans la répétition
const missedWords = computed(() =>
  result.value
    ? result.value.words.filter((w) => w.status === 'missed').map((w) => w.word)
    : []
)

// Une seule carte pour toute la phrase (pas une par mot) : la correction est
// la phrase cible complète, l'original la liste des mots ratés.
function addMissedToReview() {
  if (addedToReview.value || !missedWords.value.length) return
  addErrorCard({
    original: missedWords.value.join(', '),
    correction: props.phrase,
    explanation: 'Prononciation à retravailler',
    type: 'pronuncia',
    source: 'pronuncia',
  })
  addedToReview.value = true
}

function listen() {
  if (!ttsSupported) return
  stopListening()
  listening.value = false
  speaking.value = true
  speakItalian(props.phrase, {
    onEnd: () => {
      speaking.value = false
    },
  })
}

function repeat() {
  // Impératif : couper la synthèse avant d'ouvrir le micro, sinon la
  // reconnaissance capte la voix du TTS.
  stopSpeaking()
  speaking.value = false
  error.value = ''
  result.value = null
  transcript.value = ''
  addedToReview.value = false
  listening.value = true
  startListening({
    onResult: (text) => {
      transcript.value = text
      result.value = comparePhrases(props.phrase, text)
      // Chaque tentative notée alimente le parcours (touchStreak est appelé
      // automatiquement par logActivity). Score sur 100.
      logActivity({ skill: 'pronuncia', score: result.value.score })
    },
    onError: (code) => {
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        error.value =
          "Accès au micro refusé. Autorisez le micro dans votre navigateur pour faire l'exercice."
      } else if (code === 'no-speech') {
        error.value = "Aucune voix détectée. Parlez plus fort et réessayez."
      } else if (code === 'audio-capture') {
        error.value = 'Aucun micro détecté sur cet appareil.'
      } else {
        error.value = 'La reconnaissance vocale a échoué. Réessayez.'
      }
    },
    onEnd: () => {
      listening.value = false
    },
  })
}

function cancelListening() {
  stopListening()
  listening.value = false
}

// Nouvelle phrase cible : on repart de zéro.
watch(
  () => props.phrase,
  () => {
    cancelListening()
    result.value = null
    transcript.value = ''
    error.value = ''
    addedToReview.value = false
  },
)

onBeforeUnmount(() => {
  stopListening()
})
</script>

<template>
  <div v-if="supported" class="drill">
    <div class="controls">
      <button
        v-if="ttsSupported"
        class="action"
        :disabled="listening"
        @click="listen"
      >
        <span aria-hidden="true">🔊</span>
        {{ speaking ? 'Lecture…' : 'Écouter' }}
      </button>
      <button
        class="action mic"
        :class="{ listening }"
        @click="listening ? cancelListening() : repeat()"
      >
        <span aria-hidden="true">🎙️</span>
        {{ listening ? 'Je vous écoute… (arrêter)' : 'Répéter' }}
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <div v-if="result" class="result">
      <p class="score">
        Score : <strong>{{ result.score }} %</strong>
        <span v-if="result.score === 100"> — Perfetto ! 🎉</span>
        <span v-else-if="result.score >= 80"> — Presque parfait.</span>
        <span v-else> — Écoutez encore et réessayez.</span>
      </p>
      <p class="words">
        <span
          v-for="(w, i) in result.words"
          :key="i"
          class="word"
          :class="w.status"
          >{{ w.word }}</span
        >
      </p>
      <p v-if="transcript" class="heard">Compris : « {{ transcript }} »</p>
      <button
        v-if="missedWords.length"
        type="button"
        class="add-review"
        :disabled="addedToReview"
        @click="addMissedToReview"
      >
        {{ addedToReview ? '✓ Ajouté à vos révisions' : '📌 Ajouter aux révisions' }}
      </button>
      <p v-if="result.score < RETRY_THRESHOLD" class="retry-prompt">
        On refait un essai ?
        <button type="button" class="link-btn" :disabled="listening" @click="repeat">
          🎙️ Réessayer
        </button>
      </p>
    </div>
  </div>
</template>

<style scoped>
.drill {
  margin: 0.6rem 0;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.action {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.9rem;
  border: 1px solid #d8cfc2;
  border-radius: 999px;
  background: #faf6f0;
  color: inherit;
  font-size: 0.9rem;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.action:hover:not(:disabled) {
  border-color: #b0692e;
  background: #f0e9df;
}

.action:disabled {
  opacity: 0.5;
  cursor: default;
}

.mic.listening {
  border-color: #a34430;
  background: #f8e3de;
  color: #a34430;
  font-weight: 600;
}

.error {
  margin: 0.6rem 0 0;
  font-size: 0.9rem;
  color: #a34430;
}

.result {
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px solid #e4dccf;
}

.score {
  margin: 0 0 0.4rem;
}

.words {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0;
}

.word {
  padding: 0.1rem 0.45rem;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 0.95rem;
}

.word.ok {
  background: #e3f0e6;
  border-color: #4a7c59;
  color: #35674a;
}

.word.missed {
  background: #f8e3de;
  border-color: #a34430;
  color: #a34430;
  text-decoration: line-through;
}

.word.extra {
  background: #f0e9df;
  border-color: #d8cfc2;
  color: #7a7062;
  font-style: italic;
}

.heard {
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
  color: #7a7062;
}

.add-review {
  margin-top: 0.6rem;
  padding: 0.3rem 0.8rem;
  border: 1px solid rgba(176, 105, 46, 0.4);
  border-radius: 999px;
  background: rgba(176, 105, 46, 0.08);
  color: #6f4722;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.add-review:hover:not(:disabled) {
  background: rgba(176, 105, 46, 0.18);
  border-color: #b0692e;
}

.add-review:disabled {
  cursor: default;
  color: #4a7c59;
  border-color: rgba(74, 124, 89, 0.4);
  background: rgba(74, 124, 89, 0.08);
}

.retry-prompt {
  margin: 0.6rem 0 0;
  font-size: 0.88rem;
  color: #6b6156;
}

.retry-prompt .link-btn {
  margin-left: 0.3rem;
  background: none;
  border: none;
  padding: 0;
  color: #b0692e;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
  font-size: 0.88rem;
}

.retry-prompt .link-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
