<script setup>
import { RouterLink } from 'vue-router'
import { firebaseReady } from '../lib/firebase.js'
import { analyticsConsent, setAnalyticsConsent } from '../lib/consent.js'
</script>

<template>
  <!-- Consentement à la mesure d'audience (lib/consent.js) : non bloquant,
       « Refuser » aussi visible et aussi simple qu'« Accepter ». -->
  <section
    v-if="firebaseReady && analyticsConsent === null"
    class="consent-banner"
    role="region"
    aria-labelledby="consent-title"
  >
    <p id="consent-title" class="consent-text">
      <strong>Mesure d'audience</strong> — avec votre accord, Leggendo utilise
      Google Analytics (cookies) pour compter les visites et améliorer le site.
      Rien n'est chargé si vous refusez, et le site fonctionne de la même façon.
      <RouterLink :to="{ name: 'privacy' }">En savoir plus</RouterLink>
    </p>
    <div class="consent-actions">
      <button type="button" class="consent-btn" @click="setAnalyticsConsent('denied')">
        Refuser
      </button>
      <button type="button" class="consent-btn" @click="setAnalyticsConsent('granted')">
        Accepter
      </button>
    </div>
  </section>
</template>

<style scoped>
.consent-banner {
  position: fixed;
  right: 1rem;
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
  left: 1rem;
  z-index: 900;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem 1.2rem;
  max-width: 46rem;
  margin: 0 auto;
  padding: 0.9rem 1.1rem;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 0.9rem;
  background: #faf6f0;
  color: #2a2118;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.18);
}

/* App native : au-dessus de la barre d'onglets (NativeTabBar). */
:global(.native-app) .consent-banner {
  bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px));
}

.consent-text {
  flex: 1 1 20rem;
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.45;
}

.consent-text a {
  color: #8f5220;
}

.consent-actions {
  display: flex;
  flex: 1 0 auto;
  gap: 0.6rem;
  justify-content: flex-end;
}

/* Deux boutons strictement identiques : aucun choix n'est mis en avant. */
.consent-btn {
  flex: 1 0 auto;
  min-height: 2.75rem;
  padding: 0 1.2rem;
  border: 1px solid #8f5220;
  border-radius: 0.6rem;
  background: #fff;
  color: #8f5220;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.consent-btn:hover {
  background: #f3e6d6;
}

.consent-btn:focus-visible {
  outline: 2px solid #8f5220;
  outline-offset: 2px;
}
</style>
