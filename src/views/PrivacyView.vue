<script setup>
import SceneLayout from '../components/SceneLayout.vue'
</script>

<template>
  <SceneLayout title="Riservat" accent="ezza" tagline="Confidentialité">
    <p class="hint">Dernière mise à jour : 22 juillet 2026</p>

    <h2>1. Données collectées</h2>
    <p>
      Lorsque vous créez un compte, nous collectons votre adresse e-mail et,
      le cas échéant, votre nom d'affichage. Sans compte, aucune donnée
      personnelle n'est collectée par nos soins.
    </p>

    <h2>2. Finalité</h2>
    <p>
      Ces données servent uniquement à gérer votre compte, votre progression
      de lecture et, le cas échéant, votre abonnement. Elles ne sont jamais
      vendues ni transmises à des tiers à des fins commerciales.
    </p>

    <h2>3. Sous-traitants</h2>
    <ul>
      <li>
        <strong>Firebase / Google LLC</strong> — hébergement et
        authentification.
      </li>
      <li>
        <strong>Stripe, Inc.</strong> — traitement des paiements. Vos données
        bancaires sont traitées exclusivement par Stripe ; nous n'y avons
        jamais accès.
      </li>
    </ul>

    <h2>4. Cookies et stockage local</h2>
    <p>
      Le site utilise le stockage local de votre navigateur pour mémoriser
      vos préférences de lecture et permettre le fonctionnement hors ligne
      (PWA). Aucun cookie publicitaire ou de suivi n'est utilisé.
    </p>

    <h2>5. Conservation et suppression</h2>
    <p>
      Vos données sont conservées tant que votre compte est actif. Vous
      pouvez demander la suppression de votre compte et de vos données à tout
      moment en écrivant à
      <a href="mailto:lberthod@gmail.com">lberthod@gmail.com</a>.
    </p>

    <h2>6. Vos droits</h2>
    <p>
      Conformément à la loi fédérale suisse sur la protection des données
      (nLPD) et au RGPD, vous disposez d'un droit d'accès, de rectification,
      de suppression et de portabilité de vos données.
    </p>
  </SceneLayout>
</template>
