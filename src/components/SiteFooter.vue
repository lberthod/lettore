<script setup>
import { RouterLink } from 'vue-router'
import { isNativeApp } from '../lib/platform.js'
import { LEVEL_LANDING_PAGES } from '../seo/landingPages.js'
import { PAID_PLANS } from '../lib/access.js'
</script>

<template>
  <!-- Pied de page commun à toutes les pages (source unique). Masqué en app
       native : les liens légaux/compte vivent dans Profil (ProfileView),
       voir « Optimisation Mobile.md » Phase 1 Sprint 1.3. -->
  <footer v-if="!isNativeApp" class="bottom">
    <!-- Maillage interne vers les pages par niveau (ROADMAP_SEO_GEO.md,
         phase 2) : sans ces liens, /textes-italien-a1..b2 n'étaient
         atteignables que par le sitemap, jamais depuis la navigation. -->
    <nav class="levels">
      <RouterLink
        v-for="p in LEVEL_LANDING_PAGES"
        :key="p.path"
        :to="{ name: `level-${p.level.toLowerCase()}` }"
      >
        Textes {{ p.level }}
      </RouterLink>
    </nav>
    <nav class="legal">
      <RouterLink v-if="PAID_PLANS" :to="{ name: 'pricing' }">Abonnement</RouterLink>
      <RouterLink :to="{ name: 'level-test' }">Test de niveau</RouterLink>
      <RouterLink :to="{ name: 'games' }">Giochi</RouterLink>
      <RouterLink :to="{ name: 'contact' }">Contact</RouterLink>
      <RouterLink :to="{ name: 'legal' }">Mentions légales</RouterLink>
      <RouterLink :to="{ name: 'privacy' }">Confidentialité</RouterLink>
      <RouterLink :to="{ name: 'terms' }">Conditions d'utilisation</RouterLink>
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

.levels,
.legal {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.2rem 1.1rem;
}

.levels {
  margin-bottom: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgba(250, 246, 240, 0.15);
}

.levels a,
.legal a {
  /* #f3ebdf sur le haut du dégradé (#8a5a2b) : 5,0:1 (WCAG AA). */
  color: #f3ebdf;
  text-decoration: none;
  font-size: 0.75rem;
  /* Cible tactile >= 24 px de haut (WCAG 2.5.8) sans changer la mise en page. */
  display: inline-flex;
  align-items: center;
  min-height: 1.5rem;
  transition: color 0.12s;
}

.levels a:hover,
.legal a:hover {
  color: #fff;
  text-decoration: underline;
}

.copyright {
  margin: 0.5rem 0 0;
  text-align: center;
  font-size: 0.72rem;
  color: #f0e6d8; /* 4,76:1 sur #8a5a2b */
}
</style>
