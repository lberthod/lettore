# Rapport statistiques Leggendo — 8 novembre 2026

Sources : code du dépôt (suivi mis en place) et Google Analytics 4, consulté dans
Chrome le 8 nov. 2026. Période des chiffres : 28 derniers jours (11 oct. – 7 nov.).

## 1. Ce qui est mesuré

| Outil | État | Remarque |
|---|---|---|
| GA4 via Firebase (`G-0XSL8RH1NN`) | Actif | Propriété **leggendo-dbb84** (compte MyTree, n° 546976399) |
| Événements métier (`src/lib/analytics.js`) | Actifs | pages vues, clics CTA, ouverture/lecture d'un texte, mot traduit, inscription, connexion, début de paiement |
| Journal d'accès Caddy | Actif depuis le 23 oct. | Sur le VPS, 90 jours max, IP incluses. Non consulté pour ce rapport |
| Page `/admin` | Actif | Comptes par rôle et textes créés, pas de trafic |
| Achats | Non mesurés | Paiement sur Stripe hébergé, hors de l'app |
| Search Console | Non vérifié | Case encore ouverte dans `ROADMAP_SEO_GEO.md` |

Il existe aussi une propriété **leggendo.fr** (compte loicberthod, n° 553877413). Vérifié le
8 nov. : **0 utilisateur, 0 événement en 28 jours**. Elle est inutile (voir § 7).

La propriété « byteryo » (compte MyTree), ouverte par défaut dans Analytics, concerne un autre
site (pages `/admin`, `/compte`, outils PDF). Elle n'a rien à voir avec Leggendo.

## 2. Chiffres bruts (28 jours)

- Utilisateurs actifs : **617** (614 nouveaux)
- Vues : **1 606**, soit 2,6 vues par utilisateur
- Événements : **7 805**
- Durée d'engagement moyenne : 1 min 10 s
- Événements clés (conversions) : **0**
- Sur les 7 derniers jours : 24 utilisateurs actifs, 244 vues

### Pages les plus vues

| Page | Vues | Utilisateurs |
|---|---|---|
| `/` (accueil) | 285 | 70 |
| `/testo/marco` | 136 | 30 |
| `/textes` | 123 | 29 |
| `/abonnement` | 44 | 6 |
| `/connexion` | 43 | 19 |
| `/testo/mare` | 38 | 10 |
| `/classici` | 33 | 10 |
| `/methode` | 25 | 7 |
| `/test-de-niveau` | 22 | 12 |
| `/testo/montagne` | 21 | 5 |

Par titre : « Coniugazione » (274 vues, 254 utilisateurs, rebond 92 %) et « Dizionario »
(147 vues, 130 utilisateurs, rebond 91,5 %) ont un rebond très élevé.

### Sources de trafic (sessions, total d'environ 682)

| Source | Sessions |
|---|---|
| Direct | 571 |
| Google (organique) | 47 |
| ChatGPT | 26 |
| Facebook (mobile + bureau) | 21 |
| Bing (organique) | 13 |
| Yahoo | 4 |

### Textes les plus lus

`/testo/marco` : 7 min 17 s d'engagement en moyenne. `/testo/mare` : 3 min 14 s.
`/testo/montagne` : 26 min 17 s, avec seulement 5 utilisateurs, ce qui est étonnant.

## 3. Le chiffre à ne pas croire : une part du trafic est probablement du robot

- **544 utilisateurs sur 617 (88 %)** arrivent en « direct / none ».
- La première ville est **Urumqi (Chine) : 181 utilisateurs**, soit 29 % du total. Viennent
  ensuite Harbin, Forest City, Prineville et Hulunbuir, qui sont des villes de centres de
  données ou de trafic automatisé typique.
- Les pages `/coniugazione` et `/dizionario` ont un rebond supérieur à 90 % et un utilisateur
  par vue : cela ressemble à du passage de robots sur le sitemap.

Je n'ai pas croisé ces données avec le journal Caddy, donc c'est une forte présomption et non
une certitude. Les chiffres réalistes de visiteurs humains sont donc nettement plus bas que
617. Sur les 7 derniers jours, 15 utilisateurs sur 24 viennent de France.

## 4. Ce qu'on peut retenir

1. **Trafic humain faible** : quelques dizaines de visiteurs réels par semaine, venant surtout
   de Google, Bing et ChatGPT. ChatGPT apporte autant que Facebook, ce qui valide le travail
   GEO du `ROADMAP_SEO_GEO.md`.
2. **Les textes retiennent** : `/testo/marco` est lu plusieurs minutes. Le cœur du produit
   fonctionne pour ceux qui y arrivent.
3. **Aucune conversion mesurée** : 0 événement clé, pas de suivi des achats. Impossible
   aujourd'hui de dire combien de visiteurs vont jusqu'à l'abonnement (44 vues sur `/abonnement`).
4. **Pas de bandeau de consentement** alors que GA4 est actif : point à faire relire côté RGPD
   (signalé dans `docs/audit-2026-10/BACKLOG.md`, LEG-1).

## 5. Actions proposées

- Filtrer le trafic robot dans GA4 (filtre de trafic interne ou exclusion de la Chine et des
  villes de centres de données), ou comparer avec le journal Caddy pour confirmer.
- Marquer `cta_click`, `select_content` et `sign_up` comme événements clés pour avoir des
  conversions.
- Lire le journal Caddy sur le VPS pour obtenir un trafic brut indépendant du navigateur.
- Soumettre le sitemap dans la Search Console et suivre l'indexation.
- Décider du sort de la propriété `leggendo.fr` (553877413), probablement inutile.
- Vérifier pourquoi `/testo/montagne` affiche 26 min d'engagement pour 5 utilisateurs.

## 6. Analyse approfondie (GA4 + Search Console, 8 nov.)

### 6.1 Le trafic robot est confirmé

| Ville | Utilisateurs | Engagement moyen | Taux d'engagement |
|---|---|---|---|
| (not set) | 354 | 48 s | 19 % |
| **Urumqi** | **181** | **0 s** | **3 %** |
| Harbin | 9 | 0 s | 100 % (artefact) |
| Forest City, Prineville, Altoona, Boardman | 5, 5, 4, 4 | 0 à 4 s | — |
| Hulunbuir | 5 | 0 s | — |
| Paris | 8 | 2 min 22 s | 78 % |
| Marnaz | 6 | 7 min 50 s | 100 % |

- Urumqi : 181 nouveaux utilisateurs pour 6 sessions engagées et 0 s d'engagement. C'est du
  robot, très probablement. Forest City, Prineville, Altoona et Boardman sont des villes de
  centres de données (Meta, Amazon, etc.), donc des crawlers.
- Sur 682 sessions, seules **180 sont engagées (26 %)**. Le trafic humain réel est de l'ordre
  de 100 à 200 sessions sur 28 jours, soit quelques utilisateurs par jour.
- « Marnaz » (6 utilisateurs, près de 8 min) ressemble à un petit groupe réel, peut-être vous
  ou un cercle proche. À vérifier.

### 6.2 Les événements GA4 (28 jours)

| Événement | Nombre | Utilisateurs |
|---|---|---|
| `word_translated` | 4 568 | **29** |
| `page_view` | 1 606 | 617 |
| `session_start` | 682 | 616 |
| `first_visit` | 614 | 614 |
| `view_item` (ouverture d'un texte) | 222 | 42 |
| `user_engagement` | 61 | 50 |
| `tutorial_complete` (lecture terminée) | 39 | 14 |
| `sign_up` | 6 | 6 |
| `cta_click` | 4 | 3 |
| `login` | 3 | 3 |

- **29 utilisateurs ont traduit en moyenne 157 mots chacun.** C'est le vrai noyau d'utilisateurs
  engagés, et il se situe à environ 5 % de l'audience affichée.
- Entonnoir humain approximatif : 42 ouvrent un texte, 14 le terminent, 6 s'inscrivent.
  Ces trois événements pourraient devenir les événements clés.
- `select_content` (début de lecture) et `begin_checkout` n'apparaissent pas : soit ils ne se
  déclenchent jamais, soit personne n'est arrivé jusque-là. À vérifier dans le code.
- `cta_click` n'a que 4 occurrences : les boutons d'appel à l'action sont presque jamais cliqués.

### 6.3 Search Console (domaine `leggendo.fr`)

- Elle est déjà configurée. Sur 28 jours : **46 clics, 2 280 impressions**, CTR 2 %,
  position moyenne 19,9 (page 2 de Google).
- Requêtes qui amènent des clics : « texte italien b1 » (2 clics, 13 impressions), « leggendo »,
  « texte facile en italien », « test italiano c2 », « texte en italien niveau a1 »
  (71 impressions, 0 clic), « texte en italien niveau a2 » (39 impressions, 0 clic).
  Il y a 375 requêtes au total.
- **Indexation : 2 184 pages indexées, 2 820 non indexées.** Raisons :
  - 1 301 exclues par `noindex` (volontaire pour les routes applicatives, à vérifier que ce
    ne sont pas des pages utiles) ;
  - 1 007 « autre page avec balise canonique correcte » ;
  - 390 « détectées, actuellement non indexées » (Google ne les a pas encore explorées) ;
  - 59 bloquées par `robots.txt`, 29 doublons, 23 redirections, 4 soft 404, 2 en 403.
- Core Web Vitals : « aucune donnée » (trop peu de trafic réel pour que Google les mesure).

### 6.4 Comptes Firebase Authentication (13 comptes au 8 nov.)

Les adresses ne sont pas reproduites ici (données personnelles).

- **13 comptes au total, dont 4 sont des comptes de test ou le vôtre** (2 comptes `debug-*`,
  1 compte `example.com`, et le compte propriétaire). Il reste **9 comptes réels**, au maximum.
- Inscriptions par date : 5 en juillet (dont le vôtre et 2 tests), 1 en août (un compte de test),
  **7 depuis le 12 octobre** : 12 oct., 14 oct., 22 oct., 3 nov. (×2), 5 nov., 7 nov.
- Cela recoupe GA4 : 6 événements `sign_up` mesurés sur 28 jours contre 7 comptes créés. Un
  inscrit n'a pas été mesuré, probablement un bloqueur de suivi. Le suivi des inscriptions
  est donc fiable à environ 85 %.
- **4 inscriptions ont eu lieu après le passage au site sans compte (26 oct.)** : le
  3 nov. (×2), le 5 nov. et le 7 nov. Des visiteurs continuent donc à créer un compte, sans doute
  via la page `/connexion` (43 vues sur 28 jours) ou un lien existant.
- Trois comptes se sont reconnectés plus tard (le 6 nov., le 1er août et le vôtre), ce qui
  donne très peu de retours : la rétention est quasi nulle.
- Les comptes de test (`example.com`, `debug-*`) sont dans la base de production. Ils faussent
  l'admin (« Comptes ») et peuvent être supprimés.

**Taux de conversion estimé** : environ 6 à 7 inscriptions pour 100 à 200 sessions humaines, donc
quelques pour cent des visiteurs réels. C'est correct pour un site de ce stade, mais le
volume de visiteurs est le vrai frein.

### 6.5 Journal d'accès Caddy (VPS, 23 oct. – 8 nov., 17 jours, lecture seule)

Ces chiffres comptent les requêtes HTTP et les adresses IP, indépendamment du navigateur.
Les adresses IP ne sont pas reproduites ici.

- **40 398 requêtes** et **4 448 adresses IP distinctes**. Les adresses ne sont pas des personnes :
  une même personne peut en changer, un réseau peut en partager une.
- **Robots déclarés : 25 934 requêtes (64 %), 2 532 IP.** Les principaux :
  - HeadlessChrome (navigateur sans écran qui exécute le JavaScript) : environ 10 300 requêtes.
    Ce sont eux qui gonflent GA4, puisque le suivi se déclenche chez eux ;
  - AhrefsBot (2 067), Amazonbot (1 816), ClaudeBot (971), SERankingBacklinksBot (920),
    ElevenlabsCrawler (881), Baiduspider (688), Googlebot, Bing ;
  - des User-Agent « Android 7.0 » et « Nexus 5X » (Huawei Petal, Googlebot mobile).
- **Scanners de failles : 15 IP, 2 749 requêtes.** Ils cherchent `/.env`, `/.git`, `/.aws/credentials`,
  `/wp-login.php`, `/docker-compose.yml`. Sur 455 sondes, **450 donnent 404**. Les 5 réponses 200
  viennent de `/admin/.env` : c'est la page de l'application (925 octets), pas un fichier exposé.
  Vérifié en direct : `/.env` et `/.git/config` renvoient bien 404.
- **Visiteurs plausibles : environ 85 IP en 17 jours, soit 5 à 10 par jour.** Critère : une page
  HTML et au moins 2 fichiers de l'application chargés, hors robots et scanners. Parmi elles,
  29 n'ont vu qu'une page, 10 en ont vu 3 ou plus, et 7 sont revenues sur 2 jours différents.
  Cela confirme l'ordre de grandeur de 100 à 200 sessions humaines sur 28 jours.
- Sources de renvoi : `loicberthod.ch` (146 : votre autre site, c'est la première source),
  Google (57), Bing (9), Facebook (11), Baidu (5), Yahoo (2). Binance (14) est suspect.
- Les pages les plus demandées par les non-robots, hors accueil (689), sont `/a-propos`,
  `/textes`, `/test-de-niveau`, `/methode`, `/textes-italien-a1` et `/grammatica`.

Le journal et GA4 se recoupent donc : le trafic humain est de quelques visiteurs par jour, et
les 617 « utilisateurs » de GA4 sont en grande majorité des robots.

## 7. Plan d'action recommandé (par priorité)

1. **Exclure les robots dans GA4** : **impossible directement**. Les filtres de données de
   GA4 ne couvrent que le trafic interne (par adresse IP) et le trafic développeur, pas un
   pays ni une ville. Solutions réelles : (a) bloquer ces robots côté serveur dans Caddy
   (par adresse IP ou en-tête User-Agent, après lecture du journal), (b) ne pas envoyer
   d'événements GA4 quand le visiteur est un robot, (c) lire GA4 avec une comparaison qui
   exclut ces villes.
2. ~~**Marquer comme événements clés** `view_item`, `tutorial_complete`, `sign_up`.~~
   **FAIT le 8 nov.** dans GA4 (propriété leggendo-dbb84). Les conversions apparaîtront dans
   les rapports à partir de maintenant, sans effet rétroactif.
3. **Travailler les requêtes à fortes impressions sans clic** (« texte en italien niveau a1 »,
   « niveau a2 ») : améliorer le titre et la description des pages de niveau A1 et A2.
4. **Examiner les 390 pages « détectées, non indexées »** et vérifier que le `noindex` de
   1 301 pages ne touche aucune page utile.
5. **Supprimer ou ignorer la propriété `leggendo.fr`** (vide) pour éviter la confusion.
6. ~~**Lire le journal Caddy**~~ **FAIT le 8 nov.** (§ 6.5). Reste à décider du blocage :
   un en-tête `User-Agent` contenant `HeadlessChrome` peut être refusé dans le Caddyfile
   (`@bots header_regexp`, réponse 403), ce qui supprime environ un quart du trafic et
   nettoie GA4. **FAIT le 8 nov. à 14 h 10 (heure du VPS)** : bloc `@headless` ajouté au site
   `leggendo.fr` du Caddyfile du VPS, backup `/etc/caddy/Caddyfile.bak.20261108-141026`,
   `caddy validate` puis `reload` (pas de `restart`). Tests : HeadlessChrome reçoit 403,
   un navigateur normal et Googlebot reçoivent 200, et byteryo.com, loicberthod.ch et
   rapportia.app répondent toujours 200. Pour annuler : copier ce backup sur
   `/etc/caddy/Caddyfile` puis `sudo systemctl reload caddy`.
   **À vérifier dans 7 jours** : les utilisateurs d'Urumqi doivent disparaître de GA4 et le
   nombre de statuts 403 dans le journal doit apparaître. Si les robots reviennent avec un
   autre User-Agent (par exemple un faux Chrome), il faudra bloquer par adresse IP.
7. Vérifier dans le code pourquoi `select_content` et `begin_checkout` ne remontent pas.

## 8. Limites de ce rapport

- J'ai lu le journal Caddy en lecture seule, puis modifié une seule chose sur le VPS : le
  blocage de HeadlessChrome dans le Caddyfile (voir § 7, point 6).
- Dans GA4, j'ai seulement marqué trois événements clés (voir § 7, point 2).
- Les 85 visiteurs plausibles sont comptés par adresse IP : c'est un ordre de grandeur, pas un
  chiffre exact. Un robot qui se fait passer pour un navigateur peut s'y glisser.
- Les adresses IP et e-mails ne figurent pas dans ce document.
- Les chiffres GA4 sous-estiment les humains qui bloquent le suivi, et surestiment le trafic
  par les robots qui l'exécutent.
