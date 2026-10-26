// Achats in-app iOS (StoreKit natif, via cordova-plugin-purchase — pas de
// service tiers type RevenueCat). Obligatoire pour vendre l'accès Premium
// dans l'app iOS : Apple interdit Stripe pour du contenu numérique consommé
// dans l'app (règle 3.1.1). Sur le web, `src/lib/stripe.js` reste utilisé.
//
// Les product ID ci-dessous doivent être créés dans App Store Connect
// (Fonctionnalités de l'app → Achats intégrés) avec exactement ces
// identifiants avant que l'app ne puisse les lister ou les vendre.
// `functions/roles.mjs` (APPLE_PRODUCT_ROLE_MAP) doit rester synchronisé.

import { currentUser } from './auth.js'

export const appleProducts = {
  premium_monthly: { id: 'com.leggendo.app.premium.monthly', role: 'premium' },
  premium_annual: { id: 'com.leggendo.app.premium.annual', role: 'premium' },
  premium_plus_monthly: {
    id: 'com.leggendo.app.premiumplus.monthly',
    role: 'premium_plus',
  },
  premium_plus_annual: {
    id: 'com.leggendo.app.premiumplus.annual',
    role: 'premium_plus',
  },
  enseignant_monthly: {
    id: 'com.leggendo.app.enseignant.monthly',
    role: 'enseignant',
  },
  enseignant_annual: {
    id: 'com.leggendo.app.enseignant.annual',
    role: 'enseignant',
  },
}

let storeInitPromise = null

// Initialise le store StoreKit une seule fois (appelé au premier accès à la
// page Abonnement en contexte natif). `CdvPurchase` est injecté globalement
// par le plugin Cordova une fois le bundle natif chargé.
function initStore() {
  if (storeInitPromise) return storeInitPromise
  storeInitPromise = new Promise((resolve, reject) => {
    const { store, ProductType, Platform } = window.CdvPurchase || {}
    if (!store) {
      reject(new Error('StoreKit indisponible (hors app native ?).'))
      return
    }

    store.register(
      Object.values(appleProducts).map((p) => ({
        id: p.id,
        type: ProductType.PAID_SUBSCRIPTION,
        platform: Platform.APPLE_APPSTORE,
      })),
    )

    store.error((err) => console.error('StoreKit error:', err))

    store
      .when()
      .approved((transaction) => transaction.verify())
      .verified((receipt) => receipt.finish())

    store.initialize([Platform.APPLE_APPSTORE]).then(resolve, reject)
  })
  return storeInitPromise
}

export async function loadProducts() {
  await initStore()
  const { store } = window.CdvPurchase
  return Object.values(appleProducts).map((p) => store.get(p.id))
}

// Lance l'achat, puis fait valider le reçu côté serveur (Cloud Function
// `validateAppleReceipt`) pour poser le rôle Firestore/claims correspondant
// — même mécanisme que le webhook Stripe côté web (voir functions/index.js).
export async function purchase(productKey) {
  const product = appleProducts[productKey]
  if (!product) throw new Error(`Produit inconnu : ${productKey}`)
  if (!currentUser.value) throw new Error('Connexion requise.')

  await initStore()
  const { store } = window.CdvPurchase
  const offer = store.get(product.id)?.getOffer()
  if (!offer) throw new Error('Offre indisponible.')

  await new Promise((resolve, reject) => {
    store
      .when()
      .receiptUpdated(async (receipt) => {
        try {
          await syncReceiptWithServer(receipt)
          resolve()
        } catch (err) {
          reject(err)
        }
      })
    offer.order().catch(reject)
  })
}

// Renvoie le dernier reçu au serveur pour re-synchroniser les droits — à
// appeler au démarrage de la page Abonnement (restauration des achats,
// exigée par Apple : bouton "Restaurer mes achats").
export async function restorePurchases() {
  await initStore()
  const { store } = window.CdvPurchase
  await store.restorePurchases()
  const receipt = store.localReceipts?.[0]
  if (receipt) await syncReceiptWithServer(receipt)
}

async function syncReceiptWithServer(receipt) {
  const receiptData = receipt?.nativeData?.appStoreReceipt || receipt?.transaction?.appStoreReceipt
  if (!receiptData) throw new Error('Reçu StoreKit introuvable.')
  const { getFunctionsInstance } = await import('./firebase.js')
  const functions = await getFunctionsInstance()
  if (!functions) throw new Error('Firebase non configuré.')
  const { httpsCallable } = await import('firebase/functions')
  const fn = httpsCallable(functions, 'validateAppleReceipt')
  await fn({ receiptData })
}
