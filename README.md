# Leggendo 🇮🇹

Application web de lecture pour apprendre l'italien : des textes gradués en italien, avec traduction française instantanée mot à mot ou phrase par phrase, lecture audio par synthèse vocale, quiz de compréhension et révision des mots favoris.

**Le catalogue fonctionne hors ligne côté client** — les traductions sont pré-générées dans les fichiers de textes, l'audio utilise la Web Speech API du navigateur, et la PWA met l'app et les textes en cache. Le seul service applicatif est le petit serveur Node du VPS qui alimente « Créer son texte ».

## Fonctionnalités

- 📚 **227 textes en italien**, du A1 au C2, classés sur deux dimensions : **genre** (récit, dialogue, poésie, fable, SF, giallo, théâtre, lettre/journal, documentaire, pratique) × **thème** (cuisine, voyages, montagne, histoire, société…) — taxonomie définie dans `src/texts/category.json`
- 🗂️ **Bibliothèque** avec filtres par niveau, genre et thème
- 👆 **Traduction au clic** : cliquer sur un mot affiche sa traduction française ; possibilité de traduire la phrase entière
- 🔊 **Lecture audio** en italien (voix it-IT via la Web Speech API), avec pause/reprise et trois vitesses
- ❓ **Quiz de compréhension** à la fin de chaque texte, ⭐ **mots favoris** avec répétition espacée (vue « Parole »)
- ✍️ **Créer son texte** : un utilisateur connecté demande un texte sur mesure (sujet, niveau, genre, taille) — généré par LLM sur le VPS, enregistré dans Firestore, retrouvable dans « Mes textes »
- 👤 **Comptes Firebase** (facultatifs) : 6 textes en aperçu gratuit pour les visiteurs, tout le catalogue une fois connecté
- 📱 **PWA installable** : service worker actif, app et textes disponibles hors ligne
- ⚡ **Chargement à la demande** : chaque texte est un chunk séparé (via `import.meta.glob`)

L'architecture détaillée (modules, flux de données, principes) est décrite dans [ARCHITECTURE.md](ARCHITECTURE.md). La stratégie de taxonomie du contenu est dans [ANALYSE_CATEGORIES.md](ANALYSE_CATEGORIES.md).

## Stack technique

- [Vue 3](https://vuejs.org/) + [Vue Router 4](https://router.vuejs.org/)
- [Vite 6](https://vite.dev/) + [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
- Firebase : Hosting (déploiement), Auth (comptes), Firestore (textes créés par les utilisateurs)
- Un serveur Node sans dépendance sur le VPS pour la génération à la demande ([leggendo-server/](leggendo-server/))

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
├── views/                  # Home, Library (bibliothèque), Reader, CreateText,
│                           # MyTexts, Words, Login/Profile, Pricing, Admin,
│                           # pages statiques (à-propos, méthode, CGU…)
├── components/             # TranslationOverlay, QuizSection, header/footer…
├── texts/
│   ├── index.json          # Index des textes (titre, niveau, genre, thème…)
│   ├── category.json       # Taxonomie : niveaux, tailles, genres, thèmes
│   └── *.json              # Un fichier par texte : paragraphes + lexique
├── lib/
│   ├── firebase.js/auth.js # Firebase (chargé à la demande si configuré)
│   ├── access.js           # Aperçu gratuit / accès connecté / admin
│   ├── generation.js       # État de la génération « Créer son texte »
│   ├── userTexts.js        # Persistance Firestore des textes créés
│   └── stripe.js           # Payment Links (freemium)
├── translate.js            # Recherche locale dans le lexique du texte
├── tts.js                  # Synthèse vocale (Web Speech API, voix italienne)
├── progress.js             # localStorage : lecture, favoris, préférences
├── router.js
└── main.js
generator/                  # Production du catalogue par LLM (GLM), cron VPS
leggendo-server/            # API « Créer son texte » sur le VPS
scripts/                    # Ancien pipeline Claude + publication Firestore
```

### Format d'un texte

Chaque fichier `src/texts/<id>.json` contient :

```json
{
  "id": "marco",
  "title": "La mattina di Marco",
  "level": "A1",
  "paragraphs": ["La mattina, Marco si sveglia presto…"],
  "words": { "mattina": "matin", "presto": "tôt" },
  "sentences": { "La mattina, Marco si sveglia presto.": "Le matin, Marco se réveille tôt." },
  "quiz": [ … ]
}
```

`src/texts/index.json` référence chaque texte (id, titre, niveau, extrait, nombre de mots, `genre`, `category`). Pour ajouter un texte à la main : créer le JSON avec son lexique complet, puis ajouter son entrée dans l'index — mais le plus simple est de passer par le générateur.

## Génération de contenu

Le catalogue est produit par LLM avec **couverture lexicale garantie** : chaque mot et chaque phrase du texte doit avoir sa traduction, vérifié avec le même découpage que le lecteur, sinon le texte est rejeté.

```bash
export GLM_API_KEY=...

npm run orchestrate:matrix:plan   # voir les cellules genre × thème × niveau manquantes
npm run orchestrate:matrix        # générer les textes manquants
npm run test:text -- --genre dialogo --theme cucina --level A2   # essayer sans rien écrire
```

Voir [generator/README.md](generator/README.md) (pipeline catalogue, cron VPS), [leggendo-server/README.md](leggendo-server/README.md) (génération à la demande des utilisateurs) et [scripts/README.md](scripts/README.md) (ancien pipeline Claude, publication Firestore).

## Feuille de route : web → PWA → stores

Une seule codebase Vue pour tout. Pas de réécriture native (Swift/Kotlin) : pour une app de lecture, Capacitor donne un résultat indiscernable du natif. Sur mobile, on ajoute des branchements par plateforme (`Capacitor.isNativePlatform()`), on ne remplace rien.

### Phase 1 — Lancement web (en cours)

- [x] Comptes Firebase + verrou d'accès (aperçu gratuit de 6 textes, catalogue complet connecté)
- [ ] Renseigner les Payment Links Stripe dans `src/lib/stripe.js` et déployer
- [ ] Valider la traction : est-ce que des visiteurs s'abonnent ?
- Le web reste le meilleur canal de vente : ~3 % de frais Stripe, contre 15–30 % de commission sur les stores.

### Phase 2 — PWA (fait)

- [x] `vite-plugin-pwa` activé : manifest + service worker (`autoUpdate`), app et textes en cache
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
