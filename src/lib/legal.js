// Identité de l'éditeur et de l'hébergeur, source unique des pages légales
// (LegalView, PrivacyView, TermsView, ContactView, DeleteAccountView) et de
// leur résumé prérendu (src/seo/staticContent.js). Node-safe.
//
// L'adresse de contact n'est PAS l'e-mail administrateur (ADMIN_EMAIL dans
// access.js, functions/roles.mjs et firestore.rules) : celui-là sert à
// l'autorisation et ne doit pas changer sans adapter ces trois fichiers.

export const CONTACT_EMAIL = 'contact@loicberthod.ch'

export const PUBLISHER = {
  name: 'Loïc Berthod',
  form: 'entreprise individuelle inscrite au registre IDE de la Confédération suisse',
  ide: 'CHE-477.357.769',
  ideUrl: 'https://www.uid.admin.ch/Detail.aspx?uid_id=CHE-477.357.769',
  address: 'Route de Nax 43, 3979 Grône, Suisse',
  phone: '+41 78 936 79 79',
  website: 'https://loicberthod.ch',
}

export const HOST = {
  name: 'Infomaniak Network SA',
  address: 'Rue Eugène-Marziano 25, 1227 Les Acacias (Genève), Suisse',
  phone: '+41 22 820 35 44',
  website: 'https://www.infomaniak.com',
}

// Date de dernière mise à jour des pages légales, écrite en toutes lettres
// (jamais via toLocaleDateString : un robot dont la locale est thaïe lisait
// « 2569 E. B. », année du calendrier bouddhique).
export const LEGAL_UPDATED = '22 octobre 2026'
export const LEGAL_UPDATED_ISO = '2026-10-22'
