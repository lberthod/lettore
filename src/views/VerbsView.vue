<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { allVerbs, dictionaryEntryCount } from '../lib/dictionary.js'

const query = ref('')

// Chargés à la demande (voir lib/dictionary.js) : vides le temps du premier
// import(), remplis dès qu'il résout.
const verbs = ref([])
allVerbs().then((v) => (verbs.value = v))

const entryCount = ref(0)
dictionaryEntryCount().then((n) => (entryCount.value = n))

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return verbs.value
  return verbs.value.filter((v) => v.lemma.includes(q) || v.fr.toLowerCase().includes(q))
})
</script>

<template>
  <SceneLayout title="Verbi " accent="italiani" tagline="Tous les verbes du dictionnaire" wide>
    <p class="hint">
      {{ verbs.length }} verbes définis pour l'instant (sur
      {{ entryCount }} mots au total), chacun avec sa table de conjugaison complète.
    </p>

    <div class="search">
      <input v-model="query" type="text" placeholder="Filtrer les verbes…" autocomplete="off" />
    </div>

    <p v-if="!filtered.length" class="hint">Aucun verbe ne correspond à « {{ query }} ».</p>

    <ul v-else class="verbs">
      <li v-for="v in filtered" :key="v.lemma" class="verb">
        <RouterLink :to="{ name: 'dictionary', params: { word: v.lemma } }" class="lemma">
          {{ v.lemma }}
        </RouterLink>
        <span class="fr">{{ v.fr }}</span>
        <RouterLink
          :to="{ name: 'conjugation', params: { verbo: v.lemma } }"
          class="btn-conj"
          title="Conjugaison"
        >
          →
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
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.verb {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid #eee1ce;
}

.lemma {
  font-weight: 600;
  font-size: 0.95rem;
  color: #2c2620;
  text-decoration: none;
  white-space: nowrap;
}

.lemma:hover {
  color: #b0692e;
}

.fr {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #8a8072;
  font-size: 0.85rem;
}

.btn-conj {
  color: #b0692e;
  text-decoration: none;
  font-weight: 700;
  opacity: 0.6;
}

.btn-conj:hover {
  opacity: 1;
}
</style>
