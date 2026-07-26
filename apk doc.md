# Déploiement iOS App Store — Analyse et plan d'action

> Document de travail pour transformer Leggendo (PWA Vue 3) en application iOS
> distribuable sur l'App Store. Complète la section « Feuille de route : web →
> PWA → stores » de [README.md](README.md).

## 1. État actuel du projet

- **Stack** : Vue 3 + Vue Router 4 + Vite 6, PWA via `vite-plugin-pwa`
  (manifest + service worker `autoUpdate`, cache offline des textes).
- **Backend** : Firebase (Auth, Firestore, Hosting) + un petit serveur Node
  (`leggendo-server/`) pour la génération de textes à la demande.
- **Paiement** : Stripe Payment Links (freemium, 4 formules — voir
  [README_TARIFICATION.md](README_TARIFICATION.md)).
- **Aucun wrapper mobile natif** n'existe encore : pas de Capacitor, Cordova,
  React Native, ni dossier `ios/`/`android/`. Le PWA est installable sur iOS
  Safari (« Ajouter à l'écran d'accueil ») mais ce n'est pas un build App
  Store.
- **Icônes** : seul `public/favicon.svg` existe. Aucun jeu d'icônes PNG aux
  formats iOS (nécessaires pour Capacitor/Xcode et l'App Store).

## 2. Approche recommandée : Capacitor

Une seule codebase Vue, pas de réécriture native. Capacitor encapsule le
build Vite (`dist/`) dans une WebView native iOS et donne accès aux API
natives via des plugins (`Capacitor.isNativePlatform()` pour brancher du
code spécifique mobile sans dupliquer l'app).

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init leggendo com.leggendo.app --web-dir=dist
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios   # ouvre Xcode
```

## 3. Blocages techniques à corriger avant packaging

Ces points ont été identifiés en analysant `src/` — ils **cassent l'app**
dans une WebView native si non traités :

| Problème | Fichier | Impact | Solution |
|---|---|---|---|
| `signInWithPopup` (Google Sign-In) | `src/lib/auth.js` | Les popups OAuth web ne fonctionnent pas dans une WebView native | Migrer vers `@capacitor-firebase/authentication` (flux natif) |
| `speechSynthesis` (Web Speech API) | `src/tts.js` | API absente/instable en WebView | Utiliser `@capacitor-community/text-to-speech` |
| Paiement Stripe (Payment Links) | `src/lib/stripe.js` | Apple **interdit** (règle 3.1.1) un système de paiement tiers pour du contenu numérique consommé dans l'app | Implémenter In-App Purchase via **StoreKit** ou **RevenueCat**, garder Stripe uniquement pour le canal web |
| Pas de Sign in with Apple | `src/lib/auth.js` / vues Login | Règle Apple 4.8 : obligatoire dès qu'une autre connexion sociale (Google) est proposée | Ajouter `@capacitor-community/apple-sign-in` |
| Pas de suppression de compte in-app | vues Profile/Login | Exigé par Apple (et Google) pour toute app avec création de compte | Ajouter un flux « Supprimer mon compte » (Firestore + Firebase Auth `deleteUser`) |

## 4. Checklist de préparation App Store

### 4.1 Branchement Capacitor
- [ ] `npm install @capacitor/core @capacitor/cli @capacitor/ios`
- [ ] `npx cap init` + `npx cap add ios`
- [ ] Script npm dédié : `"build:ios": "vite build && npx cap sync ios"`
- [ ] Vérifier que le service worker PWA ne rentre pas en conflit avec la
      WebView Capacitor (désactiver le SW en contexte natif via
      `Capacitor.isNativePlatform()`)

### 4.2 Authentification & compte
- [ ] Remplacer `signInWithPopup` par `@capacitor-firebase/authentication`
- [ ] Ajouter Sign in with Apple (obligatoire, règle 4.8)
- [ ] Ajouter la suppression de compte dans l'app (Profile)

### 4.3 Paiement in-app
- [ ] Choisir StoreKit natif ou RevenueCat (recommandé pour simplifier la
      gestion des abonnements multi-plateformes)
- [ ] Créer les produits d'abonnement dans App Store Connect (Premium,
      Premium IA, Enseignant — mensuel)
- [ ] Adapter `src/lib/stripe.js` : Stripe pour le web only, IAP pour iOS natif
- [ ] Gérer la synchronisation des droits d'accès (Firestore) entre achat IAP
      et logique `access.js` existante

### 4.4 TTS natif
- [ ] Remplacer `speechSynthesis` par `@capacitor-community/text-to-speech`
      dans `src/tts.js`, avec fallback Web Speech API en contexte web

### 4.5 Icônes, splash screen, métadonnées
- [ ] Créer une icône source 1024×1024 (à partir de `favicon.svg`)
- [ ] Générer le jeu complet d'icônes iOS + splash screens : utiliser
      `@capacitor/assets` (`npx capacitor-assets generate`)
- [ ] Rédiger la fiche App Store : nom, sous-titre, description, mots-clés,
      captures d'écran (6.7", 6.5", iPad si supporté), catégorie
      (Éducation), classification d'âge

### 4.6 Confidentialité / conformité
- [ ] Remplir les **Privacy Nutrition Labels** (Apple) : données collectées
      via Firebase Auth (email) et Firestore (progression de lecture)
- [ ] Politique de confidentialité accessible (URL) — vérifier si déjà
      présente sur le site web, sinon la créer
- [ ] Vérifier CGU/CGV mentionnant les abonnements et leur renouvellement
      automatique (obligatoire pour IAP)

### 4.7 Build & soumission
- [ ] Compte Apple Developer Program actif (99 $/an)
- [ ] Configurer signing (certificats, provisioning profiles) dans Xcode
- [ ] Bundle ID cohérent (`com.leggendo.app` ou équivalent)
- [ ] Build archive Xcode → validation → upload via Xcode ou Transporter
- [ ] Soumission via App Store Connect, remplir toutes les métadonnées et
      captures d'écran
- [ ] Prévoir un compte de démonstration pour les reviewers Apple (accès aux
      fonctionnalités premium sans paiement réel)

## 5. Ordre de priorité suggéré

1. Authentification native (Apple + Google via Capacitor) — bloquant pour
   tout le reste.
2. In-App Purchase — bloquant réglementaire (règle 3.1.1), le plus long à
   mettre en place (RevenueCat simplifie mais demande intégration + tests).
3. TTS natif — fonctionnalité cœur de l'app (lecture assistée), à ne pas
   perdre en release.
4. Suppression de compte — rapide à implémenter, bloquant à la soumission.
5. Icônes/splash/métadonnées — travail de packaging, peut être fait en
   parallèle.
6. Privacy labels & conformité — à finaliser juste avant soumission.

## 6. Coûts et délais estimatifs

- Apple Developer Program : 99 $/an
- RevenueCat : gratuit jusqu'à 2 500 $ MRR, puis commission
- Développement estimé : 2 à 4 semaines pour un développeur familier de
  Capacitor, en fonction de la complexité de l'intégration IAP

## 7. Notes

- iOS est plus strict que Google Play sur les points 3 (paiement) et 4
  (auth native) : les quatre premiers chantiers du tableau §3 sont
  nécessaires pour iOS, alors qu'un premier APK Android peut passer avec
  seulement le paiement in-app et le TTS natif (cf. README.md).
- Ne pas lancer la phase Store avant d'avoir validé la traction commerciale
  sur le web (Stripe ~3 % de frais vs 15–30 % de commission App Store),
  comme indiqué dans la feuille de route du README.
