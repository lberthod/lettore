<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { allLemmas } from '../../lib/dictionary.js'
import { logActivity } from '../../progress.js'

const QUESTION_COUNT = 10
const QUESTION_DURATION = 5000 // ms
const FEEDBACK_DELAY = 800 // ms
const TICK_INTERVAL = 50 // ms

// Phases : 'loading' | 'error' | 'start' | 'playing' | 'finished'
const phase = ref('loading')

const pool = ref([])
const questions = ref([])
const currentIndex = ref(0)
const score = ref(0)

// État de la question en cours
const answered = ref(false)
const lastAnswerCorrect = ref(null) // true / false / null (pas encore répondu)
const timeLeftRatio = ref(1) // 0..1 pour la barre de temps

let timerInterval = null
let advanceTimeout = null
let questionStartTs = 0

function shuffle(array) {
  const a = array.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function sampleDistinct(list, count) {
  return shuffle(list).slice(0, count)
}

async function loadPool() {
  phase.value = 'loading'
  try {
    const entries = await allLemmas()
    pool.value = entries.filter(
      (e) => e.lemma && e.fr && e.fr.length <= 30
    )
    if (pool.value.length < 20) {
      phase.value = 'error'
      return
    }
    phase.value = 'start'
  } catch {
    phase.value = 'error'
  }
}

function buildQuestions() {
  const chosen = sampleDistinct(pool.value, QUESTION_COUNT)
  // La moitié (arrondie) des questions sera "vraie" ; on mélange l'ordre.
  const truthPattern = shuffle([
    ...Array(Math.ceil(QUESTION_COUNT / 2)).fill(true),
    ...Array(Math.floor(QUESTION_COUNT / 2)).fill(false),
  ])

  return chosen.map((entry, i) => {
    const isTrue = truthPattern[i]
    let shownFr = entry.fr
    if (!isTrue) {
      // Choisit un mot différent du pool pour emprunter une traduction plausible.
      let other = entry
      let guard = 0
      while ((other.lemma === entry.lemma || other.fr === entry.fr) && guard < 30) {
        other = pool.value[Math.floor(Math.random() * pool.value.length)]
        guard++
      }
      shownFr = other.fr
    }
    return {
      lemma: entry.lemma,
      shownFr,
      isTrue,
    }
  })
}

function clearTimers() {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
  if (advanceTimeout) {
    clearTimeout(advanceTimeout)
    advanceTimeout = null
  }
}

function startQuestionTimer() {
  clearTimers()
  timeLeftRatio.value = 1
  questionStartTs = Date.now()
  timerInterval = setInterval(() => {
    const elapsed = Date.now() - questionStartTs
    const ratio = Math.max(0, 1 - elapsed / QUESTION_DURATION)
    timeLeftRatio.value = ratio
    if (elapsed >= QUESTION_DURATION) {
      handleTimeout()
    }
  }, TICK_INTERVAL)
}

function handleTimeout() {
  if (answered.value) return
  answered.value = true
  lastAnswerCorrect.value = false
  clearTimers()
  scheduleAdvance()
}

function answer(choice) {
  if (answered.value || phase.value !== 'playing') return
  answered.value = true
  clearTimers()
  const q = questions.value[currentIndex.value]
  const correct = choice === q.isTrue
  lastAnswerCorrect.value = correct
  if (correct) score.value++
  scheduleAdvance()
}

function scheduleAdvance() {
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
  lastAnswerCorrect.value = null
  startQuestionTimer()
}

function finishRound() {
  clearTimers()
  phase.value = 'finished'
  logActivity({ skill: 'lessico', mode: 'vero-falso', score: score.value, total: QUESTION_COUNT })
}

function startRound() {
  questions.value = buildQuestions()
  currentIndex.value = 0
  score.value = 0
  answered.value = false
  lastAnswerCorrect.value = null
  phase.value = 'playing'
  startQuestionTimer()
}

onMounted(() => {
  loadPool()
})

onUnmounted(() => {
  clearTimers()
})
</script>

<template>
  <div class="vf-card">
    <div class="vf-header">
      <h3 class="vf-title">Vero o Falso</h3>
      <p class="vf-subtitle">Indovina se la traduzione proposta è corretta.</p>
    </div>

    <div v-if="phase === 'loading'" class="vf-state">
      <p>Caricamento del dizionario…</p>
    </div>

    <div v-else-if="phase === 'error'" class="vf-state">
      <p>Impossibile caricare le parole. Riprova più tardi.</p>
    </div>

    <div v-else-if="phase === 'start'" class="vf-state">
      <p>Rispondi Vero o Falso a 10 abbinamenti parola-traduzione, prima che scada il tempo.</p>
      <button class="vf-btn vf-btn-primary" type="button" @click="startRound">Inizia</button>
    </div>

    <div v-else-if="phase === 'playing' && questions[currentIndex]" class="vf-play">
      <div class="vf-progress-row">
        <span class="vf-counter">{{ currentIndex + 1 }}/{{ questions.length }}</span>
        <span class="vf-score">Punteggio: {{ score }}</span>
      </div>

      <div class="vf-timer-track">
        <div
          class="vf-timer-bar"
          :class="{ 'vf-timer-low': timeLeftRatio < 0.34 }"
          :style="{ width: (timeLeftRatio * 100) + '%' }"
        ></div>
      </div>

      <div
        class="vf-question"
        :class="{
          'vf-flash-correct': answered && lastAnswerCorrect === true,
          'vf-flash-wrong': answered && lastAnswerCorrect === false,
        }"
      >
        <div class="vf-word">{{ questions[currentIndex].lemma }}</div>
        <div class="vf-arrow">=</div>
        <div class="vf-translation">{{ questions[currentIndex].shownFr }}</div>
      </div>

      <div v-if="answered" class="vf-feedback">
        <span v-if="lastAnswerCorrect">Corretto!</span>
        <span v-else>
          Sbagliato — la traduzione giusta è
          <strong>{{ questions[currentIndex].isTrue ? questions[currentIndex].shownFr : pool.find(e => e.lemma === questions[currentIndex].lemma)?.fr }}</strong>
        </span>
      </div>

      <div class="vf-actions">
        <button
          type="button"
          class="vf-btn vf-btn-true"
          :disabled="answered"
          @click="answer(true)"
        >
          Vero
        </button>
        <button
          type="button"
          class="vf-btn vf-btn-false"
          :disabled="answered"
          @click="answer(false)"
        >
          Falso
        </button>
      </div>
    </div>

    <div v-else-if="phase === 'finished'" class="vf-state">
      <p class="vf-final-score">{{ score }}/{{ QUESTION_COUNT }}</p>
      <p v-if="score >= 8">Ottimo lavoro!</p>
      <p v-else-if="score >= 5">Non male, continua così.</p>
      <p v-else>Continua a esercitarti, migliorerai.</p>
      <button class="vf-btn vf-btn-primary" type="button" @click="startRound">Rigioca</button>
    </div>
  </div>
</template>

<style scoped>
.vf-card {
  background: #faf6f0;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.5rem;
  max-width: 480px;
  margin: 0 auto;
  box-sizing: border-box;
}

.vf-header {
  margin-bottom: 1rem;
}

.vf-title {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
}

.vf-subtitle {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.8;
}

.vf-state {
  text-align: center;
  padding: 1rem 0;
}

.vf-final-score {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0.5rem 0;
  color: #b0692e;
}

.vf-btn {
  border-radius: 10px;
  border: 1px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #2c2620;
  font-size: 1rem;
  padding: 0.65rem 1.1rem;
  cursor: pointer;
  transition: transform 0.1s ease, background 0.15s ease;
}

.vf-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.vf-btn:disabled {
  cursor: default;
  opacity: 0.6;
}

.vf-btn-primary {
  background: #b0692e;
  border-color: #b0692e;
  color: #fff;
  margin-top: 0.75rem;
}

.vf-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.vf-counter {
  font-weight: 600;
}

.vf-score {
  opacity: 0.8;
}

.vf-timer-track {
  width: 100%;
  height: 8px;
  background: rgba(176, 105, 46, 0.15);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 1.25rem;
}

.vf-timer-bar {
  height: 100%;
  background: #b0692e;
  transition: width 0.05s linear, background 0.2s ease;
  border-radius: 999px;
}

.vf-timer-bar.vf-timer-low {
  background: #a5382a;
}

.vf-question {
  text-align: center;
  padding: 1.5rem 1rem;
  border-radius: 12px;
  background: rgba(176, 105, 46, 0.06);
  margin-bottom: 0.75rem;
  transition: background-color 0.2s ease;
}

.vf-question.vf-flash-correct {
  background: #e4f2e2;
}

.vf-question.vf-flash-wrong {
  background: #f7e4e0;
}

.vf-word {
  font-size: 1.4rem;
  font-weight: 700;
}

.vf-arrow {
  font-size: 1rem;
  opacity: 0.6;
  margin: 0.25rem 0;
}

.vf-translation {
  font-size: 1.2rem;
  font-style: italic;
}

.vf-feedback {
  text-align: center;
  min-height: 1.4rem;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
}

.vf-actions {
  display: flex;
  gap: 0.75rem;
}

.vf-btn-true,
.vf-btn-false {
  flex: 1;
  font-weight: 600;
  font-size: 1.05rem;
  padding: 0.85rem 0.5rem;
}

.vf-btn-true {
  background: #e4f2e2;
  border: 2px solid #2f6b2f;
  color: #2f6b2f;
}

.vf-btn-false {
  background: #f7e4e0;
  border: 2px solid #a5382a;
  color: #a5382a;
}

@media (max-width: 360px) {
  .vf-card {
    padding: 1rem;
  }

  .vf-word {
    font-size: 1.15rem;
  }

  .vf-translation {
    font-size: 1rem;
  }

  .vf-actions {
    gap: 0.5rem;
  }

  .vf-btn-true,
  .vf-btn-false {
    font-size: 0.95rem;
    padding: 0.7rem 0.4rem;
  }
}
</style>
