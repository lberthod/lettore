<script setup>
// Mini-jeu autonome « Scala CECR » : le joueur gravit l'échelle des niveaux
// CECR (A1 → C2) en répondant à des questions à choix multiples piochées
// dans la banque partagée avec le test de niveau (levelTestQuestions.js).
// Composant entièrement indépendant : pas de route, pas de props, tout
// l'état vit ici — mais la sélection de question et l'anti-répétition
// viennent de lib/levelTestEngine.js, partagé avec LevelTestView.vue (Sprint
// 3.1 : éliminer la duplication plutôt que garder deux implémentations).

import { ref, computed } from 'vue'
import { LEVELS, pickQuestion as enginePickQuestion } from '../../lib/levelTestEngine.js'
import { logActivity } from '../../progress.js'

const LIVES_START = 3
const CORRECT_TO_ADVANCE = 3

// Phases : 'start' (écran d'accueil) -> 'playing' -> 'reveal' (courte pause
// après une réponse) -> 'levelup' (célébration) -> 'over' (résumé, défaite ou victoire complète).
const phase = ref('start')

const levelIndex = ref(0)
const lives = ref(LIVES_START)
const correctAtLevel = ref(0)
const totalCorrect = ref(0)
const totalAnswered = ref(0)
const highestLevelIndex = ref(0)
const win = ref(false)

const usedByLevel = ref({}) // { [level]: Set(indices déjà posés dans cette tentative) }
const currentQuestion = ref(null)
const currentQuestionLevel = ref(null)
const selectedOption = ref(null)

const currentLevel = computed(() => LEVELS[levelIndex.value])
const highestLevel = computed(() => LEVELS[highestLevelIndex.value])

function nextQuestion() {
  const level = currentLevel.value
  const q = enginePickQuestion(level, usedByLevel.value)
  currentQuestion.value = q
  currentQuestionLevel.value = level
  selectedOption.value = null
  phase.value = 'playing'
}

function startGame() {
  levelIndex.value = 0
  lives.value = LIVES_START
  correctAtLevel.value = 0
  totalCorrect.value = 0
  totalAnswered.value = 0
  highestLevelIndex.value = 0
  win.value = false
  usedByLevel.value = {}
  nextQuestion()
}

function endGame(didWin) {
  win.value = didWin
  phase.value = 'over'
  logActivity({
    skill: 'grammatica',
    mode: 'scala-cecr',
    level: highestLevel.value,
    score: totalCorrect.value,
    total: totalAnswered.value,
  })
}

function selectOption(i) {
  if (phase.value !== 'playing' || !currentQuestion.value) return
  selectedOption.value = i
  totalAnswered.value += 1
  const isCorrect = i === currentQuestion.value.correct
  phase.value = 'reveal'

  if (isCorrect) {
    totalCorrect.value += 1
    correctAtLevel.value += 1
    if (levelIndex.value > highestLevelIndex.value) {
      highestLevelIndex.value = levelIndex.value
    }

    if (correctAtLevel.value >= CORRECT_TO_ADVANCE) {
      // Niveau validé.
      if (levelIndex.value >= LEVELS.length - 1) {
        // C2 vient d'être validé : victoire complète.
        highestLevelIndex.value = levelIndex.value
        setTimeout(() => endGame(true), 900)
        return
      }
      setTimeout(() => {
        levelIndex.value += 1
        correctAtLevel.value = 0
        if (levelIndex.value > highestLevelIndex.value) highestLevelIndex.value = levelIndex.value
        phase.value = 'levelup'
        setTimeout(() => nextQuestion(), 1300)
      }, 700)
      return
    }

    setTimeout(() => nextQuestion(), 900)
  } else {
    lives.value -= 1
    if (lives.value <= 0) {
      setTimeout(() => endGame(false), 1200)
      return
    }
    setTimeout(() => nextQuestion(), 1400)
  }
}

function optionClass(i) {
  if (phase.value !== 'reveal' || !currentQuestion.value) return {}
  const q = currentQuestion.value
  if (i === q.correct) return { correct: true }
  if (i === selectedOption.value && i !== q.correct) return { incorrect: true }
  return { dimmed: true }
}
</script>

<template>
  <div class="scala-cecr-card">
    <header class="scala-header">
      <h3 class="scala-title">Scala CECR</h3>
      <p class="scala-subtitle">Grimpa la scala dei livelli rispondendo bene alle domande.</p>
    </header>

    <!-- Écran d'accueil -->
    <div v-if="phase === 'start'" class="scala-panel scala-start">
      <p class="scala-intro">
        Parti dal livello <strong>A1</strong> con 3 vite. Rispondi correttamente a
        {{ CORRECT_TO_ADVANCE }} domande di fila per salire di livello. Ogni errore ti
        costa una vita. Arrivi fino a C2?
      </p>
      <button class="scala-btn scala-btn--primary" type="button" @click="startGame">
        Inizia
      </button>
    </div>

    <!-- Partie en cours -->
    <div v-else-if="phase === 'playing' || phase === 'reveal'" class="scala-panel">
      <div class="scala-status">
        <span class="level-badge">{{ currentLevel }}</span>
        <div class="scala-lives" aria-label="Vite rimaste">
          <span
            v-for="n in LIVES_START"
            :key="n"
            class="heart"
            :class="{ lost: n > lives }"
          >{{ n <= lives ? '♥' : '♡' }}</span>
        </div>
      </div>

      <div class="scala-progress">
        <div class="scala-progress-track">
          <div
            class="scala-progress-fill"
            :style="{ width: (correctAtLevel / CORRECT_TO_ADVANCE) * 100 + '%' }"
          ></div>
        </div>
        <span class="scala-progress-label">{{ correctAtLevel }}/{{ CORRECT_TO_ADVANCE }} corrette</span>
      </div>

      <div v-if="currentQuestion" class="scala-question">
        <p class="question-text">{{ currentQuestion.q }}</p>
        <ul class="scala-options">
          <li v-for="(opt, i) in currentQuestion.options" :key="i">
            <button
              type="button"
              class="scala-option"
              :class="optionClass(i)"
              :disabled="phase === 'reveal'"
              @click="selectOption(i)"
            >
              {{ opt }}
            </button>
          </li>
        </ul>
      </div>
    </div>

    <!-- Célébration de passage de niveau -->
    <div v-else-if="phase === 'levelup'" class="scala-panel scala-levelup">
      <p class="levelup-emoji">🎉</p>
      <p class="levelup-text">Livello superato!</p>
      <p class="levelup-sub">Ora sei al livello <strong>{{ currentLevel }}</strong></p>
    </div>

    <!-- Fin de partie -->
    <div v-else-if="phase === 'over'" class="scala-panel scala-over">
      <p class="over-title">{{ win ? 'Vittoria completa!' : 'Partita finita' }}</p>
      <p class="over-detail">
        Livello più alto raggiunto: <strong>{{ highestLevel }}</strong>
      </p>
      <p class="over-detail">
        Risposte corrette: <strong>{{ totalCorrect }}</strong> su {{ totalAnswered }}
      </p>
      <button class="scala-btn scala-btn--primary" type="button" @click="startGame">
        Ricomincia
      </button>
    </div>
  </div>
</template>

<style scoped>
.scala-cecr-card {
  background: #faf6f0;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.5rem;
  max-width: 480px;
  width: 100%;
  box-sizing: border-box;
}

.scala-header {
  margin-bottom: 1rem;
}

.scala-title {
  margin: 0 0 0.25rem;
  font-size: 1.15rem;
  color: #2c2620;
}

.scala-subtitle {
  margin: 0;
  font-size: 0.9rem;
  color: #6b6055;
}

.scala-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.scala-intro {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.5;
}

.scala-btn {
  border: none;
  border-radius: 999px;
  padding: 0.65rem 1.4rem;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  align-self: flex-start;
}

.scala-btn--primary {
  background: #b0692e;
  color: #fff;
}

.scala-btn--primary:hover {
  background: #995c28;
}

.scala-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.level-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #b0692e;
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  padding: 0.35rem 0.9rem;
  border-radius: 999px;
}

.scala-lives {
  display: flex;
  gap: 0.25rem;
  font-size: 1.2rem;
  color: #a5382a;
}

.heart.lost {
  color: rgba(165, 56, 42, 0.35);
}

.scala-progress {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.scala-progress-track {
  flex: 1;
  height: 8px;
  background: rgba(176, 105, 46, 0.15);
  border-radius: 999px;
  overflow: hidden;
}

.scala-progress-fill {
  height: 100%;
  background: #b0692e;
  border-radius: 999px;
  transition: width 0.3s ease;
}

.scala-progress-label {
  font-size: 0.8rem;
  color: #6b6055;
  white-space: nowrap;
}

.scala-question {
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

.scala-options {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.scala-option {
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

.scala-option:hover:not(:disabled) {
  background: #f3e9dd;
}

.scala-option:disabled {
  cursor: default;
}

.scala-option.correct {
  background: #e4f2e2;
  border-color: #2f6b2f;
  color: #2f6b2f;
  font-weight: 600;
}

.scala-option.incorrect {
  background: #f7e4e0;
  border-color: #a5382a;
  color: #a5382a;
  font-weight: 600;
}

.scala-option.dimmed {
  opacity: 0.55;
}

.scala-levelup {
  align-items: center;
  text-align: center;
  padding: 1.5rem 0;
  background: #e4f2e2;
  border-radius: 10px;
  color: #2f6b2f;
}

.levelup-emoji {
  margin: 0;
  font-size: 2rem;
}

.levelup-text {
  margin: 0.25rem 0 0;
  font-size: 1.2rem;
  font-weight: 700;
}

.levelup-sub {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
}

.scala-over {
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
  .scala-cecr-card {
    padding: 1rem;
  }

  .scala-status {
    flex-direction: row;
    justify-content: space-between;
  }

  .question-text {
    font-size: 0.95rem;
  }
}
</style>
