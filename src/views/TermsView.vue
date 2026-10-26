<script setup>
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { CONTACT_EMAIL, PUBLISHER, LEGAL_UPDATED, LEGAL_UPDATED_ISO } from '../lib/legal.js'
</script>

<template>
  <SceneLayout title="Condizi" accent="oni" tagline="Conditions d'utilisation">
    <p class="hint">
      Dernière mise à jour :
      <time :datetime="LEGAL_UPDATED_ISO">{{ LEGAL_UPDATED }}</time>
    </p>

    <h2>1. Objet</h2>
    <p>
      Ces conditions encadrent l'utilisation de Leggendo (leggendo.fr), service
      d'apprentissage de l'italien par la lecture édité par
      {{ PUBLISHER.name }} (voir les
      <RouterLink :to="{ name: 'legal' }">mentions légales</RouterLink>).
    </p>

    <h2>2. Un service gratuit</h2>
    <p>
      Leggendo est gratuit : textes gradués, classiques, traduction au clic,
      audio, dictionnaire, jeux et test de niveau sont accessibles sans
      paiement, sans abonnement et sans publicité. Rien n'est vendu sur le
      site.
    </p>

    <h2>3. Compte facultatif</h2>
    <p>
      Un compte n'est pas nécessaire pour lire. Il permet de retrouver votre
      progression et vos mots favoris sur plusieurs appareils. Pour en créer
      un, vous devez avoir au moins 15 ans ou, à défaut, l'accord de votre
      représentant légal. Vous êtes responsable de la confidentialité de vos
      identifiants. Vous pouvez supprimer votre compte à tout moment depuis
      votre profil ou la page
      <RouterLink :to="{ name: 'delete-account' }">Supprimer mon compte</RouterLink>.
    </p>

    <h2>4. Usage du service</h2>
    <p>
      Les contenus sont proposés pour un usage personnel et pédagogique, y
      compris en classe. Il est interdit de les copier en masse (aspiration
      automatisée), de les revendre ou de les republier ailleurs sans
      autorisation, et de perturber le fonctionnement du site. Un compte
      utilisé de manière frauduleuse ou abusive peut être suspendu.
    </p>

    <h2>5. Disponibilité et contenus</h2>
    <p>
      Nous faisons de notre mieux pour que le site soit disponible et que les
      textes, traductions et explications soient exacts, sans pouvoir le
      garantir en permanence : le service peut être interrompu pour
      maintenance, et une traduction peut contenir une erreur. Signalez-la via
      la page <RouterLink :to="{ name: 'contact' }">Contact</RouterLink>.
      Le service étant gratuit, il peut évoluer ou certaines fonctions
      disparaître ; en cas d'arrêt définitif, vous en serez informé à
      l'avance et pourrez demander une copie de vos données.
    </p>

    <h2>6. Responsabilité</h2>
    <p>
      Notre responsabilité ne peut être engagée que pour une faute qui nous est
      imputable et dans les limites prévues par la loi applicable ; elle n'est
      jamais exclue en cas de faute intentionnelle ou de négligence grave, ni
      pour les dommages que la loi interdit d'exclure.
    </p>

    <h2>7. Données personnelles</h2>
    <p>
      Le traitement de vos données est décrit dans la
      <RouterLink :to="{ name: 'privacy' }">politique de confidentialité</RouterLink>.
    </p>

    <h2>8. Modification des conditions</h2>
    <p>
      Ces conditions peuvent évoluer. La date de mise à jour figure en haut de
      la page ; en cas de changement important, les titulaires d'un compte
      sont prévenus par e-mail.
    </p>

    <h2>9. Droit applicable et litiges</h2>
    <p>
      Ces conditions sont soumises au droit suisse. Si vous êtes un
      consommateur résidant dans un autre pays, vous conservez la protection
      des règles impératives de votre pays de résidence et pouvez saisir les
      tribunaux de votre domicile. Avant toute démarche, écrivez-nous à
      <a :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a> : nous
      cherchons toujours une solution amiable.
    </p>
  </SceneLayout>
</template>
