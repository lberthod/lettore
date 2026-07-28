# Leggendo → APK / Google Play : analyse et suivi de déploiement

Mise à jour le 2026-07-26. Ce document remplace la version d'analyse initiale :
le travail de code décrit en section 1 est **fait et commité**. Les sections
suivantes listent précisément ce qui reste — et pourquoi certaines étapes
n'ont pas pu être terminées depuis cet environnement.

> Voir aussi [apk doc.md](apk%20doc.md) pour le pendant iOS/App Store,
> développé en parallèle et fusionné avec ce travail Android. `auth.js`,
> `tts.js` et `PricingView.vue` gèrent maintenant les deux plateformes.

## 0. Résumé — ce qui bloque encore un envoi sur le Play Store

1. **Aucun SDK Android ni build Gradle n'a pu tourner ici** : le dépôt Maven
   Google (`dl.google.com`), nécessaire au plugin Gradle Android lui-même,
   est refusé par la politique réseau de cet environnement (403). Le build
   (`gradlew bundleRelease`) doit être lancé ailleurs — poste local avec
   Android Studio, ou CI (voir § 4).
2. **`google-services.json` manquant** : à télécharger depuis la Console
   Firebase après y avoir enregistré l'app Android (package
   `ch.loicberthod.leggendo`) — nécessite ton compte Firebase.
3. **Souscriptions Google Play non créées** : le code d'achat in-app est en
   place mais ne peut rien vendre tant que les produits n'existent pas dans
   Play Console (nécessite le compte Play Console, 25 $).
4. **Clé de signature générée ici** : `leggendo-release.jks` t'a été envoyée
   directement dans le chat (fichier + mot de passe). **Sauvegarde-la
   immédiatement** — ce conteneur est éphémère, une fois la session
   terminée elle est perdue si tu ne l'as pas récupérée.

## 1. Ce qui a été fait (commité sur `claude/apk-playstore-deployment-rzueus`)

### Intégration Capacitor
- `npx cap init` + `npx cap add android` → dossier `android/` créé et
  committé (projet Gradle standard, `appId: ch.loicberthod.leggendo`).
- `capacitor.config.json` (pas `.ts` — la résolution TS du CLI Capacitor
  échouait avec `"type": "module"` dans `package.json` ; JSON est
  fonctionnellement identique et plus simple ici).

### Bloquant #1 résolu — Google Sign-In natif
- `src/lib/auth.js` : `loginWithGoogle()` bascule sur
  `@capacitor-firebase/authentication` (Google Sign-In natif Android) quand
  `Capacitor.isNativePlatform()`, puis rejoue l'identifiant obtenu dans le
  SDK JS Firebase via `signInWithCredential` — le reste de l'app
  (`onAuthStateChanged`, `currentUser`, règles Firestore) continue de
  fonctionner à l'identique. `logout()` déconnecte aussi le SDK natif.
- **Reste à faire (toi, dans la Console Firebase)** : une fois
  `google-services.json` téléchargé et l'empreinte SHA-1/SHA-256 du
  keystore (voir § 3) ajoutée à l'app Android dans Firebase, le Google
  Sign-In natif doit fonctionner sans changement de code.

### Bloquant #2 résolu — TTS natif
- `src/tts.js` : réécrit pour utiliser
  `@capacitor-community/text-to-speech` (moteur TTS Android natif) sur
  mobile, `speechSynthesis` sur le web. Même API exportée
  (`speakItalian`/`stopSpeaking`/`pauseSpeaking`/`resumeSpeaking`/`ttsSupported`),
  aucune vue n'a eu besoin d'être modifiée.
- **Limite assumée** : Android TTS n'a pas de pause/reprise native
  (contrairement à `speechSynthesis`) — `pauseSpeaking()` fait un arrêt
  complet sur mobile, `resumeSpeaking()` y est un no-op. À vérifier à
  l'usage ; acceptable pour un premier envoi.

### Bloquant #3 résolu — paiement (Google Play Billing, pas Stripe dans l'app)
- `functions/roles.mjs` : `PLAY_PRODUCT_ROLE_MAP` + `roleForProductId()`,
  miroir de `PRICE_ROLE_MAP`/`roleForPriceId()` existant pour Stripe.
- `functions/index.js` : nouvelle fonction callable `verifyPlayPurchase` —
  reçoit `productId` + `purchaseToken` du client, vérifie l'achat auprès de
  l'API Android Publisher (jamais confiance dans un jeton côté client seul),
  puis pose le rôle Firebase (même `applyRole()` que le webhook Stripe).
- `functions/package.json` : dépendance `googleapis` ajoutée.
- `src/lib/billing.js` (nouveau) : wrapper autour de `cordova-plugin-purchase`
  — enregistre les 6 produits (`premium_monthly`, `premium_annual`,
  `premium_plus_monthly`, `premium_plus_annual`, `enseignant_monthly`,
  `enseignant_annual`), lance l'achat, appelle `verifyPlayPurchase` avant de
  finaliser la transaction.
- `src/lib/stripe.js` : chaque formule a maintenant un `productId` en plus du
  `paymentLink` Stripe.
- `src/views/PricingView.vue` : sur mobile natif, le bouton « S'abonner »
  déclenche Play Billing au lieu de rediriger vers un lien de paiement web
  (interdit par Google pour du contenu numérique in-app).
- **Reste à faire (toi, dans Play Console)** : créer les 6 souscriptions
  avec **exactement** ces ID produit (Monétiser → Produits → Abonnements),
  et exécuter `firebase functions:secrets:set GOOGLE_PLAY_SERVICE_ACCOUNT`
  avec la clé JSON d'un compte de service Play Console (rôle *Voir les
  infos financières, gérer les commandes et rembourser les abonnements* au
  minimum) — voir Play Console → Configuration de l'API.
- **Limite assumée (v2)** : le renouvellement/l'annulation automatiques
  hors ouverture de l'app ne sont pas couverts (demanderait les *Real-time
  Developer Notifications*, Pub/Sub) — le rôle est revérifié à chaque achat
  ou réouverture, ce qui suffit pour un lancement.

### Icônes et splash screen
- `assets/icon.png` (1024×1024) et `assets/splash.png` (2732×2732) générés
  depuis `public/favicon.svg` via `sharp` (rasterisation SVG→PNG).
- `npx capacitor-assets generate --android` a produit tous les mipmaps
  (icône adaptative + legacy) et les splash screens (clair/sombre,
  portrait/paysage) dans `android/app/src/main/res/`.

### Config Android / Firebase
- `strings.xml`, `AndroidManifest.xml`, permission `INTERNET` : générés par
  défaut par `cap add android`, corrects tels quels.
- `android/app/build.gradle` : applique déjà conditionnellement le plugin
  `google-services` seulement si `google-services.json` existe (patch
  automatique du plugin `@capacitor-firebase/authentication`) — le projet
  compile sans, mais le Google Sign-In natif ne fonctionnera qu'une fois le
  fichier ajouté.
- Domaine Capacitor à ajouter dans Firebase Console → Authentication →
  Settings → Authorized domains (voir § 2).

### Signature de release
- `android/keystore/leggendo-release.jks` généré (RSA 2048, validité
  ~27 ans), alias `leggendo`. **Envoyé directement dans le chat** avec son
  mot de passe (`keystore-credentials.txt`) — à sauvegarder ailleurs
  immédiatement, ni le fichier ni le mot de passe ne sont commités dans Git.
- `android/keystore.properties` (gitignoré) référence le keystore ;
  `android/app/build.gradle` configure `signingConfigs.release`
  automatiquement s'il est présent, sans casser le build s'il est absent
  (utile en CI avant que le secret y soit configuré).
- Empreintes du certificat (à ajouter dans Firebase Console et Play Console) :
  - SHA1 : `2B:FA:D1:3B:D1:C3:5C:92:2F:63:58:FD:DA:F4:7F:93:7A:31:01:3A`
  - SHA256 : `14:79:D0:9D:A6:99:33:22:4E:16:48:5A:C9:C6:BA:0C:F7:FC:21:D1:57:20:AC:39:73:B1:CC:14:02:7E:04:64`

### Build web + sync
- `npm run build` (470 pages prérendues, `dist/` ≈ 14 Mo) et
  `npx cap sync android` exécutés avec succès — le projet Android embarque
  bien le dernier build web.
- `npm test` (26 tests) passe toujours après les changements.

## 2. Pourquoi le build Android n'a pas pu être terminé ici

Tentative de build (`./gradlew help`) :

```
Could not resolve com.android.tools.build:gradle:8.13.0.
  Could not GET 'https://dl.google.com/dl/android/maven2/...'.
  Received status code 403 from server: Forbidden
```

`dl.google.com` sert à la fois le SDK Android et le dépôt Maven Google
(classpath du plugin Gradle Android, `androidx.*`, Google Play Billing...) —
c'est un blocage de la politique réseau de cet environnement d'exécution
distant, pas un problème de configuration du projet. Le build doit se faire
sur une machine (locale ou CI) avec accès à `dl.google.com`.

## 3. Ce qu'il te reste à faire, dans l'ordre

1. **Sauvegarder le keystore** envoyé dans le chat
   (`leggendo-release.jks` + mot de passe) dans un coffre-fort de mots de
   passe. Sans lui, impossible de publier une mise à jour de l'app plus tard.
2. **Cloner/récupérer la branche** `claude/apk-playstore-deployment-rzueus`
   en local, replacer `keystore.properties` à la racine de `android/` et
   `leggendo-release.jks` dans `android/keystore/` (tous deux gitignorés,
   à toi de les gérer).
3. **Firebase Console** :
   - Ajouter une app Android (package `ch.loicberthod.leggendo`, empreinte
     SHA-1 ci-dessus) au projet `leggendo-dbb84`.
   - Télécharger `google-services.json`, le placer dans `android/app/`.
   - Authentication → Settings → Authorized domains : ajouter le domaine
     utilisé par la WebView Capacitor (`localhost` par défaut avec
     `androidScheme: https`).
4. **Build local** (Android Studio installé, ou `sdkmanager` en ligne de
   commande) :
   ```bash
   npm run build
   npx cap sync android
   cd android
   ./gradlew bundleRelease   # produit android/app/build/outputs/bundle/release/app-release.aab
   ```
   Tester d'abord sur émulateur/device (`npx cap open android` → Run) :
   connexion Google, lecture, traduction, audio (TTS natif), quiz, mots
   favoris, Classici, suppression de compte, mode avion.
5. **Play Console** (compte 25 $, une fois) :
   - Créer l'app, remplir le *Data Safety form* (email, UID Firebase,
     progression de lecture stockée localement + Firestore).
   - Monétiser → Produits → Abonnements : créer les 6 souscriptions avec
     les ID exacts listés en § 1 (Google Play Billing).
   - Configuration de l'API → créer un compte de service, exporter sa clé
     JSON, puis :
     ```bash
     firebase functions:secrets:set GOOGLE_PLAY_SERVICE_ACCOUNT
     # coller le contenu du fichier JSON
     firebase deploy --only functions:verifyPlayPurchase
     ```
   - Politique de confidentialité publiée et liée (vérifier si une page CGU
     existe déjà dans `src/views/` — sinon l'écrire avant soumission).
   - Icône 512×512, feature graphic 1024×500, captures d'écran téléphone.
   - Uploader `app-release.aab` en **test interne** d'abord, valider
     l'installation réelle, puis promouvoir en production.

## 4. Alternative : builder via CI plutôt qu'en local

Si `dl.google.com` est accessible depuis GitHub Actions (généralement oui),
un workflow `android-actions/setup-android` + `gradlew bundleRelease` peut
remplacer l'étape 4 ci-dessus, avec le keystore et
`GOOGLE_PLAY_SERVICE_ACCOUNT` en secrets GitHub plutôt qu'en fichiers
locaux. Non mis en place dans cette session (pas demandé) — à faire si tu
préfères ce chemin plutôt qu'Android Studio en local.

## 5. Limites connues, assumées pour un premier envoi

- Pas de renouvellement/annulation automatique des souscriptions Play sans
  ouverture de l'app (pas de Real-time Developer Notifications) — v2.
- Pas de pause/reprise audio native sur Android (limite de l'API TTS
  Android elle-même) — `pauseSpeaking()` y arrête complètement la lecture.
- Version iOS (IPA) non traitée : hors périmètre demandé (Play Store
  uniquement). Nécessiterait en plus Sign in with Apple, compte Apple
  Developer (99 $/an) — voir README.md § Phase 3.
