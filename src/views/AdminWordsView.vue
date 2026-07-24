<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { computeVocabStats } from '../lib/vocab.js'

const loading = ref(true)
const error = ref('')
const stats = ref(null)
const openLevel = ref('')
const search = ref('')

onMounted(async () => {
  try {
    stats.value = await computeVocabStats()
  } catch (err) {
    console.error('computeVocabStats a échoué :', err)
    error.value = 'Impossible de calculer le vocabulaire du corpus.'
  } finally {
    loading.value = false
  }
})

function toggleLevel(level) {
  openLevel.value = openLevel.value === level ? '' : level
}

const filteredWords = computed(() => {
  const level = stats.value?.levels.find((l) => l.level === openLevel.value)
  if (!level) return []
  const q = search.value.trim().toLowerCase()
  if (!q) return level.words
  return level.words.filter(
    (w) => w.word.includes(q) || w.translation?.toLowerCase().includes(q)
  )
})
</script>

<template>
  <SceneLayout title="Admin" accent=" · Mots" tagline="Vocabulaire du corpus" wide>
    <nav class="tabs">
      <RouterLink :to="{ name: 'admin' }" class="tab" exact-active-class="active">Comptes</RouterLink>
      <RouterLink :to="{ name: 'admin-words' }" class="tab active">Mots</RouterLink>
      <RouterLink :to="{ name: 'admin-texts' }" class="tab" exact-active-class="active">Textes</RouterLink>
    </nav>

    <p v-if="error" class="notice error">⚠ {{ error }}</p>

    <template v-if="!loading && !error && stats">
      <div class="stats">
        <div class="stat total">
          <span class="stat-value">{{ stats.totalCount }}</span>
          <span class="stat-label">Mots italiens distincts</span>
        </div>
        <div
          v-for="l in stats.levels"
          :key="l.level"
          class="stat"
          :class="{ active: openLevel === l.level }"
          role="button"
          tabindex="0"
          @click="toggleLevel(l.level)"
          @keydown.enter="toggleLevel(l.level)"
        >
          <span class="stat-value">{{ l.count }}</span>
          <span class="stat-label">Niveau {{ l.level }}</span>
        </div>
      </div>

      <template v-if="openLevel">
        <div class="list-head">
          <h2>Niveau {{ openLevel }} — {{ filteredWords.length }} mot{{ filteredWords.length > 1 ? 's' : '' }}</h2>
          <input
            v-model="search"
            type="search"
            placeholder="Filtrer un mot ou une traduction…"
            class="search"
          />
        </div>
        <ul class="word-list">
          <li v-for="w in filteredWords" :key="w.word">
            <span class="word">{{ w.word }}</span>
            <span class="translation">{{ w.translation }}</span>
          </li>
        </ul>
        <p v-if="!filteredWords.length" class="hint">Aucun mot ne correspond à ce filtre.</p>
      </template>
      <p v-else class="hint">Cliquez sur un niveau pour afficher la liste des mots.</p>
    </template>

    <p v-else-if="loading" class="hint">Calcul du vocabulaire du corpus…</p>
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

.notice {
  margin: 0 0 1.2rem;
  padding: 0.7rem 1rem;
  border-radius: 10px;
  font-size: 0.9rem;
}

.notice.error {
  border: 1px solid rgba(163, 58, 42, 0.3);
  background: rgba(163, 58, 42, 0.08);
  color: #a33a2a;
}

.hint {
  color: #6b6156;
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

.stat[role='button'] {
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}

.stat[role='button']:hover {
  border-color: #b0692e;
}

.stat.active {
  border-color: #b0692e;
  background: rgba(176, 105, 46, 0.15);
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

.list-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  margin: 0 0 0.8rem;
}

.list-head h2 {
  margin: 0;
  font-size: 1.1rem;
}

.search {
  padding: 0.4rem 0.7rem;
  border: 1px solid rgba(138, 90, 43, 0.35);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.8);
  font-family: inherit;
  font-size: 0.85rem;
  color: #2c2620;
  min-width: 220px;
}

.word-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 480px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 0.4rem;
}

.word-list li {
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px dashed rgba(107, 97, 86, 0.2);
  font-size: 0.88rem;
}

.word-list .word {
  font-weight: 600;
}

.word-list .translation {
  color: #6b6156;
  text-align: right;
}
</style>
