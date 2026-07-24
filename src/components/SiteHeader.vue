<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { currentUser } from '../lib/auth.js'
import { isLoggedIn, isAdmin } from '../lib/access.js'
import { progress } from '../progress.js'

// « Textes » et « Mes mots » ne s'affichent qu'une fois connecté
const loggedIn = computed(() => isLoggedIn())
const admin = computed(() => isAdmin())

// Menu compact (mobile) : replié par défaut, fermé à chaque navigation
const menuOpen = ref(false)
const route = useRoute()
watch(() => route.fullPath, () => (menuOpen.value = false))
</script>

<template>
  <!-- Barre de navigation commune à toutes les pages (source unique) -->
  <header class="chrome">
    <div class="chrome-bar">
      <RouterLink class="chrome-brand" :to="{ name: 'home' }">Legg<em>endo</em></RouterLink>
      <button
        class="menu-toggle"
        type="button"
        aria-label="Ouvrir le menu de navigation"
        :aria-expanded="menuOpen"
        aria-controls="chrome-nav"
        @click="menuOpen = !menuOpen"
      >
        <span class="menu-icon" :class="{ open: menuOpen }" aria-hidden="true">
          <span></span><span></span><span></span>
        </span>
      </button>
    </div>
    <nav id="chrome-nav" class="chrome-nav" :class="{ open: menuOpen }">
      <RouterLink :to="{ name: 'home' }">Accueil</RouterLink>
      <RouterLink :to="{ name: 'library' }">Textes</RouterLink>
      <RouterLink :to="{ name: 'about' }">À propos</RouterLink>
      <RouterLink :to="{ name: 'method' }">Méthode</RouterLink>
      <RouterLink v-if="loggedIn" :to="{ name: 'create-text' }">Créer son texte</RouterLink>
      <RouterLink v-if="loggedIn" :to="{ name: 'vocabulary' }">📖 Vocabulaire</RouterLink>
      <RouterLink v-if="loggedIn" :to="{ name: 'words' }">
        ☆ Mes mots<span v-if="progress.favorites.length" class="count">{{
          progress.favorites.length
        }}</span>
      </RouterLink>
      <RouterLink v-if="admin" :to="{ name: 'admin' }">⚙ Admin</RouterLink>
      <RouterLink v-if="currentUser" class="nav-auth" :to="{ name: 'profile' }">
        {{ currentUser.displayName || 'Profil' }}
      </RouterLink>
      <RouterLink v-else class="nav-auth" :to="{ name: 'login' }">Connexion</RouterLink>
    </nav>
  </header>
</template>

<style scoped>
.chrome {
  position: relative;
  z-index: 2;
  padding: 1.1rem 1.5rem 0;
}

.chrome-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.chrome-brand {
  color: #2c2620;
  text-decoration: none;
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 1px;
}

.chrome-brand em {
  color: #b0692e;
  font-style: italic;
}

/* Bouton hamburger : masqué sur desktop, affiché en dessous du seuil mobile */
.menu-toggle {
  display: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.menu-icon {
  position: relative;
  display: block;
  width: 22px;
  height: 16px;
}

.menu-icon span {
  position: absolute;
  left: 0;
  width: 100%;
  height: 2px;
  border-radius: 2px;
  background: #2c2620;
  transition: transform 0.18s, opacity 0.18s, top 0.18s;
}

.menu-icon span:nth-child(1) { top: 0; }
.menu-icon span:nth-child(2) { top: 7px; }
.menu-icon span:nth-child(3) { top: 14px; }

.menu-icon.open span:nth-child(1) {
  top: 7px;
  transform: rotate(45deg);
}

.menu-icon.open span:nth-child(2) {
  opacity: 0;
}

.menu-icon.open span:nth-child(3) {
  top: 7px;
  transform: rotate(-45deg);
}

.chrome-nav {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 0.3rem 1.1rem;
  margin-top: 0.6rem;
}

.chrome-nav a {
  display: flex;
  align-items: center;
  min-height: 44px;
  color: #6b6156;
  text-decoration: none;
  font-size: 0.92rem;
  padding: 0.2rem 0;
  border-bottom: 2px solid transparent;
  transition: color 0.12s;
}

.chrome-nav a:hover {
  color: #b0692e;
}

.chrome-nav a.router-link-exact-active {
  color: #b0692e;
  border-bottom-color: #b0692e;
}

.nav-auth {
  font-weight: 700;
}

.count {
  display: inline-block;
  min-width: 1.3em;
  text-align: center;
  margin-left: 0.3rem;
  padding: 0.05rem 0.3rem;
  border-radius: 999px;
  background: #b0692e;
  color: #faf6f0;
  font-size: 0.72rem;
  font-weight: 700;
}

/* --- Mobile : menu replié en hamburger --- */
@media (max-width: 640px) {
  .menu-toggle {
    display: inline-flex;
  }

  .chrome-nav {
    display: none;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    margin-top: 0.8rem;
    padding-bottom: 0.6rem;
    border-top: 1px solid rgba(176, 105, 46, 0.2);
  }

  .chrome-nav.open {
    display: flex;
  }

  .chrome-nav a {
    justify-content: flex-start;
    padding: 0.5rem 0.2rem;
    border-bottom: 1px solid rgba(176, 105, 46, 0.12);
  }

  .chrome-nav a.router-link-exact-active {
    border-bottom-color: rgba(176, 105, 46, 0.12);
  }
}
</style>
