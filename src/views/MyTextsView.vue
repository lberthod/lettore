<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import taxonomy from '../texts/category.json'
import { listUserTexts, deleteUserText, setUserTextPublic } from '../lib/userTexts.js'
import { generation, saveResult, resumeGeneration } from '../lib/generation.js'

const myTexts = ref([])
const loading = ref(true)
const sharing = ref({}) // id -> true pendant la requête
const copiedId = ref(null)
const shareError = ref('')

const search = ref('')
const filterLevel = ref('')
const filterGenre = ref('')
const filterCategory = ref('')
const sortBy = ref('recent') // recent | oldest | title | level

const hasActiveFilters = computed(
  () => !!(search.value || filterLevel.value || filterGenre.value || filterCategory.value)
)

function clearFilters() {
  search.value = ''
  filterLevel.value = ''
  filterGenre.value = ''
  filterCategory.value = ''
}

// N'affiche que les niveaux/genres/thèmes réellement présents parmi les
// textes de l'utilisateur, pour ne pas proposer des filtres vides.
const availableLevels = computed(() => {
  const ids = new Set(myTexts.value.map((t) => t.level).filter(Boolean))
  return taxonomy.levels.filter((l) => ids.has(l))
})
const availableGenres = computed(() => {
  const ids = new Set(myTexts.value.map((t) => t.genre).filter(Boolean))
  return taxonomy.genres.filter((g) => ids.has(g.id))
})
const availableCategories = computed(() => {
  const ids = new Set(myTexts.value.map((t) => t.category).filter(Boolean))
  return taxonomy.themes.filter((t) => ids.has(t.id))
})

const filteredTexts = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = myTexts.value.filter((t) => {
    if (q && !t.title?.toLowerCase().includes(q)) return false
    if (filterLevel.value && t.level !== filterLevel.value) return false
    if (filterGenre.value && t.genre !== filterGenre.value) return false
    if (filterCategory.value && t.category !== filterCategory.value) return false
    return true
  })
  list = [...list]
  if (sortBy.value === 'oldest') {
    list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  } else if (sortBy.value === 'title') {
    list.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
  } else if (sortBy.value === 'level') {
    list.sort((a, b) => (a.level || '').localeCompare(b.level || ''))
  } else {
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }
  return list
})

function shareUrl(id) {
  return `${window.location.origin}/condividi/${id}`
}

async function toggleShare(text) {
  shareError.value = ''
  sharing.value = { ...sharing.value, [text.id]: true }
  try {
    const next = !text.public
    await setUserTextPublic(text.id, next)
    text.public = next
    if (next) await copyShareLink(text.id)
  } catch (err) {
    shareError.value =
      err?.code === 'permission-denied'
        ? 'Le partage par URL publique est réservé à la formule Enseignant.'
        : "Le partage n'a pas pu être activé."
  } finally {
    sharing.value = { ...sharing.value, [text.id]: false }
  }
}

async function copyShareLink(id) {
  const url = shareUrl(id)
  try {
    await navigator.clipboard.writeText(url)
    copiedId.value = id
    setTimeout(() => {
      if (copiedId.value === id) copiedId.value = null
    }, 2000)
  } catch {
    // Presse-papiers indisponible (permissions/contexte) : le lien reste
    // consultable via le bouton « partager » de la formule Enseignant.
  }
}

async function refresh() {
  try {
    myTexts.value = await listUserTexts()
  } catch {
    // Pas connecté ou Firestore indisponible : la liste reste vide.
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  resumeGeneration()
  refresh()
})

// Quand la génération en cours vient d'être enregistrée, la liste se met à
// jour toute seule (que l'enregistrement ait eu lieu ici ou sur l'autre vue).
watch(
  () => generation.savedEntry,
  (entry) => {
    if (entry) {
      myTexts.value = [entry, ...myTexts.value.filter((e) => e.id !== entry.id)]
    }
  }
)

async function removeText(id) {
  if (!confirm('Supprimer ce texte ?')) return
  const backup = myTexts.value
  myTexts.value = myTexts.value.filter((e) => e.id !== id)
  try {
    await deleteUserText(id)
  } catch {
    myTexts.value = backup
  }
}

const minutes = computed(() => {
  const m = Math.floor(generation.elapsed / 60)
  const s = String(generation.elapsed % 60).padStart(2, '0')
  return `${m}:${s}`
})

const themeName = (id) =>
  taxonomy.themes.find((t) => t.id === id)?.name || ''
const genreIcon = (id) => taxonomy.genres.find((g) => g.id === id)?.icon || '📖'

const formatDate = (ts) =>
  ts
    ? new Date(ts).toLocaleDateString('fr-CH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : ''
</script>

<template>
  <SceneLayout title="I miei " accent="testi" tagline="Mes textes créés" narrow>
    <p>
      Vos histoires générées sur mesure, conservées dans votre compte.
      <RouterLink :to="{ name: 'create-text' }">→ Créer un nouveau texte</RouterLink>
    </p>

    <!-- Génération en cours (continue même en changeant de page) -->
    <div v-if="generation.status === 'working'" class="job working">
      <span class="spinner" aria-hidden="true"></span>
      <div>
        <strong>« {{ generation.title }} »</strong> est en cours d'écriture…
        <span class="job-time">{{ minutes }}</span>
      </div>
    </div>
    <div v-else-if="generation.status === 'error'" class="job error">
      ⚠ La génération de « {{ generation.title }} » a échoué :
      {{ generation.error }}
    </div>
    <div v-else-if="generation.status === 'done' && generation.result" class="job done">
      ✓ « {{ generation.result.title }} » est prêt
      <template v-if="generation.saveState === 'saving'"> — enregistrement…</template>
      <template v-else-if="generation.saveState === 'error'">
        — ⚠ enregistrement impossible <small v-if="generation.saveError">({{ generation.saveError }})</small>
        <button type="button" class="link-btn" @click="saveResult">réessayer</button>
      </template>
      <RouterLink
        v-else
        :to="{ name: 'reader', params: { id: generation.result.id } }"
      >
        → le lire
      </RouterLink>
    </div>

    <p v-if="shareError" class="job error">⚠ {{ shareError }}</p>

    <div v-if="myTexts.length" class="filters">
      <input
        v-model="search"
        type="search"
        class="filter-search"
        placeholder="Rechercher un titre…"
      />
      <select v-model="filterGenre" class="filter-select">
        <option value="">Tous les genres</option>
        <option v-for="g in availableGenres" :key="g.id" :value="g.id">
          {{ g.icon }} {{ g.name }}
        </option>
      </select>
      <select v-model="filterCategory" class="filter-select">
        <option value="">Tous les thèmes</option>
        <option v-for="c in availableCategories" :key="c.id" :value="c.id">
          {{ c.icon }} {{ c.name }}
        </option>
      </select>
      <select v-model="filterLevel" class="filter-select">
        <option value="">Tous les niveaux</option>
        <option v-for="l in availableLevels" :key="l" :value="l">{{ l }}</option>
      </select>
      <select v-model="sortBy" class="filter-select">
        <option value="recent">Plus récents</option>
        <option value="oldest">Plus anciens</option>
        <option value="title">Titre (A-Z)</option>
        <option value="level">Niveau</option>
      </select>
      <button
        v-if="hasActiveFilters"
        type="button"
        class="link-btn"
        @click="clearFilters"
      >
        réinitialiser
      </button>
    </div>

    <p v-if="myTexts.length" class="filter-count">
      {{ filteredTexts.length }} texte{{ filteredTexts.length > 1 ? 's' : '' }}
      <template v-if="hasActiveFilters"> sur {{ myTexts.length }}</template>
    </p>

    <ul v-if="filteredTexts.length" class="texts">
      <li v-for="t in filteredTexts" :key="t.id">
        <RouterLink class="text-title" :to="{ name: 'reader', params: { id: t.id } }">
          {{ genreIcon(t.genre) }} {{ t.title }}
        </RouterLink>
        <span class="text-meta">
          {{ t.level }} · {{ t.wordCount }} mots
          <template v-if="themeName(t.category)"> · {{ themeName(t.category) }}</template>
          <template v-if="t.createdAt"> · {{ formatDate(t.createdAt) }}</template>
        </span>
        <button
          type="button"
          class="link-btn"
          :disabled="sharing[t.id]"
          :title="t.public ? 'Rendre privé' : 'Partager via une URL publique (formule Enseignant)'"
          @click="toggleShare(t)"
        >
          {{ copiedId === t.id ? 'lien copié ✓' : t.public ? 'partagé — arrêter' : 'partager' }}
        </button>
        <button
          type="button"
          class="link-btn danger"
          title="Supprimer"
          @click="removeText(t.id)"
        >
          supprimer
        </button>
      </li>
    </ul>
    <p v-else-if="myTexts.length && !loading" class="hint">
      Aucun texte ne correspond à ces filtres —
      <button type="button" class="link-btn" @click="clearFilters">réinitialiser</button>.
    </p>
    <p v-else-if="!loading && generation.status !== 'working'" class="hint">
      Aucun texte créé pour le moment —
      <RouterLink :to="{ name: 'create-text' }">écrivez votre première histoire</RouterLink>.
    </p>
  </SceneLayout>
</template>

<style scoped>
.job {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.9rem 1.1rem;
  border-radius: 12px;
  margin: 1.2rem 0;
  font-size: 0.95rem;
}

.job.working {
  background: rgba(176, 105, 46, 0.1);
  border: 1px solid rgba(176, 105, 46, 0.35);
}

.job.done {
  background: rgba(61, 122, 61, 0.08);
  border: 1px solid rgba(61, 122, 61, 0.3);
}

.job.error {
  background: rgba(163, 58, 42, 0.08);
  border: 1px solid rgba(163, 58, 42, 0.3);
  color: #a33a2a;
}

.job-time {
  color: #6b6156;
  font-variant-numeric: tabular-nums;
  margin-left: 0.4rem;
}

.spinner {
  width: 1.1rem;
  height: 1.1rem;
  flex: none;
  border-radius: 50%;
  border: 2px solid rgba(176, 105, 46, 0.3);
  border-top-color: #b0692e;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin-top: 1.4rem;
}

.filter-search,
.filter-select {
  font: inherit;
  font-size: 0.88rem;
  color: #2c2620;
  background: #fff;
  border: 1px solid rgba(107, 97, 86, 0.3);
  border-radius: 8px;
  padding: 0.4rem 0.6rem;
}

.filter-search {
  flex: 1 1 180px;
  min-width: 140px;
}

.filter-select {
  flex: 0 1 auto;
}

.filter-count {
  color: #6b6156;
  font-size: 0.85rem;
  margin: 0.6rem 0 0;
}

.texts {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
}

.texts li {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.3rem 0.7rem;
  padding: 0.55rem 0;
  border-bottom: 1px dashed rgba(107, 97, 86, 0.25);
}

.text-title {
  color: #2c2620;
  font-weight: 700;
  text-decoration: none;
}

.text-title:hover {
  color: #b0692e;
}

.text-meta {
  color: #6b6156;
  font-size: 0.85rem;
  margin-left: auto;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: #b0692e;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
  font-size: 0.88rem;
}

.link-btn.danger {
  color: #a33a2a;
}
</style>
