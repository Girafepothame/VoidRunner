import { MOD_DEFS, meta, modCost } from './meta.js';
import * as gameplay from './gameplay.js';

// UI helpers: screens, shop, shop list
export function showScreen(id){ ['menu-screen','levelup-screen','gameover-screen','shop-screen','pause-screen','debug-screen'].forEach(s=>{ const el = document.getElementById(s); if(el) el.classList.add('hidden'); }); if(id){ const el = document.getElementById(id); if(el) el.classList.remove('hidden'); } }
export function renderMenuScrap(){ const el = document.getElementById('menu-scrap'); if(el) el.innerText = meta.scrap; }
export function openShop(from){ gameplay.setShopReturnState(from); buildShopList(); showScreen('shop-screen'); gameplay.setGameState('shop'); }
export function closeShop(){ renderMenuScrap(); if(gameplay.getShopReturnState() === 'gameover'){ showScreen('gameover-screen'); gameplay.setGameState('gameover'); } else { showScreen('menu-screen'); gameplay.setGameState('menu'); } }
export function buildShopList(){
	const shopScrap = document.getElementById('shop-scrap');
	if(shopScrap) shopScrap.innerText = meta.scrap;
	const list = document.getElementById('shop-list'); if(!list) return;
	list.innerHTML = '';
	MOD_DEFS.filter(mod => mod.common).forEach(mod => {
		const level = meta.mods[mod.id];
		const maxed = level >= mod.max;
		const cost = modCost(mod);
		const row = document.createElement('div'); row.className = 'shop-row';
		row.innerHTML = `<div class="info"><div class="name">${mod.name}</div><div class="desc">${mod.desc}</div><div class="pips">${'●'.repeat(level)}${'○'.repeat(mod.max-level)}</div></div><button class="btn buy" ${maxed || meta.scrap < cost ? 'disabled':''}>${maxed ? 'MAX' : cost+' ⛁'}</button>`;
		const btn = row.querySelector('.buy');
		if(btn) btn.onclick = () => {
			if(maxed || meta.scrap < cost) return;
			meta.scrap -= cost; meta.mods[mod.id] += 1; buildShopList();
		};
		list.appendChild(row);
	});
}

export function openDebugMenu(){
	if(gameplay.gameState !== 'playing' && gameplay.gameState !== 'paused') return;
	buildDebugList(); gameplay.setGameState('debug'); showScreen('debug-screen');
	const hud = document.getElementById('hud'); if(hud) hud.classList.add('hidden');
}

export function closeDebugMenu(){
	if(gameplay.gameState !== 'debug') return;
	gameplay.setGameState('playing'); showScreen(null);
	const hud = document.getElementById('hud'); if(hud) hud.classList.remove('hidden');
}

export function buildDebugList(){
	const list = document.getElementById('debug-list');
	if(!list || !gameplay.player) return;
	list.innerHTML = '';
	MOD_DEFS.forEach(upgrade => {
		const level = gameplay.player.upgradeCounts[upgrade.id] || 0;
		const row = document.createElement('div'); row.className = 'shop-row';
		row.innerHTML = `<div class="info"><div class="name">${upgrade.name}</div><div class="desc">${upgrade.desc}</div><div class="pips">Niveau ${level}/${upgrade.max}</div></div><button class="btn buy">Ajouter</button>`;
		row.querySelector('.buy').onclick = () => {
			const currentLevel = gameplay.player.upgradeCounts[upgrade.id] || 0;
			if(currentLevel >= upgrade.max) return;
			upgrade.apply(gameplay.player); gameplay.player.upgradeCounts[upgrade.id] = currentLevel + 1;
			gameplay.refreshTurrets();
			buildDebugList();
		};
		list.appendChild(row);
	});
}

export function flashWaveBanner(txt){ const b = document.getElementById('wave-banner'); if(b){ b.innerText = txt; b.style.opacity = 1; } gameplay.setWaveBannerTimer(90); }
