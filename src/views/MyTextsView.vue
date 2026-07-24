<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import taxonomy from '../texts/category.json'
import { listUserTexts, deleteUserText } from '../lib/userTexts.js'
import { generation, saveResult, resumeGeneration } from '../lib/generation.js'

const myTexts = ref([])
const loading = ref(true)

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
        — ⚠ enregistrement impossible
        <button type="button" class="link-btn" @click="saveResult">réessayer</button>
      </template>
      <RouterLink
        v-else
        :to="{ name: 'reader', params: { id: generation.result.id } }"
      >
        → le lire
      </RouterLink>
    </div>

    <ul v-if="myTexts.length" class="texts">
      <li v-for="t in myTexts" :key="t.id">
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
          class="link-btn danger"
          title="Supprimer"
          @click="removeText(t.id)"
        >
          supprimer
        </button>
      </li>
    </ul>
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

.texts {
  list-style: none;
  padding: 0;
  margin: 1.5rem 0 0;
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
