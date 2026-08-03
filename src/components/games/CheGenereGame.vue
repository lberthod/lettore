<script setup>
import { ref, onUnmounted } from 'vue'
import textsIndex from '../../texts/index.json'
import { logActivity } from '../../progress.js'

const QUESTION_COUNT = 10
const OPTION_COUNT = 4
const FEEDBACK_DELAY = 800 // ms

const GENRE_LABELS = {
  dialogo: 'Dialogo',
  documentario: 'Documentario',
  fantascienza: 'Fantascienza',
  fiaba: 'Fiaba',
  giallo: 'Giallo',
  lettera_diario: 'Lettera/Diario',
  poesia: 'Poesia',
  pratico: 'Testo pratico',
  racconto: 'Racconto',
  teatro: 'Teatro',
}

function genreLabel(genre) {
  if (GENRE_LABELS[genre]) return GENRE_LABELS[genre]
  if (!genre) return ''
  return genre.charAt(0).toUpperCase() + genre.slice(1).replace(/_/g, ' ')
}

const pool = textsIndex.filter((t) => t.excerpt && t.genre)
const allGenres = [...new Set(pool.map((t) => t.genre))]

// Phases : 'start' | 'playing' | 'finished'
const phase = ref(allGenres.length < OPTION_COUNT ? 'unavailable' : 'start')

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
  return shuffle(list).slice(0, count)
}

function buildQuestions() {
  const chosenTexts = sampleDistinct(pool, QUESTION_COUNT)
  return chosenTexts.map((text) => {
    const correctGenre = text.genre
    const otherGenres = allGenres.filter((g) => g !== correctGenre)
    const wrongGenres = sampleDistinct(otherGenres, OPTION_COUNT - 1)
    const options = shuffle([correctGenre, ...wrongGenres])
    return {
      id: text.id,
      excerpt: text.excerpt,
      correctGenre,
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

function answer(genre) {
  if (answered.value || phase.value !== 'playing') return
  answered.value = true
  selectedOption.value = genre
  const q = questions.value[currentIndex.value]
  const correct = genre === q.correctGenre
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
  logActivity({ skill: 'lettura', mode: 'che-genere', score: score.value, total: QUESTION_COUNT })
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

onUnmounted(() => {
  clearTimers()
})
</script>

<template>
  <div class="cg-card">
    <div class="cg-header">
      <h3 class="cg-title">Che genere?</h3>
      <p class="cg-subtitle">Leggi l'estratto e indovina il genere letterario.</p>
    </div>

    <div v-if="phase === 'unavailable'" class="cg-state">
      <p>Non ci sono abbastanza generi diversi nel catalogo per giocare al momento.</p>
    </div>

    <div v-else-if="phase === 'start'" class="cg-state">
      <p>Indovina il genere letterario di 10 estratti tratti dal catalogo.</p>
      <button class="cg-btn cg-btn-primary" type="button" @click="startRound">Inizia</button>
    </div>

    <div v-else-if="phase === 'playing' && questions[currentIndex]" class="cg-play">
      <div class="cg-progress-row">
        <span class="cg-counter">{{ currentIndex + 1 }}/{{ questions.length }}</span>
        <span class="cg-score">Punteggio: {{ score }}</span>
      </div>

      <div
        class="cg-excerpt"
        :class="{
          'cg-flash-correct': answered && lastAnswerCorrect === true,
          'cg-flash-wrong': answered && lastAnswerCorrect === false,
        }"
      >
        “{{ questions[currentIndex].excerpt }}”
      </div>

      <div class="cg-options">
        <button
          v-for="genre in questions[currentIndex].options"
          :key="genre"
          type="button"
          class="cg-option"
          :class="{
            'cg-option-correct': answered && genre === questions[currentIndex].correctGenre,
            'cg-option-wrong': answered && genre === selectedOption && genre !== questions[currentIndex].correctGenre,
          }"
          :disabled="answered"
          @click="answer(genre)"
        >
          {{ genreLabel(genre) }}
        </button>
      </div>
    </div>

    <div v-else-if="phase === 'finished'" class="cg-state">
      <p class="cg-final-score">{{ score }}/{{ QUESTION_COUNT }}</p>
      <p v-if="score >= 8">Ottimo lavoro!</p>
      <p v-else-if="score >= 5">Non male, continua così.</p>
      <p v-else>Continua a esercitarti, migliorerai.</p>
      <button class="cg-btn cg-btn-primary" type="button" @click="startRound">Rigioca</button>
    </div>
  </div>
</template>

<style scoped>
.cg-card {
  background: #faf6f0;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.5rem;
  max-width: 480px;
  margin: 0 auto;
  box-sizing: border-box;
}

.cg-header {
  margin-bottom: 1rem;
}

.cg-title {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
}

.cg-subtitle {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.8;
}

.cg-state {
  text-align: center;
  padding: 1rem 0;
}

.cg-final-score {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0.5rem 0;
  color: #b0692e;
}

.cg-btn {
  border-radius: 10px;
  border: 1px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #2c2620;
  font-size: 1rem;
  padding: 0.65rem 1.1rem;
  cursor: pointer;
  transition: transform 0.1s ease, background 0.15s ease;
}

.cg-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.cg-btn-primary {
  background: #b0692e;
  border-color: #b0692e;
  color: #fff;
  margin-top: 0.75rem;
}

.cg-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
}

.cg-counter {
  font-weight: 600;
}

.cg-score {
  opacity: 0.8;
}

.cg-excerpt {
  text-align: center;
  font-style: italic;
  padding: 1.25rem 1rem;
  border-radius: 12px;
  background: rgba(176, 105, 46, 0.06);
  margin-bottom: 1.1rem;
  line-height: 1.5;
  transition: background-color 0.2s ease;
}

.cg-excerpt.cg-flash-correct {
  background: #e4f2e2;
}

.cg-excerpt.cg-flash-wrong {
  background: #f7e4e0;
}

.cg-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.cg-option {
  border-radius: 10px;
  border: 2px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #2c2620;
  font-size: 0.95rem;
  font-weight: 600;
  padding: 0.75rem 0.5rem;
  cursor: pointer;
  transition: transform 0.1s ease, background 0.15s ease, border-color 0.15s ease;
}

.cg-option:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: #b0692e;
}

.cg-option:disabled {
  cursor: default;
}

.cg-option.cg-option-correct {
  background: #e4f2e2;
  border-color: #2f6b2f;
  color: #2f6b2f;
}

.cg-option.cg-option-wrong {
  background: #f7e4e0;
  border-color: #a5382a;
  color: #a5382a;
}

@media (max-width: 360px) {
  .cg-card {
    padding: 1rem;
  }

  .cg-options {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }

  .cg-excerpt {
    font-size: 0.95rem;
    padding: 1rem 0.75rem;
  }

  .cg-option {
    font-size: 0.9rem;
    padding: 0.65rem 0.4rem;
  }
}
</style>
