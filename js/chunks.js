// chunks.js — Génération procédurale du monde infini par chunks
// Principe : le monde est découpé en carrés (CHUNK_SIZE). Chaque chunk génère
// son contenu (astéroïdes, caches de scrap) de façon déterministe à partir de
// ses coordonnées + une seed globale. Les chunks proches du joueur sont
// chargés, les autres sont déchargés (et leurs entités retirées du jeu).
import { Asteroid, ScrapPickup } from './entities.js';

export const CHUNK_SIZE = 2000;   // taille d'un chunk, en unités monde
const LOAD_RADIUS = 2;            // rayon (en chunks) chargé autour du joueur
const UNLOAD_MARGIN = 1;          // marge avant déchargement (évite le flicker au bord)
const WORLD_SEED = 20240521;      // change cette valeur pour un monde différent

// --- RNG déterministe basé sur les coordonnées du chunk ---
// Permet de régénérer EXACTEMENT le même contenu si on revisite un chunk
// déjà déchargé (tant qu'il n'a pas d'état persistant sauvegardé ailleurs).
function hashToUnitFloat(x, y, seed) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296; // -> [0, 1)
}

// "salt" permet de tirer plusieurs valeurs indépendantes pour un même chunk
function chunkRandom(cx, cy, salt = 0) {
  return hashToUnitFloat(cx * 92821 + salt * 7919, cy * 68917 + salt * 104729, WORLD_SEED);
}

class Chunk {
  constructor(cx, cy) {
    this.cx = cx;
    this.cy = cy;
    this.key = `${cx},${cy}`;
    this.worldX = cx * CHUNK_SIZE;
    this.worldY = cy * CHUNK_SIZE;
    this.generated = false;
    this.entities = []; // entités créées par ce chunk (à retirer au déchargement)
  }

  generate() {
    if (this.generated) return;

    // Distance à l'origine -> sert de curseur de "richesse/danger" du terrain,
    // indépendant du système de vagues (qui reste géré par gameplay.js).
    const dist = Math.hypot(this.cx, this.cy);
    const density = Math.min(1, dist / 8);

    // --- Champ d'astéroïdes ---
    const nbAsteroids = Math.floor(2 + chunkRandom(this.cx, this.cy, 1) * (4 + density * 6));
    for (let i = 0; i < nbAsteroids; i++) {
      const x = this.worldX + chunkRandom(this.cx, this.cy, 100 + i) * CHUNK_SIZE;
      const y = this.worldY + chunkRandom(this.cx, this.cy, 200 + i) * CHUNK_SIZE;
      const r = 18 + chunkRandom(this.cx, this.cy, 300 + i) * 24;
      const rewardType = chunkRandom(this.cx, this.cy, 400 + i) < 0.5 ? 'xp' : 'scrap';
      const hp = Math.round(10 + density * 20);

      const asteroid = new Asteroid({
        x, y,
        vx: (chunkRandom(this.cx, this.cy, 500 + i) - 0.5) * 0.4,
        vy: (chunkRandom(this.cx, this.cy, 600 + i) - 0.5) * 0.4,
        r, hp, maxHp: hp, rewardType,
        reward: Math.max(1, Math.round(r / 8)),
      });
      asteroid._chunkKey = this.key; // tag : permet de le retirer au déchargement du chunk
      this.entities.push({ kind: 'asteroid', obj: asteroid });
    }

    // --- Cache de scrap rare, plus fréquent loin du centre ---
    if (density > 0.4 && chunkRandom(this.cx, this.cy, 2) < 0.15) {
      const x = this.worldX + chunkRandom(this.cx, this.cy, 700) * CHUNK_SIZE;
      const y = this.worldY + chunkRandom(this.cx, this.cy, 800) * CHUNK_SIZE;
      const pickup = new ScrapPickup(x, y, Math.round(20 + density * 40));
      pickup._chunkKey = this.key;
      this.entities.push({ kind: 'pickup', obj: pickup });
    }

    this.generated = true;
  }
}

export class ChunkManager {
  constructor() {
    this.chunks = new Map();
  }

  worldToChunk(x, y) {
    return { cx: Math.floor(x / CHUNK_SIZE), cy: Math.floor(y / CHUNK_SIZE) };
  }

  // Vide tous les chunks chargés (à appeler au (re)démarrage d'une run)
  reset() {
    this.chunks.clear();
  }

  // À appeler une fois par frame avec la position du joueur.
  // Renvoie les entités nouvellement générées à ajouter aux tableaux globaux,
  // et les clés des chunks déchargés (pour retirer leurs entités).
  update(playerX, playerY) {
    const { cx: pcx, cy: pcy } = this.worldToChunk(playerX, playerY);
    const spawnedAsteroids = [];
    const spawnedPickups = [];

    for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx++) {
      for (let dy = -LOAD_RADIUS; dy <= LOAD_RADIUS; dy++) {
        const cx = pcx + dx;
        const cy = pcy + dy;
        const key = `${cx},${cy}`;
        if (this.chunks.has(key)) continue;

        const chunk = new Chunk(cx, cy);
        chunk.generate();
        this.chunks.set(key, chunk);

        for (const e of chunk.entities) {
          if (e.kind === 'asteroid') spawnedAsteroids.push(e.obj);
          else spawnedPickups.push(e.obj);
        }
      }
    }

    const unloadDist = LOAD_RADIUS + UNLOAD_MARGIN;
    const unloadedKeys = [];
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - pcx) > unloadDist || Math.abs(chunk.cy - pcy) > unloadDist) {
        unloadedKeys.push(key);
        this.chunks.delete(key);
      }
    }

    return { spawnedAsteroids, spawnedPickups, unloadedKeys };
  }
}

// Instance unique partagée par tout le jeu
export const chunkManager = new ChunkManager();