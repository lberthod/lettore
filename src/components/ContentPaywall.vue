<script setup>
import { RouterLink, useRoute } from 'vue-router'
import { trackCtaClick } from '../lib/analytics.js'

// Mode gratuit (GRATUIT.md) : ce bloc n'apparaît qu'aux visiteurs sans
// compte — un compte connecté a accès à tout le contenu. Il invite donc à
// créer un compte gratuit, jamais à payer.
defineProps({
  // Où le bloc est affiché (mesure GA4) : 'text', 'classici'...
  placement: { type: String, default: 'text' },
})

const route = useRoute()

function onCtaClick() {
  trackCtaClick({ placement: 'reader-paywall', action: 'signup', destination: 'login' })
}
</script>

<template>
  <div class="paywall">
    <h2>Lisez la suite avec un compte gratuit</h2>
    <p>
      Ce contenu fait partie du catalogue complet, ouvert à tous les membres
      de Leggendo. Créer un compte est gratuit et le reste.
    </p>
    <ul>
      <li>Tous les textes gradués, tous niveaux (A1 à C2), et les Classici en entier</li>
      <li>Traduction des mots et des phrases, lecture audio en italien</li>
      <li>Progression et vocabulaire synchronisés entre appareils</li>
      <li>Des crédits chaque mois pour créer, faire corriger ou dialoguer avec l'IA</li>
    </ul>
    <RouterLink
      class="btn-hero"
      :to="{ name: 'login', query: { redirect: route.fullPath } }"
      @click="onCtaClick"
    >
      Créer mon compte gratuit
    </RouterLink>
    <p class="hint">
      Déjà membre ?
      <RouterLink :to="{ name: 'login', query: { redirect: route.fullPath } }">Se connecter</RouterLink>
    </p>
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
  background: #8f5220;
  color: #faf6f0;
  font-size: 0.98rem;
  font-weight: 700;
  text-decoration: none;
  box-shadow: 0 6px 20px rgba(176, 105, 46, 0.3);
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
}

.btn-hero:hover {
  background: #74411a;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(176, 105, 46, 0.35);
}

.hint {
  margin: 0.9rem 0 0;
  font-size: 0.88rem;
}

.hint a {
  color: #8a5a2b;
}
</style>
