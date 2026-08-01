// Boîte de texte pédagogique — modes « guidé » et « lié à un contenu »
// (IntegartioNOptimsaitonPedago.MD §7). Module pur (données statiques + petites
// fonctions), sans dépendance réseau ni DOM : la vue (WriteView.vue) se charge
// de l'affichage et de l'enregistrement (mode/promptId/helpUsed, voir §7.4).

// Regroupement CECR en trois paliers, pour adapter les mots utiles proposés
// (§7.2) sans construire une taxonomie complète par niveau.
export function levelTier(level) {
  if (!level) return 'A'
  const l = String(level).toUpperCase()
  if (l.startsWith('C')) return 'C'
  if (l.startsWith('B')) return 'B'
  return 'A'
}

// Mots/structures utiles adaptés au niveau : { A, B, C } → 5 entrées chacun.
// Repli sur le palier A si le palier demandé manque.
export function wordsForLevel(words, level) {
  const tier = levelTier(level)
  return words?.[tier] || words?.A || []
}

// --- Mode guidé (§7.1) : situation + destinataire + objectif communicatif +
// 3 idées facultatives + 5 mots/structures utiles adaptés au niveau. ---
export const GUIDED_PROMPTS = [
  {
    id: 'hotel',
    situation: 'Vous écrivez à un hôtel pour modifier une réservation.',
    recipient: "La réception de l'hôtel",
    goal: 'Précisez la nouvelle date, le nombre de personnes et posez une question sur le petit-déjeuner.',
    reformulation:
      "En clair : dites qui vous êtes, la date que vous voulez à la place, et demandez si le petit-déjeuner est inclus.",
    ideas: [
      'Indiquez votre nom et le numéro de réservation.',
      'Précisez la nouvelle date et le nombre de personnes.',
      'Demandez si le petit-déjeuner est inclus.',
    ],
    words: {
      A: ['la prenotazione', 'la camera', 'la colazione', 'cambiare', 'per favore'],
      B: ['modificare la prenotazione', 'a partire dal', 'è compresa', 'vorrei sapere se', 'in attesa di una risposta'],
      C: ['fare riferimento alla prenotazione', 'si terrebbe conto di', 'gradirei conferma', 'nel caso in cui', 'restando a disposizione'],
    },
    starters: ['Gentile receptionist,', 'Vorrei modificare...', 'Inoltre, vorrei sapere se...'],
    example:
      'Gentile receptionist, vorrei modificare la mia prenotazione per il 12 agosto, per due persone invece di una. Potrebbe dirmi se la colazione è compresa? Grazie mille.',
  },
  {
    id: 'ristorante',
    situation: 'Vous écrivez à un restaurant pour réserver une table.',
    recipient: 'Le restaurant',
    goal: 'Précisez le jour, le nombre de personnes et signalez une allergie alimentaire.',
    reformulation: 'En clair : demandez une table, dites pour quand et combien de personnes, et signalez votre allergie.',
    ideas: [
      'Demandez une table pour un jour et une heure précis.',
      "Précisez le nombre de personnes.",
      'Signalez une allergie ou une préférence alimentaire.',
    ],
    words: {
      A: ['il tavolo', 'stasera', 'siamo in', 'l’allergia', 'vorrei'],
      B: ['prenotare un tavolo', 'per stasera alle', 'siamo in quattro', 'sono allergico a', 'senza glutine'],
      C: ['vorrei prenotare un tavolo per', 'in occasione di', 'gradirei segnalare', 'un’intolleranza a', 'resto in attesa di conferma'],
    },
    starters: ['Buongiorno,', 'Vorrei prenotare...', 'Vi segnalo che...'],
    example:
      'Buongiorno, vorrei prenotare un tavolo per stasera alle otto, per quattro persone. Vi segnalo che uno di noi è allergico alle noci. Grazie.',
  },
  {
    id: 'amico',
    situation: 'Vous écrivez un court message à un ami italien pour organiser un week-end.',
    recipient: 'Un ami',
    goal: 'Proposez une activité, une date et demandez son avis.',
    reformulation: 'En clair : proposez quelque chose à faire, dites quand, et demandez ce qu’il en pense.',
    ideas: [
      'Proposez une activité (visite, randonnée, cinéma…).',
      'Proposez une date ou un moment.',
      "Demandez l'avis de votre ami.",
    ],
    words: {
      A: ['il weekend', 'andiamo a', 'che ne pensi?', 'insieme', 'ti va?'],
      B: ['che ne diresti di', 'potremmo andare a', 'fammi sapere', 'ci vediamo', 'mi piacerebbe'],
      C: ['che ne diresti di organizzare', 'sarebbe bello se', 'fammi sapere cosa ne pensi', 'nel caso avessi altri impegni', 'ci sentiamo per organizzarci'],
    },
    starters: ['Ciao!', 'Che ne diresti di...', 'Fammi sapere se...'],
    example:
      'Ciao! Che ne diresti di andare al mare sabato prossimo? Potremmo partire la mattina presto. Fammi sapere cosa ne pensi!',
  },
  {
    id: 'lavoro',
    situation: "Vous écrivez un court message pour vous excuser d'un retard au travail.",
    recipient: 'Votre responsable',
    goal: "Expliquez brièvement la raison et indiquez l'heure d'arrivée prévue.",
    reformulation: "En clair : dites que vous serez en retard, pourquoi (en une phrase), et à quelle heure vous arrivez.",
    ideas: [
      'Prévenez que vous serez en retard.',
      'Donnez une raison brève.',
      "Indiquez l'heure d'arrivée prévue.",
    ],
    words: {
      A: ['in ritardo', 'mi dispiace', 'arrivo alle', 'il problema', 'grazie'],
      B: ['sarò in ritardo', 'a causa di', 'dovrei arrivare entro', 'mi scuso per', 'vi avviso che'],
      C: ['vi avviso che subirò un ritardo', 'a causa di un imprevisto', 'confido di recuperare', 'me ne scuso anticipatamente', 'resto disponibile per aggiornamenti'],
    },
    starters: ['Buongiorno,', 'Vi scrivo per avvisarvi che...', 'Arriverò entro...'],
    example:
      "Buongiorno, vi scrivo per avvisarvi che sarò in ritardo a causa di un problema con i mezzi pubblici. Dovrei arrivare entro le nove e mezza. Mi scuso per il disagio.",
  },
]

// Prompt guidé aléatoire, différent du précédent quand c'est possible (même
// logique que suggestTopic dans WriteView : éviter deux fois le même choix
// consécutif plutôt qu'un vrai historique).
export function pickGuidedPrompt(excludeId) {
  const pool = GUIDED_PROMPTS.filter((p) => p.id !== excludeId)
  const list = pool.length ? pool : GUIDED_PROMPTS
  return list[Math.floor(Math.random() * list.length)]
}

export function guidedPromptById(id) {
  return GUIDED_PROMPTS.find((p) => p.id === id) || null
}

// --- Mode lié à un contenu (§7.1) : depuis un texte terminé. ---
export const CONTENT_ACTIONS = [
  {
    id: 'riassumere',
    label: 'Résumer',
    instruction: 'Résumez ce texte en deux ou trois phrases.',
    reformulation: 'En clair : dites en 2-3 phrases ce qui se passe dans le texte, sans détail inutile.',
    ideas: [
      "Commencez par qui/quoi/où.",
      "Gardez seulement l'essentiel de l'histoire.",
      "Terminez par comment ça se termine.",
    ],
    words: {
      A: ['il testo parla di', 'all’inizio', 'poi', 'alla fine', 'in breve'],
      B: ['il testo racconta', 'in sintesi', 'successivamente', 'per concludere', 'in poche parole'],
      C: ['il testo verte su', 'in estrema sintesi', 'nel corso della narrazione', 'in conclusione', 'a grandi linee'],
    },
    starters: ['Il testo racconta...', 'All’inizio...', 'Alla fine...'],
    example: 'Il testo racconta di una ragazza che si trasferisce in una nuova città. All’inizio ha paura, ma alla fine trova nuovi amici.',
  },
  {
    id: 'opinione',
    label: 'Donner son avis',
    instruction: 'Donnez votre avis sur ce texte.',
    reformulation: 'En clair : dites ce que vous en pensez, et pourquoi (une raison suffit).',
    ideas: [
      "Dites si vous avez aimé ou non.",
      'Donnez une raison concrète.',
      'Comparez avec quelque chose que vous connaissez, si possible.',
    ],
    words: {
      A: ['secondo me', 'mi piace', 'non mi piace', 'perché', 'penso che'],
      B: ['a mio parere', 'ho trovato che', 'trovo interessante', 'non sono d’accordo con', 'quello che mi ha colpito è'],
      C: ['a mio avviso', 'ciò che mi ha colpito di più è', 'per certi versi', 'a differenza di', 'in definitiva'],
    },
    starters: ['Secondo me,...', 'Ho trovato che...', 'Quello che mi ha colpito è...'],
    example: 'Secondo me il testo è molto interessante. Ho trovato che il personaggio principale è simpatico, anche se alcune scelte non mi convincono.',
  },
  {
    id: 'seguito',
    label: 'Imaginer la suite',
    instruction: "Imaginez ce qui se passe juste après la fin du texte.",
    reformulation: "En clair : inventez la suite de l'histoire, en 2-3 phrases.",
    ideas: [
      'Que fait le personnage principal ensuite ?',
      "Y a-t-il un événement inattendu ?",
      'Comment cela pourrait-il se terminer ?',
    ],
    words: {
      A: ['il giorno dopo', 'poi', 'improvvisamente', 'alla fine', 'finalmente'],
      B: ['il giorno seguente', 'a un tratto', 'inaspettatamente', 'poco dopo', 'alla fine della giornata'],
      C: ['nei giorni successivi', 'in modo del tutto inatteso', 'con grande sorpresa', 'a distanza di poco tempo', 'per concludere la vicenda'],
    },
    starters: ['Il giorno dopo,...', 'Improvvisamente,...', 'Alla fine,...'],
    example: 'Il giorno dopo, il ragazzo torna al villaggio. Improvvisamente incontra una persona che non si aspettava di rivedere.',
  },
  {
    id: 'puntodivista',
    label: "Point de vue d'un autre personnage",
    instruction: "Racontez l'histoire du point de vue d'un autre personnage du texte.",
    reformulation: 'En clair : racontez la même histoire, mais comme si c’était un autre personnage qui parlait.',
    ideas: [
      'Choisissez un personnage secondaire du texte.',
      "Que voit-il/elle que le narrateur ne dit pas ?",
      "Que ressent ce personnage ?",
    ],
    words: {
      A: ['io', 'ho visto', 'ho pensato', 'quel giorno', 'anche se'],
      B: ['dal mio punto di vista', 'quel giorno', 'nessuno sapeva che', 'in realtà', 'per me'],
      C: ['dal mio punto di vista', 'ciò che gli altri non sapevano', 'in fondo', 'senza che nessuno se ne accorgesse', 'a ripensarci'],
    },
    starters: ['Io, invece,...', 'Quel giorno,...', 'Nessuno sapeva che...'],
    example: 'Io, invece, ho visto tutto da lontano. Quel giorno nessuno sapeva che ero già arrivato.',
  },
  {
    id: 'riuso',
    label: 'Réutiliser des mots',
    instruction: 'Réutilisez ces mots dans un court texte, en rapport avec ce que vous venez de lire.',
    reformulation: 'En clair : écrivez quelques phrases qui utilisent chacun des mots proposés.',
    ideas: [
      'Utilisez chaque mot dans une phrase différente.',
      'Restez proche du sujet du texte lu.',
      "Une phrase par mot suffit, pas besoin d'un long texte.",
    ],
    words: {
      A: ['allora', 'per esempio', 'anche', 'perché', 'infatti'],
      B: ['infatti', 'per esempio', 'in particolare', 'perciò', 'del resto'],
      C: ['difatti', 'a tale proposito', 'in particolar modo', 'di conseguenza', 'per altro verso'],
    },
    starters: [],
  },
]

export function contentActionById(id) {
  return CONTENT_ACTIONS.find((a) => a.id === id) || CONTENT_ACTIONS[0]
}

// Sélectionne jusqu'à `count` mots au hasard dans le lexique d'un texte
// (objet { mot: traduction }, voir texts/*.json et VocabularyView.vue).
export function pickWordsFrom(wordsDict, count = 3) {
  const keys = Object.keys(wordsDict || {})
  const shuffled = [...keys].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}
