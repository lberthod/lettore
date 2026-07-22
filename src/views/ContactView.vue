<script setup>
import { ref } from 'vue'
import SceneLayout from '../components/SceneLayout.vue'

const name = ref('')
const email = ref('')
const message = ref('')

// Sans backend : ouvre le client mail avec le message pré-rempli
function send() {
  const subject = encodeURIComponent(`[Leggendo] Message de ${name.value || 'un visiteur'}`)
  const body = encodeURIComponent(`${message.value}\n\n— ${name.value} (${email.value})`)
  window.location.href = `mailto:lberthod@gmail.com?subject=${subject}&body=${body}`
}
</script>

<template>
  <SceneLayout title="Cont" accent="atto" tagline="Contact" narrow>
    <p>
      Une question, un bug, une idée de texte ? Écrivez-nous, nous répondons
      généralement sous 48 heures.
    </p>

    <form class="form" @submit.prevent="send">
      <label>
        Votre nom
        <input v-model="name" type="text" required autocomplete="name" />
      </label>
      <label>
        Votre e-mail
        <input v-model="email" type="email" required autocomplete="email" />
      </label>
      <label>
        Message
        <textarea v-model="message" rows="6" required></textarea>
      </label>
      <button class="btn-primary" type="submit">Envoyer</button>
      <p class="hint">
        L'envoi ouvre votre application de messagerie. Vous pouvez aussi nous
        écrire directement à
        <a href="mailto:lberthod@gmail.com">lberthod@gmail.com</a>.
      </p>
    </form>
  </SceneLayout>
</template>
