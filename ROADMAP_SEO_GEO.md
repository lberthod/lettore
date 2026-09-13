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

- [ ] **Réponses directes en tête de page** : vérifier que les pages clés (méthode,
      dictionnaire, conjugaison) ouvrent sur une réponse factuelle claire avant toute
      prose marketing — format que les LLM citent préférentiellement.
- [ ] **Données factuelles datées** : remplacer les formulations vagues ("depuis
      plusieurs années", "des centaines de textes") par des chiffres précis et à jour
      (nombre exact de textes, année de lancement) — cohérent avec le catalogue déjà
      dynamique (`index.json`), donc automatisable dans `llms.txt` et les meta descriptions.
- [ ] **E-E-A-T / auteur identifiable** : mentions légales, responsable du site,
      coordonnées vérifiables — à vérifier sur `/a-propos` et le footer.
- [ ] **Tenir `llms.txt` synchronisé** avec le catalogue réel (nombre de textes, pages
      principales) à chaque évolution significative du site — actuellement rédigé à la
      main, risque de dérive dans le temps.

## Phase 4 — Performance & suivi (mesure continue)

- [ ] **Mesurer les Core Web Vitals réels** en prod via PageSpeed Insights (LCP < 2.5s,
      CLS < 0.1, INP < 200ms) — pas encore fait dans cet audit (nécessite le site déployé).
- [ ] **Confirmer HTTPS/certificat** et l'absence de chaînes de redirection sur les
      URLs canoniques.
- [ ] **Google Search Console** : confirmer que le sitemap est bien soumis et suivre
      l'indexation à J+7 / J+30 après chaque changement structurel important
      (nouvelle route, nouveau type de page SEO).
- [ ] **Analytics** : confirmer qu'un outil de mesure (privacy-friendly de préférence)
      est en place pour suivre le trafic organique et son évolution.

---

## Notes de suivi

- Prochaine revue : après implémentation de la Phase 1, revalider avec le Rich
  Results Test et une relecture rapide de `llms.txt`.
- Ne pas dupliquer d'efforts avec la checklist standard PME — ce document est
  spécifique au profil "app de contenu / SaaS" de Leggendo.
