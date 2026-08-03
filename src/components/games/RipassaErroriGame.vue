<script setup>
import { ref, computed } from 'vue'
import { dueErrorCards, reviewErrorCard, logActivity } from '../../progress.js'
import { buildExercise, checkExerciseAnswer } from '../../lib/errorExercises.js'

const ROUND_CAP = 10

// Fasi: 'start' | 'empty' | 'playing' | 'finished'
const phase = ref('start')

const exercises = ref([])
const currentIndex = ref(0)
const score = ref(0)
const streak = ref(0)

const attempt = ref('')
const feedback = ref(null) // null | 'correct' | 'wrong'
const revealed = ref(false)

const currentExercise = computed(() => exercises.value[currentIndex.value] || null)

function buildRound() {
  const due = dueErrorCards().slice(0, ROUND_CAP)
  return due.map((card) => buildExercise(card))
}

function startRound() {
  const round = buildRound()
  if (round.length < 1) {
    phase.value = 'empty'
    return
  }
  exercises.value = round
  currentIndex.value = 0
  score.value = 0
  streak.value = 0
  attempt.value = ''
  feedback.value = null
  revealed.value = false
  phase.value = 'playing'
}

function submitAttempt(rawAttempt) {
  if (revealed.value || !currentExercise.value) return
  const exercise = currentExercise.value
  const correct = checkExerciseAnswer(exercise, rawAttempt)
  reviewErrorCard(exercise.card.id, correct)
  if (correct) {
    score.value++
    streak.value++
  } else {
    streak.value = 0
  }
  attempt.value = rawAttempt
  feedback.value = correct ? 'correct' : 'wrong'
  revealed.value = true
}

function submitTyped() {
  if (!attempt.value.trim()) return
  submitAttempt(attempt.value.trim())
}

function chooseOption(option) {
  submitAttempt(option)
}

function next() {
  if (currentIndex.value + 1 >= exercises.value.length) {
    finishRound()
    return
  }
  currentIndex.value++
  attempt.value = ''
  feedback.value = null
  revealed.value = false
}

function finishRound() {
  logActivity({ skill: 'lessico', mode: 'ripassa-errori', score: score.value, total: exercises.value.length })
  phase.value = 'finished'
}

function correctAnswerText(exercise) {
  if (!exercise) return ''
  return exercise.kind === 'chooseBetween' ? exercise.correct : exercise.answer
}

startRound()
</script>

<template>
  <div class="re-card">
    <div class="re-header">
      <h3 class="re-title">Ripassa i tuoi errori</h3>
      <p class="re-subtitle">Rimetti alla prova le correzioni che hai già ricevuto su Scrivi.</p>
    </div>

    <div v-if="phase === 'empty'" class="re-state">
      <p>
        Nessun errore da ripassare per il momento — bravo! Torna a scrivere su Scrivi per
        generare nuove correzioni, o riprova più tardi.
      </p>
    </div>

    <div v-else-if="phase === 'playing' && currentExercise" class="re-play">
      <div class="re-progress-row">
        <span class="re-counter">{{ currentIndex + 1 }}/{{ exercises.length }}</span>
        <span class="re-score">Punteggio: {{ score }}</span>
        <span v-if="streak > 1" class="re-streak">🔥 {{ streak }}</span>
      </div>

      <div
        class="re-exercise"
        :class="{ 're-flash-correct': revealed && feedback === 'correct', 're-flash-wrong': revealed && feedback === 'wrong' }"
      >
        <template v-if="currentExercise.kind === 'chooseBetween'">
          <p class="re-context">{{ currentExercise.card.original }}</p>
          <div class="re-options">
            <button
              v-for="opt in currentExercise.options"
              :key="opt"
              type="button"
              class="re-btn re-option"
              :class="{
                're-option-correct': revealed && opt === currentExercise.correct,
                're-option-wrong': revealed && attempt === opt && opt !== currentExercise.correct,
              }"
              :disabled="revealed"
              @click="chooseOption(opt)"
            >
              {{ opt }}
            </button>
          </div>
        </template>

        <template v-else>
          <p class="re-prompt">{{ currentExercise.prompt }}</p>
          <label v-if="!revealed" class="re-input">
            <input
              v-model="attempt"
              type="text"
              autocomplete="off"
              :placeholder="currentExercise.kind === 'fillBlank' ? 'Completa la parola mancante…' : 'Correggi la frase…'"
              @keyup.enter="submitTyped"
            />
          </label>
        </template>
      </div>

      <div v-if="revealed" class="re-feedback" :class="feedback">
        <span v-if="feedback === 'correct'">✓ Corretto!</span>
        <span v-else>
          Non proprio — la risposta corretta è
          <strong>{{ correctAnswerText(currentExercise) }}</strong>
        </span>
      </div>

      <p v-if="currentExercise.card.explanation && revealed" class="re-explanation">
        {{ currentExercise.card.explanation }}
      </p>

      <div class="re-actions">
        <button
          v-if="!revealed && currentExercise.kind !== 'chooseBetween'"
          type="button"
          class="re-btn re-btn-primary"
          :disabled="!attempt.trim()"
          @click="submitTyped"
        >
          Verifica
        </button>
        <button v-if="revealed" type="button" class="re-btn re-btn-primary" @click="next">
          Prossimo
        </button>
      </div>
    </div>

    <div v-else-if="phase === 'finished'" class="re-state">
      <p class="re-final-score">{{ score }}/{{ exercises.length }}</p>
      <p v-if="score === exercises.length">Perfetto, tutte corrette!</p>
      <p v-else-if="score >= exercises.length * 0.7">Ottimo ripasso!</p>
      <p v-else>Continua a ripassare, i tuoi errori diventeranno punti di forza.</p>
      <button class="re-btn re-btn-primary" type="button" @click="startRound">Rigioca</button>
    </div>
  </div>
</template>

<style scoped>
.re-card {
  background: #faf6f0;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.5rem;
  max-width: 480px;
  margin: 0 auto;
  box-sizing: border-box;
}

.re-header {
  margin-bottom: 1rem;
}

.re-title {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
}

.re-subtitle {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.8;
}

.re-state {
  text-align: center;
  padding: 1rem 0;
}

.re-final-score {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0.5rem 0;
  color: #b0692e;
}

.re-btn {
  border-radius: 10px;
  border: 1px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #2c2620;
  font-size: 1rem;
  padding: 0.65rem 1.1rem;
  cursor: pointer;
  transition: transform 0.1s ease, background 0.15s ease;
}

.re-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.re-btn:disabled {
  cursor: default;
  opacity: 0.6;
}

.re-btn-primary {
  background: #b0692e;
  border-color: #b0692e;
  color: #fff;
  margin-top: 0.75rem;
}

.re-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
}

.re-counter {
  font-weight: 600;
}

.re-score {
  opacity: 0.8;
}

.re-streak {
  font-weight: 600;
  color: #b0692e;
}

.re-exercise {
  text-align: center;
  padding: 1.5rem 1rem;
  border-radius: 12px;
  background: rgba(176, 105, 46, 0.06);
  margin-bottom: 0.75rem;
  transition: background-color 0.2s ease;
}

.re-exercise.re-flash-correct {
  background: #e4f2e2;
}

.re-exercise.re-flash-wrong {
  background: #f7e4e0;
}

.re-context {
  font-size: 0.85rem;
  opacity: 0.7;
  margin: 0 0 0.75rem;
  font-style: italic;
}

.re-prompt {
  font-size: 1.15rem;
  font-weight: 600;
  margin: 0 0 1rem;
}

.re-input input {
  width: 100%;
  box-sizing: border-box;
  border-radius: 10px;
  border: 1px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #2c2620;
  font-size: 1rem;
  padding: 0.65rem 0.85rem;
}

.re-input input:focus {
  outline: 2px solid #b0692e;
  outline-offset: 1px;
}

.re-options {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.re-option {
  width: 100%;
  text-align: left;
}

.re-option-correct {
  background: #e4f2e2;
  border: 2px solid #2f6b2f;
  color: #2f6b2f;
}

.re-option-wrong {
  background: #f7e4e0;
  border: 2px solid #a5382a;
  color: #a5382a;
}

.re-feedback {
  text-align: center;
  min-height: 1.4rem;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.re-feedback.correct {
  color: #2f6b2f;
}

.re-feedback.wrong {
  color: #a5382a;
}

.re-explanation {
  text-align: center;
  font-size: 0.85rem;
  opacity: 0.75;
  margin: 0 0 0.75rem;
}

.re-actions {
  display: flex;
  justify-content: center;
}

@media (max-width: 360px) {
  .re-card {
    padding: 1rem;
  }

  .re-prompt {
    font-size: 1rem;
  }
}
</style>
