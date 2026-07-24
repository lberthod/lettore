<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useRouter } from 'vue-router'
import { plans, stripeReady, checkoutUrl } from '../lib/stripe.js'
import { currentUser } from '../lib/auth.js'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'

const billing = ref('monthly') // 'monthly' | 'annual'
const router = useRouter()

function subscribe(plan) {
  const link = plan[billing.value].paymentLink
  if (!link) return
  // Le paiement doit être rattaché à un compte : connexion d'abord,
  // puis retour ici pour finaliser l'abonnement.
  if (!currentUser.value) {
    router.push({ name: 'login', query: { redirect: '/abonnement' } })
    return
  }
  // Payment Link Stripe : redirection vers la page de paiement hébergée,
  // avec client_reference_id pour que le webhook active le bon compte.
  window.location.href = checkoutUrl(link, currentUser.value)
}

// Plein écran : on verrouille le défilement de la page (le panneau défile en interne)
onMounted(() => {
  document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  document.body.style.overflow = ''
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
            <stop offset="100%" stop-color="#b0692e" />
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
        <h1 class="title">Abbona<em>menti</em></h1>
        <p class="tagline">Abonnement</p>
        <p class="sub">
          Soutenez le projet et débloquez tous les textes avec la formule Premium.
        </p>

        <p v-if="!stripeReady" class="notice">
          Les formules payantes arrivent bientôt. En attendant, créez un compte
          gratuit pour découvrir la bibliothèque.
        </p>

        <div class="billing-toggle" role="group" aria-label="Fréquence de facturation">
          <button
            type="button"
            class="toggle-btn"
            :class="{ active: billing === 'monthly' }"
            @click="billing = 'monthly'"
          >
            Mensuel
          </button>
          <button
            type="button"
            class="toggle-btn"
            :class="{ active: billing === 'annual' }"
            @click="billing = 'annual'"
          >
            Annuel
          </button>
        </div>

        <div class="plans">
          <div
            v-for="plan in plans"
            :key="plan.id"
            class="plan"
            :class="{ highlight: plan.highlight }"
          >
            <span v-if="plan.highlight" class="ribbon">Consigliato</span>
            <h2>{{ plan.name }}</h2>
            <p class="price">
              {{ plan[billing].price
              }}<span class="period">{{ plan[billing].period }}</span>
            </p>
            <ul>
              <li v-for="f in plan.features" :key="f">{{ f }}</li>
            </ul>
            <button
              v-if="plan[billing].paymentLink !== null"
              class="btn-hero"
              :disabled="!plan[billing].paymentLink"
              @click="subscribe(plan)"
            >
              {{ plan[billing].paymentLink ? "S'abonner" : 'Bientôt disponible' }}
            </button>
            <RouterLink
              v-else-if="!currentUser"
              class="btn-ghost"
              :to="{ name: 'login' }"
            >
              Commencer gratuitement
            </RouterLink>
            <span v-else class="current">Votre formule actuelle</span>
          </div>
        </div>

        <p class="hint">
          Paiement sécurisé par Stripe. Résiliable à tout moment. Voir les
          <RouterLink :to="{ name: 'terms' }">conditions générales</RouterLink>.
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
  max-width: 1100px;
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
  color: #b0692e;
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

.notice {
  margin: 1.2rem auto 0;
  max-width: 520px;
  padding: 0.7rem 1rem;
  border: 1px solid rgba(176, 105, 46, 0.35);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.65);
  font-size: 0.88rem;
  color: #8a5a2b;
  opacity: 0;
  animation: appear 0.9s ease-out 1s forwards;
}

/* --- Bascule mensuel / annuel --- */

.billing-toggle {
  display: inline-flex;
  margin: 1.6rem auto 0;
  padding: 0.25rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
  opacity: 0;
  animation: appear 0.9s ease-out 1.1s forwards;
}

.toggle-btn {
  padding: 0.4rem 1.1rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #6b6156;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.toggle-btn.active {
  background: #b0692e;
  color: #faf6f0;
}

/* --- Cartes des formules --- */

.plans {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 0.9rem;
  margin: 1.8rem 0 0;
  text-align: left;
  opacity: 0;
  animation: appear 0.9s ease-out 1.2s forwards;
}

.plan {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.1rem 1.1rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  transition: transform 0.15s, box-shadow 0.15s;
}

.plan:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(138, 90, 43, 0.15);
}

.plan.highlight {
  border-color: #b0692e;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 6px 20px rgba(176, 105, 46, 0.2);
}

.ribbon {
  position: absolute;
  top: -0.7rem;
  right: 1rem;
  padding: 0.2rem 0.8rem;
  border-radius: 999px;
  background: #b0692e;
  color: #faf6f0;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.plan h2 {
  margin: 0;
  font-size: 1rem;
}

.price {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  color: #b0692e;
}

.period {
  font-size: 0.82rem;
  font-weight: 400;
  color: #6b6156;
}

.plan ul {
  margin: 0;
  padding-left: 1rem;
  font-size: 0.8rem;
  line-height: 1.5;
  flex-grow: 1;
}

.current {
  font-size: 0.9rem;
  font-weight: 600;
  color: #4a7c59;
}

/* --- Boutons (même langage que la home) --- */

.btn-hero {
  padding: 0.65rem 1.5rem;
  border: none;
  border-radius: 999px;
  background: #b0692e;
  color: #faf6f0;
  font-size: 0.95rem;
  font-weight: 700;
  font-family: inherit;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(176, 105, 46, 0.3);
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
}

.btn-hero:hover:not(:disabled) {
  background: #9a5a26;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(176, 105, 46, 0.35);
}

.btn-hero:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

.btn-ghost {
  padding: 0.65rem 1.5rem;
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
  border-color: #b0692e;
  color: #b0692e;
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
  .notice,
  .plans,
  .hint {
    animation: none;
    opacity: 1;
  }
}
</style>
