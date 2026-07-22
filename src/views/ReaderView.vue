<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import TranslationOverlay from '../components/TranslationOverlay.vue'
import { lookupWord, lookupSentence } from '../translate.js'
import {
  ttsSupported,
  speakItalian,
  stopSpeaking,
  pauseSpeaking,
  resumeSpeaking,
} from '../tts.js'
import textsIndex from '../texts/index.json'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()

// Chaque texte (paragraphes + lexique) est un chunk séparé, chargé à la demande
const textModules = import.meta.glob('../texts/*.json', {
  import: 'default',
})

const currentText = ref(null)

async function loadText(id) {
  const loader = textModules[`../texts/${id}.json`]
  if (!loader) {
    router.replace({ name: 'home' })
    return
  }
  currentText.value = await loader()
}

const currentIndex = computed(() =>
  textsIndex.findIndex((t) => t.id === props.id)
)
const prevText = computed(() =>
  currentIndex.value > 0 ? textsIndex[currentIndex.value - 1] : null
)
const nextText = computed(() =>
  currentIndex.value < textsIndex.length - 1
    ? textsIndex[currentIndex.value + 1]
    : null
)

// Découpage : paragraphes → phrases → mots (les espaces/ponctuation restent affichés)
const paragraphs = computed(() =>
  currentText.value.paragraphs.map((p) => {
    const sentences = p.match(/[^.!?]+[.!?]*\s*/g) || [p]
    return sentences.map((sentence) => ({
      sentence: sentence.trim(),
      tokens: sentence.split(/(\p{L}[\p{L}'’-]*)/u).filter((t) => t !== ''),
    }))
  })
)

const isWord = (token) => /^\p{L}/u.test(token)
const isSentenceEnd = (token) => /[.!?]/.test(token)

const overlay = ref(null) // { x, y, original, translation, error, isSentence }
let hoverTimer = null

// --- TTS ---
const ttsEnabled = ref(false)
const readingText = ref(false)
const paused = ref(false)

function toggleTts() {
  ttsEnabled.value = !ttsEnabled.value
  if (!ttsEnabled.value) stopReading()
}

function speak(text) {
  readingText.value = false
  paused.value = false
  speakItalian(text)
}

function playText() {
  if (readingText.value && paused.value) {
    resumeSpeaking()
    paused.value = false
    return
  }
  if (readingText.value) return
  readingText.value = true
  paused.value = false
  speakItalian(currentText.value.paragraphs.join('\n'), {
    onEnd: () => {
      readingText.value = false
      paused.value = false
    },
  })
}

function pauseText() {
  if (!readingText.value || paused.value) return
  pauseSpeaking()
  paused.value = true
}

function stopReading() {
  stopSpeaking()
  readingText.value = false
  paused.value = false
}

function positionFromEvent(event) {
  const rect = event.target.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2 + window.scrollX,
    y: rect.bottom + 8 + window.scrollY,
  }
}

function showTranslation(original, event, isSentence) {
  const result = isSentence
    ? lookupSentence(currentText.value, original)
    : lookupWord(currentText.value, original)

  overlay.value = {
    ...positionFromEvent(event),
    original,
    translation: result || '',
    loading: false,
    error: result ? '' : 'Pas de traduction dans le lexique',
    isSentence,
  }

  if (ttsEnabled.value) speak(original)
}

function onWordEnter(word, event) {
  // Petit délai pour éviter d'afficher au simple passage de la souris
  clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => showTranslation(word, event, false), 150)
}

function onWordLeave() {
  clearTimeout(hoverTimer)
  // Ne ferme que la bulle d'un mot, pas celle d'une phrase (affichée au clic)
  if (overlay.value && !overlay.value.isSentence) overlay.value = null
}

function onWordDblClick(sentence, event) {
  clearTimeout(hoverTimer)
  showTranslation(sentence, event, true)
}

function onPunctClick(sentence, event) {
  clearTimeout(hoverTimer)
  showTranslation(sentence, event, true)
}

function closeOverlay() {
  overlay.value = null
}

// Changement de texte via les liens précédent/suivant
watch(
  () => props.id,
  (id) => {
    closeOverlay()
    stopReading()
    loadText(id)
  },
  { immediate: true }
)

function onKeydown(e) {
  if (e.key === 'Escape') closeOverlay()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  stopSpeaking()
})
</script>

<template>
  <div v-if="currentText">
    <div class="reader-header">
      <RouterLink class="back" :to="{ name: 'home' }">
        ← Tous les textes
      </RouterLink>
      <h2>{{ currentText.title }}</h2>
      <p class="hint">
        Survolez un mot pour voir sa traduction. Double-cliquez sur un mot ou
        cliquez sur la ponctuation (<strong>.</strong> <strong>!</strong>
        <strong>?</strong>) pour traduire la phrase entière.
      </p>
      <div v-if="ttsSupported" class="tts-bar">
        <button
          class="icon-btn tts-toggle"
          :class="{ active: ttsEnabled }"
          :title="
            ttsEnabled
              ? 'Désactiver la prononciation'
              : 'Activer la prononciation'
          "
          @click="toggleTts"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z"
            />
            <path
              v-if="ttsEnabled"
              d="M14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"
            />
          </svg>
        </button>
        <span class="sep"></span>
        <button
          class="icon-btn play"
          :class="{ active: readingText && !paused }"
          :disabled="readingText && !paused"
          title="Écouter le texte"
          @click="playText"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7L8 5z" />
          </svg>
        </button>
        <button
          class="icon-btn pause"
          :class="{ active: paused }"
          :disabled="!readingText || paused"
          title="Mettre en pause"
          @click="pauseText"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
          </svg>
        </button>
        <button
          class="icon-btn stop"
          :disabled="!readingText"
          title="Arrêter la lecture"
          @click="stopReading"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h12v12H6V6z" />
          </svg>
        </button>
      </div>
    </div>

    <article @click.self="closeOverlay">
      <p v-for="(sentences, pi) in paragraphs" :key="pi">
        <template v-for="(s, si) in sentences" :key="si">
          <template v-for="(token, ti) in s.tokens" :key="ti">
            <span
              v-if="isWord(token)"
              class="word"
              @mouseenter="onWordEnter(token, $event)"
              @mouseleave="onWordLeave"
              @dblclick="onWordDblClick(s.sentence, $event)"
              >{{ token }}</span
            ><span
              v-else-if="isSentenceEnd(token)"
              class="punct"
              title="Traduire la phrase"
              @click="onPunctClick(s.sentence, $event)"
              >{{ token }}</span
            ><template v-else>{{ token }}</template>
          </template>
        </template>
      </p>
    </article>

    <nav class="pager">
      <RouterLink
        v-if="prevText"
        class="pager-link prev"
        :to="{ name: 'reader', params: { id: prevText.id } }"
      >
        ← {{ prevText.title }}
      </RouterLink>
      <span v-else></span>
      <RouterLink
        v-if="nextText"
        class="pager-link next"
        :to="{ name: 'reader', params: { id: nextText.id } }"
      >
        {{ nextText.title }} →
      </RouterLink>
    </nav>

    <TranslationOverlay
      v-if="overlay"
      v-bind="overlay"
      :can-speak="ttsSupported"
      @close="closeOverlay"
      @speak="speak(overlay.original)"
    />
  </div>
</template>

<style scoped>
.reader-header {
  margin-bottom: 1.5rem;
}

.back {
  display: inline-block;
  margin-bottom: 0.6rem;
  font-size: 0.85rem;
  color: #b0692e;
  text-decoration: none;
}

.back:hover {
  text-decoration: underline;
}

h2 {
  font-size: 1.4rem;
  margin: 0 0 0.3rem;
}

.hint {
  margin: 0 0 0.8rem;
  font-size: 0.9rem;
  opacity: 0.6;
}

.tts-bar {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.sep {
  width: 1px;
  height: 1.4rem;
  background: #d8cfc2;
  margin: 0 0.25rem;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  height: 2.1rem;
  border: 1px solid #c9bfb2;
  border-radius: 50%;
  background: #fff;
  color: #6b6156;
  cursor: pointer;
  padding: 0;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.icon-btn svg {
  width: 1.1rem;
  height: 1.1rem;
}

.icon-btn:hover:not(:disabled) {
  background: #f0e9df;
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.icon-btn.tts-toggle.active {
  background: #b0692e;
  color: #faf6f0;
  border-color: #b0692e;
}

.icon-btn.play.active {
  background: #4a7c59;
  color: #faf6f0;
  border-color: #4a7c59;
  opacity: 1;
}

.icon-btn.pause.active {
  background: #c9a227;
  color: #faf6f0;
  border-color: #c9a227;
  opacity: 1;
}

.icon-btn.stop:not(:disabled) {
  color: #a34430;
}

article {
  font-size: 1.25rem;
  line-height: 1.9;
  user-select: none;
}

article p {
  margin: 0 0 1.2rem;
}

.word {
  cursor: pointer;
  border-radius: 3px;
  transition: background 0.1s;
}

.word:hover {
  background: #f0e0c8;
}

.punct {
  cursor: pointer;
  color: #b0692e;
  font-weight: 700;
  border-radius: 3px;
  padding: 0 0.1em;
  transition: background 0.1s;
}

.punct:hover {
  background: #f0e0c8;
}

.pager {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 2.5rem;
  padding-top: 1.2rem;
  border-top: 1px solid #e4dccf;
}

.pager-link {
  font-size: 0.9rem;
  color: #b0692e;
  text-decoration: none;
  padding: 0.4rem 0.8rem;
  border: 1px solid #d8cfc2;
  border-radius: 6px;
  background: #fff;
  transition: background 0.12s, border-color 0.12s;
}

.pager-link:hover {
  background: #f0e9df;
  border-color: #b0692e;
}
</style>
