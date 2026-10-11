<script setup>
import SceneLayout from '../components/SceneLayout.vue'
</script>

<template>
  <SceneLayout title="Riservat" accent="ezza" tagline="Confidentialité">
    <p class="hint">Dernière mise à jour : 11 octobre 2026</p>
    <!-- A RELIRE PAR UN JURISTE : l'ensemble de cette page (base légale, consentement, transferts internationaux). -->

    <h2>1. Responsable du traitement</h2>
    <p>
      Leggendo, Loïc Berthod, Suisse —
      <a href="mailto:lberthod@gmail.com">lberthod@gmail.com</a>. Site :
      leggendo.fr.
    </p>

    <h2>2. Données collectées</h2>
    <ul>
      <li>
        <strong>Compte</strong> : adresse e-mail et, le cas échéant, nom
        d'affichage (connexion par e-mail ou compte Google).
      </li>
      <li>
        <strong>Progression</strong> : textes lus, favoris, préférences de
        lecture, textes que vous créez (formules Premium IA et Enseignant),
        synchronisés avec votre compte.
      </li>
      <li>
        <strong>Statistiques d'usage</strong> : le site et les applications
        utilisent Google Analytics (via Firebase Analytics) pour mesurer
        l'audience et le parcours (pages vues, clics sur les boutons, textes
        ouverts). Cette mesure est active pour tous les visiteurs ; elle
        repose sur un identifiant technique pseudonyme et sur l'adresse IP
        traitée par Google. Les statistiques ne servent qu'à améliorer le
        service, pas à de la publicité.
      </li>
      <li>
        <strong>Notifications push</strong> (applications Android et iOS,
        uniquement si vous les acceptez) : un jeton d'appareil Firebase Cloud
        Messaging est enregistré sur votre compte pour vous envoyer les
        rappels de série quotidienne, l'annonce de nouveaux textes et la
        fin d'une génération de texte. Vous pouvez les désactiver à tout
        moment dans les réglages de votre téléphone ; le jeton est retiré de
        votre compte à la déconnexion.
      </li>
      <li>
        <strong>Paiements</strong> : voir la section 4.
      </li>
    </ul>
    <p>
      Sans compte, nous ne collectons aucune donnée personnelle autre que les
      statistiques d'usage décrites ci-dessus.
    </p>

    <h2>3. Finalités et base légale</h2>
    <p>
      Ces données servent à gérer votre compte et votre progression
      (exécution du contrat), votre abonnement (exécution du contrat et
      obligations légales), les notifications push (votre accord, via la
      demande d'autorisation du système) et la mesure d'audience (intérêt
      légitime d'améliorer le service). Elles ne sont jamais vendues ni
      transmises à des tiers à des fins publicitaires.
    </p>
    <!-- A RELIRE PAR UN JURISTE : la mesure d'audience GA4 est actuellement active sans bandeau de consentement ; la base légale (intérêt légitime vs consentement ePrivacy/RGPD) est à valider. -->

    <h2>4. Sous-traitants et destinataires</h2>
    <ul>
      <li>
        <strong>Firebase / Google LLC</strong> — authentification, base de
        données, fonctions serveur, Analytics et Cloud Messaging (notifications
        push).
      </li>
      <li>
        <strong>Stripe, Inc.</strong> — paiements sur le site web. Vos données
        bancaires sont traitées exclusivement par Stripe ; nous n'y avons
        jamais accès.
      </li>
      <li>
        <strong>Google Play (Google Play Billing)</strong> et
        <strong>Apple (App Store / StoreKit)</strong> — paiements dans les
        applications Android et iOS. Nous recevons uniquement la confirmation
        de l'achat (identifiant de produit, reçu) permettant d'activer votre
        abonnement ; vos moyens de paiement restent gérés par Google ou Apple.
      </li>
      <li>
        <strong>Hébergement</strong> — Infomaniak Network SA (Suisse) pour le
        site et le serveur de génération.
      </li>
      <li>
        <strong>Fournisseurs de modèles d'IA</strong> (formules Premium IA et
        Enseignant) — lorsque vous générez, corrigez ou dialoguez avec un
        texte, les consignes que vous saisissez (thème, niveau, texte à
        corriger ou message) sont envoyées par notre serveur à un fournisseur
        de modèle de langage tiers : actuellement DeepSeek, avec
        possibilité de recourir à GLM ou Kimi. Nous n'envoyons pas votre
        adresse e-mail à ces fournisseurs ; évitez toutefois de saisir des
        informations personnelles dans vos consignes.
      </li>
    </ul>

    <h2>5. Transferts hors de Suisse et de l'UE/EEE</h2>
    <p>
      Google (États-Unis), Stripe, Apple et les fournisseurs de modèles d'IA
      peuvent traiter des données hors de Suisse et de l'Union européenne,
      notamment aux États-Unis et en Chine pour les fournisseurs d'IA.
      Les garanties applicables dépendent de chaque fournisseur (clauses
      contractuelles types, cadre de protection des données UE-États-Unis
      pour les entités certifiées, etc.) ; nous ne maîtrisons pas ces
      mécanismes et vous invitons à consulter les politiques de
      confidentialité de ces fournisseurs.
    </p>
    <!-- A RELIRE PAR UN JURISTE : transferts hors UE/CH (États-Unis, Chine) et garanties réellement en place avec chaque fournisseur ; à compléter/valider. -->

    <h2>6. Partage public (formule Enseignant)</h2>
    <p>
      Les abonnés Enseignant peuvent générer une URL publique pour partager un
      texte créé. Toute personne disposant de ce lien peut consulter le texte
      sans créer de compte Leggendo ; aucune donnée n'est collectée auprès de
      ces visiteurs par notre service de comptes. Seul le titulaire du compte
      reste responsable du contenu qu'il choisit de partager.
    </p>

    <h2>7. Application mobile (Android / iOS)</h2>
    <p>
      Les applications Android et iOS de Leggendo utilisent le microphone
      pour les exercices de prononciation : vous répétez une phrase en
      italien et la reconnaissance vocale du système (Google sur Android,
      Apple sur iOS) transcrit ce que vous dites afin d'évaluer les mots
      reconnus. L'audio est traité par le service de reconnaissance vocale
      du système d'exploitation et n'est ni stocké ni transmis à nos
      serveurs ; seul le résultat texte de la transcription est utilisé,
      localement, pour l'exercice en cours. Les applications ne contiennent
      aucun SDK publicitaire ; les données transmises sont celles décrites
      aux sections 2 à 5 (compte, Firebase dont Analytics et notifications
      push, paiements, IA).
    </p>

    <h2>8. Cookies et stockage local</h2>
    <p>
      Le site utilise le stockage local de votre navigateur pour mémoriser
      vos préférences de lecture et permettre le fonctionnement hors ligne
      (PWA). Google Analytics peut déposer ou lire un identifiant technique
      dans votre navigateur pour la mesure d'audience. Aucun cookie
      publicitaire n'est utilisé.
    </p>

    <h2>9. Conservation et suppression</h2>
    <p>
      Vos données de compte sont conservées tant que votre compte est actif.
      Vous pouvez supprimer vous-même votre compte depuis la page « Mon
      profil » : le compte, votre progression, vos textes créés, vos tâches de
      génération et votre quota sont alors supprimés immédiatement et
      définitivement de nos bases. Vous pouvez aussi écrire à
      <a href="mailto:lberthod@gmail.com">lberthod@gmail.com</a>. La
      suppression du compte ne résilie pas automatiquement un abonnement
      Stripe en cours — contactez-nous pour l'annuler ; pour un abonnement
      Google Play ou Apple, résiliez-le depuis votre compte Google ou Apple.
      Les données détenues par Google (Analytics) et par les prestataires de
      paiement obéissent à leurs propres durées de conservation.
    </p>

    <h2>10. Vos droits</h2>
    <p>
      Conformément à la loi fédérale suisse sur la protection des données
      (nLPD) et au RGPD, vous disposez d'un droit d'accès, de rectification,
      de suppression, de limitation, d'opposition et de portabilité de vos
      données. Pour les exercer, écrivez à
      <a href="mailto:lberthod@gmail.com">lberthod@gmail.com</a>. Vous pouvez
      aussi saisir le Préposé fédéral à la protection des données et à la
      transparence (PFPDT) ou l'autorité de contrôle de votre pays.
    </p>
  </SceneLayout>
</template>
