# Déploiement iOS App Store — État d'implémentation et étapes restantes

> Complète la section « Feuille de route : web → PWA → stores » de
> [README.md](README.md). Choix retenus : approche **Capacitor**, paiement
> **StoreKit natif direct** (pas de RevenueCat), bundle ID iOS
> `com.leggendo.app` (déjà dans `ios/App/App.xcodeproj`).
>
> Voir aussi [apkdoc.md](apkdoc.md) pour le pendant Android/Play Store,
> développé en parallèle. Les deux plateformes partagent `auth.js`, `tts.js`
> et une bonne partie de `PricingView.vue` (branché par
> `Capacitor.getPlatform()`), mais gardent chacune leur propre module
> d'achat (`src/lib/iap.js` pour iOS, `src/lib/billing.js` pour Android) et
> leur bundle/package ID natif (`com.leggendo.app` pour iOS,
> `ch.loicberthod.leggendo` pour Android — `capacitor.config.json` ne
> reflète que celui d'Android, sans conséquence : chaque plateforme a son
> identifiant réel dans son propre projet natif, généré indépendamment).

## 1. Ce qui a été implémenté (branche `claude/ios-appstore-apk-doc-ywtit7`)

### 1.1 Projet Xcode / Capacitor
- `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios` installés, projet
  initialisé (`capacitor.config.json`) et plateforme `ios/` générée
  (`npx cap add ios`).
- Script `npm run build:ios` (`vite build && npx cap sync ios`) et
  `npm run ios:open` (ouvre Xcode).
- Service worker PWA **désactivé en contexte natif** (`vite.config.js` :
  `injectRegister: false` + enregistrement conditionnel dans `src/main.js`
  via `Capacitor.isNativePlatform()`) — la WebView sert déjà les fichiers
  embarqués, un SW ferait doublon et pourrait interférer avec le cycle de
  mise à jour natif.

### 1.2 Icônes et splash screen
- Icône source 1024×1024 et splash 2732×2732 générés depuis
  `public/favicon.svg` (livre aux couleurs italiennes).
- Jeu complet d'icônes iOS + splash (clair/sombre) généré via
  `@capacitor/assets` dans `ios/App/App/Assets.xcassets/`.

### 1.3 Authentification native
- `src/lib/auth.js` : `loginWithGoogle()` bascule sur
  `@capacitor-firebase/authentication` (flux natif) quand
  `Capacitor.isNativePlatform()`, web inchangé (`signInWithPopup`).
- `loginWithApple()` ajouté (obligatoire, règle App Store 4.8 dès qu'une
  autre connexion sociale est proposée) et branché dans `LoginView.vue`,
  visible uniquement en app native.
- `src/lib/account.js` : réauthentification avant suppression de compte
  (`reauthenticateWithGoogle`/`reauthenticateWithApple`) adaptée au contexte
  natif ; `ProfileView.vue` gère désormais le fournisseur `apple.com`.
- Entitlement « Sign in with Apple » ajouté
  (`ios/App/App/App.entitlements`, référencé dans `project.pbxproj` via
  `CODE_SIGN_ENTITLEMENTS`).

### 1.4 Suppression de compte
- Déjà présente avant ce travail : `src/lib/account.js` (`deleteAccount`) +
  Cloud Function `deleteAccount` (`functions/index.js`) + UI dans
  `ProfileView.vue`. Aucune modification nécessaire, juste vérifiée et
  étendue au fournisseur Apple (réauthentification).

### 1.5 TTS natif
- `src/tts.js` réécrit : détecte `Capacitor.isNativePlatform()` et utilise
  `@capacitor-community/text-to-speech` en natif, Web Speech API sur le web.
  Limitation documentée dans le code : le plugin natif n'expose pas de vraie
  pause/reprise (pause = stop côté natif).

### 1.6 Paiement in-app (StoreKit natif, sans RevenueCat)
- `cordova-plugin-purchase` installé (compatible Capacitor) — pont natif
  StoreKit/Play Billing, pas de service tiers de gestion d'abonnement.
- `src/lib/iap.js` : déclaration des 6 produits d'abonnement
  (Premium/Premium IA/Enseignant × mensuel/annuel), initialisation du store,
  achat, restauration, synchronisation du reçu avec le serveur.
- `functions/roles.mjs` : `APPLE_PRODUCT_ROLE_MAP` (Product ID → rôle),
  symétrique de `PRICE_ROLE_MAP` pour Stripe.
- `functions/index.js` : Cloud Function `validateAppleReceipt` — valide le
  reçu StoreKit auprès d'Apple (`verifyReceipt`, gère bascule sandbox/prod)
  et pose le rôle Firestore/claims via `applyRole`, comme le fait déjà le
  webhook Stripe.
- `PricingView.vue` : bascule automatiquement entre Stripe (web) et StoreKit
  (app native) au clic sur « S'abonner » ; bouton « Restaurer mes achats »
  ajouté (exigé par Apple).

## 2. Ce qui reste à faire — nécessite un Mac + Xcode + comptes Apple

Rien de ce qui suit ne peut être fait depuis cet environnement Linux
(pas d'Xcode, pas de compte Apple Developer/App Store Connect configuré).

### 2.1 Comptes et accès
- [ ] Créer/activer un compte **Apple Developer Program** (99 $/an).
- [ ] Créer l'app dans **App Store Connect** avec le bundle ID
      `com.leggendo.app` (ou l'identifiant réellement choisi).
- [ ] Générer le **secret partagé App-Specific** (App Store Connect →
      Utilisateurs et accès → Clés → Secret partagé) et le déployer :
      `firebase functions:secrets:set APPLE_SHARED_SECRET`.

### 2.2 Firebase / Google Sign-In
- [ ] Ajouter une app iOS dans la Console Firebase, télécharger
      `GoogleService-Info.plist` et le glisser dans `ios/App/App/` via
      Xcode (« Copy items if needed »).
- [ ] Dans `ios/App/App/Info.plist`, remplacer
      `REPLACE_WITH_REVERSED_CLIENT_ID` par la valeur `REVERSED_CLIENT_ID`
      de ce même fichier (schéma d'URL requis pour le retour OAuth Google).
- [ ] Activer le fournisseur **Apple** dans Firebase Auth (Console Firebase
      → Authentication → Sign-in method).

### 2.3 Xcode
- [ ] Ouvrir `npm run ios:open`, configurer le **signing** (équipe Apple
      Developer, certificats, provisioning profiles — `Automatic` est déjà
      activé dans `project.pbxproj`).
- [ ] Vérifier que la capacité **Sign in with Apple** apparaît dans
      « Signing & Capabilities » (le fichier `App.entitlements` est déjà
      référencé ; si Xcode ne la détecte pas automatiquement, l'ajouter via
      le bouton « + Capability »).
- [ ] `pod install` si CocoaPods est utilisé par certains plugins (sinon
      Capacitor utilise Swift Package Manager, déjà configuré dans
      `ios/App/CapApp-SPM/`).

### 2.4 App Store Connect — produits d'achat intégré
- [ ] Créer les 6 abonnements auto-renouvelables avec **exactement** ces
      Product ID (doivent matcher `src/lib/iap.js` et
      `functions/roles.mjs`) :
      `com.leggendo.app.premium.monthly`, `com.leggendo.app.premium.annual`,
      `com.leggendo.app.premiumplus.monthly`,
      `com.leggendo.app.premiumplus.annual`,
      `com.leggendo.app.enseignant.monthly`,
      `com.leggendo.app.enseignant.annual`.
- [ ] Renseigner prix, groupe d'abonnement, période d'essai éventuelle.
- [ ] Tester les achats en environnement **Sandbox** (compte testeur
      Sandbox App Store Connect) avant soumission.

### 2.5 Conformité / fiche App Store
- [ ] **Privacy Nutrition Labels** : données collectées via Firebase Auth
      (email) et Firestore (progression de lecture, textes créés).
- [ ] Politique de confidentialité accessible par URL publique.
- [ ] CGU/CGV mentionnant le renouvellement automatique des abonnements
      (obligatoire pour tout IAP).
- [ ] Captures d'écran (6.7", 6.5", iPad si supporté), description,
      mots-clés, catégorie **Éducation**, classification d'âge.
- [ ] Compte de démonstration pour les reviewers Apple (accès Premium sans
      paiement réel).

### 2.6 Build & soumission
- [ ] `npm run build:ios`, archive dans Xcode (Product → Archive).
- [ ] Validation puis upload vers App Store Connect (Xcode Organizer ou
      Transporter).
- [ ] Soumission pour review.

## 3. Vérifications déjà faites dans cet environnement

- `npm run build` : ✅ (build web inchangé, aucune régression).
- `npx cap add ios` / `npx cap sync ios` : ✅ (projet Xcode généré, 3 plugins
  natifs détectés : `@capacitor-firebase/authentication`,
  `@capacitor-community/text-to-speech`, `cordova-plugin-purchase`).
- `node --check` sur `functions/index.js` et `functions/roles.mjs` : ✅
  (syntaxe valide — non déployé, nécessite les secrets Stripe/Apple).

Aucun test sur device ou simulateur iOS n'a pu être fait (pas d'Xcode dans
cet environnement) : à valider en priorité une fois sur Mac, en particulier
le flux d'achat StoreKit en Sandbox et Sign in with Apple.

## 4. Notes

- iOS reste plus strict qu'Android sur le paiement et l'auth native ; les
  chantiers de la section 2 sont incontournables pour passer la review
  Apple, contrairement à un premier APK Android.
- Le web (Stripe) n'est pas affecté : `stripe.js` reste utilisé tel quel
  hors contexte natif.
