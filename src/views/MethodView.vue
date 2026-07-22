<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

// --- Démo : une phrase italienne cliquable ---
const demoWords = [
  { it: 'La', fr: 'la' },
  { it: 'mattina', fr: 'le matin' },
  { it: 'Marco', fr: 'Marco' },
  { it: 'beve', fr: 'boit' },
  { it: 'un', fr: 'un' },
  { it: 'caffè', fr: 'un café' },
  { it: 'e', fr: 'et' },
  { it: 'guarda', fr: 'regarde' },
  { it: 'le', fr: 'les' },
  { it: 'montagne', fr: 'montagnes' },
]
const selectedWord = ref(null)
const clickedCount = ref(new Set())

function pickWord(i) {
  selectedWord.value = selectedWord.value === i ? null : i
  clickedCount.value.add(i)
}

// --- Slider : la zone idéale de compréhension ---
const knownPct = ref(85)
const zone = computed(() => {
  const p = knownPct.value
  if (p < 90)
    return {
      emoji: '😵',
      label: 'Trop difficile',
      text: 'Trop de mots inconnus : la lecture devient du déchiffrage, on se décourage.',
      color: '#e0836c',
    }
  if (p <= 98)
    return {
      emoji: '🎯',
      label: 'La zone idéale (i+1)',
      text: 'Vous comprenez l’histoire, et chaque page apporte quelques mots nouveaux : c’est là qu’on progresse.',
      color: '#8fc9a5',
    }
  return {
    emoji: '😴',
    label: 'Trop facile',
    text: 'Agréable, mais presque rien de nouveau à apprendre. Montez d’un niveau !',
    color: '#e0c98f',
  }
})

// --- Les principes ---
const principles = [
  {
    icon: '📖',
    title: 'Lire beaucoup, à son niveau',
    tag: 'Input compréhensible',
    body: "On acquiert une langue en comprenant des messages, bien plus qu'en étudiant ses règles (Krashen). L'idéal : un texte compris à ~95 %, assez riche pour contenir du nouveau. Nos textes sont gradués de A1 à C1 pour vous garder dans cette zone.",
  },
  {
    icon: '👆',
    title: 'Traduire au clic, sans casser le fil',
    tag: 'Gloses & remarquage',
    body: "Chercher dans un dictionnaire interrompt la lecture. Les études montrent qu'on retient presque deux fois plus de mots quand la traduction est à portée de clic : le geste transforme une exposition passive en remarquage actif.",
  },
  {
    icon: '🔊',
    title: 'Lire en écoutant',
    tag: 'Double trace',
    body: "Lire en écoutant simultanément crée une double trace en mémoire — écrite et sonore. Précieux entre français et italien : les orthographes se ressemblent, les prononciations divergent.",
  },
  {
    icon: '🤝',
    title: "L'avantage du francophone",
    tag: 'Mots transparents',
    body: "Français et italien partagent environ trois quarts de leur vocabulaire : importante, nazione, difficile… La vraie difficulté ? Les faux amis (salire = monter, cantina = cave) — exactement là où nos traductions font la différence.",
  },
  {
    icon: '🔁',
    title: 'Répéter en contexte',
    tag: '8 à 12 rencontres',
    body: "Un mot doit être croisé 8 à 12 fois, dans des contextes variés, pour être retenu. D'où l'importance du volume : chaque texte recycle le vocabulaire fréquent, et chaque rencontre renforce la mémoire.",
  },
]

// --- FAQ ---
const faq = [
  {
    q: "Peut-on vraiment apprendre l'italien juste en lisant ?",
    a: "La compréhension et le vocabulaire, oui — c'est confirmé par plusieurs méta-analyses. Pour parler, il faut aussi pratiquer l'oral : la lecture extensive est le complément idéal d'un cours ou d'un tandem.",
  },
  {
    q: 'Quel niveau faut-il pour commencer ?',
    a: "Aucun. Les textes A1 sont accessibles dès les premiers jours, et le français partage trois quarts de son vocabulaire avec l'italien. La traduction au clic fait le reste.",
  },
  {
    q: 'Combien de temps par jour ?',
    a: "10 à 20 minutes par jour suffisent : la régularité compte plus que la durée. C'est le volume cumulé de lecture qui fait la différence.",
  },
  {
    q: 'Pourquoi la traduction en français ?',
    a: "Pour les débutants et intermédiaires, la recherche montre que les traductions en langue maternelle sont plus efficaces que les définitions en langue cible.",
  },
]
const openFaq = ref(0)

// --- Navigation en diapositives ---
// 0: démo · 1: zone · 2-6: principes · 7: FAQ · 8: sources + CTA
const SLIDES = 9
const slide = ref(0)

function go(n) {
  slide.value = Math.min(Math.max(n, 0), SLIDES - 1)
}

function onKey(e) {
  if (e.key === 'ArrowRight') go(slide.value + 1)
  if (e.key === 'ArrowLeft') go(slide.value - 1)
}

// Swipe tactile
let touchX = null
function onTouchStart(e) {
  touchX = e.changedTouches[0].clientX
}
function onTouchEnd(e) {
  if (touchX === null) return
  const dx = e.changedTouches[0].clientX - touchX
  if (Math.abs(dx) > 50) go(slide.value + (dx < 0 ? 1 : -1))
  touchX = null
}

const dotLabels = [
  'Essayez',
  'Votre zone',
  ...principles.map((p) => p.title),
  'Questions',
  'Sources',
]

// Étoiles du décor (positions fixes pour un rendu stable)
const stars = Array.from({ length: 40 }, (_, i) => ({
  x: (i * 37 + 13) % 100,
  y: ((i * 53 + 7) % 55) + 2,
  s: 1 + (i % 3),
  d: (i % 5) + 2,
}))

// Données structurées FAQ pour les moteurs de recherche
let jsonLd
onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
  jsonLd = document.createElement('script')
  jsonLd.type = 'application/ld+json'
  jsonLd.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  })
  document.head.appendChild(jsonLd)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
  jsonLd?.remove()
})
</script>

<template>
  <section class="method-overlay">
    <div class="method-screen" role="dialog" aria-modal="true" @touchstart="onTouchStart" @touchend="onTouchEnd">
    <!-- Décor : ciel, étoiles, collines -->
    <div class="decor" aria-hidden="true">
      <span
        v-for="(st, i) in stars"
        :key="i"
        class="star"
        :style="{
          left: st.x + '%',
          top: st.y + '%',
          width: st.s + 'px',
          height: st.s + 'px',
          animationDuration: st.d + 's',
        }"
      />
      <svg class="hills" viewBox="0 0 1440 320" preserveAspectRatio="none">
        <path
          fill="#4a3a2e"
          opacity="0.5"
          d="M0,220 L180,120 L320,200 L520,90 L700,190 L900,110 L1100,200 L1280,130 L1440,190 L1440,320 L0,320 Z"
        />
        <path
          fill="#3a2d24"
          opacity="0.75"
          d="M0,260 L140,180 L340,250 L560,160 L760,240 L980,170 L1200,250 L1440,180 L1440,320 L0,320 Z"
        />
        <path
          fill="#2c2218"
          d="M0,300 L200,230 L420,290 L640,220 L880,290 L1120,230 L1320,290 L1440,250 L1440,320 L0,320 Z"
        />
      </svg>
    </div>

    <!-- Chrome minimal -->
    <header class="chrome">
      <RouterLink class="chrome-brand" :to="{ name: 'home' }">Leggendo</RouterLink>
      <RouterLink class="chrome-close" :to="{ name: 'method-text' }" aria-label="Fermer">✕</RouterLink>
    </header>

    <!-- Scène -->
    <div class="stage">
      <Transition name="fade" mode="out-in">
        <!-- 0 · Démo -->
        <div v-if="slide === 0" key="s0" class="panel">
          <p class="kicker">La méthode</p>
          <h1>On apprend l'italien en lisant</h1>
          <p class="sub">👇 Cliquez sur les mots que vous ne connaissez pas :</p>
          <p class="demo-sentence" lang="it">
            <template v-for="(w, i) in demoWords" :key="i">
              <button
                class="demo-word"
                :class="{ active: selectedWord === i, seen: clickedCount.has(i) }"
                @click="pickWord(i)"
              >
                {{ w.it }}<span v-if="selectedWord === i" class="bubble">{{ w.fr }}</span>
              </button>
              {{ ' ' }}
            </template>
          </p>
          <p class="feedback">
            <template v-if="clickedCount.size === 0">
              Pas de listes de vocabulaire, pas d'exercices — la traduction vient à vous.
            </template>
            <template v-else-if="clickedCount.size < 3">
              Et voilà, sans quitter la phrase. C'est toute la méthode.
            </template>
            <template v-else>
              Chaque clic aide votre mémoire : c'est du <em>remarquage actif</em>. →
            </template>
          </p>
        </div>

        <!-- 1 · Zone idéale -->
        <div v-else-if="slide === 1" key="s1" class="panel">
          <p class="kicker">Trouvez votre zone</p>
          <h1>Quelle part du texte comprenez-vous&nbsp;?</h1>
          <input
            v-model.number="knownPct"
            class="range"
            type="range"
            min="70"
            max="100"
            step="1"
            aria-label="Pourcentage de mots compris"
          />
          <div class="zone" :style="{ borderColor: zone.color }">
            <span class="zone-pct" :style="{ color: zone.color }">{{ knownPct }}%</span>
            <div class="zone-text">
              <strong :style="{ color: zone.color }">{{ zone.emoji }} {{ zone.label }}</strong>
              <p>{{ zone.text }}</p>
            </div>
          </div>
        </div>

        <!-- 2-6 · Principes -->
        <div v-else-if="slide >= 2 && slide <= 6" :key="'p' + slide" class="panel">
          <p class="kicker">Principe {{ slide - 1 }} / 5 · {{ principles[slide - 2].tag }}</p>
          <div class="principle-icon">{{ principles[slide - 2].icon }}</div>
          <h1>{{ principles[slide - 2].title }}</h1>
          <p class="body-text">{{ principles[slide - 2].body }}</p>
        </div>

        <!-- 7 · FAQ -->
        <div v-else-if="slide === 7" key="s7" class="panel">
          <p class="kicker">Questions fréquentes</p>
          <div class="faq">
            <div
              v-for="(item, i) in faq"
              :key="item.q"
              class="faq-item"
              :class="{ open: openFaq === i }"
            >
              <button class="faq-q" @click="openFaq = openFaq === i ? null : i">
                {{ item.q }}
                <span class="chev">▾</span>
              </button>
              <div class="faq-a">
                <div class="faq-a-inner"><p>{{ item.a }}</p></div>
              </div>
            </div>
          </div>
        </div>

        <!-- 8 · Sources + CTA -->
        <div v-else key="s8" class="panel">
          <p class="kicker">📚 Validée par la recherche</p>
          <h1>Des décennies d'études</h1>
          <p class="body-text refs">
            Krashen (1985) · Nakanishi, <em>TESOL Quarterly</em> (2015) · Jeon &amp;
            Day (2016) · Yanagisawa, Webb &amp; Uchihara, <em>SSLA</em> (2020) ·
            Nation, <em>Cambridge UP</em> (2013)
          </p>
          <RouterLink class="cta" :to="{ name: 'home' }">
            Essayer avec un vrai texte →
          </RouterLink>
        </div>
      </Transition>
    </div>

    <!-- Navigation -->
    <footer class="deck-nav">
      <button class="arrow" :disabled="slide === 0" aria-label="Précédent" @click="go(slide - 1)">
        ←
      </button>
      <div class="dots">
        <button
          v-for="(label, i) in dotLabels"
          :key="i"
          class="dot"
          :class="{ on: slide === i }"
          :aria-label="label"
          :title="label"
          @click="go(i)"
        />
      </div>
      <button
        class="arrow"
        :disabled="slide === SLIDES - 1"
        aria-label="Suivant"
        @click="go(slide + 1)"
      >
        →
      </button>
    </footer>
    </div>
  </section>
</template>

<style scoped>
/* Fond assombri : on voit qu'il s'agit d'une fenêtre posée sur le site */
.method-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(0.8rem, 3vw, 2.4rem);
  background: rgba(44, 38, 32, 0.6);
  backdrop-filter: blur(7px);
  -webkit-backdrop-filter: blur(7px);
  animation: overlay-in 0.25s ease-out;
}

.method-screen {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  max-width: 1100px;
  max-height: 780px;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(250, 246, 240, 0.18);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
  background: linear-gradient(180deg, #241c14 0%, #3a2b1e 45%, #6e4526 80%, #8a5630 100%);
  color: #faf6f0;
  font-family: 'Georgia', 'Times New Roman', serif;
  animation: card-in 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* --- Décor --- */
.decor {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.star {
  position: absolute;
  border-radius: 50%;
  background: #faf6f0;
  opacity: 0.5;
  animation: twinkle infinite ease-in-out alternate;
}

@keyframes twinkle {
  from {
    opacity: 0.15;
  }
  to {
    opacity: 0.7;
  }
}

.hills {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 45%;
}

/* --- Chrome --- */
.chrome {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.1rem 1.5rem 0;
}

.chrome-brand {
  color: #faf6f0;
  text-decoration: none;
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: 0.04em;
}

.chrome-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  height: 2.1rem;
  border: 1px solid rgba(250, 246, 240, 0.35);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.25);
  color: rgba(250, 246, 240, 0.8);
  text-decoration: none;
  font-size: 1rem;
  line-height: 1;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.chrome-close:hover {
  border-color: #e8b686;
  background: rgba(0, 0, 0, 0.45);
}

.chrome-brand:hover,
.chrome-close:hover {
  color: #e8b686;
}

/* --- Scène --- */
.stage {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 1.5rem;
  min-height: 0;
}

.panel {
  max-width: 640px;
  width: 100%;
  text-align: center;
  max-height: 100%;
  overflow-y: auto;
}

.kicker {
  margin: 0 0 0.6rem;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #e8b686;
}

.panel h1 {
  margin: 0 0 1.2rem;
  font-size: clamp(1.4rem, 4vw, 2.1rem);
  line-height: 1.25;
}

.sub {
  margin: 0 0 0.8rem;
  font-size: 0.9rem;
  opacity: 0.7;
}

.body-text {
  margin: 0;
  font-size: 1.02rem;
  line-height: 1.8;
  opacity: 0.92;
}

/* --- Démo --- */
.demo-sentence {
  margin: 0 0 1rem;
  font-size: clamp(1.25rem, 3.5vw, 1.6rem);
  line-height: 2.3;
}

.demo-word {
  position: relative;
  border: none;
  background: none;
  padding: 0.1rem 0.15rem;
  font: inherit;
  color: inherit;
  cursor: pointer;
  border-radius: 4px;
  border-bottom: 2px dotted rgba(250, 246, 240, 0.35);
  transition: background 0.12s;
}

.demo-word:hover {
  background: rgba(250, 246, 240, 0.12);
}

.demo-word.seen {
  border-bottom-color: #e8b686;
}

.demo-word.active {
  background: #b0692e;
}

.bubble {
  position: absolute;
  bottom: calc(100% + 7px);
  left: 50%;
  transform: translateX(-50%);
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  background: #faf6f0;
  color: #2c2620;
  font-size: 0.85rem;
  white-space: nowrap;
  z-index: 2;
  animation: pop 0.15s ease-out;
}

.bubble::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #faf6f0;
}

@keyframes pop {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.feedback {
  margin: 0;
  font-size: 0.92rem;
  opacity: 0.8;
  min-height: 1.4em;
}

/* --- Zone --- */
.range {
  width: 100%;
  max-width: 440px;
  accent-color: #e8b686;
  cursor: pointer;
  margin-bottom: 1.2rem;
}

.zone {
  display: flex;
  align-items: center;
  gap: 1rem;
  max-width: 480px;
  margin: 0 auto;
  padding: 0.9rem 1.2rem;
  border: 2px solid;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.25);
  text-align: left;
  transition: border-color 0.2s;
}

.zone-pct {
  font-size: 2rem;
  font-weight: 700;
  min-width: 3.4rem;
  text-align: center;
  transition: color 0.2s;
}

.zone-text p {
  margin: 0.25rem 0 0;
  font-size: 0.88rem;
  line-height: 1.55;
  opacity: 0.9;
}

/* --- Principes --- */
.principle-icon {
  font-size: 2.6rem;
  margin-bottom: 0.6rem;
}

/* --- FAQ --- */
.faq {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  text-align: left;
}

.faq-item {
  border: 1px solid rgba(250, 246, 240, 0.25);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.25);
  overflow: hidden;
  transition: border-color 0.15s;
}

.faq-item.open {
  border-color: #e8b686;
}

.faq-q {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.7rem 0.95rem;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  color: #faf6f0;
  text-align: left;
  cursor: pointer;
}

.chev {
  color: #e8b686;
  transition: transform 0.2s;
}

.faq-item.open .chev {
  transform: rotate(180deg);
}

.faq-a {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.25s ease;
}

.faq-item.open .faq-a {
  grid-template-rows: 1fr;
}

.faq-a-inner {
  overflow: hidden;
}

.faq-a-inner p {
  margin: 0;
  padding: 0 0.95rem 0.8rem;
  font-size: 0.88rem;
  line-height: 1.6;
  opacity: 0.85;
}

/* --- Sources / CTA --- */
.refs {
  font-size: 0.9rem;
  opacity: 0.75;
  margin-bottom: 1.6rem;
}

.cta {
  display: inline-block;
  padding: 0.75rem 1.6rem;
  border-radius: 999px;
  background: #b0692e;
  color: #faf6f0;
  text-decoration: none;
  font-weight: 700;
  font-size: 1rem;
  transition: background 0.15s, transform 0.15s;
}

.cta:hover {
  background: #c97c3a;
  transform: translateY(-2px);
}

/* --- Navigation --- */
.deck-nav {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1.2rem;
  padding: 0 1rem 1.3rem;
}

.arrow {
  width: 2.4rem;
  height: 2.4rem;
  border: 1px solid rgba(250, 246, 240, 0.35);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.2);
  color: #faf6f0;
  font-size: 1rem;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.arrow:hover:not(:disabled) {
  border-color: #e8b686;
  background: rgba(0, 0, 0, 0.4);
}

.arrow:disabled {
  opacity: 0.25;
  cursor: default;
}

.dots {
  display: flex;
  gap: 0.5rem;
}

.dot {
  width: 9px;
  height: 9px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(250, 246, 240, 0.3);
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}

.dot:hover {
  background: rgba(250, 246, 240, 0.6);
}

.dot.on {
  background: #e8b686;
  transform: scale(1.35);
}

/* --- Transition entre diapos --- */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateX(24px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}

/* --- Responsive --- */
@media (max-width: 480px) {
  .stage {
    padding: 0 1rem;
  }

  .zone {
    flex-direction: column;
    text-align: center;
    gap: 0.4rem;
  }

  .zone-text {
    text-align: center;
  }

  .deck-nav {
    gap: 0.7rem;
  }
}
</style>
