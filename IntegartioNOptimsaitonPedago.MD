# Intégration et optimisation pédagogique de Leggendo

Date : 1er août 2026  
Statut : document de cadrage réaliste, fondé sur le code existant  
Produit : application d'apprentissage de l'italien pour francophones

## 1. Finalité du document

Ce document transforme l'audit pédagogique en plan d'intégration concret. L'objectif n'est pas d'ajouter le plus de fonctions possible, mais de relier les fonctions déjà présentes pour créer un apprentissage continu, compréhensible, adaptatif et mesurable.

Leggendo possède déjà les éléments essentiels : lecture graduée, écoute, dictionnaire, traduction, quiz, vocabulaire, répétition espacée, prononciation, écriture corrigée, dialogue interactif, grammaire, suivi par compétence et synchronisation. Le chantier prioritaire est maintenant l'**orchestration pédagogique**.

La cible réaliste est la suivante :

> À chaque session, l'apprenant sait quoi faire, pourquoi il le fait, reçoit un retour utile, réutilise immédiatement la correction et retrouve plus tard ce qu'il doit consolider.

## 2. État réel de l'application

### 2.1 Fonctions déjà disponibles

| Domaine | Fonction actuelle | Principaux fichiers |
|---|---|---|
| Lecture | Textes A1-C2, classiques, actualités, textes personnels | `ReaderView.vue`, `BookReaderView.vue`, `LibraryView.vue` |
| Aides | Traduction de mot et de phrase, dictionnaire, conjugaison | `translate.js`, `DictionaryView.vue`, `ConjugationView.vue` |
| Compréhension | Quiz avec mélange des réponses et explication facultative | `QuizSection.vue` |
| Écoute | TTS phrase par phrase et mode `ascolto` | `ReaderView.vue`, `tts.js` |
| Prononciation | Répétition d'une phrase, reconnaissance vocale et score | `PronunciationDrill.vue`, `speechRecognition.js` |
| Écriture | Zone de texte, correction IA, catégorisation des erreurs, niveau estimé | `WriteView.vue`, `lib/correction.js` |
| Dialogue | Scénarios conversationnels, conversation et bilan final | `DialogueView.vue`, `lib/dialogue.js` |
| Vocabulaire | Favoris, mots connus et révision Leitner | `WordsView.vue`, `VocabularyView.vue`, `progress.js` |
| Erreurs | Cartes issues de l'écriture, du dialogue et de la prononciation | `progress.js` |
| Progression | Série, journal d'activité, agrégats et profil par compétence | `progress.js`, `ProfileView.vue` |
| Recommandation | Une prochaine action selon les révisions et activités récentes | `lib/percorso.js`, `HomeView.vue` |
| Synchronisation | Fusion localStorage/Firestore entre appareils | `lib/progressSync.js` |
| Grammaire | Référence grammaticale et orthographique en français | `GrammarView.vue` |

### 2.2 Forces actuelles

- Le catalogue permet une exposition importante et graduée à l'italien.
- Les aides sont disponibles sans interrompre complètement la lecture.
- La production écrite et le dialogue font sortir l'utilisateur d'un rôle passif.
- Les erreurs de production peuvent déjà devenir des cartes de révision.
- Le journal d'activité rend possible une personnalisation future sans reconstruire toute l'infrastructure.
- La progression est utilisable hors ligne et synchronisée entre appareils.
- La gamification reste sobre : elle ne repose pas encore sur une inflation artificielle de points.

### 2.3 Faiblesses actuelles

- Les outils existent encore comme des destinations séparées.
- Le feedback peut être lu sans être réutilisé.
- Le niveau global dépend surtout des estimations d'écriture et ne représente pas toutes les compétences.
- Le nombre d'activités mesure davantage l'assiduité que la maîtrise.
- Le système Leitner est binaire : réussi ou raté, sans degré de difficulté.
- Les cartes d'erreurs peuvent manquer de contexte pour être comprises plusieurs jours plus tard.
- La grammaire est riche comme référence, mais peu reliée aux erreurs personnelles.
- Le TTS et la reconnaissance vocale ne mesurent pas réellement la prosodie ou l'accent.

## 3. Principes pédagogiques à respecter

### 3.1 Une seule intention par écran

L'utilisateur doit toujours identifier l'action principale. Un écran peut proposer des options secondaires, mais il ne doit pas présenter lecture, quiz, dialogue, vocabulaire et grammaire comme cinq priorités équivalentes.

### 3.2 Produire avant de montrer la réponse

Quand cela est raisonnable, l'application demande d'abord un rappel, une phrase ou un choix. La réponse et l'explication viennent ensuite. Cette récupération active est plus efficace que la relecture répétée.

### 3.3 Corriger peu, mais faire réutiliser

Une correction exhaustive est utile comme référence, mais l'étape active doit sélectionner une ou deux erreurs prioritaires. L'apprenant les reformule immédiatement, puis les retrouve plus tard en répétition espacée.

### 3.4 Adapter la difficulté sans enfermer

Le système recommande un contenu, mais l'utilisateur conserve la liberté de changer. L'adaptation doit soutenir l'autonomie, pas créer un tunnel opaque.

### 3.5 Mesurer séparément les compétences

Lecture, écoute, écriture, interaction, vocabulaire et prononciation n'évoluent pas à la même vitesse. Aucun niveau global ne doit masquer ces écarts.

### 3.6 Gamifier l'effort utile

Les récompenses doivent correspondre à une activité pédagogique réelle : réécrire une phrase, rappeler un mot, terminer une écoute ou réutiliser une correction. Une ouverture de page ou une suite de clics ne mérite pas de récompense.

## 4. Parcours cible d'une session

### 4.1 Entrée

À l'arrivée, l'utilisateur connecté voit :

- sa continuité actuelle ;
- la durée proposée : 5, 10 ou 20 minutes ;
- un objectif simple ;
- une action principale « Commencer » ;
- un lien secondaire « Changer de programme ».

### 4.2 Composition réaliste

Exemple de session de 10 minutes :

1. deux minutes de révision des éléments dus ;
2. cinq minutes de lecture ou d'écoute adaptée ;
3. deux minutes de production liée au contenu ;
4. une minute de correction et de seconde tentative.

La session ne doit pas être chronométrée de manière stricte. La durée est une estimation destinée à réduire l'effort de décision.

### 4.3 Fin de session

L'écran final présente :

- ce qui a été pratiqué ;
- une réussite concrète ;
- un seul point à consolider ;
- la prochaine échéance utile ;
- une possibilité de continuer, sans pression.

## 5. Intégration prioritaire 1 — seconde tentative après feedback

### 5.1 Problème

Le système explique déjà des erreurs et les sauvegarde. Cependant, comprendre une explication ne garantit pas que l'apprenant puisse produire la forme correcte.

### 5.2 Comportement cible

Après une correction d'écriture ou un bilan de dialogue :

1. classer les erreurs ;
2. sélectionner une ou deux erreurs prioritaires ;
3. montrer une explication courte ;
4. demander une reformulation ;
5. vérifier la nouvelle réponse ;
6. valider ou fournir un indice ;
7. créer ou mettre à jour la carte SRS.

Pour la prononciation, une seconde répétition doit être proposée quand le score reste sous un seuil raisonnable. Elle ne doit pas être bloquante si la reconnaissance vocale semble défaillante.

### 5.3 Priorisation des erreurs

Ordre recommandé :

1. phrase difficile à comprendre ;
2. erreur grammaticale récurrente ;
3. mauvais choix lexical qui change le sens ;
4. orthographe ;
5. amélioration idiomatique ;
6. préférence stylistique.

Une préférence stylistique ne doit jamais être affichée comme une faute certaine.

### 5.4 Modifications envisagées

- Étendre `WriteView.vue` avec une phase `rewrite` après le résultat.
- Étendre `DialogueView.vue` avec une courte reprise de deux formulations.
- Ajouter un composant partagé, par exemple `CorrectionRetry.vue`.
- Conserver la correction complète dans le bilan, mais limiter l'exercice actif.
- Ajouter aux événements `scrittura` et `dialogo` : `retryCount`, `retrySuccess` et `errorTypes`.

### 5.5 Critères d'acceptation

- Une production sans erreur ne déclenche aucune étape artificielle.
- Une production contenant plusieurs erreurs ne demande pas plus de deux reprises à la fois.
- La réponse originale et la correction restent visibles.
- L'apprenant peut demander un indice.
- La même erreur n'engendre pas plusieurs cartes identiques.
- La seconde tentative fonctionne au clavier mobile.

## 6. Intégration prioritaire 2 — session quotidienne composée

### 6.1 Évolution de la prochaine action

`lib/percorso.js` choisit actuellement une action unique selon des règles transparentes. Cette base doit être conservée et étendue progressivement. Une réécriture complète avec un moteur opaque n'est pas nécessaire.

Le nouveau moteur peut produire :

```js
{
  duration: 10,
  objective: "Comprendre et réutiliser le vocabulaire du voyage",
  steps: [
    { type: "review", estimatedMinutes: 2, count: 5 },
    { type: "ascolto", estimatedMinutes: 5, textId: "..." },
    { type: "write", estimatedMinutes: 3, promptId: "..." }
  ]
}
```

### 6.2 Signaux utilisés

- nombre de mots et cartes d'erreur dus ;
- dernière pratique de chaque compétence ;
- scores récents ;
- niveau mesuré par compétence quand il existe ;
- contenus déjà terminés ;
- objectif personnel ;
- durée choisie ;
- disponibilité des fonctions Premium IA.

### 6.3 Règles initiales réalistes

- Ne jamais planifier plus de trois étapes.
- Toujours traiter les révisions très en retard en premier, mais les plafonner.
- Ne pas proposer deux activités IA coûteuses dans une session courte.
- Ne pas recommander une compétence uniquement parce que son compteur est bas si elle n'appartient pas à l'objectif de l'utilisateur.
- Alterner réception et production quand la durée le permet.
- Éviter de répéter exactement le même type de session plusieurs jours de suite.

### 6.4 Nouveaux paramètres utilisateur

Ajouter à la progression ou au profil :

```js
learningPreferences: {
  goal: "conversation" | "travel" | "exam" | "reading" | "general",
  dailyMinutes: 5 | 10 | 20,
  reminderEnabled: false,
  preferredActivities: [],
  avoidedActivities: []
}
```

Les activités évitées ne doivent pas être supprimées définitivement. Le moteur peut les proposer avec modération et expliquer leur utilité.

### 6.5 Interface

- Faire évoluer le bloc `Il tuo percorso` de `HomeView.vue`.
- Afficher la durée et les trois étapes maximum.
- Mettre en évidence l'étape en cours.
- Conserver la possibilité d'accéder directement à toutes les fonctions via la navigation.
- Reprendre une session interrompue localement avant d'en générer une nouvelle.

## 7. Intégration prioritaire 3 — boîte de texte pédagogique

### 7.1 Trois modes

La zone d'écriture doit rester simple tout en couvrant plusieurs besoins :

#### Libre

L'utilisateur écrit sans consigne imposée. Ce mode favorise l'autonomie, mais peut être difficile pour les débutants.

#### Guidé

L'application fournit :

- une situation ;
- un destinataire ;
- un objectif communicatif ;
- trois idées facultatives ;
- cinq mots ou structures utiles adaptés au niveau.

Exemple : « Vous écrivez à un hôtel pour modifier une réservation. Précisez la date, le nombre de personnes et posez une question sur le petit-déjeuner. »

#### Lié à un contenu

Depuis un texte terminé :

- résumer en deux ou trois phrases ;
- donner son avis ;
- imaginer la suite ;
- raconter depuis le point de vue d'un autre personnage ;
- réutiliser trois mots sélectionnés.

### 7.2 Aides progressives

Ordre des aides :

1. reformulation de la consigne ;
2. idées ;
3. mots utiles ;
4. amorces de phrases ;
5. exemple complet, uniquement sur demande.

L'utilisation d'une aide doit être enregistrée pour interpréter correctement la performance. Un texte réussi avec un exemple complet n'a pas la même valeur diagnostique qu'un texte autonome.

### 7.3 Feedback adapté au niveau

- A1-A2 : vocabulaire simple, explications en français, peu de corrections prioritaires.
- B1-B2 : davantage d'explications en italien simple, travail de cohésion et de registre.
- C1-C2 : naturel, précision, implicite, argumentation et style, sans inventer de fautes.

### 7.4 Données supplémentaires

Ajouter à l'activité d'écriture :

```js
{
  skill: "scrittura",
  mode: "libero" | "guidato" | "contenuto",
  promptId: "...",
  sourceTextId: "...",
  wordCount: 86,
  helpUsed: ["vocabulary"],
  errorCount: 4,
  priorityErrorCount: 2,
  retrySuccess: 1,
  level: "A2"
}
```

Ne pas enregistrer tout le texte de l'utilisateur dans `activity`. Si un historique des productions est souhaité, utiliser une collection dédiée avec règles d'accès et politique de suppression.

## 8. Intégration prioritaire 4 — cartes d'erreurs contextualisées

### 8.1 Structure cible

La structure actuelle peut évoluer sans casser les anciennes cartes :

```js
{
  id: "hash-stable",
  original: "Io sono andato a Roma ieri mattina.",
  correction: "Sono andato a Roma ieri mattina.",
  explanation: "Le pronom sujet est généralement omis en italien.",
  type: "grammatica",
  source: "scrivi",
  sourceId: "...",
  contextBefore: "...",
  contextAfter: "...",
  contrastExample: "Vado a scuola / Io, invece, resto qui.",
  box: 0,
  due: 0,
  lapses: 0,
  addedTs: 0
}
```

Les nouveaux champs restent facultatifs pour permettre la migration progressive.

### 8.2 Types d'exercices

- corriger la phrase ;
- compléter la forme manquante ;
- choisir entre deux formulations proches ;
- reformuler dans une nouvelle situation ;
- produire oralement une phrase courte.

Le type dépend de l'erreur. Une faute d'article se prête à un texte à trou ; un problème de registre demande un choix contextualisé.

### 8.3 Évolution du Leitner

Dans un premier temps, conserver Leitner pour limiter le risque. Ajouter seulement trois réponses :

- « oublié » : retour à la boîte 0 ;
- « difficile » : même boîte avec échéance courte ;
- « su » : boîte suivante.

Un passage immédiat à SM-2 ou FSRS n'est justifié que si le volume de révisions et les données d'usage permettent d'en mesurer l'intérêt.

## 9. Intégration prioritaire 5 — continuité entre les activités

### 9.1 Depuis la lecture

Après le quiz, proposer une seule suite recommandée :

- score faible : relire un passage ou écouter avec le texte ;
- score correct avec nombreuses traductions : relire sans aides ;
- bon score : résumer ou écouter sans texte ;
- vocabulaire nouveau : réutiliser trois mots dans une phrase ;
- dialogue narratif : jouer une situation proche.

### 9.2 Depuis l'écoute

- première écoute sans texte ;
- quiz de compréhension ;
- deuxième écoute avec transcription si nécessaire ;
- répétition d'une phrase clé ;
- sauvegarde d'un mot réellement difficile.

### 9.3 Depuis le vocabulaire

Après une petite session de révision, proposer une production utilisant deux ou trois mots revus. Il ne faut pas exiger tous les mots : la phrase deviendrait artificielle.

### 9.4 Depuis la grammaire

Une fiche grammaticale doit pouvoir s'ouvrir depuis une erreur avec une ancre précise. Elle se termine par deux ou trois micro-exercices, dont au moins un reprend le contexte personnel de l'erreur.

## 10. Profil de compétence réaliste

### 10.1 Ce qui peut être affiché maintenant

- fréquence de pratique ;
- score moyen récent en lecture ;
- nombre d'écoutes ;
- mots connus et révisions dues ;
- niveau estimé en écriture avec taille de l'échantillon ;
- nombre de dialogues ;
- score moyen de reconnaissance en prononciation.

### 10.2 Ce qui ne doit pas être affirmé

- « Vous êtes B2 en italien » à partir de quelques productions ;
- « Prononciation parfaite » à partir d'une transcription correcte ;
- « Mot maîtrisé » après une seule bonne réponse ;
- comparaison précise entre compétences fondées sur des mesures différentes.

### 10.3 Présentation recommandée

Pour chaque compétence :

- tendance sur quatre semaines ;
- date de dernière pratique ;
- indicateur compréhensible ;
- niveau de confiance de la mesure : faible, moyen ou suffisant ;
- prochaine action utile.

Un radar unique est visuellement séduisant mais donne une fausse impression de précision. Des cartes séparées sont plus honnêtes.

## 11. Gamification saine

### 11.1 À intégrer

- série liée à une activité réelle ;
- objectif quotidien flexible ;
- missions courtes ;
- progression visible dans la session ;
- célébration de la seconde tentative réussie ;
- badges rares fondés sur des capacités observables ;
- possibilité d'un jour de repos sans perdre tout le sens du parcours.

### 11.2 Exemples de missions

- « Écoute un texte avant d'afficher la transcription. »
- « Réutilise trois mots révisés dans deux phrases. »
- « Corrige puis réécris une de tes erreurs. »
- « Termine un dialogue en utilisant une formule de politesse. »
- « Lis un texte sans traduction de phrase. »

### 11.3 À éviter

- points pour chaque clic ;
- classement entre utilisateurs de niveaux différents ;
- perte brutale de tous les progrès après une journée manquée ;
- récompenses aléatoires ;
- notifications alarmistes ;
- badges si nombreux qu'ils ne signifient plus rien.

## 12. Données et synchronisation

### 12.1 Compatibilité

Tous les nouveaux champs doivent avoir une valeur par défaut dans `normalize()` de `progress.js`. Les anciennes données locales et Firestore doivent continuer à fonctionner.

### 12.2 Journal d'activité

Le plafond actuel de 500 événements évite une croissance illimitée. Pour des statistiques longues, il faudra soit :

- conserver des agrégats mensuels ;
- soit déplacer les événements dans une sous-collection paginée.

Il n'est pas réaliste de conserver indéfiniment un historique détaillé dans un seul document Firestore : taille, conflits d'écriture et coût de synchronisation augmenteraient.

### 12.3 Identifiants d'événements

La fusion actuelle déduplique l'activité par timestamp. Pour les sessions composées, ajouter un `eventId` et un `sessionId` stables est préférable. Deux événements simultanés sur deux appareils peuvent partager un timestamp, même si cela reste rare.

### 12.4 Confidentialité

- Ne pas envoyer de texte utilisateur aux outils d'analyse produit.
- Expliquer clairement qu'une production est transmise au service IA pour correction.
- Prévoir la suppression des productions sauvegardées.
- Ne pas inférer ou afficher de diagnostic sensible.
- Limiter les journaux serveur au nécessaire et éviter le contenu intégral dans les logs.

## 13. IA : exigences de qualité

### 13.1 Correction

Le modèle doit rendre une sortie structurée : texte corrigé, erreurs localisées, type, gravité, explication, alternative et estimation prudente du niveau.

### 13.2 Garde-fous

- Ne jamais changer une phrase correcte uniquement par préférence stylistique sans le signaler.
- Conserver le sens voulu par l'utilisateur.
- Employer le français pour les explications débutantes.
- Limiter le nombre d'erreurs prioritaires.
- Autoriser « aucune erreur ».
- Ne pas inventer une règle grammaticale pour justifier une reformulation.

### 13.3 Évaluation avant déploiement

Créer un jeu de test représentatif :

- 20 productions A1-A2 ;
- 20 productions B1-B2 ;
- 10 productions C1-C2 ;
- formulations correctes mais non idiomatiques ;
- régionalismes acceptables ;
- erreurs typiques des francophones ;
- phrases ambiguës ;
- textes sans erreur.

Deux personnes compétentes en italien doivent juger : exactitude, utilité, ton, respect du sens et fausses corrections. Une fonctionnalité de correction ne doit pas être validée uniquement par des tests techniques.

## 14. Accessibilité et expérience mobile

- Zone de texte suffisamment haute et redimensionnable sur le web.
- Bouton principal visible quand le clavier mobile est ouvert.
- Sauvegarde automatique du brouillon local.
- Reprise après fermeture ou perte de réseau.
- Navigation complète au clavier.
- États de succès et d'erreur qui ne reposent pas uniquement sur la couleur.
- Transcription disponible pour tout audio.
- Option de ralentissement, mais également exposition progressive au débit normal.
- Retour clair quand la reconnaissance vocale n'est pas disponible.
- Aucune pénalité pédagogique quand un problème technique empêche l'enregistrement.

## 15. Mesure d'efficacité

### 15.1 Indicateurs pédagogiques

| Indicateur | Calcul possible | Interprétation |
|---|---|---|
| Seconde tentative | reprises / corrections proposées | Le feedback entraîne-t-il une action ? |
| Réussite de reprise | reprises réussies / reprises | La correction est-elle comprise ? |
| Erreurs récurrentes | retour du même identifiant à 7/30 jours | La règle est-elle consolidée ? |
| Rappel sans aide | réponses correctes sans indice | Mesure plus forte que la reconnaissance |
| Transfert | mot revu retrouvé en production | Passage de connaissance passive à active |
| Écoute autonome | quiz réussi avant transcription | Compréhension réelle sans support écrit |
| Dépendance aux aides | traductions par texte comparable | Autonomie croissante |
| Achèvement de session | sessions terminées / commencées | Charge réaliste et parcours clair |

### 15.2 Indicateurs produit secondaires

- retour à 7 et 30 jours ;
- durée médiane d'une session ;
- abandon par étape ;
- choix fréquent de « changer de programme » ;
- coût IA par session terminée ;
- taux d'erreur des appels IA ;
- disponibilité de la reconnaissance vocale par plateforme.

Une hausse du temps passé n'est pas automatiquement positive. Une session courte, terminée et suivie d'un rappel réussi peut être meilleure qu'une longue session confuse.

## 16. Plan d'exécution réaliste

### Phase 0 — fiabilisation et mesure

Durée indicative : 3 à 5 jours.

- Définir les événements et indicateurs.
- Ajouter `eventId` et `sessionId` sans casser l'historique.
- Vérifier les migrations de progression.
- Créer le jeu de test de correction.
- Documenter les comportements actuels comme référence.

### Phase 1 — boucle de correction

Durée indicative : 1 à 2 semaines.

- Composant partagé de seconde tentative.
- Intégration à l'écriture.
- Intégration au bilan de dialogue.
- Nouvelle tentative de prononciation non punitive.
- Enrichissement minimal des cartes d'erreurs.
- Tests unitaires de déduplication et de planification SRS.

### Phase 2 — session quotidienne

Durée indicative : 1 à 2 semaines.

- Préférences de durée et d'objectif.
- Générateur déterministe de session.
- Interface de session et reprise locale.
- Transitions entre lecture, production et bilan.
- Tests des règles avec différents profils.

### Phase 3 — continuité et grammaire adaptative

Durée indicative : 2 semaines.

- Activité liée au texte terminé.
- Réutilisation des mots révisés.
- Liens précis depuis une erreur vers une fiche grammaticale.
- Premiers micro-exercices contextualisés.

### Phase 4 — expérimentation contrôlée

Durée indicative : 2 à 4 semaines d'observation.

- Déployer progressivement.
- Comparer ancienne prochaine action et session composée.
- Mesurer seconde tentative, achèvement et rappel.
- Interroger quelques utilisateurs débutants et intermédiaires.
- Ajuster avant d'ajouter des récompenses supplémentaires.

## 17. Priorité, impact et effort

| Fonction | Impact pédagogique | Effort | Risque | Décision |
|---|---:|---:|---:|---|
| Seconde tentative | Très élevé | Moyen | Faible | Immédiat |
| Session quotidienne composée | Très élevé | Moyen | Moyen | Immédiat après la reprise |
| Cartes contextualisées | Élevé | Faible à moyen | Faible | À intégrer avec la reprise |
| Activités liées au texte | Élevé | Moyen | Faible | Phase suivante |
| Grammaire issue des erreurs | Élevé | Moyen | Moyen | Après taxonomie stable |
| Trois niveaux SRS | Moyen | Faible | Faible | Rapide, après mesure initiale |
| Badges de maîtrise | Moyen | Faible | Moyen | Seulement après validation des critères |
| XP général | Faible | Moyen | Élevé | Non recommandé |
| Classement social | Faible ou négatif | Élevé | Élevé | À écarter |
| Analyse fine de prosodie | Potentiellement élevée | Très élevé | Très élevé | Hors périmètre actuel |

## 18. Risques et réponses

### Surcharge cognitive

Réponse : trois étapes maximum par session, deux corrections prioritaires et une seule action principale par écran.

### Feedback IA incorrect

Réponse : tests humains, possibilité de signaler une correction, langage prudent et distinction faute/amélioration.

### Motivation dépendante de la série

Réponse : jour de repos, objectifs flexibles et valorisation de la maîtrise plutôt que de la présence.

### Coût IA incontrôlé

Réponse : corrections groupées, quotas existants, cache lorsque pertinent, mesure du coût par session et aucune double analyse inutile.

### Progression artificielle

Réponse : afficher la taille de l'échantillon, séparer activité et maîtrise, ne pas annoncer un niveau global trop tôt.

### Document Firestore trop volumineux

Réponse : plafonds, agrégats périodiques et migration future des événements vers une sous-collection.

### Abandon sur mobile

Réponse : brouillon automatique, boutons accessibles avec clavier ouvert, consignes courtes et reprise de session.

## 19. Définition de réussite de la première version

La première optimisation est réussie si :

- une correction mène clairement à une seconde tentative ;
- au moins une erreur prioritaire peut être reformulée et validée ;
- la carte créée conserve assez de contexte pour être comprise plus tard ;
- l'accueil peut proposer une session de 5, 10 ou 20 minutes ;
- une session contient au maximum trois étapes cohérentes ;
- une interruption peut être reprise ;
- le profil distingue toujours activité et maîtrise ;
- les anciennes progressions restent compatibles ;
- les fonctions hors ligne existantes ne régressent pas ;
- le coût IA et les erreurs serveur sont mesurables ;
- les tests techniques et l'évaluation humaine de la correction sont satisfaisants.

## 20. Décision finale

Leggendo n'a pas besoin, à court terme, d'un nouveau grand module. Il doit devenir un système qui relie intelligemment ses modules actuels.

L'ordre recommandé est :

1. faire réutiliser immédiatement les corrections ;
2. composer une session quotidienne adaptée au temps et à l'objectif ;
3. mémoriser les erreurs dans leur contexte ;
4. relier chaque contenu à une production courte ;
5. transformer les erreurs réelles en grammaire active ;
6. mesurer la consolidation avant d'ajouter davantage de gamification.

La promesse produit peut rester simple :

> **Lire, comprendre, utiliser, corriger et retenir l'italien — à son rythme, avec une prochaine étape claire.**
