<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import TranslationOverlay from '../components/TranslationOverlay.vue'
import { lookupWord, lookupSentence } from '../translate.js'
import { ttsSupported } from '../tts.js'
import {
  speakItalianPregen as speakItalian,
  stopPregenSpeaking as stopSpeaking,
  pausePregenSpeaking as pauseSpeaking,
  resumePregenSpeaking as resumeSpeaking,
} from '../lib/pregenAudio.js'
import QuizSection from '../components/QuizSection.vue'
import {
  progress,
  markRead,
  isFavorite,
  toggleFavorite,
  isRead,
} from '../progress.js'
import { loadBookChapter } from '../lib/protectedContent.js'
import ContentPaywall from '../components/ContentPaywall.vue'
import { trackTextOpened } from '../lib/analytics.js'

const props = defineProps({
  bookId: { type: String, required: true },
  chapterId: { type: String, required: true },
})

const router = useRouter()

// Un livre = un manifeste (book.json) + un chapitre chargé à la demande.
// Seuls les manifestes (métadonnées publiques) sont embarqués dans le build ;
// le contenu des chapitres passe par protectedContent.js — chapitres de
// l'aperçu gratuit compris, pour n'avoir qu'un seul chemin de chargement.
const bookModules = import.meta.glob('../books/*/book.json', { import: 'default' })

const book = ref(null)
const currentChapter = ref(null)
const summaryOpen = ref(false)
// Chapitre existant mais lecture refusée par Firestore (rôle insuffisant) :
// fiche publique (titre, auteur, niveau) + paywall, jamais de redirection
// (voir src/router.js, route « book-reader »).
const accessDenied = ref(false)

async function loadBook(bookId) {
  const loader = bookModules[`../books/${bookId}/book.json`]
  const data = loader ? await loader() : null
  if (!data) {
    router.replace({ name: 'not-found' })
    return null
  }
  book.value = data
  return data
}

async function loadChapter(bookId, chapterId) {
  accessDenied.value = false
  const data = await loadBookChapter(bookId, chapterId)
  if (!data) {
    if (bookId === props.bookId && chapterId === props.chapterId) {
      accessDenied.value = true
    }
    return
  }
  if (bookId === props.bookId && chapterId === props.chapterId) {
    currentChapter.value = data
    preloadNeighbors()
    trackTextOpened({ textId: `${bookId}-${chapterId}`, level: book.value?.level, access: 'full' })
  }
}

// --- Lecture continue : charge et affiche les chapitres à la suite, un par
// un, au fil du défilement (au lieu de tout charger d'un coup) ---
const continuousMode = ref(false)
const continuousChapters = ref([])
const continuousLoading = ref(false)
const continuousDenied = ref(false)
const continuousSentinel = ref(null)
const continuousAllLoaded = computed(
  () => !!book.value && continuousChapters.value.length >= book.value.chapters.length
)

async function loadNextContinuousChapter() {
  if (continuousLoading.value || continuousDenied.value || !book.value) return
  const nextIndex = continuousChapters.value.length
  const meta = book.value.chapters[nextIndex]
  if (!meta) return
  continuousLoading.value = true
  const data = await loadBookChapter(props.bookId, meta.id)
  if (props.bookId !== book.value.id) {
    // Le livre a changé pendant le chargement : on ignore ce résultat périmé.
    continuousLoading.value = false
    return
  }
  if (!data) {
    continuousDenied.value = true
    continuousLoading.value = false
    return
  }
  continuousChapters.value = [
    ...continuousChapters.value,
    { meta, data, paragraphs: tokenizeParagraphs(data) },
  ]
  continuousLoading.value = false
  trackTextOpened({ textId: `${props.bookId}-${meta.id}`, level: book.value?.level, access: 'full' })
}

function toggleContinuousMode() {
  continuousMode.value = !continuousMode.value
  if (continuousMode.value && !continuousChapters.value.length && !continuousDenied.value) {
    loadNextContinuousChapter()
  }
}

let continuousObserver = null

function observeContinuousSentinel(el) {
  if (!continuousObserver) return
  continuousObserver.disconnect()
  if (el) continuousObserver.observe(el)
}

watch(continuousSentinel, observeContinuousSentinel)

function preloadNeighbors() {
  for (const c of [prevChapter.value, nextChapter.value]) {
    if (c) loadBookChapter(props.bookId, c.id)
  }
}

const currentIndex = computed(() => {
  if (!book.value) return -1
  return book.value.chapters.findIndex((c) => c.id === props.chapterId)
})
const prevChapter = computed(() =>
  currentIndex.value > 0 ? book.value.chapters[currentIndex.value - 1] : null
)
const nextChapter = computed(() =>
  book.value && currentIndex.value >= 0 && currentIndex.value < book.value.chapters.length - 1
    ? book.value.chapters[currentIndex.value + 1]
    : null
)
const tagline = computed(() => {
  if (!book.value) return ''
  const parts = [`Niveau ${book.value.level} (indicatif)`, book.value.author]
  if (currentIndex.value >= 0) {
    parts.push(`Capitolo ${currentIndex.value + 1} / ${book.value.chapters.length}`)
  }
  return parts.join(' · ')
})
const chapterMeta = computed(
  () => book.value?.chapters.find((c) => c.id === props.chapterId) || null
)

// Découpage : paragraphes → phrases → mots (identique à ReaderView)
function tokenizeParagraphs(chapterData) {
  return chapterData.paragraphs.map((p) => {
    const sentences = p.match(/[^.!?]+[.!?]*\s*/g) || [p]
    return sentences.map((sentence) => ({
      sentence: sentence.trim(),
      tokens: sentence.split(/(\p{L}[\p{L}'’-]*)/u).filter((t) => t !== ''),
    }))
  })
}

const paragraphs = computed(() => tokenizeParagraphs(currentChapter.value))

const flatSentences = computed(() => {
  if (continuousMode.value) {
    return continuousChapters.value.flatMap((c, ci) =>
      c.paragraphs.flatMap((sentences, pi) =>
        sentences.map((s, si) => ({ key: `${ci}-${pi}-${si}`, text: s.sentence }))
      )
    )
  }
  return paragraphs.value.flatMap((sentences, pi) =>
    sentences.map((s, si) => ({ key: `${pi}-${si}`, text: s.sentence }))
  )
})

const isWord = (token) => /^\p{L}/u.test(token)
const isSentenceEnd = (token) => /[.!?]/.test(token)

const overlay = ref(null)
let hoverTimer = null
let closeTimer = null

const touchMode =
  typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches

// --- Quiz en overlay ---
const quizOpen = ref(false)
const quizChapter = ref(null)

function openQuiz(chapterData) {
  closeOverlay()
  quizChapter.value = chapterData || currentChapter.value
  quizOpen.value = true
}

function onQuizCompleted(score) {
  if (!quizChapter.value) return
  if (score >= quizChapter.value.questions.length - 1) {
    markRead(`${props.bookId}-${quizChapter.value.id}`)
  }
}

// --- TTS (identique à ReaderView) ---
const ttsEnabled = ref(false)
const readingText = ref(false)
const paused = ref(false)
const readingKey = ref(null)
let readSession = 0

const speeds = [
  { rate: 0.7, label: 'Lent' },
  { rate: 0.9, label: 'Normal' },
  { rate: 1.1, label: 'Rapide' },
]

function toggleTts() {
  ttsEnabled.value = !ttsEnabled.value
  if (!ttsEnabled.value) stopReading()
}

function speak(text) {
  readSession++
  readingText.value = false
  paused.value = false
  readingKey.value = null
  speakItalian(text, { rate: progress.ttsRate })
}

function playText() {
  if (readingText.value && paused.value) {
    resumeSpeaking()
    paused.value = false
    return
  }
  if (readingText.value) return
  const session = ++readSession
  readingText.value = true
  paused.value = false
  const list = flatSentences.value
  const next = (i) => {
    if (session !== readSession) return
    if (i >= list.length) {
      readingText.value = false
      paused.value = false
      readingKey.value = null
      return
    }
    readingKey.value = list[i].key
    speakItalian(list[i].text, {
      rate: progress.ttsRate,
      onEnd: () => next(i + 1),
    })
  }
  next(0)
}

function pauseText() {
  if (!readingText.value || paused.value) return
  pauseSpeaking()
  paused.value = true
}

function stopReading() {
  readSession++
  stopSpeaking()
  readingText.value = false
  paused.value = false
  readingKey.value = null
}

function setRate(rate) {
  progress.ttsRate = rate
}

watch(readingKey, async (key) => {
  if (!key) return
  await nextTick()
  const el = document.querySelector('.sentence.reading')
  if (!el) return
  const rect = el.getBoundingClientRect()
  const margin = 120
  if (rect.top < margin || rect.bottom > window.innerHeight - margin) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
})

function positionFromEvent(event) {
  const rect = event.target.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.bottom + 8 }
}

function showTranslation(original, event, isSentence, chapterData) {
  const ctx = chapterData || currentChapter.value
  const result = isSentence ? lookupSentence(ctx, original) : lookupWord(ctx, original)

  overlay.value = {
    ...positionFromEvent(event),
    original,
    translation: result || '',
    loading: false,
    error: result ? '' : 'Pas de traduction dans le lexique',
    isSentence,
    textId: `${props.bookId}-${ctx.id}`,
  }

  if (ttsEnabled.value) speak(original)
}

function onWordEnter(word, event, chapterData) {
  if (touchMode) return
  clearTimeout(hoverTimer)
  cancelClose()
  hoverTimer = setTimeout(() => showTranslation(word, event, false, chapterData), 150)
}

let lastTapTime = 0
let lastTapSentence = null

function onWordTap(word, sentence, event, chapterData) {
  if (!touchMode) return
  clearTimeout(hoverTimer)
  const now = Date.now()
  const isDoubleTap = now - lastTapTime < 350 && lastTapSentence === sentence
  lastTapTime = isDoubleTap ? 0 : now
  lastTapSentence = isDoubleTap ? null : sentence
  if (isDoubleTap) {
    onWordDblClick(sentence, event, chapterData)
    return
  }
  showTranslation(word, event, false, chapterData)
}

function onWordLeave() {
  clearTimeout(hoverTimer)
  if (overlay.value && !overlay.value.isSentence) scheduleClose()
}

function onWordFocus(word, event, chapterData) {
  clearTimeout(hoverTimer)
  cancelClose()
  showTranslation(word, event, false, chapterData)
}

function onWordBlur() {
  onWordLeave()
}

function onWordKeydown(sentence, event, chapterData) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onWordDblClick(sentence, event, chapterData)
  }
}

function onPunctKeydown(sentence, event, chapterData) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onPunctClick(sentence, event, chapterData)
  }
}

function scheduleClose() {
  clearTimeout(closeTimer)
  closeTimer = setTimeout(() => {
    if (overlay.value && !overlay.value.isSentence) overlay.value = null
  }, 300)
}

function cancelClose() {
  clearTimeout(closeTimer)
}

function toggleWordFavorite() {
  if (!overlay.value || overlay.value.isSentence) return
  toggleFavorite({
    word: overlay.value.original,
    translation: overlay.value.translation,
    textId: overlay.value.textId,
  })
}

function onWordDblClick(sentence, event, chapterData) {
  clearTimeout(hoverTimer)
  showTranslation(sentence, event, true, chapterData)
}

function onPunctClick(sentence, event, chapterData) {
  clearTimeout(hoverTimer)
  showTranslation(sentence, event, true, chapterData)
}

function closeOverlay() {
  overlay.value = null
}

// Changement de livre ou de chapitre
watch(
  () => props.bookId,
  async (bookId) => {
    closeOverlay()
    stopReading()
    quizOpen.value = false
    currentChapter.value = null
    continuousMode.value = false
    continuousChapters.value = []
    continuousDenied.value = false
    const data = await loadBook(bookId)
    if (data) loadChapter(bookId, props.chapterId)
  },
  { immediate: true }
)

watch(
  () => props.chapterId,
  (chapterId, old) => {
    if (old === undefined) return // géré par le watcher bookId ci-dessus
    closeOverlay()
    stopReading()
    quizOpen.value = false
    continuousMode.value = false
    loadChapter(props.bookId, chapterId)
  }
)

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (summaryOpen.value) summaryOpen.value = false
    else if (quizOpen.value) quizOpen.value = false
    else closeOverlay()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  if (typeof IntersectionObserver !== 'undefined') {
    continuousObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadNextContinuousChapter()
      },
      { rootMargin: '800px 0px' }
    )
    observeContinuousSentinel(continuousSentinel.value)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  stopSpeaking()
  continuousObserver?.disconnect()
})
</script>

<template>
  <SceneLayout
    v-if="book && !currentChapter && accessDenied"
    :title="book.title"
    :tagline="tagline"
    narrow
  >
    <p v-if="chapterMeta" class="excerpt">
      Capitolo « {{ chapterMeta.title }} » — {{ book.author }}, niveau {{ book.level }}.
    </p>
    <ContentPaywall placement="classici" />
  </SceneLayout>
  <SceneLayout v-else-if="book && currentChapter" :title="book.title" :tagline="tagline" bare>
    <div class="reader">
      <div class="toolbar">
        <RouterLink class="back" :to="{ name: 'books' }">← Tutti i classici</RouterLink>
        <button
          class="summary-toggle"
          :class="{ active: continuousMode }"
          @click="toggleContinuousMode"
        >
          {{ continuousMode ? '📄 Lettura per capitolo' : '📖 Lettura continua' }}
        </button>
        <button class="summary-toggle" @click="summaryOpen = true">📑 Sommario</button>
        <div v-if="ttsSupported" class="tts-bar">
          <button
            class="icon-btn tts-toggle"
            :class="{ active: ttsEnabled }"
            :title="ttsEnabled ? 'Désactiver la prononciation' : 'Activer la prononciation'"
            :aria-pressed="ttsEnabled"
            @click="toggleTts"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12z" />
              <path v-if="ttsEnabled" d="M14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z" />
            </svg>
          </button>
          <span class="sep"></span>
          <button
            class="icon-btn play"
            :class="{ active: readingText && !paused }"
            :disabled="readingText && !paused"
            title="Écouter le chapitre"
            @click="playText"
          >
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5z" /></svg>
          </button>
          <button
            class="icon-btn pause"
            :class="{ active: paused }"
            :disabled="!readingText || paused"
            title="Mettre en pause"
            @click="pauseText"
          >
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" /></svg>
          </button>
          <button class="icon-btn stop" :disabled="!readingText" title="Arrêter la lecture" @click="stopReading">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6V6z" /></svg>
          </button>
          <span class="sep"></span>
          <button
            v-for="s in speeds"
            :key="s.rate"
            class="speed-btn"
            :class="{ active: progress.ttsRate === s.rate }"
            @click="setRate(s.rate)"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <p class="level-note">{{ book.levelNote }} — {{ book.source.provider }}</p>

      <template v-if="!continuousMode">
        <div class="paper">
          <h2 class="chapter-title">{{ currentChapter.title }}</h2>
          <article @click.self="closeOverlay">
            <p v-for="(sentences, pi) in paragraphs" :key="pi">
              <span
                v-for="(s, si) in sentences"
                :key="si"
                class="sentence"
                :class="{ reading: readingKey === `${pi}-${si}` }"
              >
                <template v-for="(token, ti) in s.tokens" :key="ti">
                  <span
                    v-if="isWord(token)"
                    class="word"
                    role="button"
                    tabindex="0"
                    :aria-label="`${token} — voir la traduction, Entrée pour traduire la phrase`"
                    @mouseenter="onWordEnter(token, $event)"
                    @mouseleave="onWordLeave"
                    @focus="onWordFocus(token, $event)"
                    @blur="onWordBlur"
                    @click="onWordTap(token, s.sentence, $event)"
                    @dblclick="onWordDblClick(s.sentence, $event)"
                    @keydown="onWordKeydown(s.sentence, $event)"
                    >{{ token }}</span
                  ><span
                    v-else-if="isSentenceEnd(token)"
                    class="punct"
                    role="button"
                    tabindex="0"
                    title="Traduire la phrase"
                    @click="onPunctClick(s.sentence, $event)"
                    @keydown="onPunctKeydown(s.sentence, $event)"
                    >{{ token }}</span
                  ><template v-else>{{ token }}</template>
                </template>
              </span>
            </p>
          </article>

          <div v-if="currentChapter.questions?.length" class="verify-cta">
            <button class="btn-verify" @click="openQuiz()">Verifica la comprensione →</button>
          </div>
        </div>

        <nav class="pager">
          <RouterLink
            v-if="prevChapter"
            class="pager-link prev"
            :to="{ name: 'book-reader', params: { bookId, chapterId: prevChapter.id } }"
          >
            ← Capitolo {{ currentIndex }} — {{ prevChapter.title }}
          </RouterLink>
          <span v-else></span>
          <RouterLink
            v-if="nextChapter"
            class="pager-link next"
            :to="{ name: 'book-reader', params: { bookId, chapterId: nextChapter.id } }"
          >
            Capitolo {{ currentIndex + 2 }} — {{ nextChapter.title }} →
          </RouterLink>
        </nav>
      </template>

      <div v-else class="continuous">
        <div v-for="(chapter, ci) in continuousChapters" :key="chapter.meta.id" class="paper chapter-block">
          <h2 class="chapter-title">{{ chapter.data.title }}</h2>
          <article @click.self="closeOverlay">
            <p v-for="(sentences, pi) in chapter.paragraphs" :key="pi">
              <span
                v-for="(s, si) in sentences"
                :key="si"
                class="sentence"
                :class="{ reading: readingKey === `${ci}-${pi}-${si}` }"
              >
                <template v-for="(token, ti) in s.tokens" :key="ti">
                  <span
                    v-if="isWord(token)"
                    class="word"
                    role="button"
                    tabindex="0"
                    :aria-label="`${token} — voir la traduction, Entrée pour traduire la phrase`"
                    @mouseenter="onWordEnter(token, $event, chapter.data)"
                    @mouseleave="onWordLeave"
                    @focus="onWordFocus(token, $event, chapter.data)"
                    @blur="onWordBlur"
                    @click="onWordTap(token, s.sentence, $event, chapter.data)"
                    @dblclick="onWordDblClick(s.sentence, $event, chapter.data)"
                    @keydown="onWordKeydown(s.sentence, $event, chapter.data)"
                    >{{ token }}</span
                  ><span
                    v-else-if="isSentenceEnd(token)"
                    class="punct"
                    role="button"
                    tabindex="0"
                    title="Traduire la phrase"
                    @click="onPunctClick(s.sentence, $event, chapter.data)"
                    @keydown="onPunctKeydown(s.sentence, $event, chapter.data)"
                    >{{ token }}</span
                  ><template v-else>{{ token }}</template>
                </template>
              </span>
            </p>
          </article>

          <div v-if="chapter.data.questions?.length" class="verify-cta">
            <button class="btn-verify" @click="openQuiz(chapter.data)">Verifica la comprensione →</button>
          </div>
        </div>

        <p v-if="continuousLoading" class="continuous-status">Caricamento del capitolo successivo…</p>
        <div v-if="continuousDenied" class="continuous-paywall">
          <p class="excerpt">La suite du livre nécessite un accès complet.</p>
          <ContentPaywall placement="classici" />
        </div>
        <div
          v-if="!continuousDenied && !continuousAllLoaded"
          ref="continuousSentinel"
          class="continuous-sentinel"
        ></div>
      </div>
    </div>

    <TranslationOverlay
      v-if="overlay"
      v-bind="overlay"
      :can-speak="ttsSupported"
      :can-favorite="!overlay.isSentence && !!overlay.translation"
      :is-favorite="isFavorite(overlay.original)"
      @close="closeOverlay"
      @speak="speak(overlay.original)"
      @favorite="toggleWordFavorite"
      @mouseenter="cancelClose"
      @mouseleave="scheduleClose"
    />

    <Teleport to="body">
      <Transition name="quiz-fade">
        <div v-if="quizOpen" class="quiz-modal" @click.self="quizOpen = false">
          <div class="quiz-panel">
            <button class="quiz-close" title="Fermer la vérification" @click="quizOpen = false">✕</button>
            <QuizSection
              v-if="quizChapter"
              :key="`${bookId}-${quizChapter.id}`"
              :questions="quizChapter.questions"
              @completed="onQuizCompleted"
            />
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="quiz-fade">
        <div v-if="summaryOpen" class="quiz-modal" @click.self="summaryOpen = false">
          <div class="quiz-panel summary-panel">
            <button class="quiz-close" title="Fermer le sommaire" @click="summaryOpen = false">✕</button>
            <h3>{{ book.title }}</h3>
            <p class="summary-author">{{ book.author }}</p>
            <ol class="chapter-list">
              <li v-for="c in book.chapters" :key="c.id">
                <RouterLink
                  :to="{ name: 'book-reader', params: { bookId, chapterId: c.id } }"
                  :class="{ current: c.id === chapterId, read: isRead(`${bookId}-${c.id}`) }"
                  @click="summaryOpen = false"
                >
                  <span v-if="isRead(`${bookId}-${c.id}`)" class="check">✓</span>
                  {{ c.title }}
                </RouterLink>
              </li>
            </ol>
          </div>
        </div>
      </Transition>
    </Teleport>
  </SceneLayout>
</template>

<style scoped>
.reader {
  text-align: left;
  margin-top: 1.4rem;
}

.excerpt {
  font-size: 1.05rem;
  line-height: 1.7;
  color: rgba(44, 38, 32, 0.8);
}

.toolbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem 1rem;
  margin: 0 -1px;
  padding: 0.6rem 1px 0.5rem;
  background: linear-gradient(180deg, #fdf3e3 0%, #fdf3e3 70%, rgba(253, 243, 227, 0.85) 100%);
}

.back {
  font-size: 0.85rem;
  color: #8a5a2b;
  text-decoration: none;
}

.back:hover {
  color: #b0692e;
  text-decoration: underline;
}

.summary-toggle {
  font-size: 0.85rem;
  font-family: inherit;
  color: #8a5a2b;
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(138, 90, 43, 0.35);
  border-radius: 999px;
  padding: 0.35rem 0.9rem;
  cursor: pointer;
}

.summary-toggle:hover {
  border-color: #b0692e;
  color: #b0692e;
}

.summary-toggle.active {
  background: #b0692e;
  border-color: #b0692e;
  color: #faf6f0;
}

.continuous {
  display: flex;
  flex-direction: column;
  gap: 1.6rem;
}

.chapter-block .chapter-title {
  text-align: left;
}

.continuous-status {
  text-align: center;
  color: #6b6156;
  font-style: italic;
  padding: 1rem 0;
}

.continuous-paywall {
  padding-top: 0.6rem;
}

.continuous-sentinel {
  height: 1px;
}

.level-note {
  margin: 0 0 0.9rem;
  font-size: 0.8rem;
  color: #6b6156;
  opacity: 0.8;
  font-style: italic;
}

.tts-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.sep {
  width: 1px;
  height: 1.4rem;
  background: rgba(138, 90, 43, 0.3);
  margin: 0 0.25rem;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 44px (Analyse Optimisation UX Mobile.md Sprint 1.1). */
  width: 2.75rem;
  height: 2.75rem;
  border: 1px solid rgba(138, 90, 43, 0.35);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.65);
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
  background: #faf6f0;
  border-color: #b0692e;
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

.speed-btn {
  padding: 0.25rem 0.65rem;
  border: 1px solid rgba(138, 90, 43, 0.35);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.65);
  color: #6b6156;
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.speed-btn:hover {
  border-color: #b0692e;
}

.speed-btn.active {
  background: #b0692e;
  border-color: #b0692e;
  color: #faf6f0;
}

.paper {
  padding: 2rem 2.2rem 1.8rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 18px;
  background: rgba(255, 253, 248, 0.88);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 14px 40px rgba(111, 71, 34, 0.14);
}

.chapter-title {
  margin: 0 0 1.2rem;
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 1.1rem;
  font-style: italic;
  font-weight: 400;
  color: #8a5a2b;
  text-align: center;
}

article {
  font-size: 1.25rem;
  line-height: 1.9;
  user-select: none;
  touch-action: manipulation;
}

article p {
  margin: 0 0 1.2rem;
}

article p:first-letter {
  font-size: 1.5em;
  color: #8a5a2b;
}

.sentence.reading {
  background: #f5e9d4;
  border-radius: 4px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.word {
  cursor: pointer;
  border-radius: 3px;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-decoration-color: rgba(176, 105, 46, 0.35);
  text-underline-offset: 3px;
  transition: background 0.1s, text-decoration-color 0.1s;
}

.word:hover,
.word:focus-visible {
  background: #f0e0c8;
  text-decoration-color: #b0692e;
}

.word:focus-visible,
.punct:focus-visible {
  outline: 2px solid #b0692e;
  outline-offset: 2px;
}

.punct {
  display: inline-block;
  cursor: pointer;
  color: #b0692e;
  font-weight: 700;
  border-radius: 3px;
  /* Zone cliquable élargie (Analyse Optimisation UX Mobile.md Sprint 1.1). */
  padding: 0.3em 0.2em;
  margin: -0.3em -0.1em;
  transition: background 0.1s;
}

.punct:hover,
.punct:focus-visible {
  background: #f0e0c8;
}

.verify-cta {
  display: flex;
  justify-content: center;
  margin-top: 1.6rem;
  padding-top: 1.4rem;
  border-top: 1px solid rgba(176, 105, 46, 0.2);
}

.btn-verify {
  padding: 0.7rem 1.6rem;
  border: none;
  border-radius: 999px;
  background: #b0692e;
  color: #faf6f0;
  font-family: inherit;
  font-size: 0.98rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(176, 105, 46, 0.3);
}

.btn-verify:hover {
  background: #9a5a26;
}

.pager {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1.6rem;
  padding-bottom: 1rem;
}

.pager-link {
  font-size: 0.9rem;
  color: #8a5a2b;
  text-decoration: none;
  padding: 0.45rem 0.9rem;
  border: 1px solid rgba(138, 90, 43, 0.35);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.65);
}

.pager-link:hover {
  background: #faf6f0;
  border-color: #b0692e;
  color: #b0692e;
}

@media (max-width: 640px) {
  .paper {
    padding: 1.4rem 1.2rem;
  }

  article {
    font-size: 1.15rem;
  }
}
</style>

<style>
.quiz-modal {
  position: fixed;
  inset: 0;
  /* Au-dessus de NativeTabBar/NativeAccountButton (z-index: 500) : sans ça,
     la barre d'onglets native passait par-dessus le bas de la modale. */
  z-index: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.2rem;
  background: rgba(44, 38, 32, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.quiz-panel {
  position: relative;
  width: min(640px, 100%);
  max-height: min(85vh, 100%);
  overflow-y: auto;
  padding: 1.8rem 2rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 18px;
  background: rgba(255, 253, 248, 0.97);
  box-shadow: 0 24px 60px rgba(44, 38, 32, 0.35);
}

.summary-panel h3 {
  margin: 0 0 0.2rem;
  font-family: 'Georgia', 'Times New Roman', serif;
}

.summary-author {
  margin: 0 0 1.2rem;
  color: #8a5a2b;
  font-size: 0.9rem;
}

.chapter-list {
  margin: 0;
  padding-left: 1.4rem;
}

.chapter-list li {
  margin-bottom: 0.4rem;
}

.chapter-list a {
  color: #6b6156;
  text-decoration: none;
  font-size: 0.92rem;
}

.chapter-list a:hover {
  color: #b0692e;
}

.chapter-list a.current {
  color: #b0692e;
  font-weight: 700;
}

.chapter-list a.read .check {
  color: #4a7c59;
  margin-right: 0.3rem;
}

.quiz-close {
  position: absolute;
  top: 0.8rem;
  right: 0.9rem;
  /* 44px (Analyse Optimisation UX Mobile.md Sprint 1.1). */
  width: 2.75rem;
  height: 2.75rem;
  border: 1px solid rgba(138, 90, 43, 0.35);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  color: #6b6156;
  font-size: 0.85rem;
  cursor: pointer;
}

.quiz-close:hover {
  color: #b0692e;
  border-color: #b0692e;
}

.quiz-fade-enter-active,
.quiz-fade-leave-active {
  transition: opacity 0.18s ease;
}

.quiz-fade-enter-active .quiz-panel,
.quiz-fade-leave-active .quiz-panel {
  transition: transform 0.18s ease;
}

.quiz-fade-enter-from,
.quiz-fade-leave-to {
  opacity: 0;
}

.quiz-fade-enter-from .quiz-panel,
.quiz-fade-leave-to .quiz-panel {
  transform: translateY(12px);
}
</style>
