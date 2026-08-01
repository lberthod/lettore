// Jeu de test pour l'évaluation humaine de la correction IA (WriteView /
// lib/correction.js), voir IntegartioNOptimsaitonPedago.MD §13.3. Ces textes
// ne sont pas exécutés automatiquement : deux personnes compétentes en
// italien les font passer manuellement dans la correction et jugent
// exactitude, utilité, ton, respect du sens et fausses corrections.
//
// `category` :
// - 'sans_erreur'            texte déjà correct, la correction ne doit rien changer
// - 'correct_non_idiomatique' texte grammaticalement correct mais peu naturel
// - 'erreur_francophone'      erreur typique d'un locuteur français (interférence)
// - 'ambigu'                  phrase dont le sens ou la faute est discutable
// - 'regionalisme'            forme régionale acceptable, pas une faute
export const correctionEvalSet = [
  {
    id: 'a1-01',
    level: 'A1-A2',
    category: 'sans_erreur',
    text: 'Mi chiamo Luca e abito a Torino con la mia famiglia.',
    notes: 'Ne doit déclencher aucune correction.',
  },
  {
    id: 'a1-02',
    level: 'A1-A2',
    category: 'erreur_francophone',
    text: 'Io sono trentaquattro anni e sono professore.',
    notes: "Calque du français « j'ai 34 ans » : avere, pas essere, pour l'âge.",
  },
  {
    id: 'a1-03',
    level: 'A1-A2',
    category: 'erreur_francophone',
    text: 'Vado a la scuola ogni giorno con mio fratello.',
    notes: "Préposition articulée fautive : « a la » doit devenir « alla ».",
  },
  {
    id: 'a1-04',
    level: 'A1-A2',
    category: 'correct_non_idiomatique',
    text: 'Il mio cane è molto contento quando io gioco con lui nel giardino.',
    notes: 'Correct mais pronom sujet « io » superflu, peu naturel en italien courant.',
  },
  {
    id: 'a1-05',
    level: 'A1-A2',
    category: 'erreur_francophone',
    text: 'Ho seize anni e studio all\'università.',
    notes: 'Mot français laissé tel quel (« seize » au lieu de « sedici ») : erreur de vocabulaire, pas de grammaire.',
  },
  {
    id: 'a1-06',
    level: 'A1-A2',
    category: 'ambigu',
    text: 'Sono andata al mercato con Marco e ho comprato delle mele per lei.',
    notes: '« per lei » : réfère-t-il à une tierce personne ou est-ce une maladresse pour « per me » ? Le correcteur ne doit pas trancher sans contexte.',
  },
  {
    id: 'a1-07',
    level: 'A1-A2',
    category: 'erreur_francophone',
    text: 'Domani vado a fare les courses al supermercato.',
    notes: 'Mélange français/italien (« les courses ») : vocabulaire à corriger, sens clair.',
  },
  {
    id: 'b1-01',
    level: 'B1-B2',
    category: 'sans_erreur',
    text: "Da quando lavoro in questa azienda ho imparato a gestire meglio il mio tempo e a collaborare con colleghi di culture diverse.",
    notes: 'Texte correct et déjà assez idiomatique : ne doit générer aucune fausse correction.',
  },
  {
    id: 'b1-02',
    level: 'B1-B2',
    category: 'erreur_francophone',
    text: 'Penso che è una buona idea andare in vacanza a settembre.',
    notes: 'Après « penso che », le subjonctif est attendu (« sia »), erreur fréquente chez les francophones qui gardent l\'indicatif.',
  },
  {
    id: 'b1-03',
    level: 'B1-B2',
    category: 'correct_non_idiomatique',
    text: 'Io penso che il problema principale è che le persone non hanno abbastanza tempo per fare sport.',
    notes: 'Correct mais lourd : « io penso che » en tête et répétition de « che » ; une reformulation plus fluide existe sans que ce soit une faute.',
  },
  {
    id: 'b1-04',
    level: 'B1-B2',
    category: 'erreur_francophone',
    text: 'Sono in Italia da tre anni e mi piace molto vivere qui.',
    notes: 'Texte correct : sert de contrôle négatif au milieu d\'exemples fautifs du même registre.',
  },
  {
    id: 'b1-05',
    level: 'B1-B2',
    category: 'erreur_francophone',
    text: 'Devo assolutamente realizzare i miei progetti prima della fine dell\'anno.',
    notes: 'Faux ami « realizzare » calqué sur « réaliser » : en italien courant on préfère « portare a termine » ou « concretizzare » selon le contexte.',
  },
  {
    id: 'b1-06',
    level: 'B1-B2',
    category: 'ambigu',
    text: 'Le ho detto che l\'avrei chiamata appena arrivata.',
    notes: '« appena arrivata » : qui arrive, l\'auteur ou la destinataire ? Ambiguïté à signaler plutôt qu\'à corriger arbitrairement.',
  },
  {
    id: 'b1-07',
    level: 'B1-B2',
    category: 'regionalisme',
    text: 'Vieni a mangiare da noi, ti aspettiamo per pranzo verso mezzogiorno e mezza.',
    notes: '« mezzogiorno e mezza » est un usage régional très répandu et accepté, pas une faute à signaler comme erreur grammaticale.',
  },
  {
    id: 'b1-08',
    level: 'B1-B2',
    category: 'erreur_francophone',
    text: 'Ho bisogno de parlare con te di una cosa importante.',
    notes: '« de parlare » calqué sur le français « de parler » : en italien c\'est « bisogno di ».',
  },
  {
    id: 'c1-01',
    level: 'C1-C2',
    category: 'sans_erreur',
    text: "Nonostante le difficoltà iniziali, l'azienda è riuscita a consolidare la propria posizione sul mercato grazie a una strategia di investimento mirata e a un dialogo costante con i dipendenti.",
    notes: 'Texte correct et idiomatique, niveau soutenu : contrôle négatif pour un niveau avancé.',
  },
  {
    id: 'c1-02',
    level: 'C1-C2',
    category: 'correct_non_idiomatique',
    text: 'Nel momento in cui io ho ricevuto la notizia, io ho deciso immediatamente di partire.',
    notes: 'Correct mais la double répétition de « io » alourdit le style attendu à ce niveau ; suggestion stylistique, pas une faute.',
  },
  {
    id: 'c1-03',
    level: 'C1-C2',
    category: 'erreur_francophone',
    text: 'Attualmente, il governo sta considerando di implementare nuove misure per sostenere l\'economia.',
    notes: '« implementare » calqué sur « implémenter/mettre en œuvre » : en italien on attend plutôt « attuare » ou « adottare » dans ce registre.',
  },
  {
    id: 'c1-04',
    level: 'C1-C2',
    category: 'ambigu',
    text: 'Il direttore ha detto al suo assistente che avrebbe dovuto rivedere la sua presentazione.',
    notes: '« la sua presentazione » : celle du directeur ou de l\'assistant ? Ambiguïté de référence à signaler, pas une erreur certaine.',
  },
  {
    id: 'c1-05',
    level: 'C1-C2',
    category: 'erreur_francophone',
    text: 'È importante che noi arriviamo a un accordo prima che la situazione degeneri ulteriormente.',
    notes: 'Grammaticalement correct ; sert de vérification que le correcteur n\'invente pas une faute de subjonctif là où il n\'y en a pas.',
  },
]

export default correctionEvalSet
