<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import textsIndex from '../texts/index.json'
import categoryData from '../texts/category.json'

const LEVELS = categoryData.levels

function emptyLevelCounts() {
  return Object.fromEntries(LEVELS.map((l) => [l, 0]))
}

const overall = computed(() => {
  const total = textsIndex.length
  const words = textsIndex.reduce((sum, t) => sum + (t.wordCount || 0), 0)
  const byLevel = emptyLevelCounts()
  for (const t of textsIndex) {
    if (byLevel[t.level] !== undefined) byLevel[t.level]++
  }
  const withoutGenre = textsIndex.filter((t) => !t.genre).length
  return {
    total,
    words,
    avgWords: total ? Math.round(words / total) : 0,
    byLevel,
    withoutGenre,
  }
})

const beginnerShare = computed(() => {
  const beginners = overall.value.byLevel.A1 + overall.value.byLevel.A2
  return overall.value.total ? Math.round((beginners / overall.value.total) * 100) : 0
})

function buildAxis(metaList, key, fallbackId, fallbackName) {
  const rows = metaList.map((meta) => ({
    id: meta.id,
    name: meta.name,
    icon: meta.icon,
    total: 0,
    words: 0,
    byLevel: emptyLevelCounts(),
  }))
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
  let fallback = null

  for (const t of textsIndex) {
    const id = t[key] || fallbackId
    let row = byId[id]
    if (!row) {
      if (!fallback) {
        fallback = { id: fallbackId, name: fallbackName, icon: '❔', total: 0, words: 0, byLevel: emptyLevelCounts() }
        byId[fallbackId] = fallback
        rows.push(fallback)
      }
      row = fallback
    }
    row.total++
    row.words += t.wordCount || 0
    if (row.byLevel[t.level] !== undefined) row.byLevel[t.level]++
  }

  return rows.filter((r) => r.total > 0).sort((a, b) => b.total - a.total)
}

const byTheme = computed(() => buildAxis(categoryData.themes, 'category', '_autre', 'Sans thème identifié'))
const byGenre = computed(() => buildAxis(categoryData.genres, 'genre', '_autre', 'Sans genre'))

const sizeBuckets = computed(() => {
  const buckets = categoryData.sizes.map((s) => ({ ...s, count: 0 }))
  for (const t of textsIndex) {
    const w = t.wordCount || 0
    const bucket =
      buckets.find((b) => w >= b.min && w <= b.max) ||
      (w > buckets[buckets.length - 1]?.max ? buckets[buckets.length - 1] : buckets[0])
    bucket.count++
  }
  return buckets
})

const fragileThreshold = ref(3)
const includeEmptyCells = ref(false)

function fragileCells(rows, threshold, includeEmpty) {
  const cells = []
  for (const row of rows) {
    for (const level of LEVELS) {
      const n = row.byLevel[level]
      if (n <= threshold && (n > 0 || includeEmpty)) {
        cells.push({ label: row.name, icon: row.icon, level, count: n })
      }
    }
  }
  // Toujours les moins fournies en premier
  return cells.sort((a, b) => a.count - b.count || a.label.localeCompare(b.label))
}

const fragileThemeCells = computed(() =>
  fragileCells(byTheme.value, fragileThreshold.value, includeEmptyCells.value)
)
const fragileGenreCells = computed(() =>
  fragileCells(byGenre.value, fragileThreshold.value, includeEmptyCells.value)
)
</script>

<template>
  <SceneLayout title="Admin" accent=" · Textes" tagline="Vue d'ensemble du catalogue" wide>
    <nav class="tabs">
      <RouterLink :to="{ name: 'admin' }" class="tab" exact-active-class="active">Comptes</RouterLink>
      <RouterLink :to="{ name: 'admin-words' }" class="tab" exact-active-class="active">Mots</RouterLink>
      <RouterLink :to="{ name: 'admin-texts' }" class="tab active">Textes</RouterLink>
    </nav>

    <div class="stats">
      <div class="stat">
        <span class="stat-value">{{ overall.total }}</span>
        <span class="stat-label">Textes au catalogue</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ overall.words.toLocaleString('fr-CH') }}</span>
        <span class="stat-label">Mots au total</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ overall.avgWords }}</span>
        <span class="stat-label">Mots / texte en moyenne</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ beginnerShare }}%</span>
        <span class="stat-label">Part A1–A2</span>
      </div>
      <div class="stat" v-if="overall.withoutGenre">
        <span class="stat-value">{{ overall.withoutGenre }}</span>
        <span class="stat-label">Sans genre attribué</span>
      </div>
    </div>

    <section class="block">
      <h2>Par niveau</h2>
      <table class="matrix">
        <thead>
          <tr>
            <th></th>
            <th v-for="l in LEVELS" :key="l">{{ l }}</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="row-label">Textes</td>
            <td v-for="l in LEVELS" :key="l">{{ overall.byLevel[l] }}</td>
            <td class="row-total">{{ overall.total }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="block">
      <h2>Par thème (catégorie)</h2>
      <table class="matrix">
        <thead>
          <tr>
            <th>Thème</th>
            <th v-for="l in LEVELS" :key="l">{{ l }}</th>
            <th>Total</th>
            <th>Mots</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in byTheme" :key="row.id">
            <td class="row-label">
              <span class="icon">{{ row.icon }}</span>
              {{ row.name }}
            </td>
            <td v-for="l in LEVELS" :key="l" :class="{ weak: row.byLevel[l] === 1, empty: row.byLevel[l] === 0 }">
              {{ row.byLevel[l] || '·' }}
            </td>
            <td class="row-total">{{ row.total }}</td>
            <td>{{ row.words.toLocaleString('fr-CH') }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="block">
      <h2>Par genre (forme)</h2>
      <table class="matrix">
        <thead>
          <tr>
            <th>Genre</th>
            <th v-for="l in LEVELS" :key="l">{{ l }}</th>
            <th>Total</th>
            <th>Mots</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in byGenre" :key="row.id">
            <td class="row-label">
              <span class="icon">{{ row.icon }}</span>
              {{ row.name }}
            </td>
            <td v-for="l in LEVELS" :key="l" :class="{ weak: row.byLevel[l] === 1, empty: row.byLevel[l] === 0 }">
              {{ row.byLevel[l] || '·' }}
            </td>
            <td class="row-total">{{ row.total }}</td>
            <td>{{ row.words.toLocaleString('fr-CH') }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="block">
      <h2>Par taille de texte</h2>
      <div class="stats">
        <div class="stat" v-for="b in sizeBuckets" :key="b.id">
          <span class="stat-value">{{ b.count }}</span>
          <span class="stat-label">{{ b.name }} ({{ b.min }}–{{ b.max }} mots)</span>
        </div>
      </div>
    </section>

    <section class="block">
      <div class="fragile-header">
        <h2>Cellules fragiles</h2>
        <label class="threshold-control">
          Seuil
          <select v-model.number="fragileThreshold">
            <option :value="1">≤ 1 texte</option>
            <option :value="2">≤ 2 textes</option>
            <option :value="3">≤ 3 textes</option>
            <option :value="4">≤ 4 textes</option>
            <option :value="5">≤ 5 textes</option>
          </select>
        </label>
        <label class="threshold-control checkbox">
          <input type="checkbox" v-model="includeEmptyCells" />
          Inclure les cellules vides (0 texte)
        </label>
      </div>
      <p class="hint">
        Combinaisons avec {{ fragileThreshold }} texte{{ fragileThreshold > 1 ? 's' : '' }} ou moins, triées des
        moins fournies aux plus fournies — à renforcer en priorité pour éviter la répétition côté lecteur.
      </p>
      <template v-if="fragileThemeCells.length || fragileGenreCells.length">
        <h3 v-if="fragileThemeCells.length">Thèmes</h3>
        <ul class="fragile-list">
          <li v-for="c in fragileThemeCells" :key="'th-' + c.label + c.level" :class="{ zero: c.count === 0 }">
            {{ c.icon }} {{ c.label }} · {{ c.level }} <span class="count">({{ c.count }})</span>
          </li>
        </ul>
        <h3 v-if="fragileGenreCells.length">Genres</h3>
        <ul class="fragile-list">
          <li v-for="c in fragileGenreCells" :key="'ge-' + c.label + c.level" :class="{ zero: c.count === 0 }">
            {{ c.icon }} {{ c.label }} · {{ c.level }} <span class="count">({{ c.count }})</span>
          </li>
        </ul>
      </template>
      <p v-else class="hint">Aucune cellule sous ce seuil — le catalogue est équilibré à ce niveau d'exigence.</p>
    </section>
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

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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

.block {
  margin: 0 0 2.2rem;
}

.block h2 {
  font-size: 1.05rem;
  margin: 0 0 0.7rem;
  color: #2c2620;
}

.hint {
  color: #6b6156;
  font-size: 0.88rem;
  margin: 0 0 0.8rem;
}

.matrix {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
}

.matrix th {
  text-align: center;
  padding: 0.45rem 0.5rem;
  border-bottom: 2px solid rgba(176, 105, 46, 0.3);
  color: #6b6156;
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.matrix th:first-child {
  text-align: left;
}

.matrix td {
  padding: 0.45rem 0.5rem;
  border-bottom: 1px dashed rgba(107, 97, 86, 0.2);
  text-align: center;
  vertical-align: middle;
}

.row-label {
  text-align: left !important;
  white-space: nowrap;
}

.icon {
  margin-right: 0.35rem;
}

.row-total {
  font-weight: 700;
  color: #b0692e;
}

.weak {
  color: #a33a2a;
  font-weight: 700;
}

.empty {
  color: rgba(107, 97, 86, 0.35);
}

.fragile-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.9rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
}

.fragile-list li {
  padding: 0.3rem 0.7rem;
  border: 1px solid rgba(163, 58, 42, 0.3);
  border-radius: 999px;
  background: rgba(163, 58, 42, 0.06);
  color: #a33a2a;
}
</style>
