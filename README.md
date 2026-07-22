# Leggendo 🇮🇹

Application web de lecture pour apprendre l'italien : des textes gradués en italien, avec traduction française instantanée mot à mot ou phrase par phrase, et lecture audio par synthèse vocale.

**Tout fonctionne hors ligne côté client** — aucune API externe : les traductions sont pré-générées dans les fichiers de textes, et l'audio utilise la Web Speech API du navigateur.

## Fonctionnalités

- 📚 **24 textes en italien** de difficulté progressive : vie quotidienne, voyages, montagnes, histoire d'Italie (Rome antique, Renaissance, Risorgimento, miracle économique…)
- 👆 **Traduction au clic** : cliquer sur un mot affiche sa traduction française ; possibilité de traduire la phrase entière
- 🔊 **Lecture audio** en italien (voix it-IT via la Web Speech API), avec pause/reprise
- ⚡ **Chargement à la demande** : chaque texte est un chunk séparé (via `import.meta.glob`)
- 📱 Interface simple, navigation texte précédent / suivant

L'architecture détaillée (modules, flux de données, principes) est décrite dans [ARCHITECTURE.md](ARCHITECTURE.md).

## Stack technique

- [Vue 3](https://vuejs.org/) + [Vue Router 4](https://router.vuejs.org/)
- [Vite 6](https://vite.dev/)
- Firebase Hosting pour le déploiement

## Démarrage

```bash
npm install
npm run dev
```

L'application est disponible sur http://localhost:5173.

### Build et déploiement

```bash
npm run build
firebase deploy
```

Le build est généré dans `dist/`, servi par Firebase Hosting (SPA avec rewrite vers `index.html`).

## Structure du projet

```
src/
├── views/
│   ├── HomeView.vue        # Liste des textes
│   └── ReaderView.vue      # Lecteur : découpage en phrases/mots, TTS
├── components/
│   └── TranslationOverlay.vue  # Bulle de traduction
├── texts/
│   ├── index.json          # Index des textes (titre, extrait, nb de mots)
│   └── *.json              # Un fichier par texte : paragraphes + lexique
├── translate.js            # Recherche locale dans le lexique du texte
├── tts.js                  # Synthèse vocale (Web Speech API, voix italienne)
├── router.js
└── main.js
```

### Format d'un texte

Chaque fichier `src/texts/<id>.json` contient :

```json
{
  "id": "marco",
  "title": "La mattina di Marco",
  "paragraphs": ["La mattina, Marco si sveglia presto…"],
  "words": { "mattina": "matin", "presto": "tôt" },
  "sentences": { "La mattina, Marco si sveglia presto.": "Le matin, Marco se réveille tôt." }
}
```

Pour ajouter un texte : créer le fichier JSON avec son lexique, puis ajouter une entrée dans `src/texts/index.json`.

## Feuille de route : web → PWA → stores

Une seule codebase Vue pour tout. Pas de réécriture native (Swift/Kotlin) : pour une app de lecture, Capacitor donne un résultat indiscernable du natif. Sur mobile, on ajoute des branchements par plateforme (`Capacitor.isNativePlatform()`), on ne remplace rien.

### Phase 1 — Lancement web (en cours)

- [ ] Renseigner les Payment Links Stripe dans `src/lib/stripe.js` et déployer
- [ ] Valider la traction : est-ce que des visiteurs s'abonnent ?
- Le web reste le meilleur canal de vente : ~3 % de frais Stripe, contre 15–30 % de commission sur les stores.

### Phase 2 — PWA (rapide, sans stores)

- [ ] Activer `vite-plugin-pwa` (déjà installé) : manifest + service worker
- Installation depuis le navigateur sur Android et iOS, textes hors ligne, zéro commission.

### Phase 3 — Stores (APK / IPA via Capacitor)

À lancer seulement une fois la traction validée. Prérequis de conformité identifiés :

| Chantier | Pourquoi |
|---|---|
| Paiement in-app (RevenueCat / StoreKit / Play Billing) | Apple 3.1.1 et Google Play interdisent Stripe pour du contenu numérique dans l'app — Stripe reste pour le web |
| Auth native (`@capacitor-firebase/authentication`) | `signInWithPopup` ne fonctionne pas en WebView |
| Sign in with Apple | Règle Apple 4.8 : obligatoire dès qu'on propose Google Sign-In |
| Suppression de compte dans l'app | Exigée par Apple et Google pour toute app avec création de compte |
| TTS natif (`@capacitor-community/text-to-speech`) | `speechSynthesis` n'existe pas dans la WebView Android |
| Data Safety (Google) + Privacy Labels (Apple) | Formulaires à remplir : Firebase Auth, données de progression |

Coûts : compte Apple Developer 99 $/an, Google Play 25 $ (unique). Google Play est plus permissif — un premier APK peut passer avec seulement le paiement in-app et le TTS natif ; pour iOS, les quatre premiers chantiers sont nécessaires.
