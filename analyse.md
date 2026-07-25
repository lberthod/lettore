# Analyse : page dictionnaire (dizionario) — vision Option C, sans coût LLM en runtime

## 1. Constat actuel

- **Traduction contextuelle** : [`BookReaderView.vue`](src/views/BookReaderView.vue) / [`ReaderView.vue`](src/views/ReaderView.vue) → clic sur un mot → [`TranslationOverlay.vue`](src/components/TranslationOverlay.vue), via `lookupWord()`/`lookupSentence()` dans [`src/translate.js`](src/translate.js).
- **Limite** : `lookupWord()` ne cherche que dans le `words{}` du texte affiché. Rien en dehors. Pas de définition, pas de nature grammaticale, pas de conjugaison, pas d'exemples.
- **Vocabulaire agrégé** : [`src/lib/vocab.js`](src/lib/vocab.js) + [`VocabularyView.vue`](src/views/VocabularyView.vue) (`/vocabolario`) — juste une liste de traductions FR, pas un dictionnaire.
- **Favoris/SRS** : [`src/progress.js`](src/progress.js) (Leitner box, `favorites[]`), synchronisé via [`src/lib/progressSync.js`](src/lib/progressSync.js) — réutilisable tel quel.

## 2. Décision : Option C — Overlay + page dédiée

On garde les deux usages, qui sont complémentaires et pas redondants :

- **Overlay enrichi (dans `TranslationOverlay.vue`)** — lookup rapide en contexte de lecture. En plus de la traduction actuelle, un bouton « en savoir plus » ouvre la fiche complète du mot (définition, nature grammaticale, conjugaison si verbe, exemples, synonymes), sans quitter la lecture.
- **Page dédiée `/dizionario`** — recherche libre d'un mot italien (même hors contexte d'un texte), consultation approfondie, accès depuis `VocabularyView`/`WordsView` pour revoir un mot déjà favori. Suit la convention de routes existante (chemin italien, nom de route anglais → `dictionary`).

Les deux consomment la **même source de données** (voir §3), donc pas de duplication de logique métier — seule l'UI diffère (popup compacte vs page complète).

## 3. Source de données : génération en batch via agents, PAS d'appel LLM en runtime

Contrainte du besoin : **aucun coût LLM après la mise en place** → tout doit être pré-généré une fois (ou par lots périodiques), stocké, et consulté ensuite gratuitement (lecture statique/Firestore).

### Ce qui existe déjà et est réutilisable

Le repo a déjà 3 pipelines de génération par LLM, dont on peut adapter le pattern :

- [`scripts/generate-text.mjs`](scripts/generate-text.mjs) — Claude API (`claude-opus-4-8`), sorties JSON structurées, écrit dans `src/texts/<id>.json`. Le plus propre à copier (script `npm run generate:text`, doc dans [`scripts/README.md`](scripts/README.md)).
- [`generator/lib/llm.mjs`](generator/lib/llm.mjs) + [`generator/lib/generate.mjs`](generator/lib/generate.mjs) — pattern de **repair pass** déjà en place : on prompt une liste de lemmes manquants, le LLM renvoie un JSON structuré, on merge dans la map existante. **C'est exactement le mécanisme dont on a besoin** pour générer le dictionnaire par lots (lemmes → définitions complètes), en étendant le schéma `{it, fr}` actuel à `{it, fr, pos, conjugaison?, exemples[], synonymes[]}`.
- Tous les appels LLM passent par `callLLM({ system, prompt, schema, maxTokens })` avec JSON Schema forcé — fiable pour extraire des données structurées en masse.

### Ampleur du besoin

Exploration du corpus existant :
- **462 fichiers** dans `src/texts/*.json` (~128 mots/texte en moyenne) + **120 chapitres** dans `src/books/*/*.json`.
- **124 278 occurrences de mots** au total, mais seulement **~27 169 formes uniques** (dédupliquées, casse basse) — c'est la taille réelle du dictionnaire à générer.
- 27k mots avec un prompt bien conçu (batch de ~50-100 mots par appel) → de l'ordre de 300-500 appels LLM **une seule fois**, pas par utilisateur ni par requête. Coût ponctuel, maîtrisable, et non récurrent.

### Comment lancer la génération « avec des agents »

Oui, c'est possible et c'est la bonne approche : un script `scripts/generate-dictionary.mjs` (suivant la convention de nommage `generate:*` déjà en place) qui :
1. Extrait les 27k formes uniques depuis `src/texts/*.json` + `src/books/*/*.json`.
2. Les découpe en lots (ex. 50 mots/lot).
3. Pour chaque lot, appelle le LLM (réutilise `callLLM`) avec un schéma étendu (définition italienne courte, nature grammaticale, conjugaison si verbe, 1-2 exemples, synonymes).
4. Écrit le résultat dans un dataset unique — vu la taille (27k entrées), pas un seul doc Firestore (limite ~1 Mo/doc) mais soit :
   - un **fichier JSON statique** `src/data/dictionary.json` (ou découpé par lettre, `src/data/dictionary/a.json` etc.), servi comme les textes actuels, **zéro coût de lecture** ; ou
   - une **collection Firestore `dictionary/{word}`**, lecture publique / écriture admin uniquement (même pattern que `texts/{id}`), si on veut pouvoir mettre à jour des mots individuellement sans redéployer.
5. Un mode « repair » (comme `generator/lib/generate.mjs`) pour ne regénérer que les mots manquants/nouveaux quand de nouveaux textes sont ajoutés — évite de tout relancer à chaque fois.

**Recommandation stockage** : fichier(s) JSON statique(s) versionnés dans le repo (comme `src/texts/*.json`), plus simple, gratuit à servir, cohérent avec l'existant. Firestore seulement si on veut éditer un mot en prod sans redéploiement.

## 3bis. Constat après extraction réelle : il faut lemmatiser

Extraction faite avec [`scripts/extract-dictionary-words.mjs`](scripts/extract-dictionary-words.mjs) (script déterministe, aucun LLM) : **582 fichiers scannés, 27 169 formes uniques**.

Mais en regardant le détail, une grande partie de ces « mots uniques » ne sont que des **formes fléchies d'un même verbe/nom/adjectif**. Exemple réel trouvé dans le corpus, rien que pour *abbandonare* :

```
abbandona, abbandonai, abbandonando, abbandonano, abbandonare,
abbandonarlo, abbandonarvi, abbandonata, abbandonate, abbandonati,
abbandonato, abbandonava
```

→ 12 entrées dans la liste brute, pour **1 seul verbe**. Générer une fiche dictionnaire complète (définition, exemples, synonymes) pour chacune de ces 12 formes serait redondant et gonflerait artificiellement le volume de travail (et la taille du dataset) sans valeur ajoutée : un dictionnaire papier n'a qu'une entrée « abbandonare », pas une par forme conjuguée.

**Conclusion** : avant de générer les fiches, il faut **lemmatiser** — regrouper chaque forme fléchie sous son lemme (infinitif pour un verbe, masculin singulier pour un adjectif, etc.), et ne générer qu'une fiche par lemme. Le nombre réel de lemmes uniques sera nettement inférieur à 27 169 (probablement de l'ordre de 8 000 à 12 000, à confirmer une fois la lemmatisation faite).

## 4. Idée complémentaire : page « coniugazione » (conjugaison)

Puisqu'on doit de toute façon relier chaque forme fléchie à son verbe (lemme), autant en tirer une deuxième fonctionnalité :

- **Page `/coniugazione/:verbo`** : tableau de conjugaison complet d'un verbe (presente, passato prossimo, imperfetto, futuro, congiuntivo, condizionale, imperativo…), générée une fois par verbe et stockée statiquement, même logique que le dictionnaire (génération par agents, zéro coût runtime).
- **Lien naturel avec le dictionnaire** : la fiche dictionnaire d'un verbe (ex. *abbandonare*) pointe vers sa page de conjugaison. Et surtout, la table de correspondance forme fléchie → lemme (nécessaire pour éviter les doublons, §3bis) sert aussi à faire : « tu cliques sur *abbandonava* dans un texte → l'overlay reconnaît que c'est une forme de *abbandonare* → lien direct vers sa conjugaison complète ». C'est un vrai plus pédagogique (l'apprenant voit immédiatement à quel temps/personne correspond la forme rencontrée), pas juste une fonctionnalité annexe.
- **Réutilisation de données** : seuls les verbes ont besoin d'une table de conjugaison — sur ~8-12k lemmes estimés, probablement 1 500-3 000 sont des verbes. La table forme→lemme reste utile aussi pour les noms/adjectifs (pluriels, féminins) même sans page de conjugaison dédiée, juste pour rattacher la forme trouvée dans un texte à sa fiche dictionnaire.

**Architecture de données mise à jour** :
- `dictionary/<lemme>.json` (ou fichier unique découpé par lettre) — fiche définition/exemples/synonymes, + `conjugationRef` si verbe.
- `conjugations/<verbe>.json` — table complète, générée séparément (seulement pour les lemmes de type verbe).
- `word-index.json` — table plate `forme fléchie → lemme` (ex. `"abbandonava": "abbandonare"`), construite pendant la lemmatisation, utilisée par `lookupDictionary(word)` pour retrouver la bonne fiche à partir de n'importe quelle forme rencontrée dans un texte.

## 5. Ce que ça change dans le code (aperçu, pas encore implémenté)

- `src/translate.js` : ajouter `lookupDictionary(word)` qui utilise `word-index.json` pour résoudre la forme → lemme, puis lit la fiche dans `dictionary/<lemme>.json` (fallback si le mot n'est pas dans le lexique du texte courant).
- `TranslationOverlay.vue` : bouton « en savoir plus » → fiche dictionnaire, + lien « voir la conjugaison » si c'est une forme verbale.
- Nouvelles routes `/dizionario` (+ `/dizionario/:mot`) et `/coniugazione/:verbo` dans [`src/router.js`](src/router.js), nouvelles vues `DictionaryView.vue` et `ConjugationView.vue`.
- `src/progress.js` : possibilité de lier un mot du dictionnaire à une entrée `favorites[]` existante (même clé `word`, résolue au lemme).

## 6. Prochaine étape

Lemmatisation + génération pilote sur un échantillon (~100-200 lemmes, agents Claude Code exécutés directement dans cette session, aucun script ni API externe) pour valider le format des fiches (dictionnaire + conjugaison) avant de lancer le lot complet.
