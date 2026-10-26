<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { firebaseReady } from '../lib/firebase.js'
import { PAID_PLANS } from '../lib/access.js'
import {
  login,
  register,
  loginWithGoogle,
  loginWithApple,
  resetPassword,
  errorMessage,
} from '../lib/auth.js'

const router = useRouter()
const route = useRoute()

// Sign in with Apple n'a de sens qu'en app native (règle App Store 4.8,
// obligatoire dès qu'on propose Google) — inutile sur le web.
const isNativeApp = ref(false)
onMounted(async () => {
  const { Capacitor } = await import('@capacitor/core')
  isNativeApp.value = Capacitor.isNativePlatform()
})

const mode = ref('login') // 'login' | 'register' | 'reset'
const email = ref('')
const password = ref('')
const displayName = ref('')
const error = ref('')
const info = ref('')
const busy = ref(false)
// Inscription : âge minimum (15 ans, ou accord du représentant légal) et
// acceptation des conditions — exigées avant toute création de compte, y
// compris via Google (qui crée le compte à la première connexion).
const ageConfirmed = ref(false)
const termsAccepted = ref(false)
const consentMissing = computed(
  () => mode.value === 'register' && !(ageConfirmed.value && termsAccepted.value)
)
const CONSENT_ERROR =
  "Pour créer un compte, cochez les deux cases (âge et conditions d'utilisation)."

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
  if (consentMissing.value) {
    error.value = CONSENT_ERROR
    return
  }
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

async function apple() {
  error.value = ''
  if (consentMissing.value) {
    error.value = CONSENT_ERROR
    return
  }
  busy.value = true
  try {
    await loginWithApple()
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

    <template v-if="PAID_PLANS">
      <p v-if="mode === 'register'" class="trial-offer">
        <strong>10 jours de Premium IA offerts, sans carte</strong> : après
        vérification de votre e-mail (3 générations de textes IA incluses).
      </p>
      <p v-else-if="mode === 'login'" class="hint">
        Nouveau ? 10 jours de Premium IA offerts, sans carte, après vérification de votre e-mail (3 générations de textes IA incluses).
      </p>
    </template>
    <p v-else-if="mode !== 'reset'" class="hint">
      Le compte est gratuit et facultatif : il sert à retrouver votre
      progression et vos mots favoris sur tous vos appareils.
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

      <template v-if="mode === 'register'">
        <label class="consent">
          <input v-model="ageConfirmed" type="checkbox" required />
          <span>J'ai au moins 15 ans ou, à défaut, l'accord de mon représentant légal.</span>
        </label>
        <label class="consent">
          <input v-model="termsAccepted" type="checkbox" required />
          <span>
            J'accepte les
            <RouterLink :to="{ name: 'terms' }" target="_blank">conditions d'utilisation</RouterLink>
            et j'ai lu la
            <RouterLink :to="{ name: 'privacy' }" target="_blank">politique de confidentialité</RouterLink>.
          </span>
        </label>
      </template>
      <p v-else-if="mode === 'login'" class="consent-note">
        Première connexion avec Google : un compte est créé ; vous confirmez
        alors avoir au moins 15 ans (ou l'accord de votre représentant légal)
        et accepter les
        <RouterLink :to="{ name: 'terms' }">conditions d'utilisation</RouterLink>.
      </p>

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

      <button
        v-if="mode !== 'reset' && isNativeApp"
        class="btn-secondary"
        type="button"
        :disabled="busy || !firebaseReady"
        @click="apple"
      >
        Continuer avec Apple
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
.consent {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 0.6rem;
  font-size: 0.9rem;
  line-height: 1.45;
  cursor: pointer;
}

.consent input {
  flex: none;
  width: 1.15rem;
  height: 1.15rem;
  margin: 0.1rem 0 0;
  padding: 0;
  accent-color: #8f5220;
}

.consent span {
  font-weight: 500;
}

.consent-note {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  opacity: 0.8;
}

.trial-offer {
  margin: 0.4rem 0 0;
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  background: #fff8e6;
  border: 1px solid #e0c98f;
  color: #5c4610;
  font-size: 0.9rem;
}

.switcher {
  margin-top: 1.2rem;
  margin-bottom: 0;
  font-size: 0.9rem;
  line-height: 1.8;
}

.switcher a {
  /* Zone cliquable verticale élargie (Analyse Optimisation UX Mobile.md
     Sprint 1.6) : « Créer un compte »/« Mot de passe oublié » n'avaient
     que la hauteur de ligne du texte comme cible. */
  display: inline-block;
  padding: 0.3rem 0;
}
</style>
