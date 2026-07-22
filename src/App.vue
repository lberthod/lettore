<script setup>
import { RouterView } from 'vue-router'
</script>

<template>
  <!-- Chaque page est un écran plein qui embarque sa propre barre de navigation
       et son pied de page communs (SiteHeader / SiteFooter). -->
  <RouterView />
</template>
