# Architecture MVC

## Model

- `model/entities/` contient les classes du jeu, regroupees par domaine.
- `meta.js` et `chunks.js` portent les donnees et regles independantes de l'interface.
- `data/game.json` contient la configuration statique.

Les fichiers de domaine (`combat.js`, `pickups.js`, etc.) sont les sources uniques des classes. Il n'y a pas de doublon entre fichiers majuscules et minuscules.

## Controller

- `gameplay.js` orchestre la run et relie ses modules de domaine ; les mises a jour DOM passent par des actions d'interface injectees.
- `gameplay/player-controller.js` gere le deplacement, le dash et leurs effets, a partir de dependances fournies par le controleur.
- `gameplay/world-controller.js` gere la difficulte, les apparitions, les chunks et la mise a jour des ennemis et asteroides.
- `gameplay/combat-controller.js` gere les projectiles, les collisions, les degats et leurs effets.
- `gameplay/progression-controller.js` gere l'XP, les recompenses, la collecte et l'application des ameliorations ; le controleur principal conserve leur presentation DOM.
- `gameplay/player-weapon-controller.js` gere la visee assistee, les tirs, le laser et le rechargement.
- Les collections de run et les etats internes restent prives a `gameplay.js` ; les entrees et transitions sont exposees sous forme d'actions explicites.
- `main.js` adapte p5.js et les entrees clavier/souris au controleur.
- `main.js` relie les actions d'interface au controleur ; `gameplay.js` n'importe pas `ui.js`.

## View

- `ui.js` gere les ecrans DOM, les cartes de niveau et les choix de progression.
- `view/game-renderer.js` gere le rendu du vaisseau, des entites, du HUD et du reticule ; `gameplay.js` lui transmet un etat de rendu explicite. Les trainees du joueur sont mises a jour par le controleur de joueur a chaque pas de simulation.
- `utils/viewport.js` partage le test de visibilite entre le controleur et le rendu.
- Les entites conservent pour l'instant leur methode `draw()` afin de garder le rendu p5.js stable pendant la separation du modele.

## Regle de dependance

Les nouveaux modules doivent suivre ce sens :

`main.js` -> controleur/UI
`gameplay.js` -> modele/configuration et rendu
`ui.js` -> API du controleur

Le modele ne doit pas importer `gameplay.js` ou `ui.js`.

## Validation

Les tests unitaires des controleurs s'executent avec `node --test tests/controllers.test.js`.
