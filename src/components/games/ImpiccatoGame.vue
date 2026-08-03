<script setup>
// Mini-jeu de vocabulaire « Impiccato » (pendu italien) : un mot italien
// tiré au sort dans le dictionnaire est affiché en tirets, le joueur propose
// des lettres sur un clavier italien à l'écran et dispose de 6 essais avant
// de perdre. La traduction française est affichée en sous-titre : ce n'est
// pas un défi de devinette pure mais un exercice de mémorisation lexicale.
import { ref, computed, onMounted } from 'vue'
import { allLemmas } from '../../lib/dictionary.js'
import { logActivity } from '../../progress.js'

const MAX_LIVES = 6

// Clavier italien : les 21 lettres de l'alphabet traditionnel + les lettres
// « étrangères » présentes dans des emprunts du dictionnaire (bar, jeans,
// weekend…) + les voyelles accentuées possibles en italien.
const ALPHABET = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
  'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
]
const ACCENTED = ['à', 'è', 'é', 'ì', 'ò', 'ù']

// Mots utilisables : un seul mot (pas d'idiome), longueur raisonnable pour
// une grille de pendu lisible, uniquement des lettres (chiffres/ponctuation
// exclus pour rester simple — les apostrophes aussi).
const WORD_RE = /^[a-zàèéìòù]+$/i

const loading = ref(true)
const loadError = ref('')
const pool = ref([])

const currentWord = ref('')
const currentFr = ref('')
const guessed = ref(new Set())
const wrongCount = ref(0)
const status = ref('playing') // 'playing' | 'won' | 'lost'
const roundLogged = ref(false)

const score = ref({ wins: 0, total: 0 })

const livesLeft = computed(() => Math.max(0, MAX_LIVES - wrongCount.value))

const wordLetters = computed(() =>
  new Set(currentWord.value.toLowerCase().split(''))
)

const displayLetters = computed(() =>
  currentWord.value
    .toLowerCase()
    .split('')
    .map((ch) => (status.value === 'lost' || guessed.value.has(ch) ? ch : '_'))
)

function pickWord() {
  const entry = pool.value[Math.floor(Math.random() * pool.value.length)]
  currentWord.value = entry.lemma.toLowerCase()
  currentFr.value = entry.fr || ''
}

function startRound() {
  if (!pool.value.length) return
  pickWord()
  guessed.value = new Set()
  wrongCount.value = 0
  status.value = 'playing'
  roundLogged.value = false
}

function finishRound(won) {
  if (roundLogged.value) return
  roundLogged.value = true
  status.value = won ? 'won' : 'lost'
  score.value.total += 1
  if (won) score.value.wins += 1
  logActivity({ skill: 'lessico', mode: 'impiccato', score: won ? 1 : 0, total: 1 })
}

function guessLetter(letter) {
  if (status.value !== 'playing' || guessed.value.has(letter)) return
  // Nouvelle Set pour déclencher la réactivité (Set muté en place ne l'est pas).
  const next = new Set(guessed.value)
  next.add(letter)
  guessed.value = next

  if (wordLetters.value.has(letter)) {
    const allFound = [...wordLetters.value].every((l) => next.has(l))
    if (allFound) finishRound(true)
  } else {
    wrongCount.value += 1
    if (wrongCount.value >= MAX_LIVES) finishRound(false)
  }
}

function keyState(letter) {
  if (!guessed.value.has(letter)) return ''
  return wordLetters.value.has(letter) ? 'correct' : 'wrong'
}

onMounted(async () => {
  try {
    const entries = await allLemmas()
    pool.value = entries.filter(
      (e) =>
        e.lemma &&
        !e.lemma.includes(' ') &&
        e.lemma.length >= 4 &&
        e.lemma.length <= 10 &&
        WORD_RE.test(e.lemma)
    )
    if (!pool.value.length) {
      loadError.value = 'Nessuna parola disponibile per questo gioco.'
    } else {
      startRound()
    }
  } catch {
    loadError.value = 'Impossibile caricare il dizionario. Riprova più tardi.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="impiccato-card">
    <h3 class="game-title">Impiccato</h3>

    <p v-if="loading" class="status-text">Caricamento del dizionario…</p>
    <p v-else-if="loadError" class="status-text error-text">{{ loadError }}</p>

    <template v-else>
      <div class="lives" role="status" aria-label="Vite rimanenti">
        <span
          v-for="n in MAX_LIVES"
          :key="n"
          class="life"
          :class="{ lost: n > livesLeft }"
          aria-hidden="true"
        >{{ n > livesLeft ? '○' : '●' }}</span>
        <span class="lives-count">{{ livesLeft }} / {{ MAX_LIVES }}</span>
      </div>

      <p class="word-display">{{ displayLetters.join(' ') }}</p>
      <p class="hint">Traduzione: <strong>{{ currentFr || '—' }}</strong></p>

      <div class="keyboard">
        <button
          v-for="l in ALPHABET"
          :key="l"
          type="button"
          class="key"
          :class="keyState(l)"
          :disabled="status !== 'playing' || guessed.has(l)"
          @click="guessLetter(l)"
        >{{ l }}</button>
        <span class="key-sep" aria-hidden="true"></span>
        <button
          v-for="l in ACCENTED"
          :key="l"
          type="button"
          class="key accented"
          :class="keyState(l)"
          :disabled="status !== 'playing' || guessed.has(l)"
          @click="guessLetter(l)"
        >{{ l }}</button>
      </div>

      <p v-if="status === 'won'" class="message success">
        🎉 Complimenti! La parola era <strong>{{ currentWord }}</strong>.
        Punteggio: {{ score.wins }} / {{ score.total }}
      </p>
      <p v-else-if="status === 'lost'" class="message danger">
        Peccato! La parola era <strong>{{ currentWord }}</strong>.
        Punteggio: {{ score.wins }} / {{ score.total }}
      </p>

      <button
        v-if="status !== 'playing'"
        type="button"
        class="retry-btn"
        @click="startRound"
      >{{ status === 'won' ? 'Nuova parola' : 'Riprova' }}</button>
    </template>
  </div>
</template>

<style scoped>
.impiccato-card {
  background: #faf6f0;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.5rem;
  max-width: 32rem;
  margin: 0 auto;
  box-sizing: border-box;
}

.game-title {
  margin: 0 0 1rem;
  font-size: 1.1rem;
  font-weight: 700;
  color: #2c2620;
}

.status-text {
  margin: 0;
  font-size: 0.95rem;
  color: #6b6156;
}

.status-text.error-text {
  color: #a5382a;
}

.lives {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.9rem;
}

.life {
  font-size: 1.1rem;
  line-height: 1;
  color: #b0692e;
}

.life.lost {
  color: rgba(176, 105, 46, 0.3);
}

.lives-count {
  margin-left: 0.4rem;
  font-size: 0.82rem;
  color: #6b6156;
}

.word-display {
  margin: 0 0 0.5rem;
  font-family: 'Courier New', Courier, monospace;
  font-size: clamp(1.4rem, 6vw, 2rem);
  letter-spacing: 0.35em;
  text-align: center;
  word-break: break-all;
}

.hint {
  margin: 0 0 1.1rem;
  text-align: center;
  font-size: 0.9rem;
  color: #6b6156;
}

.hint strong {
  color: #2c2620;
}

.keyboard {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  justify-content: center;
  margin-bottom: 1rem;
}

.key-sep {
  flex-basis: 100%;
  height: 0.15rem;
}

.key {
  min-width: 2.1rem;
  height: 2.1rem;
  padding: 0 0.3rem;
  border: 1px solid rgba(176, 105, 46, 0.35);
  border-radius: 8px;
  background: #fff;
  color: #2c2620;
  font: inherit;
  font-weight: 600;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s, opacity 0.12s;
}

.key.accented {
  text-transform: none;
}

.key:hover:not(:disabled) {
  background: #f0e4d8;
  border-color: #b0692e;
}

.key:disabled {
  cursor: default;
}

.key.correct {
  background: #e4f2e2;
  border-color: #2f6b2f;
  color: #2f6b2f;
  opacity: 1;
}

.key.wrong {
  background: #f7e4e0;
  border-color: #a5382a;
  color: #a5382a;
  opacity: 0.7;
}

.key:disabled:not(.correct):not(.wrong) {
  opacity: 0.4;
}

.message {
  margin: 0 0 0.9rem;
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  font-size: 0.92rem;
  text-align: center;
}

.message.success {
  background: #e4f2e2;
  color: #2f6b2f;
}

.message.danger {
  background: #f7e4e0;
  color: #a5382a;
}

.retry-btn {
  display: block;
  margin: 0 auto;
  padding: 0.55rem 1.3rem;
  border: none;
  border-radius: 999px;
  background: #b0692e;
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s;
}

.retry-btn:hover {
  background: #995a26;
}

@media (max-width: 400px) {
  .impiccato-card {
    padding: 1rem;
  }

  .key {
    min-width: 1.9rem;
    height: 1.9rem;
    font-size: 0.85rem;
  }
}
</style>
