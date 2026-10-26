// Contenu textuel statique injecté dans le HTML prérendu des pages qui n'ont
// pas de donnée structurée (méthodologie, test de niveau, jeux, contact,
// pages légales, suppression de compte, dictionnaire) — SEO-2 / SEO-3.
//
// Ces pages sont rendues côté client par Vue ; sans cela leur HTML prérendu
// était un <div id="app"></div> vide pour les robots sans JS. Le texte
// ci-dessous est un RÉSUMÉ fidèle, jamais une copie : pour les pages légales
// en particulier, on décrit ce que la page couvre et on renvoie vers elle,
// sans reproduire de clause (le texte juridique fait foi et vit dans les vues
// PrivacyView / TermsView / LegalView).
//
// Node-safe : aucune API navigateur. Format commun :
//   { h1, intro: [paragraphes], sections: [{ h2, p: [..] | ul: [..] }], links: [[href, libellé]] }
// `updated: true` : page légale, datée par LEGAL_UPDATED (src/lib/legal.js).

import { CONTACT_EMAIL, PUBLISHER, HOST } from '../lib/legal.js'

export const STATIC_PAGE_CONTENT = {
  '/methodologie': {
    h1: "La méthodologie : apprendre l'italien en lisant",
    intro: [
      "Pas de listes de vocabulaire à réciter, pas d'exercices à enchaîner : sur Leggendo, vous lisez des textes italiens adaptés à votre niveau, et quand un mot vous échappe, sa traduction française apparaît d'un simple clic, sans quitter la phrase.",
      "Cette page détaille, par écrit, les principes pédagogiques sur lesquels repose le lecteur : la lecture extensive, la zone de difficulté idéale, la traduction au clic, la double trace audio et la répétition en contexte.",
    ],
    sections: [
      {
        h2: 'Trouver sa zone idéale',
        p: [
          "Tout repose sur le bon niveau de difficulté. En dessous d'environ 90 % de mots compris, la lecture devient du déchiffrage et décourage. Au-delà de 98 %, elle est agréable mais n'apporte presque rien de nouveau. Entre les deux se trouve la zone idéale, que la recherche appelle i+1 : vous comprenez l'histoire, et chaque page apporte quelques mots nouveaux.",
          "Les textes sont gradués de A1 à C2 selon le Cadre européen commun de référence pour les langues (CECR) pour vous garder dans cette zone, et un test de niveau gratuit permet de choisir par où commencer.",
        ],
      },
      {
        h2: 'Les cinq principes',
        ul: [
          "Lire beaucoup, à son niveau : on acquiert une langue en comprenant des messages, bien plus qu'en étudiant ses règles (input compréhensible).",
          "Traduire au clic, sans casser le fil : chercher dans un dictionnaire interrompt la lecture ; avec la traduction à portée de clic, on retient davantage de mots.",
          "Lire en écoutant : la lecture accompagnée de l'audio crée une double trace en mémoire, écrite et sonore, précieuse entre le français et l'italien dont les orthographes se ressemblent mais dont les prononciations divergent.",
          "Profiter de l'avantage du francophone : le français et l'italien partagent une grande partie de leur vocabulaire ; la vraie difficulté, ce sont les faux amis, exactement là où les traductions font la différence.",
          "Répéter en contexte : un mot doit être croisé de nombreuses fois, dans des contextes variés, pour être retenu ; chaque texte recycle le vocabulaire fréquent.",
        ],
      },
      {
        h2: 'Et pour parler ?',
        p: [
          "La lecture extensive développe très bien la compréhension écrite et le vocabulaire. Pour l'expression orale, elle se combine idéalement avec un cours ou un échange avec un locuteur natif : dix à vingt minutes de lecture par jour suffisent, la régularité compte plus que la durée.",
        ],
      },
    ],
    links: [
      ['/methode', 'La méthode en bref et la FAQ'],
      ['/test-de-niveau', 'Faire le test de niveau'],
      ['/textes', 'Parcourir tous les textes'],
    ],
  },

  '/test-de-niveau': {
    h1: "Test de niveau d'italien gratuit, de A1 à C2",
    intro: [
      "Ce test adaptatif estime le niveau d'italien conseillé pour commencer, selon le Cadre européen commun de référence pour les langues (CECR), de A1 à C2. Il est gratuit et ne demande pas de compte.",
      "Le test commence par une question de niveau A1. Chaque bonne réponse fait monter le niveau des questions suivantes, chaque erreur le fait redescendre : le questionnaire s'ajuste à vos réponses plutôt que de vous poser les mêmes questions à tout le monde.",
    ],
    sections: [
      {
        h2: 'Comment se déroule le test',
        ul: [
          "Une seule bonne réponse par question, sans limite de temps.",
          "Entre 10 et 16 questions selon votre parcours.",
          "Quelques questions de mise en situation sur des cas réels, qui aident à formuler un résultat plus juste sans modifier le score du questionnaire.",
        ],
      },
      {
        h2: 'Que faire du résultat ?',
        p: [
          "Le résultat est un niveau conseillé pour commencer, pas une certification officielle. Il vous indique à quel niveau de textes graduée vous lancer pour rester dans la zone où l'on comprend l'essentiel tout en rencontrant des mots nouveaux.",
          "Une fois votre niveau connu, parcourez les pages dédiées : textes A1 pour débuter, A2 pour consolider les bases, B1 et B2 pour gagner en aisance, ou les classiques du domaine public pour les lecteurs avancés.",
        ],
      },
    ],
    links: [
      ['/textes-italien-a1', 'Textes italiens A1'],
      ['/textes-italien-a2', 'Textes italiens A2'],
      ['/textes-italien-b1', 'Textes italiens B1'],
      ['/textes-italien-b2', 'Textes italiens B2'],
      ['/methodologie', 'La méthodologie de Leggendo'],
    ],
  },

  '/giochi': {
    h1: "Giochi : des jeux pour apprendre l'italien",
    intro: [
      "Quinze jeux courts pour réviser le vocabulaire, la grammaire et les textes italiens, entre deux lectures. Chaque partie dure quelques minutes et s'appuie sur le même contenu que le lecteur.",
    ],
    sections: [
      {
        h2: 'Vocabulaire et mots',
        ul: [
          "Abbina le parole : retrouvez les paires italien-français.",
          "Impiccato : devinez le mot italien lettre par lettre.",
          "Anagramma : remettez les lettres dans l'ordre avant la fin du chrono.",
          "Vero o Falso : la traduction proposée est-elle la bonne ?",
          "Parole del cuore : révisez vos propres mots favoris enregistrés en lisant.",
        ],
      },
      {
        h2: 'Grammaire et conjugaison',
        ul: [
          "Coniuga Express : conjuguez le verbe au temps et à la personne demandés.",
          "Che tempo è ? : reconnaissez le temps grammatical d'une forme conjuguée.",
          "Verbi irregolari : choisissez la bonne forme au présent des verbes irréguliers courants.",
          "Rimetti in ordine : remettez les mots d'une phrase dans le bon ordre.",
          "Ripassa i tuoi errori : rejouez vos erreurs de production écrite.",
        ],
      },
      {
        h2: 'Lecture et niveau',
        ul: [
          "Traduci la frase : retrouvez la bonne traduction d'une phrase italienne authentique.",
          "Scala CECR : grimpez les niveaux A1 à C2 en enchaînant les bonnes réponses.",
          "Indovina il livello : devinez le niveau CECR d'un extrait.",
          "Che genere ? : devinez le genre littéraire d'un extrait.",
          "Sfida a tempo : répondez au plus grand nombre de questions en 60 secondes.",
        ],
      },
    ],
    links: [
      ['/textes', 'Parcourir tous les textes'],
      ['/test-de-niveau', 'Faire le test de niveau'],
      ['/verbi', 'Les verbes et leur conjugaison'],
    ],
  },

  '/contact': {
    h1: 'Contact',
    intro: [
      "Une question, un bug, une idée de texte ? Écrivez-nous, nous répondons généralement sous 48 heures.",
      `Le formulaire de contact ouvre votre application de messagerie avec le message pré-rempli ; vous pouvez aussi écrire directement à ${CONTACT_EMAIL}.`,
    ],
    sections: [
      {
        h2: 'Pour quels sujets nous écrire ?',
        ul: [
          "Signaler une erreur de traduction, de transcription ou de niveau dans un texte.",
          "Proposer un thème, un auteur ou un classique à ajouter au catalogue.",
          "Remonter un problème technique : lecteur, audio, connexion.",
          "Poser une question sur vos données ou la suppression de votre compte.",
        ],
      },
      {
        h2: 'Avant de nous écrire',
        p: [
          "La page Méthode répond aux questions fréquentes sur le fonctionnement de la lecture avec traduction au clic. Pour supprimer votre compte et vos données, une page dédiée explique la démarche.",
          `Leggendo est édité en Suisse par ${PUBLISHER.name}, ${PUBLISHER.address} ; les informations complètes figurent dans les mentions légales.`,
        ],
      },
    ],
    links: [
      ['/methode', 'La méthode et la FAQ'],
      ['/deleteAccount', 'Supprimer mon compte'],
      ['/mentions-legales', 'Mentions légales'],
    ],
  },

  // Pages légales : informations d'identification reprises en clair (elles
  // doivent être lisibles même sans JavaScript), le reste résumé.
  '/mentions-legales': {
    updated: true,
    h1: 'Mentions légales',
    intro: [
      `Le site leggendo.fr est édité par ${PUBLISHER.name}, ${PUBLISHER.form} (IDE ${PUBLISHER.ide}), ${PUBLISHER.address}. Téléphone : ${PUBLISHER.phone}. E-mail : ${CONTACT_EMAIL}.`,
    ],
    sections: [
      {
        h2: 'Directeur de la publication et hébergement',
        ul: [
          `Directeur de la publication : ${PUBLISHER.name}.`,
          `Hébergeur : ${HOST.name}, ${HOST.address}, téléphone ${HOST.phone}.`,
          "Comptes utilisateurs : Firebase, service de Google LLC (États-Unis).",
        ],
      },
      {
        h2: 'Activité, contenus et droit applicable',
        p: [
          "Leggendo est un service gratuit d'apprentissage de l'italien par la lecture, sans vente ni publicité. Les textes, traductions, enregistrements audio et le code du site sont protégés par le droit d'auteur ; les œuvres classiques restent du domaine public.",
          "Le site est soumis au droit suisse, sans préjudice des règles impératives qui protègent les consommateurs dans leur pays de résidence.",
        ],
      },
    ],
    links: [
      ['/confidentialite', 'Politique de confidentialité'],
      ['/conditions', "Conditions d'utilisation"],
      ['/contact', 'Nous contacter'],
    ],
  },

  '/confidentialite': {
    updated: true,
    h1: 'Politique de confidentialité',
    intro: [
      "Cette page explique quelles données personnelles Leggendo traite, dans quel but, avec quels prestataires, pendant combien de temps, et comment exercer vos droits.",
    ],
    sections: [
      {
        h2: "L'essentiel",
        ul: [
          "Tous les textes se lisent sans compte ; sans compte, aucune donnée personnelle n'est collectée.",
          "La mesure d'audience (Google Analytics) ne se charge qu'avec votre accord explicite, modifiable à tout moment.",
          "Le compte, facultatif, conserve votre e-mail et votre progression jusqu'à sa suppression.",
          "Aucun paiement, aucune publicité ; les fonctions d'intelligence artificielle sont désactivées et plus aucune donnée n'est transmise à un fournisseur d'IA.",
          "La suppression du compte efface immédiatement toutes les données qui y sont liées.",
        ],
      },
      {
        h2: 'Vos droits',
        p: [
          `Accès, rectification, suppression, limitation, opposition et portabilité : écrivez à ${CONTACT_EMAIL}. Vous pouvez aussi saisir le PFPDT (Suisse) ou la CNIL (France). Le texte complet de la politique fait foi ; cette page n'en est qu'un résumé.`,
        ],
      },
    ],
    links: [
      ['/deleteAccount', 'Supprimer mon compte'],
      ['/conditions', "Conditions d'utilisation"],
      ['/mentions-legales', 'Mentions légales'],
      ['/contact', 'Nous contacter'],
    ],
  },

  '/conditions': {
    updated: true,
    h1: "Conditions d'utilisation",
    intro: [
      "Cette page fixe les règles d'utilisation de Leggendo, service gratuit de lecture en italien. Elle résume ci-dessous les points principaux ; le texte complet fait foi.",
    ],
    sections: [
      {
        h2: 'Ce que couvrent les conditions',
        ul: [
          "Un service gratuit : textes gradués, classiques, traduction, audio, dictionnaire et jeux, sans paiement ni publicité.",
          "Un compte facultatif, réservé aux personnes d'au moins 15 ans ou disposant de l'accord de leur représentant légal.",
          "Un usage personnel et pédagogique des contenus, y compris en classe ; pas de copie en masse ni de republication.",
          "La responsabilité : engagée pour une faute imputable à l'éditeur, dans les limites de la loi.",
          "Le droit suisse, sans priver les consommateurs de la protection de leur pays de résidence.",
        ],
      },
    ],
    links: [
      ['/confidentialite', 'Politique de confidentialité'],
      ['/mentions-legales', 'Mentions légales'],
      ['/contact', 'Nous contacter'],
    ],
  },

  '/deleteAccount': {
    h1: 'Supprimer mon compte Leggendo',
    intro: [
      "Vous pouvez supprimer votre compte Leggendo et les données qui y sont associées à tout moment, depuis le site web ou depuis les applications.",
    ],
    sections: [
      {
        h2: 'Comment supprimer votre compte',
        ul: [
          "Connectez-vous à votre compte, sur le site ou dans l'application.",
          "Ouvrez la page de suppression de compte et confirmez votre demande.",
          "Votre compte et toutes les données associées (progression, mots favoris, textes créés, écrits corrigés, dialogues) sont alors effacés immédiatement.",
        ],
      },
      {
        h2: 'À savoir avant de supprimer',
        p: [
          "La suppression du compte est définitive : votre progression et vos mots favoris ne pourront pas être récupérés.",
          `Si vous ne parvenez pas à vous connecter, écrivez à ${CONTACT_EMAIL} depuis l'adresse de votre compte : la demande est traitée sous 30 jours.`,
        ],
      },
    ],
    links: [
      ['/contact', 'Nous contacter'],
      ['/confidentialite', 'Politique de confidentialité'],
    ],
  },

  '/dizionario': {
    h1: 'Dizionario : dictionnaire italien-français',
    intro: [
      "Un dictionnaire italien-français pensé pour la lecture : pour chaque mot, la nature grammaticale, la traduction, une définition en italien, des exemples de phrases et, pour les verbes, la table de conjugaison complète.",
      "Le dictionnaire est aussi accessible depuis le lecteur : un clic sur un mot du texte ouvre sa fiche. Voici une sélection de fiches parmi les plus utiles pour débuter, verbes essentiels et vocabulaire courant.",
    ],
    sections: [],
    links: [
      ['/verbi', 'Tous les verbes et leur conjugaison'],
      ['/grammatica', 'La grammaire italienne'],
      ['/textes', 'Lire des textes gradués'],
    ],
  },
}

// Navigation et pied de page statiques injectés dans toute page prérendue
// (SEO-6) : maillage interne visible par les robots sans JS.
export const NAV_LINKS = [
  ['/', 'Accueil'],
  ['/textes', 'Textes'],
  ['/classici', 'Classici'],
  ['/dizionario', 'Dizionario'],
  ['/verbi', 'Verbi'],
  ['/grammatica', 'Grammatica'],
  ['/giochi', 'Giochi'],
  ['/test-de-niveau', 'Test de niveau'],
  ['/methode', 'Méthode'],
  ['/abonnement', 'Abonnement'],
]

export const FOOTER_LINKS = [
  ['/textes-italien-a1', 'Textes italiens A1'],
  ['/textes-italien-a2', 'Textes italiens A2'],
  ['/textes-italien-b1', 'Textes italiens B1'],
  ['/textes-italien-b2', 'Textes italiens B2'],
  ['/a-propos', 'À propos'],
  ['/contact', 'Contact'],
  ['/mentions-legales', 'Mentions légales'],
  ['/confidentialite', 'Confidentialité'],
  ['/conditions', 'CGU / CGV'],
]
