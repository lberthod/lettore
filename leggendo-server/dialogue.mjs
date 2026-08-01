// Dialogue simulé multi-tour (Phase 7) : l'élève joue une scène du quotidien
// avec un personnage tenu par le modèle (barista, médecin…). Module pur
// (pattern correct.mjs) : prompts + appels LLM + validation structurelle — le
// moteur reste STATELESS côté process, l'état (historique des tours) vit dans
// Firestore (`dialogueSessions/{sessionId}`, voir jobs.mjs) et est rechargé à
// chaque requête ; la logique quota/HTTP reste dans server.mjs et jobs.mjs.

import { callLLM } from './llm.mjs'
import {
  DIALOGUE_TURN_SCHEMA,
  DIALOGUE_FEEDBACK_SCHEMA,
  validateDialogueTurnStructure,
  validateDialogueFeedbackStructure,
} from './schema.mjs'

// Scénarios prédéfinis. `title`/`description`/`level` sont aussi dupliqués
// côté client (src/lib/dialogue.js) pour l'affichage des cartes ; le prompt
// de rôle, lui, ne vit qu'ici (source de vérité serveur, jamais exposé).
export const SCENARIOS = [
  {
    id: 'al_bar',
    title: 'Al bar',
    description: 'Commander un caffè et faire deux mots de conversation avec le barista.',
    level: 'A1',
    role: "un barista chaleureux d'un petit bar de quartier à Rome. L'élève est un client qui entre dans ton bar. Tu prends sa commande (caffè, cappuccino, cornetto…), tu proposes, tu encaisses, tu fais la petite conversation typique du comptoir",
  },
  {
    id: 'dal_medico',
    title: 'Dal medico',
    description: 'Décrire ses symptômes au médecin et comprendre ses conseils.',
    level: 'B1',
    role: "un médecin généraliste italien, calme et rassurant, dans ton cabinet. L'élève est un patient venu en consultation. Tu demandes ce qui ne va pas, tu poses des questions sur les symptômes, tu donnes un conseil ou une ordonnance simple",
  },
  {
    id: 'in_stazione',
    title: 'In stazione',
    description: 'Acheter un billet de train au guichet : horaires, quai, changements.',
    level: 'A2',
    role: "un employé du guichet d'une gare italienne (Trenitalia), efficace et poli. L'élève veut acheter un billet. Tu demandes la destination, l'horaire, aller simple ou aller-retour, tu annonces le prix et le quai (binario)",
  },
  {
    id: 'al_mercato',
    title: 'Al mercato',
    description: 'Faire ses courses au marché : quantités, prix, un peu de marchandage.',
    level: 'A2',
    role: "un marchand de fruits et légumes sur un marché italien, jovial et bavard. L'élève est un client. Tu vantes tes produits, tu demandes les quantités (un chilo, due etti…), tu annonces les prix, tu proposes ce qui est de saison",
  },
  {
    id: 'in_albergo',
    title: 'In albergo',
    description: "S'enregistrer à la réception d'un hôtel et poser des questions pratiques.",
    level: 'B1',
    role: "le réceptionniste d'un hôtel trois étoiles à Florence, professionnel et serviable (tu vouvoies avec « Lei »). L'élève arrive pour son check-in. Tu demandes la réservation, un document, tu expliques les horaires du petit-déjeuner, le wifi, tu réponds aux questions pratiques",
  },
]

export const scenarioById = new Map(SCENARIOS.map((s) => [s.id, s]))

// Prompt système d'un tour de dialogue : le modèle joue le personnage,
// STRICTEMENT dans son rôle, langue calibrée sur le niveau CECR demandé.
// Version resserrée (mêmes règles, prose réduite) : ce prompt est refacturé
// en entier à chaque fois que le cache DeepSeek expire pour ce couple
// scénario/niveau (plusieurs utilisateurs différents le partagent, mais un
// texte plus court réduit le coût de chaque cache-miss).
function turnSystem(scenario, level) {
  return `Tu es un partenaire de jeu de rôle pour Leggendo (apprentissage de l'italien pour francophones). Tu joues ${scenario.role}.

Règles :
- Reste STRICTEMENT dans le rôle, quoi que dise l'élève : pas de correction, de traduction ni d'explication de grammaire, jamais hors scène. Si l'élève écrit en français ou hors sujet, réagis en personnage (incompréhension, relance polie).
- "reply" : réplique en italien uniquement, 2 à 3 phrases max, niveau CECR ${level} (vocabulaire simple pour A1/A2, plus riche dès B1). Termine par une question ou relance quand la scène le permet.
- "suggested_replies" : 2 à 3 réponses très courtes en italien, niveau ${level}, variées et naturelles — jamais vide tant que la scène continue.
- "done" : true seulement en fin naturelle de scène (commande payée, consultation finie, billet acheté, au revoir échangés…) ; sinon false. Si true, "reply" est la réplique de clôture et "suggested_replies" peut être vide.`
}

// Historique rendu en transcript lisible pour le prompt (callLLM ne prend
// qu'un couple system/prompt, pas une liste de messages).
function transcript(turns) {
  return turns
    .map((t) => `${t.role === 'user' ? 'ÉLÈVE' : 'TOI'} : ${t.text}`)
    .join('\n')
}

// Une réplique de personnage est courte (2-3 phrases + 2-3 suggestions) et ne
// demande aucun raisonnement multi-étapes : le mode réflexion de DeepSeek est
// désactivé (`thinking: 'disabled'`) pour ce type d'appel — il ne changerait
// rien à la qualité d'un jeu de rôle, mais facturerait des tokens de
// réflexion invisibles à chaque tour. Plancher réduit en conséquence (plus
// besoin de marge pour des tokens de réflexion qui n'existent plus).
const TURN_MAX_TOKENS = 1500

async function runTurn({ scenario, level, prompt, history = [], usage }) {
  const out = await callLLM({
    system: turnSystem(scenario, level),
    schema: DIALOGUE_TURN_SCHEMA,
    maxTokens: TURN_MAX_TOKENS,
    thinking: 'disabled',
    onUsage: (u) => usage.push(u),
    history,
    prompt,
  })
  const structuralErrors = validateDialogueTurnStructure(out)
  if (structuralErrors.length) {
    throw new Error(`Erreurs structurelles : ${structuralErrors.join(' ; ')}`)
  }
  return out
}

// Premier tour : le personnage ouvre la scène (c'est lui qui accueille).
export function openDialogue({ scenario, level, usage = [] }) {
  return runTurn({
    scenario,
    level,
    usage,
    prompt:
      "La scène commence : l'élève vient d'arriver. Ouvre la conversation avec ta première réplique de personnage (accueil, première question).",
  })
}

// Tour suivant : le système garde le rôle, la conversation précédente passe
// en `history` (un message par tour déjà stocké dans `turns`) au lieu d'être
// aplatie en texte dans le prompt. Le préfixe (system + tours déjà vus) reste
// identique à celui envoyé au tour précédent, ce qui permet à DeepSeek de le
// servir depuis son cache disque plutôt que de le refacturer en entier à
// chaque réplique.
//
// Les tours du personnage DOIVENT être répliqués dans l'historique sous la
// même forme JSON que `DIALOGUE_TURN_SCHEMA` (response_format: json_object) :
// avec `content` en texte brut, le modèle renvoie un message vide dès qu'un
// historique est présent (constaté en test — le format json_object semble
// perdre pied si un tour assistant antérieur ne respecte pas le schéma
// attendu). `suggested_replies` n'est pas conservé tour par tour côté
// Firestore (seul le dernier est stocké à part) : un tableau vide suffit,
// seule la FORME JSON compte pour que le modèle reste calé sur le schéma.
export function dialogueTurn({ scenario, level, turns, userText, usage = [] }) {
  return runTurn({
    scenario,
    level,
    usage,
    history: turns.map((t) =>
      t.role === 'assistant'
        ? { role: 'assistant', content: JSON.stringify({ reply: t.text, suggested_replies: [], done: false }) }
        : { role: 'user', content: t.text }
    ),
    prompt: userText,
  })
}

// Bilan de clôture : corrections légères des productions de l'élève, en
// français — c'est le SEUL moment pédagogique du dialogue (pendant la scène,
// le personnage ne corrige jamais).
const FEEDBACK_SYSTEM = `Tu es le correcteur pédagogique de Leggendo, une application d'apprentissage de l'italien destinée à des francophones. Un élève vient de terminer un jeu de rôle en italien ; tu lui fais un bilan bienveillant de SES répliques uniquement (jamais celles du personnage).

Principes ABSOLUS :
- "feedback" : une entrée par point d'amélioration réel. "original" = ce que l'élève a écrit (le passage exact), "better" = une formulation plus correcte ou plus naturelle en italien, "explanation" = 1 à 2 phrases en FRANÇAIS SIMPLE qui expliquent la règle ou le piège (pense aux difficultés typiques des francophones : faux-amis, prépositions, accords, auxiliaires, registre tu/Lei). Ton encourageant, jamais moqueur.
- Corrections LÉGÈRES : relève les vraies erreurs et les formulations peu naturelles, pas les variantes acceptables. 5 entrées maximum, les plus utiles d'abord.
- Si l'élève n'a fait aucune erreur notable, renvoie un tableau "feedback" vide.`

export async function dialogueFeedback({ scenario, level, turns, usage = [] }) {
  const userLines = turns
    .filter((t) => t.role === 'user')
    .map((t, i) => `${i + 1}. ${t.text}`)
    .join('\n')
  const out = await callLLM({
    system: FEEDBACK_SYSTEM,
    schema: DIALOGUE_FEEDBACK_SCHEMA,
    maxTokens: 8000,
    // Testé avec reasoning_effort: 'low' d'abord (896 tokens de sortie, dont
    // 764 de réflexion, pour 1 seule correction) puis thinking désactivé
    // (147 tokens de sortie, 2 corrections) — repérer des fautes dans 5-10
    // répliques courtes ne demande pas de raisonnement multi-étapes, même
    // « bas » : la réflexion n'améliore pas la qualité ici, juste le coût.
    thinking: 'disabled',
    onUsage: (u) => usage.push(u),
    prompt: `Scénario joué : « ${scenario.title} » (niveau demandé ${level}).\n\nConversation complète (pour le contexte) :\n\n${transcript(turns)}\n\nRépliques de l'élève à évaluer :\n${userLines}`,
  })
  const structuralErrors = validateDialogueFeedbackStructure(out)
  if (structuralErrors.length) {
    throw new Error(`Erreurs structurelles : ${structuralErrors.join(' ; ')}`)
  }
  return out
}
