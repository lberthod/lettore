<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import textsIndex from '../../texts/index.json'
import { freeTexts } from 'virtual:free-content'
import { loadCatalogText } from '../../lib/protectedContent.js'
import { logActivity } from '../../progress.js'

const QUESTION_COUNT = 10
const MAX_LEN = 90
const MIN_POOL = 8
const TARGET_POOL = 12
const IDS_PER_BATCH = 18
const MAX_ATTEMPTS = 4
const FEEDBACK_DELAY = 800 // ms

// Phases : 'loading' | 'error' | 'start' | 'playing' | 'finished'
const phase = ref('loading')

const pool = ref([])
const questions = ref([])
const currentIndex = ref(0)
const score = ref(0)

const answered = ref(false)
const selectedOption = ref(null)
const lastAnswerCorrect = ref(null)

let advanceTimeout = null

function shuffle(array) {
  const a = array.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function sampleDistinct(list, count) {
  return shuffle(list).slice(0, Math.min(count, list.length))
}

function pickRandomIds(count) {
  return sampleDistinct(textsIndex, count).map((t) => t.id)
}

async function fetchPairsForIds(ids) {
  const docs = await Promise.all(ids.map((id) => loadCatalogText(id)))
  const pairs = []
  for (const doc of docs) {
    if (!doc || !doc.sentences) continue
    for (const [it, fr] of Object.entries(doc.sentences)) {
      if (
        typeof it === 'string' &&
        typeof fr === 'string' &&
        it.length > 0 &&
        fr.length > 0 &&
        it.length <= MAX_LEN &&
        fr.length <= MAX_LEN
      ) {
        pairs.push({ it, fr })
      }
    }
  }
  return pairs
}

// Les textes de l'aperçu gratuit (`virtual:free-content`) sont toujours
// accessibles, sans connexion ni lecture Firestore : on les charge tous en
// priorité pour garantir un stock de phrases même à un visiteur anonyme
// (seuls ~6 textes sur 466 sont dans cet aperçu, un tirage aléatoire dans
// l'index complet les manquerait presque toujours). Le reste du catalogue ne
// sert qu'en complément, pour les comptes connectés dont le rôle autorise la
// lecture Firestore.
async function fetchFreeTextPairs() {
  const docs = await Promise.all(Object.values(freeTexts).map((load) => load()))
  const pairs = []
  for (const doc of docs) {
    if (!doc || !doc.sentences) continue
    for (const [it, fr] of Object.entries(doc.sentences)) {
      if (
        typeof it === 'string' &&
        typeof fr === 'string' &&
        it.length > 0 &&
        fr.length > 0 &&
        it.length <= MAX_LEN &&
        fr.length <= MAX_LEN
      ) {
        pairs.push({ it, fr })
      }
    }
  }
  return pairs
}

async function loadPool() {
  phase.value = 'loading'
  try {
    const collected = new Map()
    for (const pair of await fetchFreeTextPairs()) {
      collected.set(`${pair.it} ${pair.fr}`, pair)
    }
    let attempts = 0
    while (collected.size < TARGET_POOL && attempts < MAX_ATTEMPTS) {
      attempts++
      const ids = pickRandomIds(IDS_PER_BATCH)
      const pairs = await fetchPairsForIds(ids)
      for (const pair of pairs) {
        collected.set(`${pair.it} ${pair.fr}`, pair)
      }
    }
    const allPairs = Array.from(collected.values())
    if (allPairs.length < MIN_POOL) {
      phase.value = 'error'
      return
    }
    pool.value = allPairs
    phase.value = 'start'
  } catch {
    phase.value = 'error'
  }
}

function buildQuestions() {
  const chosenPairs = sampleDistinct(pool.value, QUESTION_COUNT)
  return chosenPairs.map((pair) => {
    const wrongOptions = []
    let guard = 0
    while (wrongOptions.length < 3 && guard < 60) {
      guard++
      const candidate = pool.value[Math.floor(Math.random() * pool.value.length)]
      if (candidate.fr === pair.fr) continue
      if (wrongOptions.some((w) => w === candidate.fr)) continue
      wrongOptions.push(candidate.fr)
    }
    const options = shuffle([pair.fr, ...wrongOptions])
    return {
      it: pair.it,
      correct: pair.fr,
      options,
    }
  })
}

function clearTimers() {
  if (advanceTimeout) {
    clearTimeout(advanceTimeout)
    advanceTimeout = null
  }
}

function answer(option) {
  if (answered.value || phase.value !== 'playing') return
  answered.value = true
  selectedOption.value = option
  const q = questions.value[currentIndex.value]
  const correct = option === q.correct
  lastAnswerCorrect.value = correct
  if (correct) score.value++
  advanceTimeout = setTimeout(() => {
    advanceTimeout = null
    goToNext()
  }, FEEDBACK_DELAY)
}

function goToNext() {
  if (currentIndex.value + 1 >= questions.value.length) {
    finishRound()
    return
  }
  currentIndex.value++
  answered.value = false
  selectedOption.value = null
  lastAnswerCorrect.value = null
}

function finishRound() {
  clearTimers()
  phase.value = 'finished'
  logActivity({ skill: 'lettura', mode: 'traduci-frase', score: score.value, total: QUESTION_COUNT })
}

function startRound() {
  questions.value = buildQuestions()
  currentIndex.value = 0
  score.value = 0
  answered.value = false
  selectedOption.value = null
  lastAnswerCorrect.value = null
  phase.value = 'playing'
}

onMounted(() => {
  loadPool()
})

onUnmounted(() => {
  clearTimers()
})
</script>

<template>
  <div class="tlf-card">
    <div class="tlf-header">
      <h3 class="tlf-title">Traduci la frase</h3>
      <p class="tlf-subtitle">Scegli la traduzione francese corretta della frase italiana.</p>
    </div>

    <div v-if="phase === 'loading'" class="tlf-state">
      <p>Caricamento delle frasi…</p>
    </div>

    <div v-else-if="phase === 'error'" class="tlf-state">
      <p>Contenuto non disponibile al momento, riprova più tardi.</p>
    </div>

    <div v-else-if="phase === 'start'" class="tlf-state">
      <p>Rispondi a 10 domande scegliendo tra 4 traduzioni possibili, senza limite di tempo.</p>
      <button class="tlf-btn tlf-btn-primary" type="button" @click="startRound">Inizia</button>
    </div>

    <div v-else-if="phase === 'playing' && questions[currentIndex]" class="tlf-play">
      <div class="tlf-progress-row">
        <span class="tlf-counter">{{ currentIndex + 1 }}/{{ questions.length }}</span>
        <span class="tlf-score">Punteggio: {{ score }}</span>
      </div>

      <div class="tlf-sentence">{{ questions[currentIndex].it }}</div>

      <div class="tlf-options">
        <button
          v-for="option in questions[currentIndex].options"
          :key="option"
          type="button"
          class="tlf-option"
          :class="{
            'tlf-option-correct': answered && option === questions[currentIndex].correct,
            'tlf-option-wrong':
              answered && option === selectedOption && option !== questions[currentIndex].correct,
          }"
          :disabled="answered"
          @click="answer(option)"
        >
          {{ option }}
        </button>
      </div>

      <div v-if="answered" class="tlf-feedback">
        <span v-if="lastAnswerCorrect" class="tlf-feedback-correct">Corretto!</span>
        <span v-else class="tlf-feedback-wrong">
          Sbagliato — la traduzione giusta è
          <strong>{{ questions[currentIndex].correct }}</strong>
        </span>
      </div>
    </div>

    <div v-else-if="phase === 'finished'" class="tlf-state">
      <p class="tlf-final-score">{{ score }}/{{ QUESTION_COUNT }}</p>
      <p v-if="score >= 8">Ottimo lavoro!</p>
      <p v-else-if="score >= 5">Non male, continua così.</p>
      <p v-else>Continua a esercitarti, migliorerai.</p>
      <button class="tlf-btn tlf-btn-primary" type="button" @click="startRound">Rigioca</button>
    </div>
  </div>
</template>

<style scoped>
.tlf-card {
  background: #faf6f0;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.5rem;
  max-width: 480px;
  margin: 0 auto;
  box-sizing: border-box;
}

.tlf-header {
  margin-bottom: 1rem;
}

.tlf-title {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
}

.tlf-subtitle {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.8;
}

.tlf-state {
  text-align: center;
  padding: 1rem 0;
}

.tlf-final-score {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0.5rem 0;
  color: #b0692e;
}

.tlf-btn {
  border-radius: 10px;
  border: 1px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #2c2620;
  font-size: 1rem;
  padding: 0.65rem 1.1rem;
  cursor: pointer;
  transition: transform 0.1s ease, background 0.15s ease;
}

.tlf-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.tlf-btn-primary {
  background: #b0692e;
  border-color: #b0692e;
  color: #fff;
  margin-top: 0.75rem;
}

.tlf-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
}

.tlf-counter {
  font-weight: 600;
}

.tlf-score {
  opacity: 0.8;
}

.tlf-sentence {
  text-align: center;
  padding: 1.25rem 1rem;
  border-radius: 12px;
  background: rgba(176, 105, 46, 0.06);
  margin-bottom: 1rem;
  font-size: 1.2rem;
  font-style: italic;
  line-height: 1.4;
}

.tlf-options {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.tlf-option {
  border-radius: 999px;
  border: 1px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #2c2620;
  font-size: 0.95rem;
  padding: 0.7rem 1.1rem;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.1s ease;
}

.tlf-option:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: #b0692e;
}

.tlf-option:disabled {
  cursor: default;
}

.tlf-option-correct {
  background: #e4f2e2;
  border-color: #2f6b2f;
  color: #2f6b2f;
  font-weight: 600;
}

.tlf-option-wrong {
  background: #f7e4e0;
  border-color: #a5382a;
  color: #a5382a;
  font-weight: 600;
}

.tlf-feedback {
  text-align: center;
  min-height: 1.4rem;
  font-size: 0.9rem;
}

.tlf-feedback-correct {
  color: #2f6b2f;
  font-weight: 600;
}

.tlf-feedback-wrong {
  color: #a5382a;
}

@media (max-width: 360px) {
  .tlf-card {
    padding: 1rem;
  }

  .tlf-sentence {
    font-size: 1.05rem;
    padding: 1rem 0.75rem;
  }

  .tlf-option {
    font-size: 0.85rem;
    padding: 0.6rem 0.85rem;
  }
}
</style>
