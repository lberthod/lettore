<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { isLoggedIn, isPremiumPlus } from '../lib/access.js'
import { currentUser } from '../lib/auth.js'
import {
  progress,
  setLearningPreferences,
  canUseRestDay,
  useRestDay,
  recordSessionStarted,
  recordSessionCompleted,
} from '../progress.js'
import { nextStep, composeSession, currentStepIndex } from '../lib/percorso.js'
import {
  loadDailySession,
  saveDailySession,
  clearDailySession,
  loadYesterdaySessionTypes,
} from '../lib/dailySession.js'
import { selectMissionsForToday } from '../lib/missions.js'


// Mots italiens qui flottent dans le ciel — cliquables : la traduction apparaît
const floatingWords = [
  { word: 'leggere', fr: 'lire', x: 14, y: 30, delay: 0, size: 1 },
  { word: 'sole', fr: 'le soleil', x: 78, y: 20, delay: 1.2, size: 0.85 },
  { word: 'colline', fr: 'les collines', x: 30, y: 14, delay: 2.1, size: 0.8 },
  { word: 'parole', fr: 'les mots', x: 62, y: 36, delay: 0.6, size: 0.95 },
  { word: 'storia', fr: "l'histoire", x: 86, y: 44, delay: 1.7, size: 0.8 },
]
const pickedWord = ref(null)

// Hirondelles qui traversent le ciel
const birds = [
  { y: 14, dur: 46, delay: 3 },
  { y: 24, dur: 62, delay: 18 },
  { y: 9, dur: 54, delay: 34 },
]

// Parallaxe douce au mouvement de la souris
const par = ref({ x: 0, y: 0 })
function onMove(e) {
  par.value = {
    x: e.clientX / window.innerWidth - 0.5,
    y: e.clientY / window.innerHeight - 0.5,
  }
}
function lyr(depth) {
  return {
    transform: `translate(${(par.value.x * depth).toFixed(1)}px, ${(par.value.y * depth * 0.6).toFixed(1)}px)`,
  }
}

// --- Il tuo percorso : la session quotidienne composée pour un utilisateur
// connecté (src/lib/percorso.js#composeSession). L'index des textes (127 kB)
// et le rôle Premium IA sont chargés à la demande après le montage — le
// repli `step` (une seule action, règles historiques de `nextStep`)
// s'affiche instantanément pendant ce court chargement.
const loggedIn = computed(() => isLoggedIn())
const textsIndex = ref([])
const premiumIA = ref(false)
const step = computed(() =>
  nextStep(progress, { hasPremiumIA: premiumIA.value, texts: textsIndex.value })
)

// Session composée du jour : reprise localement si l'utilisateur revient au
// milieu (lib/dailySession.js), sinon générée une fois texts/Premium IA
// connus puis persistée pour le reste de la journée (règle 6.5).
const session = ref(null)
const sessionStartTs = ref(0)
const activeIndex = computed(() =>
  session.value ? currentStepIndex(session.value, progress, sessionStartTs.value) : 0
)
const sessionDone = computed(
  () => !!session.value && activeIndex.value >= session.value.steps.length
)

// Achèvement de session (§15.1) : une entrée par jour dans progress.sessionLog
// dès qu'une session composée est disponible, complétée quand toutes les
// étapes sont faites — voir progress.js#recordSessionStarted/Completed et
// lib/metrics.js#sessionCompletionRate.
watch(session, (s) => {
  if (s && s.steps.length) recordSessionStarted(sessionStartTs.value || Date.now())
})
watch(sessionDone, (done) => {
  if (done) recordSessionCompleted()
})

function startOfToday(now = Date.now()) {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// --- Objectif quotidien flexible (§11.1) : quelques durées courantes,
// appliquées immédiatement (la session du jour est recomposée avec la
// nouvelle durée plutôt que d'attendre demain).
const GOAL_OPTIONS = [5, 10, 15, 20, 30]
const goalMinutes = computed(() => progress.learningPreferences.dailyMinutes)

async function recomposeSession() {
  const uid = currentUser.value?.uid || null
  const startTs = sessionStartTs.value || Date.now()
  session.value = composeSession(progress, {
    hasPremiumIA: premiumIA.value,
    texts: textsIndex.value,
    // L'heure réelle, pas minuit (sessionStartTs) : composeSession filtre les
    // révisions dues par rapport à `now`, et minuit sous-estime tout ce qui
    // devient dû plus tard dans la journée. sessionStartTs reste le repère du
    // « jour » pour la mise en cache locale (saveDailySession) et le calcul
    // de l'étape en cours (currentStepIndex), ce qui est correct.
    now: Date.now(),
    yesterdayTypes: loadYesterdaySessionTypes(startTs, uid),
  })
  saveDailySession(session.value, startTs, uid)
}

function setDailyGoal(minutes) {
  if (minutes === goalMinutes.value) return
  setLearningPreferences({ dailyMinutes: minutes })
  const uid = currentUser.value?.uid || null
  clearDailySession(uid)
  recomposeSession()
}

// --- Jour de repos (§11.1) : ne casse pas la série, ne rattrape pas non
// plus plusieurs jours d'inactivité — voir progress.js#canUseRestDay.
const restDayAvailable = computed(() => loggedIn.value && canUseRestDay())
const restDayMessage = ref('')
function takeRestDay() {
  if (useRestDay()) {
    restDayMessage.value = 'Jour de repos pris — ta série est préservée, reviens quand tu veux.'
  }
}

// --- Missions courtes du jour (§11.2), dérivées du journal d'activité.
// Sprint 2.1 : priorise une mission liée à une faiblesse observée quand le
// signal est disponible, sinon repli automatique sur les 3 missions fixes
// (voir lib/missions.js#selectMissionsForToday).
const missions = computed(() => (loggedIn.value ? selectMissionsForToday(progress) : []))

const STEP_LABELS = {
  review: 'Réviser',
  lettura: 'Lire',
  ascolto: 'Écouter',
  write: 'Écrire',
  dialogo: 'Dialoguer',
  pronuncia: 'Prononcer',
}
const STEP_CTA = {
  review: 'Réviser',
  lettura: 'Lire',
  ascolto: 'Écouter',
  write: 'Écrire',
  dialogo: 'Dialoguer',
  pronuncia: "S'entraîner",
}
const STEP_ICONS = {
  review: '🔁',
  lettura: '📖',
  ascolto: '🎧',
  write: '✍️',
  dialogo: '💬',
  pronuncia: '🗣️',
}

// Plein écran : on verrouille le défilement de la page
onMounted(async () => {
  document.body.style.overflow = 'hidden'
  if (!loggedIn.value) return
  const textsPromise = import('../texts/index.json').then((m) => {
    textsIndex.value = m.default
  })
  premiumIA.value = currentUser.value ? await isPremiumPlus() : false
  await textsPromise

  sessionStartTs.value = startOfToday()
  const uid = currentUser.value?.uid || null
  // Reprend une session interrompue localement avant d'en générer une
  // nouvelle : revenir sur l'accueil ne recompose jamais la journée.
  const resumed = loadDailySession(sessionStartTs.value, uid)
  if (resumed) {
    session.value = resumed
  } else {
    session.value = composeSession(progress, {
      hasPremiumIA: premiumIA.value,
      texts: textsIndex.value,
      // Voir le commentaire de recomposeSession() : l'heure réelle, pas minuit.
      now: Date.now(),
      yesterdayTypes: loadYesterdaySessionTypes(sessionStartTs.value, uid),
    })
    saveDailySession(session.value, sessionStartTs.value, uid)
  }
})
onUnmounted(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <section class="home-screen" @mousemove="onMove">
    <!-- Scène en fond : ciel, collines toscanes, soleil, mots qui flottent -->
    <div class="scene" aria-hidden="true">
      <svg class="scene-svg" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fdf3e3" />
            <stop offset="100%" stop-color="#f7e3c8" />
          </linearGradient>
          <linearGradient id="hill1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#d9b98a" />
            <stop offset="100%" stop-color="#cfa873" />
          </linearGradient>
          <linearGradient id="hill2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c08b4d" />
            <stop offset="100%" stop-color="#b0692e" />
          </linearGradient>
          <linearGradient id="hill3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#8a5a2b" />
            <stop offset="100%" stop-color="#6f4722" />
          </linearGradient>
        </defs>

        <rect width="1200" height="520" fill="url(#sky)" />

        <g :style="lyr(-10)">
          <circle class="sun" cx="880" cy="150" r="52" fill="#e8a84c" opacity="0.9" />
          <circle class="sun-halo" cx="880" cy="150" r="80" fill="none" stroke="#e8a84c" stroke-width="1.5" opacity="0.35" />
        </g>

        <g :style="lyr(5)">
          <path
            class="hill hill-1"
            d="M0 400 Q 200 300 420 360 T 800 350 Q 1020 320 1200 380 L 1200 520 L 0 520 Z"
            fill="url(#hill1)"
          />
        </g>
        <g :style="lyr(10)">
          <path
            class="hill hill-2"
            d="M0 450 Q 260 360 520 420 T 1200 430 L 1200 520 L 0 520 Z"
            fill="url(#hill2)"
          />
        </g>
        <g :style="lyr(16)">
          <path
            class="hill hill-3"
            d="M0 500 Q 300 440 640 480 T 1200 490 L 1200 520 L 0 520 Z"
            fill="url(#hill3)"
          />
        </g>

        <!-- Cyprès -->
        <g :style="lyr(12)">
          <g class="cypress" fill="#5a6e3f">
            <ellipse cx="220" cy="382" rx="9" ry="34" />
            <ellipse cx="244" cy="390" rx="7" ry="27" />
            <ellipse cx="960" cy="400" rx="8" ry="30" />
            <ellipse cx="982" cy="408" rx="6" ry="23" />
          </g>
        </g>

        <!-- Livre ouvert posé sur la colline (décalé hors de la zone des textes du bas) -->
        <g :style="lyr(12)">
        <g transform="translate(-370 -80)">
        <g class="book">
          <path d="M540 452 Q 600 432 660 452 L 660 470 Q 600 452 540 470 Z" fill="#faf6f0" stroke="#8a5a2b" stroke-width="2.5" />
          <line x1="600" y1="438" x2="600" y2="458" stroke="#8a5a2b" stroke-width="2.5" />
          <path d="M552 452 Q 576 442 596 448 M552 458 Q 576 448 596 454" stroke="#c9b8a0" stroke-width="1.6" fill="none" />
          <path d="M604 448 Q 624 442 648 452 M604 454 Q 624 448 648 458" stroke="#c9b8a0" stroke-width="1.6" fill="none" />
        </g>
        </g>
        </g>
      </svg>

      <!-- Hirondelles -->
      <svg
        v-for="(b, i) in birds"
        :key="'bird' + i"
        class="bird"
        viewBox="0 0 24 10"
        :style="{ top: b.y + '%', animationDuration: b.dur + 's', animationDelay: b.delay + 's' }"
      >
        <path
          d="M1 8 Q 6 1 12 6 Q 18 1 23 8"
          stroke="#6b5b46"
          stroke-width="1.6"
          fill="none"
          stroke-linecap="round"
        />
      </svg>
    </div>

    <!-- Mots cliquables du ciel (hors du bloc décoratif pour rester interactifs) -->
    <span
      v-for="w in floatingWords"
      :key="w.word"
      class="float-wrap"
      :style="{ left: w.x + '%', top: w.y + '%', ...lyr(22) }"
    >
      <button
        class="float-word"
        :class="{ picked: pickedWord === w.word }"
        :style="{ animationDelay: w.delay + 's', fontSize: w.size * 1.05 + 'rem' }"
        @click="pickedWord = pickedWord === w.word ? null : w.word"
      >
        {{ w.word }}
        <span v-if="pickedWord === w.word" class="fbubble">{{ w.fr }}</span>
      </button>
    </span>

    <!-- Barre de navigation commune -->
    <SiteHeader />

    <!-- Héros centré -->
    <div class="stage">
      <div class="hero">
        <h1 class="title">Legg<em>endo</em></h1>
        <p class="tagline">Apprendre l'italien en lisant</p>

        <!-- Utilisateur connecté : une seule action explicite, la prochaine
             étape du parcours (règles transparentes dans src/lib/percorso.js). -->
        <div v-if="loggedIn" class="percorso">
          <p class="percorso-eyebrow">
            Il tuo percorso
            <span v-if="session" class="percorso-duration">· {{ session.duration }} min</span>
            <span
              v-if="progress.streak.current > 0"
              class="percorso-streak"
              :title="`Série : ${progress.streak.current} jour${progress.streak.current > 1 ? 's' : ''} d'affilée`"
            >
              🔥 {{ progress.streak.current }}
            </span>
          </p>

          <!-- Session composée (jusqu'à 3 étapes) une fois texts/Premium IA
               connus et la session du jour générée ou reprise. -->
          <template v-if="session">
            <h2 class="percorso-title">{{ session.objective }}</h2>

            <ol class="percorso-steps">
              <li
                v-for="(s, i) in session.steps"
                :key="i"
                class="percorso-step"
                :class="{ 'is-current': i === activeIndex, 'is-done': i < activeIndex }"
              >
                <RouterLink :to="s.to" class="percorso-step-link">
                  <span class="percorso-step-icon" aria-hidden="true">
                    {{ i < activeIndex ? '✓' : STEP_ICONS[s.type] }}
                  </span>
                  <span class="percorso-step-label">{{ STEP_LABELS[s.type] || s.type }}</span>
                  <span class="percorso-step-minutes">{{ s.estimatedMinutes }} min</span>
                </RouterLink>
              </li>
            </ol>

            <p v-if="sessionDone" class="percorso-reason">
              Session du jour terminée — bravo ! Reviens demain pour la suite.
            </p>
            <RouterLink
              v-else
              class="btn-hero"
              :to="session.steps[activeIndex].to"
            >
              {{ STEP_CTA[session.steps[activeIndex].type] || 'Continuer' }} →
            </RouterLink>
          </template>

          <!-- Repli instantané le temps que la session se compose (texts et
               rôle Premium IA chargés à la demande, voir <script>). -->
          <template v-else>
            <h2 class="percorso-title">{{ step.title }}</h2>
            <p class="percorso-reason">{{ step.reason }}</p>
            <RouterLink class="btn-hero" :to="step.to">{{ step.cta }} →</RouterLink>
          </template>

          <!-- Objectif quotidien flexible (§11.1) -->
          <div class="percorso-goal">
            <span class="percorso-goal-label">Objectif du jour :</span>
            <button
              v-for="m in GOAL_OPTIONS"
              :key="m"
              type="button"
              class="goal-btn"
              :class="{ active: goalMinutes === m }"
              @click="setDailyGoal(m)"
            >
              {{ m }} min
            </button>
          </div>

          <!-- Missions courtes du jour (§11.2) : pas de points, pas de
               classement — simple statut fait/pas fait, sans conséquence si
               une mission n'est pas faite. -->
          <ul v-if="missions.length" class="missions">
            <li v-for="m in missions" :key="m.id" class="mission" :class="{ done: m.done }">
              <span class="mission-check" aria-hidden="true">{{ m.done ? '✓' : '○' }}</span>
              {{ m.label }}
            </li>
          </ul>

          <!-- Jour de repos (§11.1) : ne casse pas la série. -->
          <p v-if="restDayAvailable" class="rest-day">
            <button type="button" class="link-btn" @click="takeRestDay">
              Prendre un jour de repos aujourd'hui
            </button>
          </p>
          <p v-if="restDayMessage" class="rest-day-message">{{ restDayMessage }}</p>
        </div>

        <!-- Visiteur : héros inchangé -->
        <template v-else>
          <div class="badge">
            <span class="pulse" aria-hidden="true"></span>
            <span class="badge-text">Lire · écouter · parler — l'italien à votre rythme</span>
          </div>

          <p class="sub">
            Des histoires à votre niveau, la traduction française d'un survol,
            l'audio d'un clic. Rien d'autre entre vous et la langue.
          </p>

          <div class="actions">
            <RouterLink class="btn-hero" :to="{ name: 'library' }">
              Commencer à lire →
            </RouterLink>
            <RouterLink class="btn-ghost" :to="{ name: 'method' }">
              La méthode
            </RouterLink>
          </div>
        </template>
      </div>
    </div>

    <!-- Bas d'écran : trois points -->
    <div class="features-band">
      <div class="features">
        <div class="feature">
          <span class="feature-icon" aria-hidden="true">☀︎</span>
          <div>
            <h2>Lisez, simplement</h2>
            <p>Des textes courts écrits pour votre niveau, de A1 à C2.</p>
          </div>
        </div>
        <div class="feature">
          <span class="feature-icon" aria-hidden="true">✎</span>
          <div>
            <h2>Comprenez tout</h2>
            <p>Survolez un mot, cliquez une phrase : la traduction apparaît.</p>
          </div>
        </div>
        <div class="feature">
          <span class="feature-icon" aria-hidden="true">♪</span>
          <div>
            <h2>Écoutez l'italien</h2>
            <p>Chaque texte se lit à voix haute, phrase par phrase.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Pied de page commun -->
    <SiteFooter />
  </section>
</template>

<style scoped>
.home-screen {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(180deg, #fdf3e3 0%, #f7e3c8 100%);
}

/* --- Scène en fond --- */

.scene {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.scene-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.sun {
  animation: sun-rise 2.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.sun-halo {
  transform-origin: 880px 150px;
  animation: halo 6s ease-in-out infinite;
}

@keyframes sun-rise {
  from {
    transform: translateY(60px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes halo {
  0%, 100% { transform: scale(1); opacity: 0.35; }
  50% { transform: scale(1.12); opacity: 0.15; }
}

.hill {
  animation: hill-in 1.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.hill-1 { animation-delay: 0.15s; }
.hill-2 { animation-delay: 0.35s; }
.hill-3 { animation-delay: 0.55s; }

.cypress,
.book {
  animation: hill-in 1.2s cubic-bezier(0.22, 1, 0.36, 1) 0.7s both;
}

@keyframes hill-in {
  from {
    transform: translateY(50px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.float-wrap {
  position: absolute;
  z-index: 1;
}

.float-word {
  position: relative;
  border: none;
  background: none;
  padding: 0.15rem 0.3rem;
  font-family: inherit;
  font-style: italic;
  color: rgba(138, 90, 43, 0.55);
  letter-spacing: 2px;
  cursor: pointer;
  animation: word-float 7s ease-in-out infinite;
  transition: color 0.15s;
}

.float-word:hover,
.float-word.picked {
  color: #8a5a2b;
}

@keyframes word-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-9px); }
}

.fbubble {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  padding: 0.22rem 0.6rem;
  border-radius: 6px;
  background: #2c2620;
  color: #faf6f0;
  font-style: normal;
  font-size: 0.8rem;
  letter-spacing: 0.5px;
  white-space: nowrap;
  animation: bubble-pop 0.15s ease-out;
}

.fbubble::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #2c2620;
}

@keyframes bubble-pop {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.bird {
  position: absolute;
  left: -40px;
  width: 26px;
  height: 11px;
  opacity: 0.45;
  animation: fly linear infinite;
}

@keyframes fly {
  0% {
    transform: translateX(0) translateY(0);
  }
  25% {
    transform: translateX(calc(28vw + 10px)) translateY(-14px);
  }
  50% {
    transform: translateX(calc(55vw + 20px)) translateY(6px);
  }
  75% {
    transform: translateX(calc(82vw + 30px)) translateY(-10px);
  }
  100% {
    transform: translateX(calc(110vw + 40px)) translateY(0);
  }
}

/* --- Héros --- */

.stage {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 0 1.5rem;
}

.hero {
  max-width: 620px;
  text-align: center;
}

.title {
  margin: 0;
  font-size: clamp(2.2rem, 6vw, 3.4rem);
  font-weight: 400;
  letter-spacing: 1px;
  opacity: 0;
  animation: appear 0.9s ease-out 0.5s forwards;
}

.title em {
  color: #b0692e;
}

.tagline {
  margin: 0.7rem 0 0;
  font-size: clamp(0.82rem, 1.8vw, 1rem);
  font-weight: 400;
  letter-spacing: 5px;
  text-transform: uppercase;
  color: #6b6156;
  opacity: 0;
  animation: appear 0.9s ease-out 0.9s forwards;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-top: 1.3rem;
  padding: 0.55rem 1.3rem;
  border: 1px solid rgba(176, 105, 46, 0.35);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  opacity: 0;
  animation: appear 0.9s ease-out 1.3s forwards;
}

.badge-text {
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: #8a5a2b;
}

.pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4a7c59;
  box-shadow: 0 0 0 0 rgba(74, 124, 89, 0.55);
  animation: pulse 2.2s ease-out infinite;
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(74, 124, 89, 0.55); }
  70% { box-shadow: 0 0 0 10px rgba(74, 124, 89, 0); }
  100% { box-shadow: 0 0 0 0 rgba(74, 124, 89, 0); }
}

/* --- Il tuo percorso (utilisateur connecté) --- */

.percorso {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  margin: 1.5rem auto 0;
  max-width: 440px;
  padding: 1.1rem 1.5rem 1.3rem;
  border: 1px solid rgba(176, 105, 46, 0.35);
  border-radius: 16px;
  background: rgba(250, 246, 240, 0.82);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 26px rgba(111, 71, 34, 0.12);
  opacity: 0;
  animation: appear 0.9s ease-out 1.1s forwards;
}

.percorso-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: #8a5a2b;
}

.percorso-streak {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0;
  color: #b0692e;
  cursor: default;
}

.percorso-duration {
  font-weight: 500;
  letter-spacing: 0;
  color: rgba(138, 90, 43, 0.75);
  text-transform: none;
}

.percorso-steps {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: 100%;
  margin: 0.2rem 0 0.9rem;
  padding: 0;
  list-style: none;
}

.percorso-step-link {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid rgba(176, 105, 46, 0.2);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.4);
  color: rgba(44, 38, 32, 0.82);
  text-decoration: none;
  font-size: 0.88rem;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.percorso-step-link:hover {
  background: rgba(255, 255, 255, 0.7);
  border-color: rgba(176, 105, 46, 0.4);
}

.percorso-step-icon {
  font-size: 1rem;
  width: 1.3em;
  text-align: center;
  flex-shrink: 0;
}

.percorso-step-label {
  flex: 1;
  text-align: left;
  font-weight: 600;
}

.percorso-step-minutes {
  font-size: 0.78rem;
  color: rgba(44, 38, 32, 0.55);
}

.percorso-step.is-current .percorso-step-link {
  background: rgba(176, 105, 46, 0.16);
  border-color: rgba(176, 105, 46, 0.55);
  box-shadow: 0 2px 10px rgba(111, 71, 34, 0.1);
}

.percorso-step.is-done .percorso-step-link {
  opacity: 0.6;
}

.percorso-step.is-done .percorso-step-label {
  text-decoration: line-through;
}

.percorso-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: #6f4722;
}

.percorso-reason {
  margin: 0 0 0.6rem;
  font-size: 0.92rem;
  line-height: 1.5;
  color: rgba(44, 38, 32, 0.72);
}

.percorso-goal {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.9rem;
  font-size: 0.78rem;
}

.percorso-goal-label {
  color: rgba(44, 38, 32, 0.6);
}

.goal-btn {
  padding: 0.15rem 0.55rem;
  border: 1px solid #e4d9c6;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.6);
  color: #6f4722;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.goal-btn.active {
  background: #b0692e;
  border-color: #b0692e;
  color: #fff;
  font-weight: 600;
}

.missions {
  list-style: none;
  margin: 0.9rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.mission {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.82rem;
  color: rgba(44, 38, 32, 0.72);
}

.mission.done {
  color: #3d7a3d;
}

.mission-check {
  font-size: 0.9rem;
}

.rest-day {
  margin: 0.7rem 0 0;
}

.rest-day .link-btn {
  background: none;
  border: none;
  padding: 0;
  color: #b0692e;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
  font-size: 0.8rem;
}

.rest-day-message {
  margin: 0.4rem 0 0;
  font-size: 0.8rem;
  color: #3d7a3d;
}

.sub {
  margin: 1.2rem 0 0;
  font-size: 1rem;
  line-height: 1.65;
  color: rgba(44, 38, 32, 0.7);
  opacity: 0;
  animation: appear 0.9s ease-out 1.6s forwards;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.8rem;
  margin-top: 1.6rem;
  opacity: 0;
  animation: appear 0.9s ease-out 1.9s forwards;
}

.btn-hero {
  padding: 0.75rem 1.7rem;
  border-radius: 999px;
  background: #b0692e;
  color: #faf6f0;
  font-size: 1rem;
  font-weight: 700;
  text-decoration: none;
  box-shadow: 0 6px 20px rgba(176, 105, 46, 0.3);
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
}

.btn-hero:hover {
  background: #9a5a26;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(176, 105, 46, 0.35);
}

.btn-ghost {
  padding: 0.75rem 1.7rem;
  border: 1px solid rgba(138, 90, 43, 0.45);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.4);
  color: #6b6156;
  font-size: 1rem;
  font-weight: 600;
  text-decoration: none;
  transition: border-color 0.15s, color 0.15s;
}

.btn-ghost:hover {
  border-color: #b0692e;
  color: #b0692e;
}

@keyframes appear {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* --- Bas d'écran --- */

.features-band {
  position: relative;
  z-index: 2;
  padding: 0 1.5rem 0.9rem;
  opacity: 0;
  animation: appear 0.9s ease-out 2.2s forwards;
}

.features {
  display: flex;
  justify-content: center;
  gap: 2.2rem;
  max-width: 900px;
  margin: 0 auto;
}

.feature {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  text-align: left;
  max-width: 250px;
}

.feature-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(250, 246, 240, 0.7);
  color: #b0692e;
  font-size: 1.1rem;
}

.feature h2 {
  margin: 0 0 0.2rem;
  font-size: 0.95rem;
  color: #faf6f0;
}

.feature p {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: rgba(250, 246, 240, 0.8);
}

/* --- Responsive --- */

@media (max-width: 720px) {
  .features {
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .feature {
    max-width: none;
    align-items: center;
  }

  .feature p {
    display: none;
  }

  .feature h2 {
    margin: 0;
  }

  .feature-icon {
    width: 30px;
    height: 30px;
    font-size: 0.9rem;
  }
}

@media (max-height: 640px) {
  .sub,
  .feature p {
    display: none;
  }

  .badge {
    margin-top: 0.9rem;
  }

  .percorso {
    margin-top: 0.9rem;
    padding: 0.8rem 1.1rem 1rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sun,
  .sun-halo,
  .hill,
  .cypress,
  .book,
  .float-word,
  .bird,
  .title,
  .tagline,
  .badge,
  .pulse,
  .sub,
  .actions,
  .percorso,
  .features-band {
    animation: none;
    opacity: 1;
  }
}
</style>
