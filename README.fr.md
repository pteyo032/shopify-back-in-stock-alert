<p align="right"><a href="README.md">Read in English</a></p>

# Shopify Back in Stock Alert — popup automatique "prévenez-moi"

Un panneau "prévenez-moi" intégré au thème, pour les pages produit Shopify :
dès que le client sélectionne une variante en rupture de stock, un panneau
100% custom s'ouvre tout seul — pas besoin de cliquer sur un bouton — pour
lui laisser la possibilité d'être prévenu par email quand elle revient.

Conçu pour le thème **Shopify Horizon**. Aucun backend à héberger soi-même —
le panneau est 100% votre propre design, le stockage et l'envoi de l'email
sont délégués à l'API d'une app tierce (facilement remplaçable, voir
`docs/integration-guide.md`).

| Panneau ouvert (mobile) | Confirmation |
|---|---|
| ![Panneau bottom-sheet ouvert sur la page produit après sélection d'une variante en rupture, montrant l'image du produit, la variante, le champ email et la case de consentement](docs/screenshots/mobile-panel-open.png) | ![État de confirmation après soumission : coche verte, message de confirmation, infos produit, et un bouton continuer mes achats](docs/screenshots/mobile-confirmation.png) |

## Fonctionnalités

- S'ouvre automatiquement à la sélection d'une variante — panneau plein
  hauteur ancré à droite sur desktop, bottom-sheet à la hauteur de son
  contenu sur mobile, fond assombri dans les deux cas
- La disponibilité est lue depuis le rendu déjà calculé par Liquid, jamais
  recalculée en JavaScript — aucun risque de divergence avec la vraie source
  de vérité du thème (voir `docs/gotchas.md`, point 2)
- Textes entièrement configurables depuis l'éditeur de thème : titre de la
  popup, bouton d'envoi, texte de consentement, message de confirmation
- Entièrement bilingue dès le départ (anglais + français) ; ajoutez d'autres
  langues en étendant les fichiers de locale
- Accessible : `<dialog>` natif avec gestion du focus, zone de statut
  `aria-live`, fermeture au clavier/Échap/clic extérieur gérées nativement
  par la plateforme

## Bonus : intégration avec le Bundle Selector

Améliore aussi [shopify-bundle-selector](https://github.com/pteyo032/shopify-bundle-selector) :
si une ou plusieurs unités d'un palier de bundle sélectionné sont en rupture,
cliquer sur "Ajouter au panier" ouvre ce même panneau avec la liste de tous
les articles indisponibles — un seul email couvre tout — au lieu d'une erreur
générique.

| Palier de bundle avec une unité en rupture |
|---|
| ![Palier "Acheter 3" du Bundle Selector avec une unité réglée sur une variante en rupture, popup back-in-stock-alert ouverte montrant cet article](docs/screenshots/bundle-integration.png) |

## Contenu du repo

Ce repo contient **uniquement le code custom de cette fonctionnalité** — pas
le thème Horizon complet, qui appartient à Shopify. Ces fichiers se déposent
dans un thème Horizon (ou dérivé) existant.

| Chemin | Ce que c'est |
|---|---|
| `blocks/back-in-stock-alert.liquid` | Le bloc — markup (vue simple et vue liste multi-articles), réglages, CSS co-localisé |
| `assets/back-in-stock-alert.js` | Le web component `<back-in-stock-alert-component>` — écoute les changements de variante, ouvre/ferme le panneau, gère la soumission |
| `assets/bundle-selector.js` | Version améliorée du fichier du repo sœur — optionnel, utile seulement si vous utilisez aussi le Bundle Selector |
| `locales/*.json`, `locales/*.schema.json` | Traductions anglais + français (textes storefront et labels de l'éditeur) |
| `docs/integration-guide.md` | Instructions d'installation étape par étape, y compris le branchement d'un vrai backend de notification |
| `docs/gotchas.md` | Pièges techniques rencontrés en construisant ça, pour ne pas les redécouvrir |

## Démarrage rapide

1. Copiez `blocks/back-in-stock-alert.liquid` et `assets/back-in-stock-alert.js`
   dans votre thème.
2. Ajoutez les clés de traduction de `locales/` à vos propres fichiers de locale.
3. Ajoutez le bloc **Back in Stock Alert** sur votre page produit depuis
   l'éditeur de thème.
4. Branchez un vrai backend pour le stockage + l'envoi d'email — voir
   `docs/integration-guide.md`, étape 5. C'est le seul point que chaque
   boutique doit trancher elle-même.

## Limite connue : un thème seul ne peut pas faire ça

Un thème ne peut pas stocker des demandes "prévenez-moi" ni envoyer des
emails en toute sécurité par lui-même — écrire ces données demanderait
d'exposer un token Admin API dans du JavaScript public, que n'importe qui
pourrait voler pour modifier les données de la boutique. Ce bloc construit
tout le front-end ; il faut quand même un backend (l'API d'une app tierce, ou
le vôtre) pour réellement stocker les demandes et envoyer la notification.
Voir `docs/integration-guide.md` pour les compromis.

## Licence

MIT — voir `LICENSE`.
