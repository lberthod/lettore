<script setup>
// Mini-jeu de vocabulaire « Anagramma » : un mot italien est mélangé lettre
// par lettre, le joueur doit le retrouver avant la fin d'un compte à rebours
// de 20 secondes. La traduction française sert d'indice.
//
// Composant autonome (aucune prop, aucun état partagé) : il charge lui-même
// le dictionnaire au montage et gère son propre cycle démarrage/partie/fin,
// pour être embarqué tel quel dans une page « Giochi » sans chrome de page.
import { ref, onMounted, onUnmounted } from 'vue'
import { allLemmas } from '../../lib/dictionary.js'
import { logActivity } from '../../progress.js'

const ROUND_SECONDS = 20
const LOW_TIME_THRESHOLD = 5
// Un seul mot par lettre : rejette chiffres, apostrophes, espaces, accents
// isolés inhabituels — garde le mélange de lettres simple et univoque.
const WORD_RE = /^[a-zàèéìòù]{4,9}$/i

const loading = ref(true)
const loadError = ref('')

const pool = ref([])
const currentWord = ref(null) // { lemma, fr }
const scrambled = ref('')
const guess = ref('')
const streak = ref(0)
const bestStreak = ref(0)
const secondsLeft = ref(ROUND_SECONDS)
const roundOver = ref(false) // round résolu (correct ou temps écoulé), en attente du prochain mot
const feedback = ref('') // '' | 'correct' | 'wrong' | 'timeout'
const started = ref(false)

let previousLemma = null
let intervalId = null
let inputEl = null

function normalizeGuess(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les diacritiques
    .trim()
    .toLowerCase()
}

function shuffle(word) {
  const letters = word.split('')
  let attempt = word
  // Reshuffle tant que le résultat correspond exactement à l'original
  // (possible pour les mots courts ou aux lettres très répétées).
  let guardCount = 0
  do {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[letters[i], letters[j]] = [letters[j], letters[i]]
    }
    attempt = letters.join('')
    guardCount++
  } while (attempt === word && guardCount < 20)
  return attempt
}

function pickWord() {
  if (!pool.value.length) return null
  if (pool.value.length === 1) return pool.value[0]
  let candidate
  do {
    candidate = pool.value[Math.floor(Math.random() * pool.value.length)]
  } while (candidate.lemma === previousLemma)
  return candidate
}

function clearTimer() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function startRound() {
  clearTimer()
  const word = pickWord()
  if (!word) return
  previousLemma = word.lemma
  currentWord.value = word
  scrambled.value = shuffle(word.lemma.toLowerCase())
  guess.value = ''
  feedback.value = ''
  roundOver.value = false
  secondsLeft.value = ROUND_SECONDS

  intervalId = setInterval(() => {
    secondsLeft.value -= 1
    if (secondsLeft.value <= 0) {
      endRound(false)
    }
  }, 1000)

  // Le champ n'est monté qu'après le v-if du template ; on le focus au tick
  // suivant via la ref exposée par @vue:mounted (voir template).
}

function endRound(correct) {
  if (roundOver.value) return
  clearTimer()
  roundOver.value = true
  feedback.value = correct ? 'correct' : 'timeout'
  if (correct) {
    streak.value += 1
    bestStreak.value = Math.max(bestStreak.value, streak.value)
  } else {
    streak.value = 0
  }
  logActivity({
    skill: 'lessico',
    mode: 'anagramma',
    score: correct ? 1 : 0,
    total: 1,
  })

  setTimeout(() => {
    if (started.value) startRound()
  }, correct ? 700 : 1600)
}

function submitGuess() {
  if (roundOver.value || !currentWord.value) return
  if (!guess.value.trim()) return
  const isCorrect = normalizeGuess(guess.value) === normalizeGuess(currentWord.value.lemma)
  if (isCorrect) {
    endRound(true)
  } else {
    feedback.value = 'wrong'
    // Le flash d'erreur s'efface tout seul pour permettre un nouvel essai.
    setTimeout(() => {
      if (feedback.value === 'wrong') feedback.value = ''
    }, 500)
  }
}

function newGame() {
  streak.value = 0
  bestStreak.value = 0
  previousLemma = null
  started.value = true
  startRound()
}

function focusInput(el) {
  inputEl = el
  if (el) el.focus()
}

onMounted(async () => {
  try {
    const lemmas = await allLemmas()
    pool.value = lemmas.filter(
      (l) => l.lemma && !l.lemma.includes(' ') && WORD_RE.test(l.lemma)
    )
    if (!pool.value.length) {
      loadError.value = 'Aucun mot disponible pour ce jeu.'
    }
  } catch {
    loadError.value = 'Impossible de charger le dictionnaire.'
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  clearTimer()
})
</script>

<template>
  <div class="anagramma-card">
    <header class="header">
      <h3>Anagramma</h3>
      <p class="subtitle">Remets les lettres dans l'ordre avant la fin du temps.</p>
    </header>

    <div v-if="loading" class="state-msg">Chargement…</div>
    <div v-else-if="loadError" class="state-msg error-msg">{{ loadError }}</div>

    <div v-else-if="!started" class="start-screen">
      <button type="button" class="primary-btn" @click="newGame">Nuova partita</button>
    </div>

    <div v-else class="game">
      <div class="stats">
        <div class="stat">
          <span class="stat-label">Serie</span>
          <span class="stat-value">{{ streak }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Record</span>
          <span class="stat-value">{{ bestStreak }}</span>
        </div>
      </div>

      <div
        class="timer-bar-track"
        role="progressbar"
        :aria-valuenow="secondsLeft"
        aria-valuemin="0"
        :aria-valuemax="ROUND_SECONDS"
      >
        <div
          class="timer-bar-fill"
          :class="{ low: secondsLeft <= LOW_TIME_THRESHOLD }"
          :style="{ width: (secondsLeft / ROUND_SECONDS) * 100 + '%' }"
        ></div>
      </div>
      <p class="timer-label" :class="{ low: secondsLeft <= LOW_TIME_THRESHOLD }">
        {{ secondsLeft }} s
      </p>

      <p class="hint">Indizio (FR) : <strong>{{ currentWord?.fr }}</strong></p>

      <div class="tiles" aria-hidden="true">
        <span v-for="(letter, i) in scrambled.split('')" :key="i" class="tile">{{
          letter
        }}</span>
      </div>

      <form class="guess-form" @submit.prevent="submitGuess">
        <input
          :ref="focusInput"
          v-model="guess"
          type="text"
          class="guess-input"
          :class="{ shake: feedback === 'wrong' }"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="La tua risposta…"
          :disabled="roundOver"
        />
        <button type="submit" class="primary-btn" :disabled="roundOver">Verifica</button>
      </form>

      <p v-if="feedback === 'correct'" class="feedback success">Esatto! 🎉</p>
      <p v-if="feedback === 'wrong'" class="feedback danger">Riprova…</p>
      <p v-if="feedback === 'timeout'" class="feedback danger">
        Tempo scaduto! La parola era: <strong>{{ currentWord?.lemma }}</strong>
      </p>

      <button type="button" class="reset-btn" @click="newGame">Nuova partita</button>
    </div>
  </div>
</template>

<style scoped>
.anagramma-card {
  background: #faf6f0;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.5rem;
  max-width: 420px;
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
}

.header {
  margin-bottom: 1rem;
}

.header h3 {
  margin: 0 0 0.25rem;
  font-size: 1.2rem;
}

.subtitle {
  margin: 0;
  font-size: 0.85rem;
  color: #6b6156;
}

.state-msg {
  padding: 1rem 0;
  font-size: 0.95rem;
  color: #6b6156;
}

.error-msg {
  color: #a5382a;
}

.start-screen {
  display: flex;
  justify-content: center;
  padding: 1rem 0;
}

.stats {
  display: flex;
  gap: 1.5rem;
  margin-bottom: 0.75rem;
}

.stat {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 0.75rem;
  color: #6b6156;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.stat-value {
  font-size: 1.3rem;
  font-weight: 700;
  color: #b0692e;
}

.timer-bar-track {
  width: 100%;
  height: 8px;
  background: rgba(176, 105, 46, 0.12);
  border-radius: 999px;
  overflow: hidden;
}

.timer-bar-fill {
  height: 100%;
  background: #b0692e;
  border-radius: 999px;
  transition: width 1s linear, background-color 0.2s ease;
}

.timer-bar-fill.low {
  background: #a5382a;
}

.timer-label {
  margin: 0.3rem 0 0;
  text-align: right;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
  color: #6b6156;
}

.timer-label.low {
  color: #a5382a;
  font-weight: 700;
}

.hint {
  margin: 1rem 0 0.5rem;
  font-size: 0.95rem;
}

.tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin: 0.75rem 0 1rem;
}

.tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2.4rem;
  padding: 0 0.3rem;
  background: #fff;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 8px;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #2c2620;
}

.guess-form {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.guess-input {
  flex: 1 1 10rem;
  min-width: 0;
  padding: 0.55rem 0.8rem;
  border: 1px solid rgba(176, 105, 46, 0.35);
  border-radius: 8px;
  background: #fff;
  color: #2c2620;
  font: inherit;
  font-size: 1rem;
}

.guess-input:focus {
  outline: none;
  border-color: #b0692e;
}

.guess-input.shake {
  animation: shake 0.35s ease;
  border-color: #a5382a;
  background: #f7e4e0;
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-6px);
  }
  40% {
    transform: translateX(6px);
  }
  60% {
    transform: translateX(-4px);
  }
  80% {
    transform: translateX(4px);
  }
}

.primary-btn {
  padding: 0.55rem 1.2rem;
  border: none;
  border-radius: 8px;
  background: #b0692e;
  color: #fff;
  font: inherit;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.12s;
}

.primary-btn:hover:not(:disabled) {
  background: #9a5a26;
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.feedback {
  margin: 0.75rem 0 0;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  font-size: 0.9rem;
}

.feedback.success {
  background: #e4f2e2;
  color: #2f6b2f;
}

.feedback.danger {
  background: #f7e4e0;
  color: #a5382a;
}

.reset-btn {
  display: block;
  margin: 1rem 0 0;
  padding: 0.4rem 0.9rem;
  border: 1px solid rgba(176, 105, 46, 0.35);
  border-radius: 999px;
  background: transparent;
  color: #b0692e;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.reset-btn:hover {
  background: rgba(176, 105, 46, 0.08);
  border-color: #b0692e;
}

@media (max-width: 360px) {
  .anagramma-card {
    padding: 1rem;
  }

  .tile {
    min-width: 1.7rem;
    height: 2.1rem;
    font-size: 1.15rem;
  }

  .guess-form {
    flex-direction: column;
  }

  .primary-btn {
    width: 100%;
  }
}
</style>
