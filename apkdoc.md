# Leggendo → APK / Google Play : analyse et plan de déploiement

Ce document analyse l'état actuel du projet **Leggendo** (web Vue 3 + PWA)
et liste ce qu'il faut faire, concrètement, pour produire un APK/AAB
publiable sur le Google Play Store. Il complète — sans le remplacer — le
paragraphe « Phase 3 — Stores » du [README.md](README.md#phase-3--stores-apk--ipa-via-capacitor),
qui reste la source de vérité sur la stratégie produit.

Rédigé le 2026-07-26 après lecture du code (`src/`, `vite.config.js`,
`package.json`, `firebase.js`, `auth.js`, `tts.js`, `stripe.js`).

## 1. État actuel

Le projet est une **PWA** (Vue 3 + Vite + `vite-plugin-pwa`), pas une app
native, et **aucun outillage mobile n'est présent** :

- Pas de Capacitor, Cordova, ou dossier `android/` dans le repo.
- Pas de dépendance `@capacitor/*` dans `package.json`.
- Le manifest PWA (`vite.config.js:143-160`) n'a qu'une seule icône
  **SVG** (`/favicon.svg`) — Android exige des PNG à plusieurs résolutions
  pour l'icône de lancement et l'icône adaptative.
- L'app tourne 100 % côté client, contenu premium excepté (servi par
  Firestore après vérification du rôle), avec un petit serveur Node sur
  VPS (`leggendo-server/`) pour « Créer son texte ».

**Conclusion : le projet n'est pas prêt à être packagé.** Il faut d'abord
intégrer Capacitor, puis résoudre plusieurs incompatibilités WebView
identifiées ci-dessous avant de pouvoir générer un APK/AAB fonctionnel.

## 2. Bloquants techniques identifiés (à corriger avant build)

| # | Bloquant | Fichier | Détail |
|---|---|---|---|
| 1 | **Google Sign-In via popup** | `src/lib/auth.js:113-114` | `signInWithPopup(auth, new GoogleAuthProvider())` — les popups n'existent pas dans une WebView Android. Il faut `@capacitor-firebase/authentication` (plugin natif Google Sign-In) ou, a minima, brancher `signInWithRedirect` avec un fallback natif via `Capacitor.isNativePlatform()`. |
| 2 | **Synthèse vocale (TTS)** | `src/tts.js` | Entièrement basé sur `window.speechSynthesis` (Web Speech API). Cette API **n'existe pas** dans la WebView Android système (elle n'est disponible que dans Chrome plein écran). Sans correctif, la lecture audio — fonctionnalité phare de l'app — sera silencieuse sur mobile natif. Il faut `@capacitor-community/text-to-speech`, activé conditionnellement (`Capacitor.isNativePlatform()`), en gardant `speakItalian`/`stopSpeaking`/`pauseSpeaking`/`resumeSpeaking` comme façade commune. |
| 3 | **Paiement Stripe** | `src/lib/stripe.js` | Les Payment Links Stripe pointent vers le web. Apple interdit systématiquement ce circuit pour du contenu numérique in-app ; **Google est plus tolérant mais l'exige aussi pour les abonnements consommés dans l'app** (Politique Paiements et abonnements du Play Store). Deux options : (a) ne PAS exposer d'écran d'abonnement dans l'APK — renvoyer vers le site web pour s'abonner (lecture seule dans l'app pour les comptes déjà premium), ce qui reste conforme ; ou (b) intégrer Google Play Billing (`@capacitor-community/in-app-purchases` ou RevenueCat). L'option (a) est nettement plus rapide pour un premier envoi. |
| 4 | **Icônes PWA incomplètes** | `vite.config.js:152-159` | Une seule icône SVG `any/any`. Android (via Capacitor) a besoin d'un jeu de PNG (icône adaptative 108×108dp avec zone de sécurité 66×66dp, plus les tailles legacy 48–512px) et d'un icône Play Store 512×512 PNG 32-bit. À générer depuis `public/favicon.svg`. |
| 5 | **App Check / reCAPTCHA v3** | `src/lib/firebase.js:23,42-53` | reCAPTCHA v3 (`ReCaptchaV3Provider`) suppose un contexte navigateur avec rendu du widget invisible ; dans une WebView ça fonctionne generalement mais avec des faux négatifs plus fréquents. À tester en conditions réelles ; prévoir de passer à `ReCaptchaEnterpriseProvider` ou au provider natif (Play Integrity via `@capacitor-firebase/app-check`) si le taux d'échec est trop élevé. |
| 6 | **Domaine autorisé Firebase Auth** | Console Firebase | Un WebView Capacitor sert l'app depuis `https://localhost` (scheme Capacitor par défaut) ou un scheme personnalisé, pas depuis `leggendo-*.web.app` / le domaine custom. Il faut ajouter ce domaine dans Firebase Console → Authentication → Settings → Authorized domains, sans quoi la connexion échoue silencieusement. |

## 3. Bloquants déjà résolus (bon point)

- **Suppression de compte** : implémentée (`src/views/ProfileView.vue`,
  `deleteAccount()` dans `src/lib/auth.js`) — obligation Google Play
  respectée. ✅
- **Fonctionnement hors ligne** : le catalogue gratuit est bundlé, le
  cache Firestore persistant (`firebase.js:109-131`) permet de relire un
  texte premium déjà ouvert hors connexion. Bon socle pour une app
  mobile. ✅
- **Chargement à la demande** (`import.meta.glob`, chunks par texte) :
  limite la taille du bundle initial, donc de l'APK. ✅

## 4. Plan de mise en œuvre

### Étape 0 — Pré-requis compte et outillage

- Compte Google Play Console (25 $, paiement unique).
- Android Studio + Android SDK (API 34+ recommandé, `minSdkVersion` 22+
  pour Capacitor 6/7) installés sur la machine qui buildera l'APK/AAB —
  **pas possible depuis ce conteneur sans SDK Android**, à faire en local
  ou via une CI (GitHub Actions avec `android-actions/setup-android`).
- Un keystore de signature (`.jks`), généré une fois et conservé
  précieusement (perte = impossibilité de mettre à jour l'app sur le
  Store).

### Étape 1 — Intégration Capacitor

```bash
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli
npx cap init "Leggendo" "ch.loicberthod.leggendo" --web-dir=dist
npx cap add android
```

- `appId` à choisir définitivement avant la première publication (non
  modifiable ensuite sans republier sous un nouvel identifiant).
- `capacitor.config.ts` : `webDir: 'dist'`, garder `server.androidScheme:
  'https'` (par défaut) pour que les cookies/IndexedDB Firestore se
  comportent comme sur le web.

### Étape 2 — Corriger les 3 bloquants WebView (section 2, #1–#3)

1. Ajouter `@capacitor-firebase/authentication`, brancher Google
   Sign-In natif derrière `Capacitor.isNativePlatform()` dans
   `src/lib/auth.js`, en gardant le chemin web (`signInWithPopup`)
   inchangé.
2. Ajouter `@capacitor-community/text-to-speech`, faire de `src/tts.js`
   une façade qui route vers le plugin natif sur mobile et vers
   `speechSynthesis` sur le web — signature des fonctions exportées
   inchangée pour ne pas toucher les appelants (`ReaderView`, etc.).
3. Dans l'APK v1 : masquer/adapter l'écran Abonnement pour rediriger
   vers le site web (pas de Payment Link Stripe cliqué dans la WebView).

### Étape 3 — Icônes et assets

- Générer les PNG depuis `public/favicon.svg` (Android Studio Image
  Asset Studio, ou `@capacitor/assets`) : icône adaptative
  (foreground/background 108×108dp), icône Play Store 512×512, splash
  screen.
- `npx @capacitor/assets generate --android` une fois les sources prêtes
  dans un dossier `assets/` (`icon.png` 1024×1024, `splash.png`
  2732×2732).

### Étape 4 — Config Firebase / réseau

- Ajouter le domaine Capacitor (`localhost` par défaut, ou domaine
  custom si configuré) aux domaines autorisés Firebase Auth.
- Vérifier `firestore.rules` et App Check en conditions WebView réelles
  (device physique ou émulateur), en particulier le flux `getAppCheckToken()`
  utilisé pour les appels `fetch` vers l'API VPS (`generation.js`).
- `leggendo-server/appcheck.mjs` : confirmer que le mode d'application
  (`enforce`) n'est pas activé tant que le taux de succès App Check en
  WebView n'est pas validé.

### Étape 5 — Build et test local

```bash
npm run build          # génère dist/
npx cap sync android
npx cap open android    # ouvre Android Studio
```

Dans Android Studio : lancer sur émulateur puis device physique, tester
le parcours complet — connexion (email + Google), lecture d'un texte,
clic-traduction, audio (TTS natif), quiz, mots favoris, Classici,
suppression de compte, comportement hors ligne (mode avion).

### Étape 6 — Signature et génération de l'AAB

Google Play exige un **Android App Bundle (.aab)**, pas un APK brut,
pour toute nouvelle app :

```bash
cd android
./gradlew bundleRelease
```

Signer avec le keystore de l'étape 0 (configuré dans
`android/app/build.gradle`, `signingConfigs`). Conserver le keystore et
son mot de passe hors du repo Git (`.gitignore` déjà présent — vérifier
qu'aucun `*.jks`/`*.keystore` n'y est jamais commité).

### Étape 7 — Fiche Play Store

- **Data Safety form** : lister précisément les données collectées
  (email, UID Firebase, progression de lecture stockée en localStorage +
  Firestore) — cf. tableau du README, ligne « Data Safety ».
- Politique de confidentialité (URL publique — vérifier si une page CGU
  existe déjà, sinon en écrire une avant soumission).
- Catégorie : Éducation. Classification de contenu (questionnaire IARC).
- Captures d'écran (téléphone obligatoire, tablette recommandé), icône
  512×512, image de présentation (feature graphic) 1024×500.

### Étape 8 — Soumission et revue

- Premier envoi en **test interne** (Play Console) avant production —
  permet de valider l'installation réelle sur des devices avant la revue
  publique.
- Délai de revue Google Play : généralement quelques heures à 2-3 jours
  pour une première soumission.

## 5. Ce qui peut attendre une v2

- Paiement in-app complet (Google Play Billing) pour vendre l'abonnement
  directement dans l'app, une fois la traction validée (cf. README,
  Phase 1).
- Notifications push (pas de besoin identifié dans le produit actuel).
- Version iOS (IPA) : nécessite en plus Sign in with Apple (règle 4.8) et
  un compte Apple Developer (99 $/an) — hors périmètre de ce document,
  qui couvre uniquement Android/Play Store comme demandé.

## 6. Résumé — check-list avant premier APK/AAB

- [ ] Capacitor installé, `npx cap add android` fait, projet buildable
- [ ] Google Sign-In natif (plus de `signInWithPopup` en mobile)
- [ ] TTS natif branché (plus de dépendance à `speechSynthesis` en mobile)
- [ ] Écran Abonnement adapté (pas de lien de paiement web cliquable dans l'APK)
- [ ] Icônes PNG + splash screen générés
- [ ] Domaine Capacitor ajouté aux domaines autorisés Firebase Auth
- [ ] App Check validé en conditions WebView réelles
- [ ] Test manuel complet sur device physique (parcours listé Étape 5)
- [ ] Keystore de signature généré et sauvegardé en lieu sûr
- [ ] AAB signé généré (`bundleRelease`)
- [ ] Politique de confidentialité publiée et liée
- [ ] Data Safety form rempli dans Play Console
- [ ] Test interne Play Console avant soumission publique
