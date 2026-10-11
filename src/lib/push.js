// Notifications push (FCM) — natif uniquement (Android/iOS), voir
// functions/push.mjs et leggendo-server/push.mjs côté envoi. Le jeton de
// l'appareil est stocké dans users/{uid}.fcmTokens (voir firestore.rules :
// liste de chaînes, 10 éléments maximum) : un compte peut en avoir plusieurs
// (réinstallation, plusieurs appareils). Le jeton de l'appareil courant est
// retiré à la déconnexion (removeCurrentDeviceToken) ; les jetons périmés
// restent élagués côté serveur sur échec d'envoi.
//
// Trois déclencheurs actuels (data.type reçu à l'ouverture) :
// - 'generation_done'  : un texte généré (Premium IA) est prêt → /mes-textes
// - 'streak_reminder'  : rappel de série quotidienne → accueil
// - 'new_content'      : nouveau texte Notizie publié → /notizie
//
// Permission : jamais demandée à la connexion. Après le premier texte terminé
// (événement window `leggendo:text-completed`, émis par ReaderView), un écran
// explicatif (App.vue, via `pushPromptVisible`) propose d'activer les
// notifications ; la demande système n'a lieu que si l'utilisateur accepte.
// Un refus est mémorisé 30 jours. Si la permission est déjà accordée, le
// jeton est simplement (ré)enregistré en silence.
//
// Suit le même pattern que initProgressSync() (progressSync.js) : observe
// `currentUser` lui-même plutôt que d'être piloté depuis auth.js, pour ne
// créer aucune dépendance statique vers router.js (qui importe déjà
// auth.js — un import statique ici créerait un cycle). La navigation au tap
// importe router.js dynamiquement, résolu après le chargement des modules.

import { ref, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { currentUser } from './auth.js'
import { getDbInstance as getDb } from './firebase.js'

export const MAX_FCM_TOKENS = 10
export const DECLINE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000
export const TEXT_COMPLETED_EVENT = 'leggendo:text-completed'
const DECLINED_KEY = 'leggendo.push.declinedAt'
const TOKEN_KEY = 'leggendo.push.token'

const ROUTE_BY_TYPE = {
  generation_done: '/mes-textes',
  new_content: '/notizie',
}

// --- Logique pure (testée dans push.test.js) --------------------------------

// Liste de jetons à écrire pour respecter la limite des règles Firestore.
// Retourne null si le jeton est déjà présent (rien à écrire).
export function nextTokens(existing, token, max = MAX_FCM_TOKENS) {
  const list = Array.isArray(existing) ? existing.filter((t) => typeof t === 'string') : []
  if (list.includes(token)) return null
  return [...list, token].slice(-max)
}

// L'écran explicatif peut-il être proposé ?
export function shouldShowPrompt({ isNative, uid, permission, declinedAt, now }) {
  if (!isNative || !uid) return false
  if (permission === 'granted' || permission === 'denied') return false
  if (declinedAt && now - declinedAt < DECLINE_COOLDOWN_MS) return false
  return true
}

export function routeForTap(data) {
  return ROUTE_BY_TYPE[data?.type] || null
}

// --- Contrôleur (dépendances injectables pour les tests) --------------------

export function createPushController(deps) {
  const { isNative, storage, now, getPlugin, tokenStore, navigate } = deps
  const promptVisible = ref(false)
  let currentUid = null
  let lastToken = null
  let listenersFor = 0

  const readNumber = (key) => {
    try {
      const v = Number(storage.getItem(key))
      return Number.isFinite(v) && v > 0 ? v : 0
    } catch {
      return 0
    }
  }
  const write = (key, value) => {
    try {
      if (value == null) storage.removeItem(key)
      else storage.setItem(key, String(value))
    } catch {
      // stockage indisponible : pas bloquant
    }
  }
  if (isNative) {
    try {
      lastToken = storage.getItem(TOKEN_KEY) || null
    } catch {
      lastToken = null
    }
  }

  // Un seul jeu de listeners, quel que soit le nombre de changements d'uid.
  async function attachListeners(PushNotifications) {
    await PushNotifications.removeAllListeners()
    listenersFor += 1
    await PushNotifications.addListener('registration', (token) => {
      lastToken = token.value
      write(TOKEN_KEY, token.value)
      if (!currentUid) return
      Promise.resolve(tokenStore.add(currentUid, token.value)).catch((err) =>
        console.error('Enregistrement du jeton push impossible :', err)
      )
    })
    await PushNotifications.addListener('registrationError', (err) => {
      console.error('Erreur d’enregistrement push :', err)
    })
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const path = routeForTap(action.notification?.data)
      if (path) Promise.resolve(navigate(path)).catch(() => {})
    })
  }

  async function register() {
    const PushNotifications = await getPlugin()
    await attachListeners(PushNotifications)
    await PushNotifications.register()
  }

  async function permissionState() {
    const PushNotifications = await getPlugin()
    const { receive } = await PushNotifications.checkPermissions()
    return receive
  }

  async function onUserChange(uid) {
    if (!isNative) return
    if (uid === currentUid) return
    currentUid = uid || null
    promptVisible.value = false
    if (!uid) return
    // Jamais de demande système ici : on ne réenregistre que si l'accord
    // existe déjà.
    if ((await permissionState()) === 'granted') await register()
  }

  // Appelé à la fin d'un premier texte (événement leggendo:text-completed).
  async function onTextCompleted() {
    if (!isNative || !currentUid) return
    const permission = await permissionState()
    if (
      shouldShowPrompt({
        isNative,
        uid: currentUid,
        permission,
        declinedAt: readNumber(DECLINED_KEY),
        now: now(),
      })
    ) {
      promptVisible.value = true
    }
  }

  // Seul point d'appel de la demande système (requestPermissions).
  async function acceptPrompt() {
    promptVisible.value = false
    if (!isNative || !currentUid) return false
    const PushNotifications = await getPlugin()
    const req = await PushNotifications.requestPermissions()
    if (req.receive !== 'granted') {
      write(DECLINED_KEY, now())
      return false
    }
    await register()
    return true
  }

  function dismissPrompt() {
    promptVisible.value = false
    write(DECLINED_KEY, now())
  }

  // À appeler AVANT signOut (l'écriture exige d'être connecté).
  async function removeCurrentDeviceToken() {
    const uid = currentUid
    const token = lastToken
    if (!isNative || !uid || !token) return false
    try {
      await tokenStore.remove(uid, token)
      lastToken = null
      write(TOKEN_KEY, null)
      return true
    } catch (err) {
      console.error('Retrait du jeton push impossible :', err)
      return false
    }
  }

  return {
    promptVisible,
    onUserChange,
    onTextCompleted,
    acceptPrompt,
    dismissPrompt,
    removeCurrentDeviceToken,
    _listenerSets: () => listenersFor,
  }
}

// --- Câblage réel -----------------------------------------------------------

const isNative = Capacitor.isNativePlatform()

const firestoreTokenStore = {
  async add(uid, token) {
    const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')])
    const { doc, getDoc, setDoc } = fs
    const ref_ = doc(db, 'users', uid)
    const snap = await getDoc(ref_)
    const list = nextTokens(snap.exists() ? snap.data().fcmTokens : [], token)
    if (list) await setDoc(ref_, { fcmTokens: list }, { merge: true })
  },
  async remove(uid, token) {
    const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')])
    const { doc, setDoc, arrayRemove } = fs
    await setDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) }, { merge: true })
  },
}

const controller = createPushController({
  isNative,
  storage: typeof localStorage !== 'undefined' ? localStorage : { getItem: () => null, setItem() {}, removeItem() {} },
  now: () => Date.now(),
  getPlugin: async () => (await import('@capacitor/push-notifications')).PushNotifications,
  tokenStore: firestoreTokenStore,
  navigate: async (path) => {
    const { default: router } = await import('../router.js')
    router.push(path)
  },
})

// Visible par App.vue pour afficher l'écran explicatif.
export const pushPromptVisible = controller.promptVisible
export const acceptPushPrompt = controller.acceptPrompt
export const dismissPushPrompt = controller.dismissPrompt
// DEP : auth.js logout() doit l'appeler (await) juste avant signOut.
export const removeCurrentDeviceToken = controller.removeCurrentDeviceToken

let started = false

// Idempotent. À appeler une fois au démarrage de l'app (voir App.vue).
export function initPushSync() {
  if (started || !isNative) return
  started = true

  watch(
    () => currentUser.value?.uid || null,
    (uid) => {
      controller.onUserChange(uid).catch((err) =>
        console.error('Initialisation des notifications push impossible :', err)
      )
    },
    { immediate: true }
  )

  window.addEventListener(TEXT_COMPLETED_EVENT, () => {
    controller.onTextCompleted().catch(() => {})
  })
}
