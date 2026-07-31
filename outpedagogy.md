# Analyse pédagogique holistique — Lettore Italiano

Date : 2026-07-31 (v2 — approfondie au niveau code)

Objectif : évaluer l'app par rapport à un outil **complet** d'apprentissage de l'italien (pas seulement lecture/vocabulaire), en couvrant toutes les dimensions de la compétence de communication (CECRL + prosodie, pragmatique, culture, registres). Cette v2 descend au niveau du code (modèle IA utilisé, schémas de données exacts, algorithmes) pour que les recommandations soient directement actionnables, pas seulement directionnelles.

## 1. Cartographie de l'existant

### Routes / vues principales (`src/router.js`)

| Route | Vue | Fonction |
|---|---|---|
| `/` | `HomeView` | Accueil / vitrine |
| `/textes` | `LibraryView` | Bibliothèque de textes courts (niveau/genre/thème) |
| `/testo/:id` | `ReaderView` | Lecteur de texte (cœur de l'app) |
| `/classici`, `/classici/:bookId/:chapterId` | `BooksView`, `BookReaderView` | Classiques littéraires en chapitres |
| `/condividi/:id` | `ReaderView` | Lecture publique d'un texte partagé |
| `/methode`, `/methodologie`, `/a-propos` | `MethodView`, `MethodTextView`, `AboutView` | Pages éditoriales |
| `/abonnement`, `/connexion`, `/profil` | `PricingView`, `LoginView`, `ProfileView` | Compte, paywall, tarification |
| `/creer-son-texte` | `CreateTextView` | Génération de texte sur mesure par IA |
| `/notizie` | `NotizieView` | Actualités italiennes générées quotidiennement (Premium+) |
| `/mes-textes` | `MyTextsView` | Textes créés par l'utilisateur |
| `/parole` | `WordsView` | Session de révision (répétition espacée) des mots favoris |
| `/vocabolario` | `VocabularyView` | Lexique agrégé des textes marqués |
| `/dizionario/:word?` | `DictionaryView` | Dictionnaire italien-français |
| `/coniugazione/:verbo` | `ConjugationView` | Tableaux de conjugaison |
| `/verbi` | `VerbsView` | Liste de tous les verbes du dictionnaire |
| `/admin*` | back-office | Réservé à l'admin |

Volume de contenu : ~440 textes (`src/texts/*.json`), 4 livres classiques par chapitres, dictionnaire complet lemmatisé + conjugaisons.

### Fonctionnalités implémentées

- **Lecture graduée CECR** (A1→C2), taxonomie genre/thème (`src/texts/category.json`)
- **Traduction au clic** — mot ou phrase (`src/translate.js`, `TranslationOverlay.vue`)
- **TTS** — `src/tts.js` : Web Speech API / plugin natif Capacitor, lecture phrase par phrase avec surlignage, 3 vitesses
- **Quiz de compréhension** — QCM après lecture, marque le texte "lu" si score suffisant (`progress.js: markRead`)
- **Dictionnaire it-fr** — `src/dictionary/`, `lib/dictionary.js` : lemme, POS, définition, exemples, synonymes
- **Conjugaison** — tables complètes (présent, passé composé, imparfait, futur, subjonctif présent, conditionnel, impératif), audio par forme
- **Vocabulaire personnel / SRS Leitner** — `progress.js` : favoris, 6 boîtes, intervalles 1/3/7/14/30 jours, session dédiée
- **Mode vocabulaire** — agrégation lexique multi-textes, mots "connus" séparés
- **Progression synchronisée** — `localStorage` + Firestore (`lib/progressSync.js`), fusion multi-appareils
- **Génération de texte IA sur mesure** — `CreateTextView.vue`, `lib/generation.js` (thème/genre/niveau/taille, quota)
- **Actualités quotidiennes générées**, adaptées au niveau
- **Paywall / rôles** — gratuit, premium, premium_plus, enseignant (`lib/access.js`, Stripe + IAP)
- **Packaging natif** iOS/Android (Capacitor), PWA
- **Partage public de texte**

### Modèle de données (Firestore)

- `texts/{textId}`, `catalogTexts/{textId}` — contenu publié
- `bookChapters/{chapterId}` — chapitres de classiques
- `users/{uid}.progress` — `{ readTexts, favorites (box/due Leitner), knownWords, vocabTexts, ttsRate, hintDismissed }`
- `userTexts/{textId}` — textes générés par l'utilisateur
- `newsTexts/{textId}` — pool d'actualités

Chaque texte : `id, title, level, genre, category, paragraphs[], questions[] (QCM), words{mot: traduction}`. **Aucun** champ audio pré-enregistré, phonétique/IPA, ou tag de registre/dialecte.

## 2. Couverture par pilier de compétence

| Pilier | Couverture | Détail |
|---|---|---|
| Compréhension écrite | ✅ Forte | Lecture graduée massive, traduction au clic, quiz |
| Vocabulaire | ✅ Forte | Dictionnaire + SRS Leitner + lexique par texte |
| Morphologie verbale | ✅ Forte | Conjugaison exhaustive avec audio |
| Compréhension orale | 🟡 Partielle | TTS seulement en support de lecture, pas d'exercice d'écoute pure (audio sans texte, débit naturel) |
| Expression écrite | ❌ Absente | Aucune production libre corrigée ; `CreateTextView` ne fait que *paramétrer* une génération IA, l'utilisateur ne rédige rien |
| Expression orale | ❌ Absente | Pas de reconnaissance vocale, pas d'enregistrement utilisateur, pas de feedback de prononciation |
| Interaction / pragmatique | ❌ Absente | Pas de dialogue simulé, pas d'actes de langage (négocier, se plaindre, saluer selon contexte) |
| Grammaire explicite | 🟡 Partielle | Conjugaison seule ; rien sur syntaxe, prépositions, concordance, usage du subjonctif |
| Registres / sociolinguistique | 🟡 Superficielle | Dialecte traité comme *sujet narratif* (`dialetto_futuro.json`), pas comme module pédagogique tu/Lei, formel/informel |
| Prosodie / phonétique | ❌ Absente | Un seul texte `guida_pronuncia_italiana.json`, contenu explicatif, pas interactif |
| Culture | 🟡 Superficielle | Thèmes culturels dans les textes (régions, fêtes, histoire), pas de module dédié savoir-vivre/codes sociaux |
| Suivi de compétence CECRL | ❌ Absent | Le niveau CECR est une étiquette de *contenu*, pas une mesure de l'utilisateur ; `ProfileView` n'a aucune statistique |
| Gamification / motivation | ❌ Absente | Ni streak, ni XP, ni badges ; seul signal = "texte lu ✓" |

## 3. Infrastructure technique réelle (ce qu'on peut réutiliser)

Cette section documente précisément ce qui existe sous le capot, pour que chaque recommandation de la section 5 s'appuie sur du réel et non sur des suppositions.

### 3.1 Pipeline de génération IA

- **Le client (`src/lib/generation.js`) ne fait que du polling HTTP** vers un VPS externe (`api.loicberthod.ch/leggendo`) : `POST /generate` → `jobId` → poll `GET /jobs/{jobId}` toutes les 4 s → `GET /my-job` (reprise après reload) → `GET /quota`. État de job persisté en `localStorage`.
- **Le vrai moteur IA vit dans `leggendo-server/`**, pas dans Firebase Functions. Modèle utilisé : **GLM-5.1 (Zhipu AI / Z.ai)**, pas Claude ni OpenAI — endpoint `open.bigmodel.cn`, fallback `api.z.ai`. `@anthropic-ai/sdk` est présent en devDependency mais **inutilisé en production** ; il ne sert que dans deux scripts éditoriaux (`scripts/generate-text.mjs`, `scripts/lib/annotate.mjs`) pour la génération de contenu offline. Un commentaire dans `leggendo-server/schema.mjs` indique que le schéma JSON strict (`additionalProperties: false`) a été conçu à l'origine pour les structured outputs de Claude.
- **System prompt réel** (`leggendo-server/generate.mjs`) : « Tu écris des textes pour Leggendo, une application d'apprentissage de l'italien par la lecture destinée à des francophones. Chaque texte est en italien, gradué selon le CECR, et accompagné d'un lexique complet italien→français, de traductions de phrases et d'un quiz de compréhension en italien. » + contraintes dures : couverture lexicale 100 %, phrases identiques mot pour mot, exactement 3 QCM à 3 options.
- **Le QCM est généré dans le même appel LLM que le texte**, pas séparément — schéma `{ q, options[], correct: index }`.
- **Réparation automatique** : jusqu'à 2 passes de "repair" si `words`/`sentences` sont incomplets par rapport au texte généré, via un appel LLM ciblé qui ne redemande que les traductions manquantes (`REPAIR_SCHEMA`).
- **Quota** (`leggendo-server/quota.mjs`, logique pure et testée) : gratuit = 1 génération d'essai à vie ; premium = 0 (lecture seule) ; premium_plus = 30 crédits/mois ; enseignant = 100/mois. Coût par taille : corto=1, medio=2, lungo=3, molto_lungo=4. Ancrage sur `periodEnd` Stripe. `onUsage` capture déjà les tokens consommés (loggé).
- **`leggendo-server/news.mjs`** réutilise exactement le même pipeline pour générer les actualités quotidiennes à partir de flux RSS ANSA, avec garde-fous anti-hallucination explicites dans le prompt.

**Implication clé** : ajouter de la correction d'écriture libre ou un chatbot conversationnel ne demande **pas** une nouvelle intégration IA — c'est un nouvel endpoint sur `leggendo-server/` réutilisant `llm.mjs` (`callLLM`) et le pattern schéma-JSON-strict-avec-réparation déjà éprouvé. Le vrai travail est le prompt + le schéma de sortie, pas la plomberie.

### 3.2 TTS — ce qui existe vs ce qu'il faudrait pour un vrai module oral

- Web : `window.speechSynthesis` natif, `lang='it-IT'`, sélection de la première voix `it*` disponible — **aucun contrôle fin de voix** (genre, accent régional).
- Natif iOS/Android : `@capacitor-community/text-to-speech`, moteur système.
- **Granularité actuelle : la phrase**, pas le mot. Le surlignage (`readingKey` type `'p2-s1'`, classe `.sentence.reading`) est géré dans `ReaderView.vue`, pas dans `tts.js` lui-même — c'est `ReaderView.vue` qui découpe et enchaîne les appels phrase par phrase.
- **Aucun cache audio** : chaque lecture régénère la synthèse. Pas de `onboundary` (event de timing mot-à-mot de `SpeechSynthesisUtterance`) exploité — donc un karaoke mot-par-mot est un **vrai développement**, pas une simple exposition de données déjà calculées.
- **Gestion d'erreur quasi nulle** : `onerror` est traité comme une fin de lecture normale (aucun message affiché à l'utilisateur).
- **Pause/reprise incomplète en natif** : sur mobile, `pauseSpeaking()` équivaut à `stopSpeaking()` (le plugin Capacitor n'expose pas de vraie pause) ; seul le web a une vraie pause (`speechSynthesis.pause()/resume()`).
- **Aucune dépendance de reconnaissance vocale** dans `package.json` (pas de `@capacitor-community/speech-recognition` ni équivalent web déjà scaffoldé). Zéro occurrence de `SpeechRecognition`/`webkitSpeechRecognition` dans `src/`.

**Implication clé** : un exercice de prononciation avec feedback est réaliste sur **web** rapidement (Web Speech API `SpeechRecognition` déjà standard, aucune dépendance à ajouter), mais nécessite un **nouveau plugin natif** pour iOS/Android (`@capacitor-community/speech-recognition` existe et est mûr, mais n'est pas encore dans le repo).

### 3.3 SRS (répétition espacée) — algorithme exact

Fichier réel : `src/progress.js` (pas `lib/progress.js`).

```js
const INTERVALS = [0, 1*DAY, 3*DAY, 7*DAY, 14*DAY, 30*DAY] // 6 boîtes, MAX_BOX = 5
```

- Succès → `box = min(box+1, 5)`, `due = now + INTERVALS[box]`.
- Échec → **retour direct à la boîte 0**, `due = now` (révision immédiate). C'est un Leitner simple, **pas un SM-2** (pas de facteur d'ease, pas de pénalité graduelle, pas de distinction "presque su" vs "complètement oublié").
- `dueFavorites()` = simple filtre `due <= now`, aucun tri par urgence ni limite de session quotidienne.
- Migration automatique des favoris pré-SRS vers `box:0, due:0`.
- **Confirmation grep exhaustive : zéro trace de streak, XP, ou badge fonctionnel** dans tout le repo. Les seules occurrences de "badge" sont des classes CSS décoratives (niveau A1/A2 dans `LibraryView.vue`, encart statistique dans `HomeView.vue`) sans mécanique de progression derrière.

**Implication clé** : passer à un SRS type SM-2 (facteur d'ease variable selon la difficulté perçue, pas juste réussi/raté) serait une amélioration algorithmique pure, sans dépendance externe — mais c'est un raffinement, pas un manque béant. Le vrai trou motivationnel (streak/XP) est une fondation UI + un compteur Firestore à créer de zéro.

### 3.4 Dictionnaire — ce qui manque précisément au schéma

`src/dictionary/meta.json` : **11 275 lemmes**, 2 506 verbes conjugués, 39 208 formes fléchies indexées. Structure d'entrée réelle :

```json
{
  "lemma": "a fondo",
  "pos": "locuzione avverbiale",
  "fr": "à fond, en profondeur",
  "definition_it": "in modo completo e approfondito",
  "examples": [{ "it": "Ha studiato il problema a fondo.", "fr": "Il a étudié le problème à fond." }],
  "synonyms": ["approfonditamente", "completamente"],
  "isVerb": false
}
```

- Synonymes présents pour 86 % des lemmes (9 680/11 275), simple tableau de chaînes sans nuance de registre.
- **Champs absents confirmés par grep vide** : `pronunciation`/`ipa`/`audio` par mot, `antonyms`, `register`/`registro` (formel/informel/familier/littéraire).
- Architecture : shardé par lettre (`lemmas/`, `conjugations/`, `word-index/`), chargement paresseux via `import.meta.glob`, `entries.json` allégé (~270 kB, `lemma`/`fr`/`isVerb` seulement) pour la recherche.

**Implication clé** : ajouter un champ `register` par lemme (ex. `"formale" | "neutro" | "informale" | "letterario" | "dialettale"`) est un ajout de schéma peu coûteux — le vrai coût est de peupler 11 275 entrées, donc à faire soit via un batch LLM (réutilisant le pattern `leggendo-server`), soit en priorisant les mots réellement rencontrés dans les textes (lexique agrégé déjà disponible via `VocabularyView`).

### 3.5 Quiz — le trou pédagogique précis

`src/components/QuizSection.vue` :
- Une seule tentative par question (les options se figent au clic), retry seulement au niveau du quiz entier.
- Feedback **visuel uniquement** : bonne réponse en vert, mauvaise en rouge, reste estompé — **aucune justification textuelle** n'accompagne une erreur (pas de "pourquoi c'est faux", pas de renvoi au passage du texte concerné).
- Message de fin selon score global ("Perfetto! 🎉" / "Molto bene!" / "Rileggi il testo e riprova"), aucune explication par question ratée.

**Implication clé** : comme les questions sont déjà générées par LLM avec le texte, on pourrait demander un champ `explanation` supplémentaire dans `schema.mjs` (LLM) et l'ajouter aux ~440 textes existants du corpus statique via un batch script one-shot — coût faible, gain pédagogique réel (transforme le quiz de "sanction" en "feedback formatif").

### 3.6 Cloud Functions Firebase — absence confirmée de logique IA côté serverless

`functions/index.js` ne contient **que** du paiement/compte : `stripeWebhook`, `verifyPlayPurchase`, `validateAppleReceipt`, `adminListUsers/SetUserRole`, `deleteAccount` (RGPD, anonymisation des `generationLogs`), `onUserCreated` (anti-abus). **Aucune fonction de correction, de chat ou de traitement IA.** Toute future fonctionnalité IA interactive (correction d'écriture, chatbot) doit être construite sur `leggendo-server/` (VPS existant), pas sur Firebase Functions — c'est là que vit déjà `callLLM` et le pattern de validation/réparation de schéma JSON.

### 3.7 Registre, grammaire, dialogue — confirmation qu'il n'y a rien à réutiliser

Grep exhaustif sur `registro|formale|informale|tu/lei` (zéro résultat dans `src/` et `leggendo-server/category.json`), sur `SpeechRecognition` (zéro), sur chat/dialogue IA (zéro — le genre éditorial `"dialogo"` existe dans `category.json` mais désigne un texte narratif à deux voix, pas une UI interactive). Ces trois chantiers partent donc réellement de zéro, sans dette technique ni fondation cachée à découvrir.

## 4. Diagnostic

L'app est un **excellent outil de compréhension écrite et de vocabulaire**, avec une infrastructure de contenu (génération IA, Firestore, paywall, natif iOS/Android) mature et réutilisable. Mais elle reste unidirectionnelle : l'utilisateur reçoit de l'italien, il n'en produit jamais et n'en entend jamais sans support écrit. Sur les 5 compétences du CECRL, seule une (compréhension écrite) est vraiment couverte ; le vocabulaire et la conjugaison sont des briques transverses solides mais pas des compétences de communication en soi.

## 5. Recommandations détaillées, classées par effort/impact

Chaque item précise maintenant *quoi toucher exactement* dans le code existant.

### #1 — Streaks + dashboard de progression par skill (Faible effort / Élevé impact)

- **Backend** : ajouter `streak: { current, longest, lastActiveDate }` à `users/{uid}.progress` (même objet que `readTexts`/`favorites`, pas de nouvelle collection).
- **Logique** : incrément côté client dans `progress.js` à la première action de la journée (lecture terminée ou révision SRS faite), comparaison à `lastActiveDate` (perte du streak si écart > 1 jour).
- **UI** : `ProfileView.vue` n'a aujourd'hui aucune statistique — y ajouter un dashboard avec compteurs déjà calculables sans nouvelle donnée : nombre de textes lus, mots appris (`knownWords.length`), mots en révision (`dueFavorites().length`), streak.
- **Piège à éviter** : ne pas faire du streak un simple compteur de connexion (facile à tricher/inutile pédagogiquement) — le lier à une action réelle (quiz complété ou session SRS faite).

### #2 — Exercice de prononciation avec reconnaissance vocale (Moyen effort / Élevé impact)

- **Web** : `SpeechRecognition`/`webkitSpeechRecognition` est disponible nativement, zéro dépendance à ajouter. Flux : TTS prononce une phrase du texte en cours (réutilise `speakItalian` existant) → l'utilisateur répète → comparaison texte reconnu vs phrase cible (similarité type Levenshtein sur les tokens) → score.
- **Natif iOS/Android** : nécessite d'ajouter `@capacitor-community/speech-recognition` (n'existe pas encore dans `package.json`) — c'est le seul vrai ajout de dépendance de toute cette roadmap.
- **Ne pas viser l'analyse de prosodie/intonation dans une v1** — hors de portée des API de reconnaissance vocale grand public (elles donnent du texte, pas de la mélodie). Se limiter à l'exactitude lexicale/phonétique de la répétition, présenté honnêtement comme un exercice de diction, pas d'accent.

### #3 — Production écrite libre + correction IA (Moyen effort / Élevé impact)

- **Backend** : nouvel endpoint sur `leggendo-server/` (`POST /correct`), réutilisant `callLLM` (`llm.mjs`) et le pattern schéma-JSON-strict de `schema.mjs`. Schéma de sortie suggéré : `{ corrected: string, errors: [{ original, correction, explanation, type: "grammaire"|"lexique"|"registre" }], level_estimate }`.
- **Frontend** : nouvelle vue (ex. `/scrivi`), textarea + thème suggéré (peut réutiliser la taxonomie `category.json` déjà là pour proposer des sujets), affichage diff avant/après avec justification par erreur.
- **Quota** : brancher sur le système de crédits déjà existant (`quota.mjs`) plutôt que d'en créer un nouveau — traiter une correction comme un coût de génération (ex. 1 crédit).
- **Risque** : GLM-5.1 n'est pas spécifiquement optimisé pour la correction pédagogique de FLE/italien L2 — tester la qualité des explications avant de lancer, éventuellement comparer avec `@anthropic-ai/sdk` (déjà en dépendance, actuellement inutilisé en prod) sur un échantillon.

### #4 — Explications sur les erreurs de quiz (Faible effort / Moyen-Élevé impact, ratio le plus favorable)

- Point non identifié dans la v1 de cette analyse mais très peu coûteux vu l'infra existante : ajouter un champ `explanation` par question dans `schema.mjs` (LLM) pour les nouveaux textes, et un batch de réparation (même mécanisme que `REPAIR_SCHEMA`) pour les ~440 textes existants.
- **UI** : `QuizSection.vue` a déjà les états nécessaires (`.wrong`/`.correct`) — n'ajouter qu'un bloc de texte conditionnel sous la question ratée.
- Transforme le quiz de sanction pure en feedback formatif, sans toucher à l'architecture.

### #5 — Registre de langue dans le dictionnaire (Faible-Moyen effort / Moyen impact)

- Ajouter un champ `register: "formale"|"neutro"|"informale"|"letterario"|"dialettale"` au schéma `src/dictionary/lemmas/{lettre}.json`.
- Peupler en priorité les mots réellement rencontrés dans le corpus (lexique déjà agrégé, cf. `VocabularyView`), pas les 11 275 lemmes d'un coup — batch LLM ciblé, coût maîtrisé.
- Complément UI : dans `DictionaryView.vue`, afficher le badge de registre à côté du POS déjà affiché.

### #6 — Module tu/Lei et formules de politesse (Faible-Moyen effort / Moyen impact)

- Pas de fondation technique à réutiliser (confirmé section 3.7) — contenu éditorial pur, même format JSON que les textes existants (`paragraphs[]`, `questions[]`), mais avec un tag `category: "registro"` nouveau dans `category.json`.
- Le plus simple : une mini-série de textes contrastifs (même situation racontée en formel puis informel) plutôt qu'un nouveau type de vue.

### #7 — Compréhension orale pure (Faible effort / Moyen impact)

- Réutilise le TTS existant tel quel (`speakItalian`) sur un texte déjà en base — nouveau mode d'affichage dans `ReaderView.vue` qui masque `paragraphs[]` jusqu'à ce que l'utilisateur clique "Afficher le texte", quiz de compréhension déjà généré servant de vérification.
- Aucun nouveau contenu à produire : c'est une nouvelle *façon de consommer* le contenu existant.

### #8 — Dialogue simulé / pragmatique conversationnelle (Élevé effort / Élevé impact)

- Nécessite un vrai moteur conversationnel multi-tour côté `leggendo-server/` (état de conversation à maintenir, pas juste un appel LLM stateless comme la génération de texte actuelle) + UI de chat complète.
- À ne considérer qu'après #3 (la correction d'écriture partage la même brique "LLM évalue une production utilisateur", donc sert de prototype à moindre risque).

### #9 — Karaoke mot-à-mot pendant le TTS (Moyen effort / Faible-Moyen impact)

- Le surlignage actuel s'arrête à la phrase (`readingKey`). Descendre au mot demanderait d'exploiter l'event `onboundary` de `SpeechSynthesisUtterance` (disponible sur web, pas garanti fiable sur tous les moteurs natifs) — probablement pas prioritaire vu le gain pédagogique marginal par rapport à l'effort.

## 6. Priorisation finale et enchaînement suggéré

| Ordre | Item | Raison de l'ordre |
|---|---|---|
| 1 | #4 Explications quiz | Effort quasi nul, corrige une vraie faiblesse pédagogique immédiatement |
| 2 | #1 Streaks/dashboard | Aucune nouvelle infra, referme la boucle de motivation |
| 3 | #7 Compréhension orale pure | Aucun nouveau contenu, nouveau mode de consommation seulement |
| 4 | #2 Prononciation (web d'abord) | Trou le plus critique (aucune expression orale) ; version web sans dépendance avant d'investir dans le plugin natif |
| 5 | #3 Production écrite + correction | Réutilise directement le pipeline LLM existant, complète le pilier "expression écrite" |
| 6 | #5 Registre dictionnaire / #6 Module tu-Lei | Contenu éditorial, peut avancer en parallèle du reste |
| 7 | #8 Dialogue simulé | Le plus gros chantier ; bénéficie de l'expérience acquise sur #3 |
| — | #9 Karaoke mot-à-mot | Bas de la liste — nice-to-have, pas structurant |

**Prochaine étape concrète recommandée** : commencer par #4 (explications de quiz) comme gain rapide vérifiable, puis attaquer #2 en version web pour ouvrir le pilier "expression orale", qui est aujourd'hui le manque le plus sévère de l'app.
