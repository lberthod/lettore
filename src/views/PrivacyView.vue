<script setup>
import SceneLayout from '../components/SceneLayout.vue'
</script>

<template>
  <SceneLayout title="Riservat" accent="ezza" tagline="Confidentialité">
    <p class="hint">Dernière mise à jour : 24 juillet 2026</p>

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

    <h2>4. Partage public (formule Enseignant)</h2>
    <p>
      Les abonnés Enseignant peuvent générer une URL publique pour partager un
      texte créé. Toute personne disposant de ce lien peut consulter le texte
      sans créer de compte Leggendo ; aucune donnée n'est collectée auprès de
      ces visiteurs. Seul le titulaire du compte reste responsable du contenu
      qu'il choisit de partager.
    </p>

    <h2>5. Cookies et stockage local</h2>
    <p>
      Le site utilise le stockage local de votre navigateur pour mémoriser
      vos préférences de lecture et permettre le fonctionnement hors ligne
      (PWA). Aucun cookie publicitaire ou de suivi n'est utilisé.
    </p>

    <h2>6. Conservation et suppression</h2>
    <p>
      Vos données sont conservées tant que votre compte est actif. Vous
      pouvez supprimer vous-même votre compte et vos données à tout moment
      depuis la page « Mon profil » (suppression immédiate et définitive :
      textes créés, progression et compte), ou en écrivant à
      <a href="mailto:lberthod@gmail.com">lberthod@gmail.com</a>. La
      suppression du compte ne résilie pas automatiquement un abonnement
      Stripe en cours — contactez-nous pour l'annuler.
    </p>

    <h2>7. Vos droits</h2>
    <p>
      Conformément à la loi fédérale suisse sur la protection des données
      (nLPD) et au RGPD, vous disposez d'un droit d'accès, de rectification,
      de suppression et de portabilité de vos données.
    </p>
  </SceneLayout>
</template>
