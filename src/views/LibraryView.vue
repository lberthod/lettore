<script setup>
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import textsIndex from '../texts/index.json'
import categories from '../texts/categories.json'
import { isRead, progress } from '../progress.js'

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
}
const selectedLevel = ref('all')
const selectedCategory = ref('all')

// Tranches de taille, en nombre de mots
const sizes = [
  { id: 'short', name: 'Court', hint: '< 150 mots', match: (n) => n < 150 },
  { id: 'medium', name: 'Moyen', hint: '150 – 400 mots', match: (n) => n >= 150 && n <= 400 },
  { id: 'long', name: 'Long', hint: '> 400 mots', match: (n) => n > 400 },
]
const selectedSize = ref('all')

const filteredTexts = computed(() =>
  textsIndex.filter(
    (t) =>
      (selectedLevel.value === 'all' || t.level === selectedLevel.value) &&
      (selectedSize.value === 'all' ||
        sizes.find((s) => s.id === selectedSize.value).match(t.wordCount))
  )
)

const hasFilters = computed(
  () =>
    selectedLevel.value !== 'all' ||
    selectedSize.value !== 'all' ||
    selectedCategory.value !== 'all'
)

function resetFilters() {
  selectedLevel.value = 'all'
  selectedSize.value = 'all'
  selectedCategory.value = 'all'
}

// Sections par catégorie, dans l'ordre de categories.json ; les vides disparaissent
const sections = computed(() =>
  categories
    .filter((c) => selectedCategory.value === 'all' || c.id === selectedCategory.value)
    .map((c) => ({
      ...c,
      texts: filteredTexts.value.filter((t) => t.category === c.id),
    }))
    .filter((c) => c.texts.length > 0)
)
</script>

<template>
  <SceneLayout title="Biblio" accent="teca" tagline="Tous les textes, de A1 à B2" bare wide>
    <div class="library">
      <div v-if="readCount" class="progress-line">
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

      <div class="filters">
        <div class="seg" role="group" aria-label="Niveau">
          <button
            :class="{ active: selectedLevel === 'all' }"
            data-hint="Tous les niveaux, de A1 (débutant) à B2 (avancé)"
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

        <button v-if="hasFilters" class="reset-btn" @click="resetFilters">
          ✕ Réinitialiser
        </button>
      </div>

      <p v-if="sections.length === 0" class="empty">
        Aucun texte ne correspond à ces filtres — essayez un autre niveau ou une
        autre catégorie.
      </p>

      <section v-for="section in sections" :key="section.id" class="category-section">
        <h2 class="category-title">
          <span aria-hidden="true">{{ section.icon }}</span>
          {{ section.name }}
          <span class="category-count">{{ section.texts.length }}</span>
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
            <span class="cta">{{ isRead(t.id) ? 'Relire →' : 'Lire →' }}</span>
          </RouterLink>
        </div>
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

/* --- Barre de filtres compacte --- */

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1.8rem;
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

.cat-select {
  max-width: 240px;
  padding: 0.35rem 0.75rem;
  border: 1px solid rgba(176, 105, 46, 0.3);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.65);
  color: #6b6156;
  font-family: inherit;
  font-size: 0.83rem;
  font-weight: 600;
  cursor: pointer;
}

.cat-select:hover,
.cat-select:focus {
  border-color: #b0692e;
  outline: none;
}

.reset-btn {
  padding: 0.35rem 0.6rem;
  border: none;
  background: transparent;
  color: #b0692e;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
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
  background: rgba(255, 255, 255, 0.72);
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

.cta {
  margin-top: auto;
  align-self: flex-end;
  font-size: 0.85rem;
  font-weight: 700;
  color: #b0692e;
}

@media (prefers-reduced-motion: reduce) {
  .library {
    animation: none;
    opacity: 1;
  }
}
</style>
