<script setup>
import { RouterLink } from 'vue-router'
import textsIndex from '../texts/index.json'
</script>

<template>
  <section class="home">
    <p class="intro">
      Choisissez un texte pour commencer la lecture. Survolez les mots pour
      voir leur traduction, cliquez sur la ponctuation pour traduire une
      phrase entière.
    </p>

    <div class="grid">
      <RouterLink
        v-for="t in textsIndex"
        :key="t.id"
        class="card"
        :to="{ name: 'reader', params: { id: t.id } }"
      >
        <h2>{{ t.title }}</h2>
        <p class="excerpt">{{ t.excerpt }}</p>
        <p class="meta">
          {{ t.paragraphCount }} paragraphes · ~{{ t.wordCount }} mots
        </p>
        <span class="cta">Lire →</span>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.intro {
  margin: 0 0 1.5rem;
  font-size: 0.95rem;
  opacity: 0.65;
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
  border: 1px solid #d8cfc2;
  border-radius: 10px;
  background: #fff;
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}

.card:hover {
  border-color: #b0692e;
  box-shadow: 0 4px 14px rgba(44, 38, 32, 0.08);
  transform: translateY(-2px);
}

.card h2 {
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

.cta {
  margin-top: auto;
  align-self: flex-end;
  font-size: 0.85rem;
  font-weight: 700;
  color: #b0692e;
}
</style>
