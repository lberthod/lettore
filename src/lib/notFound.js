// Destination « page introuvable » qui conserve l'adresse demandée.
//
// `{ name: 'not-found' }` seul résout vers « / » (le paramètre pathMatch de
// la route attrape-tout est vide) : la barre d'adresse affichait alors la
// racine, et GA4 enregistrait « Page introuvable » sur page_path « / », sans
// moyen de retrouver le lien cassé. Schéma documenté par vue-router.
export function notFoundLocation(route) {
  return {
    name: 'not-found',
    params: { pathMatch: route.path.substring(1).split('/') },
    query: route.query,
    hash: route.hash,
  }
}
