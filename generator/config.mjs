// Configuration de l'orchestrateur de génération.
//
// La matrice cible : 1 texte par (catégorie × niveau × taille).
// Tout est surchargeable par variables d'environnement pour le VPS.

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// --- API LLM (GLM / Zhipu AI, ou tout endpoint compatible OpenAI) ---
export const GLM_API_KEY = process.env.GLM_API_KEY || ''
export const GLM_MODEL = process.env.GLM_MODEL || 'glm-5.2'
// Endpoint chat completions (compatible OpenAI). Par défaut : Zhipu AI (Chine).
// Pour Z.ai (hébergement international) : https://api.z.ai/api/paas/v4/chat/completions
export const GLM_BASE_URL =
  process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

export const MODEL = GLM_MODEL

// Où écrire les textes. En local : le dossier statique de l'app.
// Sur le VPS, pointer ailleurs via TEXTS_DIR (ou utiliser --sink firestore plus tard).
export const TEXTS_DIR =
  process.env.TEXTS_DIR || path.resolve(HERE, '../src/texts')

// Fichier d'état de l'orchestrateur (journal des combos générés / en échec).
export const STATE_FILE =
  process.env.GENERATOR_STATE || path.join(HERE, 'state.json')

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1']

// Tailles de texte, en mots cibles. `min`/`max` servent aussi à classer les
// textes existants (qui n'ont pas de champ "size") d'après leur wordCount.
export const SIZES = [
  { id: 'corto', label: 'court', words: 150, min: 0, max: 249 },
  { id: 'medio', label: 'moyen', words: 350, min: 250, max: 449 },
  { id: 'lungo', label: 'long', words: 650, min: 450, max: 849 },
  { id: 'molto_lungo', label: 'très long', words: 1000, min: 850, max: Infinity },
]

// Catégories (mêmes ids que src/texts/categories.json), avec un indice
// thématique pour guider le choix de sujet.
export const CATEGORIES = [
  { id: 'vita_quotidiana', name: 'Vie quotidienne', hint: 'scènes de la vie de tous les jours en Italie : marché, bar, poste, voisinage, routines' },
  { id: 'cucina', name: 'Cuisine et saveurs', hint: 'plats, produits, traditions culinaires régionales italiennes' },
  { id: 'natura_animali', name: 'Nature et animaux', hint: 'animaux, paysages, parcs naturels, saisons en Italie' },
  { id: 'viaggi', name: 'Voyages', hint: 'villes et régions italiennes, itinéraires, trains, découvertes' },
  { id: 'montagna', name: 'Montagne et Alpes', hint: 'Alpes, Dolomites, refuges, ski, randonnée, vie en altitude' },
  { id: 'regioni', name: 'Régions alpines', hint: "Val d'Aoste, Tessin, Grisons italophones, vallées frontalières" },
  { id: 'sport', name: 'Sport et défis', hint: 'football, cyclisme, courses, défis personnels' },
  { id: 'feste', name: 'Fêtes et traditions', hint: 'fêtes populaires, carnavals, sagre, traditions locales' },
  { id: 'storia_antica', name: 'Histoire ancienne et Renaissance', hint: 'Rome antique, Moyen Âge italien, Renaissance' },
  { id: 'storia_moderna', name: 'Histoire moderne', hint: "Risorgimento, XXe siècle, République italienne, émigration" },
  { id: 'societa', name: 'Société', hint: "société italienne d'aujourd'hui : travail, école, technologie, débats" },
  { id: 'arte_lingua', name: 'Arts et langue', hint: 'opéra, cinéma, littérature, histoire de la langue italienne' },
]

export function sizeForWordCount(wordCount) {
  return SIZES.find((s) => wordCount >= s.min && wordCount <= s.max)?.id
}
