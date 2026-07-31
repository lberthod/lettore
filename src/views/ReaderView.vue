<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { RouterLink, useRouter, useRoute } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
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
import taxonomy from '../texts/category.json'
import QuizSection from '../components/QuizSection.vue'
import {
  progress,
  markRead,
  touchStreak,
  isFavorite,
  toggleFavorite,
  isInVocabMode,
  toggleVocabText,
} from '../progress.js'
import { currentUser } from '../lib/auth.js'
import { isCatalogText, loadCatalogText } from '../lib/protectedContent.js'
import ContentPaywall from '../components/ContentPaywall.vue'
import { trackTextOpened, trackReadingCompleted, trackWordTranslated } from '../lib/analytics.js'
import PronunciationDrill from '../components/PronunciationDrill.vue'
import { isSupported as speechRecognitionSupported } from '../lib/speechRecognition.js'

const props = defineProps({
  id: { type: String, required: true },
})

const router = useRouter()
const route = useRoute()

const currentText = ref(null)
// Texte du catalogue existant mais dont la lecture complète est refusée par
// Firestore (rôle insuffisant) : la fiche publique + le paywall s'affichent
// au lieu de rediriger — voir src/router.js (route « reader »).
const accessDenied = ref(false)

async function loadText(id) {
  accessDenied.value = false
  // /condividi/:id (partage public) ne doit jamais résoudre un id du
  // catalogue payant : seuls les documents Firestore marqués `public: true`
  // (texte utilisateur ou actualité) sont concernés, sans quoi l'id d'un
  // texte payant suffirait à en afficher le contenu sans autorisation.
  const isSharedRoute = route.name === 'shared-text'
  const fromCatalog = !isSharedRoute && isCatalogText(id)
  // Aperçu gratuit : chunk embarqué dans le build. Reste du catalogue :
  // document Firestore, lu seulement si les règles autorisent le rôle.
  let data = fromCatalog ? await loadCatalogText(id) : null
  if (!data && fromCatalog) {
    // Fiche existante, lecture refusée : jamais de redirection (SEO), voir
    // ContentPaywall.vue.
    if (id === props.id) accessDenied.value = true
    return
  }
  if (!data && !fromCatalog) {
    data = await (await import('../lib/userTexts.js')).loadUserText(id)
  }
  if (!data && !fromCatalog) {
    data = await (await import('../lib/newsTexts.js')).loadNewsText(id)
  }
  if (!data) {
    router.replace({ name: 'not-found' })
    return
  }
  // Navigation rapide : n'affiche que le texte encore demandé
  if (id === props.id) {
    currentText.value = data
    preloadNeighbors()
    trackTextOpened({
      textId: id,
      level: textMeta.value?.level,
      access: fromCatalog ? 'full' : 'private',
    })
  }
}

// Précharge les textes précédent/suivant : navigation instantanée. Le
// préchargement n'a lieu qu'après un accès autorisé au texte courant, et
// passe par le même contrôle d'accès (mémorisé côté loadCatalogText).
function preloadNeighbors() {
  for (const t of [prevText.value, nextText.value]) {
    if (t) loadCatalogText(t.id)
  }
}

const currentIndex = computed(() =>
  textsIndex.findIndex((t) => t.id === props.id)
)
// Pour un texte créé par l'utilisateur (hors index), les métadonnées
// viennent du document Firestore lui-même.
const textMeta = computed(
  () => textsIndex[currentIndex.value] || currentText.value || null
)
const category = computed(() => {
  if (!textMeta.value?.category) return null
  return taxonomy.themes.find((c) => c.id === textMeta.value.category) || null
})
const genre = computed(() => {
  if (!textMeta.value?.genre) return null
  return taxonomy.genres.find((g) => g.id === textMeta.value.genre) || null
})
const tagline = computed(() => {
  if (!textMeta.value) return ''
  const parts = [`Niveau ${textMeta.value.level}`]
  if (textMeta.value.wordCount) parts.push(`~${textMeta.value.wordCount} mots`)
  if (category.value) parts.push(`${category.value.icon} ${category.value.name}`)
  if (genre.value) parts.push(`${genre.value.icon} ${genre.value.name}`)
  return parts.join(' · ')
})
const prevText = computed(() =>
  currentIndex.value > 0 ? textsIndex[currentIndex.value - 1] : null
)
const nextText = computed(() =>
  currentIndex.value >= 0 && currentIndex.value < textsIndex.length - 1
    ? textsIndex[currentIndex.value + 1]
    : null
)

// Découpage : paragraphes → phrases → mots (les espaces/ponctuation restent affichés)
const paragraphs = computed(() =>
  currentText.value.paragraphs.map((p) => {
    const sentences = p.match(/[^.!?]+[.!?]*\s*/g) || [p]
    return sentences.map((sentence) => {
      const tokens = sentence
        .split(/(\p{L}[\p{L}'’-]*)/u)
        .filter((t) => t !== '')
      // Rang de chaque token parmi les mots de la phrase (-1 pour la
      // ponctuation/espaces) : sert au surlignage karaoke mot-à-mot.
      let w = 0
      const wordIndices = tokens.map((t) => (isWord(t) ? w++ : -1))
      return { sentence: sentence.trim(), tokens, wordIndices }
    })
  })
)

// Liste plate des phrases pour la lecture audio phrase par phrase
const flatSentences = computed(() =>
  paragraphs.value.flatMap((sentences, pi) =>
    sentences.map((s, si) => ({ key: `${pi}-${si}`, text: s.sentence }))
  )
)

const isWord = (token) => /^\p{L}/u.test(token)
const isSentenceEnd = (token) => /[.!?]/.test(token)

const overlay = ref(null) // { x, y, original, translation, error, isSentence }
let hoverTimer = null
let closeTimer = null

// Écrans tactiles : pas de survol fiable ni de double-clic pratique
const touchMode =
  typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches

// --- Quiz en overlay ---
const quizOpen = ref(false)

function openQuiz() {
  closeOverlay()
  quizOpen.value = true
}

function onQuizCompleted(score) {
  if (score >= currentText.value.questions.length - 1) {
    markRead(props.id)
    touchStreak()
    trackReadingCompleted({ textId: props.id, level: textMeta.value?.level })
  }
}

// --- Mode écoute (« ascolto ») : compréhension orale pure, activé par
// ?mode=ascolto (voir LibraryView.vue). Le texte reste dans le DOM (le TTS
// lit depuis les mêmes données) mais est flouté et rendu inerte ; le quiz
// existant sert de vérification de compréhension. Le surlignage de phrase
// (readingKey) reste actif sous le flou : il montre la progression de la
// lecture sans révéler les mots.
const ascoltoRequested = computed(() => route.query.mode === 'ascolto')
const textRevealed = ref(false)
const ascoltoMasked = computed(() => ascoltoRequested.value && !textRevealed.value)

// --- Exercice de prononciation : un bouton micro discret après chaque
// phrase ouvre un panneau PronunciationDrill (une seule phrase à la fois).
// Sans reconnaissance vocale (Firefox, WebView), les boutons n'apparaissent
// pas. En mode écoute masqué, pas de bouton non plus : le drill affiche la
// phrase cible en toutes lettres (mots comparés, transcription), ce qui
// révélerait le texte flouté.
const micSupported = speechRecognitionSupported()
const drillKey = ref(null) // clé 'pi-si' de la phrase en cours d'exercice

const drillSentence = computed(() =>
  drillKey.value
    ? flatSentences.value.find((s) => s.key === drillKey.value)?.text || ''
    : ''
)

function toggleDrill(key) {
  if (drillKey.value === key) {
    drillKey.value = null
    return
  }
  // Une lecture globale en cours parasiterait l'exercice (le micro capterait
  // la voix du TTS) : on l'arrête proprement avant d'ouvrir le panneau.
  stopReading()
  closeOverlay()
  drillKey.value = key
}

// --- Mode vocabulaire (réservé aux connectés) : un clic ajoute ce texte à la
// page globale « Mode vocabulaire » (voir VocabularyView.vue), qui regroupe
// le lexique de tous les textes ainsi marqués.
const inVocabMode = computed(() => isInVocabMode(props.id))

// Re-masquer le texte (mode écoute) doit fermer l'exercice de prononciation :
// le panneau resterait sinon visible avec la phrase en clair.
watch(ascoltoMasked, (masked) => {
  if (masked) drillKey.value = null
})

function toggleVocabMode() {
  if (!currentUser.value) {
    router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
    return
  }
  toggleVocabText(props.id)
}

// --- TTS ---
const ttsEnabled = ref(false)
const readingText = ref(false)
const paused = ref(false)
const readingKey = ref(null) // phrase en cours de lecture ('pi-si')
// Karaoke mot-à-mot : rang (parmi les mots de la phrase en cours) du mot
// prononcé, -1 hors lecture ou quand le moteur n'émet pas `onboundary`
// (natif, certaines voix distantes de Chrome) — dans ce cas seul le
// surlignage de phrase reste visible, comme avant.
const readingWordIndex = ref(-1)
let readSession = 0 // invalide les onEnd d'une lecture annulée

// Positions [début, fin) de chaque mot dans le texte exactement tel qu'il est
// envoyé au TTS, obtenues avec la même regex que les tokens affichés : le
// n-ième intervalle correspond au n-ième token-mot de la phrase (le trim ne
// change pas la suite des mots). Mapper par cumul de longueurs sur le texte
// parlé est plus robuste qu'une redécoupe indépendante : les charIndex du
// moteur tombent toujours dans ce repère-là.
function wordSpans(text) {
  const spans = []
  let pos = 0
  for (const token of text.split(/(\p{L}[\p{L}'’-]*)/u)) {
    if (token === '') continue
    if (isWord(token)) spans.push({ start: pos, end: pos + token.length })
    pos += token.length
  }
  return spans
}

// charIndex → rang du mot : premier mot dont la fin dépasse charIndex
// (couvre à la fois un index au début/milieu du mot et un index posé sur la
// ponctuation qui le précède).
function wordIndexAt(spans, charIndex) {
  for (let w = 0; w < spans.length; w++) {
    if (charIndex < spans[w].end) return w
  }
  return spans.length - 1
}

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
  readingWordIndex.value = -1
  speakItalian(text, { rate: progress.ttsRate })
}

// Lecture phrase par phrase : la phrase en cours est surlignée dans le texte
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
      readingWordIndex.value = -1
      return
    }
    readingKey.value = list[i].key
    // Réinitialisé à chaque phrase : sans événement onboundary, aucun mot
    // n'est surligné (comportement d'avant).
    readingWordIndex.value = -1
    const spans = wordSpans(list[i].text)
    speakItalian(list[i].text, {
      rate: progress.ttsRate,
      onEnd: () => next(i + 1),
      onWordBoundary: ({ charIndex }) => {
        if (session !== readSession || !spans.length) return
        readingWordIndex.value = wordIndexAt(spans, charIndex)
      },
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
  readingWordIndex.value = -1
}

function setRate(rate) {
  progress.ttsRate = rate
  // En cours de lecture : la nouvelle vitesse s'applique à la phrase suivante
}

// Suit la voix : garde la phrase lue visible à l'écran
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

// Le layout scène défile en interne : la bulle est en position fixe,
// on travaille donc en coordonnées de viewport (sans window.scrollX/Y)
function positionFromEvent(event) {
  const rect = event.target.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2,
    y: rect.bottom + 8,
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

  if (!isSentence && result) {
    trackWordTranslated({ textId: props.id, level: textMeta.value?.level })
  }
  if (ttsEnabled.value) speak(original)
}

function onWordEnter(word, event) {
  if (touchMode) return
  // Petit délai pour éviter d'afficher au simple passage de la souris
  clearTimeout(hoverTimer)
  cancelClose()
  hoverTimer = setTimeout(() => showTranslation(word, event, false), 150)
}

// Le "dblclick" natif n'est pas fiable au double-tap sur mobile (souvent jamais émis) :
// on détecte donc le double-tap nous-mêmes, à partir des taps simples successifs.
let lastTapTime = 0
let lastTapSentence = null

function onWordTap(word, sentence, event) {
  if (!touchMode) return
  clearTimeout(hoverTimer)

  const now = Date.now()
  const isDoubleTap = now - lastTapTime < 350 && lastTapSentence === sentence
  lastTapTime = isDoubleTap ? 0 : now
  lastTapSentence = isDoubleTap ? null : sentence

  if (isDoubleTap) {
    onWordDblClick(sentence, event)
    return
  }
  showTranslation(word, event, false)
}

function onWordLeave() {
  clearTimeout(hoverTimer)
  // Délai de grâce : laisse le temps d'atteindre la bulle (boutons 🔊 / ☆)
  if (overlay.value && !overlay.value.isSentence) scheduleClose()
}

// Navigation clavier : un mot atteint par tabulation affiche sa traduction
// comme au survol ; Entrée/Espace traduit la phrase entière (équivalent du
// double-clic), Échap referme (géré par onKeydown au niveau du document).
function onWordFocus(word, event) {
  clearTimeout(hoverTimer)
  cancelClose()
  showTranslation(word, event, false)
}

function onWordBlur() {
  onWordLeave()
}

function onWordKeydown(sentence, event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onWordDblClick(sentence, event)
  }
}

function onPunctKeydown(sentence, event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onPunctClick(sentence, event)
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
    textId: props.id,
  })
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
    quizOpen.value = false
    drillKey.value = null
    // Changement de texte : le mode écoute repart texte masqué
    textRevealed.value = false
    loadText(id)
  },
  { immediate: true }
)

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (quizOpen.value) quizOpen.value = false
    else closeOverlay()
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  stopSpeaking()
})
</script>

<template>
  <SceneLayout
    v-if="!currentText && accessDenied && textMeta"
    :title="textMeta.title"
    :tagline="tagline"
    narrow
  >
    <p class="excerpt">{{ textMeta.excerpt }}</p>
    <ContentPaywall placement="text" />
  </SceneLayout>
  <SceneLayout
    v-else-if="currentText"
    :title="currentText.title"
    :tagline="tagline"
    bare
  >
    <div class="reader">
      <!-- Barre d'outils : retour + contrôles audio -->
      <div class="toolbar">
        <RouterLink class="back" :to="{ name: 'library' }">
          ← Tous les textes
        </RouterLink>
        <div v-if="ttsSupported" class="tts-bar">
          <button
            class="icon-btn tts-toggle"
            :class="{ active: ttsEnabled }"
            :title="
              ttsEnabled
                ? 'Désactiver la prononciation'
                : 'Activer la prononciation'
            "
            :aria-label="
              ttsEnabled
                ? 'Désactiver la prononciation'
                : 'Activer la prononciation'
            "
            :aria-pressed="ttsEnabled"
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
            aria-label="Écouter le texte"
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
            aria-label="Mettre en pause"
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
            aria-label="Arrêter la lecture"
            @click="stopReading"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h12v12H6V6z" />
            </svg>
          </button>
          <span class="sep"></span>
          <button
            v-for="s in speeds"
            :key="s.rate"
            class="speed-btn"
            :class="{ active: progress.ttsRate === s.rate }"
            :title="`Vitesse de lecture : ${s.label.toLowerCase()}`"
            @click="setRate(s.rate)"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <!-- Bandeau du mode écoute : explique le masquage et permet de révéler
           le texte. Pas de promesse de pause fine : sur mobile natif,
           pause = stop (limitation documentée de src/tts.js). -->
      <div v-if="ascoltoRequested" class="ascolto-bar">
        <p class="ascolto-note">
          <span aria-hidden="true">🎧</span>
          <template v-if="ascoltoMasked">
            Mode écoute : le texte est masqué. Écoutez-le avec le bouton
            lecture, puis vérifiez votre compréhension.
          </template>
          <template v-else>
            Mode écoute : texte affiché.
          </template>
        </p>
        <button
          class="ascolto-toggle"
          :aria-pressed="!ascoltoMasked"
          @click="textRevealed = !textRevealed"
        >
          {{ ascoltoMasked ? 'Afficher le texte' : 'Masquer le texte' }}
        </button>
      </div>

      <p v-if="!progress.hintDismissed && !ascoltoMasked" class="hint">
        <template v-if="touchMode">
          Touchez un mot pour voir sa traduction. Touchez la ponctuation
          (<strong>.</strong> <strong>!</strong> <strong>?</strong>) pour
          traduire la phrase entière.
        </template>
        <template v-else>
          Survolez un mot pour voir sa traduction. Double-cliquez sur un mot
          ou cliquez sur la ponctuation (<strong>.</strong> <strong>!</strong>
          <strong>?</strong>) pour traduire la phrase entière.
        </template>
        <button
          class="hint-close"
          title="Ne plus afficher cette aide"
          aria-label="Ne plus afficher cette aide"
          @click="progress.hintDismissed = true"
        >
          ✕
        </button>
      </p>

      <!-- Le texte, sur un panneau « papier » posé sur la scène -->
      <div class="paper">
        <!-- Mode écoute masqué : flou CSS + `inert` (pas de retrait du DOM,
             le TTS lit flatSentences depuis les mêmes données). `inert`
             bloque focus, clics et lecteurs d'écran sur le texte caché. -->
        <article
          :class="{ masked: ascoltoMasked }"
          :inert="ascoltoMasked"
          @click.self="closeOverlay"
        >
          <template v-for="(sentences, pi) in paragraphs" :key="pi">
            <p>
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
                    :class="{
                      'word-reading':
                        readingKey === `${pi}-${si}` &&
                        s.wordIndices[ti] === readingWordIndex,
                    }"
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
                    aria-label="Traduire la phrase"
                    @click="onPunctClick(s.sentence, $event)"
                    @keydown="onPunctKeydown(s.sentence, $event)"
                    >{{ token }}</span
                  ><template v-else>{{ token }}</template>
                </template><button
                  v-if="micSupported && !ascoltoMasked"
                  class="drill-btn"
                  :class="{ active: drillKey === `${pi}-${si}` }"
                  :title="
                    drillKey === `${pi}-${si}`
                      ? `Fermer l'exercice de prononciation`
                      : 'Prononcer cette phrase'
                  "
                  :aria-label="
                    drillKey === `${pi}-${si}`
                      ? `Fermer l'exercice de prononciation`
                      : 'S’entraîner à prononcer cette phrase'
                  "
                  :aria-expanded="drillKey === `${pi}-${si}`"
                  @click.stop="toggleDrill(`${pi}-${si}`)"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path
                      d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5.3-3a5.3 5.3 0 0 1-10.6 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-1.7z"
                    />
                  </svg>
                </button>
              </span>
            </p>
            <!-- Exercice de prononciation de la phrase active (une seule à la
                 fois), posé sous le paragraphe qui la contient -->
            <div
              v-if="drillSentence && drillKey.startsWith(`${pi}-`)"
              class="drill-panel"
            >
              <div class="drill-head">
                <p class="drill-phrase">« {{ drillSentence }} »</p>
                <button
                  class="drill-close"
                  title="Fermer l'exercice"
                  aria-label="Fermer l'exercice de prononciation"
                  @click="drillKey = null"
                >
                  ✕
                </button>
              </div>
              <PronunciationDrill :phrase="drillSentence" />
            </div>
          </template>
        </article>

        <div
          v-if="(currentText.questions && currentText.questions.length) || currentText.words"
          class="verify-cta"
        >
          <button
            v-if="currentText.questions && currentText.questions.length"
            class="btn-verify"
            @click="openQuiz"
          >
            Verifica la comprensione →
          </button>
          <button
            v-if="currentText.words && Object.keys(currentText.words).length"
            class="btn-vocab"
            :class="{ active: inVocabMode }"
            :title="
              inVocabMode
                ? 'Retirer ce texte du mode vocabulaire'
                : 'Ajouter ce texte au mode vocabulaire'
            "
            @click="toggleVocabMode"
          >
            {{ inVocabMode ? '✓ Ajouté au vocabulaire' : '📖 Ajouter au vocabulaire' }}
          </button>
        </div>
      </div>

      <nav class="pager">
        <RouterLink
          v-if="prevText"
          class="pager-link prev"
          :to="{ name: 'reader', params: { id: prevText.id }, query: route.query }"
        >
          ← {{ prevText.title }}
        </RouterLink>
        <span v-else></span>
        <RouterLink
          v-if="nextText"
          class="pager-link next"
          :to="{ name: 'reader', params: { id: nextText.id }, query: route.query }"
        >
          {{ nextText.title }} →
        </RouterLink>
      </nav>
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

    <!-- La vérification s'ouvre par-dessus le texte, en overlay -->
    <Teleport to="body">
      <Transition name="quiz-fade">
        <div v-if="quizOpen" class="quiz-modal" @click.self="quizOpen = false">
          <div class="quiz-panel">
            <button
              class="quiz-close"
              title="Fermer la vérification"
              aria-label="Fermer la vérification"
              @click="quizOpen = false"
            >
              ✕
            </button>
            <QuizSection
              :key="id"
              :questions="currentText.questions"
              @completed="onQuizCompleted"
            />
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

/* --- Barre d'outils --- */

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem 1rem;
  margin-bottom: 0.7rem;
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

.hint {
  margin: 0 0 0.9rem;
  font-size: 0.9rem;
  color: #6b6156;
  opacity: 0.85;
}

.hint-close {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0 0.2rem;
  margin-left: 0.3rem;
  opacity: 0.7;
}

.hint-close:hover {
  opacity: 1;
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
  width: 2.1rem;
  height: 2.1rem;
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
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.speed-btn:hover {
  border-color: #b0692e;
}

.speed-btn.active {
  background: #b0692e;
  border-color: #b0692e;
  color: #faf6f0;
}

/* --- Mode écoute --- */

.ascolto-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  margin: 0 0 0.9rem;
  padding: 0.6rem 1rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 14px;
  background: rgba(255, 253, 248, 0.75);
}

.ascolto-note {
  margin: 0;
  font-size: 0.88rem;
  color: #6b6156;
}

.ascolto-toggle {
  padding: 0.35rem 0.9rem;
  border: 1px solid rgba(138, 90, 43, 0.35);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.65);
  color: #8a5a2b;
  font-family: inherit;
  font-size: 0.83rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.ascolto-toggle:hover {
  background: #faf6f0;
  border-color: #b0692e;
  color: #b0692e;
}

/* Texte masqué : flou seulement (le DOM reste en place pour le TTS, et le
   surlignage de la phrase lue reste perceptible sous le flou) */
article.masked {
  filter: blur(9px);
}

/* --- Panneau « papier » : même famille que le panneau vitré de la scène,
       mais plus opaque pour un vrai confort de lecture --- */

.paper {
  padding: 2rem 2.2rem 1.8rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 18px;
  background: rgba(255, 253, 248, 0.88);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 14px 40px rgba(111, 71, 34, 0.14);
  opacity: 0;
  animation: paper-in 0.9s ease-out 0.5s forwards;
}

@keyframes paper-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

article {
  font-size: 1.25rem;
  line-height: 1.9;
  user-select: none;
  /* Évite le délai et le zoom du double-tap sur mobile */
  touch-action: manipulation;
  transition: filter 0.25s ease;
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

/* Karaoke : mot en cours de prononciation — fond un peu plus soutenu que la
   phrase surlignée, simple transition douce (pas d'animation), sans toucher
   au comportement interactif des mots (survol, clic, focus). */
.sentence.reading .word.word-reading {
  background: #ecd9b4;
  transition: background 0.12s ease;
}

.word {
  cursor: pointer;
  border-radius: 3px;
  /* Affordance discrète : signale que le mot est interactif avant même le survol */
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
  cursor: pointer;
  color: #b0692e;
  font-weight: 700;
  border-radius: 3px;
  padding: 0 0.1em;
  transition: background 0.1s;
}

.punct:hover,
.punct:focus-visible {
  background: #f0e0c8;
}

/* --- Exercice de prononciation --- */

/* Bouton micro inline après chaque phrase : discret (estompé), il s'affirme
   au survol/focus sans casser la justification du texte */
.drill-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: baseline;
  width: 1.35em;
  height: 1.35em;
  margin: 0 0.15em;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #b0692e;
  opacity: 0.4;
  cursor: pointer;
  transition: opacity 0.12s, background 0.12s, color 0.12s;
}

.drill-btn svg {
  width: 0.72em;
  height: 0.72em;
}

.sentence:hover .drill-btn,
.drill-btn:hover,
.drill-btn:focus-visible {
  opacity: 1;
  background: #f0e0c8;
}

.drill-btn:focus-visible {
  outline: 2px solid #b0692e;
  outline-offset: 2px;
}

.drill-btn.active {
  opacity: 1;
  background: #b0692e;
  color: #faf6f0;
}

.drill-panel {
  margin: -0.4rem 0 1.2rem;
  padding: 0.8rem 1rem;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 12px;
  background: #faf6f0;
  font-size: 1rem;
  line-height: 1.5;
  user-select: text;
}

.drill-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.6rem;
}

.drill-phrase {
  margin: 0 0 0.2rem;
  font-size: 0.95rem;
  font-style: italic;
  color: #6f4722;
}

.drill-close {
  flex-shrink: 0;
  width: 1.6rem;
  height: 1.6rem;
  border: 1px solid rgba(138, 90, 43, 0.35);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  color: #6b6156;
  font-size: 0.75rem;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}

.drill-close:hover {
  color: #b0692e;
  border-color: #b0692e;
}

/* --- Bouton de vérification --- */

.verify-cta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.9rem;
  text-align: center;
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
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
}

.btn-verify:hover {
  background: #9a5a26;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(176, 105, 46, 0.35);
}

.btn-vocab {
  padding: 0.7rem 1.6rem;
  border: 1px solid #b0692e;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: #b0692e;
  font-family: inherit;
  font-size: 0.98rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.15s;
}

.btn-vocab:hover {
  background: #b0692e;
  color: #faf6f0;
  transform: translateY(-2px);
}

.btn-vocab.active {
  background: #4a7c59;
  border-color: #4a7c59;
  color: #faf6f0;
}

.btn-vocab.active:hover {
  background: #3d6849;
}

/* --- Pagination --- */

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
  transition: background 0.12s, border-color 0.12s, color 0.12s;
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

@media (prefers-reduced-motion: reduce) {
  .paper {
    animation: none;
    opacity: 1;
  }
}
</style>

<!-- L'overlay du quiz est téléporté dans <body> : styles non scopés -->
<style>
.quiz-modal {
  position: fixed;
  inset: 0;
  z-index: 200;
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

.quiz-close {
  position: absolute;
  top: 0.8rem;
  right: 0.9rem;
  width: 2rem;
  height: 2rem;
  border: 1px solid rgba(138, 90, 43, 0.35);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  color: #6b6156;
  font-size: 0.85rem;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
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
