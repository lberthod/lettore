<script setup>
import SceneLayout from '../components/SceneLayout.vue'
</script>

<template>
  <SceneLayout title="Note leg" accent="ali" tagline="Mentions légales">
    <h2>Éditeur du site</h2>
    <p>
      Leggendo<br />
      Loïc Berthod<br />
      Suisse<br />
      Contact : <a href="mailto:lberthod@gmail.com">lberthod@gmail.com</a>
    </p>

    <h2>Hébergement</h2>
    <p>
      Ce site (elgendo.ch) est hébergé par Infomaniak Network SA,<br />
      Rue Eugène-Marziano 25, 1227 Les Acacias, Genève, Suisse.
    </p>
    <p>
      La base de données est hébergée par Firebase (Google LLC), 1600 Amphitheatre
      Parkway, Mountain View, CA 94043, États-Unis.
    </p>
    <p>
      La génération de textes est assurée par un serveur VPS Infomaniak, en
      s'appuyant sur des modèles de langage tiers (GLM, DeepSeek ou Kimi).
    </p>

    <h2>Propriété intellectuelle</h2>
    <p>
      L'ensemble des contenus de ce site (textes, interface, code) est protégé
      par le droit d'auteur. Toute reproduction ou diffusion sans autorisation
      préalable est interdite.
    </p>

    <h2>Responsabilité</h2>
    <p>
      Les traductions et contenus pédagogiques sont fournis à titre indicatif,
      sans garantie d'exhaustivité ni d'exactitude. L'éditeur ne saurait être
      tenu responsable des dommages résultant de l'utilisation du site.
    </p>

    <h2>Droit applicable</h2>
    <p>
      Le présent site est soumis au droit suisse. Tout litige relève des
      tribunaux compétents du canton du Valais, Suisse.
    </p>
  </SceneLayout>
</template>
