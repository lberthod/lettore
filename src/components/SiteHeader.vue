<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { currentUser } from '../lib/auth.js'
import { isLoggedIn, isAdmin } from '../lib/access.js'
import { progress } from '../progress.js'

// « Textes » et « Mes mots » ne s'affichent qu'une fois connecté
const loggedIn = computed(() => isLoggedIn())
const admin = computed(() => isAdmin())
</script>

<template>
  <!-- Barre de navigation commune à toutes les pages (source unique) -->
  <header class="chrome">
    <RouterLink class="chrome-brand" :to="{ name: 'home' }">Legg<em>endo</em></RouterLink>
    <nav class="chrome-nav">
      <RouterLink :to="{ name: 'home' }">Accueil</RouterLink>
      <RouterLink :to="{ name: 'library' }">Textes</RouterLink>
      <RouterLink :to="{ name: 'about' }">À propos</RouterLink>
      <RouterLink :to="{ name: 'method' }">Méthode</RouterLink>
      <RouterLink v-if="loggedIn" :to="{ name: 'create-text' }">Créer son texte</RouterLink>
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
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.6rem 1.5rem;
  padding: 1.1rem 1.5rem 0;
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

.chrome-nav {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.3rem 1.1rem;
}

.chrome-nav a {
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
</style>
