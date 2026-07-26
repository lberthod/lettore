// Reporte un travail non urgent (chargement d'un SDK, synchronisation) après
// le premier rendu. Tous ces chargements passent par des `import()` : sans
// cette temporisation ils partent dès l'exécution du bundle d'entrée et se
// disputent la bande passante avec le HTML/CSS et le rendu, ce qui coûte cher
// sur mobile pour un travail dont le résultat n'est visible que plus tard.
//
// `timeout` garantit l'exécution même si le navigateur ne devient jamais
// inactif ; le repli `setTimeout` couvre Safari < 17, qui n'a pas
// requestIdleCallback.
export function onIdle(fn, timeout = 1500) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout })
  } else {
    setTimeout(fn, 200)
  }
}
