# Soutenabilité économique des agents conversationnels pédagogiques : une étude de cas sur le coût par token dans un dispositif d'apprentissage des langues assisté par IA générative

### Working Paper — Technologie éducative / Digital Learning

**Loïc Berthod**
*Expert en pédagogie numérique (digital pedagogy), consultant indépendant*
lberthod@gmail.com · info@loicberthod.ch

1ᵉʳ août 2026

---

## Déclaration d'intérêts

L'auteur est le concepteur et éditeur indépendant du dispositif étudié
(application Leggendo). Le terrain d'étude est donc également son propre
produit, ce qui constitue un conflit d'intérêts potentiel à déclarer
explicitement : l'auteur a un intérêt direct à présenter le dispositif de
façon favorable. Pour en limiter l'effet sur la validité des résultats,
cette étude ne porte pas sur l'évaluation de la qualité pédagogique du
dispositif (non mesurée ici), mais sur des indicateurs techniques
objectifs — volumes de tokens facturés, directement lus dans les réponses
de l'API du fournisseur, reproductibles indépendamment de l'auteur. Aucun
financement externe n'a été sollicité pour ce travail.

---

## Résumé structuré

**Contexte.** Les agents conversationnels fondés sur des grands modèles de
langage (LLM) sont de plus en plus intégrés aux dispositifs
d'apprentissage des langues assisté par ordinateur (*Computer-Assisted
Language Learning*, CALL), en particulier pour la pratique de
l'interaction simulée. À la différence d'un interlocuteur humain, un agent
conversationnel a un coût marginal mesurable par tour de parole, facturé
par le fournisseur du modèle au volume de texte échangé (le *token*).

**Objectif.** Documenter, sur un dispositif réel en production,
l'existence et l'ampleur d'un gaspillage évitable de ce coût marginal, et
déterminer par quel mécanisme il peut être réduit sans dégrader la
production observable du système.

**Méthode.** Étude de cas expérimentale sur le module de dialogue simulé
de l'application Leggendo (apprentissage de l'italien pour un public
francophone, modèle DeepSeek `deepseek-v4-flash`). Protocole de
comparaison directe (A/B) contre l'infrastructure de production réelle
pour chaque hypothèse d'optimisation testée, avec mesure des indicateurs
objectifs renvoyés par l'API (tokens d'entrée, de sortie, tokens servis
depuis le cache, tokens attribuables au raisonnement interne du modèle).

**Résultats.** L'hypothèse initiale — un gain provenant de la mise en
cache du contexte conversationnel — n'est confirmée qu'à la marge (taux de
cache quasi inchangé, 88,5 % → 87,2 %). Le facteur de coût dominant,
identifié a posteriori, est un mécanisme de raisonnement interne
(*chain-of-thought*) activé par défaut par le fournisseur, représentant
jusqu'à 74,7 % à 85 % des tokens de sortie facturés sans production de
contenu visible par l'apprenant. Sa désactivation ciblée, combinée à des
ajustements mineurs, réduit le coût mesuré d'environ 70 % par session sans
dégradation qualitative observée.

**Conclusion.** Le poste de coût déterminant d'un agent conversationnel
pédagogique n'est pas nécessairement celui que suggère l'architecture
apparente du système. Une évaluation de la soutenabilité économique,
fondée sur la mesure empirique plutôt que sur l'intuition, devrait faire
partie intégrante de la conception de tout dispositif de dialogue simulé
destiné à un déploiement à grande échelle.

**Abstract (EN).** LLM-based conversational agents are increasingly used
in Computer-Assisted Language Learning (CALL) for simulated dialogic
practice. Unlike a human interlocutor, such agents carry a measurable
marginal cost per turn, billed by the model provider per token. This case
study documents, on a production language-learning dialogue feature
(Leggendo, Italian for French speakers, DeepSeek `deepseek-v4-flash`), an
empirically-driven cost optimization achieving an approximate 70 %
reduction per session. Contrary to the initial hypothesis (context
caching), the dominant cost factor was found to be the model's default
internal reasoning process, accounting for up to 85 % of billed output
tokens without producing learner-visible value. The study argues that
economic sustainability assessment should be a standard component of
designing generative-AI-based learning tools intended for scale.

**Mots-clés :** technologie éducative, digital learning, apprentissage des
langues assisté par ordinateur (CALL), agents conversationnels, IA
générative, soutenabilité économique, passage à l'échelle (*scalability*)

**Keywords:** educational technology, digital learning, computer-assisted
language learning (CALL), conversational agents, generative AI, economic
sustainability, scalability

---

## 1. Introduction et problématique

### 1.1 La pratique dialoguée comme levier pédagogique

La didactique des langues secondes accorde une place centrale à
l'interaction : produire du langage en situation, recevoir une réponse
contingente, ajuster sa formulation — un cycle que la recherche en
acquisition des langues associe à un apprentissage plus robuste que
l'exposition passive seule (Long, 1996 ; Swain, 1985). Reproduire ce cycle
en dehors de la salle de classe s'est longtemps heurté à une contrainte
simple : il faut un interlocuteur disponible. Les agents conversationnels
fondés sur des LLM lèvent en grande partie cette contrainte, en simulant un
interlocuteur toujours disponible, adaptable au niveau de l'apprenant, et
capable de tenir un rôle contextualisé (un barista, un médecin, un
guichetier) — une évolution que la littérature récente en CALL commence à
documenter (Godwin-Jones, 2022, sur l'intégration des IA génératives dans
l'enseignement des langues).

### 1.2 Une contrainte nouvelle : le coût marginal du dialogue simulé

Ce que la littérature pédagogique aborde peu, en revanche, est la
**contrainte économique** propre à ce type de dispositif. Un dialogue avec
un tuteur humain n'a pas de coût marginal facturé au tour de parole ; un
dialogue avec un agent LLM en a un, car chaque échange déclenche un appel à
une API tierce facturée au volume de texte traité. Un dispositif
pédagogique qui fonctionne en laboratoire ou en pilote restreint peut ainsi
devenir non soutenable économiquement lorsqu'il est déployé à l'échelle
d'un établissement ou d'une plateforme grand public — une préoccupation
typique du champ du *digital learning*, où la littérature identifie
régulièrement le passage à l'échelle (*scalability*), plus que la
pertinence pédagogique elle-même, comme le facteur limitant la pérennité
des dispositifs numériques innovants.

C'est cette question — *le coût d'un agent conversationnel pédagogique
est-il compressible sans perte de qualité perçue par l'apprenant, et dans
quelle mesure ?* — que cette étude de cas examine sur un dispositif réel en
production.

### 1.3 Terrain d'étude

Le dispositif étudié est le module de dialogue simulé de Leggendo,
application d'apprentissage de l'italien pour un public francophone. Cinq
scénarios de la vie quotidienne (café, cabinet médical, gare, marché,
hôtel) permettent à l'apprenant de jouer une scène face à un personnage
tenu par un modèle de langage (DeepSeek, modèle `deepseek-v4-flash`),
calibré sur le niveau CECR déclaré (A1 à B1 selon le scénario). Une session
comporte une ouverture de scène, jusqu'à douze tours de dialogue, et un
bilan pédagogique final relevant les erreurs de l'apprenant — soit jusqu'à
quatorze appels au modèle par session, pour un forfait de crédits fixe côté
utilisateur, indépendant du nombre de tours effectivement joués.

---

## 2. Hypothèse de recherche

L'hypothèse formulée en amont de l'expérimentation portait sur la **mise en
cache du contexte conversationnel**, mécanisme par lequel un fournisseur
d'API peut facturer à un tarif réduit les segments de texte déjà rencontrés
récemment dans une requête antérieure :

> *L'implémentation initiale reconstruit l'historique de la conversation en
> un seul bloc de texte à chaque tour, avec un formatage qui varie
> légèrement d'un appel à l'autre. Cette instabilité du texte empêche le
> mécanisme de cache de reconnaître un préfixe déjà traité. Structurer
> l'historique en messages distincts et stables devrait rétablir la
> correspondance de préfixe et réduire fortement le coût facturé.*

Cette hypothèse était cohérente avec le fonctionnement documenté des
architectures de cache par préfixe et constituait, a priori, le levier
d'optimisation le plus prometteur.

---

## 3. Méthodologie

Conformément à une démarche expérimentale plutôt que déductive, chaque
hypothèse a été testée par comparaison directe (protocole A/B) contre
l'infrastructure de production réelle, et non simplement déduite de la
documentation du fournisseur :

1. formulation d'une hypothèse précise et réfutable ;
2. implémentation isolée de la modification testée ;
3. exécution d'une conversation identique (même scénario, même niveau,
   mêmes répliques d'apprenant) sous les deux conditions (avant / après) ;
4. relevé des indicateurs objectifs renvoyés par l'API (tokens d'entrée, de
   sortie, tokens servis depuis le cache, tokens attribuables au
   raisonnement interne du modèle) ;
5. décision fondée sur la mesure, non sur la plausibilité théorique de
   l'hypothèse.

Cette démarche empirique a permis, comme développé ci-dessous, d'identifier
un résultat contraire à l'hypothèse initiale — ce qui n'aurait pas été
détecté par une analyse purement théorique de l'architecture du système.

**Validité et reproductibilité.** Les mesures rapportées proviennent
directement du champ `usage` des réponses de l'API du fournisseur (tokens
d'entrée, de sortie, tokens en cache, tokens de raisonnement), et non d'une
estimation dérivée. Le protocole (même scénario, même niveau, mêmes
répliques d'apprenant, conditions expérimentales alternées) est documenté
intégralement dans le code source du dispositif étudié, ce qui en permet la
réplication.

---

## 4. Résultats

### 4.1 Réfutation partielle de l'hypothèse initiale

La comparaison A/B sur une conversation de trois tours donne :

| Condition | Tokens d'entrée | Tokens servis depuis le cache | Taux de cache |
|---|---:|---:|---:|
| Avant (historique en texte aplati) | 2602 | 2304 | 88,5 % |
| Après (historique structuré) | 2349 | 2048 | 87,2 % |

Le taux de réutilisation du cache reste, dans les faits, quasiment
identique entre les deux conditions : l'hypothèse initiale — un gain
substantiel attendu du seul fait de structurer l'historique — n'est pas
confirmée. Le mécanisme de cache du fournisseur s'est révélé plus tolérant
au bruit de formatage que ne le laissait supposer sa documentation
générale.

Cette étape expérimentale n'a cependant pas été sans valeur : elle a permis
d'identifier un **défaut fonctionnel** non lié au coût — un format de
réponse structurée (JSON) qui échouait silencieusement dès lors que
l'historique de conversation contenait des tours antérieurs ne respectant
pas exactement le schéma attendu par le modèle. Ce défaut, corrigé au
passage, aurait pu se traduire en production par des dialogues interrompus
sans cause apparente pour l'apprenant.

### 4.2 Le facteur de coût réel : le raisonnement interne du modèle

L'examen détaillé des tokens de sortie a révélé que la majorité du coût ne
provenait pas de la réponse visible par l'apprenant, mais d'un mécanisme de
*raisonnement en chaîne* (« *chain-of-thought* ») que le modèle exécute par
défaut avant de produire sa réponse finale — un processus interne, non
affiché à l'utilisateur, mais intégralement facturé :

| Condition | Tokens de sortie (3 tours) | Dont raisonnement invisible |
|---|---:|---:|
| Réglage par défaut | 953 | 712 (74,7 %) |
| Raisonnement désactivé | 163 | 0 |

Un test complémentaire sur le module de bilan pédagogique (repérage
d'erreurs grammaticales dans les productions de l'apprenant) a par ailleurs
montré qu'un réglage intermédiaire (effort de raisonnement réduit plutôt
que supprimé) ne produisait pas de réduction proportionnée du coût, ni de
gain de qualité :

| Réglage | Tokens de sortie | Dont raisonnement | Corrections identifiées |
|---|---:|---:|---:|
| Effort réduit | 896 | 764 (85 %) | 1 |
| Raisonnement désactivé | 147 | 0 | 2 |

Pour ce type de tâche — production contrainte et courte, relevant davantage
de la performance langagière que du raisonnement multi-étapes — la
suppression complète du mécanisme de raisonnement s'est révélée à la fois
moins coûteuse et qualitativement au moins équivalente, sinon supérieure.

### 4.3 Gains complémentaires

Un allègement du texte d'instruction système (mêmes consignes pédagogiques,
formulation resserrée d'environ 35 %) a réduit de 24 % le coût du premier
appel de chaque session — le seul moment où ce texte n'est pas déjà
disponible en cache pour les sessions ultérieures du même scénario.

---

## 5. Discussion : implications pour la conception de dispositifs numériques d'apprentissage

Trois enseignements dépassent le cas technique étudié et intéressent plus
largement la conception de dispositifs de *digital learning* fondés sur
l'IA générative :

**(1) Le coût pédagogique invisible n'est pas toujours là où on l'attend.**
Le poste de dépense dominant (le raisonnement interne du modèle) n'était ni
documenté de façon proéminente, ni intuitif au moment de la conception
initiale du dispositif. Un concepteur pédagogique ou un décideur
institutionnel évaluant le coût d'un agent conversationnel sur la seule
base de la longueur du texte échangé sous-estimerait ce facteur de façon
significative — un facteur qui, ici, représentait à lui seul les trois
quarts du coût de sortie.

**(2) Les fonctions conversationnelles courtes n'exigent pas les mêmes
réglages qu'une tâche de raisonnement.** La distinction, dans la
conception d'un agent pédagogique, entre les interactions relevant de la
*performance langagière contrainte* (jouer un rôle, produire une réplique
courte et calibrée sur un niveau) et celles relevant du *raisonnement*
(résoudre un problème, expliquer une règle complexe) a une traduction
technique directe et un impact économique mesurable. Un même modèle,
utilisé avec les mêmes réglages sur ces deux types de tâches, ne produit
pas un usage économiquement efficient sur les deux à la fois.

**(3) La soutenabilité économique conditionne le passage à l'échelle
pédagogique.** Un dispositif validé pédagogiquement sur un petit groupe
d'apprenants ne garantit pas sa viabilité budgétaire lorsqu'il est déployé
à l'échelle d'un établissement ou d'une plateforme grand public. La section
suivante quantifie cette question sur un scénario de déploiement à 1000
apprenants.

---

## 6. Portée à l'échelle : scénario à 1000 apprenants

### 6.1 Coût par session

En prenant pour base une session type de six tours d'apprenant (valeur
médiane, le maximum autorisé par le dispositif étant de douze), et une
grille tarifaire indicative du fournisseur (non vérifiée sur facturation
réelle, valeurs d'ordre de grandeur usuelles pour ce type de service : ~
0,10 $ / million de tokens d'entrée, ~ 1,10 $ / million de tokens de
sortie) :

```
coût avant optimisation  ≈ 0,0041 $ par session
coût après optimisation  ≈ 0,0012 $ par session
rabais                   ≈ 71 %
```

### 6.2 Scénario institutionnel : 1000 apprenants, 5 sessions/mois chacun

Hypothèse de charge compatible avec le forfait mensuel proposé aux
utilisateurs premium (30 crédits/mois, 2 crédits par session, soit un
plafond théorique de 15 sessions/mois — 5 sessions retenues ici comme
estimation d'usage réel, plus prudente que le plafond) :

| | Coût mensuel estimé | Coût annuel estimé |
|---|---:|---:|
| **Sans optimisation** | ≈ 20,55 $ | ≈ 246,60 $ |
| **Avec optimisation** | ≈ 5,95 $ | ≈ 71,40 $ |
| **Économie** | ≈ 14,60 $ / mois | **≈ 175,20 $ / an** |

### 6.3 Effet de l'échelle

Le rabais relatif (≈ 71 %) est indépendant de la taille de la cohorte ; seul
le montant absolu croît avec elle :

| Effectif d'apprenants actifs | Sessions/mois estimées | Coût mensuel sans optimisation | Coût mensuel avec optimisation | Économie/mois |
|---:|---:|---:|---:|---:|
| 1 000 | 5 000 | 20,55 $ | 5,95 $ | 14,60 $ |
| 10 000 | 50 000 | 205,50 $ | 59,50 $ | 146,00 $ |
| 50 000 | 250 000 | 1 027,50 $ | 297,50 $ | 730,00 $ |

À l'échelle d'un pilote restreint (1000 apprenants), l'enjeu économique
reste modeste en valeur absolue. Il devient un poste réel du budget
d'infrastructure pédagogique numérique dès lors que le dispositif
s'inscrit dans une logique de passage à l'échelle propre au *digital
learning* institutionnel — déploiement multi-établissements, intégration à
une plateforme nationale ou usage renforcé au-delà du forfait initial
(jusqu'à trois fois plus de sessions par apprenant que l'hypothèse
retenue ici).

---

## 7. Limites de l'étude

- **Conflit d'intérêts** (voir Déclaration d'intérêts, p. 1) : le terrain
  étudié est le propre produit de l'auteur, ce qui justifie le choix
  méthodologique de ne rapporter que des indicateurs techniques objectifs,
  et non une évaluation de la qualité pédagogique perçue.
- Les tarifs utilisés pour les projections monétaires sont **indicatifs**,
  non confirmés par une facturation réelle du fournisseur pour le modèle
  concerné ; seules les mesures en volume de tokens (avant/après) sont
  directement vérifiées et fiables.
- L'échantillon expérimental reste limité : un scénario, un niveau CECR,
  une conversation de trois tours testée en comparaison directe. La
  généralisation à une session de six tours (§6.1) repose sur une
  interpolation, non sur une mesure directe de bout en bout.
- La stabilité du mécanisme de cache du fournisseur dans le temps n'est pas
  documentée avec précision et pourrait varier selon la fréquence réelle de
  sollicitation d'un même scénario par des apprenants différents.
- Cette étude documente un effet de coût, non un effet d'apprentissage : la
  suppression du raisonnement interne du modèle n'a été évaluée que sur des
  critères de forme (contenu produit, cohérence du personnage), pas au
  moyen d'une mesure contrôlée des acquis linguistiques des apprenants — une
  limite qu'une recherche ultérieure en didactique pourrait combler par une
  évaluation comparative des apprentissages selon la configuration du
  modèle.

---

## 8. Conclusion et perspectives

Cette étude de cas illustre un phénomène qui dépasse le seul dispositif
examiné : dans la conception d'un agent conversationnel pédagogique, le
poste de coût le plus significatif n'est pas nécessairement celui que
l'intuition ou la documentation du fournisseur mettent en avant. Seule une
démarche de test empirique systématique, mesurant chaque hypothèse contre
le système réel plutôt que de s'appuyer sur son architecture supposée, a
permis d'identifier le levier réellement efficace — la désactivation d'un
mécanisme de raisonnement sans valeur pédagogique ajoutée sur ce type de
tâche — plutôt que le levier initialement pressenti.

Pour la recherche et la pratique en technologie éducative, cette étude
suggère qu'une évaluation de la **soutenabilité économique** devrait faire
partie intégrante de la conception de tout dispositif d'apprentissage
fondé sur l'IA générative destiné à un déploiement à grande échelle, au
même titre que son évaluation pédagogique. Des travaux ultérieurs
pourraient utilement croiser cette dimension économique avec une mesure
des acquis d'apprentissage, afin de déterminer si des réglages de modèle
optimisés pour le coût préservent, dégradent, ou améliorent l'efficacité
pédagogique perçue et mesurée des dispositifs de dialogue simulé.

---

## Références

Godwin-Jones, R. (2022). Partnering with AI: Intelligent writing
assistance and instructed language learning. *Language Learning &
Technology*.

Long, M. H. (1996). The role of the linguistic environment in second
language acquisition. In W. Ritchie & T. Bhatia (Eds.), *Handbook of
Second Language Acquisition*. Academic Press.

Swain, M. (1985). Communicative competence: Some roles of comprehensible
input and comprehensible output in its development. In S. Gass & C. Madden
(Eds.), *Input in Second Language Acquisition*. Newbury House.

---

## Note biographique

Loïc Berthod est consultant indépendant en pédagogie numérique (*digital
pedagogy*), concepteur d'outils d'apprentissage des langues assistés par
IA. Contact : lberthod@gmail.com · info@loicberthod.ch
