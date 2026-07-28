# Plan SEO et acquisition organique de Leggendo

## Objectif de ce document

Ce document transforme l'audit SEO de Leggendo en plan de développement
concret. Il indique ce qui peut être codé maintenant, dans quel ordre, dans
quels fichiers, et comment vérifier que chaque chantier fonctionne.

L'objectif à six mois est de construire un tunnel d'acquisition organique :

1. une personne cherche une réponse sur Google ;
2. elle arrive sur une ressource gratuite et utile ;
3. elle teste réellement Leggendo sans créer de compte ;
4. elle crée un compte pour conserver sa progression ;
5. elle rencontre ensuite une limite naturelle ;
6. elle découvre l'abonnement au moment où elle comprend déjà la valeur du
   produit.

Le principe central est le suivant : Google et le visiteur anonyme doivent
pouvoir consulter une vraie page publique. La connexion ne doit être demandée
qu'au moment d'utiliser une fonctionnalité privée ou d'accéder au contenu
complet.

---

## État actuel

Le projet possède déjà de bonnes fondations :

- sitemap et `robots.txt` générés au build ;
- URL canoniques ;
- titres et descriptions propres aux routes ;
- environ 460 fiches de textes prérendues ;
- catalogue prérendu avec des liens HTML ;
- données structurées `LearningResource` ;
- PWA et découpage du bundle ;
- contenu premium absent du build public ;
- Firebase Analytics initialisé ;
- dictionnaire et conjugaisons déjà disponibles dans les données.

Le build de production a été vérifié :

- 470 pages HTML sont générées ;
- aucun contenu réservé n'est exposé dans `dist/` ;
- le build termine correctement.

Le principal problème n'est donc pas l'absence de contenu. C'est le fait que
les ressources existantes ne sont pas encore organisées comme des pages
d'acquisition publiques, stables et mesurables.

---

# Priorité P0 — À coder avant le lancement

## 1. Ne plus rediriger les fiches SEO vers la connexion

### Problème

Dans `src/router.js`, la route `/testo/:id` redirige actuellement un visiteur
non connecté vers `/connexion` lorsque le texte n'appartient pas à l'aperçu
gratuit.

Le HTML prérendu contient bien une fiche publique, mais Vue démarre ensuite,
attend Firebase Auth et change de route. Google exécutant JavaScript, il peut
finir par voir la page de connexion avec `noindex` au lieu de la fiche du
texte.

### Résultat attendu

Toutes les URL `/testo/:id` du catalogue doivent rester accessibles aux
visiteurs anonymes.

La page publique doit afficher :

- le titre ;
- le niveau ;
- la catégorie et le genre ;
- le nombre approximatif de mots ;
- un extrait utile ;
- quelques informations pédagogiques ;
- des textes similaires ;
- un appel à tester un texte gratuit ;
- un appel à découvrir Premium.

Le texte complet reste protégé dans Firestore. Il ne faut pas déplacer le
contenu premium dans le bundle public.

### Fichiers à modifier

- `src/router.js`
- `src/views/ReaderView.vue`
- `src/lib/protectedContent.js`
- éventuellement `src/lib/access.js`
- `scripts/prerender.mjs`

### Logique proposée

Dans le garde de route :

- autoriser toute fiche correspondant à un identifiant du catalogue ;
- conserver la connexion obligatoire pour les textes privés créés par un
  utilisateur ;
- laisser `ReaderView.vue` déterminer si le contenu intégral peut être chargé ;
- si le contenu n'est pas autorisé, afficher la fiche publique et le paywall
  dans la même URL ;
- ne jamais rediriger automatiquement une fiche publique vers `/connexion`.

Il faut distinguer clairement :

- `public metadata` : titre, extrait, niveau, thème ;
- `free full content` : textes de démonstration ;
- `protected full content` : texte complet récupéré depuis Firestore ;
- `private user content` : nécessite une authentification et ne doit pas être
  indexé.

### Critères de validation

- ouvrir une fiche premium en navigation privée ;
- vérifier que l'URL reste `/testo/<id>` ;
- vérifier que le titre et l'extrait restent visibles après le chargement de
  Vue ;
- vérifier que le texte complet n'apparaît ni dans le HTML ni dans les chunks ;
- vérifier que le bouton de déblocage mène à l'abonnement ;
- vérifier la page avec JavaScript désactivé ;
- lancer `npm run build` et conserver le contrôle anti-fuite au vert.

---

## 2. Construire un vrai composant de paywall indexable

### Résultat attendu

Le paywall ne doit pas remplacer la page. Il doit être une section située après
le contenu gratuit.

Structure recommandée :

```html
<article>
  <header>Informations publiques du texte</header>
  <section>Extrait public et contenu pédagogique</section>
  <section class="paywall">
    Contenu complet réservé à Premium
  </section>
  <section>Textes gratuits ou similaires</section>
</article>
```

### Données structurées

Pour les fiches premium, compléter le JSON-LD :

```json
{
  "@context": "https://schema.org",
  "@type": "LearningResource",
  "isAccessibleForFree": false,
  "hasPart": {
    "@type": "WebPageElement",
    "isAccessibleForFree": false,
    "cssSelector": ".paywall"
  }
}
```

Pour un texte entièrement gratuit, conserver :

```json
{
  "isAccessibleForFree": true
}
```

### Fichiers à modifier

- `src/views/ReaderView.vue`
- éventuellement un nouveau composant
  `src/components/ContentPaywall.vue`
- `scripts/prerender.mjs`

### Contenu du paywall

Le message doit décrire le bénéfice, pas seulement l'interdiction :

- accès à tous les textes ;
- traduction au clic ;
- audio ;
- progression ;
- vocabulaire sauvegardé.

Prévoir deux actions différentes :

- visiteur anonyme : « Créer un compte gratuit » ;
- compte gratuit : « Débloquer tous les textes ».

---

## 3. Prérendre les vraies pages marketing

### Problème

La page d'accueil, la méthodologie, À propos et l'abonnement possèdent des
métadonnées statiques, mais leur contenu principal dépend encore de JavaScript.

### Pages prioritaires

1. `/`
2. `/methodologie`
3. `/abonnement`
4. `/a-propos`
5. `/methode`

### Options d'implémentation

#### Option courte

Étendre `scripts/prerender.mjs` et générer manuellement le contenu public de
ces pages, comme cela est déjà fait pour `/textes`.

Cette option est rapide, mais crée une duplication entre le composant Vue et le
script.

#### Option durable recommandée

Passer progressivement à un vrai SSG compatible avec Vue. Avant de choisir une
bibliothèque, faire un prototype sur une branche et vérifier :

- Firebase Auth ;
- les accès à `window`, `navigator` et `localStorage` ;
- le service worker ;
- les imports dynamiques ;
- l'hydratation des composants interactifs.

Une migration complète n'est pas obligatoire pour lancer le site. Les cinq
pages marketing peuvent être prérendues en premier sans transformer toute
l'application.

### Critères de validation

Pour chaque page :

```bash
curl -s https://leggendo.fr/abonnement
```

La réponse HTML doit déjà contenir :

- un seul `h1` ;
- la proposition de valeur ;
- les informations principales ;
- les liens vers les CTA ;
- le titre, la description et la canonical corrects.

---

## 4. Créer une vraie page 404

### Problème

La route attrape-tout renvoie actuellement vers l'accueil. Une URL inventée peut
donc ressembler à une page valide et produire un soft 404.

### À créer

- `src/views/NotFoundView.vue`
- une route nommée `not-found`
- une page `/404`
- une balise `noindex, follow`

Le serveur doit idéalement répondre avec un statut HTTP 404. Si l'hébergement
SPA empêche cela, servir un fichier `404.html` dédié et configurer
Firebase/Infomaniak en conséquence.

### Contenu utile de la page

- explication courte ;
- lien vers les textes gratuits ;
- lien vers le dictionnaire ;
- champ de recherche éventuel ;
- aucun renvoi automatique vers l'accueil.

---

## 5. Mesurer le tunnel avec GA4

### Problème

Firebase Analytics est chargé, mais le projet ne journalise pas les actions
métier essentielles. Les simples pages vues ne permettent pas de savoir quelles
pages produisent des lecteurs, des comptes et des abonnements.

### Nouveau module proposé

Créer `src/lib/analytics.js`.

Ce module doit :

- charger Analytics seulement lorsque cela est autorisé ;
- échouer silencieusement si Analytics est indisponible ;
- exposer des fonctions métier ;
- éviter de disperser des appels Firebase dans tous les composants.

API possible :

```js
trackPageView(route)
trackCtaClick({ placement, action, destination })
trackTextOpened({ textId, level, access })
trackReadingStarted({ textId, level })
trackReadingCompleted({ textId, level })
trackWordTranslated({ textId, level })
trackSignUp(method)
trackLogin(method)
trackBeginCheckout(plan, billing)
trackPurchase({ transactionId, plan, value, currency })
```

### Événements à mesurer

| Étape | Événement | Paramètres utiles |
|---|---|---|
| Consultation d'une fiche | `view_item` | `text_id`, `level`, `category`, `access` |
| Début de lecture | `select_content` | `text_id`, `level`, `source_page` |
| Traduction utilisée | événement personnalisé | `text_id`, `level`, `word_count_band` |
| Texte terminé | `tutorial_complete` ou personnalisé | `text_id`, `level`, `duration_band` |
| CTA sélectionné | événement personnalisé | `placement`, `label`, `destination` |
| Création de compte | `sign_up` | `method`, `source_page` |
| Connexion | `login` | `method` |
| Début du paiement | `begin_checkout` | `plan`, `billing`, `currency`, `value` |
| Achat confirmé | `purchase` | `transaction_id`, `plan`, `value`, `currency` |

Ne jamais envoyer à Analytics :

- le mot exact recherché s'il peut révéler une donnée personnelle ;
- un texte privé créé par l'utilisateur ;
- l'adresse e-mail ;
- un identifiant directement personnel.

### SPA et pages vues

Ajouter un suivi explicite dans `router.afterEach`. Vérifier que la collecte
automatique et la collecte manuelle ne produisent pas deux `page_view` pour la
même navigation.

### Événements principaux GA4

Marquer au minimum comme événements principaux :

- `sign_up`
- `begin_checkout`
- `purchase`

Les lectures terminées constituent une micro-conversion et doivent rester
analysables, même si elles ne sont pas utilisées comme conversion commerciale.

### Validation

- activer le mode debug ;
- tester le parcours en navigation privée ;
- vérifier chaque événement dans GA4 DebugView ;
- contrôler l'absence de doublons ;
- vérifier que les UTM et le référent sont conservés jusqu'à l'inscription.

---

## 6. Ajouter les ressources de partage social

### Fichiers nécessaires

- `public/og-image.png`, 1200 × 630 px ;
- `public/apple-touch-icon.png`, déjà prévu ;
- `public/favicon.ico`, déjà prévu.

`og-image.png` est actuellement référencé dans `index.html` mais doit réellement
exister au déploiement.

### Amélioration ultérieure

Créer des images spécifiques pour :

- la page A1 ;
- la page A2 ;
- les conjugaisons ;
- le dictionnaire ;
- les classiques.

Il n'est pas nécessaire de générer une image pour chacune des milliers de
fiches.

---

# Priorité P1 — Le moteur d'acquisition organique

## 7. Transformer le dictionnaire en pages SEO

### Opportunité

Le projet possède déjà des lemmes, traductions, définitions, exemples et
index de formes. Ces données peuvent produire des pages utiles ciblant la
longue traîne.

### URL recommandée

Conserver une structure stable :

```text
/dizionario/essere
/dizionario/andare
/dizionario/allora
```

Éviter de créer une page indexable par forme fléchie. Une recherche
`andavo` doit résoudre le lemme `andare` et rediriger en 301 ou poser une
canonical vers `/dizionario/andare`.

### Contenu minimal d'une fiche indexable

- `h1` : mot italien et traduction principale ;
- nature grammaticale ;
- définition ;
- exemples en italien avec traduction française ;
- formes principales ;
- synonymes lorsque disponibles ;
- lien vers la conjugaison si c'est un verbe ;
- liens vers des textes contenant ce mot ;
- liens vers quelques mots sémantiquement proches.

Une fiche sans définition ni exemple ne doit pas être indexée.

### Travail technique

- ajouter les routes dictionnaire dans `src/seo/staticPages.js` ou créer une
  source SEO dédiée aux routes dynamiques ;
- étendre `scripts/generate-sitemap.mjs` ;
- étendre `scripts/prerender.mjs` ;
- ajouter titres, descriptions et canonical dynamiques dans `src/router.js` ;
- ajouter les données structurées appropriées ;
- découper le sitemap si le volume devient important ;
- ne publier d'abord que les fiches de meilleure qualité.

### Déploiement progressif

Commencer par 100 à 300 lemmes :

- verbes les plus fréquents ;
- vocabulaire A1/A2 ;
- mots présents dans plusieurs textes gratuits ;
- mots dont la fiche est complète.

Mesurer l'indexation et l'engagement avant de publier plusieurs milliers de
pages.

---

## 8. Prérendre les conjugaisons

### URL

```text
/coniugazione/essere
/coniugazione/avere
/coniugazione/andare
```

### Contenu attendu

- infinitif et traduction ;
- auxiliaire ;
- participe passé ;
- indicatif présent ;
- passé composé ;
- imparfait ;
- futur ;
- conditionnel ;
- subjonctif ;
- impératif lorsque pertinent ;
- exemples réels ;
- lien vers la fiche dictionnaire ;
- textes permettant de pratiquer le verbe.

### Règles SEO

- une seule URL canonique par verbe ;
- pas d'URL indexable pour chaque temps ;
- pas de page vide pour un verbe incomplet ;
- titres naturels, par exemple :
  `Conjugaison de essere en italien — tableaux et exemples`.

### Fichiers concernés

- `src/views/ConjugationView.vue`
- `src/views/VerbsView.vue`
- `src/router.js`
- `src/seo/staticPages.js` ou un nouveau module SEO dynamique
- `scripts/generate-sitemap.mjs`
- `scripts/prerender.mjs`

---

## 9. Indexer les classiques réellement publics

### Pages à créer

- une page indexable `/classici` ;
- une page par livre ;
- une page par chapitre public ;
- une page auteur lorsque plusieurs œuvres sont disponibles.

### Attention au domaine public

Seuls les chapitres réellement consultables sans compte doivent devenir des
pages d'acquisition. Un chapitre premium peut conserver une fiche publique,
mais il doit suivre la même logique de paywall que les textes gradués.

### Maillage

Chaque livre doit pointer vers :

- ses chapitres ;
- l'auteur ;
- le niveau recommandé ;
- les mots difficiles ;
- des textes gradués de préparation.

---

## 10. Créer des pages par niveau et par intention

### Pages prioritaires

```text
/textes-italien-a1
/textes-italien-a2
/textes-italien-b1
/textes-italien-b2
/italien-pour-debutants
/histoires-courtes-italien
/lecture-italien-avec-traduction
/italien-pour-voyager
```

### Une page utile n'est pas seulement une liste

Chaque page doit contenir :

- une introduction originale ;
- à qui le parcours s'adresse ;
- les difficultés du niveau ;
- une sélection éditoriale ;
- un ordre de lecture ;
- quelques conseils ;
- des liens vers 10 à 30 ressources ;
- un CTA correspondant à l'intention.

### Source de données

Créer par exemple `src/seo/landingPages.js` avec :

```js
{
  path,
  title,
  description,
  heading,
  introduction,
  filters,
  featuredIds,
  faq
}
```

Le même fichier doit alimenter :

- le composant Vue ;
- le prérendu ;
- le sitemap ;
- le maillage interne.

Cela évite que le contenu SEO du build diverge de l'interface.

---

# Priorité P2 — Conversion et fidélisation

## 11. Repenser les CTA selon l'intention

Un CTA unique « S'abonner » partout sera moins performant qu'une prochaine
action contextualisée.

| Page | CTA principal |
|---|---|
| Fiche de texte | Lire un texte gratuit similaire |
| Fin d'un texte gratuit | Continuer avec le texte suivant |
| Dictionnaire | Sauvegarder ce mot |
| Conjugaison | Pratiquer ce verbe dans un texte |
| Page A1 | Commencer le parcours A1 |
| Paywall après usage | Débloquer tous les textes |
| Visiteur récurrent | Conserver ma progression |

Chaque CTA doit posséder un identifiant Analytics stable.

---

## 12. Ajouter un diagnostic de niveau

### Fonction

Un mini-test gratuit peut devenir une excellente page d'entrée et une raison
naturelle de créer un compte.

### Parcours possible

1. 8 à 12 questions ;
2. résultat immédiat A1 à C1 ;
3. trois textes recommandés ;
4. création de compte facultative pour sauvegarder le parcours.

### URL

```text
/test-niveau-italien
```

La page doit rester utile même sans inscription. Ne pas cacher le résultat
derrière un formulaire.

### Mesure

- test commencé ;
- test terminé ;
- niveau obtenu ;
- texte recommandé ouvert ;
- compte créé après le résultat.

---

## 13. Améliorer l'offre gratuite

L'offre gratuite doit démontrer toute la boucle de valeur :

- choisir un niveau ;
- lire ;
- traduire ;
- écouter ;
- terminer ;
- continuer.

Prévoir idéalement plusieurs textes gratuits par niveau utile, au lieu de six
exemples choisis uniquement à l'échelle du catalogue.

Le contenu gratuit peut tourner périodiquement, mais les URL déjà indexées ne
doivent pas devenir brutalement inutiles. Une fiche publique stable doit rester
disponible.

---

## 14. Capturer la progression avant le compte

La progression locale permet de ne pas bloquer la première expérience.

Au moment opportun :

> Vous avez terminé deux textes. Créez un compte gratuit pour conserver votre
> progression sur tous vos appareils.

Il faut s'assurer que la progression locale est fusionnée avec le compte après
l'inscription, sans être écrasée.

Événements à mesurer :

- première lecture terminée ;
- deuxième lecture terminée ;
- invitation à sauvegarder affichée ;
- inscription ;
- fusion de progression réussie.

---

## 15. Préparer les séquences de réactivation

Ce chantier nécessite un fournisseur d'e-mail et un consentement approprié. Il
peut attendre que le tunnel interne soit mesuré.

Séquence minimale :

1. bienvenue et premier texte recommandé ;
2. rappel pédagogique deux ou trois jours plus tard ;
3. nouvelle recommandation selon le niveau ;
4. présentation Premium après plusieurs interactions.

Ne pas envoyer une séquence commerciale à une personne qui n'a pas accepté les
communications correspondantes.

---

# Architecture SEO recommandée

## Source unique des métadonnées

`src/seo/staticPages.js` constitue un bon début, mais il faut l'étendre pour
gérer trois familles :

```text
src/seo/
  staticPages.js
  landingPages.js
  textPages.js
  dictionaryPages.js
  conjugationPages.js
  structuredData.js
```

Les scripts du build et le routeur doivent utiliser les mêmes fonctions :

```js
getTitle(page)
getDescription(page)
getCanonical(page)
getRobots(page)
getStructuredData(page)
```

Le but est d'éviter :

- un prix différent entre Vue et le JSON-LD ;
- une description différente entre le prérendu et la navigation ;
- une page ajoutée au routeur mais oubliée dans le sitemap ;
- une canonical incorrecte après hydratation.

---

## Sitemaps séparés

Lorsque le dictionnaire et les conjugaisons seront publiés, créer un index :

```text
/sitemap.xml
/sitemaps/static.xml
/sitemaps/texts.xml
/sitemaps/dictionary.xml
/sitemaps/conjugations.xml
/sitemaps/classics.xml
```

N'inclure que :

- des URL canoniques ;
- des pages répondant avec succès ;
- des pages indexables ;
- des pages possédant un contenu suffisant.

Ajouter `lastmod` lorsqu'une date fiable existe. Ne pas inventer une date de
modification à chaque build si le contenu n'a pas changé.

---

## Maillage interne

Le maillage doit relier les différentes familles :

```text
Page de niveau
  → textes
    → mots et verbes
      → dictionnaire et conjugaison
        → autres textes où pratiquer
```

Chaque fiche doit proposer des liens HTML réels avec `href`, pas seulement des
boutons déclenchant du JavaScript.

Limiter les listes énormes. Une page peut proposer les ressources les plus
pertinentes et laisser les filtres gérer le reste.

---

## Titres et descriptions

### Textes

```text
La mattina di Marco — texte italien A1 avec traduction
```

### Dictionnaire

```text
Allora en italien : traduction, définition et exemples
```

### Conjugaison

```text
Conjugaison de andare en italien — tableaux et exemples
```

### Pages de niveau

```text
Textes italiens A1 pour débutants — lecture avec traduction
```

Éviter de répéter mécaniquement `Leggendo` au début de tous les titres. La
requête et la promesse doivent apparaître en premier.

---

# Performance

## Ce qui est déjà bon

- routes chargées à la demande ;
- données du dictionnaire découpées ;
- assets avec hash ;
- cache long ;
- Firebase chargé progressivement ;
- PWA limitée à un précache raisonnable.

## Ce qu'il faut surveiller

Le build signale plusieurs chunks de dictionnaire supérieurs à 500 kB. Ils sont
chargés à la demande, ce qui réduit l'impact sur l'accueil, mais il faut mesurer
les pages dictionnaire réelles.

Actions possibles :

- ne charger que la lettre ou le lemme requis ;
- éviter d'importer `entries.json` en entier sur une fiche ;
- précharger uniquement les données nécessaires à la route ;
- surveiller LCP, INP et CLS dans PageSpeed Insights et Search Console ;
- enregistrer les Core Web Vitals réels si le volume de trafic le permet.

Ne pas optimiser uniquement la taille totale de `dist/`. Ce qui compte est ce
qui est téléchargé pour une page donnée.

---

# Search Console et contrôle après déploiement

## Configuration

- créer une propriété Domaine pour `leggendo.fr` ;
- valider par DNS ;
- soumettre `/sitemap.xml` ;
- ajouter Bing Webmaster Tools ;
- choisir une seule version canonique, avec ou sans `www` ;
- rediriger l'autre version en 301.

## Échantillon à inspecter

Après chaque changement majeur :

- accueil ;
- catalogue ;
- une page A1 ;
- un texte gratuit ;
- une fiche premium avec paywall ;
- une fiche dictionnaire ;
- une conjugaison ;
- une URL inexistante.

Pour chaque URL, contrôler :

- réponse HTTP ;
- canonical choisie par Google ;
- robots ;
- HTML rendu ;
- ressources bloquées ;
- données structurées ;
- dernière exploration.

---

# Tableau de bord marketing

Créer un tableau mensuel avec :

| Indicateur | Pourquoi |
|---|---|
| URL indexées / soumises | détecter les problèmes d'indexation |
| Impressions organiques | mesurer la couverture |
| Clics organiques | mesurer le trafic réel |
| CTR par page | améliorer titres et descriptions |
| Position moyenne par groupe | suivre A1, dictionnaire, conjugaison |
| Lectures commencées | mesurer la qualité du trafic |
| Textes terminés | mesurer la valeur produit |
| Comptes créés | première conversion |
| Débuts de paiement | intention commerciale |
| Achats | résultat |
| Revenu organique | arbitrage marketing |

Analyser par famille de page, pas seulement au niveau global.

---

# Calendrier de développement sur six mois

## Semaine 1

- corriger les redirections des fiches ;
- créer la version publique du lecteur ;
- ajouter le paywall dans la même URL ;
- ajouter le balisage paywall ;
- créer la vraie 404.

## Semaine 2

- créer `src/lib/analytics.js` ;
- suivre pages vues, lectures, inscriptions, checkout et achat ;
- configurer les événements principaux ;
- ajouter `og-image.png` ;
- vérifier les métadonnées.

## Semaines 3 et 4

- prérendre les pages marketing ;
- créer les pages A1 et A2 ;
- améliorer le maillage du catalogue ;
- configurer Search Console et Bing ;
- lancer les premiers contrôles d'indexation.

## Mois 2

- publier 100 à 300 fiches dictionnaire de haute qualité ;
- publier les conjugaisons essentielles ;
- ajouter les liens texte ↔ mot ↔ verbe ;
- mesurer l'engagement.

## Mois 3

- créer les pages B1 et B2 ;
- créer les pages par intention ;
- rendre `/classici` et les chapitres publics indexables ;
- améliorer les pages positionnées entre la quatrième et la vingtième place.

## Mois 4

- développer le diagnostic de niveau ;
- contextualiser les CTA ;
- expérimenter l'invitation à sauvegarder la progression ;
- améliorer le tunnel compte gratuit → Premium.

## Mois 5

- commencer les partenariats enseignants ;
- publier des ressources éditoriales ciblées ;
- développer les pages qui obtiennent déjà des impressions ;
- éviter les nouvelles catégories sans demande observable.

## Mois 6

- comparer les familles de pages ;
- améliorer les gagnantes ;
- fusionner ou désindexer les pages faibles ;
- décider si le volume justifie une migration SSG plus complète ;
- établir le calendrier éditorial suivant à partir des requêtes Search Console.

---

# Ordre strict recommandé

Ne pas commencer par générer des milliers de pages.

L'ordre qui réduit le risque est :

1. stabiliser les fiches publiques ;
2. mesurer les conversions ;
3. prérendre les pages principales ;
4. publier un petit lot de pages dictionnaire/conjugaison ;
5. observer Search Console ;
6. améliorer la qualité et le maillage ;
7. augmenter progressivement le volume ;
8. ajouter les actions marketing externes.

---

# Définition de « terminé »

Le premier chantier SEO est terminé lorsque :

- une fiche premium reste consultable sans connexion ;
- elle contient une vraie valeur gratuite ;
- elle ne révèle pas le texte complet ;
- son HTML initial et son DOM après hydratation racontent la même chose ;
- sa canonical reste stable ;
- son paywall est correctement balisé ;
- son CTA est mesuré ;
- Google peut l'indexer ;
- une conversion peut être attribuée à sa page d'entrée ;
- le build et les tests de sécurité continuent de passer.

À ce moment-là seulement, le catalogue existant devient un véritable actif
marketing et peut commencer à produire un tunnel de clients organiques.
