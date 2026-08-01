<script setup>
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import booksIndex from '../books/index.json'
import { progress } from '../progress.js'
import { FREE_CLASSICI_BOOK_IDS, FREE_CLASSICI_PREVIEW_BOOK_IDS } from '../lib/access.js'

function readChapters(book) {
  return progress.readTexts.filter((id) => id.startsWith(`${book.id}-`)).length
}

function accessLabel(book) {
  if (FREE_CLASSICI_BOOK_IDS.includes(book.id)) return 'Gratuit'
  if (FREE_CLASSICI_PREVIEW_BOOK_IDS.includes(book.id)) return '1er chapitre gratuit'
  return 'Premium'
}
</script>

<template>
  <SceneLayout title="Classici" accent="del dominio pubblico" wide>
    <p class="intro">
      Des œuvres classiques italiennes du domaine public, en texte authentique
      (non simplifié) — traduction au clic, lecture audio et quiz de
      compréhension, chapitre par chapitre.
    </p>

    <div v-if="!booksIndex.length" class="empty">
      Aucun livre disponible pour l'instant.
    </div>

    <div v-else class="grid">
      <RouterLink
        v-for="book in booksIndex"
        :key="book.id"
        class="card"
        :to="{ name: 'book-reader', params: { bookId: book.id, chapterId: '01' } }"
      >
        <h3>{{ book.title }}</h3>
        <p class="author">{{ book.author }}</p>
        <p class="meta">
          Niveau {{ book.level }} · {{ book.chapterCount }} chapitre{{ book.chapterCount > 1 ? 's' : '' }}
          <template v-if="book.totalChapterCount > book.chapterCount">
            / {{ book.totalChapterCount }}
          </template>
          · ~{{ book.wordCount }} mots
        </p>
        <p class="access" :class="{ free: accessLabel(book) !== 'Premium IA' }">
          {{ accessLabel(book) }}
        </p>
        <p v-if="readChapters(book)" class="progress">
          {{ readChapters(book) }} chapitre{{ readChapters(book) > 1 ? 's' : '' }} lu{{ readChapters(book) > 1 ? 's' : '' }}
        </p>
      </RouterLink>
    </div>
  </SceneLayout>
</template>

<style scoped>
.intro {
  max-width: 46rem;
  margin: 0 auto 1.6rem;
  text-align: center;
  color: #6b6156;
}

.empty {
  text-align: center;
  color: #6b6156;
  padding: 2rem 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1.1rem;
}

.card {
  display: block;
  padding: 1.3rem 1.4rem;
  border: 1px solid rgba(176, 105, 46, 0.25);
  border-radius: 16px;
  background: rgba(255, 253, 248, 0.85);
  text-decoration: none;
  color: inherit;
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
}

.card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 26px rgba(111, 71, 34, 0.16);
  border-color: #b0692e;
}

.card h3 {
  margin: 0 0 0.2rem;
  font-family: 'Georgia', 'Times New Roman', serif;
  color: #2c2620;
}

.author {
  margin: 0 0 0.5rem;
  font-size: 0.88rem;
  color: #8a5a2b;
}

.meta {
  margin: 0;
  font-size: 0.82rem;
  color: #6b6156;
}

.progress {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: #4a7c59;
}

.access {
  display: inline-block;
  margin: 0.6rem 0 0;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #8a5a2b;
  background: rgba(176, 105, 46, 0.12);
}

.access.free {
  color: #4a7c59;
  background: rgba(74, 124, 89, 0.14);
}
</style>
