<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { dictionaryStats } from '../lib/dictionary.js'

// Chargées à la demande (voir lib/dictionary.js) : à zéro le temps du premier
// import(), remplies dès qu'il résout.
const stats = ref({ lemmaCount: 0, verbCount: 0, conjugatedVerbCount: 0, indexedFormCount: 0 })
dictionaryStats().then((s) => (stats.value = s))
</script>

<template>
  <SceneLayout title="Admin" accent=" · Dizionario" tagline="Couverture du dictionnaire" wide>
    <nav class="tabs">
      <RouterLink :to="{ name: 'admin' }" class="tab" exact-active-class="active">Comptes</RouterLink>
      <RouterLink :to="{ name: 'admin-words' }" class="tab" exact-active-class="active">Mots</RouterLink>
      <RouterLink :to="{ name: 'admin-texts' }" class="tab" exact-active-class="active">Textes</RouterLink>
      <RouterLink :to="{ name: 'admin-dictionary' }" class="tab active">Dizionario</RouterLink>
    </nav>

    <div class="stats">
      <div class="stat total">
        <span class="stat-value">{{ stats.lemmaCount }}</span>
        <span class="stat-label">Lemmes définis</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ stats.verbCount }}</span>
        <span class="stat-label">Verbes</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ stats.conjugatedVerbCount }}</span>
        <span class="stat-label">Verbes conjugués</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ stats.indexedFormCount }}</span>
        <span class="stat-label">Formes fléchies indexées</span>
      </div>
    </div>

    <p class="hint">
      Voir <code>scripts/prepare-batch.mjs</code> et
      <code>scripts/merge-dictionary-batches.mjs</code> pour générer et fusionner de nouveaux lots.
    </p>
  </SceneLayout>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 0.6rem;
  margin: 0 0 1.4rem;
}

.tab {
  padding: 0.4rem 0.9rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #6b6156;
  text-decoration: none;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}

.tab:hover {
  border-color: #b0692e;
}

.tab.active {
  background: #b0692e;
  border-color: #b0692e;
  color: #faf6f0;
}

.hint {
  color: #6b6156;
}

.hint code {
  font-size: 0.85em;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.8rem;
  margin: 0 0 1.6rem;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.9rem 0.6rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.6);
}

.stat.total {
  background: rgba(176, 105, 46, 0.1);
}

.stat-value {
  font-size: 1.6rem;
  font-weight: 700;
  color: #b0692e;
}

.stat-label {
  margin-top: 0.2rem;
  font-size: 0.78rem;
  color: #6b6156;
  text-align: center;
}
</style>
