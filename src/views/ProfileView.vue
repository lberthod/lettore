<script setup>
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { currentUser, logout, errorMessage } from '../lib/auth.js'

const router = useRouter()
const error = ref('')

async function doLogout() {
  error.value = ''
  try {
    await logout()
    router.push({ name: 'home' })
  } catch (e) {
    error.value = errorMessage(e)
  }
}
</script>

<template>
  <SceneLayout title="Il mio prof" accent="ilo" tagline="Mon profil" narrow>
    <template v-if="currentUser">
      <p>
        <strong>{{ currentUser.displayName || 'Sans nom' }}</strong><br />
        {{ currentUser.email }}
      </p>
      <p class="hint">
        Membre depuis le
        {{ new Date(currentUser.metadata.creationTime).toLocaleDateString('fr-CH') }}
      </p>

      <h2>Abonnement</h2>
      <p>
        Formule actuelle : <strong>Gratuit</strong><br />
        <RouterLink :to="{ name: 'pricing' }">Passer à Premium →</RouterLink>
      </p>

      <p v-if="error" class="error">{{ error }}</p>
      <button class="btn-secondary" @click="doLogout">Se déconnecter</button>
    </template>

    <p v-else class="not-logged">
      Vous n'êtes pas connecté.
      <RouterLink :to="{ name: 'login' }">Se connecter</RouterLink>
    </p>
  </SceneLayout>
</template>

<style scoped>
.not-logged {
  margin: 0;
}
</style>
