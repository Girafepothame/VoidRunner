# Architecture MVC

## Model

- `model/entities/` contient les classes du jeu, regroupees par domaine.
- `meta.js`, `equipment.js`, `chunks.js` portent les donnees et regles independantes de l'interface.
- `data/game.json` contient la configuration statique.

Les fichiers de domaine (`combat.js`, `pickups.js`, etc.) sont les sources uniques des classes. Il n'y a pas de doublon entre fichiers majuscules et minuscules.

## Controller

- `gameplay.js` orchestre la run : etat, mouvement, spawn, collisions, progression et inventaire.
- `main.js` adapte p5.js et les entrees clavier/souris au controleur.

## View

- `ui.js` gere les ecrans DOM, l'atelier, l'inventaire et les tooltips.
- Les entites conservent pour l'instant leur methode `draw()` afin de garder le rendu p5.js stable pendant la separation du modele.

## Regle de dependance

Les nouveaux modules doivent suivre ce sens :

`main.js` -> controleur/UI -> modele/configuration

Le modele ne doit pas importer `gameplay.js` ou `ui.js`.
