# Bookprocess — comment un livre du domaine public devient un "livre" Leggendo

Document technique : décrit précisément le pipeline exécuté pour *Le avventure di Pinocchio* (35/36 chapitres finalisés au moment de l'écriture, le dernier — le plus long — en cours), pour pouvoir le reproduire sur d'autres œuvres. Complète [LETTORE_EBOOK.md](LETTORE_EBOOK.md) (la conception) avec le détail opérationnel de ce qui a réellement tourné.

**Prérequis pour lire ce document** : connaître le schéma de contenu Leggendo (`paragraphs`/`words`/`sentences`/`questions`, couverture lexicale totale — voir [ARCHITECTURE.md](ARCHITECTURE.md)) et la structure "livre à chapitres" (`src/books/<book-id>/book.json` + un fichier par chapitre, même schéma qu'un texte).

---

## 1. Vue d'ensemble du pipeline (4 étapes, 5 scripts)

```
sources/raw/<book-id>/chapitre-NN.txt   ←── scripts/fetch-book.mjs (Wikisource)
            │
            ▼
sources/raw/<book-id>/chapitre-NN.txt ──→ scripts/list-required.mjs ──→ liste EXACTE des mots/phrases à traduire
            │                                                                    │
            │                                                                    ▼
            │                                                     traduction (agent Claude Code, PAS l'API directe)
            │                                                                    │
            ▼                                                                    ▼
        (texte source, jamais modifié)  ──────────────────────→ scripts/zip-annotation.mjs (assemble it+fr)
                                                                                   │
                                                                                   ▼
                                                                  scripts/finalize-chapter.mjs (valide + écrit)
                                                                                   │
                                                                                   ▼
                                                          src/books/<book-id>/<book-id>-NN.json (chapitre fini)

Une fois tous les chapitres écrits : scripts/finalize-book.mjs → book.json + src/books/index.json
```

Chaque étape est un script Node autonome (zéro dépendance npm, cohérent avec `generator/` et `scripts/` existants). Rien n'est écrit dans `src/books/` tant que la validation de couverture n'est pas passée — mêmes garanties que le catalogue existant.

---

## 2. Étape 1 — Récupération (`scripts/fetch-book.mjs`)

```bash
node scripts/fetch-book.mjs --site it --page "Le avventure di Pinocchio" --prefix Capitolo --book-id pinocchio
```

- Liste les sous-pages via l'API MediaWiki (`action=query&list=allpages&apprefix=...`), triées **numériquement** (l'ordre alphabétique donnerait 1, 10, 11, 2…).
- Récupère chaque chapitre en HTML (`action=parse`), avec retry/backoff exponentiel sur les 429 (Wikimedia rate-limite les clients anonymes — délai de base 3 s, doublé à chaque tentative, jusqu'à 6 tentatives).
- **Nettoyage HTML non trivial** — trois pièges rencontrés et corrigés :
  1. Un regex `<p>(.*?)</p>` naïf casse sur les figures d'illustration flottantes (légende imbriquée dans un `<p>` interne) : il coupe au premier `</p>` rencontré, pas celui du vrai paragraphe, et recolle des bouts de phrases sans rapport (ex. un mot de légende inséré au milieu d'une phrase du texte). **Fix** : `stripBalanced()`, un retire-balise qui compte la profondeur d'imbrication avant de couper.
  2. Un bloc de métadonnées Dublin Core caché (`<div style="display:none">`) contient un faux "paragraphe" (`<dc:title>…`). **Fix** : même `stripBalanced()`, ciblé sur `style="display:none"`.
  3. Les `<br />` à l'intérieur d'un `<p>` disparaissaient silencieusement au stripping de balises, recollant deux phrases sans espace (`"...ritrova?Leggete..."`). **Fix** : remplacer `<br>` par un espace avant le strip générique.
- Le **premier paragraphe** de chaque chapitre est conventionnellement le résumé/titre du chapitre (ex. *"Come andò che Maestro Ciliegia…"*) — retiré du corps et utilisé comme `title` du chapitre.
- Sortie : `sources/raw/<book-id>/chapitre-NN.txt` (texte brut, paragraphes séparés par une ligne vide) + `manifest.json` (liste des chapitres, titre Wikisource, date de récupération).

**Validation faite pour Pinocchio** : relecture manuelle de plusieurs chapitres (dont les plus illustrés) pour confirmer l'absence de résidus HTML/CSS/métadonnées avant de lancer l'annotation.

---

## 3. Étape 2 — Liste exacte à traduire (`scripts/list-required.mjs`)

```bash
node scripts/list-required.mjs --book-id pinocchio --chapter 01
# → { title, paragraphCount, words: [...], sentences: [...] }
```

**C'est la pièce la plus importante du pipeline**, née d'un échec du premier essai (voir §5.1). Elle calcule, à partir du texte source, exactement ce que le lecteur (`ReaderView`/`translate.js`) ira chercher :

- `words` : chaque token unique (dédupliqué), dans sa **forme exacte** telle qu'elle apparaît (pas le lemme), via `tokenizeWords()` (regex Unicode sur les lettres).
- `sentences` : le découpage **mécanique** du lecteur — `splitSentences()` coupe sur chaque `.`/`!`/`?`, ce qui produit parfois des fragments courts (un tiret cadratin seul `—`, une réplique de dialogue coupée en plein milieu) que le lecteur affichera et cherchera à traduire séparément.

Réutilise les fonctions déjà exportées par `scripts/lib/schema.mjs` (les mêmes utilisées pour valider le catalogue de textes courts existant) — aucune nouvelle logique de découpage, donc aucun risque de divergence avec le lecteur réel.

---

## 4. Étape 3 — Traduction (agents Claude Code, pas l'API Anthropic)

**Décision clé** : deux pipelines de traduction existent dans le repo, un seul a servi pour Pinocchio.

| Pipeline | Fichiers | Nécessite |
|---|---|---|
| API Anthropic directe | `scripts/annotate-chapter.mjs`, `scripts/orchestrate-book.mjs`, `scripts/lib/annotate.mjs` | `ANTHROPIC_API_KEY` (absent de cet environnement) |
| **Agents Claude Code (utilisé)** | aucun script dédié — un agent par chapitre, via l'outil Agent | rien (le modèle traduit lui-même, dans la session) |

Le protocole donné à chaque agent (identique pour les 36 chapitres, seul le numéro change) :

1. `node scripts/list-required.mjs --book-id pinocchio --chapter NN > req-NN.json`
2. Traduire `words` et `sentences` en produisant **deux tableaux parallèles** (`wordTranslations`, `sentenceTranslations`) — même ordre, même longueur que `req-NN.json`, sans jamais reproduire le texte italien lui-même (élimine tout risque de divergence orthographique/apostrophe, voir §5.1). Plus 3 questions de compréhension en italien.
3. Écrire ces tableaux dans des fichiers `wt-NN.json` / `st-NN.json` / `questions-NN.json`.
4. `node scripts/zip-annotation.mjs req-NN.json wt-NN.json st-NN.json questions-NN.json final-NN.json` — réassemble en paires `{it, fr}` par position ; **échoue bruyamment** (exit 2) si les longueurs ne correspondent pas.
5. `node scripts/finalize-chapter.mjs --book-id pinocchio --chapter NN --annotation final-NN.json` — revalide la couverture lexicale totale (comme le catalogue existant) et écrit `src/books/pinocchio/pinocchio-NN.json` seulement si tout est couvert.
6. En cas d'échec (mots/phrases manquants), l'agent corrige et relance 4-5 — c'est presque toujours une erreur de comptage mécanique, jamais un vrai trou de contenu (la liste de l'étape 2 est déjà complète et exacte).

**Orchestration** : dispatché en 5 lots de 6-8 chapitres en parallèle (`Agent` avec plusieurs appels dans un seul message → agents en arrière-plan, notifiés à la complétion). Chaque agent est indépendant et auto-validant (le script `finalize-chapter.mjs` est le filet de sécurité final, pas la bonne foi de l'agent).

---

## 5. Problèmes rencontrés et corrigés (à ne pas refaire sur les prochains livres)

### 5.1 Apostrophe courbe vs droite → phrases introuvables

Le texte source utilise l'apostrophe typographique `’` (U+2019, ex. *"C’era"*). Le premier essai de traduction (fait par un agent qui recopiait le texte italien dans sa réponse) est revenu avec des apostrophes droites `'`. Le lecteur cherche une traduction par **correspondance exacte** de la phrase (`normalizeSentence()` ne touche pas aux apostrophes, seulement aux espaces) — résultat : 100 % des phrases avec apostrophe étaient introuvables malgré une traduction correcte.

**Double correction** :
- `remapSentences()` (`scripts/lib/book-schema.mjs`) rattache chaque phrase reçue à la vraie phrase source par comparaison tolérante (casse + apostrophe + espaces), puis l'indexe sous la clé **exacte** du texte source — jamais celle de l'agent.
- Plus robuste encore, adopté ensuite : ne plus jamais laisser l'agent recopier le texte italien — il ne reçoit et ne renvoie que des traductions positionnelles (§4, étape 2). Le texte source ne transite plus que par `list-required.mjs`, donc il ne peut plus diverger.

### 5.2 Regroupement "naturel" des phrases par l'agent ≠ découpage mécanique du lecteur

Un premier essai a laissé l'agent décider lui-même comment découper les phrases ("comme un lecteur normal le ferait"). Résultat : l'agent regroupait des répliques de dialogue en une seule "phrase" (ex. fusionnait `"...borbottò a mezza voce:"` avec la réplique qui suit), alors que `splitSentences()` les traite comme deux entrées distinctes. 12 phrases sur 33 ne correspondaient à rien.

**Correction** : ne plus jamais demander à l'agent de choisir un découpage — lui fournir directement la liste exacte (`list-required.mjs`, §3) et n'exiger qu'une traduction positionnelle. Zéro échec de correspondance depuis ce changement.

### 5.3 Collision de fichiers scratch entre agents parallèles

Un agent a improvisé un script utilitaire générique (`build-wt.mjs`) dans le dossier scratch partagé `/tmp/pinocchio-ann/` ; un autre agent tournant en parallèle sur un autre chapitre a écrasé ce fichier avec sa propre version. Sans conséquence sur le résultat (fichiers de sortie `wt-NN.json` bien nommés par chapitre, non affectés), mais un signal à corriger.

**Correction** : consigne explicite dans les prompts suivants — n'écrire que des fichiers nommés avec le numéro de chapitre, ne jamais créer de script utilitaire partagé, utiliser l'outil d'écriture directement plutôt qu'un script généré.

### 5.4 Liste de mots dédupliquée → ne pas ajouter d'entrée pour un mot répété

`list-required.mjs` déduplique `words` (chaque forme unique une seule fois). Plusieurs agents ont, sur les premières tentatives, ajouté une traduction supplémentaire pour une occurrence répétée d'un mot déjà traduit plus haut — cassant l'alignement positionnel. Signalé explicitement dans les prompts des lots suivants ("words is a DEDUPLICATED list — don't add extra entries for repeats"), a réduit mais pas éliminé le phénomène ; le filet de sécurité (`zip-annotation.mjs` refuse toute longueur incorrecte) l'a rattrapé à chaque fois.

---

## 6. Étape 4 — Assemblage final (`scripts/finalize-book.mjs`)

```bash
node scripts/finalize-book.mjs --book-id pinocchio --title "Le avventure di Pinocchio" \
  --author "Carlo Collodi" --language it --level B1
```

Reconstruit **à partir de ce qui existe réellement sur disque** (pas d'état intermédiaire à faire confiance) :
- `src/books/pinocchio/book.json` — manifeste (id, titre, auteur, langue, niveau indicatif, source Wikisource, liste ordonnée des chapitres avec leur titre).
- `src/books/index.json` — entrée d'index léger (id, titre, auteur, niveau, nombre de chapitres finalisés / total, nombre de mots) pour `BooksView.vue`.

Idempotent — relançable à tout moment, y compris avec des chapitres partiellement finalisés (`chapterCount < totalChapterCount` reste cohérent tant que le livre n'est pas complet).

---

## 7. Ce qui a aussi été construit (hors pipeline de contenu)

- `src/views/BooksView.vue` — bibliothèque "Classici", liste les livres depuis `src/books/index.json`.
- `src/views/BookReaderView.vue` — lecteur à chapitres : sommaire, navigation chapitre à chapitre, réutilise tel quel `translate.js`, `TranslationOverlay.vue`, `tts.js`, `QuizSection.vue`, `progress.js` (un chapitre est marqué "lu" comme un texte normal, id namespacé `<book-id>-<chapitre>`).
- Routes `/classici` et `/classici/:bookId/:chapterId` + entrée nav "Classici" dans `SiteHeader.vue`.
- `npm run build` validé avec ces ajouts (aucune régression sur le catalogue existant).

---

## 8. ⚠️ Écart important pour la nouvelle collection de 11 livres

La demande la plus récente de l'utilisateur change une hypothèse structurante de ce pipeline :

> *Pinocchio a été traité comme un texte **authentique intégral**, niveau CECR indicatif (B1) mais sans aucune réécriture du texte source* — décision actée dans [LETTORE_EBOOK.md](LETTORE_EBOOK.md) §1.

La collection de 11 livres proposée demande, pour les niveaux **A1, A2 et une partie du B1** (ex. *Cuore*), une **adaptation simplifiée en italien moderne** — pas le texte ancien tel quel. C'est un **chantier différent, pas encore construit** :

- Le pipeline actuel (§2-§6) suppose que `paragraphs` est fixe et extrait tel quel de la source (`fetch-book.mjs`) — aucune étape de réécriture n'existe.
- Une adaptation A1/A2 (500-2500 mots, vocabulaire contrôlé, temps simples) ressemble plutôt à ce que fait déjà `generator/orchestrate-matrix.mjs` pour le catalogue de textes courts (génération par LLM calibrée par niveau) — mais appliquée à une **trame narrative existante** plutôt qu'à un sujet libre. Il faudrait un nouveau script (`scripts/adapt-chapter.mjs` ou équivalent) inséré **avant** l'étape d'annotation : entrée = texte brut source, sortie = texte réécrit au niveau cible, qui devient ensuite le nouveau texte "figé" passé à `list-required.mjs`/l'annotation (§3-§4 s'appliquent alors normalement sur le texte adapté, pas l'original).
- Pour **B2 à C2** (*Rosso Malpelo*, *Le novelle della nonna*, *Il fu Mattia Pascal*, *Inferno*, *Il Principe*), le texte reste authentique : le pipeline Pinocchio (§2-§6) s'applique **tel quel**, sans modification.

**Avant de lancer la collection de 11 livres**, il faut donc trancher et probablement construire l'étape d'adaptation manquante pour les niveaux A1/A2/B1-partiel — une session de conception dédiée, pas une simple répétition du pipeline Pinocchio.
