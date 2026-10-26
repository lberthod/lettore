# Architecture — Leggendo

Ce document explique comment l'application est construite : ses principes, ses modules, et comment les données circulent. Pour la feuille de route (PWA, stores), voir le [README](README.md).

## Vue d'ensemble

Leggendo est une **SPA Vue 3 essentiellement statique** : pas d'API de traduction, pas de base de données obligatoire. Tout le catalogue (454 textes, lexiques, traductions de phrases) est pré-généré dans des fichiers JSON embarqués dans le build. Les services externes sont optionnels et chargés à la demande : Firebase Auth (comptes), Firestore (textes créés par les utilisateurs), Stripe (paiement) — l'app tourne sans eux si leur configuration n'est pas remplie. La seule pièce serveur applicative est l'API « Créer son texte » sur le VPS ([leggendo-server/](leggendo-server/)).

```
┌─────────────────────────── Navigateur ───────────────────────────┐
│                                                                  │
│  App.vue ── router.js ──┬── HomeView        (accueil)            │
│                         ├── LibraryView     (bibliothèque,       │
│                         │                    filtres niveau/     │
│                         │                    genre/thème)        │
│                         ├── ReaderView      (lecteur, lazy)      │
│                         │     ├── TranslationOverlay             │
│                         │     └── QuizSection                    │
│                         ├── CreateTextView  (« Créer son texte »)│
│                         ├── MyTextsView     (« Mes textes »)     │
│                         ├── WordsView       (mots favoris)       │
│                         ├── DictionaryView  (Dizionario, pilote) │
│                         ├── ConjugationView / VerbsView          │
│                         ├── LoginView / ProfileView              │
│                         ├── PricingView / AdminView              │
│                         └── pages statiques (à-propos, méthode,  │
│                                              CGU…)               │
│                                                                  │
│  translate.js       lexique local (aucune API)                   │
│  tts.js             Web Speech API (voix it-IT du système)       │
│  progress.js        localStorage (lecture, favoris, préférences) │
│  lib/access.js      aperçu gratuit / accès connecté / admin      │
│  lib/auth.js ───┐                                                │
│  lib/firebase.js┴─→ Firebase Auth   (optionnel, chargé à la      │
│  lib/userTexts.js─→ Firestore         demande si configuré)      │
│  lib/stripe.js ───→ Payment Links                                │
│  lib/generation.js─→ API VPS (« Créer son texte », mode job)     │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
         build Vite → dist/ → Firebase Hosting (rewrite SPA)

   VPS : leggendo-server/ (génération à la demande, GLM)
         generator/       (production du catalogue, cron)
```

## Principes directeurs

1. **Hors ligne par conception.** Traductions et audio ne dépendent d'aucun serveur : les lexiques sont dans les JSON, la voix vient de la Web Speech API du navigateur. L'app fonctionne sans réseau une fois chargée.
2. **Bundle initial minimal.** Tout ce qui n'est pas nécessaire à la page d'accueil est chargé à la demande : chaque vue (sauf Home) est un import dynamique dans le routeur, chaque texte est un chunk séparé, et le SDK Firebase (~75 kB gzip) n'est téléchargé que si sa config est renseignée.
3. **Dégradation gracieuse.** Firebase non configuré → l'app tourne sans comptes ([firebase.js:13](src/lib/firebase.js)). Stripe non configuré → la page Abonnement affiche un avis ([stripe.js:53](src/lib/stripe.js)). TTS indisponible → les contrôles audio sont masqués. localStorage plein → l'app continue sans persister.

## Le contenu : les textes

Chaque texte vit dans `src/texts/<id>.json` et embarque tout ce dont le lecteur a besoin :

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

`src/texts/index.json` est l'index léger (titre, niveau CECR, extrait, nombre de mots, `genre`, `category`) importé statiquement : c'est lui qu'utilisent l'accueil, la bibliothèque et ses filtres, le garde de navigation du routeur et les balises SEO — sans charger le contenu des textes.

La taxonomie du catalogue est définie dans [src/texts/category.json](src/texts/category.json) : niveaux (A1–C2), tailles (`corto` → `molto_lungo`), et deux dimensions orthogonales — **genre** (la forme : récit, dialogue, poésie, fable, SF, giallo, théâtre, lettre/journal, documentaire, pratique) × **thème** (le sujet : cuisine, voyages, montagne, histoire…). Ce fichier sert à la fois à l'UI (filtres, formulaire « Créer son texte ») et aux générateurs (hints de prompt, matrice curée).

**Seul l'aperçu gratuit est embarqué dans le build.** Un chunk JavaScript public reste téléchargeable par qui en connaît l'URL : tant que tout le catalogue était émis dans `dist/`, les gardes de route ne protégeaient que l'affichage. Le plugin `virtual:free-content` de [vite.config.js](vite.config.js) ne génère donc des `import()` que pour les 6 textes d'exemple et les chapitres de Classici gratuits (frontière calculée dans [catalogAccess.js](src/lib/catalogAccess.js), partagée avec les scripts via [scripts/lib/free-content.mjs](scripts/lib/free-content.mjs)). Le reste du catalogue vit dans Firestore (`catalogTexts`, `bookChapters`) et n'est servi qu'après vérification du rôle par [firestore.rules](firestore.rules) — c'est la seule barrière réelle.

Côté app, tout passe par [protectedContent.js](src/lib/protectedContent.js) (`loadCatalogText`, `loadBookChapter`) : chunk local pour l'aperçu gratuit, document Firestore sinon, avec mémorisation en session (les textes précédent et suivant restent préchargés pour une navigation instantanée). Le hors-ligne est assuré par le cache persistant de l'instance Firestore partagée ([firebase.js](src/lib/firebase.js)) : un texte lu une fois avec autorisation reste lisible sans réseau.

Publication : `npm run sync:content` ([scripts/sync-content.mjs](scripts/sync-content.mjs)) pousse les fichiers réservés vers Firestore (idempotent par empreinte SHA-256). Garde-fou : `npm run build` échoue si un contenu réservé réapparaît dans `dist/` ([scripts/check-build-leaks.mjs](scripts/check-build-leaks.mjs)).

### Production du catalogue : `generator/`

Le catalogue est produit par LLM (GLM, endpoint compatible OpenAI) avec des scripts Node **sans dépendance npm**, pensés pour tourner en cron sur le VPS. Le script principal, [generator/orchestrate-matrix.mjs](generator/orchestrate-matrix.mjs), remplit la matrice curée genre × thème × niveau × taille de `category.json`. Invariant central, commun à tous les générateurs : la **couverture lexicale totale** — chaque mot et chaque phrase du texte doit avoir sa traduction, validé en reproduisant exactement le découpage du lecteur (`ReaderView`/`translate.js`), avec passes de réparation automatiques ; sinon le texte est rejeté. Sortie : `src/texts/<id>.json` + mise à jour de `index.json`. Voir [generator/README.md](generator/README.md).

Le dossier `scripts/` contient l'ancien pipeline (API Claude, structured outputs) et ses outils de publication Firestore (`draft → published` dans la collection `texts`, [firestore.rules](firestore.rules)) — voir [scripts/README.md](scripts/README.md). Ce circuit-là n'est pas branché côté app ; c'est `sync-content.mjs` (collections `catalogTexts`/`bookChapters`, ci-dessus) qui sert aujourd'hui le contenu réservé.

### Textes à la demande : « Créer son texte » (`leggendo-server/`)

Un utilisateur connecté décrit le texte qu'il veut (sujet, niveau, genre, thème, taille) ; la génération tourne sur le VPS et le résultat est persisté dans Firestore, lié à son compte.

```
  l'app Vue                      VPS (Caddy → Node :8091)              Firebase
┌──────────────────┐  POST /generate   ┌────────────────────┐      ┌──────────────────┐
│ CreateTextView    │ ────────────────▶ │ leggendo-server/   │      │ Auth              │
│ lib/generation.js │   { jobId }       │  vérifie l'ID token│─────▶│ (identitytoolkit) │
│  (état module +   │  GET /jobs/<id>   │  1 job actif/compte│      │                  │
│   localStorage)   │ ◀──── polling ─── │  GLM + validation  │      │ Firestore         │
│ lib/userTexts.js  │ ── texte fini ──────────────────────────────▶ │  userTexts/{id}   │
│ MyTextsView       │                   └────────────────────┘      │  users/{uid}      │
└──────────────────┘                                                └──────────────────┘
```

- **[leggendo-server/](leggendo-server/)** : serveur Node (http natif + fetch ; seule dépendance npm : `firebase-admin`, pour Firestore). La génération prenant plusieurs minutes, l'API fonctionne en **mode job** (POST `/leggendo/generate` → `{ jobId }`, puis polling de `/leggendo/jobs/<id>`). Le token Firebase est vérifié via l'API identitytoolkit (sans SDK admin) et son rôle relu depuis les custom claims ; quotas de génération (gratuit/payant/enseignant) persistés sur disque ; un seul job actif par compte, jobs persistés dans Firestore (collection `leggendoJobs`, survivent à un redémarrage du VPS) avec TTL et filet anti-blocage. Le SDK Admin (compte de service dédié, rôle Cloud Datastore User) sert uniquement à Firestore. Même validation de couverture lexicale que le catalogue (avec tolérance : jusqu'à 2 phrases sans traduction). Voir [leggendo-server/README.md](leggendo-server/README.md).
- **[lib/generation.js](src/lib/generation.js)** : l'état du job vit au niveau module (pas dans une vue) pour que la génération continue pendant la navigation, et il est persisté dans `localStorage` pour reprendre le polling après un rechargement. À la fin, le texte est enregistré automatiquement dans Firestore.
- **[lib/userTexts.js](src/lib/userTexts.js)** : texte complet dans `userTexts/{id}` (champ `owner`), index léger dans `users/{uid}.createdTexts` pour lister sans requête. Firestore est importé dynamiquement, comme le reste du SDK.
- **Lecture** : `ReaderView` sert aussi les textes utilisateurs — si l'id n'est pas dans l'index du catalogue, il charge depuis Firestore via `loadUserText()`. La route `/condividi/:id` permet de partager un texte créé.

## Dizionario : dictionnaire et conjugaison (pilote)

`/dizionario`, `/coniugazione/:verbo` et `/verbi` servent un dictionnaire italien-français (définition, nature grammaticale, exemples, synonymes) et des tableaux de conjugaison complets, entièrement pré-générés — même principe que les textes : **aucun appel réseau/LLM au runtime**. Les données vivent dans `src/dictionary/` (`lemmas.json`, `conjugations.json`, `word-index.json` — ce dernier résout une forme fléchie rencontrée dans un texte, ex. « abbandonava », vers son lemme, ex. « abbandonare ») et sont lues via [lib/dictionary.js](src/lib/dictionary.js). Le bouton ℹ︎ de [TranslationOverlay](src/components/TranslationOverlay.vue) renvoie vers la fiche du mot cliqué en lecture. Contexte, choix de conception et volumétrie du dictionnaire complet à venir : [analyse.md](analyse.md).

## Le lecteur (ReaderView)

C'est le cœur de l'app. Pipeline de rendu :

1. **Découpage** : chaque paragraphe est segmenté en phrases (regex sur `.!?`), puis chaque phrase en tokens via `split` sur les lettres Unicode — les mots deviennent cliquables, espaces et ponctuation restent affichés tels quels.
2. **Traduction** : au clic (tactile) ou au survol (souris — la distinction se fait via `matchMedia('(hover: none)')`), [translate.js](src/translate.js) cherche le mot normalisé (minuscules, apostrophes) dans le lexique du texte. La bulle [TranslationOverlay](src/components/TranslationOverlay.vue) affiche le résultat et propose la traduction de la phrase entière.
3. **Audio** : [tts.js](src/tts.js) pilote la Web Speech API avec une voix `it-IT`, phrase par phrase, avec pause/reprise et trois vitesses. La phrase en cours est surlignée ; un compteur de session invalide les callbacks d'une lecture annulée.
4. **Quiz et progression** : [QuizSection](src/components/QuizSection.vue) clôt le texte ; sa réussite appelle `markRead()` qui marque le texte comme lu.

## État et persistance

- **[progress.js](src/progress.js)** : un objet Vue `reactive` (textes lus, mots favoris, vitesse TTS) sauvegardé dans `localStorage` via un `watch` profond. Aucun compte requis — la progression est locale à l'appareil.
- **[lib/generation.js](src/lib/generation.js)** et **[lib/userTexts.js](src/lib/userTexts.js)** : état du job de génération (module + `localStorage`) et textes créés (Firestore) — voir la section « Créer son texte » ci-dessus.
- **[lib/auth.js](src/lib/auth.js)** : couche Firebase Auth (email/mot de passe, Google popup, reset). Expose `currentUser` (ref réactive) et `authReady` (promesse résolue une fois la session restaurée — utilisée par le garde du routeur pour éviter une redirection prématurée vers /connexion).

À terme, la progression pourra être synchronisée avec le compte (Firestore), mais ce n'est pas le cas aujourd'hui : compte et progression sont indépendants.

## Routage et SEO

[router.js](src/router.js) utilise l'historique HTML5 (`createWebHistory`), ce qui suppose le rewrite SPA configuré dans `firebase.json`. Trois mécanismes notables :

- **Garde d'existence** : `/testo/:id` accepte les ids du catalogue et, si Firebase est configuré, les ids hors catalogue (textes utilisateurs chargés depuis Firestore) ; sinon renvoi vers la bibliothèque. `/condividi/:id` sert la lecture publique d'un texte créé et partagé (documents `public: true`), sans compte.
- **Garde d'auth** : les routes `requiresAuth` (profil, créer son texte, mes textes, admin…) attendent `authReady` avant de décider.
- **SEO par route** : `afterEach` met à jour `document.title` et la meta description ; pour le lecteur, elles sont générées depuis l'index des textes (titre, niveau, extrait).

## Accès et monétisation

**Accès** ([lib/access.js](src/lib/access.js)) : les visiteurs non connectés voient un **aperçu gratuit de 6 textes** (échantillon réparti sur les niveaux) ; un compte (gratuit) débloque tout le catalogue. Si Firebase n'est pas configuré (mode développement), tout est ouvert. La page d'administration est réservée à un e-mail admin côté client — l'autorisation réelle est vérifiée côté serveur.

**Monétisation** : modèle freemium défini dans [lib/stripe.js](src/lib/stripe.js) : Gratuit / Premium mensuel (5 CHF) / Premium annuel (45 CHF). Le paiement passe par des **Payment Links Stripe** (page hébergée par Stripe, aucun backend). Note : le contrôle d'accès Premium côté client n'est pas encore branché — remplir les Payment Links ne suffit pas, il faudra relier l'état d'abonnement (webhook Stripe → Firestore, ou Stripe Customer Portal) au déblocage des textes.

Sur les stores (voir README, phase 3), cette brique sera remplacée par les achats in-app via un branchement `Capacitor.isNativePlatform()` — Stripe reste le canal web.

## Build et déploiement

- **Vite 6** : `npm run build` → `dist/`, avec code-splitting automatique (une entrée + un chunk par vue lazy + un chunk par contenu **gratuit**). Le `postbuild` prérend les pages SEO puis vérifie qu'aucun contenu réservé n'a fuité dans `dist/`.
- **Firebase Hosting** : sert `dist/` en statique avec rewrite de toutes les routes vers `index.html`.
- **Firestore** : contenu réservé (`npm run sync:content` à lancer **avant** le déploiement du hosting, après `firebase deploy --only firestore` pour les règles et les exemptions d'index).
- **PWA** : `vite-plugin-pwa` est actif (`registerType: 'autoUpdate'`) : manifest + service worker, précache de l'app et de l'aperçu gratuit. Le contenu réservé, lui, est mis en cache par Firestore une fois lu — l'app reste utilisable hors ligne.
