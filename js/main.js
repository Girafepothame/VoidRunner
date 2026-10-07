// Main p5 glue: setup, draw and input handlers (module entry)
import { renderMenuScrap, renderLevelUp, showScreen, flashWaveBanner, setHudVisible, renderGameOver, tickWaveBannerTimer, openShop, closeShop, openDebugMenu, closeDebugMenu } from './ui.js';
import * as gameplay from './gameplay.js';
import { setShockwaveFrames } from './model/entities/effects.js';

gameplay.setUIActions({ showScreen, flashWaveBanner, renderLevelUp, setHudVisible, renderGameOver });

const SHOCKWAVE_FRAME_COUNT = 10;

const starLayers = [
	{ depth: 0.12, size: 1, alpha: 90, count: 90, stars: [] },
	{ depth: 0.28, size: 1.5, alpha: 145, count: 65, stars: [] },
	{ depth: 0.5, size: 2, alpha: 220, count: 38, stars: [] }
];
let starSeed = 2408;
let controlWasDown = false;

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

function positionCursorAmmo(){
 const ammoStack = document.getElementById('cursor-ammo-stack');
 if(ammoStack) {
		 ammoStack.style.left = `${Math.min(mouseX + 20, width - 14)}px`;
		 ammoStack.style.top = `${Math.max(8, Math.min(mouseY - 8, height - 32))}px`;
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
function _preload(){
	const frames = Array.from({ length: SHOCKWAVE_FRAME_COUNT }, (_, index) => {
		const frameName = `frame-${String(index + 1).padStart(2, '0')}.png`;
		const path = `assets/spritesheets/explosion/frames/${frameName}`;
		return loadImage(path, undefined, error => console.error(`Impossible de charger l'image ${path}`, error));
	});
	setShockwaveFrames(frames);
}
function _windowResized(){ resizeCanvas(windowWidth, windowHeight); }
function _draw(){ background(6,9,18); drawStarfield();
	// translate world camera
	push(); translate(-gameplay.camX, -gameplay.camY);
	if(gameplay.getGameState() === 'playing'){
		gameplay.updateRun();
		gameplay.drawEntities();
	}
	else if(gameplay.getGameState() !== 'menu'){ gameplay.drawEntities(); }
	pop();
	if(gameplay.getGameState() === 'playing'){ gameplay.drawEnemyIndicators(); }
	if(gameplay.getGameState() === 'playing'){ gameplay.drawCrosshair(); positionCursorAmmo(); noCursor(); }
	else { cursor(); }
	// HUD and overlays
	if(gameplay.getGameState() === 'playing'){ gameplay.updateHUD(); }
	tickWaveBannerTimer();
}


// Input bindings
function _mousePressed(event){
	const button = event?.button;
	if(button === 2 || (button === undefined && mouseButton === RIGHT)){
		gameplay.setRightMouseDown(true);
		return false;
	}
	if(button === 0 || (button === undefined && mouseButton === LEFT)){
		gameplay.setFireButtonDown(true);
		return false;
	}
	return false;
}
function _mouseReleased(event){
	const button = event?.button;
	if(button === 2 || (button === undefined && mouseButton === RIGHT)) gameplay.setRightMouseDown(false);
	if(button === 0 || (button === undefined && mouseButton === LEFT)) gameplay.setFireButtonDown(false);
	return false;
}
function _keyPressed(){
	if(keyCode === 17){
		if(!controlWasDown){
			controlWasDown = true;
			gameplay.triggerShockwaveAnimation();
		}
		return false;
	}
	if(key === 'F12' || keyCode === 123){
		return true;
	}
	if(key === 'F3'){
		if(gameplay.getGameState() === 'debug') closeDebugMenu();
		else openDebugMenu();
		return false;
	}
	if(key === 'Escape'){
		if(gameplay.getGameState() === 'playing') gameplay.pauseRun();
		else if(gameplay.getGameState() === 'paused') gameplay.resumeRun();
		return false;
	}
	const lower = key.toLowerCase();
	if(lower === 'r') { gameplay.requestPlayerReload(); return false; }
	if(key === ' ' || key === 'Spacebar' || keyCode === 32){ gameplay.requestPlayerDash(); return false; }
	gameplay.setKeyState(lower, true);
	return false;
}
function _keyReleased(){
	if(keyCode === 17) controlWasDown = false;
	gameplay.setKeyState(key, false);
	return false;
}
// Wire p5 global callbacks to module functions
window.preload = _preload; window.setup = _setup; window.windowResized = _windowResized; window.draw = _draw;
window.mousePressed = _mousePressed; window.mouseReleased = _mouseReleased; window.keyPressed = _keyPressed; window.keyReleased = _keyReleased;
window.addEventListener('blur', () => { gameplay.setRightMouseDown(false); gameplay.setFireButtonDown(false); controlWasDown = false; });
window.addEventListener('contextmenu', event => event.preventDefault());

// Expose startRun/openShop on window so buttons still work
window.startRun = gameplay.startRun; window.showScreen = showScreen; window.openShop = openShop; window.closeShop = closeShop;
window.resumeRun = gameplay.resumeRun; window.quitToMenu = gameplay.quitToMenu; window.closeDebugMenu = closeDebugMenu;