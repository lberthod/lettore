<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import textsIndex from '../texts/index.json'
import { findLevelLandingPage, pickFeaturedTexts } from '../seo/landingPages.js'

const props = defineProps({
  level: { type: String, required: true },
})

const page = computed(() => findLevelLandingPage(props.level))
const featured = computed(() => pickFeaturedTexts(textsIndex, props.level, 20))
</script>

<template>
  <SceneLayout v-if="page" :title="page.heading" tagline="Niveau CECR" wide>
    <p>{{ page.audience }}</p>
    <p>{{ page.difficulties }}</p>
    <p>{{ page.order }}</p>

    <ul class="featured">
      <li v-for="t in featured" :key="t.id">
        <RouterLink :to="{ name: 'reader', params: { id: t.id } }">{{ t.title }}</RouterLink>
        — {{ t.excerpt }}
      </li>
    </ul>

    <p>
      <RouterLink :to="{ name: 'library', query: { level: page.level } }">
        Voir tous les textes {{ page.level }}
      </RouterLink>
    </p>
  </SceneLayout>
</template>

<style scoped>
.featured {
  margin: 1.2rem 0;
  padding-left: 1.2rem;
  line-height: 1.7;
}

.featured li {
  margin-bottom: 0.5rem;
}
</style>
