<script setup>
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { firebaseReady } from '../lib/firebase.js'
import {
  login,
  register,
  loginWithGoogle,
  resetPassword,
  errorMessage,
} from '../lib/auth.js'

const router = useRouter()
const route = useRoute()

const mode = ref('login') // 'login' | 'register' | 'reset'
const email = ref('')
const password = ref('')
const displayName = ref('')
const error = ref('')
const info = ref('')
const busy = ref(false)

const heading = computed(() =>
  mode.value === 'login'
    ? 'Connexion'
    : mode.value === 'register'
      ? 'Créer un compte'
      : 'Mot de passe oublié',
)

function afterLogin() {
  router.push(route.query.redirect || { name: 'profile' })
}

async function submit() {
  error.value = ''
  info.value = ''
  busy.value = true
  try {
    if (mode.value === 'login') {
      await login(email.value, password.value)
      afterLogin()
    } else if (mode.value === 'register') {
      await register(email.value, password.value, displayName.value)
      afterLogin()
    } else {
      await resetPassword(email.value)
      info.value = 'E-mail de réinitialisation envoyé. Vérifiez votre boîte de réception.'
    }
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

async function google() {
  error.value = ''
  busy.value = true
  try {
    await loginWithGoogle()
    afterLogin()
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <SceneLayout title="Benven" accent="uto" :tagline="heading" narrow>
    <p v-if="!firebaseReady" class="notice">
      L'authentification n'est pas encore activée : la configuration Firebase
      doit être renseignée dans <code>src/lib/firebase.js</code>.
    </p>

    <form class="form" @submit.prevent="submit">
      <label v-if="mode === 'register'">
        Nom d'affichage
        <input v-model="displayName" type="text" autocomplete="nickname" />
      </label>
      <label>
        Adresse e-mail
        <input v-model="email" type="email" required autocomplete="email" />
      </label>
      <label v-if="mode !== 'reset'">
        Mot de passe
        <input
          v-model="password"
          type="password"
          required
          minlength="6"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
        />
      </label>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="info" class="success">{{ info }}</p>

      <button class="btn-primary" type="submit" :disabled="busy || !firebaseReady">
        {{ mode === 'login' ? 'Se connecter' : mode === 'register' ? "S'inscrire" : 'Envoyer le lien' }}
      </button>

      <button
        v-if="mode !== 'reset'"
        class="btn-secondary"
        type="button"
        :disabled="busy || !firebaseReady"
        @click="google"
      >
        Continuer avec Google
      </button>
    </form>

    <p class="switcher">
      <template v-if="mode === 'login'">
        Pas encore de compte ?
        <a href="#" @click.prevent="mode = 'register'">Créer un compte</a><br />
        <a href="#" @click.prevent="mode = 'reset'">Mot de passe oublié ?</a>
      </template>
      <template v-else>
        <a href="#" @click.prevent="mode = 'login'">← Retour à la connexion</a>
      </template>
    </p>
  </SceneLayout>
</template>

<style scoped>
.switcher {
  margin-top: 1.2rem;
  margin-bottom: 0;
  font-size: 0.9rem;
  line-height: 1.8;
}
</style>
