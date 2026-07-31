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
function turnSystem(scenario, level) {
  return `Tu es un partenaire de jeu de rôle pour Leggendo, une application d'apprentissage de l'italien destinée à des francophones. Tu joues ${scenario.role}.

Règles ABSOLUES :
- Tu restes STRICTEMENT dans ton rôle de personnage, quoi que dise l'élève. Tu n'es ni un professeur ni un assistant : tu ne corriges pas, tu ne traduis pas, tu ne donnes pas d'explications de grammaire, tu ne sors jamais de la scène. Si l'élève écrit en français ou hors sujet, ton personnage réagit avec naturel (il ne comprend pas bien, il ramène poliment la conversation à la scène).
- "reply" : ta réplique, en italien UNIQUEMENT, courte (2 à 3 phrases maximum). Adapte rigoureusement ta langue au niveau CECR ${level} : vocabulaire fréquent et phrases simples pour A1/A2, langue plus riche et naturelle pour B1 et au-delà.
- Fais avancer la conversation : termine ta réplique par une question ou une relance chaque fois que la scène le permet.
- "suggested_replies" : 2 à 3 réponses possibles TRÈS courtes (quelques mots, en italien, niveau ${level}) que l'élève pourrait te faire — des béquilles pour ne pas rester bloqué, variées et naturelles. Jamais vide tant que la scène continue.
- "done" : true seulement quand la scène est naturellement terminée (commande servie et payée, consultation finie, billet acheté, au revoir échangés…). Sinon false. Quand done est true, "reply" est ta réplique de clôture et "suggested_replies" peut être vide.`
}

// Historique rendu en transcript lisible pour le prompt (callLLM ne prend
// qu'un couple system/prompt, pas une liste de messages).
function transcript(turns) {
  return turns
    .map((t) => `${t.role === 'user' ? 'ÉLÈVE' : 'TOI'} : ${t.text}`)
    .join('\n')
}

// Les réponses d'un tour sont courtes, mais les modèles raisonneurs
// consomment aussi des tokens de réflexion sur ce budget (même constat que
// correct.mjs) — plancher confortable, callLLM remonte seul en cas de
// troncature.
const TURN_MAX_TOKENS = 6000

async function runTurn({ scenario, level, prompt, usage }) {
  const out = await callLLM({
    system: turnSystem(scenario, level),
    schema: DIALOGUE_TURN_SCHEMA,
    maxTokens: TURN_MAX_TOKENS,
    onUsage: (u) => usage.push(u),
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

// Tour suivant : historique complet + nouvelle réplique de l'élève.
export function dialogueTurn({ scenario, level, turns, userText, usage = [] }) {
  return runTurn({
    scenario,
    level,
    usage,
    prompt: `Voici la conversation jusqu'ici :\n\n${transcript(turns)}\nÉLÈVE : ${userText}\n\nRéponds à l'élève en restant dans ton rôle.`,
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
    onUsage: (u) => usage.push(u),
    prompt: `Scénario joué : « ${scenario.title} » (niveau demandé ${level}).\n\nConversation complète (pour le contexte) :\n\n${transcript(turns)}\n\nRépliques de l'élève à évaluer :\n${userLines}`,
  })
  const structuralErrors = validateDialogueFeedbackStructure(out)
  if (structuralErrors.length) {
    throw new Error(`Erreurs structurelles : ${structuralErrors.join(' ; ')}`)
  }
  return out
}
