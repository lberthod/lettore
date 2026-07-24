# Checklist avant mise en prod sur leggendo.fr

Récap de ce qui a été mis en place (SEO / GEO) et de ce qui reste à faire à la main
avant et après le premier déploiement sur le domaine définitif.

## Ce qui est déjà fait dans le code

- **`public/robots.txt` + `public/sitemap.xml`** — générés automatiquement par
  `scripts/generate-sitemap.mjs`, exécuté en `prebuild` (donc à chaque
  `npm run build`). Source : `src/seo/staticPages.js` (pages statiques) +
  `src/texts/index.json` (catalogue, ~460 textes).
- **Prérendu statique** — `scripts/prerender.mjs`, exécuté en `postbuild`.
  Génère pour chaque page indexable un fichier `.html` avec le vrai
  `<title>`, `<meta description>`, `<link rel="canonical">`, `og:title`/
  `og:description` et, quand la donnée existe, le **contenu visible** :
  - `/textes` → `dist/textes.html` : catalogue complet groupé par niveau,
    avec un vrai lien `<a>` vers chacun des ~460 textes (maillage interne,
    utile même pour les robots qui n'exécutent pas de JS).
  - `/testo/<id>` → `dist/testo/<id>.html` : titre, niveau/catégorie/genre,
    JSON-LD `LearningResource`. Les 6 textes de l'aperçu gratuit affichent
    le texte complet ; les autres affichent l'extrait + un appel à
    s'abonner (le contenu payant n'est jamais donné en clair).
  - Les autres pages (`/methode`, `/a-propos`, `/contact`, `/abonnement`,
    légal…) : seul le `<head>` est corrigé, le corps reste géré par Vue au
    chargement (pas de duplication de contenu risquée — voir limites
    ci-dessous).
  - Vue s'hydrate ensuite normalement par-dessus : testé en local via
    `firebase serve`, le lecteur interactif (traduction au clic, audio)
    fonctionne après le premier rendu statique.
- **Canonical + `noindex` dynamiques** dans `src/router.js` (`afterEach`) :
  toute navigation côté client pose aussi la bonne URL canonique et
  `noindex` sur les pages privées (compte, admin…).
- **`.htaccess`** (`public/.htaccess`, copié dans `dist/` au build) : HTTPS
  forcé, sert le `.html` prérendu s'il existe (`/testo/marco` →
  `testo/marco.html`), sinon fallback SPA vers `index.html`, cache long sur
  les assets hashés.
- **`firebase.json`** : `"cleanUrls": true` ajouté — équivalent du
  `.htaccess` côté Firebase Hosting (utile pour l'environnement de debug
  `leggendo-dbb84.web.app`).
- **Meta sitewide** (`index.html`) : `theme-color`, `og:url`/`og:locale`,
  `twitter:card` (summary_large_image) + `twitter:title/description/image`,
  JSON-LD `Organization` + `WebSite` toujours présents (même hors
  prérendu). Corrigé aussi : la description annonçait encore "A1 à C1" alors
  que le catalogue va jusqu'à C2.
- **JSON-LD par page** (`scripts/prerender.mjs`) : `FAQPage` sur `/methode`
  (questions/réponses réellement affichées dans `MethodView.vue`),
  `Product`/`Offer` sur `/abonnement` (prix de référence en EUR),
  `LearningResource` sur chaque texte — utile pour l'affichage enrichi
  Google et pour les moteurs de réponse (ChatGPT, Perplexity…) qui
  s'appuient sur les données structurées.
- **`public/llms.txt`** : résumé du site en Markdown à destination des
  agents IA (pratique émergente, non standardisée mais adoptée par de plus
  en plus de sites — coût nul, complète le sitemap classique).

### Limites connues (pas du vrai SSR)

`scripts/prerender.mjs` ne fait **pas** de rendu des composants Vue : c'est
du HTML généré à la main à partir des données JSON. Si le contenu de
`MethodView.vue`, `AboutView.vue` etc. change en profondeur, le script ne
le reflète pas automatiquement (seuls titre/description/canonical de ces
pages sont corrigés). Si ça devient un problème pour le SEO de ces pages
précises, passer à un vrai SSG (`vite-plugin-ssg` ou équivalent) est l'étape
suivante — non fait ici pour limiter le risque de casser l'app (Firebase
Auth et d'autres API navigateur rendraient un SSR complet plus délicat).

`EXAMPLE_TEXT_IDS` (les 6 textes en accès libre) est dupliqué dans
`scripts/prerender.mjs` (`pickFreeExampleIds`) car `src/lib/access.js`
importe des modules navigateur (`auth.js`, `firebase.js`) qui ne tournent
pas sous Node. **Si la logique de `pickExamples`/`EXAMPLE_COUNT` change
dans `access.js`, il faut la répercuter à la main dans `prerender.mjs`.**

## À faire avant le déploiement (une fois)

- [ ] **DNS** : pointer `leggendo.fr` vers l'hébergement Infomaniak (A
      record ou attache directe si le domaine est aussi chez Infomaniak).
- [ ] **SSL** : activer le certificat Let's Encrypt dans le manager
      Infomaniak.
- [ ] **Firebase Console → Authentication → Settings → Authorized domains**
      : ajouter `leggendo.fr` (et `www.leggendo.fr` si utilisé). Sans ça,
      la connexion échoue silencieusement sur le nouveau domaine.
- [ ] Vérifier que `SITE_URL` dans `src/seo/staticPages.js` correspond bien
      au domaine final (`https://leggendo.fr` — déjà en place).
- [ ] **Créer `public/og-image.png`** (1200×630px, <1 Mo) : image de
      partage social (Facebook/LinkedIn/X/WhatsApp), référencée dans
      `index.html` (`og:image`/`twitter:image`) mais le fichier n'existe pas
      encore — sans lui, les liens partagés n'auront pas d'aperçu visuel.
      Pas de génération automatique ici (pas d'outil image dans ce projet) :
      créer un visuel avec le logo/titre "Leggendo" à la main (Figma, Canva…).
- [ ] **Icônes iOS/Android** : seul `favicon.svg` existe. Pour un rendu
      propre en icône d'accueil (ajout à l'écran d'accueil iOS, PWA
      Android), ajouter `public/apple-touch-icon.png` (180×180) et
      `public/favicon.ico` (fallback navigateurs anciens), puis les
      référencer dans `index.html` (`<link rel="apple-touch-icon" ...>`) et
      dans `manifest.icons` (`vite.config.js`).

## À chaque déploiement

- [ ] `npm run build` (génère sitemap/robots puis prérend automatiquement —
      rien à lancer à part ça).
- [ ] Upload du contenu de `dist/` vers la racine web Infomaniak en SFTP.
- [ ] Vérifier après upload : `https://leggendo.fr/robots.txt`,
      `https://leggendo.fr/sitemap.xml`, et qu'une page texte
      (`/testo/marco`) affiche le bon titre en vue source (clic droit →
      "Afficher le code source", pas juste l'inspecteur qui montre le DOM
      déjà hydraté par Vue).

## À faire une fois le site en ligne sur le vrai domaine

- [ ] **Google Search Console** : ajouter la propriété `leggendo.fr`,
      soumettre `sitemap.xml`.
- [ ] **Bing Webmaster Tools** : idem (alimente aussi Copilot/ChatGPT via
      Bing index dans certains cas).
- [ ] Vérifier l'indexation de quelques URLs clés via l'outil
      "Inspection d'URL" de Search Console (`/`, `/textes`, un `/testo/xxx`).
- [ ] Tester le rendu tel que vu par un robot sans JS : `curl -s
      https://leggendo.fr/testo/marco | grep -i "<h1"` doit renvoyer le
      titre du texte, pas une page vide.
- [ ] `leggendo.ch` (optionnel, marché suisse) : à acheter et configurer en
      redirection 301 vers `leggendo.fr` — pas de site séparé pour éviter
      de fragmenter le SEO.
