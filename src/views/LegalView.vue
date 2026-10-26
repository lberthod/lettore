<script setup>
import { RouterLink } from 'vue-router'
import SceneLayout from '../components/SceneLayout.vue'
import { CONTACT_EMAIL, PUBLISHER, HOST, LEGAL_UPDATED, LEGAL_UPDATED_ISO } from '../lib/legal.js'
</script>

<template>
  <SceneLayout title="Note leg" accent="ali" tagline="Mentions légales">
    <p class="hint">
      Dernière mise à jour :
      <time :datetime="LEGAL_UPDATED_ISO">{{ LEGAL_UPDATED }}</time>
    </p>

    <h2>Éditeur du site</h2>
    <p>Le site leggendo.fr est édité par :</p>
    <ul>
      <li><strong>Nom</strong> : {{ PUBLISHER.name }}</li>
      <li><strong>Forme juridique</strong> : {{ PUBLISHER.form }}</li>
      <li>
        <strong>Numéro IDE</strong> :
        <a :href="PUBLISHER.ideUrl" rel="noopener" target="_blank">{{ PUBLISHER.ide }}</a>
      </li>
      <li><strong>Adresse</strong> : {{ PUBLISHER.address }}</li>
      <li><strong>Téléphone</strong> : {{ PUBLISHER.phone }}</li>
      <li>
        <strong>E-mail</strong> :
        <a :href="`mailto:${CONTACT_EMAIL}`">{{ CONTACT_EMAIL }}</a>
      </li>
    </ul>

    <h2>Directeur de la publication</h2>
    <p>{{ PUBLISHER.name }}, éditeur du site, joignable aux coordonnées ci-dessus.</p>

    <h2>Hébergement</h2>
    <p>
      Le site est hébergé en Suisse par {{ HOST.name }}, {{ HOST.address }}
      (téléphone {{ HOST.phone }},
      <a :href="HOST.website" rel="noopener" target="_blank">infomaniak.com</a>),
      sur un serveur privé virtuel.
    </p>
    <p>
      Les comptes utilisateurs et leur progression sont stockés par Firebase,
      service de Google LLC, 1600 Amphitheatre Parkway, Mountain View, CA 94043,
      États-Unis — voir la
      <RouterLink :to="{ name: 'privacy' }">politique de confidentialité</RouterLink>.
    </p>

    <h2>Activité</h2>
    <p>
      Leggendo est un service gratuit d'apprentissage de l'italien par la
      lecture. Il ne vend rien et n'affiche aucune publicité.
    </p>

    <h2>Propriété intellectuelle</h2>
    <p>
      Les textes, traductions, enregistrements audio, l'interface et le code du
      site sont protégés par le droit d'auteur. Les œuvres classiques du
      domaine public restent libres ; leurs adaptations, annotations et
      traductions publiées ici sont la propriété de l'éditeur. Toute
      reproduction ou diffusion en dehors d'un usage personnel ou
      pédagogique, sans autorisation écrite préalable, est interdite, à
      l'exception des courtes citations avec mention de la source.
    </p>

    <h2>Contenus</h2>
    <p>
      Les traductions et explications sont relues avec soin mais peuvent
      contenir des erreurs : signalez-les via la page
      <RouterLink :to="{ name: 'contact' }">Contact</RouterLink>, nous les
      corrigeons.
    </p>

    <h2>Droit applicable</h2>
    <p>
      Le site est édité depuis la Suisse et soumis au droit suisse. Ces
      informations sont fournies conformément à l'article 3 al. 1 let. s de la
      loi fédérale contre la concurrence déloyale (LCD) et, pour les visiteurs
      résidant en France, à la loi pour la confiance dans l'économie numérique
      (LCEN). Les règles impératives qui protègent les consommateurs dans leur
      pays de résidence restent applicables.
    </p>
  </SceneLayout>
</template>
