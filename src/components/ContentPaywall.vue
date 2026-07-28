<script setup>
import { RouterLink, useRoute } from 'vue-router'
import { currentUser } from '../lib/auth.js'
import { trackCtaClick } from '../lib/analytics.js'

defineProps({
  // Où le paywall est affiché (mesure GA4) : 'text', 'classici'...
  placement: { type: String, default: 'text' },
})

const route = useRoute()

function onCtaClick(action) {
  trackCtaClick({
    placement: 'reader-paywall',
    action,
    destination: currentUser.value ? 'pricing' : 'login',
  })
}
</script>

<template>
  <div class="paywall">
    <h2>Débloquez la suite</h2>
    <p>
      Ce contenu fait partie du catalogue complet, réservé aux abonné·es
      Leggendo.
    </p>
    <ul>
      <li>Accès à l'ensemble du catalogue, tous niveaux (A1 à C2)</li>
      <li>Traduction des mots et des phrases</li>
      <li>Lecture audio en italien</li>
      <li>Progression et vocabulaire synchronisés entre appareils</li>
    </ul>
    <RouterLink
      v-if="!currentUser"
      class="btn-hero"
      :to="{ name: 'login', query: { redirect: route.fullPath } }"
      @click="onCtaClick('signup')"
    >
      Créer un compte gratuit
    </RouterLink>
    <RouterLink
      v-else
      class="btn-hero"
      :to="{ name: 'pricing', query: { redirect: route.fullPath } }"
      @click="onCtaClick('subscribe')"
    >
      Débloquer tous les textes
    </RouterLink>
  </div>
</template>

<style scoped>
.paywall {
  margin-top: 1.6rem;
  padding: 1.6rem 1.8rem;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.7);
  text-align: center;
}

.paywall h2 {
  margin: 0 0 0.4rem;
  font-size: 1.2rem;
  color: #2c2620;
}

.paywall p {
  margin: 0 0 0.8rem;
  color: rgba(44, 38, 32, 0.75);
}

.paywall ul {
  display: inline-block;
  margin: 0 0 1.2rem;
  padding-left: 1.1rem;
  text-align: left;
  font-size: 0.92rem;
  line-height: 1.6;
  color: rgba(44, 38, 32, 0.8);
}

.btn-hero {
  display: inline-block;
  padding: 0.7rem 1.7rem;
  border-radius: 999px;
  background: #b0692e;
  color: #faf6f0;
  font-size: 0.98rem;
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
</style>
