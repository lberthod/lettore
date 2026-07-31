<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  questions: { type: Array, required: true },
})

const emit = defineEmits(['completed'])

// Les options sont mélangées à chaque affichage : on ne peut pas retenir
// « la bonne réponse était la deuxième » d'une tentative à l'autre.
function shuffled() {
  return props.questions.map((q) => {
    const order = q.options
      .map((_, i) => i)
      .sort(() => Math.random() - 0.5)
    return {
      q: q.q,
      options: order.map((i) => q.options[i]),
      correct: order.indexOf(q.correct),
      // Absent sur les vieux textes non backfillés (userTexts Firestore…) :
      // l'affichage doit alors dégrader proprement.
      explanation: q.explanation,
    }
  })
}

const quiz = ref(shuffled())

// answers[qi] = index de l'option choisie, ou null
const answers = ref(props.questions.map(() => null))

const allAnswered = computed(() => answers.value.every((a) => a !== null))
const score = computed(
  () => answers.value.filter((a, qi) => a === quiz.value[qi].correct).length
)

function pick(qi, oi) {
  if (answers.value[qi] !== null) return
  answers.value[qi] = oi
  if (answers.value.every((a) => a !== null)) {
    emit('completed', score.value)
  }
}

function optionClass(qi, oi) {
  const answered = answers.value[qi]
  if (answered === null) return null
  const correct = quiz.value[qi].correct
  if (oi === correct) return 'correct'
  if (oi === answered) return 'wrong'
  return 'dimmed'
}

function reset() {
  quiz.value = shuffled()
  answers.value = props.questions.map(() => null)
}
</script>

<template>
  <section class="quiz">
    <h3>Verifica la comprensione</h3>
    <ol>
      <li v-for="(q, qi) in quiz" :key="qi">
        <p class="question">{{ q.q }}</p>
        <div class="options">
          <button
            v-for="(opt, oi) in q.options"
            :key="oi"
            class="option"
            :class="optionClass(qi, oi)"
            :disabled="answers[qi] !== null"
            @click="pick(qi, oi)"
          >
            {{ opt }}
          </button>
        </div>
        <p v-if="answers[qi] !== null && q.explanation" class="explanation">
          {{ q.explanation }}
        </p>
      </li>
    </ol>
    <div v-if="allAnswered" class="result">
      <p class="score">
        Punteggio : <strong>{{ score }} / {{ questions.length }}</strong>
        <span v-if="score === questions.length"> — Perfetto ! 🎉</span>
        <span v-else-if="score >= questions.length - 1"> — Molto bene !</span>
        <span v-else> — Rileggi il testo e riprova.</span>
      </p>
      <button class="retry" @click="reset">Riprova</button>
    </div>
  </section>
</template>

<style scoped>
/* Affiché dans l'overlay du lecteur : le panneau fournit le cadre */
.quiz {
  margin: 0;
}

h3 {
  margin: 0 0 1.2rem;
  padding-right: 2rem;
  font-size: 1.3rem;
  font-weight: 400;
  letter-spacing: 0.5px;
  color: #2c2620;
}

ol {
  margin: 0;
  padding-left: 1.2rem;
}

li {
  margin-bottom: 1.2rem;
}

.question {
  margin: 0 0 0.5rem;
  font-weight: 600;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  align-items: flex-start;
}

.option {
  text-align: left;
  padding: 0.45rem 0.9rem;
  border: 1px solid #d8cfc2;
  border-radius: 8px;
  background: #faf6f0;
  color: inherit;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.option:hover:not(:disabled) {
  border-color: #b0692e;
  background: #f0e9df;
}

.option:disabled {
  cursor: default;
}

.option.correct {
  background: #e3f0e6;
  border-color: #4a7c59;
  color: #35674a;
  font-weight: 600;
}

.option.wrong {
  background: #f8e3de;
  border-color: #a34430;
  color: #a34430;
}

.option.dimmed {
  opacity: 0.5;
}

.explanation {
  margin: 0.5rem 0 0;
  padding: 0.45rem 0.9rem;
  border-left: 3px solid #b0692e;
  border-radius: 0 8px 8px 0;
  background: #f0e9df;
  color: #5a4a38;
  font-size: 0.9rem;
}

.result {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-top: 0.8rem;
  border-top: 1px solid #e4dccf;
}

.score {
  margin: 0;
}

.retry {
  padding: 0.35rem 0.9rem;
  border: 1px solid #b0692e;
  border-radius: 999px;
  background: #fff;
  color: #b0692e;
  font-weight: 600;
  cursor: pointer;
}

.retry:hover {
  background: #f0e9df;
}
</style>
