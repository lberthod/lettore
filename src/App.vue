<script setup>
import { RouterView } from 'vue-router'
import NetworkBanner from './components/NetworkBanner.vue'
import NativeTabBar from './components/NativeTabBar.vue'
import NativeAccountButton from './components/NativeAccountButton.vue'
import { initProgressSync } from './lib/progressSync.js'
import { isNativeApp } from './lib/platform.js'
import { initBackButton } from './lib/backButton.js'
import { initStatusBar } from './lib/statusBar.js'
import { ref, watch, nextTick } from 'vue'
import {
  initPushSync,
  pushPromptVisible,
  acceptPushPrompt,
  dismissPushPrompt,
} from './lib/push.js'

// Synchronise la progression (textes lus, favoris) avec le compte dès
// qu'un utilisateur est connecté, quelle que soit la page affichée.
initProgressSync()

// App native uniquement (no-op sur web, voir chaque module) — voir
// « Optimisation Mobile.md » Phase 1 Sprint 1.4 et Phase 3 Sprint 3.1.
initBackButton()
initStatusBar()
initPushSync()

// Écran explicatif avant la demande de permission des notifications (voir
// lib/push.js) : dialogue modal, focus piégé, Échap = « Plus tard ».
const pushDialog = ref(null)
const pushAcceptBtn = ref(null)
let previouslyFocused = null

watch(pushPromptVisible, async (visible) => {
  if (visible) {
    previouslyFocused = document.activeElement
    await nextTick()
    pushAcceptBtn.value?.focus()
  } else if (previouslyFocused && previouslyFocused.focus) {
    previouslyFocused.focus()
    previouslyFocused = null
  }
})

// Le routeur n'utilise pas les ancres : on déplace le focus à la main.
function skipToMain() {
  const el = document.getElementById('main')
  if (el) {
    el.focus({ preventScroll: false })
    el.scrollIntoView()
  }
}

function onPushKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    dismissPushPrompt()
    return
  }
  if (e.key !== 'Tab') return
  const focusables = pushDialog.value?.querySelectorAll('button')
  if (!focusables || !focusables.length) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
</script>

<template>
  <!-- Bannière hors-ligne : commune à toutes les pages -->
  <NetworkBanner />
  <!-- Lien d'évitement global (visible au focus clavier) -->
  <a class="skip-main" href="#main" @click.prevent="skipToMain">Aller au contenu</a>
  <!-- Web : chaque page embarque sa propre barre de navigation et son pied
       de page communs (SiteHeader / SiteFooter). App native : ce chrome
       s'efface (SiteHeader/SiteFooter se masquent eux-mêmes, voir
       lib/platform.js) au profit de la barre d'onglets ci-dessous — seul
       point qui décide du chrome, voir « Optimisation Mobile.md » Phase 1
       Sprint 1.1. -->
  <main id="main" tabindex="-1" class="app-main">
    <RouterView v-slot="{ Component }">
      <Transition :name="isNativeApp ? 'native-page' : undefined">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>
  <NativeTabBar v-if="isNativeApp" />
  <NativeAccountButton v-if="isNativeApp" />

  <!-- Écran explicatif des notifications : affiché après un premier texte
       terminé, jamais à la connexion. La demande système n'a lieu qu'au tap
       sur « Activer ». -->
  <div v-if="pushPromptVisible" class="push-backdrop">
    <div
      ref="pushDialog"
      class="push-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-title"
      aria-describedby="push-desc"
      @keydown="onPushKeydown"
    >
      <h2 id="push-title">Bravo, premier texte terminé !</h2>
      <p id="push-desc">
        Voulez-vous recevoir des notifications ? Nous vous enverrons un rappel
        pour garder votre série de lecture, l'annonce de nouveaux textes et
        l'alerte quand un texte que vous avez généré est prêt. Vous pouvez
        les désactiver à tout moment dans les réglages de votre téléphone.
      </p>
      <div class="push-actions">
        <button ref="pushAcceptBtn" type="button" class="push-btn push-btn-primary" @click="acceptPushPrompt">
          Activer les notifications
        </button>
        <button type="button" class="push-btn" @click="dismissPushPrompt">Plus tard</button>
      </div>
    </div>
  </div>
</template>

<style>
.skip-main {
  position: fixed;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 2000;
  padding: 0.6rem 1rem;
  border-radius: 0.5rem;
  background: #2a2118;
  color: #faf6f0;
  font-weight: 600;
  text-decoration: none;
  transform: translateY(-200%);
}

.skip-main:focus {
  transform: none;
  outline: 2px solid #faf6f0;
  outline-offset: 2px;
}

.app-main {
  display: block;
}

.app-main:focus {
  outline: none;
}

.push-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.5);
}

.push-dialog {
  max-width: 24rem;
  padding: 1.25rem;
  border-radius: 0.9rem;
  background: #faf6f0;
  color: #2a2118;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}

.push-dialog h2 {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
}

.push-dialog p {
  margin: 0 0 1rem;
  line-height: 1.45;
}

.push-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.push-btn {
  min-height: 2.75rem;
  border: 1px solid #8f5220;
  border-radius: 0.6rem;
  background: transparent;
  color: #8f5220;
  font: inherit;
  cursor: pointer;
}

.push-btn-primary {
  background: #8f5220;
  color: #faf6f0;
}

.push-btn:focus-visible {
  outline: 3px solid #2a2118;
  outline-offset: 2px;
}

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
