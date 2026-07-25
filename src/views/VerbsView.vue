<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { allVerbs, dictionaryEntryCount } from '../lib/dictionary.js'

const query = ref('')

const verbs = computed(() => allVerbs())

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return verbs.value
  return verbs.value.filter((v) => v.lemma.includes(q) || v.fr.toLowerCase().includes(q))
})
</script>

<template>
  <SceneLayout title="Verbi " accent="italiani" tagline="Tous les verbes du dictionnaire" wide>
    <p class="hint">
      <strong>Version pilote</strong> — {{ verbs.length }} verbes définis pour l'instant (sur
      {{ dictionaryEntryCount() }} mots au total), chacun avec sa table de conjugaison complète.
    </p>

    <div class="search">
      <input v-model="query" type="text" placeholder="Filtrer les verbes…" autocomplete="off" />
    </div>

    <p v-if="!filtered.length" class="hint">Aucun verbe ne correspond à « {{ query }} ».</p>

    <ul v-else class="verbs">
      <li v-for="v in filtered" :key="v.lemma" class="verb">
        <div class="verb-main">
          <RouterLink :to="{ name: 'dictionary', params: { word: v.lemma } }" class="lemma">
            {{ v.lemma }}
          </RouterLink>
          <span class="pos">{{ v.pos }}</span>
        </div>
        <p class="fr">{{ v.fr }}</p>
        <RouterLink :to="{ name: 'conjugation', params: { verbo: v.lemma } }" class="btn-conj">
          Conjugaison →
        </RouterLink>
      </li>
    </ul>
  </SceneLayout>
</template>

<style scoped>
.hint {
  font-size: 0.9rem;
  line-height: 1.6;
  color: #6b6156;
  margin-top: 0.6rem;
}

.search {
  margin: 1.2rem 0;
}

.search input {
  width: 100%;
  padding: 0.7rem 1rem;
  border: 1px solid #d8cfc2;
  border-radius: 8px;
  font-size: 1rem;
  font-family: inherit;
  background: rgba(255, 255, 255, 0.85);
}

.search input:focus {
  outline: none;
  border-color: #b0692e;
}

.verbs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.6rem;
}

.verb {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.8rem 1rem;
  border: 1px solid #e4d9c6;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.85);
}

.verb-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.lemma {
  font-weight: 700;
  font-size: 1.05rem;
  color: #2c2620;
  text-decoration: none;
}

.lemma:hover {
  color: #b0692e;
}

.pos {
  font-size: 0.75rem;
  color: #6b6156;
  font-style: italic;
  text-align: right;
}

.fr {
  margin: 0;
  color: #6b6156;
  font-size: 0.9rem;
}

.btn-conj {
  align-self: flex-start;
  margin-top: 0.2rem;
  font-size: 0.82rem;
  color: #b0692e;
  text-decoration: none;
  font-weight: 600;
}

.btn-conj:hover {
  text-decoration: underline;
}
</style>
