// Contenu des notifications push liées à la génération de texte.
// Le titre du texte généré n'y figure volontairement PAS : une notification
// s'affiche sur l'écran verrouillé, y compris d'un appareil partagé. Le tap
// ouvre /mes-textes (src/lib/push.js, routage par type uniquement, pas de
// lien nominatif) où le compte connecté voit ses textes ; `jobId` est un
// identifiant opaque sans contenu.
export function generationDoneNotification(jobId) {
  return {
    title: 'Leggendo',
    body: 'Votre texte est prêt.',
    data: { type: 'generation_done', jobId },
  }
}
