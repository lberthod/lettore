<script setup>
// Mini-jeu autonome « Indovina il livello » : il giocatore legge un breve
// estratto tratto dal catalogo dei testi dell'app e deve indovinare il
// livello CECR ufficiale tra 4 opzioni mescolate. Componente indipendente :
// nessuna route, nessuna prop, tutto lo stato vive qui.

import { ref } from 'vue'
import textsIndex from '../../texts/index.json'
import { logActivity } from '../../progress.js'

const QUESTION_COUNT = 10
const FEEDBACK_DELAY = 800 // ms

const ALL_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

// Bacino dei testi utilizzabili : estratto non vuoto e livello valido.
const POOL = textsIndex.filter(
  (t) => t && typeof t.excerpt === 'string' && t.excerpt.trim() && ALL_LEVELS.includes(t.level)
)

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

function buildQuestion(entry) {
  const wrongPool = ALL_LEVELS.filter((l) => l !== entry.level)
  const wrongOptions = sampleDistinct(wrongPool, 3)
  const options = shuffle([entry.level, ...wrongOptions])
  return {
    excerpt: entry.excerpt,
    title: entry.title,
    correctLevel: entry.level,
    options,
  }
}

function buildQuestions() {
  const count = Math.min(QUESTION_COUNT, POOL.length)
  const chosen = sampleDistinct(POOL, count)
  return chosen.map(buildQuestion)
}

// Fasi : 'error' (bacino insufficiente) | 'start' | 'playing' | 'finished'
const phase = ref(POOL.length < 4 ? 'error' : 'start')

const questions = ref([])
const currentIndex = ref(0)
const score = ref(0)

const answered = ref(false)
const selectedOption = ref(null)
const lastAnswerCorrect = ref(null)

let advanceTimeout = null

function clearAdvanceTimer() {
  if (advanceTimeout) {
    clearTimeout(advanceTimeout)
    advanceTimeout = null
  }
}

function currentQuestion() {
  return questions.value[currentIndex.value]
}

function optionClass(option) {
  if (!answered.value) return {}
  const q = currentQuestion()
  if (!q) return {}
  if (option === q.correctLevel) return { correct: true }
  if (option === selectedOption.value && option !== q.correctLevel) return { incorrect: true }
  return { dimmed: true }
}

function answer(option) {
  if (answered.value || phase.value !== 'playing') return
  const q = currentQuestion()
  if (!q) return
  answered.value = true
  selectedOption.value = option
  const correct = option === q.correctLevel
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
  clearAdvanceTimer()
  phase.value = 'finished'
  logActivity({
    skill: 'lettura',
    mode: 'indovina-livello',
    score: score.value,
    total: questions.value.length,
  })
}

function startRound() {
  clearAdvanceTimer()
  questions.value = buildQuestions()
  currentIndex.value = 0
  score.value = 0
  answered.value = false
  selectedOption.value = null
  lastAnswerCorrect.value = null
  phase.value = 'playing'
}
</script>

<template>
  <div class="il-card">
    <header class="il-header">
      <h3 class="il-title">Indovina il livello</h3>
      <p class="il-subtitle">Leggi l'estratto e indovina il livello CECR del testo.</p>
    </header>

    <div v-if="phase === 'error'" class="il-panel il-state">
      <p>Non ci sono abbastanza testi disponibili per giocare al momento.</p>
    </div>

    <div v-else-if="phase === 'start'" class="il-panel il-state">
      <p class="il-intro">
        Ti mostriamo 10 brevi estratti tratti dai testi del catalogo. Per ognuno, indovina
        se è di livello A1, A2, B1, B2, C1 o C2. Rispondi con calma, non c'è un timer.
      </p>
      <button class="il-btn il-btn--primary" type="button" @click="startRound">Inizia</button>
    </div>

    <div v-else-if="phase === 'playing' && currentQuestion()" class="il-panel">
      <div class="il-progress-row">
        <span class="il-counter">{{ currentIndex + 1 }}/{{ questions.length }}</span>
        <span class="il-score">Punteggio: {{ score }}</span>
      </div>

      <div
        class="il-excerpt-box"
        :class="{
          'il-flash-correct': answered && lastAnswerCorrect === true,
          'il-flash-wrong': answered && lastAnswerCorrect === false,
        }"
      >
        <p class="il-excerpt">{{ currentQuestion().excerpt }}</p>
      </div>

      <div v-if="answered" class="il-feedback">
        <span v-if="lastAnswerCorrect">Corretto! È livello {{ currentQuestion().correctLevel }}.</span>
        <span v-else>
          Sbagliato — il livello giusto è <strong>{{ currentQuestion().correctLevel }}</strong>
        </span>
      </div>

      <div class="il-options">
        <button
          v-for="option in currentQuestion().options"
          :key="option"
          type="button"
          class="il-option"
          :class="optionClass(option)"
          :disabled="answered"
          @click="answer(option)"
        >
          {{ option }}
        </button>
      </div>
    </div>

    <div v-else-if="phase === 'finished'" class="il-panel il-state">
      <p class="il-final-score">{{ score }}/{{ questions.length }}</p>
      <p v-if="score >= 8">Ottimo lavoro, hai un ottimo intuito per i livelli!</p>
      <p v-else-if="score >= 5">Non male, continua a esercitarti.</p>
      <p v-else>Continua a leggere, il tuo occhio migliorerà.</p>
      <button class="il-btn il-btn--primary" type="button" @click="startRound">Rigioca</button>
    </div>
  </div>
</template>

<style scoped>
.il-card {
  background: #faf6f0;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.5rem;
  max-width: 480px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.il-header {
  margin-bottom: 1rem;
}

.il-title {
  margin: 0 0 0.25rem;
  font-size: 1.2rem;
  color: #2c2620;
}

.il-subtitle {
  margin: 0;
  font-size: 0.9rem;
  color: #6b6055;
}

.il-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.il-state {
  text-align: center;
  align-items: center;
  padding: 1rem 0;
}

.il-intro {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
  text-align: left;
}

.il-btn {
  border: none;
  border-radius: 999px;
  padding: 0.65rem 1.4rem;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

.il-btn--primary {
  background: #b0692e;
  color: #fff;
}

.il-btn--primary:hover {
  background: #995c28;
}

.il-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
}

.il-counter {
  font-weight: 600;
}

.il-score {
  color: #6b6055;
}

.il-excerpt-box {
  padding: 1.25rem 1.1rem;
  border-radius: 12px;
  background: rgba(176, 105, 46, 0.06);
  transition: background-color 0.2s ease;
}

.il-excerpt-box.il-flash-correct {
  background: #e4f2e2;
}

.il-excerpt-box.il-flash-wrong {
  background: #f7e4e0;
}

.il-excerpt {
  margin: 0;
  font-style: italic;
  font-size: 1.05rem;
  line-height: 1.6;
}

.il-feedback {
  text-align: center;
  min-height: 1.4rem;
  font-size: 0.9rem;
}

.il-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.6rem;
}

.il-option {
  background: #fff;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 999px;
  padding: 0.65rem 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
}

.il-option:hover:not(:disabled) {
  background: #f3e9dd;
  transform: translateY(-1px);
}

.il-option:disabled {
  cursor: default;
}

.il-option.correct {
  background: #e4f2e2;
  border-color: #2f6b2f;
  color: #2f6b2f;
}

.il-option.incorrect {
  background: #f7e4e0;
  border-color: #a5382a;
  color: #a5382a;
}

.il-option.dimmed {
  opacity: 0.55;
}

.il-final-score {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0.5rem 0;
  color: #b0692e;
}

@media (max-width: 360px) {
  .il-card {
    padding: 1rem;
  }

  .il-options {
    grid-template-columns: repeat(2, 1fr);
  }

  .il-excerpt {
    font-size: 0.95rem;
  }
}
</style>
