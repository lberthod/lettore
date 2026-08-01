// Banque de questions pour le test de niveau adaptatif (voir LevelTestView.vue).
// Chaque niveau CECR (A1 à C2) a sa propre liste de questions à choix
// multiples ; le test pioche une question au hasard dans le niveau courant à
// chaque tour, sans répéter une question déjà posée dans la même tentative.

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

export const QUESTIONS_BY_LEVEL = {
  A1: [
    {
      q: 'Comment dit-on « bonjour » (le matin) en italien ?',
      options: ['Buonasera', 'Buongiorno', 'Buonanotte', 'Arrivederci'],
      correct: 1,
    },
    {
      q: '« Io ___ italiano » (parler)',
      options: ['parlo', 'parli', 'parla', 'parlano'],
      correct: 0,
    },
    {
      q: 'Quel est le pluriel de « il libro » ?',
      options: ['i libro', 'i libri', 'le libri', 'i libris'],
      correct: 1,
    },
    {
      q: 'Comment dit-on « je m\'appelle Marco » ?',
      options: ['Mi chiamo Marco', 'Mi chiami Marco', 'Ti chiamo Marco', 'Sono chiamato Marco'],
      correct: 0,
    },
    {
      q: '« Quanti anni ___? » (avoir)',
      options: ['hai', 'sei', 'fai', 'vai'],
      correct: 0,
    },
    {
      q: 'Quel article précède « amico » (ami) ?',
      options: ['il amico', "l'amico", 'lo amico', 'la amico'],
      correct: 1,
    },
    {
      q: 'Comment traduit-on « merci beaucoup » ?',
      options: ['Per favore', 'Grazie mille', 'Prego', 'Scusa'],
      correct: 1,
    },
    {
      q: '« Dove ___ tu? » (habiter)',
      options: ['abiti', 'abito', 'abita', 'abitano'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « lundi » ?',
      options: ['martedì', 'lunedì', 'giovedì', 'venerdì'],
      correct: 1,
    },
    {
      q: 'Quel est le contraire de « grande » ?',
      options: ['piccolo', 'alto', 'bello', 'nuovo'],
      correct: 0,
    },
    {
      q: '« Noi ___ fame » (avoir faim)',
      options: ['abbiamo', 'avete', 'hanno', 'ho'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « une pomme » ?',
      options: ['un mela', 'una mela', 'uno mela', "un'mela"],
      correct: 1,
    },
    {
      q: '« Che ore sono? » signifie :',
      options: ['Quel jour est-ce ?', 'Quelle heure est-il ?', 'Où sommes-nous ?', 'Comment vas-tu ?'],
      correct: 1,
    },
    {
      q: 'Comment dit-on « je voudrais un café » ?',
      options: ['Vorrei un caffè', 'Voglio un caffè', 'Ho un caffè', 'Prendo un caffè'],
      correct: 0,
    },
    {
      q: '« Il gatto è ___ tavolo » (sur)',
      options: ['sul', 'nel', 'dal', 'al'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « ma famille » ?',
      options: ['la mia famiglia', 'mia famiglia', 'la famiglia mia', 'il mio famiglia'],
      correct: 0,
    },
    {
      q: '« Voi ___ studenti? » (être)',
      options: ['siete', 'sono', 'sei', 'è'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « il fait beau » ?',
      options: ['Fa bello', 'C\'è bello', 'Fa bel tempo', 'È bel tempo fuori'],
      correct: 2,
    },
    {
      q: 'Quel est le pluriel de « la casa » ?',
      options: ['le case', 'le casi', 'i case', 'le casa'],
      correct: 0,
    },
    {
      q: '« Vado ___ scuola » (à)',
      options: ['a', 'alla', 'in', 'da'],
      correct: 1,
    },
  ],
  A2: [
    {
      q: '« Ieri io ___ al cinema » (aller, passato prossimo)',
      options: ['ho andato', 'sono andato', 'ho andata', 'sono andata'],
      correct: 1,
    },
    {
      q: 'Comment dit-on « je me lève à 7 heures » ?',
      options: ['Mi alzo alle sette', 'Alzo alle sette', 'Mi alzi alle sette', 'Sono alzato alle sette'],
      correct: 0,
    },
    {
      q: '« Marco è più alto ___ Luca »',
      options: ['che', 'di', 'come', 'da'],
      correct: 1,
    },
    {
      q: 'Quel est le participe passé de « prendere » ?',
      options: ['prendato', 'preso', 'presuto', 'prendito'],
      correct: 1,
    },
    {
      q: '« Il libro ___ studente » (di + lo)',
      options: ['del', 'dello', 'dei', 'degli'],
      correct: 1,
    },
    {
      q: 'Comment dit-on « la semaine prochaine » ?',
      options: ['la settimana scorsa', 'la settimana prossima', 'la settimana passata', 'una settimana fa'],
      correct: 1,
    },
    {
      q: '« Mentre io leggevo, lui ___ » (dormir, imparfait)',
      options: ['dormiva', 'ha dormito', 'dorme', 'dormì'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « je ne mange jamais de viande » ?',
      options: ['Non mangio la carne mai', 'Non mangio mai la carne', 'Mai non mangio la carne', 'Non mai mangio la carne'],
      correct: 1,
    },
    {
      q: '« Domani io ___ a Roma » (partir, futur)',
      options: ['parto', 'partirò', 'partivo', 'sono partito'],
      correct: 1,
    },
    {
      q: 'Quel pronom complète « ___ piacciono i libri » (à moi) ?',
      options: ['Mi', 'Io', 'Me', 'Mio'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « il faut que je parte » (nécessité, sans subjonctif) ?',
      options: ['Devo partire', 'Posso partire', 'Voglio partire', 'So partire'],
      correct: 0,
    },
    {
      q: '« Quanto costa ___ maglietta? » (cette)',
      options: ['questo', 'questa', 'quello', 'quella'],
      correct: 1,
    },
    {
      q: 'Comment dit-on « je le vois tous les jours » ?',
      options: ['Lo vedo ogni giorno', 'Vedo lo ogni giorno', 'Gli vedo ogni giorno', 'Il vedo ogni giorno'],
      correct: 0,
    },
    {
      q: '« Ho comprato ___ mele » (quelques)',
      options: ['qualche', 'alcuni', 'alcune', 'poco'],
      correct: 2,
    },
    {
      q: 'Comment dit-on « je suis né en 1990 » ?',
      options: ['Sono nato nel 1990', 'Ho nato nel 1990', 'Sono nato in 1990', 'Nasco nel 1990'],
      correct: 0,
    },
    {
      q: '« Lei ___ già mangiato quando sono arrivato » (avoir, plus-que-parfait)',
      options: ['ha', 'aveva', 'ebbe', 'avrebbe'],
      correct: 1,
    },
    {
      q: 'Comment dit-on « moins cher que » ?',
      options: ['meno caro di', 'meno caro che', 'più caro di', 'tanto caro di'],
      correct: 0,
    },
    {
      q: '« Devo andare ___ farmacia » (à la)',
      options: ['alla', 'nella', 'della', 'dalla'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « depuis deux ans » (situation qui continue) ?',
      options: ['da due anni', 'per due anni', 'fa due anni', 'tra due anni'],
      correct: 0,
    },
    {
      q: '« Che tempo ___ ieri? » (faire, passato prossimo)',
      options: ['ha fatto', 'faceva', 'fa', 'farà'],
      correct: 0,
    },
  ],
  B1: [
    {
      q: '« Se avessi tempo, ___ al mare » (aller, conditionnel présent)',
      options: ['vado', 'andrei', 'andavo', 'sono andato'],
      correct: 1,
    },
    {
      q: 'Quelle phrase utilise correctement le subjonctif présent ?',
      options: ['Penso che lui ha ragione', 'Penso che lui abbia ragione', 'Penso che lui aveva ragione', 'Penso che lui avrà ragione'],
      correct: 1,
    },
    {
      q: '« La ragazza ___ ho incontrato ieri è simpatica » (que)',
      options: ['che', 'cui', 'quale', 'chi'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « bien qu\'il pleuve, je sors » ?',
      options: ['Anche se piove, esco', 'Benché piova, esco', 'Perché piove, esco', 'Siccome piove, esco'],
      correct: 1,
    },
    {
      q: '« Mi piacerebbe ___ un lavoro all\'estero » (trouver)',
      options: ['trovo', 'trovare', 'trovato', 'trovando'],
      correct: 1,
    },
    {
      q: 'Quelle est la forme correcte du gérondif de « fare » ?',
      options: ['facendo', 'fando', 'facente', 'faciendo'],
      correct: 0,
    },
    {
      q: '« Quando ero piccolo, ___ sempre al parco » (jouer, imparfait, habitude)',
      options: ['giocavo', 'ho giocato', 'giocai', 'gioco'],
      correct: 0,
    },
    {
      q: 'Comment traduit-on « celui qui étudie réussit » ?',
      options: ['Chi studia riesce', 'Quello studia riesce', 'Che studia riesce', 'Cui studia riesce'],
      correct: 0,
    },
    {
      q: '« Nonostante ___ stanco, ha finito il lavoro » (être, subjonctif)',
      options: ['è', 'sia', 'fosse', 'era'],
      correct: 1,
    },
    {
      q: 'Quelle phrase est au passif correctement construit ?',
      options: ['La lettera è scritta da Marco', 'La lettera ha scritto da Marco', 'La lettera scrive da Marco', 'La lettera viene scrivendo da Marco'],
      correct: 0,
    },
    {
      q: '« Appena ___ a casa, ti chiamo » (arriver, futur antérieur)',
      options: ['arrivo', 'sarò arrivato', 'arriverò', 'sono arrivato'],
      correct: 1,
    },
    {
      q: 'Comment dit-on « plus je travaille, plus j\'apprends » ?',
      options: ['Più lavoro, più imparo', 'Tanto lavoro, tanto imparo', 'Più lavoro, tanto imparo', 'Come lavoro, imparo'],
      correct: 0,
    },
    {
      q: '« Vorrei che tu ___ più attenzione » (faire, subjonctif imparfait)',
      options: ['facessi', 'faresti', 'fai', 'faccia'],
      correct: 0,
    },
    {
      q: 'Quel connecteur exprime la conséquence ?',
      options: ['sebbene', 'quindi', 'affinché', 'purché'],
      correct: 1,
    },
    {
      q: '« Mi dispiace ___ non essere venuto ieri » (de)',
      options: ['di', 'per', 'a', 'che'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « je doute qu\'il vienne » ?',
      options: ['Dubito che viene', 'Dubito che venga', 'Dubito che verrà', 'Dubito se viene'],
      correct: 1,
    },
    {
      q: '« Ci sono molte persone ___ non sono d\'accordo » (qui)',
      options: ['che', 'chi', 'cui', 'quale'],
      correct: 0,
    },
    {
      q: 'Quel est le sens de « magari »  dans « Magari fosse vero! » ?',
      options: ['peut-être', 'si seulement', 'malheureusement', 'évidemment'],
      correct: 1,
    },
    {
      q: '« Sto ___ un libro molto interessante » (lire, forme progressive)',
      options: ['leggendo', 'a leggere', 'leggere', 'letto'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « à condition que tu m\'aides » ?',
      options: ['a condizione che tu mi aiuti', 'a condizione che tu mi aiuta', 'a condizione tu mi aiuti', 'con la condizione tu mi aiuti'],
      correct: 0,
    },
  ],
  B2: [
    {
      q: '« Se avessi saputo, non ___ venuto » (venir, conditionnel passé)',
      options: ['sarei', 'ero', 'fossi', 'sono'],
      correct: 0,
    },
    {
      q: 'Quelle phrase exprime correctement une hypothèse irréelle du passé ?',
      options: ['Se studiavo di più, avrei passato l\'esame', 'Se avessi studiato di più, avrei passato l\'esame', 'Se studiassi di più, ho passato l\'esame', 'Se ho studiato di più, passerei l\'esame'],
      correct: 1,
    },
    {
      q: '« Non credo che lui ___ ancora arrivato » (être, subjonctif passé)',
      options: ['sia', 'fosse', 'è', 'era'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « quoi qu\'il arrive » ?',
      options: ['Qualunque cosa succeda', 'Qualunque cosa succede', 'Qualsiasi cosa succederà', 'Comunque cosa succeda'],
      correct: 0,
    },
    {
      q: '« Gliene ho parlato ieri » — que remplacent « glie » et « ne » ?',
      options: ['à lui/elle + de cela', 'à eux + le', 'à moi + de cela', 'à toi + le'],
      correct: 0,
    },
    {
      q: 'Quelle est la forme correcte du discours indirect pour « Ha detto: "Verrò domani" » ?',
      options: ['Ha detto che sarebbe venuto il giorno dopo', 'Ha detto che verrebbe domani', 'Ha detto che è venuto domani', 'Ha detto che verrà il giorno dopo'],
      correct: 0,
    },
    {
      q: '« Per quanto ___ difficile, ci proverò » (être, subjonctif)',
      options: ['sia', 'è', 'fosse', 'era'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « à peine était-il arrivé qu\'il repartit » ?',
      options: ['Appena era arrivato, ripartì', 'Appena fu arrivato, ripartì', 'Appena arrivava, ripartiva', 'Appena arriva, riparte'],
      correct: 1,
    },
    {
      q: '« Il fatto ___ non abbia risposto mi preoccupa » (que)',
      options: ['che', 'di cui', 'cui', 'il quale'],
      correct: 0,
    },
    {
      q: 'Quel est le sens de l\'expression « in bocca al lupo » ?',
      options: ['bon appétit', 'bonne chance', 'bon voyage', 'bon courage littéral'],
      correct: 1,
    },
    {
      q: '« Fu proprio lui ___ me lo disse » (qui)',
      options: ['che', 'chi', 'cui', 'quello'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « ce dont j\'ai besoin » ?',
      options: ['quello di cui ho bisogno', 'quello che ho bisogno', 'ciò che ho bisogno', 'quello cui ho bisogno'],
      correct: 0,
    },
    {
      q: '« Ammesso ___ abbia ragione, non deve trattarmi così » (que, subjonctif)',
      options: ['che', 'se', 'come', 'quando'],
      correct: 0,
    },
    {
      q: 'Quelle forme verbale complète « Temevo che non ___ in tempo » (arriver, subjonctif imparfait) ?',
      options: ['arrivassi', 'arrivavo', 'arriverei', 'sia arrivato'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « plus j\'y pense, moins je comprends » ?',
      options: ['Più ci penso, meno capisco', 'Più penso ci, meno capisco', 'Tanto ci penso, meno capisco', 'Più ci penso, di meno capisco'],
      correct: 0,
    },
    {
      q: '« Sarebbe stato meglio ___ prima » (partir)',
      options: ['partire', 'partiti', 'essere partiti', 'partito'],
      correct: 2,
    },
    {
      q: 'Quel est le sens figuré de « avere le mani in pasta » ?',
      options: ['être occupé à cuisiner', 'être impliqué dans une affaire', 'être maladroit', 'être fauché'],
      correct: 1,
    },
    {
      q: '« Non è che non ___ voglia, è che non ho tempo » (avoir, subjonctif)',
      options: ['abbia', 'ho', 'avessi', 'ebbi'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « au fur et à mesure que j\'apprends » ?',
      options: ['man mano che imparo', 'finché imparo', 'appena imparo', 'siccome imparo'],
      correct: 0,
    },
    {
      q: '« Chiunque ___ venuto, non l\'avrei riconosciuto » (venir, subjonctif imparfait)',
      options: ['fosse', 'era', 'sia', 'fu'],
      correct: 0,
    },
  ],
  C1: [
    {
      q: 'Quel est le sens de « tirare il pacco a qualcuno » ?',
      options: ['faire un cadeau à quelqu\'un', 'poser un lapin à quelqu\'un', 'aider quelqu\'un', 'tromper quelqu\'un financièrement'],
      correct: 1,
    },
    {
      q: '« Qualora ___ bisogno di aiuto, mi chiami » (avoir, subjonctif — registre soutenu)',
      options: ['avesse', 'abbia', 'ha', 'avrebbe'],
      correct: 1,
    },
    {
      q: 'Quelle formulation relève d\'un registre plus soutenu pour « puisque » ?',
      options: ['siccome', 'dato che', 'giacché', 'perché'],
      correct: 2,
    },
    {
      q: 'Comment dit-on de façon idiomatique « ça m\'est complètement égal » ?',
      options: ['Non mi importa niente', 'Me ne infischio', 'Non mi piace', 'Non lo so'],
      correct: 1,
    },
    {
      q: '« Non è da escludere ___ la situazione peggiori » (que)',
      options: ['che', 'se', 'quando', 'come'],
      correct: 0,
    },
    {
      q: 'Quel est le sens de « avere la coda di paglia » ?',
      options: ['être paresseux', 'se sentir coupable', 'être en colère', 'être distrait'],
      correct: 1,
    },
    {
      q: '« Per quanto mi ___, la questione è chiusa » (concerner)',
      options: ['riguarda', 'riguardi', 'riguardasse', 'riguardò'],
      correct: 0,
    },
    {
      q: 'Quelle est la nuance de « bensì » par rapport à « ma » ?',
      options: ['renforce une opposition après une négation', 'exprime une cause', 'exprime une conséquence', 'est purement familier'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « il n\'en reste pas moins que » ?',
      options: ['resta il fatto che', 'anche se', 'nonostante ciò', 'd\'altronde'],
      correct: 0,
    },
    {
      q: '« Sia ___ egli abbia ragione, sia che abbia torto, deve parlare » (que — corrélation)',
      options: ['che', 'come', 'se', 'quando'],
      correct: 0,
    },
    {
      q: 'Quel est le sens de « fare orecchie da mercante » ?',
      options: ['écouter attentivement', 'faire semblant de ne pas entendre', 'négocier habilement', 'être malentendant'],
      correct: 1,
    },
    {
      q: 'Quelle phrase illustre correctement l\'inversion stylistique du sujet au registre littéraire ?',
      options: ['Disse Marco che sarebbe tornato', 'Marco disse che sarebbe tornato', 'Che sarebbe tornato disse Marco', 'Marco che sarebbe tornato disse'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « à moins que tu ne préfères autrement » (registre soutenu) ?',
      options: ['a meno che tu non preferisca altrimenti', 'a meno che tu preferisci altrimenti', 'salvo che tu preferisci', 'tranne se tu preferisci'],
      correct: 0,
    },
    {
      q: 'Quel est le sens de « prendere lucciole per lanterne » ?',
      options: ['se tromper grossièrement', 'être très observateur', 'agir avec précipitation', 'être malhonnête'],
      correct: 0,
    },
    {
      q: '« Ove ___ necessario, si proceda diversamente » (être, subjonctif — registre administratif)',
      options: ['fosse', 'sia', 'è', 'era'],
      correct: 1,
    },
    {
      q: 'Quelle nuance apporte « semmai » dans « Semmai, ne parliamo domani » ?',
      options: ['éventuellement, le cas échéant', 'jamais', 'certainement', 'immédiatement'],
      correct: 0,
    },
    {
      q: 'Comment dit-on « il va sans dire que » ?',
      options: ['va da sé che', 'si dice che', 'non c\'è dubbio che', 'come si dice'],
      correct: 0,
    },
    {
      q: 'Quel est le sens de « essere al verde » ?',
      options: ['être en pleine forme', 'être fauché', 'être jaloux', 'être débutant'],
      correct: 1,
    },
    {
      q: '« Checché se ne dica, il progetto continua » — que signifie « checché » ?',
      options: ['quoi qu\'on en dise', 'parce qu\'on le dit', 'comme on le dit', 'quand on le dit'],
      correct: 0,
    },
    {
      q: 'Quelle formulation exprime une concession très soutenue ?',
      options: ['per quanto', 'ancorché', 'anche se', 'sebbene'],
      correct: 1,
    },
  ],
  C2: [
    {
      q: 'Quel est le sens précis de « lasciare a desiderare » dans un registre critique nuancé ?',
      options: ['être exceptionnel', 'laisser à désirer, être insuffisant', 'être surprenant', 'être achevé avec brio'],
      correct: 1,
    },
    {
      q: 'Dans un texte littéraire, quelle forme verbale remplace le passato prossimo pour la narration au passé ?',
      options: ['il presente storico ou le passato remoto', 'l\'imperfetto seul', 'le futuro semplice', 'le condizionale passato'],
      correct: 0,
    },
    {
      q: 'Quelle est la nuance entre « nondimeno » et « tuttavia » ?',
      options: ['aucune, ils sont strictement interchangeables', 'nondimeno est plus archaïsant/littéraire, tuttavia plus neutre', 'nondimeno est familier, tuttavia soutenu', 'ils n\'ont pas le même sens du tout'],
      correct: 1,
    },
    {
      q: 'Quel est le sens de « avere il dente avvelenato con qualcuno » ?',
      options: ['avoir une dent contre quelqu\'un', 'être malade à cause de quelqu\'un', 'être amoureux de quelqu\'un', 'devoir de l\'argent à quelqu\'un'],
      correct: 0,
    },
    {
      q: '« Quand\'anche ___ ragione, non cambierebbe nulla » (avoir, registre très soutenu)',
      options: ['avesse', 'abbia', 'ha', 'avrebbe'],
      correct: 0,
    },
    {
      q: 'Quelle figure de style est à l\'œuvre dans « un silenzio assordante » ?',
      options: ['métaphore', 'oxymore', 'litote', 'hyperbole'],
      correct: 1,
    },
    {
      q: 'Quel est le sens précis de « menare il can per l\'aia » ?',
      options: ['tourner autour du pot', 'promener son chien', 'agir avec brutalité', 'perdre son temps à travailler'],
      correct: 0,
    },
    {
      q: 'Dans quel registre situe-t-on l\'usage du passato remoto à l\'oral quotidien du nord de l\'Italie ?',
      options: ['courant et neutre', 'rare, perçu comme littéraire ou régional (Sud)', 'obligatoire pour tout passé', 'réservé aux enfants'],
      correct: 1,
    },
    {
      q: 'Quel est le sens de « fare la gatta morta » ?',
      options: ['faire semblant d\'être inoffensif/naïf pour tromper', 'être très fatigué', 'échouer complètement', 'jouer avec un animal'],
      correct: 0,
    },
    {
      q: 'Quelle est la différence entre « affinché » et « perché » causal ?',
      options: ['aucune', 'affinché introduit un but (+ subjonctif), perché causal introduit une cause (+ indicatif)', 'affinché est du présent, perché du passé', 'perché est toujours interrogatif'],
      correct: 1,
    },
    {
      q: 'Quel est le sens de « avere le physique du rôle » adapté en italien « avere la faccia tosta » ?',
      options: ['avoir de l\'assurance mal placée, du culot', 'avoir un joli visage', 'être fatigué', 'être honnête'],
      correct: 0,
    },
    {
      q: 'Dans un registre soutenu, quelle forme remplace « se non altro » pour dire « à tout le moins » ?',
      options: ['quantomeno', 'appena appena', 'ancora meno', 'nemmeno'],
      correct: 0,
    },
    {
      q: 'Quel est le sens de « predicare bene e razzolare male » ?',
      options: ['prêcher le bien et faire le contraire', 'bien enseigner à l\'école', 'être un excellent orateur', 'critiquer les autres injustement'],
      correct: 0,
    },
    {
      q: 'Quelle nuance stylistique apporte l\'usage du congiuntivo trapassato dans un récit littéraire ?',
      options: ['une action antérieure hypothétique ou rapportée, souvent au discours indirect', 'une simple habitude passée', 'un futur dans le passé', 'aucune, il est purement décoratif'],
      correct: 0,
    },
    {
      q: 'Quel est le sens de « toccare il cielo con un dito » ?',
      options: ['être extrêmement heureux', 'être ambitieux à l\'excès', 'échouer de justesse', 'être très grand'],
      correct: 0,
    },
    {
      q: 'Comment nomme-t-on la figure de style de « il sole rideva sui tetti » ?',
      options: ['personnification', 'métonymie', 'allitération', 'anaphore'],
      correct: 0,
    },
    {
      q: 'Quel est le sens de « avere più corde al proprio arco » ?',
      options: ['disposer de plusieurs solutions/talents', 'être musicien', 'être indécis', 'être en difficulté'],
      correct: 0,
    },
    {
      q: 'Dans quel contexte emploie-t-on « ivi » de façon idiomatique aujourd\'hui ?',
      options: ['langage courant', 'registre juridique/administratif ou très littéraire, au sens de « là, y compris »', 'langage enfantin', 'langue parlée des jeunes'],
      correct: 1,
    },
    {
      q: 'Quel est le sens de « gettare la spugna » ?',
      options: ['abandonner, jeter l\'éponge', 'faire le ménage', 'nettoyer une erreur', 'recommencer à zéro'],
      correct: 0,
    },
    {
      q: 'Quelle est la valeur stylistique du « si » impersonnel passivant dans « Si vendono case » par rapport à « Le case sono vendute » ?',
      options: ['strictement identique en tout contexte', 'plus idiomatique et courant à l\'oral comme à l\'écrit non technique', 'réservé à la langue juridique', 'incorrect grammaticalement'],
      correct: 1,
    },
  ],
}
