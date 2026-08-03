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

---

## 7. Réévaluation pédagogique après implémentation — 2026-08-01

Cette section actualise l'audit précédent. Plusieurs recommandations structurantes sont maintenant présentes dans le code : série quotidienne, tableau de bord par compétence, journal d'activité, recommandation de prochaine action, écriture corrigée, dialogue interactif, exercice de prononciation, cartes d'erreurs en répétition espacée, mode d'écoute et explications de quiz. Le produit n'est donc plus seulement un lecteur enrichi : il possède les briques d'un environnement d'apprentissage à 360°.

Le nouveau risque n'est plus l'absence de fonctionnalités. C'est leur **dispersion** : l'apprenant peut lire, écouter, écrire, parler, réviser et dialoguer, mais il doit encore comprendre lui-même comment ces activités s'enchaînent pour produire un apprentissage durable.

### 7.1 Couverture actuelle corrigée

| Dimension | État actuel | Limite encore importante |
|---|---|---|
| Compréhension écrite | Forte | QCM encore courts et surtout factuels |
| Compréhension orale | Moyenne à forte | TTS système, peu de diversité de voix et de débit authentique |
| Expression écrite | Fonctionnelle | La correction reste une activité ponctuelle, sans brouillon guidé ni réécriture obligatoire |
| Interaction écrite | Fonctionnelle | Dialogue IA disponible, mais progression pragmatique encore peu structurée |
| Prononciation | Fonctionnelle | Score fondé sur reconnaissance des mots, pas sur prosodie ou qualité phonétique réelle |
| Vocabulaire | Forte | Leitner binaire ; difficulté et contexte de rappel peu pris en compte |
| Grammaire | Contenu de référence | Page riche mais principalement consultative, pas encore une pratique adaptative |
| Suivi | Bon socle | Mesures d'activité plus fortes que mesures de maîtrise |
| Gamification | Sobre et saine | Série présente, mais absence d'objectifs courts explicites et de célébration de maîtrise |

### 7.2 La boucle pédagogique cible

L'expérience devrait toujours rendre visible une seule boucle :

1. **Découvrir** : lire ou écouter un contenu adapté au niveau.
2. **Comprendre** : traduire seulement si nécessaire et répondre à des questions.
3. **Produire** : écrire, prononcer ou répondre dans un dialogue à partir du même contenu.
4. **Recevoir un feedback** : correction expliquée, courte et priorisée.
5. **Réécrire ou répéter** : effectuer immédiatement une seconde tentative améliorée.
6. **Mémoriser** : convertir les erreurs réellement utiles en cartes de révision contextualisées.
7. **Revenir** : proposer automatiquement la meilleure action au bon moment.

Les étapes 1, 2, 4, 6 et 7 sont déjà bien amorcées. Le maillon le plus faible est l'étape 5 : l'application explique l'erreur et la stocke, mais ne contraint pas encore suffisamment l'apprenant à **mobiliser immédiatement la correction**. Or lire une explication n'est pas encore apprendre ; reformuler correctement est la véritable activité d'apprentissage.

### 7.3 Audit de la boîte de texte d'écriture

La zone de production libre est pertinente parce qu'elle ouvre un espace personnel et accepte des rythmes différents. Pour devenir une vraie situation pédagogique, elle devrait proposer trois modes, sans surcharger l'écran :

- **Libre** : l'apprenant écrit ce qu'il souhaite.
- **Guidé** : un objectif communicatif, trois idées à couvrir et quelques mots utiles.
- **Défi lié au texte** : raconter la suite, changer le point de vue, résumer ou donner son avis sur la lecture qui vient d'être terminée.

Après correction, le parcours recommandé est : texte original → deux erreurs prioritaires maximum → explications → zone « Réécris maintenant » → nouvelle vérification. Les corrections secondaires peuvent rester consultables, mais tout afficher avec le même poids crée une charge cognitive inutile, surtout aux niveaux A1-A2.

La correction doit aussi distinguer explicitement :

- **erreur bloquante**, qui empêche la compréhension ;
- **erreur de système**, règle grammaticale ou lexicale à apprendre ;
- **amélioration de naturel**, phrase correcte mais peu idiomatique ;
- **préférence stylistique**, qui ne doit pas être présentée comme une faute.

Cette distinction est essentielle pour préserver la confiance et éviter que l'IA ne transforme arbitrairement le style personnel en « bonne réponse » unique.

### 7.4 Personnalisation : passer du niveau au profil de compétence

Un unique niveau global A1-C2 serait trompeur. Un utilisateur peut lire au niveau B1, écouter au niveau A2 et écrire au niveau A1. Le tableau de bord doit donc conserver un profil séparé : lecture, écoute, vocabulaire, écriture, interaction et prononciation.

La prochaine action ne devrait pas seulement combler la compétence la moins pratiquée. Elle devrait combiner quatre signaux :

- échéance de mémoire : révisions dues ;
- faiblesse observée : erreurs ou scores récents ;
- objectif déclaré : voyage, examen, conversation, lecture ;
- énergie disponible : session de 5, 10 ou 20 minutes.

La question d'accueil la plus utile n'est donc pas « Que veux-tu faire ? », mais « Combien de temps as-tu aujourd'hui ? ». Le moteur peut ensuite composer une mini-session cohérente : par exemple 2 minutes de révision, 5 minutes de lecture et 3 minutes de production.

### 7.5 Gamification pertinente

La série quotidienne actuelle est une bonne mécanique de continuité, à condition de ne pas devenir punitive. La gamification recommandée doit valoriser la maîtrise et l'effort, pas le volume de clics.

À privilégier :

- objectif quotidien flexible en minutes ou en actions utiles ;
- mission courte liée à une compétence : « comprendre sans traduction », « réutiliser trois mots », « corriger puis réécrire » ;
- barre de session avec début et fin clairs ;
- célébration discrète d'une compétence consolidée ;
- badges rares correspondant à des capacités réelles, par exemple réussir cinq écoutes sans afficher le texte.

À éviter : XP attribués à toute action, classements publics, récompenses aléatoires et notifications culpabilisantes. Ces mécanismes peuvent augmenter l'ouverture de l'application tout en diminuant l'autonomie et la qualité de l'apprentissage.

### 7.6 Indicateurs de succès à mesurer

Les métriques produit doivent refléter l'apprentissage, pas seulement l'engagement :

| Indicateur | Ce qu'il mesure |
|---|---|
| Taux de seconde tentative | Transformation du feedback en action |
| Erreurs récurrentes à 7 et 30 jours | Consolidation réelle |
| Rappel correct sans aide | Maîtrise du vocabulaire |
| Réussite en écoute avant affichage du texte | Compréhension orale autonome |
| Réutilisation d'un mot appris en écriture/dialogue | Transfert entre compétences |
| Sessions terminées / sessions commencées | Charge et clarté du parcours |
| Progression par compétence sur 4 semaines | Effet durable, au-delà de la série |

Il faut également instrumenter l'usage des aides : traduction de mot, traduction de phrase, affichage du texte en écoute et nombre de corrections demandées. Une diminution progressive de ces aides, à niveau de contenu comparable, est un meilleur signal de progrès qu'un simple nombre de textes terminés.

## 8. Priorités recommandées — prochaine itération

### Priorité 1 — fermer la boucle de correction

Ajouter une seconde tentative obligatoire mais courte après une erreur d'écriture, de dialogue ou de prononciation. Ne demander qu'une ou deux reformulations prioritaires. C'est le gain pédagogique le plus fort avec les briques déjà présentes.

### Priorité 2 — créer la session quotidienne composée

Faire évoluer « la prochaine action » vers une session de 5, 10 ou 20 minutes, construite à partir des révisions dues, de la faiblesse récente et de l'objectif personnel. L'utilisateur garde toujours la possibilité de changer d'activité.

### Priorité 3 — contextualiser les cartes d'erreur

Chaque carte devrait conserver la phrase complète, la source, une explication courte et un exemple contrastif. La révision doit demander une production ou un choix en contexte, pas seulement la reconnaissance d'une correction isolée.

### Priorité 4 — relier les activités entre elles

À la fin d'un texte, proposer une seule extension logique : écouter sans texte, résumer en trois phrases, prononcer une phrase clé ou jouer une situation liée. Ce lien transforme le catalogue en parcours et évite l'effet « menu d'outils ».

### Priorité 5 — rendre la grammaire active

Conserver la page de référence, mais créer de petits exercices depuis les erreurs réellement détectées. La grammaire devient alors une réponse à un besoin observé, et non un manuel séparé du reste de l'expérience.

## 9. Conclusion actualisée

L'application dispose maintenant d'une base crédible pour un apprentissage à 360°. La prochaine avancée ne viendra pas d'un nouveau module majeur, mais de l'orchestration des modules existants : une consigne adaptée, une production courte, un feedback priorisé, une seconde tentative et une révision au bon moment.

La promesse pédagogique la plus juste serait : **« Chaque jour, Leggendo choisit avec vous une courte activité adaptée, vous fait utiliser l'italien, vous explique l'essentiel et vous aide à le retenir. »**

## 10. Audit pédagogique de maturité — au-delà de l'ajout de fonctionnalités

Cette troisième lecture tient compte des développements désormais présents : session composée, missions, continuité entre activités, seconde tentative, exercices issus des erreurs et indicateurs de confiance. Le produit a franchi le stade du prototype fonctionnel. Le prochain enjeu est la **validité pédagogique** : s'assurer que ce que l'application affiche comme progrès correspond réellement à une capacité transférable hors de l'application.

### 10.1 Diagnostic synthétique

| Axe | Maturité actuelle | Risque principal |
|---|---|---|
| Variété des activités | Élevée | Accumulation d'outils si la session composée n'est pas l'entrée dominante |
| Boucle feedback → reprise | Bonne | La reprise vérifie surtout la proximité avec une correction modèle |
| Adaptation au rythme | Bonne base | Durée et fréquence sont adaptées, mais la difficulté l'est encore peu |
| Mesure de progression | Prudente | Activité et réussite immédiate peuvent encore être confondues avec maîtrise |
| Écriture | Fonctionnelle et bien guidée | L'objectif communicatif n'est pas évalué explicitement |
| Gamification | Saine | Missions identiques et peu renouvelées à terme |
| Transfert entre compétences | Bien amorcé | Le transfert est mesuré par présence lexicale, pas encore par usage correct |
| Positionnement CECR | Fragile | Un QCM court et une production isolée ne couvrent pas les descripteurs CECR |

### 10.2 Ce que la boîte de texte fait déjà bien

`WriteView.vue` possède les éléments attendus d'un environnement d'écriture pédagogique : mode libre, mode guidé, activité liée à une lecture, aides révélées progressivement, mots adaptés au niveau, correction structurée, sélection d'une ou deux erreurs prioritaires et seconde tentative. Le texte complet n'est pas ajouté au journal d'activité, ce qui limite aussi le risque de confidentialité.

La hiérarchie cognitive est pertinente : l'apprenant peut produire seul, demander une aide graduée, comparer, comprendre, puis reformuler. Pour un public francophone, les explications simples en français réduisent la charge extrinsèque, surtout aux niveaux A1-A2.

### 10.3 Limite majeure : corriger la langue ne suffit pas à réussir la tâche

Le schéma de correction actuel évalue surtout quatre familles : grammaire, lexique, registre et orthographe. Il ne dit pas clairement si l'apprenant a atteint le but demandé. Un courriel grammaticalement correct peut échouer s'il ne demande pas la modification de réservation ; un résumé correct peut omettre l'idée centrale ; un avis peut juxtaposer des phrases sans justification.

La correction devrait donc séparer deux couches :

1. **Réussite communicative** : destinataire, intention, informations attendues, clarté globale.
2. **Qualité linguistique** : correction, étendue lexicale, cohésion, registre et précision.

Pour les modes guidé et lié au contenu, la consigne, le but et les éléments attendus doivent être envoyés au correcteur. Le retour peut rester très court : « objectif atteint », « partiellement atteint » ou « à compléter », suivi d'un seul conseil. Il ne faut pas transformer l'écran en grille scolaire exhaustive.

### 10.4 La seconde tentative mesure actuellement l'imitation plus que le transfert

La reprise compare la réponse de l'apprenant à la correction proposée. C'est utile pour une forme locale, mais une forte similarité ne prouve pas que la règle est comprise. Une copie presque exacte peut réussir sans récupération durable.

Progression recommandée selon le type d'erreur :

- tentative immédiate : corriger la phrase d'origine ;
- rappel différé : compléter ou corriger la même règle quelques jours plus tard ;
- transfert : produire une nouvelle phrase dans un autre contexte ;
- consolidation : reconnaître quand la forme concurrente est, elle aussi, correcte.

Le véritable indicateur de maîtrise doit être le succès différé dans un contexte nouveau, pas seulement `retrySuccess` juste après l'explication.

### 10.5 Adapter la difficulté, pas seulement la durée

Le moteur compose déjà une session de 5, 10 ou 20 minutes et tient compte des activités récentes. L'étape suivante consiste à ajuster la difficulté à partir de signaux observables : score de quiz, recours aux traductions, affichage de la transcription, aides utilisées en écriture, erreurs récurrentes et réussite différée.

Une règle simple suffit pour commencer :

- deux réussites autonomes comparables : proposer un contenu légèrement plus exigeant ;
- réussite avec beaucoup d'aides : maintenir le niveau et retirer progressivement une aide ;
- deux échecs ou abandons : réduire la longueur ou la complexité, sans rétrograder automatiquement le niveau affiché ;
- erreur récurrente ciblée : conserver le niveau général et insérer une micro-activité de consolidation.

Cette adaptation doit être expliquée en langage simple : « Nous gardons ce niveau pour vous aider à lire avec moins de traductions. »

### 10.6 Positionnement CECR : reformuler les promesses

Le test de niveau repose sur 10 à 16 QCM et la correction estime le niveau d'une production isolée. Ces informations sont utiles pour orienter le contenu, mais insuffisantes pour affirmer une maîtrise CECR globale. Les résultats doivent rester formulés comme des **indices de travail** : « niveau conseillé pour commencer », « niveau observé sur vos dernières productions », avec taille d'échantillon et confiance.

Pour renforcer la validité sans construire un examen complet, le positionnement initial peut combiner :

- un court QCM de langue et de compréhension ;
- une auto-évaluation par situations réelles ;
- une courte production facultative ;
- une révision automatique de la recommandation après trois activités authentiques.

### 10.7 Gamification évolutive

Les missions actuelles sont pédagogiquement saines parce qu'elles récompensent l'écoute autonome, la réécriture et le réemploi. Avec seulement quelques missions fixes, elles risquent toutefois de devenir prévisibles.

Il faut générer une mission quotidienne à partir du besoin réel, sans points artificiels :

- nombreuses traductions : « lis un paragraphe sans traduction de phrase » ;
- erreurs d'articles récurrentes : « réussis deux rappels sur les articles » ;
- écoute peu pratiquée : « écoute avant d'afficher le texte » ;
- vocabulaire revu mais peu transféré : « réutilise deux mots dans une phrase ».

La récompense principale doit rester une preuve de capacité : « Aujourd'hui, vous avez compris un texte A2 sans transcription », plutôt qu'un total abstrait d'XP.

### 10.8 Autonomie et résilience de la zone de texte

La zone affiche une limite de caractères et fonctionne correctement au clavier, mais l'audit du code ne montre pas encore de sauvegarde locale automatique du brouillon. Sur mobile, une fermeture, un changement de page ou une perte de connexion peut donc détruire un effort important.

À ajouter avant d'enrichir davantage la correction :

- brouillon local par mode et par consigne ;
- état « enregistré sur cet appareil » ;
- confirmation avant de remplacer un brouillon lors d'un changement de sujet ;
- possibilité de corriger plus tard si le réseau ou le quota est indisponible ;
- compteur de mots en plus du compteur de caractères, avec une cible indicative et non bloquante.

### 10.9 Priorités de la prochaine itération

1. **Évaluer l'objectif communicatif** dans l'écriture guidée et liée au contenu.
2. **Sauvegarder automatiquement les brouillons**, surtout sur mobile.
3. **Mesurer la réussite différée et le transfert grammatical**, pas seulement la reprise immédiate.
4. **Adapter progressivement la difficulté** à partir de l'usage réel des aides.
5. **Rendre le positionnement CECR plus prudent et multimodal**.
6. **Personnaliser les missions** selon une faiblesse observée.

Le meilleur prochain développement n'est donc pas un nouveau module. C'est une amélioration du noyau : **une tâche claire, une production protégée, un feedback qui juge aussi l'intention, une reprise immédiate, puis une vérification différée dans un autre contexte**.
