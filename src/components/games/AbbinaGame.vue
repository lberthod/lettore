<template>
  <div class="abbina-game">
    <header class="abbina-header">
      <h3>Abbina le parole</h3>
      <p class="abbina-sub">Trova la traduzione francese di ogni parola italiana.</p>
    </header>

    <div v-if="loading" class="abbina-state">Caricamento del vocabolario…</div>

    <div v-else-if="loadError" class="abbina-state abbina-error">
      Impossibile caricare il vocabolario. Riprova più tardi.
    </div>

    <div v-else-if="pool.length < 6" class="abbina-state abbina-error">
      Non ci sono abbastanza parole disponibili per iniziare una partita.
    </div>

    <template v-else>
      <div class="abbina-status">
        <span>Tentativi sbagliati : <strong>{{ wrongCount }}</strong></span>
        <span>Coppie trovate : <strong>{{ matchedCount }} / 6</strong></span>
      </div>

      <div class="abbina-columns">
        <ul class="abbina-column">
          <li v-for="item in italianItems" :key="'it-' + item.id">
            <button
              type="button"
              class="abbina-tile"
              :class="tileClass(item, 'it')"
              :disabled="item.matched"
              @click="select('it', item)"
            >
              {{ item.lemma }}
            </button>
          </li>
        </ul>

        <ul class="abbina-column">
          <li v-for="item in frenchItems" :key="'fr-' + item.id">
            <button
              type="button"
              class="abbina-tile"
              :class="tileClass(item, 'fr')"
              :disabled="item.matched"
              @click="select('fr', item)"
            >
              {{ item.fr }}
            </button>
          </li>
        </ul>
      </div>

      <div v-if="roundComplete" class="abbina-complete">
        <p class="abbina-complete-title">Partita completata !</p>
        <p>
          Tentativi sbagliati : <strong>{{ wrongCount }}</strong> — Punteggio :
          <strong>{{ score }} / 6</strong>
        </p>
        <button type="button" class="abbina-btn" @click="startNewRound">Nuova partita</button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { allLemmas } from '../../lib/dictionary.js'
import { logActivity } from '../../progress.js'

const PAIR_COUNT = 6

const loading = ref(true)
const loadError = ref(false)
const pool = ref([])

const pairs = ref([]) // [{ id, lemma, fr }]
const italianItems = ref([])
const frenchItems = ref([])

const selectedIt = ref(null)
const selectedFr = ref(null)
const wrongFlash = reactive(new Set()) // ids currently flashing red
const wrongCount = ref(0)
const roundComplete = ref(false)
const loggedThisRound = ref(false)

const matchedCount = computed(() => pairs.value.filter((p) => p.matched).length)

const score = computed(() => Math.max(0, PAIR_COUNT - wrongCount.value))

function isUsableEntry(entry) {
  if (!entry) return false
  const { lemma, fr } = entry
  if (!lemma || !fr) return false
  if (lemma.length < 3 || lemma.length > 12) return false
  if (/[^a-zàèéìòù]/i.test(lemma)) return false
  if (fr.length > 25) return false
  return true
}

function shuffle(arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickRandomPairs() {
  const shuffled = shuffle(pool.value)
  return shuffled.slice(0, PAIR_COUNT).map((entry, index) => ({
    id: index,
    lemma: entry.lemma,
    fr: entry.fr,
    matched: false,
  }))
}

function startNewRound() {
  pairs.value = pickRandomPairs()
  italianItems.value = shuffle(pairs.value.map((p) => ({ id: p.id, lemma: p.lemma, matched: false })))
  frenchItems.value = shuffle(pairs.value.map((p) => ({ id: p.id, fr: p.fr, matched: false })))
  selectedIt.value = null
  selectedFr.value = null
  wrongFlash.clear()
  wrongCount.value = 0
  roundComplete.value = false
  loggedThisRound.value = false
}

function tileClass(item, side) {
  const classes = []
  if (item.matched) classes.push('is-matched')
  if (wrongFlash.has(`${side}-${item.id}`)) classes.push('is-wrong')
  const selected = side === 'it' ? selectedIt.value : selectedFr.value
  if (selected && selected.id === item.id && !item.matched) classes.push('is-selected')
  return classes
}

function select(side, item) {
  if (item.matched || roundComplete.value) return

  if (side === 'it') {
    selectedIt.value = selectedIt.value && selectedIt.value.id === item.id ? null : item
  } else {
    selectedFr.value = selectedFr.value && selectedFr.value.id === item.id ? null : item
  }

  if (selectedIt.value && selectedFr.value) {
    checkMatch()
  }
}

function checkMatch() {
  const it = selectedIt.value
  const fr = selectedFr.value

  if (it.id === fr.id) {
    it.matched = true
    fr.matched = true
    const pair = pairs.value.find((p) => p.id === it.id)
    if (pair) pair.matched = true
    selectedIt.value = null
    selectedFr.value = null

    if (matchedCount.value === PAIR_COUNT) {
      finishRound()
    }
  } else {
    const itKey = `it-${it.id}`
    const frKey = `fr-${fr.id}`
    wrongFlash.add(itKey)
    wrongFlash.add(frKey)
    wrongCount.value += 1
    setTimeout(() => {
      wrongFlash.delete(itKey)
      wrongFlash.delete(frKey)
    }, 500)
    selectedIt.value = null
    selectedFr.value = null
  }
}

function finishRound() {
  roundComplete.value = true
  if (!loggedThisRound.value) {
    loggedThisRound.value = true
    logActivity({ skill: 'lessico', mode: 'abbina', score: score.value, total: PAIR_COUNT })
  }
}

onMounted(async () => {
  try {
    const entries = await allLemmas()
    pool.value = (entries || []).filter(isUsableEntry)
    if (pool.value.length >= PAIR_COUNT) {
      startNewRound()
    }
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.abbina-game {
  background: #faf6f0;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.5rem;
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    Roboto,
    sans-serif;
  max-width: 560px;
}

.abbina-header h3 {
  margin: 0 0 0.25rem;
  font-size: 1.25rem;
}

.abbina-sub {
  margin: 0 0 1rem;
  color: #6b5d4f;
  font-size: 0.9rem;
}

.abbina-state {
  padding: 1.5rem 0.5rem;
  text-align: center;
  color: #6b5d4f;
}

.abbina-error {
  background: #f7e4e0;
  color: #a5382a;
  border-radius: 10px;
  padding: 1rem;
}

.abbina-status {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
  color: #6b5d4f;
}

.abbina-columns {
  display: flex;
  gap: 1rem;
}

.abbina-column {
  flex: 1;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.abbina-tile {
  width: 100%;
  text-align: left;
  padding: 0.6rem 0.8rem;
  border-radius: 10px;
  border: 1px solid rgba(176, 105, 46, 0.3);
  background: #fff;
  color: #2c2620;
  font-size: 0.95rem;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    transform 0.1s ease;
}

.abbina-tile:hover:not(:disabled) {
  border-color: #b0692e;
}

.abbina-tile:active:not(:disabled) {
  transform: scale(0.98);
}

.abbina-tile.is-selected {
  border-color: #b0692e;
  background: rgba(176, 105, 46, 0.12);
}

.abbina-tile.is-matched {
  background: #e4f2e2;
  color: #2f6b2f;
  border-color: #2f6b2f;
  cursor: default;
}

.abbina-tile.is-wrong {
  background: #f7e4e0;
  color: #a5382a;
  border-color: #a5382a;
}

.abbina-tile:disabled {
  opacity: 0.9;
}

.abbina-complete {
  margin-top: 1.25rem;
  padding: 1rem;
  border-radius: 10px;
  background: rgba(176, 105, 46, 0.08);
  text-align: center;
}

.abbina-complete-title {
  margin: 0 0 0.4rem;
  font-weight: 600;
}

.abbina-btn {
  margin-top: 0.75rem;
  padding: 0.55rem 1.4rem;
  border: none;
  border-radius: 999px;
  background: #b0692e;
  color: #fff;
  font-size: 0.95rem;
  cursor: pointer;
}

.abbina-btn:hover {
  background: #9a5a26;
}

@media (max-width: 480px) {
  .abbina-columns {
    flex-direction: column;
  }
}
</style>
