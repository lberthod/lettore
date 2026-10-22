// Contenu de la page « Gratuit » (/abonnement, PricingView.vue), partagé avec
// le prérendu SEO (scripts/prerender.mjs : FAQPage JSON-LD et corps HTML
// servi aux robots sans JS). Module sans dépendance Vue/Firebase pour tourner
// aussi bien sous Node que dans le navigateur. Voir GRATUIT.md.

// Plafond mensuel de crédits IA par compte — à garder aligné avec
// FREE_MONTHLY_CREDITS dans leggendo-server/quota.mjs (le serveur tranche ;
// cette copie ne sert qu'à l'affichage).
export const FREE_MONTHLY_CREDITS = 10

export const FREE_FEATURES = [
  {
    icon: '📚',
    title: 'Tout le catalogue',
    text: 'Plus de 450 textes gradués, du niveau A1 au C2, avec traduction française au clic, lecture audio et quiz.',
  },
  {
    icon: '📖',
    title: 'Les Classici en entier',
    text: 'Seize œuvres du domaine public en texte authentique, chapitre par chapitre, du Pinocchio à Mattia Pascal.',
  },
  {
    icon: '📰',
    title: 'Notizie',
    text: "L'actualité italienne, suisse et française réécrite en italien à votre niveau, renouvelée chaque jour.",
  },
  {
    icon: '✨',
    title: `${FREE_MONTHLY_CREDITS} crédits IA par mois`,
    text: 'Créez un texte sur mesure, faites corriger une production écrite ou dialoguez dans une scène du quotidien.',
  },
  {
    icon: '🔄',
    title: 'Progression synchronisée',
    text: 'Textes lus, mots favoris, révisions espacées et parcours quotidien, retrouvés sur tous vos appareils.',
  },
  {
    icon: '🧰',
    title: 'Outils sans compte',
    text: 'Dizionario, Verbi, Grammatica, Giochi, test de niveau et six textes de découverte restent ouverts à tous.',
  },
]

export const FREE_FAQ = [
  {
    q: "C'est vraiment gratuit ?",
    a: "Oui. Il n'y a ni abonnement, ni essai limité dans le temps, ni carte bancaire à renseigner. Un compte (e-mail ou Google) suffit pour lire tout le catalogue et utiliser les outils.",
  },
  {
    q: 'Pourquoi gratuit ?',
    a: "Leggendo est un projet indépendant. Ce qui compte aujourd'hui, c'est que le plus de francophones possible lisent en italien et nous disent ce qui marche. Des lecteurs, des retours, de meilleurs textes : c'est la priorité, pas la facturation.",
  },
  {
    q: 'Y a-t-il des limites ?',
    a: `Une seule : les outils d'intelligence artificielle (création de textes, correction, dialogue) nous coûtent à chaque usage, ils sont donc plafonnés à ${FREE_MONTHLY_CREDITS} crédits par mois et par compte, après vérification de votre adresse e-mail. La lecture, l'audio, les traductions et les quiz n'ont aucune limite.`,
  },
  {
    q: 'Faut-il un compte pour lire ?',
    a: "Six textes de découverte, le premier chapitre de chaque Classico, trois livres entiers et tous les outils de langue (dictionnaire, conjugaison, grammaire, jeux) se consultent sans compte. Le reste du catalogue demande un compte gratuit : c'est ce qui nous permet de synchroniser votre progression et de vous proposer un parcours.",
  },
  {
    q: 'Est-ce que cela restera gratuit ?',
    a: "Notre objectif est de garder la lecture gratuite. Si des options payantes apparaissent un jour, elles s'ajouteront à ce qui existe sans vous retirer ce que vous utilisez, et vous en serez informé·e à l'avance.",
  },
]
