<script setup>
import { onMounted, onUnmounted } from 'vue'
import SiteHeader from './SiteHeader.vue'
import SiteFooter from './SiteFooter.vue'

defineProps({
  // Titre façon héros : « Cont » + <em>atto</em>
  title: { type: String, required: true },
  accent: { type: String, default: '' },
  tagline: { type: String, default: '' },
  // Panneau étroit (formulaires) ou contenu livré tel quel (sans panneau vitré)
  narrow: { type: Boolean, default: false },
  bare: { type: Boolean, default: false },
  // Contenu large (grilles de cartes : la bibliothèque)
  wide: { type: Boolean, default: false },
  // Mise en page dense : titre réduit, marges resserrées, héros élargi
  compact: { type: Boolean, default: false },
})

// Plein écran : on verrouille le défilement du document (l'écran défile en interne)
onMounted(() => {
  document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  document.body.style.overflow = ''
})
</script>

<template>
  <section class="scene-screen" :class="{ compact }">
    <!-- Scène en fond : ciel, collines toscanes, soleil, cyprès -->
    <div class="scene" aria-hidden="true">
      <svg class="scene-svg" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="sl-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#fdf3e3" />
            <stop offset="100%" stop-color="#f7e3c8" />
          </linearGradient>
          <linearGradient id="sl-hill1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#d9b98a" />
            <stop offset="100%" stop-color="#cfa873" />
          </linearGradient>
          <linearGradient id="sl-hill2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c08b4d" />
            <stop offset="100%" stop-color="#b0692e" />
          </linearGradient>
          <linearGradient id="sl-hill3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#8a5a2b" />
            <stop offset="100%" stop-color="#6f4722" />
          </linearGradient>
        </defs>

        <rect width="1200" height="520" fill="url(#sl-sky)" />

        <circle class="sun" cx="880" cy="150" r="34" fill="#e8a84c" opacity="0.9" />
        <circle class="sun-halo" cx="880" cy="150" r="46" fill="none" stroke="#e8a84c" stroke-width="1.5" opacity="0.35" />

        <path
          class="hill hill-1"
          d="M0 400 Q 200 300 420 360 T 800 350 Q 1020 320 1200 380 L 1200 520 L 0 520 Z"
          fill="url(#sl-hill1)"
        />
        <path
          class="hill hill-2"
          d="M0 450 Q 260 360 520 420 T 1200 430 L 1200 520 L 0 520 Z"
          fill="url(#sl-hill2)"
        />
        <path
          class="hill hill-3"
          d="M0 500 Q 300 440 640 480 T 1200 490 L 1200 520 L 0 520 Z"
          fill="url(#sl-hill3)"
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
      <div class="hero" :class="{ narrow, wide }">
        <h1 class="title">{{ title }}<em v-if="accent">{{ accent }}</em></h1>
        <p v-if="tagline" class="tagline">{{ tagline }}</p>

        <template v-if="bare">
          <slot />
        </template>
        <div v-else class="panel page">
          <slot />
        </div>
      </div>
    </div>

    <!-- Bas d'écran : pied de page commun -->
    <SiteFooter />
  </section>
</template>

<style scoped>
.scene-screen {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: linear-gradient(180deg, #fdf3e3 0%, #f7e3c8 100%);
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
  align-items: flex-start;
  justify-content: center;
  padding: 2rem 1.5rem;
}

.hero {
  max-width: 760px;
  width: 100%;
  text-align: center;
}

.hero.narrow {
  max-width: 480px;
}

.hero.wide {
  max-width: 1100px;
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
  color: #b0692e;
  font-style: normal;
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

/* --- Panneau vitré --- */

.panel {
  margin-top: 1.6rem;
  padding: 1.6rem 1.8rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  text-align: left;
  opacity: 0;
  animation: appear 0.9s ease-out 0.9s forwards;
}

.panel :deep(h2:first-child) {
  margin-top: 0;
}

.panel :deep(> p:first-child) {
  margin-top: 0;
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

/* --- Mode compact : tout tient dans l'écran --- */

.compact .stage {
  padding: 0.7rem 1.5rem 0.5rem;
}

.compact .hero {
  max-width: 1180px;
}

.compact .title {
  font-size: clamp(1.4rem, 3.4vh, 2.1rem);
}

.compact .tagline {
  margin-top: 0.15rem;
  font-size: 0.7rem;
  letter-spacing: 4px;
}

@media (prefers-reduced-motion: reduce) {
  .sun,
  .sun-halo,
  .hill,
  .cypress,
  .title,
  .tagline,
  .panel {
    animation: none;
    opacity: 1;
  }
}
</style>
