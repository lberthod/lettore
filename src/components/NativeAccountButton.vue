<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { isLoggedIn } from '../lib/access.js'
import { tapFeedback } from '../lib/haptics.js'

// Accès au compte en app native : icône fixe en haut à droite plutôt qu'un
// onglet de la barre du bas (qui n'en garde que 4 — Accueil/Testi/Giochi/
// Lessico — voir NativeTabBar.vue), affichée sur tout écran natif comme la
// barre d'onglets elle-même. Mène à la connexion tant qu'il n'y a pas de
// compte — ProfileView exige requiresAuth, inutile de rediriger vers
// /profil pour se refaire rediriger vers /connexion.
const route = useRoute()
const to = computed(() => (isLoggedIn() ? { name: 'profile' } : { name: 'login' }))
const active = computed(() => route.meta.tab === 'profilo')
</script>

<template>
  <RouterLink
    :to="to"
    class="account-button"
    :class="{ active }"
    :aria-current="active ? 'page' : undefined"
    aria-label="Mon compte"
    @click="tapFeedback()"
  >
    <span aria-hidden="true">👤</span>
  </RouterLink>
</template>

<style scoped>
.account-button {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 0.6rem);
  right: 0.9rem;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 50%;
  background: #fffaf2;
  border: 1px solid rgba(176, 105, 46, 0.25);
  box-shadow: 0 2px 10px rgba(44, 38, 32, 0.12);
  text-decoration: none;
  font-size: 1.15rem;
}

.account-button.active {
  border-color: #8a5a2b;
  background: rgba(176, 105, 46, 0.12);
}
</style>
