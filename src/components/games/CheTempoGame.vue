<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { allVerbs, getConjugation } from '../../lib/dictionary.js'
import { logActivity } from '../../progress.js'

const QUESTION_COUNT = 10
const FEEDBACK_DELAY = 800 // ms
const MAX_ATTEMPTS = 15

const TENSE_KEYS = [
  'presente',
  'passatoProssimo',
  'imperfetto',
  'futuro',
  'congiuntivoPresente',
  'condizionale',
]

const TENSE_LABELS = {
  presente: 'Presente',
  passatoProssimo: 'Passato prossimo',
  imperfetto: 'Imperfetto',
  futuro: 'Futuro',
  congiuntivoPresente: 'Congiuntivo presente',
  condizionale: 'Condizionale',
}

const PRONOUNS = ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro']

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

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)]
}

async function loadPool() {
  phase.value = 'loading'
  try {
    const verbs = await allVerbs()
    pool.value = verbs.filter((v) => v.lemma && v.lemma.length <= 14)
    if (pool.value.length < 5) {
      phase.value = 'error'
      return
    }
    phase.value = 'start'
  } catch {
    phase.value = 'error'
  }
}

async function buildQuestion() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const verb = pickRandom(pool.value)
    let conjugation
    try {
      conjugation = await getConjugation(verb.lemma)
    } catch {
      conjugation = null
    }
    if (!conjugation) continue

    const availableTenses = TENSE_KEYS.filter((t) => conjugation[t])
    if (availableTenses.length === 0) continue

    const correctTense = pickRandom(availableTenses)
    const tenseForms = conjugation[correctTense]
    const availablePronouns = PRONOUNS.filter(
      (p) => tenseForms[p] !== undefined && tenseForms[p] !== null && tenseForms[p] !== ''
    )
    if (availablePronouns.length === 0) continue

    const pronoun = pickRandom(availablePronouns)
    const form = tenseForms[pronoun]

    const wrongPoolTenses = TENSE_KEYS.filter((t) => t !== correctTense)
    if (wrongPoolTenses.length < 3) continue
    const wrongTenses = shuffle(wrongPoolTenses).slice(0, 3)

    const options = shuffle([correctTense, ...wrongTenses]).map((t) => ({
      key: t,
      label: TENSE_LABELS[t],
    }))

    return {
      lemma: verb.lemma,
      pronoun,
      form,
      correctTense,
      options,
    }
  }
  return null
}

async function buildQuestions() {
  const built = []
  for (let i = 0; i < QUESTION_COUNT; i++) {
    const q = await buildQuestion()
    if (q) built.push(q)
  }
  return built
}

function clearTimers() {
  if (advanceTimeout) {
    clearTimeout(advanceTimeout)
    advanceTimeout = null
  }
}

function answer(optionKey) {
  if (answered.value || phase.value !== 'playing') return
  answered.value = true
  selectedOption.value = optionKey
  const q = questions.value[currentIndex.value]
  const correct = optionKey === q.correctTense
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
  logActivity({ skill: 'grammatica', mode: 'che-tempo', score: score.value, total: QUESTION_COUNT })
}

async function startRound() {
  phase.value = 'loading'
  const built = await buildQuestions()
  if (built.length < QUESTION_COUNT) {
    phase.value = 'error'
    return
  }
  questions.value = built
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
  <div class="ct-card">
    <div class="ct-header">
      <h3 class="ct-title">Che tempo è?</h3>
      <p class="ct-subtitle">Riconosci il tempo verbale della forma mostrata.</p>
    </div>

    <div v-if="phase === 'loading'" class="ct-state">
      <p>Caricamento…</p>
    </div>

    <div v-else-if="phase === 'error'" class="ct-state">
      <p>Impossibile preparare il gioco. Riprova più tardi.</p>
      <button class="ct-btn ct-btn-primary" type="button" @click="loadPool">Riprova</button>
    </div>

    <div v-else-if="phase === 'start'" class="ct-state">
      <p>Rispondi a 10 domande: indovina il tempo verbale della forma proposta.</p>
      <button class="ct-btn ct-btn-primary" type="button" @click="startRound">Inizia</button>
    </div>

    <div v-else-if="phase === 'playing' && questions[currentIndex]" class="ct-play">
      <div class="ct-progress-row">
        <span class="ct-counter">{{ currentIndex + 1 }}/{{ questions.length }}</span>
        <span class="ct-score">Punteggio: {{ score }}</span>
      </div>

      <div class="ct-question">
        <div class="ct-form">{{ questions[currentIndex].pronoun }} {{ questions[currentIndex].form }}</div>
        <div class="ct-hint">Che tempo è?</div>
      </div>

      <div class="ct-options">
        <button
          v-for="opt in questions[currentIndex].options"
          :key="opt.key"
          type="button"
          class="ct-option"
          :class="{
            'ct-option-correct': answered && opt.key === questions[currentIndex].correctTense,
            'ct-option-wrong': answered && selectedOption === opt.key && opt.key !== questions[currentIndex].correctTense,
          }"
          :disabled="answered"
          @click="answer(opt.key)"
        >
          {{ opt.label }}
        </button>
      </div>

      <div v-if="answered" class="ct-feedback">
        <span v-if="lastAnswerCorrect">Corretto!</span>
        <span v-else>
          Sbagliato — il tempo giusto è
          <strong>{{ TENSE_LABELS[questions[currentIndex].correctTense] }}</strong>
        </span>
      </div>
    </div>

    <div v-else-if="phase === 'finished'" class="ct-state">
      <p class="ct-final-score">{{ score }}/{{ QUESTION_COUNT }}</p>
      <p v-if="score >= 8">Ottimo lavoro!</p>
      <p v-else-if="score >= 5">Non male, continua così.</p>
      <p v-else>Continua a esercitarti, migliorerai.</p>
      <button class="ct-btn ct-btn-primary" type="button" @click="startRound">Rigioca</button>
    </div>
  </div>
</template>

<style scoped>
.ct-card {
  background: #faf6f0;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.5rem;
  max-width: 480px;
  margin: 0 auto;
  box-sizing: border-box;
}

.ct-header {
  margin-bottom: 1rem;
}

.ct-title {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
}

.ct-subtitle {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.8;
}

.ct-state {
  text-align: center;
  padding: 1rem 0;
}

.ct-final-score {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0.5rem 0;
  color: #b0692e;
}

.ct-btn {
  border-radius: 10px;
  border: 1px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #2c2620;
  font-size: 1rem;
  padding: 0.65rem 1.1rem;
  cursor: pointer;
  transition: transform 0.1s ease, background 0.15s ease;
}

.ct-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.ct-btn-primary {
  background: #b0692e;
  border-color: #b0692e;
  color: #fff;
  margin-top: 0.75rem;
}

.ct-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.ct-counter {
  font-weight: 600;
}

.ct-score {
  opacity: 0.8;
}

.ct-question {
  text-align: center;
  padding: 1.5rem 1rem;
  border-radius: 12px;
  background: rgba(176, 105, 46, 0.06);
  margin-bottom: 1rem;
}

.ct-form {
  font-size: 1.4rem;
  font-weight: 700;
}

.ct-hint {
  font-size: 0.9rem;
  opacity: 0.7;
  margin-top: 0.5rem;
}

.ct-options {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.ct-option {
  width: 100%;
  text-align: left;
  border-radius: 10px;
  border: 1px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #2c2620;
  font-size: 1rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: transform 0.1s ease, background 0.15s ease, border-color 0.15s ease;
  box-sizing: border-box;
}

.ct-option:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: #b0692e;
}

.ct-option:disabled {
  cursor: default;
}

.ct-option-correct {
  background: #e4f2e2;
  border-color: #2f6b2f;
  color: #2f6b2f;
  font-weight: 600;
}

.ct-option-wrong {
  background: #f7e4e0;
  border-color: #a5382a;
  color: #a5382a;
  font-weight: 600;
}

.ct-feedback {
  text-align: center;
  min-height: 1.4rem;
  font-size: 0.9rem;
  margin-top: 1rem;
}

@media (max-width: 360px) {
  .ct-card {
    padding: 1rem;
  }

  .ct-form {
    font-size: 1.15rem;
  }

  .ct-option {
    font-size: 0.9rem;
    padding: 0.65rem 0.85rem;
  }
}
</style>
