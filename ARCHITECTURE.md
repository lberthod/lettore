# Architecture — Leggendo

Ce document explique comment l'application est construite : ses principes, ses modules, et comment les données circulent. Pour la feuille de route (PWA, stores), voir le [README](README.md).

## Vue d'ensemble

Leggendo est une **SPA Vue 3 entièrement statique** : pas de backend applicatif, pas d'API de traduction, pas de base de données obligatoire. Tout le contenu (textes, lexiques, traductions de phrases) est pré-généré dans des fichiers JSON embarqués dans le build. Les seuls services externes sont optionnels : Firebase Auth (comptes) et Stripe (paiement), tous deux désactivés tant que leur configuration n'est pas remplie.

```
┌─────────────────────────── Navigateur ───────────────────────────┐
│                                                                  │
│  App.vue ── router.js ──┬── HomeView        (liste des textes)   │
│                         ├── ReaderView      (lecteur, lazy)      │
│                         │     ├── TranslationOverlay             │
│                         │     └── QuizSection                    │
│                         ├── WordsView       (mots favoris)       │
│                         ├── LoginView / ProfileView              │
│                         ├── PricingView                          │
│                         └── pages statiques (à-propos, CGU…)     │
│                                                                  │
│  translate.js   lexique local (aucune API)                       │
│  tts.js         Web Speech API (voix it-IT du système)           │
│  progress.js    localStorage (lecture, favoris, préférences)     │
│  lib/auth.js ───┐                                                │
│  lib/firebase.js┴─→ Firebase Auth   (optionnel, chargé à la      │
│  lib/stripe.js ───→ Payment Links     demande si configuré)      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
         build Vite → dist/ → Firebase Hosting (rewrite SPA)
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
  "paragraphs": ["La mattina, Marco si sveglia presto…"],
  "words": { "mattina": "matin", "presto": "tôt" },
  "sentences": { "La mattina, Marco si sveglia presto.": "Le matin, Marco se réveille tôt." },
  "quiz": [ … ]
}
```

`src/texts/index.json` est l'index léger (titre, niveau CECR, extrait, nombre de mots) importé statiquement : c'est lui qu'utilisent la page d'accueil, le garde de navigation du routeur et les balises SEO — sans charger le contenu des textes.

Le chargement à la demande repose sur `import.meta.glob('../texts/*.json')` dans [ReaderView.vue](src/views/ReaderView.vue) : Vite génère un chunk par fichier, et le lecteur ne télécharge que le texte demandé. Les textes précédent et suivant sont préchargés pour une navigation instantanée.

### Base de contenu en ligne (Firestore) et pipeline LLM

Direction validée : **Firestore pour la base de textes, le VPS pour la génération**. Motivation principale : les textes premium embarqués dans le build sont téléchargeables par n'importe qui — le modèle Premium exige un stockage servi après vérification de l'abonnement.

```
   Mac / VPS (cron)                        Firebase
┌──────────────────────┐   Admin SDK   ┌─────────────────────────────┐
│ scripts/              │ ────────────▶ │ Firestore                   │
│  generate-text.mjs    │  (brouillon)  │  texts/<id>  status,premium │
│   API Claude          │               │  meta/index  (publiés)      │
│   + validation        │  relecture    │                             │
│  publish-text.mjs     │ ────────────▶ │ Security rules :            │
└──────────────────────┘  (publication) │  gratuit → public           │
                                        │  premium → claim `premium`  │
                                        │  (posé par webhook Stripe)  │
                                        └──────────┬──────────────────┘
                                                   │ lecture + cache offline
                                                   ▼
                                                l'app Vue
```

- **[scripts/generate-text.mjs](scripts/generate-text.mjs)** : appelle l'API Claude avec un schéma JSON strict (structured outputs), puis valide la **couverture lexicale totale** en reproduisant exactement le découpage du lecteur — chaque mot et chaque phrase doit avoir sa traduction, avec passes de réparation automatiques. Deux destinations : fichier local dans `src/texts/` (workflow actuel) ou brouillon Firestore (`--sink firestore`).
- **[scripts/publish-text.mjs](scripts/publish-text.mjs)** : bascule `draft → published` et reconstruit le doc `meta/index`.
- **[firestore.rules](firestore.rules)** : les brouillons sont invisibles ; les textes publiés gratuits sont publics ; les premium exigent le custom claim `premium`. L'écriture passe exclusivement par l'Admin SDK.
- **Côté app (à venir)** : les 3-4 textes gratuits restent embarqués dans le build (SEO, première visite instantanée) ; les autres seront chargés depuis Firestore avec sa persistance offline — le principe hors-ligne est conservé.

Voir [scripts/README.md](scripts/README.md) pour l'utilisation.

## Le lecteur (ReaderView)

C'est le cœur de l'app. Pipeline de rendu :

1. **Découpage** : chaque paragraphe est segmenté en phrases (regex sur `.!?`), puis chaque phrase en tokens via `split` sur les lettres Unicode — les mots deviennent cliquables, espaces et ponctuation restent affichés tels quels.
2. **Traduction** : au clic (tactile) ou au survol (souris — la distinction se fait via `matchMedia('(hover: none)')`), [translate.js](src/translate.js) cherche le mot normalisé (minuscules, apostrophes) dans le lexique du texte. La bulle [TranslationOverlay](src/components/TranslationOverlay.vue) affiche le résultat et propose la traduction de la phrase entière.
3. **Audio** : [tts.js](src/tts.js) pilote la Web Speech API avec une voix `it-IT`, phrase par phrase, avec pause/reprise et trois vitesses. La phrase en cours est surlignée ; un compteur de session invalide les callbacks d'une lecture annulée.
4. **Quiz et progression** : [QuizSection](src/components/QuizSection.vue) clôt le texte ; sa réussite appelle `markRead()` qui marque le texte comme lu.

## État et persistance

- **[progress.js](src/progress.js)** : un objet Vue `reactive` (textes lus, mots favoris, vitesse TTS) sauvegardé dans `localStorage` via un `watch` profond. Aucun compte requis — la progression est locale à l'appareil.
- **[lib/auth.js](src/lib/auth.js)** : couche Firebase Auth (email/mot de passe, Google popup, reset). Expose `currentUser` (ref réactive) et `authReady` (promesse résolue une fois la session restaurée — utilisée par le garde du routeur pour éviter une redirection prématurée vers /connexion).

À terme, la progression pourra être synchronisée avec le compte (Firestore), mais ce n'est pas le cas aujourd'hui : compte et progression sont indépendants.

## Routage et SEO

[router.js](src/router.js) utilise l'historique HTML5 (`createWebHistory`), ce qui suppose le rewrite SPA configuré dans `firebase.json`. Trois mécanismes notables :

- **Garde d'existence** : `/testo/:id` vérifie l'id dans l'index et renvoie à l'accueil sinon.
- **Garde d'auth** : les routes `requiresAuth` attendent `authReady` avant de décider.
- **SEO par route** : `afterEach` met à jour `document.title` et la meta description ; pour le lecteur, elles sont générées depuis l'index des textes (titre, niveau, extrait).

## Monétisation

Modèle freemium défini dans [lib/stripe.js](src/lib/stripe.js) : Gratuit / Premium mensuel (5 CHF) / Premium annuel (45 CHF). Le paiement passe par des **Payment Links Stripe** (page hébergée par Stripe, aucun backend). Note : le contrôle d'accès Premium côté client n'est pas encore branché — remplir les Payment Links ne suffit pas, il faudra relier l'état d'abonnement (webhook Stripe → Firestore, ou Stripe Customer Portal) au déblocage des textes.

Sur les stores (voir README, phase 3), cette brique sera remplacée par les achats in-app via un branchement `Capacitor.isNativePlatform()` — Stripe reste le canal web.

## Build et déploiement

- **Vite 6** : `npm run build` → `dist/`, avec code-splitting automatique (une entrée + un chunk par vue lazy + un chunk par texte).
- **Firebase Hosting** : sert `dist/` en statique avec rewrite de toutes les routes vers `index.html`.
- **PWA** : `vite-plugin-pwa` est installé mais pas encore activé (phase 2 de la feuille de route).
