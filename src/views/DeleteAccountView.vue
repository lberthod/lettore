<script setup>
import { ref, computed } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { currentUser, logout, errorMessage } from '../lib/auth.js'
import {
  authProvider,
  reauthenticateWithPassword,
  reauthenticateWithGoogle,
  reauthenticateWithApple,
  deleteAccount,
} from '../lib/account.js'

const router = useRouter()
const provider = computed(() => authProvider(currentUser.value))
const confirming = ref(false)
const password = ref('')
const error = ref('')
const deleting = ref(false)
const done = ref(false)

function start() {
  confirming.value = true
  error.value = ''
  password.value = ''
}

function cancel() {
  confirming.value = false
  error.value = ''
}

async function confirm() {
  error.value = ''
  const needsPassword = provider.value !== 'google.com' && provider.value !== 'apple.com'
  if (needsPassword && !password.value) {
    error.value = 'Mot de passe requis.'
    return
  }
  deleting.value = true
  try {
    if (provider.value === 'google.com') {
      await reauthenticateWithGoogle()
    } else if (provider.value === 'apple.com') {
      await reauthenticateWithApple()
    } else {
      await reauthenticateWithPassword(password.value)
    }
    await deleteAccount()
    await logout()
    done.value = true
    confirming.value = false
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <SceneLayout title="Supprimer" accent="il conto" tagline="Suppression de compte" narrow>
    <template v-if="done">
      <p>
        <strong>Votre compte et vos données ont été supprimés.</strong>
      </p>
      <p class="hint">
        <RouterLink :to="{ name: 'home' }">Retour à l'accueil</RouterLink>
      </p>
    </template>

    <template v-else>
      <p>
        Cette page permet de supprimer votre compte Leggendo et les données
        associées, que vous utilisiez le site, l'application Android ou
        l'application iOS.
      </p>

      <h2>Ce qui est supprimé</h2>
      <ul>
        <li>Votre compte (e-mail, nom d'affichage, méthode de connexion)</li>
        <li>Votre progression de lecture, vos mots connus et votre historique d'activité</li>
        <li>Les textes que vous avez créés</li>
      </ul>
      <p class="hint">
        Un abonnement Stripe actif n'est pas résilié automatiquement par la
        suppression du compte : contactez-nous d'abord si vous êtes abonné,
        pour éviter un prélèvement après suppression. Voir notre
        <RouterLink :to="{ name: 'privacy' }">politique de confidentialité</RouterLink>.
      </p>

      <template v-if="currentUser">
        <h2>Supprimer mon compte</h2>
        <p>
          Connecté en tant que <strong>{{ currentUser.email }}</strong>.
        </p>
        <button v-if="!confirming" class="btn-danger" @click="start">
          Supprimer mon compte
        </button>
        <template v-else>
          <p class="warning">
            Action définitive et immédiate.
          </p>
          <form class="form" @submit.prevent="confirm">
            <label v-if="provider !== 'google.com' && provider !== 'apple.com'">
              Confirmez votre mot de passe
              <input v-model="password" type="password" autocomplete="current-password" />
            </label>
            <p v-if="error" class="error">{{ error }}</p>
            <div class="delete-actions">
              <button class="btn-danger" type="submit" :disabled="deleting">
                {{ deleting ? 'Suppression…' : 'Supprimer définitivement' }}
              </button>
              <button class="btn-secondary" type="button" :disabled="deleting" @click="cancel">
                Annuler
              </button>
            </div>
          </form>
        </template>
      </template>

      <template v-else>
        <h2>Demander la suppression</h2>
        <p>
          <RouterLink :to="{ name: 'login', query: { redirect: '/deleteAccount' } }">
            Connectez-vous
          </RouterLink>
          pour supprimer votre compte directement depuis cette page.
        </p>
        <p class="hint">
          Vous ne pouvez pas vous connecter ? Écrivez-nous depuis l'adresse
          e-mail de votre compte à
          <a href="mailto:lberthod@gmail.com?subject=Suppression%20de%20compte">lberthod@gmail.com</a>
          en précisant votre demande de suppression : nous traitons la
          demande sous 30 jours.
        </p>
      </template>
    </template>
  </SceneLayout>
</template>

<style scoped>
.warning {
  margin: 0 0 0.9rem;
  font-size: 0.9rem;
  color: #6b6156;
}

.btn-danger {
  display: inline-block;
  padding: 0.6rem 1.2rem;
  border: 1px solid #a34430;
  border-radius: 8px;
  background: #fff;
  color: #a34430;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}

.btn-danger:hover:not(:disabled) {
  background: #a34430;
  color: #fff;
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.delete-actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.7rem;
}
</style>
