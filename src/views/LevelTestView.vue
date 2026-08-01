<script setup>
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { LEVELS, QUESTIONS_BY_LEVEL } from '../data/levelTestQuestions.js'

// Test adaptatif « escalier » : on démarre en A1, une bonne réponse fait
// monter d'un niveau, une mauvaise fait redescendre d'un niveau. On
// s'arrête soit après deux échecs consécutifs au même niveau (le palier est
// trouvé), soit après deux réussites consécutives en C2 (le plafond du
// test est atteint), soit après un nombre maximal de questions (garde-fou).
const MIN_QUESTIONS = 10
const MAX_QUESTIONS = 16

const started = ref(false)
const finished = ref(false)
const levelIndex = ref(0)
const asked = ref(0)
const wrongStreak = ref(0)
const correctStreakAtTop = ref(0)
const history = ref([]) // { level, correct }
const usedByLevel = ref({}) // { A1: Set(indices déjà posées) }
const current = ref(null) // { level, index, q, options, correct }
const picked = ref(null)
const answered = ref(false)

function pickQuestion(level) {
  const bank = QUESTIONS_BY_LEVEL[level]
  const used = usedByLevel.value[level] || new Set()
  let available = bank.map((_, i) => i).filter((i) => !used.has(i))
  // Toutes les questions du niveau ont déjà été posées dans cette tentative
  // (rare avec 16 questions max et 20 par niveau) : on relâche la contrainte.
  if (available.length === 0) available = bank.map((_, i) => i)
  const idx = available[Math.floor(Math.random() * available.length)]
  used.add(idx)
  usedByLevel.value[level] = used
  const q = bank[idx]
  return { level, index: idx, q: q.q, options: q.options, correct: q.correct }
}

function start() {
  started.value = true
  finished.value = false
  levelIndex.value = 0
  asked.value = 0
  wrongStreak.value = 0
  correctStreakAtTop.value = 0
  history.value = []
  usedByLevel.value = {}
  picked.value = null
  answered.value = false
  current.value = pickQuestion(LEVELS[0])
}

function estimateLevel() {
  // Pour chaque niveau, on regarde la proportion de bonnes réponses parmi
  // les questions posées à ce niveau ; le niveau estimé est le plus haut
  // niveau où la majorité des réponses sont correctes.
  const stats = LEVELS.map((level) => {
    const attempts = history.value.filter((h) => h.level === level)
    return {
      level,
      attempts: attempts.length,
      correct: attempts.filter((h) => h.correct).length,
    }
  })
  let estimated = null
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    const s = stats[i]
    if (s.attempts > 0 && s.correct / s.attempts >= 0.5) {
      estimated = LEVELS[i]
      break
    }
  }
  return { estimated, stats }
}

const result = ref(null)

function finish() {
  finished.value = true
  result.value = estimateLevel()
}

function answer(optionIndex) {
  if (answered.value) return
  answered.value = true
  picked.value = optionIndex
  const isCorrect = optionIndex === current.value.correct
  history.value.push({ level: current.value.level, correct: isCorrect })
  asked.value++

  if (isCorrect) {
    wrongStreak.value = 0
    if (levelIndex.value === LEVELS.length - 1) {
      correctStreakAtTop.value++
      if (correctStreakAtTop.value >= 2 || asked.value >= MAX_QUESTIONS) {
        finish()
        return
      }
    } else {
      levelIndex.value++
      correctStreakAtTop.value = 0
    }
  } else {
    correctStreakAtTop.value = 0
    wrongStreak.value++
    if ((wrongStreak.value >= 2 && asked.value >= MIN_QUESTIONS) || asked.value >= MAX_QUESTIONS) {
      finish()
      return
    }
    if (levelIndex.value > 0) levelIndex.value--
  }

  if (asked.value >= MAX_QUESTIONS) {
    finish()
  }
}

function next() {
  answered.value = false
  picked.value = null
  current.value = pickQuestion(LEVELS[levelIndex.value])
}

function restart() {
  start()
}

const progressPct = computed(() => Math.min(100, Math.round((asked.value / MIN_QUESTIONS) * 100)))

const RESULT_MESSAGES = {
  A1: "Vous débutez : les bases (salutations, verbes courants, phrases simples) sont acquises.",
  A2: "Vous vous en sortez dans les situations courantes du quotidien.",
  B1: "Vous êtes autonome : vous comprenez l'essentiel et gérez la plupart des situations.",
  B2: "Bon niveau : vous suivez des discussions complexes et nuancez votre expression.",
  C1: "Niveau avancé : vous maîtrisez les nuances de registre et les tournures idiomatiques.",
  C2: "Niveau proche du natif : vous maîtrisez les subtilités stylistiques et littéraires.",
}
</script>

<template>
  <SceneLayout title="Test de" accent=" niveau" tagline="De A1 à C2, en quelques questions">
    <div v-if="!started" class="intro-panel">
      <p>
        Ce test adaptatif estime votre niveau d'italien selon le <strong>CECR</strong> (A1 à C2).
        Il commence par une question A1 : chaque bonne réponse fait monter le niveau des questions
        suivantes, chaque erreur le fait redescendre. Après une dizaine de questions, le test
        détermine le palier que vous maîtrisez.
      </p>
      <ul class="rules">
        <li>Une seule bonne réponse par question, aucun temps limite.</li>
        <li>Entre {{ MIN_QUESTIONS }} et {{ MAX_QUESTIONS }} questions selon votre parcours.</li>
        <li>Le résultat est une estimation, pas une certification officielle.</li>
      </ul>
      <button class="start-btn" type="button" @click="start">Commencer le test</button>
    </div>

    <div v-else-if="!finished" class="test-panel">
      <div class="test-header">
        <span class="level-chip">Niveau testé : {{ current.level }}</span>
        <span class="q-count">Question {{ asked + 1 }}</span>
      </div>
      <div class="progress-track" aria-hidden="true">
        <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
      </div>

      <p class="question">{{ current.q }}</p>
      <div class="options">
        <button
          v-for="(opt, oi) in current.options"
          :key="oi"
          class="option"
          :class="{
            correct: answered && oi === current.correct,
            wrong: answered && oi === picked && oi !== current.correct,
            dimmed: answered && oi !== current.correct && oi !== picked,
          }"
          :disabled="answered"
          @click="answer(oi)"
        >
          {{ opt }}
        </button>
      </div>

      <button v-if="answered" class="next-btn" type="button" @click="next">Question suivante →</button>
    </div>

    <div v-else class="result-panel">
      <template v-if="result.estimated">
        <p class="result-level">
          Niveau estimé : <strong>{{ result.estimated }}</strong>
        </p>
        <p class="result-message">{{ RESULT_MESSAGES[result.estimated] }}</p>
      </template>
      <template v-else>
        <p class="result-level">Niveau estimé : <strong>Pré-A1</strong></p>
        <p class="result-message">
          Les bases (A1) ne sont pas encore consolidées — c'est le point de départ idéal pour
          commencer à lire.
        </p>
      </template>

      <table class="breakdown">
        <thead>
          <tr>
            <th>Niveau</th>
            <th>Questions posées</th>
            <th>Bonnes réponses</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in result.stats.filter((s) => s.attempts > 0)" :key="s.level">
            <td>{{ s.level }}</td>
            <td>{{ s.attempts }}</td>
            <td>{{ s.correct }} / {{ s.attempts }}</td>
          </tr>
        </tbody>
      </table>

      <div class="result-actions">
        <button class="restart-btn" type="button" @click="restart">Refaire le test</button>
        <RouterLink
          class="cta-link"
          :to="{ name: 'library', query: { level: result.estimated || 'A1' } }"
        >
          Voir les textes de niveau {{ result.estimated || 'A1' }} →
        </RouterLink>
      </div>
    </div>
  </SceneLayout>
</template>

<style scoped>
.intro-panel p {
  margin: 0 0 0.8rem;
  font-size: 0.95rem;
  line-height: 1.65;
  color: #4a4238;
}

.rules {
  margin: 0 0 1.2rem;
  padding-left: 1.2rem;
  font-size: 0.9rem;
  line-height: 1.6;
  color: #6b6156;
}

.rules li {
  margin: 0.3rem 0;
}

.start-btn,
.next-btn,
.restart-btn {
  padding: 0.6rem 1.4rem;
  border: none;
  border-radius: 999px;
  background: #b0692e;
  color: #fff;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.start-btn:hover,
.next-btn:hover,
.restart-btn:hover {
  background: #96551f;
}

.test-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}

.level-chip {
  font-size: 0.8rem;
  font-weight: 700;
  color: #b0692e;
  background: rgba(176, 105, 46, 0.1);
  border-radius: 999px;
  padding: 0.25rem 0.75rem;
}

.q-count {
  font-size: 0.82rem;
  color: #6b6156;
}

.progress-track {
  height: 4px;
  border-radius: 999px;
  background: #eee1ce;
  overflow: hidden;
  margin-bottom: 1.3rem;
}

.progress-fill {
  height: 100%;
  background: #b0692e;
  transition: width 0.25s ease;
}

.question {
  margin: 0 0 1rem;
  font-size: 1.05rem;
  font-weight: 600;
  color: #2c2620;
  line-height: 1.5;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1.2rem;
}

.option {
  text-align: left;
  padding: 0.55rem 1rem;
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

.result-level {
  margin: 0 0 0.4rem;
  font-size: 1.4rem;
  color: #2c2620;
}

.result-level strong {
  color: #b0692e;
}

.result-message {
  margin: 0 0 1.2rem;
  font-size: 0.95rem;
  line-height: 1.6;
  color: #4a4238;
}

.breakdown {
  width: 100%;
  margin-bottom: 1.4rem;
  border-collapse: collapse;
  font-size: 0.88rem;
}

.breakdown th,
.breakdown td {
  padding: 0.4rem 0.6rem;
  border: 1px solid #eee1ce;
  text-align: left;
  color: #4a4238;
}

.breakdown th {
  background: rgba(176, 105, 46, 0.08);
  color: #2c2620;
  font-weight: 600;
}

.result-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.cta-link {
  color: #b0692e;
  font-weight: 600;
  text-decoration: none;
}

.cta-link:hover {
  text-decoration: underline;
}
</style>
