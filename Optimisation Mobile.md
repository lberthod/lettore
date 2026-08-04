# Optimisation Mobile — sortir du « site web dans une WebView »

Date : 2026-08-03

Ce document fait suite aux corrections d'ergonomie déjà livrées (commit
`f9c8b88`, voir [apkdoc.md](apkdoc.md) pour le contexte packaging Android) :
zones sûres edge-to-edge, orientation portrait forcée, mots décoratifs
masqués sur mobile étroit. Ces correctifs rendent l'app *utilisable*
correctement sur mobile. Ce plan s'attaque à l'étape suivante : la faire
**ressembler et se comporter comme une app native**, pas comme le site
`leggendo.fr` chargé dans une fenêtre sans barre d'adresse.

## Diagnostic — pourquoi ça se sent « site web »

Constat fait en inspectant le code (pas une impression) :

1. **Pas de layout d'app partagé.** [`src/App.vue`](src/App.vue) ne
   contient qu'un `<RouterView />` nu. `SiteHeader`/`SiteFooter` sont
   réinstanciés dans chaque écran (`SceneLayout.vue`, et individuellement
   dans `HomeView.vue`, `WordsView.vue`, `PricingView.vue`,
   `MethodView.vue`, `MethodTextView.vue`). Impossible d'avoir un chrome
   d'app cohérent (barre d'onglets, transitions) sans le brancher à la
   main sur 6+ écrans.
2. **L'accueil est une landing page marketing**, pas un tableau de bord :
   hero animé, tagline SEO, CTA « Commencer à lire ». Pertinent pour un
   visiteur anonyme sur le web (conversion), inutile — voire agaçant —
   pour quelqu'un qui a déjà installé l'app et est connecté.
3. **Navigation desktop** : menu hamburger qui déplie une liste de liens
   texte, avec deux sous-menus déroulants (« Lessico », « Scrivi »,
   [`SiteHeader.vue`](src/components/SiteHeader.vue)). Aucun pattern
   mobile (barre d'onglets, tiroir latéral standard).
4. **Pied de page légal sur chaque écran** : 7 liens (Abonnement, Test de
   niveau, Giochi, Contact, Mentions légales, Confidentialité, CGU/CGV,
   [`SiteFooter.vue`](src/components/SiteFooter.vue)) — nécessaire sur un
   site public (SEO, obligations légales visibles), hors-sujet comme
   chrome permanent d'une app installée.
5. **Aucune sensation native** : pas de `@capacitor/status-bar` (barre de
   statut non thémée), pas de `@capacitor/haptics` (aucun retour
   tactile), pas de `@capacitor/app` (le bouton retour matériel Android
   n'est pas géré explicitement — comportement WebView par défaut, pas
   fiable). Aucune transition entre écrans (`<RouterView>` sans
   `<Transition>` : les pages « sautent » plutôt que de s'animer).

## Principe directeur — ne rien casser côté web

Le code utilise déjà partout un pattern de branchement natif/web :
`const isNative = Capacitor.isNativePlatform()` (voir
[`src/tts.js:13`](src/tts.js), [`src/lib/auth.js`](src/lib/auth.js),
[`src/lib/billing.js`](src/lib/billing.js),
[`src/lib/speechRecognition.js`](src/lib/speechRecognition.js)) et son
équivalent réactif dans les vues (`PricingView.vue`, `LoginView.vue`).
Tout ce plan suit la même règle : **le natif est additif**. Le site public
(SEO, prérendu, `leggendo.fr`) garde exactement le chrome actuel ; l'app
Capacitor bascule sur un chrome différent. Aucune des quatre phases
ci-dessous ne doit toucher au rendu web par défaut.

---

## Phase 1 — Coquille native (navigation + chrome)

La phase à plus fort impact : c'est la nav qui dit « site » ou « app » au
premier coup d'œil.

### Sprint 1.1 — Layout d'app natif centralisé

**État constaté** : pas de point d'entrée unique pour un chrome
conditionnel — `App.vue` ne fait que router. Ajouter la logique native
dans chaque vue (comme fait pour les zones sûres en Phase précédente)
serait la 3ᵉ fois qu'on duplique ce branchement sur 6+ fichiers.

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `src/lib/platform.js` (nouveau) | `export const isNativeApp = Capacitor.isNativePlatform()` — constante unique, réutilisée partout au lieu de réimporter `Capacitor` dans chaque composant. |
| `src/App.vue` | Devient le vrai layout : `<NativeAppShell v-if="isNativeApp"><RouterView/></NativeAppShell><RouterView v-else/>` (ou équivalent). C'est le seul endroit qui décide du chrome. |
| `src/components/NativeAppShell.vue` (nouveau) | Coquille native : contient la future barre d'onglets (Sprint 1.2), pas de `SiteHeader`/`SiteFooter`. |

**Critère de fini** : build web inchangé pixel pour pixel ; en contexte
Capacitor, `App.vue` rend `NativeAppShell` (vérifiable via un `console.log`
temporaire ou l'inspecteur Chrome DevTools sur l'émulateur).

### Sprint 1.2 — Barre d'onglets native (bottom tab bar)

**État constaté** : la nav actuelle liste ~15 destinations à plat (voir
`SiteHeader.vue`). Une app mobile en montre 4-5 en permanence, le reste
va dans un écran « Plus » ou le profil.

**Proposition de découpage** (à valider avec toi avant implémentation) :
`Accueil` (Sprint 2) · `Testi` (bibliothèque + Classici fusionnés ou
onglet avec sous-tabs) · `Giochi` · `Lessico` (dictionnaire, regroupe
l'actuel sous-menu) · `Profil` (compte, abonnement, mentions légales —
voir Sprint 1.3).

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `src/components/NativeTabBar.vue` (nouveau) | 5 `RouterLink` avec icône + label, position fixed bottom, `padding-bottom: env(safe-area-inset-bottom)` (déjà le bon réflexe depuis la Phase précédente), état actif basé sur `route.meta.tab` plutôt que sur le nom exact (une route enfant doit garder l'onglet parent actif). |
| `src/router.js` | Ajouter `meta: { tab: 'testi' }` (etc.) aux routes concernées, pour que la barre sache quel onglet surligner sans liste de noms codée en dur dans le composant. |
| `src/components/NativeAppShell.vue` | Intègre `NativeTabBar` + réserve l'espace en bas du contenu scrollable (`padding-bottom` sur la zone de contenu, sinon la barre recouvre le bas des écrans comme `WordsView`/`ReaderView`). |

**Piège à éviter** : les écrans en `position: fixed; inset: 0` actuels
(`WordsView`, `PricingView`…) calculent leur hauteur sur tout le
viewport — avec une barre d'onglets fixe en plus, il faut leur soustraire
sa hauteur (variable CSS `--tab-bar-height`), pas juste ajouter un
padding qui les ferait déborder.

**Critère de fini** : sur l'émulateur/device, les 5 onglets sont visibles
en permanence, l'onglet actif est visuellement distinct, aucun écran
existant n'a de contenu caché sous la barre.

### Sprint 1.3 — Sortir le légal/compte du chrome permanent

**État constaté** : `SiteFooter.vue` (Abonnement, Test de niveau, Giochi,
Contact, mentions légales, confidentialité, CGU/CGV) s'affiche sur *tous*
les écrans. `ProfileView.vue` existe déjà comme écran de compte.

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `src/components/NativeAppShell.vue` | Pas de `SiteFooter` du tout en natif (déjà acquis via Sprint 1.1 — SiteFooter n'est simplement jamais monté dans la coquille native). |
| `src/views/ProfileView.vue` | Ajouter une section « Informations légales » qui reprend les liens de `SiteFooter` (mentions légales, confidentialité, CGU/CGV, contact) — un seul endroit pour les retrouver, cohérent avec ce que fait Instagram/Duolingo/etc. |
| `src/router.js` | Vérifier que `legal`, `privacy`, `terms`, `contact` restent accessibles par URL directe (deep link) même sans lien de nav visible partout — ils le sont déjà (routes indépendantes), juste plus liées visuellement qu'au clic depuis Profil. |

**Critère de fini** : en natif, aucun écran n'affiche plus le bandeau
légal en bas ; les 4 pages légales restent atteignables depuis Profil et
par lien direct.

### Sprint 1.4 — Bouton retour matériel Android

**État constaté** : `AndroidManifest.xml` ne déclare aucune gestion du
bouton retour, `@capacitor/app` n'est pas installé. Comportement WebView
par défaut : imprévisible selon l'historique interne (peut fermer l'app
sans confirmation sur l'écran d'accueil, ou ignorer le bouton dans une
modale).

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `package.json` | `npm install @capacitor/app`. |
| `src/lib/platform.js` ou nouveau `src/lib/backButton.js` | Écoute `App.addListener('backButton', ...)` : priorité à `router.back()` si l'historique interne le permet, sinon fermer une modale ouverte (quiz, traduction) avant de laisser remonter, et double-tap pour quitter depuis l'onglet Accueil (pattern standard Android, évite la fermeture accidentelle). |
| `src/main.js` | Initialise l'écoute uniquement si `isNativeApp` (voir `main.js:28` pour le pattern déjà en place avec le service worker). |

**Critère de fini** : sur Android, le bouton retour matériel navigue dans
l'historique de l'app plutôt que de la fermer brutalement ; depuis
l'accueil, un premier appui affiche un toast « Rappuyez pour quitter »
plutôt que de fermer directement.

---

## Phase 2 — Accueil natif = tableau de bord

### Sprint 2.1 — Écran d'accueil conditionnel

**État constaté** : `router.js` route `home` → `HomeView.vue`
inconditionnellement, que l'utilisateur soit connecté ou non, web ou
natif. `isLoggedIn()` existe déjà (`src/lib/access.js`, utilisé par
`SiteHeader.vue`).

**Fichiers à toucher**

| Fichier | Changement |
|---|---|
| `src/views/NativeHomeView.vue` (nouveau) | Tableau de bord : reprise de lecture (dernier texte/chapitre ouvert — vérifier ce que `progress.js` sait déjà stocker), raccourcis vers Giochi/Testi, streak/progression si déjà calculée ailleurs (`src/lib/metrics.js`). Pas de hero, pas de CTA marketing. |
| `src/router.js` | Route `home` : composant conditionné par `isNativeApp` (`component: () => isNativeApp ? import('./views/NativeHomeView.vue') : import('./views/HomeView.vue')`, ou un petit composant `HomeRouter.vue` qui choisit au rendu). |

**Point ouvert** : si l'utilisateur natif n'est *pas* connecté (première
ouverture après install), le tableau de bord n'a rien à montrer — dans ce
cas précis, garder une version allégée de la landing (juste le CTA
connexion/essai, sans le pavé SEO) a du sens. À trancher avant
implémentation.

**Critère de fini** : un compte connecté qui ouvre l'app tombe sur ses
lectures en cours, pas sur un argumentaire marketing ; le web est
inchangé.

---

## Phase 3 — Sensations natives

### Sprint 3.1 — Barre de statut thémée

**Fichiers à toucher** : `npm install @capacitor/status-bar` ;
`src/main.js` (ou `NativeAppShell.vue`) configure la couleur de fond
(`#faf6f0`, cohérente avec `theme-color` déjà dans `index.html`) et le
style d'icônes (sombre sur fond clair) au démarrage.

**Critère de fini** : la barre de statut Android n'est plus noire/grise
par défaut mais assortie au fond crème de l'app.

### Sprint 3.2 — Retour haptique

**Fichiers à toucher** : `npm install @capacitor/haptics` ; un petit
wrapper `src/lib/haptics.js` (`tapFeedback()`, no-op sur web) branché sur
les actions à forte valeur : réponse quiz correcte/incorrecte
(`QuizSection.vue`), changement d'onglet (`NativeTabBar.vue`), like/mot
favori (`WordsView.vue`).

**Critère de fini** : ces interactions vibrent brièvement sur device réel
(pas testable sur émulateur — nécessite le Galaxy S23 Ultra ou un autre
device physique).

### Sprint 3.3 — Transitions de page

**Fichiers à toucher** : `App.vue`/`NativeAppShell.vue` enveloppe
`<RouterView>` dans un `<Transition>` Vue (slide horizontal en natif
uniquement — le web garde ses transitions actuelles, ou absence de
transitions, pour ne pas nuire au TTI perçu sur un lien externe).

**Critère de fini** : naviguer entre deux écrans en natif anime un
glissement plutôt qu'un changement instantané.

---

## Phase 4 (stretch) — Polish supplémentaire

Non chiffré en détail : à n'attaquer qu'une fois les Phases 1-3 livrées
et testées sur device réel.

- **Swipe-back geste** (retour en glissant depuis le bord gauche, pattern
  iOS repris par beaucoup d'apps Android) — nécessite une librairie de
  gestes ou une implémentation manuelle avec `touch_path`.
- **Pull-to-refresh** sur les listes (bibliothèque, dictionnaire) si un
  contenu serveur peut changer en session.
- **Illustrations natives** : les scènes SVG décoratives (`SceneLayout`,
  `HomeView`) sont pensées pour un écran large — évaluer des variantes
  recadrées/simplifiées pour mobile plutôt que le simple masquage actuel
  des mots flottants (Phase précédente).

---

## Ordre recommandé et effort

| Phase | Sprints | Effort relatif | Dépend de |
|---|---|---|---|
| 1 | 1.1 → 1.4 | Élevé (le plus gros morceau : nouvelle coquille + nav) | Rien, peut démarrer immédiatement |
| 2 | 2.1 | Moyen | Phase 1 (a besoin de `NativeAppShell`/`isNativeApp`) |
| 3 | 3.1 → 3.3 | Faible à moyen, indépendants entre eux | Phase 1 pour 3.1/3.3 ; 3.2 est indépendant |
| 4 | — | Variable | Phases 1-3 stabilisées |

Recommandation : livrer la Phase 1 complète avant de passer à la suite —
c'est elle qui change la perception « site vs app », les phases
suivantes ne font qu'ajouter du confort sur une base déjà crédible.
