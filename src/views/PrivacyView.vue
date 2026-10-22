<script setup>
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { CONTACT_EMAIL, PUBLISHER, LEGAL_UPDATED, LEGAL_UPDATED_ISO } from '../lib/legal.js'
import { analyticsConsent, reopenConsentChoice } from '../lib/consent.js'

const CONSENT_LABEL = {
  granted: 'acceptée',
  denied: 'refusée',
}
</script>

<template>
  <SceneLayout title="Riservat" accent="ezza" tagline="Confidentialité">
    <p class="hint">
      Dernière mise à jour :
      <time :datetime="LEGAL_UPDATED_ISO">{{ LEGAL_UPDATED }}</time>
    </p>

    <h2>1. Responsable du traitement</h2>
    <p>
      {{ PUBLISHER.name }}, {{ PUBLISHER.address }} —
      <a :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a>.
      Site : leggendo.fr.
    </p>

    <h2>2. Sans compte</h2>
    <p>
      Vous pouvez lire tous les textes sans créer de compte. Nous ne
      collectons alors aucune donnée personnelle, sauf si vous acceptez la
      mesure d'audience (section 4). Comme tout serveur web, notre hébergeur
      enregistre des journaux techniques (adresse IP, page demandée, date),
      utilisés uniquement pour la sécurité et le bon fonctionnement du site.
    </p>

    <h2>3. Avec un compte (facultatif)</h2>
    <ul>
      <li>
        <strong>Compte</strong> : adresse e-mail, nom d'affichage le cas
        échéant, méthode de connexion (e-mail ou Google).
      </li>
      <li>
        <strong>Progression</strong> : textes lus, mots favoris, préférences
        de lecture et historique d'activité, synchronisés entre vos appareils.
      </li>
      <li>
        <strong>Textes créés, écrits corrigés et dialogues</strong> : ces
        fonctions d'intelligence artificielle sont désactivées depuis octobre
        2026. Les contenus que vous aviez produits avec elles restent
        enregistrés sur votre compte jusqu'à sa suppression.
      </li>
      <li>
        <strong>Notifications push</strong> (applications mobiles, uniquement
        si vous les acceptez) : un jeton d'appareil, retiré à la déconnexion.
      </li>
    </ul>
    <p>
      La création d'un compte est réservée aux personnes d'au moins 15 ans
      ou disposant de l'accord de leur représentant légal.
    </p>

    <h2>4. Mesure d'audience (Google Analytics)</h2>
    <p>
      Avec votre accord seulement, le site utilise Google Analytics (via
      Firebase) pour compter les visites et les pages consultées. Tant que
      vous n'avez pas cliqué « Accepter », aucun script ni cookie d'analyse
      n'est chargé ; si vous refusez, le site fonctionne de la même façon.
      Les cookies <code>_ga</code> expirent au plus tard après 13 mois, et les
      statistiques sont conservées au maximum 14 mois par Google. Elles ne
      servent qu'à améliorer le site, jamais à de la publicité.
    </p>
    <p>
      Votre choix actuel :
      <strong>{{ CONSENT_LABEL[analyticsConsent] || 'pas encore exprimé' }}</strong>.
      <button type="button" class="link-btn" @click="reopenConsentChoice">
        Modifier mon choix
      </button>
    </p>

    <h2>5. Finalités et bases légales</h2>
    <ul>
      <li>Gérer votre compte et synchroniser votre progression : exécution du service que vous demandez.</li>
      <li>Mesure d'audience : votre consentement, retirable à tout moment.</li>
      <li>Notifications push : votre consentement, donné dans la demande d'autorisation du téléphone.</li>
      <li>Journaux techniques et prévention des abus : intérêt légitime à sécuriser le service.</li>
    </ul>
    <p>
      Vos données ne sont jamais vendues ni utilisées à des fins publicitaires.
    </p>

    <h2>6. Sous-traitants</h2>
    <ul>
      <li>
        <strong>Infomaniak Network SA</strong> (Suisse) — hébergement du site.
      </li>
      <li>
        <strong>Google LLC (Firebase)</strong> — authentification, base de
        données et, si vous l'acceptez, Google Analytics et les notifications
        push.
      </li>
    </ul>
    <p>
      Leggendo ne vend rien : aucun prestataire de paiement n'est utilisé.
      Les fonctions d'intelligence artificielle sont désactivées : aucune
      donnée n'est transmise à un fournisseur de modèles d'IA. Jusqu'en
      octobre 2026, les consignes saisies dans « Créer son texte »,
      « Scrivi » et « Dialogo » étaient envoyées à DeepSeek (Chine), sans
      votre adresse e-mail.
    </p>

    <h2>7. Transferts hors de Suisse et de l'UE</h2>
    <p>
      Google peut traiter des données aux États-Unis. Google LLC est
      certifiée au Data Privacy Framework UE–États-Unis et Suisse–États-Unis,
      reconnus comme offrant un niveau de protection adéquat ; les clauses
      contractuelles types de Google s'appliquent en complément.
    </p>

    <h2>8. Stockage local</h2>
    <p>
      Le site enregistre dans votre navigateur vos préférences de lecture,
      votre progression hors connexion et votre choix de mesure d'audience,
      et met en cache ses fichiers pour fonctionner hors ligne. Ces données
      restent sur votre appareil et ne nécessitent pas de consentement, car
      elles sont indispensables au service que vous utilisez.
    </p>

    <h2>9. Durées de conservation</h2>
    <ul>
      <li>Données de compte et progression : jusqu'à la suppression du compte.</li>
      <li>Statistiques Google Analytics : 14 mois au maximum ; cookies : 13 mois au maximum.</li>
      <li>Choix de mesure d'audience : 6 mois, puis la question vous est reposée.</li>
      <li>Messages envoyés via la page Contact : le temps de traiter votre demande.</li>
    </ul>

    <h2>10. Suppression du compte</h2>
    <p>
      Vous pouvez supprimer votre compte à tout moment depuis votre profil ou
      la page <RouterLink :to="{ name: 'delete-account' }">Supprimer mon compte</RouterLink>.
      Sont alors effacés immédiatement : le compte, la progression, les mots
      favoris, les textes créés, les écrits soumis à la correction, les
      dialogues, les crédits et tâches de génération et les traces de l'ancien
      essai gratuit. Seuls subsistent des compteurs techniques anonymes
      (nombre et coût des anciennes générations, sans lien avec vous). Vous
      pouvez aussi demander la suppression par e-mail.
    </p>

    <h2>11. Vos droits</h2>
    <p>
      Selon la loi fédérale suisse sur la protection des données (nLPD) et le
      RGPD, vous pouvez accéder à vos données, les rectifier, les supprimer,
      en limiter le traitement, vous y opposer et en demander la portabilité.
      Écrivez à <a :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a> :
      nous répondons sous 30 jours. Vous pouvez aussi saisir le Préposé
      fédéral à la protection des données et à la transparence (PFPDT) ou,
      en France, la CNIL.
    </p>
  </SceneLayout>
</template>

<style scoped>
.link-btn {
  padding: 0;
  border: 0;
  background: none;
  color: #8f5220;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
</style>
