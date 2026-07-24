# Lettore Ebook — intégrer 8 classiques du domaine public

Document de travail : comment récupérer 8 œuvres du domaine public (4 françaises, 4 italiennes), les harmoniser en JSON, produire leur lexique/traductions via un pipeline LLM (Claude), et les rendre lisibles dans l'app **exactement comme un texte du catalogue** — clic/survol sur un mot, traduction de phrase, TTS, quiz, mode vocabulaire — malgré leur longueur (romans entiers vs. textes courts de 60 à 1300 mots aujourd'hui).

Statut : **document de conception**, aucune ligne de code n'a été modifiée pour ce chantier. Sert de base à une implémentation future, à dérouler en plusieurs sessions (voir §8).

---

## 1. Objectif et périmètre

Aujourd'hui, [ARCHITECTURE.md](ARCHITECTURE.md) décrit un catalogue de 456 textes **courts et générés** : chaque texte est un JSON auto-suffisant (`src/texts/<id>.json`) produit par LLM à un niveau CECR calibré, avec couverture lexicale totale (chaque mot et chaque phrase a sa traduction). Ce chantier est différent sur deux points :

- **Le texte source n'est pas généré, il est donné** : ce sont des œuvres réelles (Maupassant, Collodi, Hugo, Verga, Pirandello, Voltaire, Dante...), à récupérer telles quelles, pas à réécrire.
- **Le format n'est pas un texte court, c'est un livre** : un roman de plusieurs dizaines de milliers de mots ne rentre pas dans le modèle "un fichier = un texte lu en une page" du lecteur actuel.

Décisions de cadrage retenues :

1. **Texte authentique, niveau CECR indicatif unique par œuvre** (pas de simplification/réécriture du texte source, pas de déclinaison multi-niveaux comme le catalogue généré). Le niveau affiché est une indication de difficulté globale, pas une garantie calibrée comme pour le reste du catalogue — ce point doit rester visible dans l'UI pour ne pas induire l'utilisateur en erreur (§9).
2. **Nouveau concept "livre à chapitres"**, distinct du catalogue de textes courts : un livre a un sommaire, chaque chapitre se lit comme un texte normal (mêmes interactions), et la navigation se fait chapitre à chapitre plutôt que texte à texte.
3. On **réutilise au maximum l'existant** — schéma de données par chapitre identique au schéma texte actuel, pipeline de validation de couverture lexicale identique, moteurs de traduction/TTS/quiz identiques — pour ne pas dupliquer de logique.

---

## 2. Les 8 œuvres et leurs sources

| Niveau indicatif | Œuvre | Auteur | Langue | Source recommandée | Format |
|---|---|---|---|---|---|
| B1 | *La Parure* | Guy de Maupassant | FR | Wikisource FR / Gutenberg (`14790`) | JSON (API), TXT, EPUB |
| B1 | *Le avventure di Pinocchio* | Carlo Collodi | IT | Wikisource IT / LiberLiber | JSON (API), TXT, EPUB |
| B2 | *Le Dernier Jour d'un condamné* | Victor Hugo | FR | Wikisource FR (multi-pages) | JSON (API), HTML |
| B2 | *Rosso Malpelo* (in *Vita dei campi*) | Giovanni Verga | IT | Wikisource IT / LiberLiber | JSON (API), TXT |
| C1 | *Le Horla* | Guy de Maupassant | FR | Wikisource FR / Gutenberg (`10775`) | JSON (API), TXT, EPUB |
| C1 | *Il fu Mattia Pascal* | Luigi Pirandello | IT | Wikisource IT / LiberLiber | JSON (API), EPUB, PDF |
| C2 | *Candide, ou l'Optimisme* | Voltaire | FR | Wikisource FR / Gutenberg (`4650`) | JSON (API), TXT, EPUB |
| C2 | *Inferno* (Divina Commedia) | Dante Alighieri | IT | Wikisource IT | JSON (API), wikitexte |

Ce tableau reprend et vérifie l'analyse initiale (fournie par l'utilisateur, générée par ChatGPT). Les identifiants Gutenberg et titres de pages Wikisource ci-dessous sont ceux relevés dans cette analyse — **à re-vérifier au moment de l'implémentation**, les pages Wikisource peuvent être renommées/réorganisées.

**LiberLiber vs Wikisource IT** : [PREMIUM_PLUS_ANALYSIS.md](PREMIUM_PLUS_ANALYSIS.md) §5 recommandait déjà LiberLiber comme source italienne native pour un chantier voisin ("book-excerpt"). Pour ce chantier, Wikisource IT reste préférable comme source primaire car son API MediaWiki (`action=parse`/`action=query`) donne un decoupage chapitre-par-chapitre structuré nativement (via `list=allpages&apprefix=`), ce que LiberLiber n'offre pas aussi directement (fichiers TXT/EPUB monolithiques). LiberLiber reste une bonne source de repli si une œuvre est mal structurée sur Wikisource.

### Titres de pages Wikisource (à vérifier avant usage)

- FR : `Contes_du_jour_et_de_la_nuit_(éd._Flammarion,_1885)/La_Parure`, `Le_Dernier_Jour_d'un_condamné`, `Le_Horla,_Ollendorff/Le_Horla`, `Candide,_ou_l'Optimisme/Garnier_1877/Texte_entier`
- IT : `Le_avventure_di_Pinocchio`, `Vita_dei_campi_(1881)/Rosso_Malpelo`, `Il_fu_Mattia_Pascal`, `Divina_Commedia/Inferno`

### API MediaWiki (Wikisource)

```
# Contenu d'une page en JSON (HTML)
https://<fr|it>.wikisource.org/w/api.php?action=parse&page=<Titre>&prop=text&format=json&formatversion=2&origin=*

# Wikitexte brut
https://<fr|it>.wikisource.org/w/api.php?action=query&prop=revisions&titles=<Titre>&rvprop=content&rvslots=main&format=json&formatversion=2&origin=*

# Lister les sous-pages (chapitres) d'une œuvre
https://<fr|it>.wikisource.org/w/api.php?action=query&list=allpages&apprefix=<Titre>/&apnamespace=0&aplimit=max&format=json&formatversion=2&origin=*
```

`origin=*` permet l'appel CORS depuis un script Node sans clé API — l'API MediaWiki est publique et gratuite.

---

## 3. Étape 1 — Récupération et découpage en chapitres

- **Wikisource** : lister les sous-pages avec `list=allpages&apprefix=`, trier **numériquement** (pas alphabétiquement — `1, 10, 11, 2` est un piège classique), récupérer chaque chapitre via `action=parse`, nettoyer le HTML (suppression des bandeaux d'édition Wikisource, notes de bas de page numérotées, liens internes) pour ne garder que le texte de l'œuvre.
- **Project Gutenberg** : téléchargement direct TXT/EPUB (`https://www.gutenberg.org/cache/epub/<id>/pg<id>.txt`), découpage par script sur les marqueurs de chapitre (`CHAPITRE`, `CAPITOLO`, numérotation romaine). Pour un usage ponctuel (8 œuvres, pas un scraping massif), le téléchargement direct des fichiers `cache/epub/` est conforme aux règles d'accès robot de Gutenberg — pas besoin du mécanisme miroir/robot dédié à l'aspiration massive.
- **Sortie intermédiaire** : texte brut par chapitre, **hors du catalogue applicatif**, ex. `sources/raw/<oeuvre>/chapitre-01.txt` (dossier à ajouter au repo ou tenu localement, pas encore décidé — voir §8). Rien n'est écrit dans `src/` tant que le chapitre n'est pas passé par le pipeline d'annotation (§5).
- **Attention légale** : l'œuvre elle-même est dans le domaine public (auteurs morts depuis >70 ans), mais l'**édition** utilisée (numérisation, notes, préface moderne) peut avoir ses propres droits. Ne conserver que le texte brut de l'œuvre, exclure appareil critique/préfaces d'éditeurs modernes, vérifier au cas par cas l'édition Wikisource/Gutenberg choisie.

---

## 4. Étape 2 — Nouveau schéma "livre à chapitres"

Un livre est stocké séparément du catalogue de textes courts, dans un nouveau dossier (ex. `src/books/<book-id>/`), avec deux niveaux :

**Manifeste** — `src/books/<book-id>/book.json` :

```json
{
  "id": "pinocchio",
  "title": "Le avventure di Pinocchio",
  "author": "Carlo Collodi",
  "language": "it",
  "level": "B1",
  "levelNote": "Niveau indicatif — texte authentique non simplifié",
  "publicationYear": 1883,
  "source": {
    "provider": "Wikisource",
    "pageTitle": "Le_avventure_di_Pinocchio",
    "retrievedAt": "2026-07-24"
  },
  "chapters": [
    { "id": "01", "title": "Come andò che maestro Ciliegia..." },
    { "id": "02", "title": "Maestro Ciliegia regala il pezzo di legno..." }
  ]
}
```

**Chapitre** — `src/books/<book-id>/<chapter-id>.json`, **même schéma que le texte actuel** (`src/texts/<id>.json`) pour maximiser la réutilisation du lecteur et du pipeline de validation :

```json
{
  "id": "pinocchio-01",
  "paragraphs": ["— Nell'antichità...", "..."],
  "words": { "antichità": "antiquité", "...": "..." },
  "sentences": { "Nell'antichità... c'era un pezzo di legno.": "..." },
  "questions": [ { "q": "...", "options": ["..."], "correct": 0 } ]
}
```

**Index** : soit un fichier séparé `src/books/index.json` (recommandé — évite de mélanger deux concepts de contenu différents dans `src/texts/index.json`, qui est consommé par beaucoup de code existant en supposant "un texte court = une entrée"), listant `{id, title, author, language, level, chapterCount, wordCount}` par livre. Choix définitif à faire en implémentation selon ce qui simplifie le plus `LibraryView.vue`.

---

## 5. Étape 3 — Pipeline d'annotation via agents Claude

Le pipeline existant [scripts/generate-text.mjs](scripts/generate-text.mjs) **génère** un texte à partir d'un sujet (API Claude, structured outputs, validation de couverture lexicale avec jusqu'à 2 passes de réparation — même découpage que `ReaderView`/`translate.js`). Pour ce chantier, il faut un mode différent : **annotation**, pas génération — le texte d'entrée est fixe (le chapitre récupéré à l'étape 1), l'agent ne doit produire que `words`, `sentences`, `questions`, sans toucher à `paragraphs`.

Nouveau script à créer, ex. `scripts/annotate-chapter.mjs`, repris du script existant :
- **Entrée** : texte brut d'un chapitre (issu de `sources/raw/`).
- **Prompt** : demander explicitement à Claude de ne pas reformuler/simplifier le texte, seulement de le segmenter (si besoin) et d'annoter chaque mot unique + chaque phrase avec sa traduction, plus un quiz de compréhension.
- **Validation** : réutiliser la même logique de couverture lexicale totale que `scripts/generate-text.mjs`/`generator/` (chaque mot et chaque phrase du texte doit avoir sa traduction, vérifié avec le découpage exact de `ReaderView`/`translate.js`), avec passes de réparation automatiques.
- **Sortie** : `src/books/<book-id>/<chapter-id>.json`.

**Point ouvert à trancher en implémentation** : un chapitre de roman peut largement dépasser les ~1300 mots de la plus grande taille gérée aujourd'hui (`molto_lungo`). Deux options : (a) découper un chapitre en plusieurs sous-appels LLM par tranche de paragraphes avec fusion du lexique/phrases en sortie, ou (b) un seul appel avec un prompt/contexte plus long (les modèles Claude actuels supportent largement un chapitre de roman en contexte, la limite pratique est plutôt le prompt de sortie structuré + coût). Option (b) plus simple à tester en premier.

---

## 6. Étape 4 — Lecture dans l'app

- **Nouvelle vue** `BookReaderView.vue`, à côté de [ReaderView.vue](src/views/ReaderView.vue) : affiche un sommaire de chapitres (depuis `book.json`), charge le chapitre courant en lazy (`import.meta.glob`, même mécanisme que l'existant), et réutilise **sans les dupliquer** : le moteur de traduction au clic/survol ([translate.js](src/translate.js), [TranslationOverlay.vue](src/components/TranslationOverlay.vue)), le TTS ([tts.js](src/tts.js)), le quiz de fin de chapitre ([QuizSection.vue](src/components/QuizSection.vue)).
- **Navigation** : chapitre précédent/suivant au lieu de texte précédent/suivant (adjacence dans `book.json.chapters`, pas dans `textsIndex`).
- **Bibliothèque** : nouvelle section "Classiques" / "Domaine public" dans [LibraryView.vue](src/views/LibraryView.vue), distincte du catalogue généré — cohérent avec l'onglet "Classiques" déjà esquissé dans `PREMIUM_PLUS_ANALYSIS.md` §6.
- **Progression** ([progress.js](src/progress.js)) : étendre `markRead()` (aujourd'hui "texte lu") à "chapitre lu", avec un statut "livre terminé" agrégé côté `book.json`.
- **Mode vocabulaire** ([VocabularyView.vue](src/views/VocabularyView.vue), [vocab.js](src/lib/vocab.js)) : fonctionne déjà par agrégation de `words` par texte-id — un chapitre de livre peut être marqué "en mode vocabulaire" exactement comme un texte court, sans changement de logique côté `vocab.js`.

---

## 7. Monétisation et priorisation

`PREMIUM_PLUS_ANALYSIS.md` (§3, §5-6) a déjà identifié le contenu "domaine public" comme une des trois briques candidates du palier Premium+ à 15 CHF, et son audit conclut que **lancer ce palier avant d'avoir validé la conversion du Premium existant à 5 CHF est prématuré**. Ce chantier "Lettore Ebook" doit être traité comme une **feature indépendante et testable seule** :

- Elle peut être livrée et mesurée (engagement, temps de lecture) sans dépendre du lancement de Premium+.
- Elle peut rester gratuite ou réservée au Premium existant (5 CHF) dans un premier temps, plutôt que d'attendre un nouveau palier non encore validé.
- Si l'usage confirme l'intérêt, elle devient un argument de vente naturel pour Premium+ plus tard (cf. l'ordre suggéré en §6 de `PREMIUM_PLUS_ANALYSIS.md` : "domaine public en dernier — le moins différenciant, le plus facile à faire bien").

---

## 8. Plan d'implémentation par étapes (résumé actionnable)

1. **Pilote sur une œuvre courte et à chapitre unique** — *Rosso Malpelo* (une seule nouvelle, pas de découpage multi-chapitres à gérer) : valider la récupération Wikisource, le script d'annotation, et le rendu dans un `BookReaderView.vue` minimal avant de s'attaquer aux romans longs.
2. Script de récupération + découpage en chapitres (Wikisource API + Gutenberg TXT), sortie dans `sources/raw/`.
3. Script `scripts/annotate-chapter.mjs` (annotation LLM + validation de couverture lexicale, réutilisant la logique de `scripts/generate-text.mjs`).
4. Schéma `book.json` + chapitres, décision sur l'index (`src/books/index.json` vs extension de `src/texts/index.json`).
5. `BookReaderView.vue` + entrée "Classiques" dans la bibliothèque + extension `progress.js`.
6. Généraliser aux 7 autres œuvres, en commençant par les plus courtes (*La Parure*, *Le Horla*) avant les romans longs (*Pinocchio*, *Candide*, *Il fu Mattia Pascal*, *Le Dernier Jour d'un condamné*, *Inferno*).

---

## 9. Risques et limites

- **Fidélité de traduction sur un texte du XIXe siècle** : vocabulaire daté (ex. "calèche", "billet de mille"), tournures syntaxiques différentes du français/italien contemporain enseigné aux niveaux A1-B1 — le lexique généré doit rester fidèle au texte, pas "moderniser" implicitement en traduisant.
- **Volume de travail LLM** : annoter un roman entier (dizaines de chapitres) représente un coût et un temps de traitement significativement plus élevés qu'un texte court généré — à chiffrer une fois le pilote (§8.1) validé.
- **Légalité des éditions sources** : vérifier au cas par cas l'absence de droits résiduels sur l'édition Wikisource/Gutenberg retenue (numérisation, notes, préface) avant intégration.
- **Confusion de niveau CECR** : le niveau "indicatif" d'un classique authentique (ex. Pinocchio = B1) n'est pas calibré de la même façon que les niveaux du catalogue généré (validés par la contrainte de génération). Il faut afficher clairement cette différence dans l'UI (`levelNote` dans `book.json`, badge visuel distinct) pour ne pas induire l'utilisateur en erreur sur la difficulté réelle du texte.
- **Pas de simplification par niveau** : contrairement au catalogue généré, un utilisateur A1/A2 n'aura pas de version adaptée de ces œuvres — ce chantier cible plutôt les niveaux B1+ qui peuvent déjà aborder un texte authentique avec l'aide du lexique intégré.
