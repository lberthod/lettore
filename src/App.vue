<script setup>
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <header>
    <RouterLink class="brand" :to="{ name: 'home' }">
      <h1>Lettore italiano</h1>
    </RouterLink>
  </header>

  <main>
    <RouterView />
  </main>
</template>

<style scoped>
header {
  margin-bottom: 1.2rem;
}

.brand {
  color: inherit;
  text-decoration: none;
}

h1 {
  font-size: 1.6rem;
  margin: 0;
}
</style>
