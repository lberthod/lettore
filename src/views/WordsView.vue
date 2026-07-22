<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { progress, dueFavorites, reviewWord, MAX_BOX } from '../progress.js'
import { ttsSupported, speakItalian } from '../tts.js'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'

// --- Session de révision (répétition espacée) ---
const reviewing = ref(false)
const queue = ref([]) // mots de la session en cours
const current = ref(0)
const revealed = ref(false)
const sessionResults = ref({ known: 0, again: 0 })

const dueCount = computed(() => dueFavorites().length)
const currentWord = computed(() => queue.value[current.value] || null)

function startReview() {
  queue.value = [...dueFavorites()]
  if (!queue.value.length) return
  current.value = 0
  revealed.value = false
  sessionResults.value = { known: 0, again: 0 }
  reviewing.value = true
}

function answer(success) {
  reviewWord(currentWord.value.word, success)
  sessionResults.value[success ? 'known' : 'again']++
  revealed.value = false
  if (current.value + 1 < queue.value.length) {
    current.value++
  } else {
    reviewing.value = false
    queue.value = []
  }
}

function stopReview() {
  reviewing.value = false
  queue.value = []
}

// --- Liste complète ---
const listRevealed = ref(new Set())

function toggle(word) {
  const s = new Set(listRevealed.value)
  if (s.has(word)) s.delete(word)
  else s.add(word)
  listRevealed.value = s
}

function remove(word) {
  const i = progress.favorites.findIndex((f) => f.word === word)
  if (i >= 0) progress.favorites.splice(i, 1)
}

function speak(word) {
  speakItalian(word, { rate: progress.ttsRate })
}

// Plein écran : la page ne défile pas, seule la liste défile
onMounted(() => {
  document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <section class="words-screen">
    <!-- Scène en fond : ciel, soleil, collines, cyprès -->
    <div class="scene" aria-hidden="true">
      <svg viewBox="0 0 1200 520" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="wsky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fdf3e3" />
            <stop offset="100%" stop-color="#f7e3c8" />
          </linearGradient>
          <linearGradient id="whill1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#d9b98a" />
            <stop offset="100%" stop-color="#cfa873" />
          </linearGradient>
          <linearGradient id="whill2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c08b4d" />
            <stop offset="100%" stop-color="#b0692e" />
          </linearGradient>
          <linearGradient id="whill3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#8a5a2b" />
            <stop offset="100%" stop-color="#6f4722" />
          </linearGradient>
        </defs>

        <rect width="1200" height="520" fill="url(#wsky)" />

        <circle cx="950" cy="120" r="46" fill="#e8a84c" opacity="0.85" />
        <circle cx="950" cy="120" r="70" fill="none" stroke="#e8a84c" stroke-width="1.4" opacity="0.3" />

        <path d="M0 400 Q 200 300 420 360 T 800 350 Q 1020 320 1200 380 L 1200 520 L 0 520 Z" fill="url(#whill1)" />
        <path d="M0 450 Q 260 360 520 420 T 1200 430 L 1200 520 L 0 520 Z" fill="url(#whill2)" />
        <path d="M0 500 Q 300 440 640 480 T 1200 490 L 1200 520 L 0 520 Z" fill="url(#whill3)" />

        <g fill="#5a6e3f">
          <ellipse cx="150" cy="382" rx="9" ry="34" />
          <ellipse cx="174" cy="390" rx="7" ry="27" />
          <ellipse cx="1030" cy="400" rx="8" ry="30" />
          <ellipse cx="1052" cy="408" rx="6" ry="23" />
        </g>
      </svg>
    </div>

    <!-- Barre de navigation commune -->
    <SiteHeader />

    <!-- Contenu -->
    <div class="stage">
      <div class="head">
        <h2>☆ Mes mots</h2>
        <p v-if="progress.favorites.length" class="head-sub">
          {{ progress.favorites.length }}
          {{ progress.favorites.length > 1 ? 'mots récoltés' : 'mot récolté' }} en lisant
        </p>
      </div>

      <p v-if="!progress.favorites.length" class="empty">
        Aucun mot enregistré pour l'instant. Pendant la lecture, cliquez sur
        l'étoile ☆ dans la bulle de traduction pour ajouter un mot ici.<br />
        <RouterLink :to="{ name: 'library' }">Choisir un texte →</RouterLink>
      </p>

      <template v-else>
        <!-- Session de révision -->
        <div v-if="reviewing && currentWord" class="review-card">
          <p class="review-progress">
            Mot {{ current + 1 }} / {{ queue.length }}
          </p>
          <p class="review-word">
            {{ currentWord.word }}
            <button
              v-if="ttsSupported"
              class="speak"
              title="Écouter en italien"
              @click="speak(currentWord.word)"
            >
              🔊
            </button>
          </p>
          <p v-if="revealed" class="review-translation">
            {{ currentWord.translation }}
          </p>
          <div class="review-actions">
            <button v-if="!revealed" class="btn reveal" @click="revealed = true">
              Afficher la traduction
            </button>
            <template v-else>
              <button class="btn known" @click="answer(true)">
                ✓ Je savais
              </button>
              <button class="btn again" @click="answer(false)">
                ✗ À revoir
              </button>
            </template>
          </div>
          <button class="review-quit" @click="stopReview">
            Arrêter la session
          </button>
        </div>

        <!-- Invitation à réviser -->
        <div v-else class="review-banner">
          <template v-if="dueCount">
            <span>
              <strong>{{ dueCount }}</strong>
              {{ dueCount > 1 ? 'mots à réviser' : 'mot à réviser' }}
              aujourd'hui.
            </span>
            <button class="btn start" @click="startReview">
              Commencer la révision
            </button>
          </template>
          <span v-else class="all-done">
            ✓ Tout est révisé pour aujourd'hui.
            <template v-if="sessionResults.known + sessionResults.again">
              Session : {{ sessionResults.known }} su{{
                sessionResults.known > 1 ? 's' : ''
              }}, {{ sessionResults.again }} à revoir.
            </template>
            Revenez demain — les intervalles s'allongent à chaque réussite.
          </span>
        </div>

        <ul class="list">
          <li
            v-for="f in progress.favorites"
            :key="f.word"
            class="entry"
            @click="toggle(f.word)"
          >
            <span class="word">
              {{ f.word }}
              <button
                v-if="ttsSupported"
                class="speak"
                title="Écouter en italien"
                @click.stop="speak(f.word)"
              >
                🔊
              </button>
            </span>
            <span
              class="translation"
              :class="{ hidden: !listRevealed.has(f.word) }"
            >
              {{ f.translation }}
            </span>
            <span
              class="level"
              :title="`Niveau de mémorisation : ${f.box || 0} / ${MAX_BOX}`"
            >
              <span
                v-for="i in MAX_BOX"
                :key="i"
                class="dot"
                :class="{ on: i <= (f.box || 0) }"
              ></span>
            </span>
            <span class="actions">
              <RouterLink
                class="source"
                :to="{ name: 'reader', params: { id: f.textId } }"
                title="Revoir le texte"
                @click.stop
                >texte</RouterLink
              >
              <button class="remove" title="Retirer" @click.stop="remove(f.word)">
                ✕
              </button>
            </span>
          </li>
        </ul>
      </template>
    </div>

    <!-- Pied de page commun -->
    <SiteFooter />
  </section>
</template>

<style scoped>
.words-screen {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(180deg, #fdf3e3 0%, #f7e3c8 100%);
}

.scene {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.scene svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* --- Contenu --- */

.stage {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 1.6rem 1.5rem 0;
}

.head {
  margin-bottom: 1rem;
}

.head h2 {
  font-size: 1.5rem;
  margin: 0;
}

.head-sub {
  margin: 0.15rem 0 0;
  font-size: 0.85rem;
  color: #8a5a2b;
}

.empty {
  font-size: 0.95rem;
  line-height: 1.7;
  padding: 1rem 1.2rem;
  border: 1px solid #e4d9c6;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.empty a {
  color: #b0692e;
}

/* --- Bandeau et session de révision --- */
.review-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem;
  padding: 0.9rem 1.1rem;
  border: 1px solid #e4d9c6;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  font-size: 0.95rem;
}

.all-done {
  opacity: 0.75;
}

.review-card {
  padding: 1.6rem 1.5rem;
  border: 1px solid #e4d9c6;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  text-align: center;
}

.review-progress {
  margin: 0 0 0.8rem;
  font-size: 0.8rem;
  opacity: 0.55;
}

.review-word {
  margin: 0 0 0.6rem;
  font-size: 1.7rem;
  font-weight: 700;
}

.review-translation {
  margin: 0 0 0.4rem;
  font-size: 1.15rem;
  color: #4a7c59;
  font-weight: 600;
}

.review-actions {
  display: flex;
  justify-content: center;
  gap: 0.7rem;
  margin-top: 1rem;
}

.btn {
  padding: 0.5rem 1.1rem;
  border-radius: 999px;
  border: 1px solid #d8cfc2;
  background: #faf6f0;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.btn.start,
.btn.reveal {
  background: #b0692e;
  border-color: #b0692e;
  color: #faf6f0;
}

.btn.start:hover,
.btn.reveal:hover {
  background: #9a5a25;
}

.btn.known {
  background: #4a7c59;
  border-color: #4a7c59;
  color: #faf6f0;
}

.btn.again {
  background: #fff;
  border-color: #a34430;
  color: #a34430;
}

.review-quit {
  margin-top: 1rem;
  background: none;
  border: none;
  color: #6b6156;
  font-size: 0.8rem;
  cursor: pointer;
  text-decoration: underline;
  opacity: 0.7;
}

/* --- Liste (défile à l'intérieur de l'écran) --- */
.list {
  list-style: none;
  margin: 1rem 0 0;
  padding: 0 0 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
  min-height: 0;
  flex: 1;
}

.entry {
  display: grid;
  grid-template-columns: 1fr 1fr auto auto;
  gap: 0.8rem;
  align-items: center;
  padding: 0.6rem 0.9rem;
  border: 1px solid #e4d9c6;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  cursor: pointer;
}

.entry:hover {
  border-color: #b0692e;
}

.word {
  font-weight: 600;
  font-size: 1.05rem;
}

.speak {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0 0.2rem;
  opacity: 0.7;
}

.speak:hover {
  opacity: 1;
}

.translation {
  transition: filter 0.15s, opacity 0.15s;
}

.translation.hidden {
  filter: blur(6px);
  opacity: 0.55;
  user-select: none;
}

.level {
  display: inline-flex;
  gap: 0.2rem;
}

.dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #e4dccf;
}

.dot.on {
  background: #4a7c59;
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.source {
  font-size: 0.8rem;
  color: #b0692e;
  text-decoration: none;
}

.source:hover {
  text-decoration: underline;
}

.remove {
  background: none;
  border: none;
  color: #a34430;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.1rem;
  opacity: 0.6;
}

.remove:hover {
  opacity: 1;
}

@media (max-width: 600px) {
  .entry {
    grid-template-columns: 1fr 1fr;
  }

  .level {
    order: 3;
  }

  .actions {
    order: 4;
    justify-self: end;
  }
}
</style>
