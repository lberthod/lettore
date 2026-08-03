<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <!-- Pied de page commun à toutes les pages (source unique) -->
  <footer class="bottom">
    <nav class="legal">
      <RouterLink :to="{ name: 'pricing' }">Abonnement</RouterLink>
      <RouterLink :to="{ name: 'level-test' }">Test de niveau</RouterLink>
      <RouterLink :to="{ name: 'games' }">Giochi</RouterLink>
      <RouterLink :to="{ name: 'contact' }">Contact</RouterLink>
      <RouterLink :to="{ name: 'legal' }">Mentions légales</RouterLink>
      <RouterLink :to="{ name: 'privacy' }">Confidentialité</RouterLink>
      <RouterLink :to="{ name: 'terms' }">CGU / CGV</RouterLink>
    </nav>
    <p class="copyright">© {{ new Date().getFullYear() }} Leggendo — Fait en Suisse 🇨🇭</p>
  </footer>
</template>

<style scoped>
.bottom {
  position: relative;
  z-index: 2;
  background: linear-gradient(180deg, #8a5a2b 0%, #6f4722 100%);
  padding: 1rem 1.5rem 1.1rem;
}

.legal {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.2rem 1.1rem;
}

.legal a {
  color: rgba(250, 246, 240, 0.75);
  text-decoration: none;
  font-size: 0.75rem;
  transition: color 0.12s;
}

.legal a:hover {
  color: #faf6f0;
}

.copyright {
  margin: 0.5rem 0 0;
  text-align: center;
  font-size: 0.72rem;
  color: rgba(250, 246, 240, 0.5);
}
</style>
