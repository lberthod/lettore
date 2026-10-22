<script setup>
import { onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { ref } from 'vue'
import { currentUser } from '../lib/auth.js'
import { FREE_FEATURES, FREE_FAQ } from '../seo/freePage.js'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'

// Page « Gratuit » (GRATUIT.md) : Leggendo n'a plus de formule payante. La
// route garde son chemin /abonnement (liens indexés, applications déjà
// installées) mais explique ce qui est inclus et pourquoi c'est gratuit.
// Contenu (fonctionnalités, FAQ) partagé avec scripts/prerender.mjs via
// src/seo/freePage.js, pour garder le FAQPage JSON-LD synchronisé côté bots.
const faq = FREE_FAQ
const features = FREE_FEATURES
const openFaq = ref(0)
let faqJsonLd

onMounted(() => {
  document.body.style.overflow = 'hidden'
  faqJsonLd = document.createElement('script')
  faqJsonLd.type = 'application/ld+json'
  faqJsonLd.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  })
  document.head.appendChild(faqJsonLd)
})
onUnmounted(() => {
  document.body.style.overflow = ''
  faqJsonLd?.remove()
})
</script>

<template>
  <section class="pricing-screen">
    <!-- Scène en fond : ciel, collines toscanes, soleil, cyprès -->
    <div class="scene" aria-hidden="true">
      <svg class="scene-svg" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="p-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fdf3e3" />
            <stop offset="100%" stop-color="#f7e3c8" />
          </linearGradient>
          <linearGradient id="p-hill1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#d9b98a" />
            <stop offset="100%" stop-color="#cfa873" />
          </linearGradient>
          <linearGradient id="p-hill2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c08b4d" />
            <stop offset="100%" stop-color="#8f5220" />
          </linearGradient>
          <linearGradient id="p-hill3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#8a5a2b" />
            <stop offset="100%" stop-color="#6f4722" />
          </linearGradient>
        </defs>

        <rect width="1200" height="520" fill="url(#p-sky)" />

        <circle class="sun" cx="880" cy="150" r="52" fill="#e8a84c" opacity="0.9" />
        <circle class="sun-halo" cx="880" cy="150" r="80" fill="none" stroke="#e8a84c" stroke-width="1.5" opacity="0.35" />

        <path
          class="hill hill-1"
          d="M0 400 Q 200 300 420 360 T 800 350 Q 1020 320 1200 380 L 1200 520 L 0 520 Z"
          fill="url(#p-hill1)"
        />
        <path
          class="hill hill-2"
          d="M0 450 Q 260 360 520 420 T 1200 430 L 1200 520 L 0 520 Z"
          fill="url(#p-hill2)"
        />
        <path
          class="hill hill-3"
          d="M0 500 Q 300 440 640 480 T 1200 490 L 1200 520 L 0 520 Z"
          fill="url(#p-hill3)"
        />

        <!-- Cyprès -->
        <g class="cypress" fill="#5a6e3f">
          <ellipse cx="220" cy="382" rx="9" ry="34" />
          <ellipse cx="244" cy="390" rx="7" ry="27" />
          <ellipse cx="960" cy="400" rx="8" ry="30" />
          <ellipse cx="982" cy="408" rx="6" ry="23" />
        </g>
      </svg>
    </div>

    <!-- Barre de navigation commune -->
    <SiteHeader />

    <!-- Contenu centré -->
    <div class="stage">
      <div class="hero">
        <h1 class="title" lang="it">Gratu<em>ito</em></h1>
        <p class="tagline">Leggendo est gratuit</p>
        <p class="sub">
          Tout le site, sans abonnement, sans essai limité, sans carte bancaire.
          Un compte suffit, et il est gratuit lui aussi.
        </p>

        <div class="actions">
          <RouterLink
            v-if="!currentUser"
            class="btn-hero"
            :to="{ name: 'login', query: { redirect: '/textes' } }"
          >
            Créer mon compte gratuit
          </RouterLink>
          <RouterLink v-else class="btn-hero" :to="{ name: 'library' }">
            Commencer à lire →
          </RouterLink>
          <RouterLink class="btn-ghost" :to="{ name: 'method' }">
            Comment ça marche
          </RouterLink>
        </div>

        <ul class="features">
          <li v-for="f in features" :key="f.title" class="feature">
            <span class="feature-icon" aria-hidden="true">{{ f.icon }}</span>
            <h2>{{ f.title }}</h2>
            <p>{{ f.text }}</p>
          </li>
        </ul>

        <div class="faq">
          <h2 class="faq-title">Questions fréquentes</h2>
          <div
            v-for="(item, i) in faq"
            :key="item.q"
            class="faq-item"
            :class="{ open: openFaq === i }"
          >
            <button class="faq-q" type="button" @click="openFaq = openFaq === i ? null : i">
              {{ item.q }}
              <span class="chev">▾</span>
            </button>
            <div class="faq-a">
              <div class="faq-a-inner"><p>{{ item.a }}</p></div>
            </div>
          </div>
        </div>

        <p class="hint">
          Voir les
          <RouterLink :to="{ name: 'terms' }">conditions d'utilisation</RouterLink>.
        </p>
      </div>
    </div>

    <!-- Pied de page commun -->
    <SiteFooter />
  </section>
</template>

<style scoped>
.pricing-screen {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: linear-gradient(180deg, #fdf3e3 0%, #f7e3c8 100%);
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

/* --- Scène en fond --- */

.scene {
  position: fixed;
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

.cypress {
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

/* --- Contenu --- */

.stage {
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.hero {
  max-width: 1000px;
  width: 100%;
  text-align: center;
}

.title {
  margin: 0;
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 400;
  letter-spacing: 1px;
  opacity: 0;
  animation: appear 0.9s ease-out 0.3s forwards;
}

.title em {
  color: #8f5220;
}

.tagline {
  margin: 0.6rem 0 0;
  font-size: clamp(0.8rem, 1.6vw, 0.95rem);
  font-weight: 400;
  letter-spacing: 5px;
  text-transform: uppercase;
  color: #6b6156;
  opacity: 0;
  animation: appear 0.9s ease-out 0.6s forwards;
}

.sub {
  margin: 1rem auto 0;
  max-width: 520px;
  font-size: 1rem;
  line-height: 1.65;
  color: rgba(44, 38, 32, 0.7);
  opacity: 0;
  animation: appear 0.9s ease-out 0.9s forwards;
}

/* --- Boutons (même langage que la home) --- */

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.7rem;
  margin: 1.5rem 0 0;
  opacity: 0;
  animation: appear 0.9s ease-out 1.1s forwards;
}

.btn-hero {
  padding: 0.7rem 1.7rem;
  border: none;
  border-radius: 999px;
  background: #8f5220;
  color: #faf6f0;
  font-size: 0.98rem;
  font-weight: 700;
  font-family: inherit;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(176, 105, 46, 0.3);
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
}

.btn-hero:hover {
  background: #74411a;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(176, 105, 46, 0.35);
}

.btn-ghost {
  padding: 0.7rem 1.5rem;
  border: 1px solid rgba(138, 90, 43, 0.45);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.4);
  color: #6b6156;
  font-size: 0.95rem;
  font-weight: 600;
  text-align: center;
  text-decoration: none;
  transition: border-color 0.15s, color 0.15s;
}

.btn-ghost:hover {
  border-color: #8f5220;
  color: #8f5220;
}

/* --- Ce qui est inclus --- */

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.9rem;
  margin: 1.8rem 0 0;
  padding: 0;
  list-style: none;
  text-align: left;
  opacity: 0;
  animation: appear 0.9s ease-out 1.2s forwards;
}

@media (max-width: 480px) {
  .features {
    grid-template-columns: 1fr;
  }
}

.feature {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1.1rem 1.1rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.feature-icon {
  font-size: 1.4rem;
}

.feature h2 {
  margin: 0;
  font-size: 1rem;
  color: #2c2620;
}

.feature p {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.55;
  color: rgba(44, 38, 32, 0.75);
}

.hint {
  margin: 1.4rem 0 0;
  font-size: 0.85rem;
  color: rgba(44, 38, 32, 0.65);
  opacity: 0;
  animation: appear 0.9s ease-out 1.5s forwards;
}

.hint a {
  color: #8a5a2b;
}

/* --- FAQ (même logique d'accordéon que MethodView, palette claire) --- */

.faq {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 2rem auto 0;
  max-width: 560px;
  text-align: left;
  opacity: 0;
  animation: appear 0.9s ease-out 1.4s forwards;
}

.faq-title {
  margin: 0 0 0.3rem;
  font-size: 1rem;
  font-weight: 700;
  color: #2c2620;
  text-align: center;
}

.faq-item {
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.65);
  overflow: hidden;
  transition: border-color 0.15s;
}

.faq-item.open {
  border-color: #8f5220;
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
  font-size: 0.9rem;
  font-weight: 600;
  color: #2c2620;
  text-align: left;
  cursor: pointer;
}

.faq-q .chev {
  color: #8f5220;
  transition: transform 0.2s;
  flex-shrink: 0;
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
  font-size: 0.85rem;
  line-height: 1.6;
  color: rgba(44, 38, 32, 0.75);
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

@media (prefers-reduced-motion: reduce) {
  .sun,
  .sun-halo,
  .hill,
  .cypress,
  .title,
  .tagline,
  .sub,
  .actions,
  .features,
  .faq,
  .hint {
    animation: none;
    opacity: 1;
  }
}
</style>
