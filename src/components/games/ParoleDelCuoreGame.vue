<script setup>
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { progress, logActivity } from '../../progress.js'

const MIN_FAVORITES = 4
const MAX_QUESTIONS = 10
const FEEDBACK_DELAY = 800 // ms

// Phases : 'empty' | 'start' | 'playing' | 'finished'
const phase = ref('start')

const questions = ref([])
const currentIndex = ref(0)
const score = ref(0)

const answered = ref(false)
const selectedOption = ref(null)
const lastAnswerCorrect = ref(null)

let advanceTimeout = null

const favorites = computed(() => progress.favorites || [])

const hasEnoughFavorites = computed(() => favorites.value.length >= MIN_FAVORITES)

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
  const pool = favorites.value.filter((f) => f.word && f.translation)
  const roundLength = Math.min(MAX_QUESTIONS, pool.length)
  const chosen = sampleDistinct(pool, roundLength)

  return chosen.map((entry) => {
    // Traductions distinctes des autres favoris, pour servir de leurres.
    const otherTranslations = [
      ...new Set(
        pool
          .filter((f) => f.translation !== entry.translation)
          .map((f) => f.translation)
      ),
    ]
    const wrongOptions = sampleDistinct(otherTranslations, 3)
    const options = shuffle([entry.translation, ...wrongOptions])
    return {
      word: entry.word,
      translation: entry.translation,
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
  const correct = option === q.translation
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
  logActivity({
    skill: 'lessico',
    mode: 'parole-del-cuore',
    score: score.value,
    total: questions.value.length,
  })
}

function startRound() {
  if (!hasEnoughFavorites.value) {
    phase.value = 'empty'
    return
  }
  clearTimers()
  questions.value = buildQuestions()
  currentIndex.value = 0
  score.value = 0
  answered.value = false
  selectedOption.value = null
  lastAnswerCorrect.value = null
  phase.value = 'playing'
}

if (!hasEnoughFavorites.value) {
  phase.value = 'empty'
}
</script>

<template>
  <div class="pdc-card">
    <div class="pdc-header">
      <h3 class="pdc-title">Parole del cuore</h3>
      <p class="pdc-subtitle">Indovina la traduzione delle tue parole preferite.</p>
    </div>

    <div v-if="phase === 'empty'" class="pdc-empty">
      <div class="pdc-empty-icon">💛</div>
      <p class="pdc-empty-text">
        Ti servono almeno {{ MIN_FAVORITES }} parole preferite per giocare.
        Aggiungi qualche parola ai preferiti mentre leggi un testo (tocca la
        stellina accanto a una parola), poi torna qui per metterti alla prova.
      </p>
      <p class="pdc-empty-count">
        Parole preferite salvate: {{ favorites.length }}/{{ MIN_FAVORITES }}
      </p>
      <RouterLink :to="{ name: 'library' }" class="pdc-btn pdc-btn-primary">
        Sfoglia i testi
      </RouterLink>
    </div>

    <div v-else-if="phase === 'start'" class="pdc-state">
      <p>
        Rispondi a {{ Math.min(MAX_QUESTIONS, favorites.length) }} domande
        sulle tue parole preferite, scegliendo la traduzione giusta tra 4
        opzioni. Nessun limite di tempo.
      </p>
      <button class="pdc-btn pdc-btn-primary" type="button" @click="startRound">
        Inizia
      </button>
    </div>

    <div v-else-if="phase === 'playing' && questions[currentIndex]" class="pdc-play">
      <div class="pdc-progress-row">
        <span class="pdc-counter">{{ currentIndex + 1 }}/{{ questions.length }}</span>
        <span class="pdc-score">Punteggio: {{ score }}</span>
      </div>

      <div class="pdc-question">
        <div class="pdc-word">{{ questions[currentIndex].word }}</div>
      </div>

      <div class="pdc-options">
        <button
          v-for="option in questions[currentIndex].options"
          :key="option"
          type="button"
          class="pdc-option"
          :class="{
            'pdc-option-correct': answered && option === questions[currentIndex].translation,
            'pdc-option-wrong': answered && option === selectedOption && option !== questions[currentIndex].translation,
          }"
          :disabled="answered"
          @click="answer(option)"
        >
          {{ option }}
        </button>
      </div>

      <div v-if="answered" class="pdc-feedback">
        <span v-if="lastAnswerCorrect">Corretto!</span>
        <span v-else>
          Sbagliato — la traduzione giusta è
          <strong>{{ questions[currentIndex].translation }}</strong>
        </span>
      </div>
    </div>

    <div v-else-if="phase === 'finished'" class="pdc-state">
      <p class="pdc-final-score">{{ score }}/{{ questions.length }}</p>
      <p v-if="score === questions.length">Perfetto, conosci tutte le tue parole del cuore!</p>
      <p v-else-if="score >= questions.length / 2">Non male, continua così.</p>
      <p v-else>Continua a esercitarti, migliorerai.</p>
      <button class="pdc-btn pdc-btn-primary" type="button" @click="startRound">
        Rigioca
      </button>
    </div>
  </div>
</template>

<style scoped>
.pdc-card {
  background: #faf6f0;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.5rem;
  max-width: 480px;
  margin: 0 auto;
  box-sizing: border-box;
}

.pdc-header {
  margin-bottom: 1rem;
}

.pdc-title {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
}

.pdc-subtitle {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.8;
}

.pdc-state {
  text-align: center;
  padding: 1rem 0;
}

.pdc-final-score {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0.5rem 0;
  color: #b0692e;
}

.pdc-btn {
  display: inline-block;
  border-radius: 10px;
  border: 1px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #2c2620;
  font-size: 1rem;
  padding: 0.65rem 1.1rem;
  cursor: pointer;
  transition: transform 0.1s ease, background 0.15s ease;
  text-decoration: none;
  box-sizing: border-box;
}

.pdc-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.pdc-btn:disabled {
  cursor: default;
  opacity: 0.6;
}

.pdc-btn-primary {
  background: #b0692e;
  border-color: #b0692e;
  color: #fff;
  margin-top: 0.75rem;
}

.pdc-empty {
  text-align: center;
  padding: 1.5rem 0.5rem;
}

.pdc-empty-icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.pdc-empty-text {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  line-height: 1.5;
}

.pdc-empty-count {
  margin: 0 0 0.25rem;
  font-size: 0.85rem;
  opacity: 0.75;
}

.pdc-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.pdc-counter {
  font-weight: 600;
}

.pdc-score {
  opacity: 0.8;
}

.pdc-question {
  text-align: center;
  padding: 1.5rem 1rem;
  border-radius: 12px;
  background: rgba(176, 105, 46, 0.06);
  margin-bottom: 1rem;
}

.pdc-word {
  font-size: 1.5rem;
  font-weight: 700;
}

.pdc-options {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.pdc-option {
  border-radius: 10px;
  border: 1px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #2c2620;
  font-size: 1rem;
  padding: 0.75rem 1rem;
  text-align: left;
  cursor: pointer;
  transition: transform 0.1s ease, background 0.15s ease, border-color 0.15s ease;
}

.pdc-option:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: #b0692e;
}

.pdc-option:disabled {
  cursor: default;
}

.pdc-option-correct {
  background: #e4f2e2;
  border: 2px solid #2f6b2f;
  color: #2f6b2f;
}

.pdc-option-wrong {
  background: #f7e4e0;
  border: 2px solid #a5382a;
  color: #a5382a;
}

.pdc-feedback {
  text-align: center;
  min-height: 1.4rem;
  font-size: 0.9rem;
}

@media (max-width: 360px) {
  .pdc-card {
    padding: 1rem;
  }

  .pdc-word {
    font-size: 1.2rem;
  }

  .pdc-option {
    font-size: 0.9rem;
    padding: 0.65rem 0.75rem;
  }
}
</style>
