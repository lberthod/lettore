<script setup>
// Mini-jeu « Rimetti in ordine » : une phrase italienne authentique du
// catalogue est mélangée mot par mot, le joueur doit reconstituer l'ordre
// original en cliquant les mots dans la bonne séquence, aidé d'un indice en
// français (la traduction, quand elle existe pour cette phrase).
//
// Composant autonome (aucune prop, aucun état partagé) : il pioche lui-même
// un échantillon de textes du catalogue au montage, en filtrant les phrases
// de taille raisonnable pour garder la rangée de mots lisible, afin d'être
// embarqué tel quel dans une page « Giochi » sans chrome de page.
import { ref, onMounted } from 'vue'
import textsIndex from '../../texts/index.json'
import { freeTexts } from 'virtual:free-content'
import { loadCatalogText } from '../../lib/protectedContent.js'
import { logActivity } from '../../progress.js'

const SAMPLE_SIZE = 18
const MIN_WORDS = 4
const MAX_WORDS = 9
const MAX_CHARS = 70
const MIN_POOL = 5
const TARGET_POOL = 8
const MAX_FETCH_ATTEMPTS = 4

const loading = ref(true)
const loadError = ref('')

const pool = ref([]) // [{ it, fr }]
const currentSentence = ref(null) // { it, fr }
const originalWords = ref([]) // string[]
const shuffledWords = ref([]) // [{ word, id, used }]
const placedOrder = ref([]) // indices (into shuffledWords) in tap order
const resolved = ref(false)
const feedback = ref('') // '' | 'correct' | 'wrong'

const solvedCount = ref(0)
const attemptedCount = ref(0)

let previousSentence = null
let tileSeq = 0

function pickRandomIds(count) {
  const shuffled = [...textsIndex].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count).map((t) => t.id)
}

function suitableSentences(sentencesMap) {
  if (!sentencesMap) return []
  const out = []
  for (const [it, fr] of Object.entries(sentencesMap)) {
    const words = it.trim().split(/\s+/)
    if (words.length >= MIN_WORDS && words.length <= MAX_WORDS && it.length <= MAX_CHARS) {
      out.push({ it: it.trim(), fr })
    }
  }
  return out
}

// Les textes de l'aperçu gratuit (`virtual:free-content`) sont toujours
// accessibles, sans connexion ni lecture Firestore : on les charge tous en
// priorité pour garantir un stock de phrases même à un visiteur anonyme
// (seuls ~6 textes sur 466 sont dans cet aperçu, un tirage aléatoire dans
// l'index complet les manquerait presque toujours). Le reste du catalogue ne
// sert qu'en complément, pour les comptes connectés dont le rôle autorise la
// lecture Firestore.
async function fetchSentencePool() {
  const collected = []
  const seen = new Set()

  const freeDocs = await Promise.all(Object.values(freeTexts).map((load) => load()))
  for (const text of freeDocs) {
    if (!text || !text.sentences) continue
    for (const s of suitableSentences(text.sentences)) {
      if (seen.has(s.it)) continue
      seen.add(s.it)
      collected.push(s)
    }
  }

  let attempts = 0
  while (collected.length < TARGET_POOL && attempts < MAX_FETCH_ATTEMPTS) {
    attempts += 1
    const ids = pickRandomIds(SAMPLE_SIZE)
    const texts = await Promise.all(ids.map((id) => loadCatalogText(id).catch(() => null)))
    for (const text of texts) {
      if (!text || !text.sentences) continue
      for (const s of suitableSentences(text.sentences)) {
        if (seen.has(s.it)) continue
        seen.add(s.it)
        collected.push(s)
      }
    }
  }
  return collected
}

function shuffleWords(words) {
  const arr = [...words]
  const original = words.join(' ')
  let attempt
  let guardCount = 0
  do {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    attempt = arr.join(' ')
    guardCount++
  } while (attempt === original && guardCount < 20)
  return arr
}

function pickSentence() {
  if (!pool.value.length) return null
  if (pool.value.length === 1) return pool.value[0]
  let candidate
  do {
    candidate = pool.value[Math.floor(Math.random() * pool.value.length)]
  } while (candidate.it === previousSentence)
  return candidate
}

function startRound() {
  const sentence = pickSentence()
  if (!sentence) return
  previousSentence = sentence.it
  currentSentence.value = sentence
  originalWords.value = sentence.it.trim().split(/\s+/)
  shuffledWords.value = shuffleWords(originalWords.value).map((word) => ({
    word,
    id: tileSeq++,
    used: false,
  }))
  placedOrder.value = []
  resolved.value = false
  feedback.value = ''
}

function tapTile(tile) {
  if (resolved.value) return
  const idx = placedOrder.value.indexOf(tile.id)
  if (idx !== -1) {
    // Déjà placé : le retirer (annuler) et le remettre dans la réserve.
    placedOrder.value.splice(idx, 1)
    tile.used = false
  } else {
    tile.used = true
    placedOrder.value.push(tile.id)
  }
}

function tileById(id) {
  return shuffledWords.value.find((t) => t.id === id)
}

function verify() {
  if (resolved.value || !currentSentence.value) return
  if (placedOrder.value.length !== originalWords.value.length) return
  const built = placedOrder.value.map((id) => tileById(id).word).join(' ')
  const isCorrect = built.toLowerCase() === currentSentence.value.it.toLowerCase()
  resolved.value = true
  feedback.value = isCorrect ? 'correct' : 'wrong'
  attemptedCount.value += 1
  if (isCorrect) solvedCount.value += 1
  logActivity({
    skill: 'lettura',
    mode: 'rimetti-ordine',
    score: isCorrect ? 1 : 0,
    total: 1,
  })
}

function nextSentence() {
  startRound()
}

onMounted(async () => {
  try {
    const sentences = await fetchSentencePool()
    pool.value = sentences
    if (sentences.length < MIN_POOL) {
      loadError.value = 'Contenuto non disponibile al momento, riprova più tardi.'
    } else {
      startRound()
    }
  } catch {
    loadError.value = 'Contenuto non disponibile al momento, riprova più tardi.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="rio-card">
    <header class="header">
      <h3>Rimetti in ordine</h3>
      <p class="subtitle">Tocca le parole nell'ordine giusto per ricomporre la frase.</p>
    </header>

    <div v-if="loading" class="state-msg">Caricamento…</div>
    <div v-else-if="loadError" class="state-msg error-msg">{{ loadError }}</div>

    <div v-else class="game">
      <div class="stats">
        <span class="stat-label">Punteggio</span>
        <span class="stat-value">{{ solvedCount }} / {{ attemptedCount }}</span>
      </div>

      <p v-if="currentSentence?.fr" class="hint">
        Indizio (FR) : <strong>{{ currentSentence.fr }}</strong>
      </p>

      <div class="build-zone" :class="{ empty: !placedOrder.length }">
        <span v-if="!placedOrder.length" class="build-placeholder"
          >Tocca le parole qui sotto…</span
        >
        <button
          v-for="id in placedOrder"
          :key="id"
          type="button"
          class="tile placed"
          :disabled="resolved"
          @click="tapTile(tileById(id))"
        >
          {{ tileById(id).word }}
        </button>
      </div>

      <div class="pool">
        <button
          v-for="tile in shuffledWords"
          v-show="!tile.used"
          :key="tile.id"
          type="button"
          class="tile"
          @click="tapTile(tile)"
        >
          {{ tile.word }}
        </button>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary-btn"
          :disabled="resolved || placedOrder.length !== originalWords.length"
          @click="verify"
        >
          Verifica
        </button>
        <button type="button" class="secondary-btn" @click="nextSentence">
          Prossima frase
        </button>
      </div>

      <p v-if="feedback === 'correct'" class="feedback success">Esatto! 🎉</p>
      <p v-if="feedback === 'wrong'" class="feedback danger">
        Non esatto. L'ordine corretto era:
        <strong>{{ originalWords.join(' ') }}</strong>
      </p>
    </div>
  </div>
</template>

<style scoped>
.rio-card {
  background: #faf6f0;
  color: #2c2620;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 14px;
  padding: 1.5rem;
  max-width: 480px;
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

.stats {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.stat-label {
  font-size: 0.75rem;
  color: #6b6156;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.stat-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: #b0692e;
}

.hint {
  margin: 0 0 0.9rem;
  font-size: 0.95rem;
}

.build-zone {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  min-height: 3rem;
  padding: 0.6rem;
  margin-bottom: 0.9rem;
  background: #fff;
  border: 1px dashed rgba(176, 105, 46, 0.4);
  border-radius: 10px;
}

.build-zone.empty {
  align-items: center;
  justify-content: center;
}

.build-placeholder {
  font-size: 0.85rem;
  color: #6b6156;
  font-style: italic;
}

.pool {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1rem;
  min-height: 2.4rem;
}

.tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.4rem 0.75rem;
  background: #fff;
  border: 1px solid rgba(176, 105, 46, 0.35);
  border-radius: 999px;
  color: #2c2620;
  font: inherit;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.tile:hover:not(:disabled) {
  background: rgba(176, 105, 46, 0.08);
  border-color: #b0692e;
}

.tile.placed {
  background: rgba(176, 105, 46, 0.12);
  border-color: #b0692e;
}

.tile:disabled {
  cursor: default;
  opacity: 0.85;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
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

.secondary-btn {
  padding: 0.55rem 1.2rem;
  border: 1px solid rgba(176, 105, 46, 0.35);
  border-radius: 8px;
  background: transparent;
  color: #b0692e;
  font: inherit;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.secondary-btn:hover {
  background: rgba(176, 105, 46, 0.08);
  border-color: #b0692e;
}

.feedback {
  margin: 0.9rem 0 0;
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

@media (max-width: 360px) {
  .rio-card {
    padding: 1rem;
  }

  .tile {
    padding: 0.35rem 0.6rem;
    font-size: 0.85rem;
  }

  .actions {
    flex-direction: column;
  }

  .primary-btn,
  .secondary-btn {
    width: 100%;
  }
}
</style>
