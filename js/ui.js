import { SLOT_DEFS, meta, nextSlotCost, unlockSlot } from './meta.js';
import { EQUIPMENT_CATEGORIES, rarityById } from './equipment.js';
import * as gameplay from './gameplay.js';

// UI helpers: screens, shop, shop list
export function showScreen(id){ ['menu-screen','levelup-screen','gameover-screen','shop-screen','pause-screen','debug-screen'].forEach(s=>{ const el = document.getElementById(s); if(el) el.classList.add('hidden'); }); if(id){ const el = document.getElementById(id); if(el) el.classList.remove('hidden'); } }
export function renderMenuScrap(){ const el = document.getElementById('menu-scrap'); if(el) el.innerText = meta.scrap; }
export function openShop(from){ gameplay.setShopReturnState(from); buildShopList(); showScreen('shop-screen'); gameplay.setGameState('shop'); }
export function closeShop(){ renderMenuScrap(); if(gameplay.getShopReturnState() === 'gameover'){ showScreen('gameover-screen'); gameplay.setGameState('gameover'); } else { showScreen('menu-screen'); gameplay.setGameState('menu'); } }

// L'atelier vend désormais des DÉBLOCAGES D'EMPLACEMENTS (meta-progression
// permanente) plutôt que des mods appliqués directement : les objets qui
// remplissent ces emplacements se trouvent en run, en battant des mini-boss.
export function buildShopList(){
	const shopScrap = document.getElementById('shop-scrap');
	if(shopScrap) shopScrap.innerText = meta.scrap;
	const list = document.getElementById('shop-list'); if(!list) return;
	list.innerHTML = '';
	Object.keys(SLOT_DEFS).forEach(category => {
		const def = SLOT_DEFS[category];
		const unlocked = meta.unlockedSlots[category] || 0;
		const cost = nextSlotCost(category);
		const maxed = cost === null;
		const row = document.createElement('div'); row.className = 'shop-row';
		row.innerHTML = `<div class="info"><div class="name">${def.name}</div><div class="desc">${def.desc}</div><div class="pips">${'●'.repeat(unlocked)}${'○'.repeat(def.max-unlocked)}</div></div><button class="btn buy" ${maxed || meta.scrap < cost ? 'disabled':''}>${maxed ? 'MAX' : cost+' ⛁'}</button>`;
		const btn = row.querySelector('.buy');
		if(btn) btn.onclick = () => {
			if(unlockSlot(category)) buildShopList();
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

// Menu debug (F3) : ajoute directement de l'équipement à l'inventaire ou
// force le déblocage d'un slot, pour tester le système sans attendre un
// drop de mini-boss ou grinder du scrap.
export function buildDebugList(){
	const list = document.getElementById('debug-list');
	if(!list || !gameplay.player) return;
	list.innerHTML = '';
	Object.keys(EQUIPMENT_CATEGORIES).forEach(category => {
		const def = EQUIPMENT_CATEGORIES[category];
		const row = document.createElement('div'); row.className = 'shop-row';
		row.innerHTML = `<div class="info"><div class="name">${def.label} (objet aléatoire)</div><div class="desc">Ajoute un objet dans l'inventaire, rareté selon le danger courant</div></div><button class="btn buy">Ajouter</button>`;
		row.querySelector('.buy').onclick = () => { gameplay.debugAddEquipment(category); buildDebugList(); };
		list.appendChild(row);
	});
	Object.keys(SLOT_DEFS).forEach(category => {
		const def = SLOT_DEFS[category];
		const unlocked = meta.unlockedSlots[category] || 0;
		const row = document.createElement('div'); row.className = 'shop-row';
		row.innerHTML = `<div class="info"><div class="name">Slot ${def.name}</div><div class="desc">Débloque l'emplacement suivant (${unlocked}/${def.max})</div></div><button class="btn buy" ${unlocked>=def.max?'disabled':''}>Débloquer</button>`;
		row.querySelector('.buy').onclick = () => { gameplay.debugUnlockSlot(category); buildDebugList(); };
		list.appendChild(row);
	});
}

export function flashWaveBanner(txt){ const b = document.getElementById('wave-banner'); if(b){ b.innerText = txt; b.style.opacity = 1; } gameplay.setWaveBannerTimer(90); }

// --- Inventaire en run ----------------------------------------------------
// Overlay semi-transparent (voir styles.css / shootemup.html) : construit
// les 3 rangées de slots équipés (drone/réacteur/coque) + la rangée de
// stockage. Clic sur un objet stocké -> équipe au premier slot débloqué
// libre de sa catégorie. Clic sur un objet équipé -> le retire vers
// l'inventaire (si une place y est libre).
export function buildInventoryUI(){
	const player = gameplay.player;
	if(!player) return;
	hideInventoryTooltip();
	Object.keys(SLOT_DEFS).forEach(category => renderLoadoutRow(category, player));
	renderInventoryStorage(player);
}

function showInventoryTooltip(slot, item, action){
	const tooltip = document.getElementById('inventory-tooltip');
	if(!tooltip || !item) return;
	const def = EQUIPMENT_CATEGORIES[item.category];
	const rarity = rarityById(item.rarityId);
	tooltip.innerHTML = `<div class="tooltip-kicker">${def.label}</div><div class="tooltip-name">${rarity.name}</div><div class="tooltip-stats">${def.describe(item.stats)}</div><div class="tooltip-action">${action}</div>`;
	tooltip.style.setProperty('--tooltip-accent', rarity.color);
	tooltip.classList.remove('hidden');
	const slotRect = slot.getBoundingClientRect();
	const tooltipRect = tooltip.getBoundingClientRect();
	const margin = 10;
	const left = Math.min(Math.max(margin, slotRect.left + slotRect.width / 2 - tooltipRect.width / 2), window.innerWidth - tooltipRect.width - margin);
	const above = slotRect.top - tooltipRect.height - margin;
	const top = above >= margin ? above : Math.min(window.innerHeight - tooltipRect.height - margin, slotRect.bottom + margin);
	tooltip.style.left = `${left}px`;
	tooltip.style.top = `${Math.max(margin, top)}px`;
}

function hideInventoryTooltip(){
	const tooltip = document.getElementById('inventory-tooltip');
	if(tooltip) tooltip.classList.add('hidden');
}

function bindInventoryTooltip(slot, item, action){
	slot.addEventListener('mouseenter', () => showInventoryTooltip(slot, item, action));
	slot.addEventListener('mouseleave', hideInventoryTooltip);
	slot.addEventListener('focus', () => showInventoryTooltip(slot, item, action));
	slot.addEventListener('blur', hideInventoryTooltip);
}

function renderLoadoutRow(category, player){
	const row = document.getElementById('loadout-' + category);
	if(!row) return;
	row.innerHTML = '';
	const def = EQUIPMENT_CATEGORIES[category];
	const unlockedCount = meta.unlockedSlots[category] || 0;
	player.loadout[category].forEach((item, index) => {
		const locked = index >= unlockedCount;
		const slot = document.createElement('div');
		slot.className = 'equip-slot' + (locked ? ' locked' : '');
		if(locked){
			slot.innerHTML = `<span class="icon">🔒</span>`;
			slot.title = 'Emplacement non débloqué (atelier)';
		} else if(item){
			const rarity = rarityById(item.rarityId);
			slot.innerHTML = `<span class="icon" style="color:${rarity.color}">${def.icon}</span><span class="rarity-dot" style="background:${rarity.color}"></span>`;
			slot.setAttribute('aria-label', `${rarity.name} ${def.label}`);
			bindInventoryTooltip(slot, item, 'Cliquer pour retirer');
			slot.onclick = () => { gameplay.unequipItem(category, index); buildInventoryUI(); };
		} else {
			slot.innerHTML = `<span class="icon" style="opacity:0.25">${def.icon}</span>`;
			slot.title = 'Emplacement vide';
		}
		row.appendChild(slot);
	});
}

function renderInventoryStorage(player){
	const row = document.getElementById('inventory-storage');
	if(!row) return;
	row.innerHTML = '';
	player.inventory.forEach((item, index) => {
		const slot = document.createElement('div');
		slot.className = 'equip-slot';
		if(item){
			const def = EQUIPMENT_CATEGORIES[item.category];
			const rarity = rarityById(item.rarityId);
			slot.innerHTML = `<span class="icon" style="color:${rarity.color}">${def.icon}</span><span class="rarity-dot" style="background:${rarity.color}"></span>`;
			slot.setAttribute('aria-label', `${rarity.name} ${def.label}`);
			bindInventoryTooltip(slot, item, 'Cliquer pour équiper');
			slot.onclick = () => { gameplay.equipFromInventory(index); buildInventoryUI(); };
		} else {
			slot.title = 'Emplacement de stockage vide';
		}
		row.appendChild(slot);
	});
}