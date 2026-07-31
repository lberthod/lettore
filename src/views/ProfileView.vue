<script setup>
import { ref, computed } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import {
  currentUser,
  logout,
  errorMessage,
  sendVerificationEmail,
  refreshEmailVerified,
} from '../lib/auth.js'
import {
  authProvider,
  reauthenticateWithPassword,
  reauthenticateWithGoogle,
  reauthenticateWithApple,
  deleteAccount,
} from '../lib/account.js'
import { progress, dueFavorites } from '../progress.js'

const router = useRouter()
const error = ref('')

// --- Dashboard de progression ---
// dueFavorites dépend de Date.now() : recalculé via progress pour rester
// réactif aux révisions faites pendant la session.
const dueCount = computed(() => dueFavorites().length)

async function doLogout() {
  error.value = ''
  try {
    await logout()
    router.push({ name: 'home' })
  } catch (e) {
    error.value = errorMessage(e)
  }
}

// --- Vérification de l'adresse e-mail ---
// Le compte est utilisable dès l'inscription pour la lecture ; seule la
// génération d'essai IA attend une adresse confirmée (voir
// leggendo-server/quota.mjs). Comptes Google : déjà vérifiés par Google.
const verifyBusy = ref(false)
const verifyInfo = ref('')
const verifyError = ref('')

async function resendVerification() {
  verifyBusy.value = true
  verifyInfo.value = verifyError.value = ''
  try {
    await sendVerificationEmail()
    verifyInfo.value = 'Lien renvoyé — vérifiez votre boîte de réception (et les indésirables).'
  } catch (e) {
    verifyError.value = errorMessage(e)
  } finally {
    verifyBusy.value = false
  }
}

async function checkVerification() {
  verifyBusy.value = true
  verifyInfo.value = verifyError.value = ''
  try {
    if (await refreshEmailVerified()) {
      verifyInfo.value = 'Adresse confirmée, merci !'
    } else {
      verifyError.value = 'Adresse pas encore confirmée : ouvrez le lien reçu par e-mail, puis réessayez.'
    }
  } catch (e) {
    verifyError.value = errorMessage(e)
  } finally {
    verifyBusy.value = false
  }
}

// --- Suppression de compte ---
const provider = computed(() => authProvider(currentUser.value))
const confirmingDelete = ref(false)
const deletePassword = ref('')
const deleteError = ref('')
const deleting = ref(false)

function startDelete() {
  confirmingDelete.value = true
  deleteError.value = ''
  deletePassword.value = ''
}

function cancelDelete() {
  confirmingDelete.value = false
  deleteError.value = ''
}

async function confirmDelete() {
  deleteError.value = ''
  const needsPassword = provider.value !== 'google.com' && provider.value !== 'apple.com'
  if (needsPassword && !deletePassword.value) {
    deleteError.value = 'Mot de passe requis.'
    return
  }
  deleting.value = true
  try {
    if (provider.value === 'google.com') {
      await reauthenticateWithGoogle()
    } else if (provider.value === 'apple.com') {
      await reauthenticateWithApple()
    } else {
      await reauthenticateWithPassword(deletePassword.value)
    }
    await deleteAccount()
    await logout()
    router.push({ name: 'home' })
  } catch (e) {
    deleteError.value = errorMessage(e)
  } finally {
    deleting.value = false
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

      <div v-if="!currentUser.emailVerified" class="verify-box">
        <p>
          <strong>Adresse e-mail non confirmée.</strong> Ouvrez le lien envoyé à
          l'inscription pour débloquer votre génération d'essai
          (<RouterLink :to="{ name: 'create-text' }">Créer son texte</RouterLink>).
        </p>
        <p class="verify-actions">
          <button type="button" class="link-btn" :disabled="verifyBusy" @click="resendVerification">
            Renvoyer le lien
          </button>
          <button type="button" class="link-btn" :disabled="verifyBusy" @click="checkVerification">
            J'ai confirmé mon adresse
          </button>
        </p>
        <p v-if="verifyInfo" class="verify-info">{{ verifyInfo }}</p>
        <p v-if="verifyError" class="error">{{ verifyError }}</p>
      </div>

      <h2>Ma progression</h2>
      <div class="dashboard">
        <div class="stat stat-streak">
          <span class="stat-value">🔥 {{ progress.streak.current }}</span>
          <span class="stat-label">
            {{ progress.streak.current > 1 ? "jours d'affilée" : "jour d'affilée" }}
          </span>
          <span class="stat-sub">Record : {{ progress.streak.longest }}</span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ progress.readTexts.length }}</span>
          <span class="stat-label">
            {{ progress.readTexts.length > 1 ? 'textes lus' : 'texte lu' }}
          </span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ progress.knownWords.length }}</span>
          <span class="stat-label">
            {{ progress.knownWords.length > 1 ? 'mots connus' : 'mot connu' }}
          </span>
        </div>
        <div class="stat">
          <span class="stat-value">{{ dueCount }}</span>
          <span class="stat-label">
            {{ dueCount > 1 ? 'mots à réviser' : 'mot à réviser' }}
          </span>
          <RouterLink v-if="dueCount" class="stat-link" :to="{ name: 'words' }">
            Réviser →
          </RouterLink>
        </div>
      </div>

      <h2>Abonnement</h2>
      <p>
        Formule actuelle : <strong>Gratuit</strong><br />
        <RouterLink :to="{ name: 'pricing' }">Passer à Premium →</RouterLink>
      </p>

      <p v-if="error" class="error">{{ error }}</p>
      <button class="btn-secondary" @click="doLogout">Se déconnecter</button>

      <div class="danger-zone">
        <h2>Zone dangereuse</h2>
        <button v-if="!confirmingDelete" class="btn-danger" @click="startDelete">
          Supprimer mon compte
        </button>
        <template v-else>
          <p class="warning">
            Action définitive : vos textes créés, votre progression et votre
            compte seront supprimés. Si vous avez un abonnement actif,
            résiliez-le d'abord auprès de nous — la suppression du compte ne
            résilie pas automatiquement un paiement en cours.
          </p>
          <form class="form" @submit.prevent="confirmDelete">
            <label v-if="provider !== 'google.com'">
              Confirmez votre mot de passe
              <input
                v-model="deletePassword"
                type="password"
                autocomplete="current-password"
              />
            </label>
            <p v-if="deleteError" class="error">{{ deleteError }}</p>
            <div class="delete-actions">
              <button class="btn-danger" type="submit" :disabled="deleting">
                {{ deleting ? 'Suppression…' : 'Supprimer définitivement' }}
              </button>
              <button
                class="btn-secondary"
                type="button"
                :disabled="deleting"
                @click="cancelDelete"
              >
                Annuler
              </button>
            </div>
          </form>
        </template>
      </div>
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

.verify-box {
  margin: 1.2rem 0;
  padding: 0.7rem 0.9rem;
  border: 1px solid rgba(176, 105, 46, 0.35);
  border-radius: 10px;
  background: rgba(176, 105, 46, 0.08);
  font-size: 0.9rem;
}

.verify-box p {
  margin: 0;
}

.verify-box .verify-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 0.5rem;
}

.verify-box .verify-info {
  margin-top: 0.5rem;
  color: #3d7a3d;
}

.verify-box .error {
  margin-top: 0.5rem;
}

.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: #b0692e;
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
}

.link-btn[disabled] {
  opacity: 0.5;
  cursor: default;
}

/* --- Dashboard de progression --- */
.dashboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 0.7rem;
  margin: 0.9rem 0 1.6rem;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.8rem 0.9rem;
  border: 1px solid #e4d9c6;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.75);
}

.stat-value {
  font-size: 1.45rem;
  font-weight: 700;
  color: #6f4722;
}

.stat-streak .stat-value {
  color: #b0692e;
}

.stat-label {
  font-size: 0.82rem;
  color: #6b6156;
}

.stat-sub {
  font-size: 0.75rem;
  color: #8a5a2b;
  opacity: 0.85;
}

.stat-link {
  font-size: 0.8rem;
  color: #b0692e;
}

.danger-zone {
  margin-top: 2.2rem;
  padding-top: 1.2rem;
  border-top: 1px solid #e3d9ca;
}

.danger-zone h2 {
  margin: 0 0 0.7rem;
}

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
  transition: background 0.12s, color 0.12s;
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
}
</style>
