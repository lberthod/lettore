# Leggendo 🇮🇹

Application web de lecture pour apprendre l'italien : des textes gradués en italien, avec traduction française instantanée mot à mot ou phrase par phrase, lecture audio par synthèse vocale, quiz de compréhension et révision des mots favoris.

**Le catalogue fonctionne hors ligne côté client** — les traductions sont pré-générées dans les fichiers de textes, l'audio utilise la Web Speech API du navigateur, et la PWA met l'app et les textes en cache. Le seul service applicatif est le petit serveur Node du VPS qui alimente « Créer son texte ».

## Fonctionnalités

- 📚 **460 textes en italien**, du A1 au C2, classés sur deux dimensions : **genre** (récit, dialogue, poésie, fable, SF, giallo, théâtre, lettre/journal, documentaire, pratique) × **thème** (cuisine, voyages, montagne, histoire, société…) — taxonomie définie dans `src/texts/category.json`
- 🗂️ **Bibliothèque** avec filtres par niveau, genre et thème
- 👆 **Traduction au clic** : cliquer sur un mot affiche sa traduction française ; possibilité de traduire la phrase entière
- 🔊 **Lecture audio** en italien (voix it-IT via la Web Speech API), avec pause/reprise et trois vitesses
- ❓ **Quiz de compréhension** à la fin de chaque texte, ⭐ **mots favoris** avec répétition espacée (vue « Parole »)
- ✍️ **Créer son texte** : un utilisateur connecté demande un texte sur mesure (sujet, niveau, genre, taille) — généré par LLM sur le VPS, enregistré dans Firestore, retrouvable dans « Mes textes »
- 👤 **Comptes Firebase** (facultatifs) : 6 textes en aperçu gratuit pour les visiteurs, catalogue complet réservé à Premium et au-dessus
- 📖 **Classici** : 16 œuvres classiques du domaine public (texte authentique, non simplifié) — premier chapitre de chaque livre et 3 livres en entier (un par niveau A2/B2/C2) en aperçu gratuit dès la connexion, le reste réservé à Premium et au-dessus
- 📕 **Dizionario** *(pilote)* : dictionnaire italien-français (définition, nature grammaticale, exemples, synonymes) et tableaux de conjugaison complets, pré-générés et servis en statique — voir [analyse.md](analyse.md)
- 📱 **PWA installable** : service worker actif, app et textes disponibles hors ligne
- ⚡ **Chargement à la demande** : chaque texte est un chunk séparé (via `import.meta.glob`)

L'architecture détaillée (modules, flux de données, principes) est décrite dans [ARCHITECTURE.md](ARCHITECTURE.md).

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
│                           # MyTexts, Words, Dictionary, Conjugation, Verbs,
│                           # Login/Profile, Pricing, Admin,
│                           # pages statiques (à-propos, méthode, CGU…)
├── components/             # TranslationOverlay, QuizSection, header/footer…
├── texts/
│   ├── index.json          # Index des textes (titre, niveau, genre, thème…)
│   ├── category.json       # Taxonomie : niveaux, tailles, genres, thèmes
│   └── *.json              # Un fichier par texte : paragraphes + lexique
├── dictionary/              # Dizionario (pilote) : lemmes, conjugaisons,
│                           # index forme fléchie → lemme (JSON statique)
├── lib/
│   ├── firebase.js/auth.js # Firebase (chargé à la demande si configuré)
│   ├── access.js           # Aperçu gratuit / accès connecté / admin
│   ├── generation.js       # État de la génération « Créer son texte »
│   ├── userTexts.js        # Persistance Firestore des textes créés
│   ├── dictionary.js       # Lookup dans src/dictionary/ (aucun réseau)
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

## Classici : catalogue de livres

Section `/classici`, distincte des 460 textes gradués : des œuvres du domaine public en texte authentique (non simplifié), chapitre par chapitre, avec les mêmes fonctionnalités que le lecteur (traduction au clic, audio, quiz). Chaque livre est un manifeste `book.json` + un chunk JSON par chapitre dans `src/books/<id>/`, référencés dans `src/books/index.json`.

| Livre | Auteur | Niveau | Chapitres | Accès |
|---|---|---|---:|---|
| Le avventure di Pinocchio | Carlo Collodi | B1 | 36 | 1ᵉʳ chapitre gratuit |
| Cappuccetto Rosso | Fiaba popolare | A1 | 4 | 1ᵉʳ chapitre gratuit |
| Il gatto con gli stivali | Charles Perrault | A1 | 1 | 1ᵉʳ chapitre gratuit |
| Cenerentola | Adattamento tradizionale | A2 | 5 | **Gratuit** |
| La bella e la bestia | D'après Leprince de Beaumont | A2 | 5 | 1ᵉʳ chapitre gratuit |
| La cicala e la formica | Esopo | A1 | 1 | **Gratuit** |
| La colomba e la formica | Esopo | A1 | 1 | 1ᵉʳ chapitre gratuit |
| Il leone e il topo | Esopo | A1 | 1 | **Gratuit** |
| Rosso Malpelo | Giovanni Verga | B2 | 1 | **Gratuit** |
| Il Principe | Niccolò Machiavelli | C2 | 5 | **Gratuit** |
| Pollicino | Fiaba popolare | A2 | 5 | 1ᵉʳ chapitre gratuit |
| Pelle d'asino | D'après Charles Perrault | A2 | 5 | 1ᵉʳ chapitre gratuit |
| Inferno (Divina Commedia, sélection) | Dante Alighieri | C2 | 6 | 1ᵉʳ chapitre gratuit |
| La figlia del re | Racconto popolare italiano | A2 | 4 | 1ᵉʳ chapitre gratuit |
| Le novelle della nonna (sélection) | Emma Perodi | B2 | 5 | 1ᵉʳ chapitre gratuit |
| Il fu Mattia Pascal | Luigi Pirandello | C1 | 18 | 1ᵉʳ chapitre gratuit |

Règle d'accès (`src/lib/access.js`, `isFreeClassiciChapter`) : un compte connecté peut lire gratuitement le premier chapitre de chaque livre, plus 3 livres en entier — un par niveau A2 (*Cenerentola*), B2 (*Rosso Malpelo*) et C2 (*Il Principe*), en plus des fables A1 à chapitre unique (*La cicala e la formica*, *Il leone e il topo*, déjà couvertes par la règle du premier chapitre). Le reste de Classici est réservé aux formules **Premium** et au-dessus — voir [README_TARIFICATION.md](README_TARIFICATION.md).

## Feuille de route : web → PWA → stores

Une seule codebase Vue pour tout. Pas de réécriture native (Swift/Kotlin) : pour une app de lecture, Capacitor donne un résultat indiscernable du natif. Sur mobile, on ajoute des branchements par plateforme (`Capacitor.isNativePlatform()`), on ne remplace rien.

### Phase 1 — Lancement web (en cours)

- [x] Comptes Firebase + verrou d'accès (aperçu gratuit de 6 textes, catalogue complet connecté)
- [ ] Renseigner les Payment Links Stripe dans `src/lib/stripe.js` et déployer
- [ ] Valider la traction : est-ce que des visiteurs s'abonnent ?
- Le web reste le meilleur canal de vente : ~3 % de frais Stripe, contre 15–30 % de commission sur les stores.

### Tarification retenue pour le lancement

Les quatre formules seront disponibles ensemble dès l'ouverture des paiements :

- Gratuit : 0 €
- Premium : 7,90 €/mois
- Premium IA : 14,90 €/mois, avec 30 crédits de génération mensuels
- Enseignant : 24,90 €/mois, incluant Premium IA et les outils pédagogiques

Le périmètre fonctionnel, les règles de crédits, les droits d'accès et les
conditions de lancement sont définis dans
[README_TARIFICATION.md](README_TARIFICATION.md).

### Phase 2 — PWA (fait)

- [x] `vite-plugin-pwa` activé : manifest + service worker (`autoUpdate`), app et textes en cache
- Installation depuis le navigateur sur Android et iOS, textes hors ligne, zéro commission.

### Phase 3 — Stores (APK / IPA via Capacitor)

Le code est prêt côté iOS (projet Capacitor, voir [apk doc.md](apk%20doc.md)
pour le détail et les étapes manuelles restantes — comptes Apple, Xcode,
produits App Store Connect) :

| Chantier | Pourquoi | État |
|---|---|---|
| Paiement in-app (StoreKit natif) | Apple 3.1.1 et Google Play interdisent Stripe pour du contenu numérique dans l'app — Stripe reste pour le web | ✅ code (`src/lib/iap.js`, `functions/index.js`) — produits à créer dans App Store Connect |
| Auth native (`@capacitor-firebase/authentication`) | `signInWithPopup` ne fonctionne pas en WebView | ✅ code — `GoogleService-Info.plist` à ajouter dans Xcode |
| Sign in with Apple | Règle Apple 4.8 : obligatoire dès qu'on propose Google Sign-In | ✅ code + entitlement — fournisseur à activer dans Firebase Auth |
| Suppression de compte dans l'app | Exigée par Apple et Google pour toute app avec création de compte | ✅ déjà en place (`src/lib/account.js`) |
| TTS natif (`@capacitor-community/text-to-speech`) | `speechSynthesis` n'existe pas dans la WebView Android | ✅ code (`src/tts.js`) |
| Data Safety (Google) + Privacy Labels (Apple) | Formulaires à remplir : Firebase Auth, données de progression | ⏳ à faire dans App Store Connect / Play Console |

Coûts : compte Apple Developer 99 $/an, Google Play 25 $ (unique). Google Play est plus permissif — un premier APK peut passer avec seulement le paiement in-app et le TTS natif ; pour iOS, les quatre premiers chantiers sont nécessaires.
