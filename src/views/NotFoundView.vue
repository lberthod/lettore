<script setup>
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
</script>

<template>
  <SceneLayout title="Pagina" accent=" non trovata" tagline="Erreur 404" narrow>
    <p>
      Cette page n'existe pas ou plus. Le lien que vous avez suivi est peut-être
      obsolète, ou l'adresse a été mal recopiée.
    </p>
    <p class="links">
      <RouterLink class="btn-primary" :to="{ name: 'library' }">
        Voir les textes gratuits
      </RouterLink>
      <RouterLink class="btn-ghost" :to="{ name: 'dictionary' }">
        Ouvrir le dictionnaire
      </RouterLink>
    </p>
  </SceneLayout>
</template>

<style scoped>
.links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem;
  margin-top: 1.4rem;
}

.btn-primary,
.btn-ghost {
  padding: 0.65rem 1.4rem;
  border-radius: 999px;
  font-size: 0.95rem;
  font-weight: 700;
  text-decoration: none;
  transition: background 0.15s, color 0.15s, transform 0.15s;
}

.btn-primary {
  background: #b0692e;
  color: #faf6f0;
  box-shadow: 0 6px 20px rgba(176, 105, 46, 0.3);
}

.btn-primary:hover {
  background: #9a5a26;
  transform: translateY(-2px);
}

.btn-ghost {
  border: 1px solid rgba(138, 90, 43, 0.45);
  color: #6b6156;
}

.btn-ghost:hover {
  border-color: #b0692e;
  color: #b0692e;
}
</style>
