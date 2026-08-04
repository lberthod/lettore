import { Capacitor } from '@capacitor/core'

// Constante unique de branchement natif/web, réutilisée par tout le chrome
// d'app (SiteHeader/SiteFooter masqués, NativeTabBar, accueil natif…) au
// lieu de réimporter Capacitor dans chaque composant — voir
// « Optimisation Mobile.md » § Principe directeur.
export const isNativeApp = Capacitor.isNativePlatform()

// Classe posée une fois pour toutes sur <html> : permet au CSS global
// (App.vue, style.css) de réserver l'espace de la barre d'onglets sans
// dépendre d'un composant Vue monté à temps.
if (isNativeApp) document.documentElement.classList.add('native-app')
