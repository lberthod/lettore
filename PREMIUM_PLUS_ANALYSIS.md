# Analyse — Palier "Premium+" (15 CHF/mois)

Document de travail : évalue la faisabilité, la rentabilité et les risques d'un nouveau palier d'abonnement **Premium+ à 15 CHF/mois**, au-dessus du Premium actuel (5 CHF/mois, [`src/lib/stripe.js`](src/lib/stripe.js)), qui donnerait accès à :
1. **Notifications** dès qu'un nouveau texte personnalisé est prêt
2. **Jusqu'à 3 textes générés par jour**, sur le thème ou l'actualité italienne au choix de l'utilisateur
3. **Une bibliothèque d'ebooks classiques traduits et gradués** (niveau A1–C2), voir §5 pour la liste retenue

Statut de l'app au moment de l'analyse (24.07.2026) : petit projet indépendant, 454 textes au catalogue, palier Premium existant **scaffoldé mais pas branché** (le webhook Stripe → rôle Firestore n'est pas encore connecté selon `ARCHITECTURE.md`), fonctionnalité de génération à la demande ("Créer son texte") déjà en production via `leggendo-server/`.

---

## Verdict en une phrase

**Go conditionnel, pas immédiat.** L'architecture technique ne pose pas de problème (le socle existe déjà, §6) et la rentabilité est confortable à 15 CHF (marge ≈ 72%, §2.4). Le vrai risque n'est pas le prix ni le coût : c'est le séquencement produit — lancer Premium+ avant d'avoir la moindre preuve que quiconque paie déjà pour le Premium actuel à 5 CHF, qui n'est même pas encore vendu. Voir §3 pour le détail et une trajectoire alternative à faible risque.

---

## 1. Positionnement et benchmark marché

### Grille de prix envisagée
| Palier | Prix | Statut actuel |
|---|---|---|
| Gratuit | 0 CHF | Actif (aperçu 6 textes) |
| Premium | 5 CHF/mois (45 CHF/an) | Scaffoldé, **paiement non branché** |
| Enseignant | 20 CHF/mois | Scaffoldé, **paiement non branché** |
| Premium+ (proposé) | 15 CHF/mois | À l'étude |

### Benchmark (prix indicatifs, convertis en ordre de grandeur CHF)
| Produit | Prix/mois | Ce que ça inclut |
|---|---|---|
| Duolingo Super | ~13 CHF | Cœur illimité, pas de pub, exercices — pas de génération LLM personnalisée |
| Babbel | ~13 CHF | Cours structurés multi-langues |
| LingQ | ~13 CHF | Bibliothèque + lecture assistée, proche du concept de Leggendo |
| Busuu | ~14 CHF | Cours + correction communautaire |
| italki (tuteur humain) | 20–40 CHF **par session**, pas par mois | Interaction humaine réelle |

**Constat** : à 15 CHF/mois, Premium+ se situe légèrement au-dessus des apps de langue auto-guidées établies (~13-14 CHF) — un écart faible et défendable (~1-2 CHF), justifiable par du contenu personnalisé et frais (actualité + génération à la demande) plutôt que du contenu figé. Ça reste un prix à valider par la demande réelle : aucun de ces concurrents n'offre de génération LLM par abonné, donc il n'y a pas de comparable direct pour cette partie de l'offre.

### Qui paierait 3× le prix du Premium actuel ?
Aucune donnée d'usage n'existe encore (Premium n'est pas vendu) pour étayer une segmentation. L'hypothèse la plus défendable — apprenants motivés/avancés (B2+) voulant du contenu frais et personnalisé — est plausible mais non vérifiée. Un écart de 3× avec le Premium à 5 CHF est une marche raisonnable à franchir psychologiquement pour un utilisateur déjà convaincu par Premium, mais ça reste sur une base d'utilisateurs probablement de l'ordre de quelques centaines à low-thousands (projet indépendant, pas d'acquisition payante identifiée) — donc un volume d'abonnés Premium+ vraisemblablement modeste au lancement.

---

## 2. Modèle de rentabilité

### 2.1 Coût variable LLM par abonné (le poste dominant)

Coût réel communiqué : **$0.05 par génération** de texte (modèle GLM déjà utilisé par `generator/` et `leggendo-server/`).

**Pour un abonné Premium+** (3 news/jour × 30 j + 3 générations privées/mois = **93 textes/mois**) :
- 93 × $0.05 ≈ **$4.65/mois** (~4.15 CHF/mois au cours actuel)

**Marge de contribution ≈ 15 − 4.15 = 10.85 CHF/abonné (~72%)**, un taux de marge très correct pour un produit numérique. Le coût LLM n'est pas le facteur limitant de la rentabilité (voir §2.4), mais à 15 CHF il représente un poste réel (~28% du prix) — à surveiller si les quotas de génération augmentent à l'avenir.

Note : les **ebooks classiques (§5) ne rentrent pas dans ce calcul** — ce sont des textes produits **une fois** (comme le reste du catalogue statique), pas générés à chaque abonné. Leur coût est donc fixe et négligeable (8 œuvres × quelques appels LLM chacune pour la traduction/adaptation), pas variable par abonné.

### 2.2 Coût de la source d'actualité

Point d'architecture important : si les 3 textes/jour sont générés **une fois par niveau/thème** (pool partagé filtré ensuite par utilisateur, comme le fait déjà `orchestrate-matrix.mjs` pour le catalogue statique) plutôt qu'**un appel dédié par abonné**, le coût de la source news devient un **coût fixe partagé**, pas un coût variable par utilisateur — ce qui change complètement l'équation à l'échelle (voir comparatif §4, l'option RSS rend ce poste quasi gratuit de toute façon).

### 2.3 Coûts fixes réels
- **Développement** : cette feature n'est pas un ajustement de config, c'est un vrai chantier — nouveau type de job serveur, cron 3×/jour, sourcing + filtrage news, pipeline domaine public, nouveau palier Stripe/Firebase, UI dédiée. Ordre de grandeur réaliste : **plusieurs semaines** de développement pour un développeur solo travaillant dessus par intermittence, pas quelques jours.
- **VPS/infra** : delta marginal faible (le cron et le serveur existent déjà).
- **Maintenance continue** : c'est le coût caché le plus sous-estimé habituellement — surveiller la qualité des news reformulées (risque de contresens, de titres trompeurs, de contenu daté), gérer les échecs de génération, réagir si une source RSS change de format. Un flux automatisé quotidien qui échoue silencieusement dégrade la valeur perçue *après* que l'utilisateur a payé, ce qui est pire qu'une feature qui n'existe pas.

### 2.4 Seuil de rentabilité
Avec une marge de contribution d'environ 10.85 CHF par abonné, la question n'est pas "combien d'abonnés pour couvrir le coût LLM" (relativement peu) mais **"combien d'abonnés pour justifier le temps de développement investi"** :

| Scénario | Abonnés Premium+ | Marge mensuelle brute | Interprétation |
|---|---|---|---|
| Pessimiste | 1–3 | ~11–33 CHF/mois | Ne couvre jamais des semaines de dev ; à peine symbolique |
| Réaliste (lancement) | 10 | ~109 CHF/mois | Marge positive, mais amortissement du dev sur plusieurs années à ce rythme |
| Optimiste | 50 | ~543 CHF/mois | Commence à être un vrai revenu complémentaire |
| Très optimiste | 200 | ~2170 CHF/mois | Suppose une base d'utilisateurs bien plus large que ce que le projet a probablement aujourd'hui |

**Le facteur limitant est l'acquisition et la conversion, pas le coût marginal** (la marge résiduelle à 72% reste largement positive à tous les volumes) — deux choses que le projet n'a pas encore testées, puisque même le Premium à 5 CHF n'est pas vendu.

### 2.5 Comment le prix de 15 CHF est fondé
Trois ancrages à combiner, pas à choisir isolément :
1. **Cost-plus (plancher, pas cible)** : à $0.05/génération et 93 générations/mois, le coût variable (~4.15 CHF) fixe un plancher bien en dessous de 15 CHF — même un prix à 8 CHF laisserait encore ~48% de marge. Le coût confirme que 15 CHF est confortablement rentable, sans dicter que ce soit le prix "optimal".
2. **Ancrage marché (§1)** : à 15 CHF, l'écart avec les concurrents établis (~13-14 CHF) est faible et défendable.
3. **Disposition à payer mesurée, pas devinée** : la marge étant confortable à ce niveau, le risque n'est pas de perdre de l'argent sur le coût, c'est de fixer un prix qui ne convertit pas assez d'abonnés pour rentabiliser le développement. À valider par un vrai test (page de pré-vente, sondage, ou bêta limitée) avant de considérer 15 CHF comme définitif.

### 2.6 Comparaison avec l'alternative : mieux vendre le Premium existant
À 5 CHF/mois, il faudrait **3× plus d'abonnés** pour égaler la marge brute d'un abonné Premium+ à 15 CHF — mais la barre de conversion à 5 CHF est très probablement plus basse (moins de friction, moins besoin de "prouver" la valeur). Il reste plausible qu'**améliorer la conversion sur le Premium existant (déjà scaffoldé, juste pas branché) rapporte plus, plus vite, avec un risque de dev quasi nul**, comparé à construire 3 nouvelles fonctionnalités pour un nouveau palier. C'est l'option qui n'a presque aucun coût d'opportunité puisque le travail (Stripe, rôles, quotas) est déjà fait à 90% — il ne manque que le branchement du webhook.

---

## 3. Audit critique — pourquoi cette idée, telle que formulée, est prématurée

### 3.1 Problème de séquencement (le plus important)
Le palier Premium à 5 CHF **n'est pas encore vendu** : `ARCHITECTURE.md` indique explicitement que "le contrôle d'accès Premium côté client n'est pas encore branché". Lancer un palier à 15 CHF avant d'avoir la moindre donnée de conversion sur le palier à 5 CHF revient à fixer un prix premium sur une hypothèse empilée sur une autre hypothèse. Il n'y a aujourd'hui **aucun signal de demande réel** — ni pour le Premium de base, ni a fortiori pour du contenu d'actualité.

### 3.2 Risque de cannibalisation / confusion tarifaire
Un écart de 3× entre 5 CHF et 15 CHF reste à justifier clairement : les 3 features supplémentaires (news, livres, génération) doivent être *démontrées* comme valant 10 CHF de plus, pas simplement listées — sinon un visiteur indécis risque de ne rien acheter du tout, faute de repère de valeur clair sur un produit qui n'a pas encore de base d'utilisateurs payants établie.

### 3.3 Fragilité du contenu généré automatiquement
- **Actualité + LLM = risque réputationnel spécifique** : une reformulation qui déforme un fait (nom, chiffre, date) dans un texte présenté comme "actualité" est un problème de crédibilité différent d'une fable générée pour l'apprentissage — l'utilisateur peut légitimement s'attendre à ce que "l'actualité" soit factuellement fiable.
- **Latence perçue** : un flux généré 3×/jour n'est pas du "live", et un utilisateur habitué aux vraies apps d'actu remarquera vite si le contenu est générique, répétitif ou décalé par rapport aux gros titres du jour.
- **Aucun contrôle qualité humain prévu** dans l'architecture actuelle (le catalogue statique a une validation *structurelle* — couverture lexicale — pas une validation *factuelle*).

### 3.4 Ce que l'audit recommande à la place (MVP à faible risque)
Plutôt que de construire les 3 fonctionnalités de Premium+ d'un coup pour un palier non testé :
1. **Brancher d'abord le webhook Stripe → rôle Firestore** pour le Premium existant à 5 CHF (travail minime, le reste est déjà codé) et mesurer la conversion réelle pendant quelques semaines/mois.
2. **Tester la demande pour du contenu d'actualité séparément et à moindre coût** : par exemple, ajouter 1 texte d'actualité par jour *dans le Premium existant* (5 CHF) plutôt que créer un 3ᵉ palier — ou plus simple encore, une liste d'attente / sondage in-app ("voudrais-tu des textes sur l'actu du jour ?") avant d'écrire une ligne de code de génération.
3. **Ne construire "Premium+" à 15 CHF que si ces deux signaux sont positifs** — c'est-à-dire si (a) le Premium à 5 CHF convertit correctement et (b) une part significative des Premium existants demande explicitement plus de contenu personnalisé/frais.

**Verdict assumé : go conditionnel.** L'architecture technique et le prix sont tous deux défendables (§6, §2.5) — c'est le séquencement produit qui est le vrai risque. Construire Premium+ avant d'avoir validé Premium revient à optimiser un étage qui n'a pas de fondations vérifiées.

---

## 4. Comparatif des sources d'actualité

| Option | Coût | Effort d'intégration | Droits/légal | Couverture italienne |
|---|---|---|---|---|
| **NewsAPI.org** | Gratuit = dev/localhost only, usage commercial interdit ; payant à partir de **$449/mois** | Faible (API REST simple) | OK si payant | Filtrage par langue dispo, mais dev tier inutilisable en prod |
| **GNews** | Gratuit ≈ 100 req/jour mais plafonné à 10 articles/requête (donc ~10 requêtes réelles avant d'épuiser le quota) ; payant dès **$84/mois** | Faible | Usage commercial permis même en gratuit | Multi-langue, dont italien |
| **Mediastack** | Gratuit très limité (100–500 requêtes/**mois** selon la source) ; entrée payante dès **$11/mois** (10 000 req/mois) | Faible | Confirmé pour usage commercial en payant | Filtrage langue/pays disponible |
| **Flux RSS de médias italiens** (ANSA, Corriere della Sera, RaiNews, Il Post) | **Gratuit**, aucune clé API | Moyen : parsing XML, dédoublonnage, filtrage par thème/actualité soi-même | Republication brute interdite → **reformulation LLM obligatoire** (ce que l'app fait déjà pour la génération de textes, donc pas un coût supplémentaire) | Excellente — sources italiennes natives, pas de traduction de couverture nécessaire |
| **Google News RSS par mot-clé** | Gratuit | Faible-moyen (RSS structuré mais générique, moins de métadonnées) | Même contrainte de reformulation | Correct via paramètre de langue/région |

### Recommandation
**RSS de médias italiens (ANSA/Il Post en tête) comme source brute, reformulés et gradués par le LLM déjà en place (GLM), plutôt qu'une API news payante.** Trois raisons : (1) c'est gratuit et sans quota qui casse un cron 3×/jour, (2) les articles sont déjà en italien natif — pas de perte de nuance par traduction d'une source anglophone, (3) l'app **doit de toute façon reformuler** pour raisons de droits (jamais de republication verbatim), donc le passage par le LLM est un coût déjà absorbé, pas un coût ajouté. L'inconvénient (parsing/filtrage maison) est un effort de développement ponctuel, pas un coût récurrent — contrairement aux abonnements API qui scalent mal avec l'usage.

---

## 5. Ebooks classiques traduits et gradués

### 5.1 Sélection retenue

| Œuvre | Auteur | Langue originale | Domaine public ? | Format prévu |
|---|---|---|---|---|
| Rosso Malpelo | Giovanni Verga (†1922) | Italien | Oui | Extrait/nouvelle complète, adaptation de niveau |
| Une sélection de chapitres de *Pinocchio* | Carlo Collodi (†1890) | Italien | Oui | Chapitres choisis, adaptation de niveau |
| *Il fu Mattia Pascal* | Luigi Pirandello (†1936) | Italien | Oui (auteur mort il y a >70 ans) | Extraits/chapitres, adaptation de niveau |
| *Inferno* (Divine Comédie) | Dante Alighieri | Italien | Oui | Chants choisis, adaptation/paraphrase en italien courant |
| *La Parure* | Guy de Maupassant (†1893) | Français | Oui | **Traduction italienne** + adaptation de niveau |
| *Le Horla* | Guy de Maupassant (†1893) | Français | Oui | **Traduction italienne** + adaptation de niveau |
| *Le Dernier Jour d'un condamné* | Victor Hugo (†1885) | Français | Oui | **Traduction italienne** (extraits) + adaptation |
| *Candide* | Voltaire (†1778) | Français | Oui | **Traduction italienne** (extraits) + adaptation |

### 5.2 Point d'attention légal : traduction vs texte original
Les œuvres italiennes (Verga, Collodi, Pirandello, Dante) sont utilisables directement — texte source déjà en italien, seule l'adaptation de niveau est nécessaire. Les œuvres françaises (Maupassant, Hugo, Voltaire) demandent une **traduction vers l'italien** : le texte source français est dans le domaine public, mais **une traduction italienne existante et récente pourrait, elle, être encore protégée** (le droit d'auteur protège la traduction comme œuvre dérivée, indépendamment du texte original). Deux options sûres :
1. Utiliser une **traduction italienne elle-même tombée dans le domaine public** (traducteur mort depuis plus de 70 ans) si elle existe et est trouvable (LiberLiber, Wikisource italien).
2. Plus robuste et cohérent avec l'outil déjà en place : **générer une traduction italienne originale via le LLM** (même pipeline `generator/`) à partir du texte français du domaine public — une nouvelle traduction est une œuvre nouvelle, sans risque sur le texte source.

Dans les deux cas, la sortie finale passe par le même pipeline que le reste du catalogue : adaptation de niveau, lexique mot-à-mot, traductions de phrases, quiz — donc pas de nouveau système de contenu, juste de nouvelles entrées dans `src/texts/`.

### 5.3 Sources complémentaires (pour étendre la liste au-delà de cette sélection)
- **LiberLiber** — bibliothèque italienne du domaine public, textes en italien natif ou déjà traduits.
- **Project Gutenberg** (sections italienne et française) — alternative/complément à LiberLiber.
- **Wikisource italien** — utile pour des extraits courts déjà nettoyés, y compris certaines traductions historiques.

Pipeline suggéré : sélectionner des extraits courts (pas l'œuvre entière — un chapitre ou une scène), puis les faire passer par le pipeline `generator/` existant pour la traduction (si besoin), l'adaptation de niveau (A1–C2) et la génération du lexique/traductions — même logique de "couverture lexicale totale" déjà appliquée au catalogue.

---

## 6. Plan d'implémentation technique (si le go conditionnel du §3.4 est validé)

L'app dispose déjà de la quasi-totalité des briques nécessaires ; il s'agit d'étendre, pas de reconstruire.

- **Jobs serveur** : `leggendo-server/` gère déjà des jobs async (POST `/generate` → `GET /jobs/<id>`, Firestore `leggendoJobs`, auth par ID token Firebase, quotas). Ajouter un type de job `news` (déclenché par cron, pas par l'utilisateur) à côté du type existant de génération privée. Les ebooks (§5), eux, n'ont pas besoin d'un job à l'exécution : ils sont produits **une fois** en amont via `generator/` (comme le reste du catalogue), pas générés à la demande par abonné.
- **Quotas et rôles** : étendre le modèle `gratuit/premium/enseignant` (custom claims Firebase) avec `premium_plus`. Définir clairement la limite (jusqu'à 3 textes/jour) en la distinguant explicitement du `PAID_MONTHLY_LIMIT=100` déjà codé pour "Créer son texte" côté payant standard — ces deux quotas visent des usages différents et il faut éviter toute confusion dans le code entre "quota Premium généraliste" et "quota Premium+ textes/jour".
- **Cron** : un job planifié sur le VPS (même mécanisme que l'`orchestrate` existant, "5 textes par nuit") qui tourne 3×/jour, récupère les flux RSS, génère un **pool partagé** de textes d'actualité filtrés par niveau (pas un appel par utilisateur — voir §2.2 sur l'impact coût).
- **Notifications** : la stack actuelle est déjà PWA (`vite-plugin-pwa`, service worker actif — voir README §Feuille de route) ; les notifications push nécessitent une brique supplémentaire (Web Push API + endpoint d'abonnement stocké côté Firestore, ou Firebase Cloud Messaging). C'est un chantier à part entière, pas un sous-produit gratuit du cron — à chiffrer séparément si retenu.
- **Ebooks** : ajouter les 8 œuvres du §5.1 comme entrées `src/texts/<id>.json` via le pipeline `generator/` (traduction pour les œuvres françaises, adaptation de niveau pour toutes), avec un `genre`/`category` dédié (ex. `classico`) pour les distinguer du reste du catalogue et les réserver à l'accès Premium+ côté `lib/access.js`.
- **Stripe** : le plan `premiumPlusPlan` est déjà ajouté dans `src/lib/stripe.js` (15 CHF/mois, 150 CHF/an) — reste à coller le Payment Link Stripe correspondant et étendre le webhook déjà présent dans `functions/index.js` (qui pose aujourd'hui le claim `premium`) pour distinguer les paliers.
- **UI** : `PricingView.vue` affiche déjà Premium+ automatiquement (il lit le tableau `plans` de `stripe.js`) ; ajouter un onglet "Actualités" et un onglet "Classiques" dans la navigation/lecture, et des badges de quota dans `ProfileView.vue`.
- **Ordre suggéré** (après validation §3.4) : 1) brancher Stripe pour Premium existant → 2) sonder la demande news → 3) si positif, MVP news en RSS + pool partagé (pas de génération par utilisateur) → 4) ebooks classiques (contenu fixe, faible risque, différenciant) → 5) notifications push en dernier (chantier technique séparé, le moins critique des trois).

---

## 7. Risques techniques et légaux résiduels

- **Droits d'auteur** : reformulation LLM obligatoire pour les news (jamais de republication verbatim) — cohérent avec les règles de copyright déjà respectées dans le reste de l'app.
- **Fiabilité du flux automatisé** : un cron 3×/jour sans supervision humaine peut échouer silencieusement (source RSS indisponible, LLM qui timeout) — prévoir un monitoring et un comportement de repli (ne pas afficher un quota "3 textes" à moitié rempli sans explication).
- **Dérive de coût à grande échelle** : si l'architecture bascule un jour vers un appel LLM par utilisateur plutôt qu'un pool partagé, le coût cesse d'être négligeable au-delà de quelques centaines d'abonnés — à surveiller si le produit scale, mais non bloquant au lancement.
