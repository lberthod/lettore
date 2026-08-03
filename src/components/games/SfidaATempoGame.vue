<script setup>
// Mini-jeu autonome « Sfida a tempo » : contre-la-montre de 60 secondes qui
// pioche des questions à choix multiples dans TOUS les niveaux CECR mélangés
// (banque partagée avec ScalaCecrGame.vue / LevelTestView.vue). Contrairement
// à Scala CECR, il n'y a ni vies ni progression par niveau : une erreur ne
// met pas fin à la partie, seul le chronomètre compte. Composant entièrement
// indépendant : pas de route, pas de props, tout l'état vit ici.

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { LEVELS, QUESTIONS_BY_LEVEL } from '../../data/levelTestQuestions.js'
import { logActivity } from '../../progress.js'

const SESSION_DURATION_MS = 60000
const TICK_MS = 150
const URGENT_THRESHOLD_S = 10

// Pool plat de toutes les questions, toutes niveaux confondus, chacune
// taguée avec son niveau d'origine (flourish optionnel affiché dans l'UI).
const QUESTION_POOL = LEVELS.flatMap((level) =>
  (QUESTIONS_BY_LEVEL[level] || []).map((q) => ({ ...q, level }))
)

// Phases : 'start' (écran d'accueil) -> 'playing' -> 'over' (résumé final).
const phase = ref('start')

const msRemaining = ref(SESSION_DURATION_MS)
const totalCorrect = ref(0)
const totalAnswered = ref(0)
const currentQuestion = ref(null)
const selectedOption = ref(null)
const feedback = ref(null) // 'correct' | 'incorrect' | null
const answerLocked = ref(false)

let intervalId = null
let sessionEndAt = 0
let feedbackTimeoutId = null

const secondsLeft = computed(() => Math.max(0, Math.ceil(msRemaining.value / 1000)))
const progressRatio = computed(() => Math.max(0, Math.min(1, msRemaining.value / SESSION_DURATION_MS)))
const isUrgent = computed(() => secondsLeft.value <= URGENT_THRESHOLD_S)
const accuracy = computed(() =>
  totalAnswered.value > 0 ? Math.round((totalCorrect.value / totalAnswered.value) * 100) : 0
)

function pickQuestion() {
  if (!QUESTION_POOL.length) return null
  const previousText = currentQuestion.value ? currentQuestion.value.q : null
  let candidate = QUESTION_POOL[Math.floor(Math.random() * QUESTION_POOL.length)]
  // Évite une répétition immédiate (question identique deux fois de suite) ;
  // quelques essais suffisent vu la taille du pool, pas besoin de suivi global.
  let attempts = 0
  while (candidate.q === previousText && attempts < 5 && QUESTION_POOL.length > 1) {
    candidate = QUESTION_POOL[Math.floor(Math.random() * QUESTION_POOL.length)]
    attempts += 1
  }
  return candidate
}

function nextQuestion() {
  currentQuestion.value = pickQuestion()
  selectedOption.value = null
  feedback.value = null
  answerLocked.value = false
}

function clearTimer() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function clearFeedbackTimeout() {
  if (feedbackTimeoutId !== null) {
    clearTimeout(feedbackTimeoutId)
    feedbackTimeoutId = null
  }
}

function tick() {
  const remaining = sessionEndAt - Date.now()
  if (remaining <= 0) {
    msRemaining.value = 0
    clearTimer()
    endGame()
    return
  }
  msRemaining.value = remaining
}

function startGame() {
  clearTimer()
  clearFeedbackTimeout()
  totalCorrect.value = 0
  totalAnswered.value = 0
  msRemaining.value = SESSION_DURATION_MS
  sessionEndAt = Date.now() + SESSION_DURATION_MS
  phase.value = 'playing'
  nextQuestion()
  intervalId = setInterval(tick, TICK_MS)
}

function endGame() {
  clearTimer()
  clearFeedbackTimeout()
  phase.value = 'over'
  if (totalAnswered.value > 0) {
    logActivity({
      skill: 'grammatica',
      mode: 'sfida-tempo',
      score: totalCorrect.value,
      total: totalAnswered.value,
    })
  }
}

function selectOption(i) {
  if (phase.value !== 'playing' || !currentQuestion.value || answerLocked.value) return
  answerLocked.value = true
  selectedOption.value = i
  totalAnswered.value += 1
  const isCorrect = i === currentQuestion.value.correct
  feedback.value = isCorrect ? 'correct' : 'incorrect'
  if (isCorrect) totalCorrect.value += 1

  clearFeedbackTimeout()
  feedbackTimeoutId = setTimeout(() => {
    if (phase.value === 'playing') nextQuestion()
  }, 450)
}

function optionClass(i) {
  if (!answerLocked.value || !currentQuestion.value) return {}
  const q = currentQuestion.value
  if (i === q.correct) return { correct: true }
  if (i === selectedOption.value && i !== q.correct) return { incorrect: true }
  return { dimmed: true }
}

onMounted(() => {})

onUnmounted(() => {
  clearTimer()
  clearFeedbackTimeout()
})
</script>

<template>
  <div class="sfida-card">
    <header class="sfida-header">
      <h3 class="sfida-title">Sfida a tempo</h3>
      <p class="sfida-subtitle">
        Rispondi al maggior numero di domande possibile in 60 secondi, di tutti i livelli mescolati.
      </p>
    </header>

    <!-- Écran d'accueil -->
    <div v-if="phase === 'start'" class="sfida-panel sfida-start">
      <p class="sfida-intro">
        Hai <strong>60 secondi</strong>. Le domande arrivano da tutti i livelli (A1-C2) mescolati
        a caso: niente vite, niente livelli da scalare. Un errore non ti ferma, si continua subito
        con la domanda successiva. Quante ne risolvi?
      </p>
      <button class="sfida-btn sfida-btn--primary" type="button" @click="startGame">
        Inizia
      </button>
    </div>

    <!-- Partie en cours -->
    <div v-else-if="phase === 'playing'" class="sfida-panel">
      <div class="sfida-timerbar-wrap">
        <div class="sfida-timerbar-track">
          <div
            class="sfida-timerbar-fill"
            :class="{ urgent: isUrgent }"
            :style="{ width: (progressRatio * 100) + '%' }"
          ></div>
        </div>
        <span class="sfida-timer-seconds" :class="{ urgent: isUrgent }">{{ secondsLeft }}s</span>
      </div>

      <div class="sfida-status">
        <span class="sfida-stat">Punteggio: <strong>{{ totalCorrect }}</strong></span>
        <span class="sfida-stat">Risposte: <strong>{{ totalAnswered }}</strong></span>
        <span v-if="currentQuestion" class="level-badge">{{ currentQuestion.level }}</span>
      </div>

      <div v-if="currentQuestion" class="sfida-question">
        <p class="question-text">{{ currentQuestion.q }}</p>
        <ul class="sfida-options">
          <li v-for="(opt, i) in currentQuestion.options" :key="i">
            <button
              type="button"
              class="sfida-option"
              :class="optionClass(i)"
              :disabled="answerLocked"
              @click="selectOption(i)"
            >
              {{ opt }}
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- Fin de partie -->
    <div v-else-if="phase === 'over'" class="sfida-panel sfida-over">
      <p class="over-title">Tempo scaduto!</p>
      <p class="over-detail">
        Risposte corrette: <strong>{{ totalCorrect }}</strong> su {{ totalAnswered }}
      </p>
      <p class="over-detail">
        Precisione: <strong>{{ accuracy }}%</strong>
      </p>
      <button class="sfida-btn sfida-btn--primary" type="button" @click="startGame">
        Rigioca
      </button>
    </div>
  </div>
</template>

<style scoped>
.sfida-card {
  background: #faf6f0;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.5rem;
  max-width: 480px;
  width: 100%;
  box-sizing: border-box;
}

.sfida-header {
  margin-bottom: 1rem;
}

.sfida-title {
  margin: 0 0 0.25rem;
  font-size: 1.15rem;
  color: #2c2620;
}

.sfida-subtitle {
  margin: 0;
  font-size: 0.9rem;
  color: #6b6055;
}

.sfida-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.sfida-intro {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
}

.sfida-btn {
  border: none;
  border-radius: 999px;
  padding: 0.65rem 1.4rem;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  align-self: flex-start;
}

.sfida-btn--primary {
  background: #b0692e;
  color: #fff;
}

.sfida-btn--primary:hover {
  background: #995c28;
}

.sfida-timerbar-wrap {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.sfida-timerbar-track {
  flex: 1;
  height: 10px;
  background: rgba(176, 105, 46, 0.15);
  border-radius: 999px;
  overflow: hidden;
}

.sfida-timerbar-fill {
  height: 100%;
  background: #b0692e;
  border-radius: 999px;
  transition: width 0.15s linear, background 0.2s ease;
}

.sfida-timerbar-fill.urgent {
  background: #a5382a;
}

.sfida-timer-seconds {
  font-size: 0.95rem;
  font-weight: 700;
  color: #b0692e;
  min-width: 2.4em;
  text-align: right;
  white-space: nowrap;
}

.sfida-timer-seconds.urgent {
  color: #a5382a;
}

.sfida-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.sfida-stat {
  font-size: 0.9rem;
  color: #6b6055;
}

.sfida-stat strong {
  color: #2c2620;
}

.level-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #b0692e;
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
}

.sfida-question {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.question-text {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.4;
}

.sfida-options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sfida-option {
  width: 100%;
  text-align: left;
  background: #fff;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 10px;
  padding: 0.6rem 0.9rem;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.sfida-option:hover:not(:disabled) {
  background: #f3e9dd;
}

.sfida-option:disabled {
  cursor: default;
}

.sfida-option.correct {
  background: #e4f2e2;
  border-color: #2f6b2f;
  color: #2f6b2f;
  font-weight: 600;
}

.sfida-option.incorrect {
  background: #f7e4e0;
  border-color: #a5382a;
  color: #a5382a;
  font-weight: 600;
}

.sfida-option.dimmed {
  opacity: 0.55;
}

.sfida-over {
  align-items: flex-start;
}

.over-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: #b0692e;
}

.over-detail {
  margin: 0;
  font-size: 0.95rem;
}

@media (max-width: 360px) {
  .sfida-card {
    padding: 1rem;
  }

  .sfida-status {
    flex-direction: row;
    justify-content: space-between;
  }

  .question-text {
    font-size: 0.95rem;
  }
}
</style>
