// Charge la taxonomie à deux dimensions (genre × thème) depuis
// src/texts/category.json — voir ANALYSE_CATEGORIES.md à la racine du repo.

import fs from 'node:fs'
import path from 'node:path'
import { TEXTS_DIR } from '../config.mjs'

export const CATEGORY_FILE =
  process.env.CATEGORY_FILE || path.join(TEXTS_DIR, 'category.json')

export function loadCategoryData() {
  if (!fs.existsSync(CATEGORY_FILE)) {
    throw new Error(`Fichier de taxonomie introuvable : ${CATEGORY_FILE}`)
  }
  const data = JSON.parse(fs.readFileSync(CATEGORY_FILE, 'utf8'))
  const genreById = new Map(data.genres.map((g) => [g.id, g]))
  const themeById = new Map(data.themes.map((t) => [t.id, t]))
  for (const entry of data.curatedMatrix) {
    if (!genreById.has(entry.genre)) {
      throw new Error(`curatedMatrix : genre inconnu "${entry.genre}"`)
    }
    if (!themeById.has(entry.theme)) {
      throw new Error(`curatedMatrix : thème inconnu "${entry.theme}"`)
    }
  }
  return { ...data, genreById, themeById }
}

// Construit la liste plate des cellules (genre × thème × niveau × taille)
// couvertes par la matrice curée, filtrée par niveaux/tailles/genre/thème/priorité.
export function expandMatrix(data, { levels, sizes, genre, theme, maxPriority }) {
  const sizeById = new Map(data.sizes.map((s) => [s.id, s]))
  const cells = []
  for (const entry of data.curatedMatrix) {
    if (genre && entry.genre !== genre) continue
    if (theme && entry.theme !== theme) continue
    if (maxPriority && entry.priority > maxPriority) continue
    const cellLevels = entry.levels.filter((l) => levels.includes(l))
    for (const level of cellLevels) {
      for (const sizeId of sizes) {
        const size = sizeById.get(sizeId)
        if (!size) continue
        cells.push({
          genre: data.genreById.get(entry.genre),
          theme: data.themeById.get(entry.theme),
          level,
          size,
          priority: entry.priority,
        })
      }
    }
  }
  return cells
}
