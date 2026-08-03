<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import {
  progress,
  dueFavorites,
  reviewWord,
  dueErrorCards,
  reviewErrorCard,
  removeErrorCard,
  logActivity,
  MAX_BOX,
} from '../progress.js'
import { ttsSupported, speakItalian } from '../tts.js'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { isPremiumPlus } from '../lib/access.js'
import { suggestProductionFromReview } from '../lib/continuity.js'
import { buildExercise, checkExerciseAnswer } from '../lib/errorExercises.js'
import { guessGrammarTopic } from '../lib/grammarLinks.js'

// --- Session de révision (répétition espacée) ---
// La file mélange deux sortes de cartes : les mots favoris dus, puis les
// cartes d'erreur dues (productions fautives à corriger). Chaque élément est
// { kind: 'word'|'error', item }.
const reviewing = ref(false)
const queue = ref([]) // cartes de la session en cours
const current = ref(0)
const revealed = ref(false)
const sessionResults = ref({ known: 0, again: 0, difficile: 0 })
let reviewedCount = 0 // cartes effectivement répondues dans la session
// Mots (pas les cartes d'erreur) effectivement révisés dans la session en
// cours : sert de base à la suggestion de production après révision (§9.3).
let reviewedWords = []

// Premium IA : la suggestion de production après révision (§9.3) pointe
// vers l'écriture, réservée à Premium IA — même schéma que HomeView/percorso.js.
const premiumIA = ref(false)
isPremiumPlus().then((v) => {
  premiumIA.value = v
})
// UNE seule suite recommandée après une session de révision terminée (§9.3,
// §3.1) : réutiliser 2-3 mots revus dans une courte production. `null` sinon.
const afterReview = ref(null)

const dueWords = computed(() => dueFavorites().length)
const dueErrors = computed(() => dueErrorCards().length)
const dueCount = computed(() => dueWords.value + dueErrors.value)
const currentCard = computed(() => queue.value[current.value] || null)

// --- Exercices sur les cartes d'erreur (IntegartioNOptimsaitonPedago.MD
// §8.2) : le type d'exercice dépend du type d'erreur (lib/errorExercises.js).
const exercise = computed(() =>
  currentCard.value?.kind === 'error' ? buildExercise(currentCard.value.item) : null
)
const exerciseAttempt = ref('')
const exerciseFeedback = ref(null) // null | 'correct' | 'wrong'

function checkExercise() {
  if (!exercise.value || !exerciseAttempt.value.trim()) return
  exerciseFeedback.value = checkExerciseAnswer(exercise.value, exerciseAttempt.value) ? 'correct' : 'wrong'
  revealed.value = true
}

function chooseOption(opt) {
  exerciseAttempt.value = opt
  exerciseFeedback.value = opt === exercise.value.correct ? 'correct' : 'wrong'
  revealed.value = true
}

// Lien vers la fiche grammaticale correspondante (§9.4) : une ancre précise
// quand un indice lexical simple permet de la deviner, sinon aucun lien
// plutôt qu'un mauvais aiguillage.
const grammarTopic = computed(() =>
  currentCard.value?.kind === 'error'
    ? guessGrammarTopic(currentCard.value.item.original, currentCard.value.item.correction)
    : null
)
const grammarLink = computed(() => {
  const topic = grammarTopic.value
  if (!topic || currentCard.value?.kind !== 'error') return null
  const item = currentCard.value.item
  return {
    name: 'grammar',
    hash: `#${topic}`,
    query: {
      from: 'erreur',
      topic,
      errOriginal: item.original,
      errCorrection: item.correction,
      errType: item.type,
      errExplanation: item.explanation || undefined,
    },
  }
})

// Étiquettes des types de carte d'erreur (mêmes identifiants que le serveur).
const TYPE_LABELS = {
  grammatica: 'Grammatica',
  lessico: 'Lessico',
  registro: 'Registro',
  ortografia: 'Ortografia',
  pronuncia: 'Pronuncia',
}
function typeLabel(type) {
  return TYPE_LABELS[type] || type || 'Errore'
}

const route = useRoute()

function startReview() {
  queue.value = [
    ...dueFavorites().map((item) => ({ kind: 'word', item })),
    ...dueErrorCards().map((item) => ({ kind: 'error', item })),
  ]
  // Arrivée depuis l'étape « review » d'une session composée
  // (lib/percorso.js#composeSession) : elle a annoncé une durée basée sur
  // REVIEW_STEP_CAP éléments, pas sur tout ce qui est dû — sans ce plafond,
  // la promesse de durée de la session est rompue dès qu'on clique l'étape.
  // Une visite directe de /words (pas de `limit`) révise tout ce qui est dû.
  const limit = Number(route.query.limit)
  if (Number.isFinite(limit) && limit > 0) {
    queue.value = queue.value.slice(0, limit)
  }
  if (!queue.value.length) return
  current.value = 0
  revealed.value = false
  exerciseAttempt.value = ''
  exerciseFeedback.value = null
  sessionResults.value = { known: 0, again: 0, difficile: 0 }
  reviewedCount = 0
  reviewedWords = []
  afterReview.value = null
  reviewing.value = true
}

function endSession() {
  reviewing.value = false
  queue.value = []
  // Session terminée : journalisée dans le parcours (touchStreak est appelé
  // automatiquement par logActivity) — sauf si rien n'a été répondu.
  if (reviewedCount > 0) {
    logActivity({ skill: 'vocabolario', reviewed: reviewedCount })
    afterReview.value = suggestProductionFromReview(reviewedWords, {
      hasPremiumIA: premiumIA.value,
    })
  }
}

// `outcome` : true/false pour un mot (inchangé) ; pour une carte d'erreur,
// 'oublie' | 'difficile' | 'su' — Leitner à trois réponses (§8.3).
function answer(outcome) {
  const card = currentCard.value
  if (!card) return
  if (card.kind === 'word') {
    reviewWord(card.item.word, outcome)
    reviewedWords.push(card.item.word)
    sessionResults.value[outcome ? 'known' : 'again']++
  } else {
    reviewErrorCard(card.item.id, outcome)
    if (outcome === 'difficile') sessionResults.value.difficile++
    else sessionResults.value[outcome === 'su' ? 'known' : 'again']++
  }
  reviewedCount++
  revealed.value = false
  exerciseAttempt.value = ''
  exerciseFeedback.value = null
  if (current.value + 1 < queue.value.length) {
    current.value++
  } else {
    endSession()
  }
}

// Poubelle sur une carte d'erreur : la carte quitte le paquet ET la session
// en cours, sans compter comme une réponse.
function trashCurrentCard() {
  const card = currentCard.value
  if (!card || card.kind !== 'error') return
  removeErrorCard(card.item.id)
  queue.value.splice(current.value, 1)
  revealed.value = false
  exerciseAttempt.value = ''
  exerciseFeedback.value = null
  if (current.value >= queue.value.length) endSession()
}

// Arrêt anticipé : les cartes déjà répondues comptent quand même.
function stopReview() {
  endSession()
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

      <p v-if="!progress.favorites.length && !progress.errorCards.length" class="empty">
        Aucun mot enregistré pour l'instant. Pendant la lecture, cliquez sur
        l'étoile ☆ dans la bulle de traduction pour ajouter un mot ici.<br />
        <RouterLink :to="{ name: 'library' }">Choisir un texte →</RouterLink>
      </p>

      <template v-else>
        <!-- Session de révision : mots favoris puis cartes d'erreur -->
        <div v-if="reviewing && currentCard" class="review-card">
          <p class="review-progress">
            Carte {{ current + 1 }} / {{ queue.length }}
          </p>

          <!-- Carte « mot » -->
          <template v-if="currentCard.kind === 'word'">
            <p class="review-word">
              {{ currentCard.item.word }}
              <button
                v-if="ttsSupported"
                class="speak"
                title="Écouter en italien"
                @click="speak(currentCard.item.word)"
              >
                🔊
              </button>
            </p>
            <p v-if="revealed" class="review-translation">
              {{ currentCard.item.translation }}
            </p>
          </template>

          <!-- Carte « erreur » : exercice adapté au type d'erreur (§8.2) —
               corriger la phrase, compléter la forme manquante, ou choisir
               entre deux formulations proches. -->
          <template v-else>
            <p class="error-badge-row">
              <span class="type-badge">{{ typeLabel(currentCard.item.type) }}</span>
              <button
                class="trash"
                title="Supprimer cette carte"
                aria-label="Supprimer cette carte de révision"
                @click="trashCurrentCard"
              >
                🗑
              </button>
            </p>

            <template v-if="exercise.kind === 'chooseBetween'">
              <p class="error-prompt">Quelle formulation est correcte ?</p>
              <div class="choose-options">
                <button
                  v-for="opt in exercise.options"
                  :key="opt"
                  type="button"
                  class="choose-option"
                  :class="{
                    correct: revealed && opt === exercise.correct,
                    wrong: revealed && exerciseAttempt === opt && opt !== exercise.correct,
                  }"
                  :disabled="revealed"
                  @click="chooseOption(opt)"
                >
                  {{ opt }}
                </button>
              </div>
            </template>
            <template v-else>
              <p class="review-error">{{ exercise.prompt }}</p>
              <label v-if="!revealed" class="exercise-input">
                <input
                  v-model="exerciseAttempt"
                  type="text"
                  autocomplete="off"
                  :placeholder="exercise.kind === 'fillBlank' ? 'Complétez le mot manquant…' : 'Corrigez la phrase…'"
                  @keydown.enter.prevent="checkExercise"
                />
              </label>
            </template>

            <template v-if="revealed">
              <p
                class="exercise-feedback"
                :class="exerciseFeedback"
              >
                {{ exerciseFeedback === 'correct' ? '✓ Correct !' : 'Pas tout à fait — voici la correction.' }}
              </p>
              <p class="review-translation">{{ currentCard.item.correction }}</p>
              <p v-if="currentCard.item.explanation" class="error-explanation">
                {{ currentCard.item.explanation }}
              </p>
              <RouterLink v-if="grammarLink" class="grammar-link" :to="grammarLink">
                📚 Voir la règle et s'exercer →
              </RouterLink>
            </template>
          </template>

          <div class="review-actions">
            <template v-if="currentCard.kind === 'word'">
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
            </template>
            <template v-else>
              <button
                v-if="!revealed && exercise.kind !== 'chooseBetween'"
                class="btn reveal"
                :disabled="!exerciseAttempt.trim()"
                @click="checkExercise"
              >
                Vérifier
              </button>
              <template v-if="revealed">
                <button class="btn again" @click="answer('oublie')">✗ Oublié</button>
                <button class="btn hard" @click="answer('difficile')">🤔 Difficile</button>
                <button class="btn known" @click="answer('su')">✓ Su</button>
              </template>
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
              <template v-if="dueWords">
                <strong>{{ dueWords }}</strong>
                {{ dueWords > 1 ? 'mots' : 'mot' }}
              </template>
              <template v-if="dueWords && dueErrors"> et </template>
              <template v-if="dueErrors">
                <strong>{{ dueErrors }}</strong>
                {{ dueErrors > 1 ? 'erreurs' : 'erreur' }}
              </template>
              à réviser aujourd'hui.
            </span>
            <button class="btn start" @click="startReview">
              Commencer la révision
            </button>
          </template>
          <span v-else class="all-done">
            ✓ Tout est révisé pour aujourd'hui.
            <template v-if="sessionResults.known + sessionResults.again + sessionResults.difficile">
              Session : {{ sessionResults.known }} su{{
                sessionResults.known > 1 ? 's' : ''
              }}, {{ sessionResults.again }} à revoir.
            </template>
            Revenez demain — les intervalles s'allongent à chaque réussite.
          </span>
        </div>

        <!-- Continuité (§9.3, §3.1) : UNE seule suite recommandée après une
             session de révision, jamais une liste d'options. -->
        <RouterLink v-if="afterReview" class="after-review" :to="afterReview.to">
          <span>{{ afterReview.reason }}</span>
          <strong>{{ afterReview.cta }} →</strong>
        </RouterLink>

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
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
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

/* --- Carte d'erreur dans la session --- */
.error-badge-row {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.6rem;
}

.type-badge {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  background: rgba(176, 105, 46, 0.12);
  border: 1px solid rgba(176, 105, 46, 0.4);
  color: #6f4722;
}

.trash {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.1rem;
  opacity: 0.55;
}

.trash:hover {
  opacity: 1;
}

.review-error {
  margin: 0 0 0.6rem;
  font-size: 1.25rem;
  font-weight: 700;
  color: #a34430;
  text-decoration: line-through;
  text-decoration-color: rgba(163, 68, 48, 0.55);
}

.error-prompt {
  margin: 0 0 0.4rem;
  font-size: 0.9rem;
  color: #6b6156;
  font-style: italic;
}

.error-explanation {
  margin: 0 0 0.4rem;
  font-size: 0.9rem;
  color: #4a4238;
  line-height: 1.55;
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

.btn.hard {
  background: #fff;
  border-color: #b0692e;
  color: #b0692e;
}

/* --- Exercices sur les cartes d'erreur --- */
.choose-options {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.6rem 0;
}

.choose-option {
  padding: 0.5rem 0.8rem;
  border-radius: 10px;
  border: 1px solid #d8cfc2;
  background: #faf6f0;
  font-size: 0.98rem;
  cursor: pointer;
  text-align: left;
}

.choose-option:disabled {
  cursor: default;
}

.choose-option.correct {
  background: #e3f0e6;
  border-color: #4a7c59;
  color: #35674a;
  font-weight: 600;
}

.choose-option.wrong {
  background: #f8e3de;
  border-color: #a34430;
  color: #a34430;
}

.exercise-input {
  display: block;
  margin: 0.6rem 0;
}

.exercise-input input {
  width: 100%;
  padding: 0.55rem 0.8rem;
  border-radius: 10px;
  border: 1px solid rgba(107, 97, 86, 0.4);
  background: #fffaf3;
  font: inherit;
  font-size: 1.05rem;
  text-align: center;
}

.exercise-feedback {
  margin: 0 0 0.4rem;
  font-weight: 700;
}

.exercise-feedback.correct {
  color: #3d7a3d;
}

.exercise-feedback.wrong {
  color: #a34430;
}

.grammar-link {
  display: inline-block;
  margin-top: 0.3rem;
  font-size: 0.85rem;
  color: #4a5086;
  text-decoration: underline;
}

/* --- Suite recommandée après révision (§9.3) --- */
.after-review {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-top: 0.8rem;
  padding: 0.8rem 1.1rem;
  border-radius: 12px;
  border: 1px solid rgba(176, 105, 46, 0.3);
  background: rgba(176, 105, 46, 0.06);
  text-decoration: none;
  color: #4a4238;
  font-size: 0.92rem;
}

.after-review strong {
  color: #b0692e;
  white-space: nowrap;
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
