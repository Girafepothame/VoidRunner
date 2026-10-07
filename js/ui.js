import { meta } from './meta.js';
import * as gameplay from './gameplay.js';

let shopReturnState = 'menu';
let waveBannerTimer = 0;

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

export function setHudVisible(visible){
  const hud = document.getElementById('hud');
  if(hud) hud.classList.toggle('hidden', !visible);
}

export function renderMenuScrap(){
  const el = document.getElementById('menu-scrap');
  if(el) el.innerText = meta.scrap;
}

export function openShop(from){
  shopReturnState = from;
  buildShopList();
  showScreen('shop-screen');
  gameplay.enterShop();
}

export function closeShop(){
  renderMenuScrap();
  if(shopReturnState === 'gameover'){
    showScreen('gameover-screen');
    gameplay.exitShop(shopReturnState);
  } else {
    showScreen('menu-screen');
    gameplay.exitShop(shopReturnState);
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
  if(!gameplay.enterDebug()) return;
  buildDebugList();
  showScreen('debug-screen');
  const hud = document.getElementById('hud');
  if(hud) hud.classList.add('hidden');
}

export function closeDebugMenu(){
  if(!gameplay.exitDebug()) return;
  showScreen(null);
  setHudVisible(true);
}

export function buildDebugList(){
  const list = document.getElementById('debug-list');
  if(!list || !gameplay.hasPlayer()) return;
  list.innerHTML = '<div class="shop-row"><div class="info"><div class="name">Mode débogage</div><div class="desc">Les objets et emplacements d’équipement sont désactivés ; seules les améliorations de niveau restent actives.</div></div></div>';
}

export function renderLevelUp(cards, upgradeCounts, onSelect){
  const container = document.getElementById('cards-container');
  if(!container) return;
  container.innerHTML = '';
  cards.forEach(upgrade => {
    const level = upgradeCounts[upgrade.id] || 0;
    const disabled = upgrade.max === 1 && level >= upgrade.max;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="icon">${upgrade.icon}</div><div class="name">${upgrade.name}</div><div class="desc">${upgrade.desc}</div><div class="lvl">Niveau ${level} → ${level+1}</div>`;
    card.onclick = () => {
      if(!disabled) onSelect(upgrade);
    };
    container.appendChild(card);
  });
  showScreen('levelup-screen');
}

export function flashWaveBanner(txt){
  const b = document.getElementById('wave-banner');
  if(b){
    b.innerText = txt;
    b.style.opacity = 1;
  }
  waveBannerTimer = 90;
}

export function renderGameOver(score, earned){
  const goScore = document.getElementById('go-score');
  if(goScore) goScore.innerText = score;
  const goScrap = document.getElementById('go-scrap');
  if(goScrap) goScrap.innerText = '+' + earned;
  showScreen('gameover-screen');
}

export function tickWaveBannerTimer(){
  if(waveBannerTimer <= 0) return 0;
  waveBannerTimer--;
  if(waveBannerTimer < 20){
    const banner = document.getElementById('wave-banner');
    if(banner) banner.style.opacity = waveBannerTimer / 20;
  }
  return waveBannerTimer;
}
