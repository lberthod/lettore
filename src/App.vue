<script setup>
import { RouterView } from 'vue-router'
import NetworkBanner from './components/NetworkBanner.vue'
import { initProgressSync } from './lib/progressSync.js'

// Synchronise la progression (textes lus, favoris) avec le compte dès
// qu'un utilisateur est connecté, quelle que soit la page affichée.
initProgressSync()
</script>

<template>
  <!-- Bannière hors-ligne : commune à toutes les pages -->
  <NetworkBanner />
  <!-- Chaque page est un écran plein qui embarque sa propre barre de navigation
       et son pied de page communs (SiteHeader / SiteFooter). -->
  <RouterView />
</template>
