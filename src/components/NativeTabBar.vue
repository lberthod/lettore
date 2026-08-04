<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { isLoggedIn } from '../lib/access.js'
import { tapFeedback } from '../lib/haptics.js'

// Barre d'onglets de l'app native (remplace SiteHeader/SiteFooter, voir
// « Optimisation Mobile.md » Phase 1 Sprint 1.2). L'onglet actif se lit sur
// route.meta.tab (router.js) plutôt que sur une liste de noms de route codée
// ici, pour qu'une route enfant (ex. le lecteur /testo/:id) garde l'onglet
// parent (Testi) surligné sans entretien à deux endroits.
const TABS = [
  { tab: 'home', to: { name: 'home' }, label: 'Accueil', icon: '🏠' },
  { tab: 'testi', to: { name: 'library' }, label: 'Testi', icon: '📖' },
  { tab: 'giochi', to: { name: 'games' }, label: 'Giochi', icon: '🎮' },
  { tab: 'lessico', to: { name: 'dictionary' }, label: 'Lessico', icon: '📚' },
  { tab: 'profilo', to: { name: 'profile' }, label: 'Profilo', icon: '👤' },
]

const route = useRoute()
const activeTab = computed(() => route.meta.tab)

// L'onglet Profilo mène à la connexion tant qu'il n'y a pas de compte —
// ProfileView exige requiresAuth, inutile d'y rediriger pour se refaire
// rediriger vers /connexion.
const tabs = computed(() =>
  TABS.map((t) =>
    t.tab === 'profilo' && !isLoggedIn() ? { ...t, to: { name: 'login' } } : t
  )
)
</script>

<template>
  <nav class="native-tab-bar" aria-label="Navigation principale">
    <RouterLink
      v-for="t in tabs"
      :key="t.tab"
      :to="t.to"
      class="tab"
      :class="{ active: activeTab === t.tab }"
      :aria-current="activeTab === t.tab ? 'page' : undefined"
      @click="tapFeedback()"
    >
      <span class="tab-icon" aria-hidden="true">{{ t.icon }}</span>
      <span class="tab-label">{{ t.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.native-tab-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 500;
  display: flex;
  background: #fffaf2;
  border-top: 1px solid rgba(176, 105, 46, 0.18);
  padding: 0.35rem 0.3rem calc(0.35rem + env(safe-area-inset-bottom));
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.3rem 0.2rem;
  border-radius: 10px;
  text-decoration: none;
  /* #6b6156 sur #fffaf3 : contraste 5.83:1, conforme WCAG AA (le
     #9a8f80 d'origine ne passait pas à 0.68rem — 3.06:1). */
  color: #6b6156;
  font-size: 0.68rem;
  font-weight: 600;
}

.tab-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.tab.active {
  /* #8a5a2b sur #fffaf3 : 5.65:1 (le #b0692e d'origine faisait 4.12:1). */
  color: #8a5a2b;
  background: rgba(176, 105, 46, 0.1);
}
</style>
