<script setup>
import { ref, onMounted } from 'vue'
import { getConjugation } from '../../lib/dictionary.js'
import { logActivity } from '../../progress.js'

const QUESTION_COUNT = 10
const FEEDBACK_DELAY = 800 // ms
const MIN_USABLE_VERBS = 6

const VERBS = [
  'essere', 'avere', 'andare', 'fare', 'dire', 'stare', 'dare', 'potere',
  'dovere', 'volere', 'venire', 'uscire', 'bere', 'sapere', 'tenere',
  'rimanere', 'salire', 'porre',
]

const PRONOUNS = ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro']

// Phases : 'loading' | 'error' | 'start' | 'playing' | 'finished'
const phase = ref('loading')

const verbForms = ref({}) // { lemma: { io, tu, 'lui/lei', noi, voi, loro } }
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

async function loadVerbs() {
  phase.value = 'loading'
  try {
    const results = await Promise.all(
      VERBS.map(async (lemma) => {
        try {
          const conj = await getConjugation(lemma)
          if (conj && conj.presente) {
            return [lemma, conj.presente]
          }
        } catch {
          // ignoré : le verbe est simplement écarté du pool
        }
        return null
      })
    )
    const map = {}
    for (const entry of results) {
      if (entry) map[entry[0]] = entry[1]
    }
    verbForms.value = map
    if (Object.keys(map).length < MIN_USABLE_VERBS) {
      phase.value = 'error'
      return
    }
    phase.value = 'start'
  } catch {
    phase.value = 'error'
  }
}

function buildQuestion() {
  const lemmas = Object.keys(verbForms.value)
  let guard = 0
  while (guard < 200) {
    guard++
    const lemma = lemmas[Math.floor(Math.random() * lemmas.length)]
    const forms = verbForms.value[lemma]
    const availablePronouns = PRONOUNS.filter((p) => forms[p])
    if (availablePronouns.length === 0) continue
    const pronoun = availablePronouns[Math.floor(Math.random() * availablePronouns.length)]
    const correctForm = forms[pronoun]

    const candidates = lemmas.filter((l) => {
      if (l === lemma) return false
      const otherForm = verbForms.value[l][pronoun]
      return otherForm && otherForm !== correctForm
    })
    if (candidates.length < 3) continue

    const distractors = shuffle(candidates)
      .slice(0, 3)
      .map((l) => verbForms.value[l][pronoun])

    const options = shuffle([correctForm, ...distractors])

    return { lemma, pronoun, correctForm, options }
  }
  return null
}

function buildQuestions() {
  const built = []
  for (let i = 0; i < QUESTION_COUNT; i++) {
    const q = buildQuestion()
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

function answer(choice) {
  if (answered.value || phase.value !== 'playing') return
  answered.value = true
  selectedOption.value = choice
  const q = questions.value[currentIndex.value]
  const correct = choice === q.correctForm
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
  logActivity({ skill: 'grammatica', mode: 'verbi-irregolari', score: score.value, total: QUESTION_COUNT })
}

function startRound() {
  const built = buildQuestions()
  if (built.length === 0) {
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
  loadVerbs()
})
</script>

<template>
  <div class="vi-card">
    <div class="vi-header">
      <h3 class="vi-title">Verbi irregolari</h3>
      <p class="vi-subtitle">Scegli la forma corretta del presente indicativo.</p>
    </div>

    <div v-if="phase === 'loading'" class="vi-state">
      <p>Caricamento dei verbi…</p>
    </div>

    <div v-else-if="phase === 'error'" class="vi-state">
      <p>Impossibile caricare i verbi irregolari. Riprova più tardi.</p>
    </div>

    <div v-else-if="phase === 'start'" class="vi-state">
      <p>Rispondi a 10 domande sulla coniugazione al presente dei verbi irregolari più comuni.</p>
      <button class="vi-btn vi-btn-primary" type="button" @click="startRound">Inizia</button>
    </div>

    <div v-else-if="phase === 'playing' && questions[currentIndex]" class="vi-play">
      <div class="vi-progress-row">
        <span class="vi-counter">{{ currentIndex + 1 }}/{{ questions.length }}</span>
        <span class="vi-score">Punteggio: {{ score }}</span>
      </div>

      <div
        class="vi-question"
        :class="{
          'vi-flash-correct': answered && lastAnswerCorrect === true,
          'vi-flash-wrong': answered && lastAnswerCorrect === false,
        }"
      >
        <div class="vi-verb">{{ questions[currentIndex].lemma }} — {{ questions[currentIndex].pronoun }}</div>
        <div class="vi-tense">Presente</div>
      </div>

      <div class="vi-options">
        <button
          v-for="option in questions[currentIndex].options"
          :key="option"
          type="button"
          class="vi-option"
          :class="{
            'vi-option-correct': answered && option === questions[currentIndex].correctForm,
            'vi-option-wrong': answered && option === selectedOption && option !== questions[currentIndex].correctForm,
          }"
          :disabled="answered"
          @click="answer(option)"
        >
          {{ option }}
        </button>
      </div>
    </div>

    <div v-else-if="phase === 'finished'" class="vi-state">
      <p class="vi-final-score">{{ score }}/{{ QUESTION_COUNT }}</p>
      <p v-if="score >= 8">Ottimo lavoro!</p>
      <p v-else-if="score >= 5">Non male, continua così.</p>
      <p v-else>Continua a esercitarti, migliorerai.</p>
      <button class="vi-btn vi-btn-primary" type="button" @click="startRound">Rigioca</button>
    </div>
  </div>
</template>

<style scoped>
.vi-card {
  background: #faf6f0;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.5rem;
  max-width: 480px;
  margin: 0 auto;
  box-sizing: border-box;
}

.vi-header {
  margin-bottom: 1rem;
}

.vi-title {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
}

.vi-subtitle {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.8;
}

.vi-state {
  text-align: center;
  padding: 1rem 0;
}

.vi-final-score {
  font-size: 2.5rem;
  font-weight: 700;
  margin: 0.5rem 0;
  color: #b0692e;
}

.vi-btn {
  border-radius: 10px;
  border: 1px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #2c2620;
  font-size: 1rem;
  padding: 0.65rem 1.1rem;
  cursor: pointer;
  transition: transform 0.1s ease, background 0.15s ease;
}

.vi-btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.vi-btn-primary {
  background: #b0692e;
  border-color: #b0692e;
  color: #fff;
  margin-top: 0.75rem;
}

.vi-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
}

.vi-counter {
  font-weight: 600;
}

.vi-score {
  opacity: 0.8;
}

.vi-question {
  text-align: center;
  padding: 1.5rem 1rem;
  border-radius: 12px;
  background: rgba(176, 105, 46, 0.06);
  margin-bottom: 1rem;
  transition: background-color 0.2s ease;
}

.vi-question.vi-flash-correct {
  background: #e4f2e2;
}

.vi-question.vi-flash-wrong {
  background: #f7e4e0;
}

.vi-verb {
  font-size: 1.4rem;
  font-weight: 700;
}

.vi-tense {
  font-size: 0.9rem;
  opacity: 0.7;
  margin-top: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.vi-options {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.vi-option {
  border-radius: 10px;
  border: 1px solid rgba(176, 105, 46, 0.35);
  background: #fff;
  color: #2c2620;
  font-size: 1.05rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  text-align: center;
  transition: transform 0.1s ease, background 0.15s ease, border-color 0.15s ease;
}

.vi-option:hover:not(:disabled) {
  transform: translateY(-1px);
}

.vi-option:disabled {
  cursor: default;
}

.vi-option-correct {
  background: #e4f2e2;
  border: 2px solid #2f6b2f;
  color: #2f6b2f;
  font-weight: 600;
}

.vi-option-wrong {
  background: #f7e4e0;
  border: 2px solid #a5382a;
  color: #a5382a;
  font-weight: 600;
}

@media (max-width: 360px) {
  .vi-card {
    padding: 1rem;
  }

  .vi-verb {
    font-size: 1.15rem;
  }

  .vi-option {
    font-size: 0.95rem;
    padding: 0.65rem 0.75rem;
  }
}
</style>
