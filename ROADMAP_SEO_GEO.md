# Roadmap SEO / GEO — Leggendo

Ce document priorise les actions de référencement (SEO classique + GEO, visibilité
dans les moteurs génératifs type ChatGPT/Perplexity) restant à faire, sur la base
d'un audit du projet le 2026-09-13. Contexte : Leggendo n'est **pas** un site vitrine
PME géolocalisé — la checklist standard `checklist-seo-geo-standard.md` a été filtrée
en conséquence (pas de LocalBusiness, NAP, Google Business Profile : sans objet ici).

État déjà acquis, pour mémoire (ne pas refaire) :
- Prérendu statique par route ([scripts/prerender.mjs](scripts/prerender.mjs)) pour les bots sans JS
- `robots.txt`, `sitemap.xml`, canonical dynamique par route
- JSON-LD `Organization` + `WebSite` sur toutes les pages, `FAQPage` sur `/methode`
- `llms.txt` à la racine ([public/llms.txt](public/llms.txt))
- Pages SEO dynamiques : landing pages par niveau, dictionnaire, conjugaison
- Pas de contenu image éditorial → alt text sans objet

---

## Phase 1 — Quick wins (faible effort, impact direct)

- [x] **`BreadcrumbList` JSON-LD** sur les pages profondes : `/testo/:id`,
      `/classici/:livre/:chapitre`, `/dizionario/:lemme`, `/coniugazione/:verbo`.
      Généré dans [scripts/prerender.mjs](scripts/prerender.mjs) via `breadcrumbJsonLd()`,
      validé sur un échantillon des 4 types de pages (JSON bien formé, hiérarchie correcte).
- [x] **Vérifier le Rich Results Test** (Google) — testé sur `/testo/a_scuola` (extrait
      représentatif : meta + JSON-LD LearningResource + BreadcrumbList) via
      search.google.com/test/rich-results (onglet « Code ») : **1 élément valide détecté,
      Fils d'Ariane, aucune erreur**. Toujours revalider un échantillon après tout
      changement de `prerender.mjs` — non automatisé, à refaire manuellement.
- [x] **Vérifier l'absence de duplication de contenu** entre `/testo/:id` (catalogue)
      et les textes utilisateurs partagés (`/condividi/:id`, [src/router.js:72](src/router.js:72))
      — confirmé exclus par `robots.txt` (`Disallow: /condividi/`). Pas de page prérendue
      pour cette route (absente de `ROUTES`), donc pas de contenu dupliqué indexable.

## Phase 2 — Contenu & structure (effort moyen)

- [x] **FAQ étoffée par page clé** au-delà de `/methode` : FAQ ajoutée sur `/abonnement`
      (4 questions : résiliation, différence Premium/Premium IA, effet de l'annulation,
      sécurité du paiement) — accordéon dans [PricingView.vue](src/views/PricingView.vue),
      `FAQPage` JSON-LD injecté au montage (même pattern que `MethodView.vue`) et
      dupliqué dans [prerender.mjs](scripts/prerender.mjs) pour le contenu statique.
      Vérifié en live (build + accordéon fonctionnel + JSON-LD présent dans le head).
      Home laissée telle quelle : sa page est une porte d'entrée courte, une FAQ
      alourdirait le message sans bénéfice clair — `/methode` couvre déjà les questions
      méthodologiques generalistes.
- [x] **Maillage interne** : audit fait. Les 4 landing pages par niveau
      (`/textes-italien-a1`..`b2`, [src/seo/landingPages.js](src/seo/landingPages.js))
      étaient orphelines — aucun lien entrant nulle part dans l'app, seulement
      atteignables via le sitemap. Corrigé en ajoutant une section « Textes A1/A2/B1/B2 »
      dans [SiteFooter.vue](src/components/SiteFooter.vue), affichée sur tout le site
      (hors app native) : chaque page en gagne désormais un lien direct depuis n'importe
      où. Dictionnaire/conjugaison/Classici étaient déjà bien maillés (liens croisés
      dizionario ↔ coniugazione, `/verbi` → verbes clés, `/classici` → chaque livre).
- [ ] **Contenu informationnel amont** (blog/actus) — en attente d'une décision éditoriale,
      pas implémenté ici : contrairement aux points précédents, ouvrir une section
      blog/actus engage un travail de contenu récurrent (sujets, rythme de publication),
      pas juste un changement de code. `/methode` et `/methodologie` couvrent déjà une
      partie de la tête de funnel ("comment apprendre l'italien", méthode lecture
      extensive) — à évaluer : le jeu en vaut-il la chandelle avant d'investir plus ?

## Phase 3 — GEO avancé (visibilité IA générative)

- [x] **Réponses directes en tête de page** : vérifié sur `/methode` (prerender.mjs),
      `/dizionario/:lemme` et `/coniugazione/:verbo` — chacune ouvre déjà sur une
      réponse factuelle (nature grammaticale + traduction, définition, tableaux) avant
      toute prose. Rien à changer.
- [x] **Données factuelles datées** : recherche de formulations vagues ("depuis
      plusieurs années"...) dans `src/views/*.vue` — aucune trouvée. `/a-propos` utilise
      déjà des chiffres calculés au build (`virtual:catalog`, `catalogStats`), pas de
      valeurs codées en dur à corriger.
- [x] **E-E-A-T / auteur identifiable** : déjà en place sur
      [LegalView.vue](src/views/LegalView.vue) — éditeur nommé (Loïc Berthod), contact,
      hébergeur, droit applicable. Rien à ajouter.
- [x] **`llms.txt` resynchronisé** — dérive trouvée et corrigée : le fichier citait une
      formule **« Premium+ »** qui n'existe plus (le vrai nom est **Premium IA**, voir
      [stripe.js](src/lib/stripe.js)), et arrondissait le nombre de textes à ~460 alors
      que le catalogue en compte 466. Corrigé dans [public/llms.txt](public/llms.txt).
      Ce fichier reste rédigé à la main (contrairement à `sitemap.xml`/`robots.txt`,
      générés par [scripts/generate-sitemap.mjs](scripts/generate-sitemap.mjs)) — à
      relire manuellement après tout changement de nom de formule ou saut notable du
      nombre de textes.

## Phase 4 — Performance & suivi (mesure continue)

- [x] **Core Web Vitals mesurés en prod** (PageSpeed Insights, mobile, 2026-09-13) sur
      https://leggendo.fr : **Performance 99, Accessibilité 89, Bonnes pratiques 100,
      SEO 100**. LCP 1,4s (< 2,5s ✓), CLS 0 (< 0,1 ✓), TBT 120ms, FCP 0,8s — largement
      dans les clous. Rien à optimiser côté performance/SEO technique.
      Deux pistes accessibilité mineures relevées en passant (hors périmètre SEO strict,
      à traiter séparément si voulu) : contraste de couleur insuffisant par endroits,
      zones tactiles un peu petites sur certains éléments.
- [x] **HTTPS confirmé** sur le domaine de prod (analysé via `https://leggendo.fr`),
      catégorie « Bonnes pratiques » à 100 (inclut les vérifications de sécurité de base).
- [ ] **Google Search Console** (nécessite votre compte Google, non vérifiable depuis
      cette session) : confirmer que `sitemap.xml` est bien soumis, et suivre
      l'indexation à J+7 / J+30 après le déploiement des changements de cette roadmap
      (nouveaux JSON-LD, nouveaux liens de footer).
- [ ] **Analytics** (idem, nécessite votre accès) : confirmer qu'un outil de mesure
      (privacy-friendly de préférence) est en place pour suivre le trafic organique.

---

## État au 2026-09-13 : Phases 1 à 4 traitées

Tout ce qui était vérifiable/implémentable sans accès à vos comptes Google est fait.
Il ne reste que la Search Console et l'Analytics (case ci-dessus) à confirmer de votre
côté. Changements de code committés : `scripts/prerender.mjs`, `PricingView.vue`,
`SiteFooter.vue`, `public/llms.txt`.

**Import : les changements de footer et de FAQ ne sont pas encore déployés en
production** (testés en local uniquement) — un déploiement (`npm run build` +
`firebase deploy`) est nécessaire pour qu'ils soient visibles sur leggendo.fr.

## Notes de suivi

- Prochaine revue : après déploiement, revalider avec le Rich Results Test sur
  `/abonnement` (nouveau FAQPage) et confirmer les liens de footer en prod.
- Ne pas dupliquer d'efforts avec la checklist standard PME — ce document est
  spécifique au profil "app de contenu / SaaS" de Leggendo.
