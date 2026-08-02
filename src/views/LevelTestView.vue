<script setup>
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import {
  LEVELS,
  pickQuestion as enginePickQuestion,
  estimateLevel,
  summarizeSelfAssessment,
  describeRecommendation,
} from '../lib/levelTestEngine.js'
import { saveLevelPositioning } from '../lib/levelReview.js'
import { correctText, CorrectionError } from '../lib/correction.js'

// Positionnement multimodal (Sprint 3.1, phasetravail.md §3.1) : QCM
// adaptatif « escalier » (sélection de question et estimation partagées
// avec ScalaCecrGame.vue via lib/levelTestEngine.js), suivi d'une courte
// auto-évaluation par situations réelles puis d'une production écrite
// facultative. Le résultat final est un niveau « conseillé pour commencer »,
// jamais une certification.
//
// On démarre en A1 : une bonne réponse fait monter d'un niveau, une mauvaise
// fait redescendre d'un niveau. On s'arrête soit après deux échecs
// consécutifs au même niveau (le palier est trouvé), soit après deux
// réussites consécutives en C2 (le plafond du test est atteint), soit après
// un nombre maximal de questions (garde-fou).
const MIN_QUESTIONS = 10
const MAX_QUESTIONS = 16

// phase : 'intro' -> 'qcm' -> 'self-assessment' -> 'production' -> 'result'
const phase = ref('intro')
const levelIndex = ref(0)
const asked = ref(0)
const wrongStreak = ref(0)
const correctStreakAtTop = ref(0)
const history = ref([]) // { level, correct }
const usedByLevel = ref({}) // { A1: Set(indices déjà posées) }
const current = ref(null) // { level, index, q, options, correct }
const picked = ref(null)
const answered = ref(false)

function start() {
  phase.value = 'qcm'
  levelIndex.value = 0
  asked.value = 0
  wrongStreak.value = 0
  correctStreakAtTop.value = 0
  history.value = []
  usedByLevel.value = {}
  picked.value = null
  answered.value = false
  current.value = enginePickQuestion(LEVELS[0], usedByLevel.value)
}

const result = ref(null)

function finishQcm() {
  result.value = estimateLevel(history.value)
  phase.value = 'self-assessment'
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
        finishQcm()
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
      finishQcm()
      return
    }
    if (levelIndex.value > 0) levelIndex.value--
  }

  if (asked.value >= MAX_QUESTIONS) {
    finishQcm()
  }
}

function next() {
  answered.value = false
  picked.value = null
  current.value = enginePickQuestion(LEVELS[levelIndex.value], usedByLevel.value)
}

// --- Auto-évaluation par situations réelles (§3.1 / outpedagogy.md §10.6) ---
// Un signal complémentaire au QCM, jamais utilisé pour recalculer le niveau
// estimé : seulement pour enrichir l'explication du résultat final.
const SELF_ASSESSMENT_QUESTIONS = [
  {
    id: 'restaurant',
    text: 'Peux-tu commander au restaurant sans préparer tes phrases à l’avance ?',
  },
  {
    id: 'telephone',
    text: 'Peux-tu tenir une conversation téléphonique simple en italien, sans voir ton interlocuteur ?',
  },
  {
    id: 'article',
    text: 'Peux-tu comprendre l’essentiel d’un court article de presse italien sans traduction ?',
  },
]
const selfAssessmentAnswers = ref({}) // { [id]: 'oui' | 'plutot' | 'non' }

function answerSelfAssessment(id, value) {
  selfAssessmentAnswers.value = { ...selfAssessmentAnswers.value, [id]: value }
}

const selfAssessmentComplete = computed(() =>
  SELF_ASSESSMENT_QUESTIONS.every((q) => selfAssessmentAnswers.value[q.id])
)

function goToProduction() {
  phase.value = 'production'
}

// --- Production écrite facultative ---
// Réutilise le client de correction de WriteView.vue (lib/correction.js) :
// un simple textarea + envoi au même endpoint, sans dupliquer le reste de sa
// UI (aides progressives, reprise, brouillons…) qui n'a pas sa place ici —
// limite documentée dans le rapport de ce sprint.
const productionText = ref('')
const productionWorking = ref(false)
const productionError = ref('')
const productionResult = ref(null) // { corrected, errors, level_estimate }
const PRODUCTION_MAX_CHARS = 400

async function submitProduction() {
  if (!productionText.value.trim()) return
  productionWorking.value = true
  productionError.value = ''
  try {
    productionResult.value = await correctText(productionText.value.trim())
  } catch (e) {
    productionError.value =
      e instanceof CorrectionError
        ? e.message
        : "La correction n'a pas pu être obtenue — tu peux continuer sans."
  } finally {
    productionWorking.value = false
  }
}

const recommendation = ref('')

function finishPositioning() {
  const selfAssessment = summarizeSelfAssessment(selfAssessmentAnswers.value)
  recommendation.value = describeRecommendation(result.value, {
    selfAssessment,
    hasProduction: !!productionResult.value,
  })
  // Mémorise le positionnement pour la relecture automatique après quelques
  // activités authentiques (lib/levelReview.js, note discrète dans
  // ProfileView.vue).
  saveLevelPositioning({
    level: result.value.estimated || 'A1',
    confidence: result.value.confidence,
    source: productionResult.value ? 'multimodal' : 'qcm+auto-evaluation',
  })
  phase.value = 'result'
}

function restart() {
  selfAssessmentAnswers.value = {}
  productionText.value = ''
  productionResult.value = null
  productionError.value = ''
  recommendation.value = ''
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
    <div v-if="phase === 'intro'" class="intro-panel">
      <p>
        Ce test adaptatif estime le niveau d'italien conseillé pour commencer, selon le
        <strong>CECR</strong> (A1 à C2). Il commence par une question A1 : chaque bonne réponse
        fait monter le niveau des questions suivantes, chaque erreur le fait redescendre. Après le
        questionnaire, quelques questions sur des situations réelles et une production écrite
        facultative complètent le résultat.
      </p>
      <ul class="rules">
        <li>Une seule bonne réponse par question, aucun temps limite.</li>
        <li>Entre {{ MIN_QUESTIONS }} et {{ MAX_QUESTIONS }} questions selon votre parcours.</li>
        <li>Le résultat est un niveau conseillé pour commencer, pas une certification officielle.</li>
      </ul>
      <button class="start-btn" type="button" @click="start">Commencer le test</button>
    </div>

    <div v-else-if="phase === 'qcm'" class="test-panel">
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

    <div v-else-if="phase === 'self-assessment'" class="self-assessment-panel">
      <p class="step-hint">
        Encore quelques questions sur des situations réelles — elles n'ajustent pas le score du
        questionnaire, mais aident à formuler un résultat plus juste.
      </p>
      <div v-for="q in SELF_ASSESSMENT_QUESTIONS" :key="q.id" class="self-assessment-item">
        <p class="self-assessment-text">{{ q.text }}</p>
        <div class="self-assessment-options">
          <button
            v-for="opt in [
              { value: 'oui', label: 'Oui' },
              { value: 'plutot', label: 'Plutôt' },
              { value: 'non', label: 'Non' },
            ]"
            :key="opt.value"
            type="button"
            class="option option-small"
            :class="{ selected: selfAssessmentAnswers[q.id] === opt.value }"
            @click="answerSelfAssessment(q.id, opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
      <div class="step-actions">
        <button class="next-btn" type="button" :disabled="!selfAssessmentComplete" @click="goToProduction">
          Continuer →
        </button>
        <button class="skip-btn" type="button" @click="goToProduction">Passer cette étape</button>
      </div>
    </div>

    <div v-else-if="phase === 'production'" class="production-panel">
      <p class="step-hint">
        Facultatif : écris quelques phrases en italien pour affiner le résultat. Cette production
        est envoyée à la même correction pédagogique que la page « Scrivi ».
      </p>
      <label>
        <span class="label-line">
          Ton texte en italien
          <small class="char-count">{{ productionText.length }}/{{ PRODUCTION_MAX_CHARS }}</small>
        </span>
        <textarea
          v-model="productionText"
          rows="5"
          :maxlength="PRODUCTION_MAX_CHARS"
          :disabled="productionWorking || !!productionResult"
          placeholder="Ieri sono andato al mercato con mia sorella…"
        ></textarea>
      </label>

      <p v-if="productionError" class="error">{{ productionError }}</p>

      <div v-if="productionResult" class="production-result">
        <p>
          Niveau estimé sur cette production : <strong>{{ productionResult.level_estimate || '—' }}</strong>
          <span v-if="productionResult.errors?.length">
            · {{ productionResult.errors.length }} remarque{{ productionResult.errors.length > 1 ? 's' : '' }}
          </span>
        </p>
      </div>

      <div class="step-actions">
        <button
          v-if="!productionResult"
          class="next-btn"
          type="button"
          :disabled="productionWorking || !productionText.trim()"
          @click="submitProduction"
        >
          {{ productionWorking ? 'Correction en cours…' : 'Envoyer ma production' }}
        </button>
        <button class="next-btn" v-else type="button" @click="finishPositioning">Voir mon résultat →</button>
        <button v-if="!productionResult" class="skip-btn" type="button" @click="finishPositioning">
          Passer cette étape
        </button>
      </div>
    </div>

    <div v-else class="result-panel">
      <template v-if="result.estimated">
        <p class="result-level">
          Niveau conseillé pour commencer : <strong>{{ result.estimated }}</strong>
        </p>
        <p class="result-message">{{ RESULT_MESSAGES[result.estimated] }}</p>
      </template>
      <template v-else>
        <p class="result-level">Niveau conseillé pour commencer : <strong>Pré-A1</strong></p>
        <p class="result-message">
          Les bases (A1) ne sont pas encore consolidées — c'est le point de départ idéal pour
          commencer à lire.
        </p>
      </template>

      <p class="recommendation">{{ recommendation }}</p>

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

.step-hint {
  margin: 0 0 1.1rem;
  font-size: 0.9rem;
  line-height: 1.55;
  color: #6b6156;
}

.self-assessment-item {
  margin-bottom: 1.1rem;
}

.self-assessment-text {
  margin: 0 0 0.5rem;
  font-size: 0.98rem;
  font-weight: 600;
  color: #2c2620;
}

.self-assessment-options {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.option-small {
  flex: 0 0 auto;
  padding: 0.4rem 1rem;
}

.option-small.selected {
  border-color: #b0692e;
  background: rgba(176, 105, 46, 0.12);
  font-weight: 600;
}

.step-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 1rem;
}

.skip-btn {
  background: none;
  border: none;
  color: #6b6156;
  font-size: 0.88rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

.production-panel label {
  display: block;
}

.production-panel textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.8rem;
  border: 1px solid #d8cfc2;
  border-radius: 8px;
  background: #faf6f0;
  font: inherit;
  resize: vertical;
}

.production-panel .label-line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 0.9rem;
  color: #4a4238;
  margin-bottom: 0.3rem;
}

.production-panel .char-count {
  font-size: 0.78rem;
  color: #8a5a2b;
}

.production-result {
  margin-top: 0.8rem;
  font-size: 0.9rem;
  color: #4a4238;
}

.error {
  margin: 0.6rem 0;
  color: #a34430;
  font-size: 0.88rem;
}

.recommendation {
  margin: 0 0 1.2rem;
  font-size: 0.88rem;
  line-height: 1.55;
  color: #6b6156;
  font-style: italic;
}
</style>
