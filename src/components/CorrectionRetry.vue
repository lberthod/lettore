<script setup>
// Seconde tentative après feedback (IntegartioNOptimsaitonPedago.MD,
// section 5) : après une correction d'écriture ou un bilan de dialogue, on
// reprend 1-2 erreurs prioritaires, on demande une reformulation, on la
// vérifie localement et on met à jour la carte SRS correspondante — sans
// jamais bloquer ni dupliquer de carte.
//
// La carte a déjà été créée par la vue appelante (WriteView/DialogueView
// appellent addErrorCard() pour CHAQUE erreur juste après la correction,
// avant même d'afficher ce composant) : on se contente ici de retrouver son
// id (errorCardId est une fonction pure du couple original/correction) et
// de la faire progresser dans Leitner via reviewErrorCard. Appeler à
// nouveau addErrorCard() ici ajouterait un second horodatage à `history`
// dans la même session, ce qui ferait passer une simple reprise pour une
// « erreur récurrente » (§15.1) alors qu'elle ne l'est pas encore.
import { computed, onUnmounted, ref, watch } from 'vue'
import { selectPriorityErrors, checkRewrite, hintFor } from '../lib/correctionRetry.js'
import { errorCardId, reviewErrorCard } from '../progress.js'

// Le message « Bravo ! » doit rester visible un instant avant de passer à
// l'étape suivante ou de disparaître — sans ce délai, `advance()` efface
// `feedback` dans le même tick et l'apprenant ne voit jamais la confirmation.
const SUCCESS_DELAY_MS = 1100

const props = defineProps({
  // Erreurs complètes de la correction/bilan : [{ original, correction,
  // explanation, type }]. La vue appelante normalise déjà son format
  // (ex. dialogue: `better` → `correction`).
  errors: { type: Array, default: () => [] },
  // 'scrivi' | 'dialogo' — repris tel quel dans les cartes SRS (progress.js).
  source: { type: String, required: true },
  // Nombre d'erreurs prioritaires à reprendre (§7.3 : feedback adapté au
  // niveau — un débutant retravaille moins d'erreurs à la fois qu'un niveau
  // avancé). Reprend MAX_RETRY_ERRORS par défaut, comme avant cette option.
  maxErrors: { type: Number, default: undefined },
})

// Émis une fois la reprise terminée (toutes les étapes traitées) : la vue
// appelante fusionne ces champs dans son propre logActivity({ skill, … }).
const emit = defineEmits(['complete'])

const steps = computed(() =>
  selectPriorityErrors(props.errors, props.maxErrors ? { max: props.maxErrors } : undefined)
)

const stepIndex = ref(0)
const attempt = ref('')
const feedback = ref(null) // null | 'success' | 'retry'
const hintShown = ref(false)
const retryCount = ref(0)
const outcomes = ref([]) // succès/échec final par étape traitée
const finished = ref(false)
let advanceTimer = null

function clearAdvanceTimer() {
  if (advanceTimer) {
    clearTimeout(advanceTimer)
    advanceTimer = null
  }
}

// Nouvelle correction (nouvelle soumission, nouveau bilan) : on repart de
// zéro plutôt que de continuer sur une reprise obsolète.
watch(
  () => props.errors,
  () => {
    clearAdvanceTimer()
    stepIndex.value = 0
    attempt.value = ''
    feedback.value = null
    hintShown.value = false
    retryCount.value = 0
    outcomes.value = []
    finished.value = false
  },
)

onUnmounted(clearAdvanceTimer)

const current = computed(() => steps.value[stepIndex.value] || null)
const hint = computed(() => (current.value ? hintFor(current.value.correction) : ''))

const TYPE_LABELS = {
  grammatica: 'Grammatica',
  lessico: 'Lessico',
  registro: 'Registro',
  ortografia: 'Ortografia',
  pronuncia: 'Pronuncia',
}
function typeLabel(type) {
  return TYPE_LABELS[type] || type
}

function recordCard(err, success) {
  reviewErrorCard(errorCardId(err.original, err.correction), success)
}

function verify() {
  if (!current.value || !attempt.value.trim() || finished.value || advanceTimer) return
  retryCount.value += 1
  const { success } = checkRewrite(attempt.value, current.value.correction)
  feedback.value = success ? 'success' : 'retry'
  if (success) {
    recordCard(current.value, true)
    // Laisse le message de réussite visible avant de passer à la suite.
    advanceTimer = setTimeout(() => {
      advanceTimer = null
      advance(true)
    }, SUCCESS_DELAY_MS)
  }
}

function toggleHint() {
  hintShown.value = !hintShown.value
}

// Ne bloque jamais : l'apprenant peut toujours passer à la suite même sans
// avoir retrouvé la forme correcte.
function skip() {
  if (!current.value || finished.value || advanceTimer) return
  recordCard(current.value, false)
  advance(false)
}

function advance(success) {
  outcomes.value.push(success)
  attempt.value = ''
  feedback.value = null
  hintShown.value = false
  if (stepIndex.value + 1 < steps.value.length) {
    stepIndex.value += 1
  } else {
    finished.value = true
    emit('complete', {
      retryCount: retryCount.value,
      retrySuccess: outcomes.value.length > 0 && outcomes.value.every(Boolean),
      errorTypes: steps.value.map((e) => e.type),
    })
  }
}
</script>

<template>
  <!-- Aucune étape pour une production sans erreur (critère d'acceptation 5.5). -->
  <section v-if="steps.length && !finished" class="retry" aria-live="polite">
    <p class="retry-head">
      ✏️ Reprenons
      <span v-if="steps.length > 1">({{ stepIndex + 1 }}/{{ steps.length }})</span>
      <span class="retry-type-badge">{{ typeLabel(current.type) }}</span>
    </p>

    <!-- La réponse originale et la correction restent visibles (critère 5.5). -->
    <p class="retry-diff">
      <span class="original">{{ current.original }}</span>
      <span class="arrow" aria-hidden="true">→</span>
      <span class="fixed">{{ current.correction }}</span>
    </p>
    <p v-if="current.explanation" class="retry-explanation">{{ current.explanation }}</p>

    <label class="retry-label">
      Reformulez cette phrase correctement
      <textarea
        v-model="attempt"
        rows="2"
        placeholder="Scrivi di nuovo la frase…"
        :disabled="finished || feedback === 'success'"
        @keydown.enter.exact.prevent="verify"
      ></textarea>
    </label>

    <p v-if="hintShown" class="retry-hint">💡 Indice : {{ hint }}</p>

    <p v-if="feedback === 'success'" class="retry-feedback success">
      ✓ Bravo, c'est la bonne formulation !
    </p>
    <p v-else-if="feedback === 'retry'" class="retry-feedback retry-msg">
      Pas tout à fait — essayez encore, ou demandez un indice.
    </p>

    <div class="retry-actions">
      <button
        type="button"
        class="btn-primary"
        :disabled="!attempt.trim() || feedback === 'success'"
        @click="verify"
      >
        Vérifier
      </button>
      <button type="button" class="link-btn" :disabled="feedback === 'success'" @click="toggleHint">
        {{ hintShown ? 'Cacher l’indice' : '💡 Un indice' }}
      </button>
      <button type="button" class="link-btn" :disabled="feedback === 'success'" @click="skip">Passer</button>
    </div>
  </section>
</template>

<style scoped>
.retry {
  margin-top: 1.2rem;
  padding: 0.9rem 1rem;
  border-radius: 12px;
  background: rgba(176, 105, 46, 0.06);
  border: 1px solid rgba(176, 105, 46, 0.3);
}

.retry-head {
  margin: 0 0 0.5rem;
  font-weight: 700;
  color: #6f4722;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.retry-type-badge {
  font-size: 0.78rem;
  font-weight: 400;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: rgba(176, 105, 46, 0.12);
  color: #6f4722;
}

.retry-diff {
  margin: 0 0 0.3rem;
  line-height: 1.6;
}

.original {
  text-decoration: line-through;
  text-decoration-color: rgba(163, 58, 42, 0.7);
  color: #a33a2a;
}

.arrow {
  margin: 0 0.4rem;
  color: #6b6156;
}

.fixed {
  color: #3d7a3d;
  font-weight: 700;
}

.retry-explanation {
  margin: 0 0 0.7rem;
  color: #4a4238;
  font-size: 0.92rem;
  line-height: 1.55;
}

.retry-label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.9rem;
  color: #4a4238;
}

.retry-label textarea {
  padding: 0.55rem 0.7rem;
  border-radius: 10px;
  border: 1px solid rgba(107, 97, 86, 0.4);
  background: #fffaf3;
  font: inherit;
  resize: vertical;
}

.retry-hint {
  margin: 0.5rem 0 0;
  font-size: 0.88rem;
  color: #6f4722;
}

.retry-feedback {
  margin: 0.6rem 0 0;
  font-weight: 700;
}

.retry-feedback.success {
  color: #3d7a3d;
}

.retry-feedback.retry-msg {
  color: #a33a2a;
}

.retry-actions {
  margin-top: 0.7rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.9rem;
}

.btn-primary {
  padding: 0.5rem 1.1rem;
  border-radius: 999px;
  border: none;
  background: #b0692e;
  color: #faf6f0;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: default;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: #b0692e;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
  font-size: 0.88rem;
}
</style>
