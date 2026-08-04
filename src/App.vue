<script setup>
import { RouterView } from 'vue-router'
import NetworkBanner from './components/NetworkBanner.vue'
import NativeTabBar from './components/NativeTabBar.vue'
import { initProgressSync } from './lib/progressSync.js'
import { isNativeApp } from './lib/platform.js'
import { initBackButton } from './lib/backButton.js'
import { initStatusBar } from './lib/statusBar.js'

// Synchronise la progression (textes lus, favoris) avec le compte dès
// qu'un utilisateur est connecté, quelle que soit la page affichée.
initProgressSync()

// App native uniquement (no-op sur web, voir chaque module) — voir
// « Optimisation Mobile.md » Phase 1 Sprint 1.4 et Phase 3 Sprint 3.1.
initBackButton()
initStatusBar()
</script>

<template>
  <!-- Bannière hors-ligne : commune à toutes les pages -->
  <NetworkBanner />
  <!-- Web : chaque page embarque sa propre barre de navigation et son pied
       de page communs (SiteHeader / SiteFooter). App native : ce chrome
       s'efface (SiteHeader/SiteFooter se masquent eux-mêmes, voir
       lib/platform.js) au profit de la barre d'onglets ci-dessous — seul
       point qui décide du chrome, voir « Optimisation Mobile.md » Phase 1
       Sprint 1.1. -->
  <RouterView v-slot="{ Component }">
    <Transition :name="isNativeApp ? 'native-page' : undefined">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <NativeTabBar v-if="isNativeApp" />
</template>

<style>
/* Transition de page en app native uniquement (le nom de la transition est
   `undefined` sur web, voir ci-dessus — <Transition> sans nom n'anime rien
   et laisse le rendu web strictement inchangé). */
.native-page-enter-active,
.native-page-leave-active {
  transition: transform 0.22s ease-out, opacity 0.22s ease-out;
}

.native-page-enter-from {
  transform: translateX(16px);
  opacity: 0;
}

.native-page-leave-to {
  transform: translateX(-16px);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .native-page-enter-active,
  .native-page-leave-active {
    transition: none;
  }
}

/* Espace réservé pour la barre d'onglets fixe (App native uniquement) :
   appliqué via une classe sur <html>, posée par lib/platform.js — voir
   « Optimisation Mobile.md » Phase 1 Sprint 1.2. Les écrans en flux normal
   (#app, via SceneLayout) et les écrans encore en position: fixed;inset:0
   (Home, Words, Pricing, MethodView, MethodTextView) doivent tous les deux
   en tenir compte : le padding-bottom de safe-area posé pour la barre de
   gestes ne suffit plus, il faut ajouter la hauteur de la barre d'onglets. */
html.native-app body {
  padding-bottom: calc(env(safe-area-inset-bottom) + 3.4rem);
}

html.native-app .home-screen,
html.native-app .words-screen,
html.native-app .pricing-screen,
html.native-app .method-page {
  padding-bottom: calc(env(safe-area-inset-bottom) + 3.4rem);
}
</style>
