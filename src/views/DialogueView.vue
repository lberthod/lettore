<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { fetchQuota } from '../lib/generation.js'
import { speakItalian, stopSpeaking } from '../tts.js'
import {
  SCENARIOS,
  LEVELS,
  DIALOGUE_MAX_CHARS,
  DIALOGUE_COST,
  MAX_DIALOGUE_TURNS,
  DialogueError,
  startDialogue,
  sendDialogueTurn,
  closeDialogue,
  fetchDialogue,
  saveSessionId,
  loadSessionId,
  clearSessionId,
} from '../lib/dialogue.js'

// --- Solde de crédits (comme WriteView) : un dialogue coûte 2 crédits, à la
// session — le serveur reste la seule source de vérité, affichage informatif.
const quota = ref(null)
async function refreshQuota() {
  quota.value = await fetchQuota()
}

const canStart = computed(() => {
  if (!quota.value) return true // pas chargé : le serveur tranchera
  if (quota.value.type !== 'credits') return false
  return quota.value.remaining >= DIALOGUE_COST
})
// Rôle sans crédits (gratuit, premium lecture) : le dialogue fait partie de
// Premium IA — bannière de blocage plutôt que refus serveur après coup.
const blocked = computed(() => quota.value && quota.value.type !== 'credits')

// --- État de la session ---
// phase: choose (cartes) | chat (conversation) | feedback (bilan)
const phase = ref('choose')
const selectedScenario = ref(null)
const level = ref('A1')
const sessionId = ref(null)
const turns = ref([]) // [{ role: 'user'|'assistant', text }]
const suggestions = ref([])
const turnsLeft = ref(MAX_DIALOGUE_TURNS)
const done = ref(false)
const feedback = ref(null)
const input = ref('')
const working = ref(false) // un appel serveur en cours (ouverture/tour)
const closing = ref(false) // bilan en cours
const error = ref('')

const scenarioMeta = computed(
  () => SCENARIOS.find((s) => s.id === selectedScenario.value) || null
)

const chatEl = ref(null)
async function scrollChat() {
  await nextTick()
  chatEl.value?.scrollTo({ top: chatEl.value.scrollHeight, behavior: 'smooth' })
}

function choose(scenario) {
  selectedScenario.value = scenario.id
  level.value = scenario.level
}

async function start() {
  if (working.value || !selectedScenario.value) return
  working.value = true
  error.value = ''
  try {
    const data = await startDialogue(selectedScenario.value, level.value)
    sessionId.value = data.sessionId
    saveSessionId(data.sessionId)
    turns.value = [{ role: 'assistant', text: data.reply }]
    suggestions.value = data.suggested_replies || []
    turnsLeft.value = data.turnsLeft ?? MAX_DIALOGUE_TURNS
    done.value = false
    feedback.value = null
    phase.value = 'chat'
    scrollChat()
  } catch (err) {
    error.value = err.message
  } finally {
    working.value = false
    refreshQuota()
  }
}

async function send() {
  const text = input.value.trim()
  if (working.value || !text || done.value) return
  working.value = true
  error.value = ''
  try {
    const data = await sendDialogueTurn(sessionId.value, text)
    turns.value.push({ role: 'user', text }, { role: 'assistant', text: data.reply })
    suggestions.value = data.suggested_replies || []
    turnsLeft.value = data.turnsLeft ?? turnsLeft.value
    done.value = Boolean(data.done)
    input.value = ''
    scrollChat()
  } catch (err) {
    if (err instanceof DialogueError && err.limitReached) {
      // Plafond de tours côté serveur : on passe naturellement au bilan.
      done.value = true
      error.value = ''
    } else if (err instanceof DialogueError && (err.status === 404 || err.status === 409)) {
      // Session perdue/close côté serveur : inutile d'insister.
      error.value = err.message
      done.value = true
    } else {
      error.value = err.message
    }
  } finally {
    working.value = false
  }
}

function useSuggestion(s) {
  input.value = s
}

async function finish() {
  if (closing.value || !sessionId.value) return
  closing.value = true
  error.value = ''
  try {
    const data = await closeDialogue(sessionId.value)
    feedback.value = data.feedback || []
    phase.value = 'feedback'
    clearSessionId()
    stopSpeaking()
  } catch (err) {
    error.value = err.message
  } finally {
    closing.value = false
  }
}

function restart() {
  phase.value = 'choose'
  sessionId.value = null
  turns.value = []
  suggestions.value = []
  feedback.value = null
  done.value = false
  error.value = ''
  input.value = ''
  turnsLeft.value = MAX_DIALOGUE_TURNS
  clearSessionId()
  refreshQuota()
}

// Reprise après rechargement : l'identifiant vit en localStorage, le serveur
// (propriétaire uniquement) rend l'historique complet.
async function resume() {
  const id = loadSessionId()
  if (!id) return
  try {
    const data = await fetchDialogue(id)
    if (data.status !== 'active') {
      clearSessionId()
      return
    }
    sessionId.value = id
    selectedScenario.value = data.scenario
    level.value = data.level
    turns.value = data.turns || []
    suggestions.value = data.suggested_replies || []
    turnsLeft.value = data.turnsLeft ?? MAX_DIALOGUE_TURNS
    done.value = turnsLeft.value <= 0
    phase.value = 'chat'
    scrollChat()
  } catch {
    // Session introuvable ou expirée : on repart du choix de scénario.
    clearSessionId()
  }
}

onMounted(() => {
  refreshQuota()
  resume()
})

// 🔊 par réplique du personnage (même moteur TTS que le lecteur).
function speak(text) {
  speakItalian(text)
}
</script>

<template>
  <SceneLayout title="Dia" accent="logo" tagline="Dialogue simulé" narrow>
    <!-- ÉTAPE 1 : choix du scénario -->
    <template v-if="phase === 'choose'">
      <p>
        Jouez une scène du quotidien en italien : l'IA tient son rôle (barista,
        médecin, guichetier…) et vous répond à votre niveau. À la fin, un bilan
        corrige gentiment vos répliques. Un dialogue coûte
        {{ DIALOGUE_COST }} crédits, jusqu'à {{ MAX_DIALOGUE_TURNS }} tours.
      </p>

      <p v-if="blocked" class="quota-banner blocked">
        Le dialogue simulé fait partie de la formule
        <RouterLink :to="{ name: 'pricing' }">Premium IA</RouterLink> — votre
        formule actuelle ne l'inclut pas.
      </p>
      <p v-else-if="quota?.type === 'credits'" class="quota-banner">
        {{ quota.remaining }} crédit{{ quota.remaining > 1 ? 's' : '' }} sur
        {{ quota.limit }} restant{{ quota.remaining > 1 ? 's' : '' }} ce mois-ci.
      </p>

      <div class="scenario-grid">
        <button
          v-for="s in SCENARIOS"
          :key="s.id"
          type="button"
          class="scenario-card"
          :class="{ selected: selectedScenario === s.id }"
          @click="choose(s)"
        >
          <span class="scenario-icon" aria-hidden="true">{{ s.icon }}</span>
          <span class="scenario-title">{{ s.title }}</span>
          <span class="scenario-desc">{{ s.description }}</span>
          <span class="scenario-level">Niveau conseillé : {{ s.level }}</span>
        </button>
      </div>

      <div class="start-row">
        <label class="level-select">
          Votre niveau
          <select v-model="level">
            <option v-for="l in LEVELS" :key="l" :value="l">{{ l }}</option>
          </select>
        </label>
        <button
          class="btn-primary"
          type="button"
          :disabled="working || !selectedScenario || !canStart"
          @click="start"
        >
          <span v-if="working" class="spinner" aria-hidden="true"></span>
          {{ working ? 'Ouverture de la scène…' : 'Commencer le dialogue' }}
        </button>
      </div>
      <p v-if="error" class="hint error">⚠ {{ error }}</p>
    </template>

    <!-- ÉTAPE 2 : conversation -->
    <template v-else-if="phase === 'chat'">
      <p class="chat-head">
        <span v-if="scenarioMeta" class="chat-scenario">
          {{ scenarioMeta.icon }} <strong>{{ scenarioMeta.title }}</strong> · {{ level }}
        </span>
        <small class="turns-left">
          {{ turnsLeft }} tour{{ turnsLeft > 1 ? 's' : '' }} restant{{ turnsLeft > 1 ? 's' : '' }}
        </small>
      </p>

      <div ref="chatEl" class="chat" aria-live="polite">
        <div
          v-for="(t, i) in turns"
          :key="i"
          class="bubble-row"
          :class="t.role"
        >
          <div class="bubble">
            <p class="bubble-text">{{ t.text }}</p>
            <button
              v-if="t.role === 'assistant'"
              type="button"
              class="tts-btn"
              title="Écouter"
              aria-label="Écouter la réplique"
              @click="speak(t.text)"
            >
              🔊
            </button>
          </div>
        </div>
        <p v-if="working" class="typing" role="status">
          <span class="spinner dark" aria-hidden="true"></span> Risposta in arrivo…
        </p>
      </div>

      <div v-if="!done && suggestions.length" class="suggestions">
        <button
          v-for="(s, i) in suggestions"
          :key="i"
          type="button"
          class="suggestion-chip"
          :disabled="working"
          @click="useSuggestion(s)"
        >
          {{ s }}
        </button>
      </div>

      <p v-if="done" class="hint done-hint">
        🎭 La scène est terminée — demandez votre bilan !
      </p>
      <p v-if="error" class="hint error">⚠ {{ error }}</p>

      <form v-if="!done" class="chat-form" @submit.prevent="send">
        <input
          v-model="input"
          type="text"
          :maxlength="DIALOGUE_MAX_CHARS"
          placeholder="Scrivi la tua risposta in italiano…"
          :disabled="working"
        />
        <button class="btn-primary" type="submit" :disabled="working || !input.trim()">
          Inviare
        </button>
      </form>

      <div class="close-row">
        <button type="button" class="btn-secondary" :disabled="closing" @click="finish">
          <span v-if="closing" class="spinner dark" aria-hidden="true"></span>
          {{ closing ? 'Bilan en cours…' : 'Terminer et voir le bilan' }}
        </button>
      </div>
    </template>

    <!-- ÉTAPE 3 : bilan -->
    <template v-else>
      <h2 class="feedback-title">Il tuo bilancio</h2>
      <p v-if="scenarioMeta" class="chat-scenario">
        {{ scenarioMeta.icon }} {{ scenarioMeta.title }} · {{ level }}
      </p>

      <p v-if="!feedback || !feedback.length" class="no-errors">
        🎉 Bravissimo ! Rien à signaler dans vos répliques.
      </p>
      <div v-for="(f, i) in feedback" :key="i" class="feedback-item">
        <p class="feedback-diff">
          <span class="original">{{ f.original }}</span>
          <span class="arrow" aria-hidden="true">→</span>
          <span class="fixed">{{ f.better }}</span>
        </p>
        <p class="feedback-explanation">{{ f.explanation }}</p>
      </div>

      <div class="close-row">
        <button type="button" class="btn-primary" @click="restart">
          Nouveau dialogue
        </button>
      </div>
    </template>
  </SceneLayout>
</template>

<style scoped>
.quota-banner {
  margin: 0.8rem 0 1.2rem;
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  background: rgba(176, 105, 46, 0.08);
  border: 1px solid rgba(176, 105, 46, 0.25);
  font-size: 0.9rem;
}

.quota-banner.blocked {
  background: rgba(163, 58, 42, 0.08);
  border-color: rgba(163, 58, 42, 0.3);
  color: #a33a2a;
}

/* --- Cartes de scénario --- */
.scenario-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.8rem;
  margin: 1rem 0;
}

.scenario-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: left;
  padding: 0.9rem;
  border-radius: 12px;
  border: 1px solid rgba(176, 105, 46, 0.25);
  background: #fffaf3;
  cursor: pointer;
  font: inherit;
  transition: border-color 0.12s, box-shadow 0.12s;
}

.scenario-card:hover {
  border-color: #b0692e;
}

.scenario-card.selected {
  border-color: #b0692e;
  box-shadow: 0 0 0 2px rgba(176, 105, 46, 0.35);
}

.scenario-icon {
  font-size: 1.5rem;
}

.scenario-title {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-weight: 700;
  color: #6f4722;
}

.scenario-desc {
  color: #4a4238;
  font-size: 0.85rem;
  line-height: 1.45;
}

.scenario-level {
  color: #6b6156;
  font-size: 0.78rem;
}

.start-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem;
  margin-top: 0.5rem;
}

.level-select {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.9rem;
  color: #4a4238;
}

.level-select select {
  padding: 0.45rem 0.6rem;
  border-radius: 8px;
  border: 1px solid rgba(107, 97, 86, 0.4);
  background: #fffaf3;
  font: inherit;
}

/* --- Conversation --- */
.chat-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.6rem;
  margin: 0 0 0.6rem;
}

.chat-scenario {
  color: #6f4722;
}

.turns-left {
  color: #6b6156;
  font-size: 0.78rem;
  white-space: nowrap;
}

.chat {
  max-height: 46vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.8rem;
  border-radius: 12px;
  background: rgba(176, 105, 46, 0.05);
  border: 1px solid rgba(176, 105, 46, 0.15);
}

.bubble-row {
  display: flex;
}

.bubble-row.user {
  justify-content: flex-end;
}

.bubble {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  max-width: 85%;
  padding: 0.55rem 0.8rem;
  border-radius: 14px;
  line-height: 1.55;
}

.bubble-row.assistant .bubble {
  background: #fffaf3;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-bottom-left-radius: 4px;
  color: #2c2620;
}

.bubble-row.user .bubble {
  background: #b0692e;
  color: #faf6f0;
  border-bottom-right-radius: 4px;
}

.bubble-text {
  margin: 0;
}

.tts-btn {
  flex: none;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1.4;
}

.typing {
  margin: 0;
  color: #6b6156;
  font-size: 0.85rem;
}

/* --- Suggestions --- */
.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.7rem;
}

.suggestion-chip {
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(176, 105, 46, 0.4);
  background: rgba(176, 105, 46, 0.08);
  color: #6f4722;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.12s;
}

.suggestion-chip:hover:not(:disabled) {
  background: rgba(176, 105, 46, 0.18);
}

/* --- Saisie --- */
.chat-form {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.8rem;
}

.chat-form input {
  flex: 1;
  min-width: 0;
  padding: 0.55rem 0.8rem;
  border-radius: 10px;
  border: 1px solid rgba(107, 97, 86, 0.4);
  background: #fffaf3;
  font: inherit;
}

.close-row {
  margin-top: 1rem;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  border-radius: 10px;
  border: 1px solid rgba(176, 105, 46, 0.5);
  background: transparent;
  color: #6f4722;
  font: inherit;
  cursor: pointer;
  transition: background 0.12s;
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(176, 105, 46, 0.08);
}

.hint.error {
  color: #a33a2a;
}

.hint.done-hint {
  color: #3d7a3d;
  font-weight: 700;
}

/* --- Bilan --- */
.feedback-title {
  font-family: 'Georgia', 'Times New Roman', serif;
  margin-bottom: 0.2rem;
}

.no-errors {
  color: #3d7a3d;
  font-weight: 700;
}

.feedback-item {
  margin: 0.5rem 0 0.9rem;
  padding: 0.6rem 0.9rem;
  border: 1px solid rgba(107, 97, 86, 0.25);
  border-radius: 10px;
}

.feedback-diff {
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

.feedback-explanation {
  margin: 0;
  color: #4a4238;
  font-size: 0.92rem;
  line-height: 1.55;
}

.spinner {
  display: inline-block;
  width: 0.85em;
  height: 0.85em;
  margin-right: 0.45em;
  vertical-align: -0.1em;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner.dark {
  border-color: rgba(111, 71, 34, 0.3);
  border-top-color: #6f4722;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
