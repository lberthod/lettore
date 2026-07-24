// Validation de la demande de génération et utilitaires associés — isolés de
// server.mjs pour être testables sans monter un serveur HTTP.

import crypto from 'node:crypto'
import { LEVELS } from './schema.mjs'

export function buildTaxonomyIndex(taxonomy) {
  return {
    themeById: new Map(taxonomy.themes.map((t) => [t.id, t])),
    genreById: new Map(taxonomy.genres.map((g) => [g.id, g])),
    sizeById: new Map(taxonomy.sizes.map((s) => [s.id, s])),
  }
}

export function parseRequest(body, { themeById, genreById, sizeById }) {
  const errors = []
  const theme = themeById.get(body.theme)
  if (!theme) errors.push('thème inconnu')
  const genre = genreById.get(body.genre)
  if (!genre) errors.push('genre (sous-catégorie) inconnu')
  const size = sizeById.get(body.size)
  if (!size) errors.push('taille inconnue')
  const level = LEVELS.includes(body.level) ? body.level : null
  if (!level) errors.push('niveau CECR invalide')
  const title = String(body.title || '').trim()
  if (title.length < 3 || title.length > 120) errors.push('titre : 3 à 120 caractères')
  const summary = String(body.summary || '').trim()
  if (summary.length < 10 || summary.length > 1500)
    errors.push('résumé : 10 à 1500 caractères')
  if (genre && level && genre.levels && !genre.levels.includes(level))
    errors.push(`le genre « ${genre.name} » n'est pas proposé au niveau ${level}`)
  return { errors, theme, genre, size, level, title, summary }
}

export function slugify(title) {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return `${base || 'testo'}_${crypto.randomBytes(3).toString('hex')}`
}
