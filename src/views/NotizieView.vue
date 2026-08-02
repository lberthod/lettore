<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { currentUser } from '../lib/auth.js'
import { isLoggedIn, isPremiumPlus } from '../lib/access.js'
import { listNewsTexts, NEWS_COUNTRIES, NEWS_CATEGORIES } from '../lib/newsTexts.js'
import { networkErrorMessage } from '../lib/network.js'

// Le cron VPS ajoute une news dès qu'un article assez frais et distinct des
// 50 derniers est trouvé (voir leggendo-server/news-cron.mjs) — pas de temps
// réel Firestore ici (coûterait une lecture par abonné connecté), mais on
// revérifie la liste à cette cadence pour que la page reste à jour toute
// seule pendant la lecture.
const POLL_INTERVAL_MS = 5 * 60 * 1000

const loading = ref(true)
const premiumPlus = ref(false)
const texts = ref([])
const loadError = ref('')
const selectedCountry = ref('all')
const selectedCategory = ref('all')
let pollTimer = null

const formatDate = (ts) =>
  ts
    ? new Date(ts).toLocaleDateString('fr-CH', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

const countryInfo = (id) => NEWS_COUNTRIES.find((c) => c.id === id) || null
const categoryInfo = (id) => NEWS_CATEGORIES.find((c) => c.id === id) || null

// Uniquement les pays/catégories réellement présents dans le lot chargé —
// évite d'afficher des filtres vides.
const availableCountries = computed(() => {
  const present = new Set(texts.value.map((t) => t.country).filter(Boolean))
  return NEWS_COUNTRIES.filter((c) => present.has(c.id))
})
const availableCategories = computed(() => {
  const present = new Set(texts.value.map((t) => t.topic).filter(Boolean))
  return NEWS_CATEGORIES.filter((c) => present.has(c.id))
})

const filteredTexts = computed(() =>
  texts.value.filter(
    (t) =>
      (selectedCountry.value === 'all' || t.country === selectedCountry.value) &&
      (selectedCategory.value === 'all' || t.topic === selectedCategory.value)
  )
)

const loadTexts = async () => {
  loadError.value = ''
  try {
    texts.value = await listNewsTexts()
  } catch (err) {
    loadError.value = networkErrorMessage(err) || ''
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  premiumPlus.value = await isPremiumPlus()
  if (premiumPlus.value) {
    await loadTexts()
    pollTimer = setInterval(loadTexts, POLL_INTERVAL_MS)
  } else {
    loading.value = false
  }
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <SceneLayout title="No" accent="tizie" tagline="Actualité italienne, générée pour vous" wide>
    <p>
      Une sélection d'actualités italiennes, suisses et françaises,
      reformulées en italien et adaptées à votre niveau au fil de leur
      publication — réservé à la formule
      <RouterLink :to="{ name: 'pricing' }">Premium IA</RouterLink>.
    </p>

    <div v-if="loading" class="hint">Chargement…</div>

    <div v-else-if="!isLoggedIn() || !currentUser" class="upsell">
      <p>Connectez-vous pour accéder aux Notizie.</p>
      <RouterLink class="btn-hero" :to="{ name: 'login', query: { redirect: '/notizie' } }">
        Se connecter
      </RouterLink>
    </div>

    <div v-else-if="!premiumPlus" class="upsell">
      <p>Les Notizie font partie de la formule Premium IA (14,90 €/mois) : 30 crédits de génération par mois, un fil d'actualité multi-pays adapté à votre niveau, et une bibliothèque de classiques adaptés et gradués.</p>
      <RouterLink class="btn-hero" :to="{ name: 'pricing' }">Découvrir Premium IA</RouterLink>
    </div>

    <template v-else>
      <p v-if="loadError" class="job error">
        ⚠ {{ loadError }}
        <button type="button" class="link-btn" @click="loadTexts">
          réessayer
        </button>
      </p>

      <div v-if="texts.length" class="filters">
        <div class="filter-group">
          <button
            type="button"
            class="chip"
            :class="{ active: selectedCountry === 'all' }"
            @click="selectedCountry = 'all'"
          >
            Tutti i paesi
          </button>
          <button
            v-for="c in availableCountries"
            :key="c.id"
            type="button"
            class="chip"
            :class="{ active: selectedCountry === c.id }"
            @click="selectedCountry = c.id"
          >
            {{ c.flag }} {{ c.label }}
          </button>
        </div>
        <div class="filter-group">
          <button
            type="button"
            class="chip"
            :class="{ active: selectedCategory === 'all' }"
            @click="selectedCategory = 'all'"
          >
            Tutte le categorie
          </button>
          <button
            v-for="c in availableCategories"
            :key="c.id"
            type="button"
            class="chip"
            :class="{ active: selectedCategory === c.id }"
            @click="selectedCategory = c.id"
          >
            {{ c.icon }} {{ c.label }}
          </button>
        </div>
      </div>

      <ul v-if="filteredTexts.length" class="cards">
        <li v-for="t in filteredTexts" :key="t.id" class="card">
          <div class="card-tags">
            <span v-if="countryInfo(t.country)" class="tag tag-country">
              {{ countryInfo(t.country).flag }} {{ countryInfo(t.country).label }}
            </span>
            <span v-if="categoryInfo(t.topic)" class="tag tag-category">
              {{ categoryInfo(t.topic).icon }} {{ categoryInfo(t.topic).label }}
            </span>
            <span class="tag tag-level">{{ t.level }}</span>
          </div>

          <RouterLink class="card-title" :to="{ name: 'reader', params: { id: t.id } }">
            {{ t.title }}
          </RouterLink>

          <p v-if="t.excerpt" class="card-excerpt">{{ t.excerpt }}</p>

          <div class="card-footer">
            <span class="card-meta">{{ t.wordCount }} mots · {{ formatDate(t.createdAt) }}</span>
            <a
              v-if="t.sourceLink"
              class="card-source"
              :href="t.sourceLink"
              target="_blank"
              rel="noopener noreferrer"
            >
              Fonte : {{ t.sourceName || t.sourceTitle }} ↗
            </a>
          </div>
        </li>
      </ul>
      <p v-else-if="texts.length" class="hint">
        Aucune actualité ne correspond à ces filtres pour le moment.
      </p>
      <p v-else class="hint">
        Aucun texte d'actualité pour le moment — revenez un peu plus tard, le
        prochain arrive avec la prochaine génération automatique.
      </p>
    </template>
  </SceneLayout>
</template>

<style scoped>
.hint {
  margin-top: 1.2rem;
  color: #6b6156;
}

.upsell {
  margin-top: 1.4rem;
  padding: 1.1rem 1.3rem;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.6);
}

.upsell p {
  margin: 0 0 0.9rem;
}

.btn-hero {
  display: inline-block;
  padding: 0.6rem 1.3rem;
  border-radius: 999px;
  background: #b0692e;
  color: #faf6f0;
  font-weight: 700;
  text-decoration: none;
}

.job.error {
  padding: 0.9rem 1.1rem;
  border-radius: 12px;
  margin: 1.2rem 0;
  background: rgba(163, 58, 42, 0.08);
  border: 1px solid rgba(163, 58, 42, 0.3);
  color: #a33a2a;
  font-size: 0.95rem;
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

/* --- Filtres --- */

.filters {
  margin-top: 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.chip {
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  border: 1px solid rgba(107, 97, 86, 0.3);
  background: rgba(255, 255, 255, 0.5);
  color: #6b6156;
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.chip:hover {
  border-color: rgba(176, 105, 46, 0.5);
}

.chip.active {
  background: #b0692e;
  border-color: #b0692e;
  color: #faf6f0;
  font-weight: 600;
}

/* --- Cartes --- */

.cards {
  list-style: none;
  padding: 0;
  margin: 1.4rem 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1.1rem;
  border-radius: 14px;
  border: 1px solid rgba(176, 105, 46, 0.22);
  background: rgba(255, 255, 255, 0.72);
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tag {
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.tag-country {
  background: rgba(90, 110, 63, 0.14);
  color: #4a5c33;
}

.tag-category {
  background: rgba(176, 105, 46, 0.14);
  color: #8a5427;
}

.tag-level {
  background: rgba(107, 97, 86, 0.14);
  color: #6b6156;
}

.card-title {
  color: #2c2620;
  font-weight: 700;
  text-decoration: none;
  line-height: 1.3;
}

.card-title:hover {
  color: #b0692e;
}

.card-excerpt {
  margin: 0;
  color: #6b6156;
  font-size: 0.88rem;
  line-height: 1.4;
  flex: 1;
}

.card-footer {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.3rem;
  padding-top: 0.5rem;
  border-top: 1px dashed rgba(107, 97, 86, 0.25);
  font-size: 0.78rem;
}

.card-meta {
  color: #6b6156;
}

.card-source {
  color: #b0692e;
  text-decoration: none;
  font-weight: 600;
}

.card-source:hover {
  text-decoration: underline;
}
</style>
