<script setup>
import { ref, computed, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import textsIndex from '../texts/index.json'
import taxonomy from '../texts/category.json'
import { isRead, progress } from '../progress.js'
import { authReady, currentUser } from '../lib/auth.js'
import { firebaseReady } from '../lib/firebase.js'
import { hasCatalogAccess, isLoggedIn, EXAMPLE_TEXT_IDS, EXAMPLE_COUNT } from '../lib/access.js'

// Taxonomie unique : les catégories affichées sont les thèmes de category.json
const categories = taxonomy.themes

// Catalogue complet réservé à Premium et au-dessus (README_TARIFICATION.md) :
// tout le monde voit les textes de l'aperçu gratuit, les autres apparaissent
// verrouillés tant que le compte n'a pas le rôle payant requis.
const loggedIn = computed(() => isLoggedIn())
const catalogAccess = ref(!firebaseReady)
const authResolved = ref(!firebaseReady)
if (firebaseReady) authReady.then(() => (authResolved.value = true))
watch(
  currentUser,
  async () => {
    catalogAccess.value = await hasCatalogAccess()
  },
  { immediate: true }
)
const baseTexts = computed(() => textsIndex)

function isLocked(t) {
  return authResolved.value && !catalogAccess.value && !EXAMPLE_TEXT_IDS.includes(t.id)
}

const readCount = computed(
  () => textsIndex.filter((t) => progress.readTexts.includes(t.id)).length
)

const levels = [...new Set(textsIndex.map((t) => t.level))].sort()

// Explication des niveaux CECR, affichée au survol
const levelHints = {
  A1: 'A1 — Débutant : phrases très courtes au présent, vocabulaire de base (famille, maison, animaux)',
  A2: 'A2 — Élémentaire : petites histoires au passé, vie quotidienne, phrases simples',
  B1: 'B1 — Intermédiaire : récits et textes culturels plus riches, temps du passé variés',
  B2: 'B2 — Avancé : textes longs et complexes, passé simple, subjonctif, vocabulaire abstrait',
  C1: 'C1 — Autonome : textes exigeants, nuances stylistiques, langue idiomatique et abstraite',
  C2: 'C2 — Maîtrise : registre littéraire et soutenu, ironie, références culturelles, syntaxe complexe',
}
// Préselection depuis une page d'atterrissage par niveau (/textes-italien-a1
// etc.) : le lien pointe vers /textes?level=A1, la sélection se fait ici.
const route = useRoute()
const levelFromQuery = typeof route.query.level === 'string' ? route.query.level : null
const selectedLevel = ref(levelFromQuery && levels.includes(levelFromQuery) ? levelFromQuery : 'all')
const selectedCategory = ref('all')
const selectedGenre = ref('all')

// Genres proposés : uniquement ceux réellement présents dans la catégorie choisie
const availableGenres = computed(() => {
  const scoped = baseTexts.value.filter(
    (t) => selectedCategory.value === 'all' || t.category === selectedCategory.value
  )
  const ids = new Set(scoped.map((t) => t.genre).filter(Boolean))
  return taxonomy.genres.filter((g) => ids.has(g.id))
})

// Catégorie changée : un genre sélectionné devenu incompatible est réinitialisé
watch(selectedCategory, () => {
  if (!availableGenres.value.some((g) => g.id === selectedGenre.value)) {
    selectedGenre.value = 'all'
  }
})

// Tranches de taille, en nombre de mots
const sizes = [
  { id: 'short', name: 'Court', hint: '< 150 mots', match: (n) => n < 150 },
  { id: 'medium', name: 'Moyen', hint: '150 – 400 mots', match: (n) => n >= 150 && n <= 400 },
  { id: 'long', name: 'Long', hint: '> 400 mots', match: (n) => n > 400 },
]
const selectedSize = ref('all')

// Recherche plein texte sur titre et extrait, insensible aux accents
const searchQuery = ref('')
function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}
const normalizedQuery = computed(() => normalize(searchQuery.value.trim()))

function matchesSearch(t) {
  if (!normalizedQuery.value) return true
  return (
    normalize(t.title).includes(normalizedQuery.value) ||
    normalize(t.excerpt || '').includes(normalizedQuery.value)
  )
}

const filteredTexts = computed(() =>
  baseTexts.value.filter(
    (t) =>
      (selectedLevel.value === 'all' || t.level === selectedLevel.value) &&
      (selectedSize.value === 'all' ||
        sizes.find((s) => s.id === selectedSize.value).match(t.wordCount)) &&
      (selectedGenre.value === 'all' || t.genre === selectedGenre.value) &&
      matchesSearch(t)
  )
)

// Tri : l'ordre du catalogue reste la pertinence par défaut, mais on peut
// classer par titre, niveau ou longueur
const sortOptions = [
  { id: 'default', name: 'Pertinence' },
  { id: 'title-asc', name: 'Titre A → Z' },
  { id: 'level-asc', name: 'Niveau croissant' },
  { id: 'level-desc', name: 'Niveau décroissant' },
  { id: 'length-asc', name: 'Plus courts d’abord' },
  { id: 'length-desc', name: 'Plus longs d’abord' },
]
const selectedSort = ref('default')

const sortedTexts = computed(() => {
  const arr = [...filteredTexts.value]
  switch (selectedSort.value) {
    case 'title-asc':
      return arr.sort((a, b) => a.title.localeCompare(b.title, 'it'))
    case 'level-asc':
      return arr.sort((a, b) => a.level.localeCompare(b.level))
    case 'level-desc':
      return arr.sort((a, b) => b.level.localeCompare(a.level))
    case 'length-asc':
      return arr.sort((a, b) => a.wordCount - b.wordCount)
    case 'length-desc':
      return arr.sort((a, b) => b.wordCount - a.wordCount)
    default:
      return arr
  }
})

const hasFilters = computed(
  () =>
    selectedLevel.value !== 'all' ||
    selectedSize.value !== 'all' ||
    selectedCategory.value !== 'all' ||
    selectedGenre.value !== 'all' ||
    searchQuery.value.trim() !== ''
)

function resetFilters() {
  selectedLevel.value = 'all'
  selectedSize.value = 'all'
  selectedCategory.value = 'all'
  selectedGenre.value = 'all'
  searchQuery.value = ''
}

// Filtres repliables sur mobile (toujours visibles au-delà du seuil, en CSS)
const filtersOpen = ref(false)

// Visiteurs non connectés : les textes verrouillés ne s'affichent plus comme
// des cartes en pointillés dispersées dans le catalogue. On les compte à
// part et on propose un unique bloc « Tout débloquer » en fin de page.
const unlockedTexts = computed(() => sortedTexts.value.filter((t) => !isLocked(t)))
const lockedCount = computed(
  () => sortedTexts.value.length - unlockedTexts.value.length
)
const visibleTexts = computed(() =>
  authResolved.value && !catalogAccess.value ? unlockedTexts.value : sortedTexts.value
)

// Sections par catégorie, dans l'ordre des thèmes ; les vides disparaissent
const sections = computed(() =>
  categories
    .filter((c) => selectedCategory.value === 'all' || c.id === selectedCategory.value)
    .map((c) => ({
      ...c,
      texts: visibleTexts.value.filter((t) => t.category === c.id),
    }))
    .filter((c) => c.texts.length > 0)
)

// Pagination : évite d'afficher des centaines de cartes d'un coup
const PAGE_SIZE = 24
const visibleCount = ref(PAGE_SIZE)
watch([selectedLevel, selectedSize, selectedCategory, selectedGenre, selectedSort, searchQuery], () => {
  visibleCount.value = PAGE_SIZE
})

const totalVisibleTexts = computed(() =>
  sections.value.reduce((n, s) => n + s.texts.length, 0)
)

const pagedSections = computed(() => {
  let remaining = visibleCount.value
  const list = []
  for (const sec of sections.value) {
    if (remaining <= 0) break
    const slice = sec.texts.slice(0, remaining)
    remaining -= slice.length
    if (slice.length) list.push({ ...sec, texts: slice, total: sec.texts.length })
  }
  return list
})

const shownCount = computed(() =>
  pagedSections.value.reduce((n, s) => n + s.texts.length, 0)
)
const hasMore = computed(() => shownCount.value < totalVisibleTexts.value)

function loadMore() {
  visibleCount.value += PAGE_SIZE
}

// Mode écoute (compréhension orale) : même route que la lecture, avec
// ?mode=ascolto — ReaderView masque alors le texte. Bouton (et non lien
// imbriqué) car la carte est déjà un RouterLink.
const router = useRouter()

function listenTo(t) {
  router.push({ name: 'reader', params: { id: t.id }, query: { mode: 'ascolto' } })
}
</script>

<template>
  <SceneLayout title="Biblio" accent="teca" tagline="Tous les textes, de A1 à C2" bare wide>
    <div class="library">
      <!-- En app native, SiteHeader (qui portait ce lien) est masqué : sans
           ça, Classici devient injoignable — voir « Optimisation Mobile.md »
           Phase 1 Sprint 1.3 (suite). -->
      <p class="classici-crosslink">
        <RouterLink :to="{ name: 'books' }">📚 Découvrir aussi les Classici (Cappuccetto Rosso, Pollicino…) →</RouterLink>
      </p>
      <!-- Aperçu gratuit : rappel discret d'invitation à passer Premium -->
      <p v-if="authResolved && !catalogAccess" class="preview-note">
        {{ EXAMPLE_COUNT }} textes en accès libre.
        <RouterLink :to="{ name: 'pricing' }">Passez à Premium</RouterLink>
        pour débloquer les {{ textsIndex.length }} textes.
      </p>

      <div v-if="loggedIn && readCount" class="progress-line">
        <span class="progress-bar">
          <span
            class="progress-fill"
            :style="{ width: (readCount / textsIndex.length) * 100 + '%' }"
          ></span>
        </span>
        <span class="progress-label">
          {{ readCount }} / {{ textsIndex.length }} textes lus
        </span>
      </div>
      <p class="intro">
        Choisissez un texte pour commencer la lecture. Survolez les mots pour
        voir leur traduction, cliquez sur la ponctuation pour traduire une
        phrase entière.
      </p>

      <div class="filters-bar">
        <p class="results-count" aria-live="polite">
          {{ totalVisibleTexts }} texte{{ totalVisibleTexts > 1 ? 's' : '' }}
        </p>
        <select v-model="selectedSort" class="cat-select sort-select" aria-label="Trier">
          <option v-for="opt in sortOptions" :key="opt.id" :value="opt.id">
            Trier : {{ opt.name }}
          </option>
        </select>
        <button
          class="filters-toggle"
          type="button"
          :aria-expanded="filtersOpen"
          aria-controls="library-filters"
          @click="filtersOpen = !filtersOpen"
        >
          Filtres <span aria-hidden="true">{{ filtersOpen ? '▲' : '▼' }}</span>
        </button>
      </div>

      <div id="library-filters" class="filters" :class="{ open: filtersOpen }">
        <input
          v-model="searchQuery"
          type="search"
          class="search-input"
          placeholder="Rechercher un texte…"
          aria-label="Rechercher un texte"
        />
        <div class="seg" role="group" aria-label="Niveau">
          <button
            :class="{ active: selectedLevel === 'all' }"
            data-hint="Tous les niveaux, de A1 (débutant) à C2 (maîtrise)"
            @click="selectedLevel = 'all'"
          >
            Tous
          </button>
          <button
            v-for="level in levels"
            :key="level"
            :class="{ active: selectedLevel === level }"
            :data-hint="levelHints[level]"
            @click="selectedLevel = selectedLevel === level ? 'all' : level"
          >
            {{ level }}
          </button>
        </div>

        <div class="seg" role="group" aria-label="Taille">
          <button
            :class="{ active: selectedSize === 'all' }"
            data-hint="Toutes les tailles de textes"
            @click="selectedSize = 'all'"
          >
            Taille
          </button>
          <button
            v-for="s in sizes"
            :key="s.id"
            :class="{ active: selectedSize === s.id }"
            :data-hint="s.hint"
            @click="selectedSize = selectedSize === s.id ? 'all' : s.id"
          >
            {{ s.name }}
          </button>
        </div>

        <select v-model="selectedCategory" class="cat-select" aria-label="Catégorie">
          <option value="all">Toutes les catégories</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">
            {{ c.icon }} {{ c.name }}
          </option>
        </select>

        <select
          v-if="availableGenres.length"
          v-model="selectedGenre"
          class="cat-select"
          aria-label="Genre"
        >
          <option value="all">Tous les genres</option>
          <option v-for="g in availableGenres" :key="g.id" :value="g.id">
            {{ g.icon }} {{ g.name }}
          </option>
        </select>

        <button v-if="hasFilters" class="reset-btn" @click="resetFilters">
          ✕ Réinitialiser
        </button>
      </div>

      <p v-if="sections.length === 0" class="empty">
        Aucun texte ne correspond à ces filtres — essayez un autre niveau ou une
        autre catégorie.
      </p>

      <section v-for="section in pagedSections" :key="section.id" class="category-section">
        <h2 class="category-title">
          <span aria-hidden="true">{{ section.icon }}</span>
          {{ section.name }}
          <span class="category-count">{{ section.total }}</span>
        </h2>
        <div class="grid">
          <RouterLink
            v-for="t in section.texts"
            :key="t.id"
            class="card"
            :to="{ name: 'reader', params: { id: t.id } }"
          >
            <div class="card-head">
              <h3>{{ t.title }}</h3>
              <span class="level-badge" :class="`level-${t.level.toLowerCase()}`">
                {{ t.level }}
              </span>
            </div>
            <p class="excerpt">{{ t.excerpt }}</p>
            <p class="meta">
              {{ t.paragraphCount }} paragraphes · ~{{ t.wordCount }} mots
              <span v-if="isRead(t.id)" class="read-badge">✓ lu</span>
            </p>
            <span class="cta-row">
              <button
                class="listen-btn"
                type="button"
                :title="`Écouter « ${t.title} » sans le texte (mode écoute)`"
                :aria-label="`Écouter « ${t.title} » sans le texte (mode écoute)`"
                @click.stop.prevent="listenTo(t)"
              >
                🎧 Écouter
              </button>
              <span class="cta">
                {{ isRead(t.id) ? 'Relire →' : 'Lire →' }}
              </span>
            </span>
          </RouterLink>
        </div>
      </section>

      <div v-if="hasMore" class="load-more">
        <button class="reset-btn load-more-btn" @click="loadMore">
          Afficher plus de textes ({{ totalVisibleTexts - shownCount }} restants)
        </button>
      </div>

      <!-- Comptes sans accès catalogue (visiteurs et gratuit) : un unique
           bloc d'invitation, au lieu de cartes verrouillées dispersées -->
      <section v-if="authResolved && !catalogAccess && lockedCount > 0" class="unlock-all">
        <h2>🔒 {{ lockedCount }} texte{{ lockedCount > 1 ? 's' : '' }} supplémentaire{{ lockedCount > 1 ? 's' : '' }} à débloquer</h2>
        <p>
          Vous consultez la sélection en accès libre. Passez à Premium pour
          lire l'intégralité du catalogue, suivre votre progression et
          enregistrer vos mots favoris.
        </p>
        <RouterLink class="btn-unlock" :to="{ name: 'pricing' }">
          Découvrir Premium →
        </RouterLink>
      </section>
    </div>
  </SceneLayout>
</template>

<style scoped>
.library {
  margin-top: 1.4rem;
  text-align: left;
  opacity: 0;
  animation: appear 0.9s ease-out 0.9s forwards;
}

@keyframes appear {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.intro {
  max-width: 620px;
  margin: 0 auto 1.5rem;
  font-size: 0.95rem;
  text-align: center;
  color: rgba(44, 38, 32, 0.7);
}

/* --- Rappel d'aperçu discret (visiteur non connecté) --- */
.preview-note {
  max-width: 620px;
  margin: 0 auto 0.6rem;
  font-size: 0.85rem;
  text-align: center;
  color: rgba(44, 38, 32, 0.6);
}

.classici-crosslink {
  max-width: 620px;
  margin: 0 auto 0.8rem;
  font-size: 0.85rem;
  text-align: center;
}

.preview-note a {
  color: #b0692e;
  font-weight: 600;
  text-decoration: none;
  border-bottom: 1px solid rgba(176, 105, 46, 0.4);
}

.preview-note a:hover {
  border-bottom-color: #b0692e;
}

.progress-line {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  margin: 0 0 0.8rem;
}

.progress-bar {
  flex: 0 1 220px;
  height: 0.45rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(176, 105, 46, 0.25);
  overflow: hidden;
}

.progress-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: #4a7c59;
  transition: width 0.3s;
}

.progress-label {
  font-size: 0.82rem;
  color: #35674a;
  font-weight: 600;
}

/* --- Barre de résultats + tri + repli des filtres (mobile) --- */

.filters-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.6rem 1rem;
  margin-bottom: 0.8rem;
}

.results-count {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: #8a5a2b;
}

.filters-toggle {
  display: none;
  align-items: center;
  gap: 0.3rem;
  min-height: 44px;
  padding: 0.35rem 0.9rem;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.65);
  color: #6b6156;
  font-family: inherit;
  font-size: 0.83rem;
  font-weight: 600;
  cursor: pointer;
}

.filters-toggle:hover {
  border-color: #b0692e;
  color: #b0692e;
}

/* --- Barre de filtres compacte --- */

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  margin: 0 auto 1.8rem;
  max-width: 900px;
  padding: 0.9rem 1.1rem;
  border: 1px solid rgba(176, 105, 46, 0.18);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

@media (max-width: 640px) {
  .filters-toggle {
    display: inline-flex;
  }

  .filters {
    display: none;
    justify-content: flex-start;
  }

  .filters.open {
    display: flex;
  }
}

.seg {
  display: inline-flex;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.seg button {
  position: relative;
  padding: 0.35rem 0.75rem;
  border: none;
  background: transparent;
  color: #6b6156;
  font-family: inherit;
  font-size: 0.83rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.seg button:first-child {
  border-radius: 999px 0 0 999px;
}

.seg button:last-child {
  border-radius: 0 999px 999px 0;
}

/* Infobulle au survol (data-hint) */
.seg button[data-hint]:hover::after {
  content: attr(data-hint);
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  width: max-content;
  max-width: 240px;
  padding: 0.45rem 0.7rem;
  border-radius: 8px;
  background: #2c2620;
  color: #faf6f0;
  font-size: 0.78rem;
  font-weight: 400;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
  pointer-events: none;
  box-shadow: 0 4px 14px rgba(44, 38, 32, 0.25);
}

.seg button[data-hint]:hover::before {
  content: '';
  position: absolute;
  top: calc(100% - 2px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  border: 5px solid transparent;
  border-bottom-color: #2c2620;
  pointer-events: none;
}

.seg button + button {
  border-left: 1px solid rgba(176, 105, 46, 0.18);
}

.seg button:hover {
  color: #b0692e;
}

.seg button.active {
  background: #b0692e;
  color: #faf6f0;
}

.search-input {
  width: min(260px, 100%);
  padding: 0.35rem 0.9rem;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.85);
  color: #2c2620;
  font-family: inherit;
  font-size: 0.85rem;
}

.search-input:focus {
  border-color: #b0692e;
  outline: none;
}

.cat-select {
  max-width: 240px;
  padding: 0.35rem 1.9rem 0.35rem 0.9rem;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 999px;
  background-color: rgba(255, 255, 255, 0.65);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b6156' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.7rem center;
  background-size: 0.8em;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  color: #6b6156;
  font-family: inherit;
  font-size: 0.83rem;
  font-weight: 600;
  line-height: 1.3;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
}

.cat-select:hover,
.cat-select:focus {
  border-color: #b0692e;
  color: #b0692e;
  outline: none;
}

.reset-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.9rem;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.65);
  color: #b0692e;
  font-family: inherit;
  font-size: 0.83rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.12s, border-color 0.12s;
}

.reset-btn:hover {
  background: rgba(176, 105, 46, 0.1);
  border-color: #b0692e;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.level-badge {
  flex-shrink: 0;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
}

.level-a1 { background: #e3f0e6; color: #35674a; }
.level-a2 { background: #d9ead3; color: #38761d; }
.level-b1 { background: #fff2cc; color: #8a6d1a; }
.level-b2 { background: #fce5cd; color: #b45f06; }
.level-c1 { background: #f4cccc; color: #990000; }
.level-c2 { background: #e6d5f2; color: #5e2a84; }

.empty {
  margin: 1rem 0 2rem;
  font-size: 0.95rem;
  text-align: center;
  color: rgba(44, 38, 32, 0.7);
}

.category-section {
  margin-bottom: 2.2rem;
}

.category-title {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin: 0 0 0.8rem;
  font-size: 1.2rem;
  font-weight: 600;
  color: #8a5a2b;
}

.category-count {
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  border: 1px solid rgba(176, 105, 46, 0.25);
  background: rgba(255, 255, 255, 0.6);
  color: #8a5a2b;
  font-size: 0.78rem;
  font-weight: 700;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.1rem 1.2rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s, background 0.15s;
}

.card:hover {
  border-color: #b0692e;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 6px 20px rgba(176, 105, 46, 0.18);
  transform: translateY(-2px);
}

.card h3 {
  margin: 0;
  font-size: 1.15rem;
}

.excerpt {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  opacity: 0.75;
  font-style: italic;
}

.meta {
  margin: 0;
  font-size: 0.78rem;
  opacity: 0.5;
}

.read-badge {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: #e3f0e6;
  color: #35674a;
  font-weight: 700;
}

.cta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-top: auto;
}

.cta {
  font-size: 0.85rem;
  font-weight: 700;
  color: #b0692e;
}

/* Action secondaire discrète : écoute sans texte (mode ascolto) */
.listen-btn {
  padding: 0.2rem 0.65rem;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.65);
  color: #8a5a2b;
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.listen-btn:hover {
  background: #faf6f0;
  border-color: #b0692e;
  color: #b0692e;
}

/* --- Charger plus --- */

.load-more {
  display: flex;
  justify-content: center;
  margin: 0.4rem 0 2rem;
}

.load-more-btn {
  min-height: 44px;
  padding: 0.5rem 1.2rem;
  border: 1px solid rgba(176, 105, 46, 0.35);
  border-radius: 999px;
  text-decoration: none;
}

.load-more-btn:hover {
  background: rgba(176, 105, 46, 0.08);
}

/* --- Bloc « Tout débloquer » (remplace les cartes verrouillées) --- */

.unlock-all {
  margin: 1rem auto 2.5rem;
  max-width: 560px;
  padding: 1.6rem 1.8rem;
  border: 1px dashed rgba(176, 105, 46, 0.4);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.6);
  text-align: center;
}

.unlock-all h2 {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
  color: #8a5a2b;
}

.unlock-all p {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  color: rgba(44, 38, 32, 0.75);
}

.btn-unlock {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0.6rem 1.4rem;
  border-radius: 999px;
  background: #b0692e;
  color: #faf6f0;
  text-decoration: none;
  font-weight: 700;
  font-size: 0.95rem;
  box-shadow: 0 6px 20px rgba(176, 105, 46, 0.25);
  transition: background 0.15s, transform 0.15s;
}

.btn-unlock:hover {
  background: #9a5a26;
  transform: translateY(-2px);
}

@media (prefers-reduced-motion: reduce) {
  .library {
    animation: none;
    opacity: 1;
  }
}
</style>
