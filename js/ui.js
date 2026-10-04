import { meta } from './meta.js';
import * as gameplay from './gameplay.js';

export function showScreen(id){
  ['menu-screen','levelup-screen','gameover-screen','shop-screen','pause-screen','debug-screen']
    .forEach(s => {
      const el = document.getElementById(s);
      if(el) el.classList.add('hidden');
    });
  if(id){
    const el = document.getElementById(id);
    if(el) el.classList.remove('hidden');
  }
}

export function renderMenuScrap(){
  const el = document.getElementById('menu-scrap');
  if(el) el.innerText = meta.scrap;
}

export function openShop(from){
  gameplay.setShopReturnState(from);
  buildShopList();
  showScreen('shop-screen');
  gameplay.setGameState('shop');
}

export function closeShop(){
  renderMenuScrap();
  if(gameplay.getShopReturnState() === 'gameover'){
    showScreen('gameover-screen');
    gameplay.setGameState('gameover');
  } else {
    showScreen('menu-screen');
    gameplay.setGameState('menu');
  }
}

export function buildShopList(){
  const shopScrap = document.getElementById('shop-scrap');
  if(shopScrap) shopScrap.innerText = meta.scrap;
  const list = document.getElementById('shop-list');
  if(!list) return;
  list.innerHTML = '<div class="shop-row"><div class="info"><div class="name">Améliorations</div><div class="desc">Les gains de puissance arrivent uniquement au moment du level up.</div></div></div>';
}

export function openDebugMenu(){
  if(gameplay.gameState !== 'playing' && gameplay.gameState !== 'paused') return;
  buildDebugList();
  gameplay.setGameState('debug');
  showScreen('debug-screen');
  const hud = document.getElementById('hud');
  if(hud) hud.classList.add('hidden');
}

export function closeDebugMenu(){
  if(gameplay.gameState !== 'debug') return;
  gameplay.setGameState('playing');
  showScreen(null);
  const hud = document.getElementById('hud');
  if(hud) hud.classList.remove('hidden');
}

export function buildDebugList(){
  const list = document.getElementById('debug-list');
  if(!list || !gameplay.player) return;
  list.innerHTML = '<div class="shop-row"><div class="info"><div class="name">Mode débogage</div><div class="desc">Les objets et emplacements d’équipement sont désactivés ; seules les améliorations de niveau restent actives.</div></div></div>';
}

export function flashWaveBanner(txt){
  const b = document.getElementById('wave-banner');
  if(b){
    b.innerText = txt;
    b.style.opacity = 1;
  }
  gameplay.setWaveBannerTimer(90);
}
