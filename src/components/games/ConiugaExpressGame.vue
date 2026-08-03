<script setup>
// Mini-jeu de grammaire « Coniuga Express » : à chaque manche, un verbe, un
// temps et un pronom sont tirés au sort ; le joueur doit taper la forme
// conjuguée correcte le plus vite possible pour enchaîner les bonnes
// réponses (série).
//
// Composant autonome (aucune prop, aucun état partagé) : il charge lui-même
// le pool de verbes au montage et gère son propre cycle
// démarrage/partie/fin, pour être embarqué tel quel dans une page « Giochi »
// sans chrome de page.
import { ref, onMounted } from 'vue'
import { allVerbs, getConjugation } from '../../lib/dictionary.js'
import { logActivity } from '../../progress.js'

const MAX_LEMMA_LENGTH = 14
const MAX_ATTEMPTS = 15
const PRONOUNS = ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro']

// Libellés italiens conviviaux pour les temps les plus courants ; toute clé
// inconnue retombe sur une capitalisation naïve de la clé brute (les données
// de conjugaison peuvent contenir des temps qu'on n'a pas anticipés ici).
const TENSE_LABELS = {
  presente: 'Presente',
  passatoProssimo: 'Passato prossimo',
  imperfetto: 'Imperfetto',
  trapassatoProssimo: 'Trapassato prossimo',
  futuro: 'Futuro',
  futuroAnteriore: 'Futuro anteriore',
  passatoRemoto: 'Passato remoto',
  congiuntivoPresente: 'Congiuntivo presente',
  congiuntivoImperfetto: 'Congiuntivo imperfetto',
  congiuntivoPassato: 'Congiuntivo passato',
  congiuntivoTrapassato: 'Congiuntivo trapassato',
  condizionale: 'Condizionale presente',
  condizionalePassato: 'Condizionale passato',
  imperativo: 'Imperativo',
}

function labelForTense(key) {
  if (TENSE_LABELS[key]) return TENSE_LABELS[key]
  // Repli défensif : "tenseKey" -> "Tense key"
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function normalizeAnswer(s) {
  // Espaces et casse ignorés, mais les accents comptent (pas de retrait des
  // diacritiques ici, contrairement à d'autres jeux du site).
  return s.trim().toLowerCase()
}

const loading = ref(true)
const loadError = ref('')
const roundError = ref('')

const pool = ref([])
const started = ref(false)

const currentLemma = ref('')
const currentFr = ref('')
const tenseKey = ref('')
const pronoun = ref('')
const correctForm = ref('')

const guess = ref('')
const feedback = ref('') // '' | 'correct' | 'wrong'
const roundOver = ref(false)

const streak = ref(0)
const bestStreak = ref(0)

let inputEl = null

function focusInput(el) {
  inputEl = el
  if (el) el.focus()
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function buildRound() {
  if (!pool.value.length) return false

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const verb = pickRandom(pool.value)
    let conjugation
    try {
      conjugation = await getConjugation(verb.lemma)
    } catch {
      conjugation = null
    }
    if (!conjugation) continue

    const usableTenses = Object.keys(conjugation).filter((key) => {
      const forms = conjugation[key]
      return forms && PRONOUNS.some((p) => forms[p])
    })
    if (!usableTenses.length) continue

    const chosenTense = pickRandom(usableTenses)
    const forms = conjugation[chosenTense]
    const usablePronouns = PRONOUNS.filter((p) => forms[p])
    if (!usablePronouns.length) continue
    const chosenPronoun = pickRandom(usablePronouns)
    const form = forms[chosenPronoun]
    if (!form) continue

    currentLemma.value = verb.lemma
    currentFr.value = verb.fr || ''
    tenseKey.value = chosenTense
    pronoun.value = chosenPronoun
    correctForm.value = form
    return true
  }
  return false
}

async function startRound() {
  roundError.value = ''
  guess.value = ''
  feedback.value = ''
  roundOver.value = false
  const ok = await buildRound()
  if (!ok) {
    roundError.value = 'Impossibile trovare un altro verbo. Riprova.'
  }
}

async function submitGuess() {
  if (roundOver.value || roundError.value) return
  if (!guess.value.trim()) return

  const isCorrect = normalizeAnswer(guess.value) === normalizeAnswer(correctForm.value)
  roundOver.value = true
  feedback.value = isCorrect ? 'correct' : 'wrong'

  if (isCorrect) {
    streak.value += 1
    bestStreak.value = Math.max(bestStreak.value, streak.value)
  } else {
    streak.value = 0
  }

  logActivity({
    skill: 'grammatica',
    mode: 'coniuga-express',
    score: isCorrect ? 1 : 0,
    total: 1,
  })
}

async function nextRound() {
  await startRound()
}

async function newGame() {
  streak.value = 0
  bestStreak.value = 0
  started.value = true
  await startRound()
}

onMounted(async () => {
  try {
    const verbs = await allVerbs()
    pool.value = verbs.filter((v) => v.lemma && v.lemma.length <= MAX_LEMMA_LENGTH)
    if (!pool.value.length) {
      loadError.value = 'Nessun verbo disponibile per questo gioco.'
    }
  } catch {
    loadError.value = 'Impossibile caricare il dizionario.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="coniuga-card">
    <header class="header">
      <h3>Coniuga Express</h3>
      <p class="subtitle">Coniuga il verbo il più velocemente possibile.</p>
    </header>

    <div v-if="loading" class="state-msg">Caricamento…</div>
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

      <div v-if="roundError" class="state-msg error-msg">
        {{ roundError }}
        <button type="button" class="primary-btn retry-btn" @click="nextRound">Riprova</button>
      </div>

      <template v-else>
        <div class="prompt">
          <p class="verb-line">
            <strong>{{ currentLemma }}</strong>
            <span v-if="currentFr" class="fr-hint">({{ currentFr }})</span>
          </p>
          <p class="tense-line">{{ labelForTense(tenseKey) }}</p>
          <p class="pronoun-line">{{ pronoun }}</p>
        </div>

        <form class="guess-form" @submit.prevent="submitGuess">
          <input
            :ref="focusInput"
            v-model="guess"
            type="text"
            class="guess-input"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="La tua risposta…"
            :disabled="roundOver"
          />
          <button type="submit" class="primary-btn" :disabled="roundOver">Verifica</button>
        </form>

        <p v-if="feedback === 'correct'" class="feedback success">Esatto! 🎉</p>
        <p v-if="feedback === 'wrong'" class="feedback danger">
          Sbagliato. La forma corretta è: <strong>{{ correctForm }}</strong>
        </p>

        <button v-if="roundOver" type="button" class="primary-btn next-btn" @click="nextRound">
          Prossimo
        </button>
      </template>

      <button type="button" class="reset-btn" @click="newGame">Nuova partita</button>
    </div>
  </div>
</template>

<style scoped>
.coniuga-card {
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

.prompt {
  margin: 0.75rem 0 1rem;
  padding: 0.9rem 1rem;
  background: #fff;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 10px;
}

.verb-line {
  margin: 0 0 0.3rem;
  font-size: 1.3rem;
}

.fr-hint {
  margin-left: 0.4rem;
  font-size: 0.85rem;
  font-weight: 400;
  color: #6b6156;
}

.tense-line {
  margin: 0 0 0.2rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #b0692e;
}

.pronoun-line {
  margin: 0;
  font-size: 1.05rem;
  text-transform: lowercase;
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

.guess-input:disabled {
  opacity: 0.7;
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

.retry-btn,
.next-btn {
  display: block;
  margin-top: 0.6rem;
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
  .coniuga-card {
    padding: 1rem;
  }

  .guess-form {
    flex-direction: column;
  }

  .primary-btn {
    width: 100%;
  }
}
</style>
