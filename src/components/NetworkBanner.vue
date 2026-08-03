<script setup>
import { isOnline } from '../lib/network.js'
</script>

<template>
  <Transition name="banner-slide">
    <div v-if="!isOnline" class="network-banner" role="status" aria-live="polite">
      ⚠ Vous êtes hors ligne — certaines fonctionnalités (connexion, génération,
      textes personnels) sont indisponibles tant que la connexion n'est pas
      rétablie.
    </div>
  </Transition>
</template>

<style scoped>
.network-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 300;
  padding: calc(0.55rem + env(safe-area-inset-top)) 1rem 0.55rem;
  background: #a34430;
  color: #faf6f0;
  font-size: 0.85rem;
  font-weight: 600;
  text-align: center;
}

.banner-slide-enter-active,
.banner-slide-leave-active {
  transition: transform 0.2s ease;
}

.banner-slide-enter-from,
.banner-slide-leave-to {
  transform: translateY(-100%);
}

@media (prefers-reduced-motion: reduce) {
  .banner-slide-enter-active,
  .banner-slide-leave-active {
    transition: none;
  }
}
</style>
