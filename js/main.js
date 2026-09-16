// Main p5 glue: setup, draw and input handlers (module entry)
import { gameState, updateRun, drawEntities, updateHUD, startRun } from './gameplay.js';
import { renderMenuScrap, showScreen, openShop, closeShop, openDebugMenu, closeDebugMenu } from './ui.js';
import * as gameplay from './gameplay.js';

const starLayers = [
	{ depth: 0.12, size: 1, alpha: 90, count: 90, stars: [] },
	{ depth: 0.28, size: 1.5, alpha: 145, count: 65, stars: [] },
	{ depth: 0.5, size: 2, alpha: 220, count: 38, stars: [] }
];
let starSeed = 2408;

function nextStarRandom(){
	starSeed = (starSeed * 1664525 + 1013904223) >>> 0;
	return starSeed / 4294967296;
}

function createStarfield(){
	starLayers.forEach(layer => {
		layer.stars = Array.from({ length: layer.count }, () => ({
			x: nextStarRandom() * width, y: nextStarRandom() * height, brightness: 0.65 + nextStarRandom() * 0.5
		}));
	});
}

function drawStarfield(){
	noStroke();
	for(const layer of starLayers){
		fill(180, 220, 255, layer.alpha);
		for(const star of layer.stars){
			const x = ((star.x - gameplay.camX * layer.depth) % width + width) % width;
			const y = ((star.y - gameplay.camY * layer.depth) % height + height) % height;
			circle(x, y, layer.size * star.brightness);
		}
	}
}

function _setup(){
	// Évite de dessiner à 2x/3x de pixels sur écrans HiDPI (Retina, etc.) :
	// p5 utilise window.devicePixelRatio par défaut, ce qui peut quadrupler
	// (ou plus) le nombre de pixels réellement rasterisés chaque frame sans
	// gain visuel perceptible pour ce style de rendu. Gros gain gratuit.
	pixelDensity(1);
	const c = createCanvas(windowWidth, windowHeight); c.parent('game-container'); c.style('position','absolute'); c.style('top','0'); c.style('left','0'); c.style('z-index','0'); textFont('Consolas, Menlo, monospace'); createStarfield(); renderMenuScrap();
}
function _windowResized(){ resizeCanvas(windowWidth, windowHeight); }
// Nombre de frames "sautées" pour la logique de jeu quand l'inventaire est
// ouvert : le jeu continue de tourner (ce n'est pas une vraie pause) mais
// au ralenti, pour laisser réorganiser son équipement sous une pression
// réduite plutôt que nulle. Le rendu, lui, reste appelé chaque frame.
const INVENTORY_SLOWDOWN = 6;

function _draw(){ background(6,9,18); drawStarfield();
	// translate world camera
	push(); translate(-gameplay.camX, -gameplay.camY);
	if(gameplay.gameState === 'playing'){
		const shouldUpdate = !gameplay.inventoryOpen || (frameCount % INVENTORY_SLOWDOWN === 0);
		if(shouldUpdate) gameplay.updateRun();
		gameplay.drawEntities();
	}
	else if(gameplay.gameState !== 'menu'){ gameplay.drawEntities(); }
	pop();
	if(gameplay.gameState === 'playing'){ gameplay.drawEnemyIndicators(); gameplay.drawPortalIndicator(); }
	if(gameplay.gameState === 'playing' && !gameplay.inventoryOpen){ gameplay.drawCrosshair(); noCursor(); }
	else { cursor(); }
	// HUD and overlays
	if(gameplay.gameState === 'playing'){ gameplay.updateHUD(); }
	if(gameplay.getWaveBannerTimer() > 0){ gameplay.tickWaveBannerTimer(); if(gameplay.getWaveBannerTimer() < 20){ const wb = document.getElementById('wave-banner'); if(wb) wb.style.opacity = gameplay.getWaveBannerTimer()/20; } }
}


// Input bindings
function _mousePressed(){ return false; }
function _keyPressed(){
	if(key === 'F3'){
		if(gameplay.gameState === 'debug') closeDebugMenu();
		else openDebugMenu();
		return false;
	}
	if(key === 'i' || key === 'I'){
		gameplay.toggleInventory();
		return false;
	}
	if(key === 'Escape'){
		if(gameplay.inventoryOpen){ gameplay.toggleInventory(); return false; }
		if(gameplay.gameState === 'playing') gameplay.pauseRun();
		else if(gameplay.gameState === 'paused') gameplay.resumeRun();
		return false;
	}
	const lower = key.toLowerCase();
	// Double-tap Z/S/Q/D -> dash (voir registerDirectionTap). On ne compte
	// une "frappe" que sur une vraie transition relâché->appuyé : sans ce
	// garde-fou, l'auto-répétition du clavier pendant qu'on maintient la
	// touche déclencherait des dashs en continu.
	if(['z','s','q','d'].includes(lower) && !gameplay.keys[lower]){
		gameplay.registerDirectionTap(lower);
	}
	if(typeof gameplay.keys !== 'undefined') gameplay.keys[lower] = true;
	return false;
}
function _keyReleased(){ if(typeof gameplay.keys !== 'undefined') gameplay.keys[key.toLowerCase()] = false; return false; }
// Wire p5 global callbacks to module functions
window.setup = _setup; window.windowResized = _windowResized; window.draw = _draw;
window.mousePressed = _mousePressed; window.keyPressed = _keyPressed; window.keyReleased = _keyReleased;

// Expose startRun/openShop on window so buttons still work
window.startRun = gameplay.startRun; window.showScreen = showScreen; window.openShop = openShop; window.closeShop = closeShop;
window.resumeRun = gameplay.resumeRun; window.quitToMenu = gameplay.quitToMenu; window.closeDebugMenu = closeDebugMenu;