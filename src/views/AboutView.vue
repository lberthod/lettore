<script setup>
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import textsIndex from '../texts/index.json'

const textCount = textsIndex.length
const levels = [...new Set(textsIndex.map((t) => t.level))].sort()
const levelRange = `${levels[0]} → ${levels[levels.length - 1]}`
const categoryCount = new Set(textsIndex.map((t) => t.category)).size
const totalWords = textsIndex.reduce((sum, t) => sum + (t.wordCount || 0), 0)
const totalWordsLabel = computed(() =>
  totalWords >= 1000 ? `${Math.floor(totalWords / 1000)} 000+` : String(totalWords)
)

// Mini-démo : la phrase se traduit mot à mot au survol, comme dans le lecteur
const demoWords = [
  { it: 'Leggere', fr: 'lire' },
  { it: 'è', fr: 'est' },
  { it: 'il', fr: 'le' },
  { it: 'modo', fr: 'moyen' },
  { it: 'più', fr: 'plus' },
  { it: 'naturale', fr: 'naturel' },
  { it: 'di', fr: 'de' },
  { it: 'imparare', fr: 'apprendre' },
  { it: 'una', fr: 'une' },
  { it: 'lingua.', fr: 'langue' },
]
const activeWord = ref(null)
const isSpeaking = ref(false)

// Écouter la phrase de démo à voix haute, comme dans le lecteur
function playDemo() {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(demoWords.map((w) => w.it).join(' '))
  utter.lang = 'it-IT'
  utter.rate = 0.92
  utter.onstart = () => (isSpeaking.value = true)
  utter.onend = () => (isSpeaking.value = false)
  utter.onerror = () => (isSpeaking.value = false)
  window.speechSynthesis.speak(utter)
}

const steps = [
  {
    n: 'I',
    title: 'Choisissez un texte',
    text: `${textCount} textes gradués de ${levelRange}, classés selon le CECR. Commencez là où vous êtes à l'aise.`,
  },
  {
    n: 'II',
    title: 'Survolez les mots',
    text: 'La traduction française apparaît instantanément, sans quitter la lecture ni ouvrir un dictionnaire.',
  },
  {
    n: 'III',
    title: 'Cliquez les phrases',
    text: 'Un clic sur la ponctuation traduit la phrase entière — le sens global, pas seulement les mots.',
  },
  {
    n: 'IV',
    title: 'Écoutez et mémorisez',
    text: "L'audio phrase par phrase entraîne votre oreille. Vos mots favoris se retrouvent dans « Mes mots ».",
  },
]

const themes = [
  'Histoire',
  'Régions',
  'Cuisine',
  'Montagne',
  'Culture',
  'Vie quotidienne',
]
</script>

<template>
  <SceneLayout title="Chi si" accent="amo" tagline="À propos" bare compact>
    <div class="about">
      <!-- Accroche -->
      <p class="lede">
        <strong>Leggendo</strong> est un lecteur interactif : chaque texte porte
        sa traduction mot à mot au survol, la traduction des phrases entières et
        la lecture audio — pour progresser
        <em>sans quitter le plaisir de lire</em>.
      </p>

      <!-- Démo : la phrase seule, centrée -->
      <div
        class="demo"
        role="group"
        aria-label="Démonstration : survolez un mot pour voir sa traduction"
      >
        <p class="eyebrow center">Essayez — survolez un mot, écoutez la phrase</p>
        <p class="demo-sentence" lang="it">
          <button
            v-for="(w, i) in demoWords"
            :key="i"
            class="demo-word"
            :class="{ active: activeWord === i }"
            @mouseenter="activeWord = i"
            @mouseleave="activeWord = null"
            @focus="activeWord = i"
            @blur="activeWord = null"
            @click="activeWord = i"
          >
            {{ w.it }}
            <span v-if="activeWord === i" class="bubble">{{ w.fr }}</span>
          </button>
          <button
            class="listen-btn"
            :class="{ speaking: isSpeaking }"
            type="button"
            aria-label="Écouter la phrase en italien"
            @click="playDemo"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4 9v6h4l5 5V4L8 9H4zm11.5 3a3.5 3.5 0 0 0-2-3.16v6.32a3.5 3.5 0 0 0 2-3.16zm-2-7.53v2.06a6 6 0 0 1 0 10.94v2.06a8 8 0 0 0 0-15.06z"
              />
            </svg>
          </button>
        </p>
      </div>

      <!-- Comment ça marche : quatre temps, sans cadres -->
      <section class="how">
        <p class="eyebrow center">Il percorso</p>
        <h2 class="center">Comment ça marche ?</h2>
        <ol class="steps">
          <li v-for="s in steps" :key="s.n" class="step">
            <span class="step-num" aria-hidden="true">{{ s.n }}</span>
            <h3>{{ s.title }}</h3>
            <p>{{ s.text }}</p>
          </li>
        </ol>
      </section>

      <!-- Chiffres clés : rangée centrée, loin du soleil, chacun mène à la bibliothèque -->
      <div class="stats" aria-label="Leggendo en chiffres — cliquez pour explorer">
        <RouterLink class="stat" :to="{ name: 'library' }">
          <span class="stat-num">{{ textCount }}</span>
          <span class="stat-label">textes gradués</span>
        </RouterLink>
        <RouterLink class="stat" :to="{ name: 'library' }">
          <span class="stat-num">{{ levelRange }}</span>
          <span class="stat-label">niveaux CECR</span>
        </RouterLink>
        <RouterLink class="stat" :to="{ name: 'library' }">
          <span class="stat-num">{{ categoryCount }}</span>
          <span class="stat-label">thématiques</span>
        </RouterLink>
        <RouterLink class="stat" :to="{ name: 'words' }">
          <span class="stat-num">{{ totalWordsLabel }}</span>
          <span class="stat-label">mots à découvrir</span>
        </RouterLink>
      </div>

      <!-- Textes, méthode, Suisse : trois colonnes aérées -->
      <div class="row-cols">
        <section class="col">
          <p class="eyebrow">I racconti</p>
          <h2>Des textes qui racontent l'Italie</h2>
          <p>
            Histoire romaine, Renaissance, régions et dialectes, gastronomie,
            vie quotidienne — et une place particulière pour la Suisse
            italienne, du Tessin aux vallées des Grisons. Chaque texte est
            écrit pour son niveau, avec un vocabulaire choisi et des phrases
            calibrées.
          </p>
          <ul class="theme-chips" aria-label="Exemples de thématiques">
            <li v-for="t in themes" :key="t" class="chip-item">
              <RouterLink class="chip" :to="{ name: 'library' }">{{ t }}</RouterLink>
            </li>
          </ul>
          <RouterLink class="link-arrow" :to="{ name: 'library' }">
            Parcourir la bibliothèque →
          </RouterLink>
        </section>

        <article class="col">
          <p class="eyebrow">Il metodo</p>
          <h2>Une méthode fondée sur la recherche</h2>
          <p>
            La lecture extensive avec compréhension assistée est l'une des
            approches les mieux documentées en didactique des langues :
            l'exposition répétée à des textes compréhensibles construit le
            vocabulaire et la grammaire, naturellement.
          </p>
          <RouterLink class="link-arrow" :to="{ name: 'method' }">
            Découvrir la méthode →
          </RouterLink>
        </article>

        <article class="col">
          <p class="eyebrow">Le radici</p>
          <h2>Fait en Suisse</h2>
          <p>
            Leggendo est développé en Suisse, avec l'envie de rendre
            l'apprentissage de l'italien accessible et agréable — pour les
            curieux, les voyageurs et tous ceux qui aiment cette langue. Une
            question, une suggestion ?
          </p>
          <RouterLink class="link-arrow" :to="{ name: 'contact' }">
            Écrivez-nous →
          </RouterLink>
        </article>
      </div>

      <!-- Appel à l'action : barre de verre fumé -->
      <section class="cta">
        <div class="cta-copy">
          <h2><em>Si comincia ?</em> Prêt·e à lire votre premier texte ?</h2>
          <p>Choisissez votre niveau, survolez, écoutez. C'est tout.</p>
        </div>
        <div class="cta-actions">
          <RouterLink class="btn-primary" :to="{ name: 'library' }">
            Commencer à lire →
          </RouterLink>
          <RouterLink class="btn-ghost" :to="{ name: 'pricing' }">
            Voir les abonnements
          </RouterLink>
        </div>
      </section>
    </div>
  </SceneLayout>
</template>

<style scoped>
.about {
  margin-top: clamp(0.3rem, 1.4vh, 1rem);
  text-align: left;
  opacity: 0;
  animation: rise 0.9s ease-out 0.9s forwards;
}

.about h2 {
  margin: 0 0 0.45rem;
  font-size: clamp(0.95rem, 2vh, 1.12rem);
  font-weight: 600;
  letter-spacing: 0.3px;
  color: #2c2620;
}

.center {
  text-align: center;
}

/* Petit intitulé italien, en exergue */
.eyebrow {
  margin: 0 0 0.25rem;
  font-size: 0.68rem;
  font-style: italic;
  letter-spacing: 2.5px;
  text-transform: none;
  color: rgba(176, 105, 46, 0.75);
}

/* --- Accroche --- */

.lede {
  max-width: 860px;
  margin: 0 auto;
  text-align: center;
  font-size: clamp(0.82rem, 1.9vh, 0.98rem);
  line-height: 1.45;
  color: rgba(44, 38, 32, 0.75);
}

.lede em {
  color: #b0692e;
}

/* --- Démo : phrase seule, centrée --- */

.demo {
  max-width: 720px;
  margin: clamp(0.2rem, 0.9vh, 0.6rem) auto 0;
  text-align: center;
}

.demo-sentence {
  margin: 0;
  font-size: clamp(1.05rem, 2.6vh, 1.35rem);
  font-style: italic;
  line-height: 1.5;
  color: #2c2620;
}

.demo-word {
  position: relative;
  border: none;
  background: none;
  padding: 0.05rem 0.1rem;
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  border-bottom: 1px dotted rgba(138, 90, 43, 0.45);
  transition: color 0.15s, border-color 0.15s;
}

.demo-word:hover,
.demo-word.active {
  color: #b0692e;
  border-bottom-color: #b0692e;
}

.demo-word:focus-visible {
  outline: 2px solid #b0692e;
  outline-offset: 2px;
  border-radius: 3px;
}

.bubble {
  position: absolute;
  bottom: calc(100% + 7px);
  left: 50%;
  transform: translateX(-50%);
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: rgba(44, 38, 32, 0.92);
  color: #faf6f0;
  font-style: normal;
  font-size: 0.76rem;
  letter-spacing: 0.6px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 3;
  animation: pop 0.18s ease-out;
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

.listen-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.5em;
  height: 1.5em;
  margin-left: 0.35em;
  padding: 0;
  border: 1px solid rgba(176, 105, 46, 0.4);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  color: #b0692e;
  vertical-align: middle;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;
}

.listen-btn svg {
  width: 55%;
  height: 55%;
}

.listen-btn:hover {
  background: rgba(255, 255, 255, 0.75);
  border-color: #b0692e;
}

.listen-btn:focus-visible {
  outline: 2px solid #b0692e;
  outline-offset: 2px;
}

.listen-btn.speaking {
  background: #b0692e;
  color: #faf6f0;
  animation: breathe 1s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.12); }
}

/* --- Chiffres clés : anneaux délicats, rangée centrée --- */

.stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(0.8rem, 3vw, 2.2rem);
  margin: clamp(0.15rem, 0.7vh, 0.4rem) auto;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 0.1rem;
  width: clamp(76px, 11vh, 96px);
  height: clamp(76px, 11vh, 96px);
  border-radius: 50%;
  border: 1px solid rgba(176, 105, 46, 0.4);
  background: rgba(255, 255, 255, 0.25);
  text-decoration: none;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}

.stat:hover,
.stat:focus-visible {
  background: rgba(255, 255, 255, 0.6);
  border-color: rgba(176, 105, 46, 0.75);
  transform: translateY(-3px);
  box-shadow: 0 8px 16px rgba(138, 90, 43, 0.16);
}

.stat:focus-visible {
  outline: 2px solid #b0692e;
  outline-offset: 3px;
}

.stat-num {
  font-size: clamp(0.95rem, 2.3vh, 1.3rem);
  font-weight: 600;
  color: #8a5a2b;
  white-space: nowrap;
}

.stat-label {
  max-width: 88%;
  font-size: 0.56rem;
  line-height: 1.25;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: rgba(92, 58, 21, 0.7);
}

/* --- Étapes : quatre temps, filets fins --- */

.how {
  margin-top: clamp(0.25rem, 1vh, 0.7rem);
}

.how h2 {
  margin-bottom: 0.45rem;
}

.steps {
  list-style: none;
  width: 78%;
  margin: 0 auto;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
}

.step {
  padding: 0.2rem 1rem;
}

.step + .step {
  border-left: 1px solid rgba(176, 105, 46, 0.22);
}

.step-num {
  display: block;
  margin-bottom: 0.2rem;
  font-size: 0.72rem;
  font-style: italic;
  letter-spacing: 2px;
  color: rgba(176, 105, 46, 0.8);
}

.step h3 {
  margin: 0 0 0.25rem;
  font-size: clamp(0.78rem, 1.7vh, 0.9rem);
  font-weight: 600;
  color: #2c2620;
}

.step p {
  margin: 0;
  font-size: clamp(0.68rem, 1.5vh, 0.78rem);
  line-height: 1.45;
  color: rgba(44, 38, 32, 0.66);
}

/* --- Trois colonnes aérées --- */

.row-cols {
  display: grid;
  grid-template-columns: 1.15fr 1fr 1fr;
  gap: 2rem;
  padding: clamp(0.4rem, 1.2vh, 0.75rem) 1.1rem;
  border-radius: 16px;
  background: rgba(253, 246, 236, 0.6);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
}

.col p:not(.eyebrow) {
  margin: 0 0 0.45rem;
  font-size: clamp(0.68rem, 1.55vh, 0.8rem);
  line-height: 1.5;
  color: rgba(44, 38, 32, 0.7);
}

.theme-chips {
  list-style: none;
  margin: 0 0 0.45rem;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.7rem;
}

.chip-item {
  display: flex;
  align-items: center;
}

.chip-item + .chip-item::before {
  content: '·';
  margin-right: 0.7rem;
  color: rgba(176, 105, 46, 0.45);
}

.chip {
  font-size: 0.68rem;
  font-style: italic;
  letter-spacing: 0.5px;
  color: rgba(138, 90, 43, 0.85);
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}

.chip:hover,
.chip:focus-visible {
  color: #b0692e;
  border-bottom-color: #b0692e;
}

.chip:focus-visible {
  outline: none;
}

.link-arrow {
  display: inline-block;
  font-weight: 600;
  font-size: clamp(0.72rem, 1.5vh, 0.82rem);
  color: #b0692e;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s;
}

.link-arrow:hover {
  border-bottom-color: #b0692e;
}

/* --- CTA : verre fumé --- */

.cta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem 1.2rem;
  margin-top: clamp(0.25rem, 1vh, 0.7rem);
  padding: clamp(0.45rem, 1.3vh, 0.8rem) 1.6rem;
  border-radius: 999px;
  background: rgba(74, 52, 28, 0.82);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 12px 32px rgba(111, 71, 34, 0.28);
}

.cta-copy {
  text-align: left;
}

.cta h2 {
  margin: 0;
  color: #faf6f0;
  font-weight: 500;
  font-size: clamp(0.9rem, 2vh, 1.05rem);
}

.cta h2 em {
  color: #e8b478;
  margin-right: 0.3rem;
}

.cta p {
  margin: 0.1rem 0 0;
  font-size: clamp(0.68rem, 1.6vh, 0.8rem);
  color: rgba(250, 246, 240, 0.75);
}

.cta-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.btn-primary {
  padding: 0.45rem 1.3rem;
  border-radius: 999px;
  background: #faf6f0;
  color: #6f4722;
  font-weight: 700;
  font-size: clamp(0.76rem, 1.7vh, 0.88rem);
  text-decoration: none;
  transition: transform 0.15s, box-shadow 0.15s;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(44, 38, 32, 0.35);
}

.btn-ghost {
  padding: 0.45rem 1.3rem;
  border: 1px solid rgba(250, 246, 240, 0.45);
  border-radius: 999px;
  color: #faf6f0;
  font-weight: 500;
  font-size: clamp(0.76rem, 1.7vh, 0.88rem);
  text-decoration: none;
  transition: border-color 0.15s, background 0.15s;
}

.btn-ghost:hover {
  border-color: #faf6f0;
  background: rgba(250, 246, 240, 0.1);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* --- Écrans bas : on serre encore pour rester sans défilement --- */

@media (max-height: 680px) {
  .stat {
    width: 66px;
    height: 66px;
  }

  .stats {
    margin: 0.2rem auto;
  }

  .how {
    margin-top: 0.15rem;
  }

  .stat-num {
    font-size: 0.9rem;
  }

  .stat-label {
    font-size: 0.5rem;
  }

  .step p,
  .col p:not(.eyebrow) {
    font-size: 0.65rem;
    line-height: 1.35;
  }

  .demo-sentence {
    font-size: 0.95rem;
    line-height: 1.45;
  }

  .demo {
    margin-top: 0.2rem;
  }

  .about h2 {
    font-size: 0.86rem;
    margin-bottom: 0.25rem;
  }

  .lede {
    font-size: 0.76rem;
    line-height: 1.3;
  }

  .eyebrow {
    margin-bottom: 0.15rem;
    font-size: 0.62rem;
  }

  .step {
    padding: 0.1rem 0.8rem;
  }

  .row-cols {
    padding: 0.3rem 0.9rem;
    gap: 1.2rem;
  }

  .cta {
    margin-top: 0.3rem;
    padding: 0.4rem 1.4rem;
  }
}

/* --- Responsive : sur petit écran, on rend le défilement (contenu intact) --- */

@media (max-width: 980px) {
  .steps {
    width: 100%;
    grid-template-columns: 1fr 1fr;
    gap: 0.7rem 0;
  }

  .step:nth-child(3) {
    border-left: none;
  }

  .stats {
    flex-wrap: wrap;
  }

  .row-cols {
    grid-template-columns: 1fr;
    gap: 1.1rem;
  }
}

@media (max-width: 720px) {
  .steps {
    grid-template-columns: 1fr;
  }

  .step + .step {
    border-left: none;
    border-top: 1px solid rgba(176, 105, 46, 0.22);
    margin-top: 0.5rem;
    padding-top: 0.7rem;
  }

  .cta {
    justify-content: center;
    text-align: center;
    border-radius: 24px;
  }

  .cta-copy {
    text-align: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .about {
    animation: none;
    opacity: 1;
  }

  .bubble {
    animation: none;
  }

  .listen-btn.speaking {
    animation: none;
  }

  .stat:hover,
  .btn-primary:hover {
    transform: none;
  }
}
</style>
