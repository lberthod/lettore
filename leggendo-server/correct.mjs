// Correction pédagogique d'une production écrite (Phase 5) : l'élève soumet
// un texte en italien, le modèle renvoie le texte corrigé, la liste des
// erreurs typées et expliquées en français, et un niveau CECR estimé.
// Module pur (pattern generate.mjs) : la logique quota/HTTP reste dans
// server.mjs et jobs.mjs, ceci n'est que prompt + appel LLM + validation.

import { callLLM } from './llm.mjs'
import { CORRECTION_SCHEMA, validateCorrectionStructure } from './schema.mjs'

const SYSTEM = `Tu es le correcteur pédagogique de Leggendo, une application d'apprentissage de l'italien destinée à des francophones. Un élève t'envoie une production écrite en italien ; tu la corriges avec bienveillance.

Principes ABSOLUS :
- "corrected" : le texte de l'élève corrigé, en italien. Préserve au maximum son style, son vocabulaire et la structure de ses phrases — corrige les erreurs, ne réécris pas le texte à ta manière. Si une phrase est correcte, reproduis-la telle quelle.
- "errors" : une entrée par erreur réelle. "original" = le passage fautif tel qu'écrit par l'élève, "correction" = le même passage corrigé, "explanation" = 1 à 2 phrases en FRANÇAIS SIMPLE qui expliquent la règle ou le piège (pense aux difficultés typiques des francophones : faux-amis, prépositions, accords, auxiliaires, subjonctif). Ton encourageant, jamais moqueur.
- "type" de chaque erreur : "grammatica" (conjugaison, accords, prépositions, syntaxe), "lessico" (mot inexact, faux-ami, calque du français), "registro" (tu/Lei, formel/informel, ton inadapté), "ortografia" (orthographe, accents, doubles consonnes, majuscules).
- Ne signale pas de fausses erreurs : un texte correct peut avoir un tableau "errors" vide.
- "level_estimate" : le niveau CECR (A1 à C2) que reflète cette production écrite, d'après la richesse et la justesse de la langue.
- Si le texte n'est manifestement pas de l'italien (français, anglais…), corrige-le vers l'italien : "corrected" = la version italienne, avec une erreur de type "lessico" expliquant qu'il faut écrire en italien.`

// Complément de SYSTEM ajouté uniquement quand une consigne/objectif
// communicatif accompagne le texte (modes guidé/contenu de WriteView.vue) —
// Sprint 1.1 (phasetravail.md) : juger l'atteinte du but AVANT la liste
// d'erreurs linguistiques, séparément de la qualité de la langue. Un texte
// truffé de fautes mineures peut avoir "atteint" son but ; un texte
// impeccable mais hors-sujet doit afficher "a_completer".
const COMMUNICATIVE_ADDENDUM = `

Une consigne/objectif communicatif accompagne cette production. AVANT de relever les erreurs linguistiques, juge si l'élève a atteint le but de la consigne (indépendamment des fautes de grammaire/orthographe) et remplis le champ "communicative" :
- "status": "atteint" si le but de la consigne est rempli, même avec des fautes mineures ; "partiel" si le but n'est que partiellement rempli ; "a_completer" si le texte est hors-sujet ou manque le but, même sans faute de langue.
- "note": une seule phrase en français simple, encourageante, qui explique ce statut par rapport à la consigne (pas une remarque de grammaire).
Ne remplis PAS ce champ si aucune consigne n'est fournie.`

// Corrige la production `text` (déjà validée par parseCorrectionRequest :
// non vide, ≤ 2000 caractères). `goal` (optionnel) est la consigne/objectif
// communicatif déjà connue côté client pour les modes guidé/contenu — null
// en mode libre, où il n'y a pas de but à juger. `usage` est muté en place,
// un élément par appel LLM réussi — même mécanique de mesure des coûts que
// generateUserText.
export async function correctUserText({ text, goal = null, usage = [] }) {
  const maxTokens = Math.min(16000, Math.max(8000, text.length * 6))
  // Repérer et expliquer des fautes dans un texte court ne bénéficie pas du
  // mode réflexion de DeepSeek (actif par défaut) : testé sur un texte A2
  // à 8 erreurs, mêmes erreurs détectées avec ou sans, mais 3057 tokens de
  // réflexion invisibles en moins (out: 3717 → 718, -81 %) — même constat
  // que dialogueFeedback (dialogue.mjs).
  const system = goal ? `${SYSTEM}${COMMUNICATIVE_ADDENDUM}` : SYSTEM
  const prompt = goal
    ? `Consigne/objectif communicatif donné à l'élève :\n${goal}\n\nVoici la production écrite de l'élève à corriger :\n\n${text}`
    : `Voici la production écrite de l'élève à corriger :\n\n${text}`
  const out = await callLLM({
    system,
    schema: CORRECTION_SCHEMA,
    maxTokens,
    thinking: 'disabled',
    onUsage: (u) => usage.push(u),
    prompt,
  })

  const structuralErrors = validateCorrectionStructure(out)
  if (structuralErrors.length) {
    throw new Error(`Erreurs structurelles : ${structuralErrors.join(' ; ')}`)
  }
  return out
}
