// Google Play Billing (achats in-app) — utilisé uniquement sur mobile natif
// (Capacitor/Android). Sur le web, l'abonnement passe par Stripe
// (src/lib/stripe.js) : Google interdit le paiement Stripe pour du contenu
// numérique consommé dans l'app, d'où ce circuit séparé. Voir apkdoc.md,
// § Google Play Billing, pour la procédure de configuration côté Play
// Console (créer les souscriptions avec ces mêmes ID produit).
//
// cordova-plugin-purchase expose son API sur `window.CdvPurchase` (pas de
// module ESM) — chargé uniquement sur mobile natif via `cap sync`.

import { Capacitor } from '@capacitor/core'
import { getFunctionsInstance } from './firebase.js'

export const PRODUCTS = [
  'premium_monthly',
  'premium_annual',
  'premium_plus_monthly',
  'premium_plus_annual',
  'enseignant_monthly',
  'enseignant_annual',
]

export const billingSupported = Capacitor.isNativePlatform()

let initPromise = null

// Vérifie l'achat côté serveur (Cloud Function verifyPlayPurchase, qui
// interroge l'API Android Publisher) avant de considérer la transaction
// terminée — ne jamais faire confiance à un jeton d'achat non revérifié.
async function verifyAndFinish(transaction) {
  const productId = transaction.products?.[0]?.id
  const purchaseToken =
    transaction.nativePurchase?.purchaseToken || transaction.purchaseId
  if (!productId || !purchaseToken) {
    console.warn('Transaction Play Billing incomplète, ignorée.', transaction)
    return
  }
  const functions = await getFunctionsInstance()
  const { httpsCallable } = await import('firebase/functions')
  const verifyPlayPurchase = httpsCallable(functions, 'verifyPlayPurchase')
  await verifyPlayPurchase({ productId, purchaseToken })
  await transaction.finish()
}

// Enregistre les produits et démarre le store. Idempotent : sûr à appeler
// plusieurs fois (ex. à chaque affichage de la page Abonnement).
export function initBilling() {
  if (!billingSupported) return Promise.resolve(null)
  if (initPromise) return initPromise

  initPromise = import('cordova-plugin-purchase').then(() => {
    const { store, ProductType, Platform } = window.CdvPurchase

    store.register(
      PRODUCTS.map((id) => ({
        id,
        type: ProductType.PAID_SUBSCRIPTION,
        platform: Platform.GOOGLE_PLAY,
      }))
    )

    store
      .when()
      .approved((transaction) => verifyAndFinish(transaction))
      .finished((transaction) => {
        console.info('Achat finalisé :', transaction.products?.[0]?.id)
      })

    store.error((err) => {
      console.error('Erreur Play Billing :', err)
    })

    return store.initialize([Platform.GOOGLE_PLAY])
  })

  return initPromise
}

// Lance l'achat d'un produit (déclenche la feuille de paiement native
// Google Play). `productId` doit être l'un de PRODUCTS.
export async function purchase(productId) {
  if (!billingSupported) throw new Error('Play Billing indisponible (web).')
  await initBilling()
  const { store } = window.CdvPurchase
  const product = store.get(productId)
  if (!product) throw new Error('Produit inconnu : ' + productId)
  const offer = product.getOffer()
  if (!offer) throw new Error('Aucune offre disponible pour : ' + productId)
  await store.order(offer)
}
