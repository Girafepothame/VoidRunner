import { Orb, ScrapPickup } from '../model/entities/pickups.js';
import { EXPLOSION_SUB_DEFS, LEVEL_UP_DEFS } from '../meta.js';

export class ProgressionController {
  constructor({
    getPlayer,
    getRun,
    getXpOrbs,
    getScrapPickups,
    meta,
    isInRange,
    random,
    cos,
    sin,
    twoPi,
    onLevelUp,
  }){
    this.getPlayer = getPlayer;
    this.getRun = getRun;
    this.getXpOrbs = getXpOrbs;
    this.getScrapPickups = getScrapPickups;
    this.meta = meta;
    this.isInRange = isInRange;
    this.random = random;
    this.cos = cos;
    this.sin = sin;
    this.twoPi = twoPi;
    this.onLevelUp = onLevelUp;
  }

  spawnPickupsFrom(enemy){
    const strength = this.getEnemyStrength(enemy);
    const xpOrbCount = Math.max(1, Math.round((enemy.xp || 1) * strength));
    this.spawnXpOrbs(enemy.x, enemy.y, xpOrbCount);
    if(this.random() < 0.32) this.spawnGoldOrbs(enemy.x, enemy.y, Math.max(1, Math.round(2 + strength * 2)));
  }

  spawnXpOrbs(x, y, count){
    const xpOrbs = this.getXpOrbs();
    for(let i = 0; i < count; i++){
      const angle = this.random(this.twoPi());
      const distance = this.random(4, 14);
      xpOrbs.push(new Orb(x + this.cos(angle) * distance, y + this.sin(angle) * distance, 1));
    }
  }

  spawnGoldOrbs(x, y, amount){
    const scrapPickups = this.getScrapPickups();
    const denominations = [10, 5, 3, 1];
    let remaining = amount;
    let index = 0;
    while(remaining > 0){
      const value = denominations[index] <= remaining ? denominations[index] : denominations[denominations.length - 1];
      const angle = this.random(this.twoPi());
      const distance = this.random(4, 14);
      scrapPickups.push(new ScrapPickup(x + this.cos(angle) * distance, y + this.sin(angle) * distance, value));
      remaining -= value;
      if(denominations[index] > remaining && index < denominations.length - 1) index++;
    }
  }

  getEnemyStrength(enemy){
    const healthFactor = enemy.maxHp / 10;
    const damageFactor = enemy.dmg / 8;
    const scoreFactor = enemy.score / 10;
    return Math.max(1, (healthFactor + damageFactor + scoreFactor) / 3);
  }

  updatePickups(){
    this.collectXpOrbs();
    this.collectScrapPickups();
  }

  collectXpOrbs(){
    const player = this.getPlayer();
    const xpOrbs = this.getXpOrbs();
    for(let i = xpOrbs.length - 1; i >= 0; i--){
      const orb = xpOrbs[i];
      orb.update(player);
      if(this.isInRange(orb, player, 16)){
        this.gainXp(orb.amount);
        xpOrbs.splice(i, 1);
      }
    }
  }

  collectScrapPickups(){
    const player = this.getPlayer();
    const run = this.getRun();
    const scrapPickups = this.getScrapPickups();
    for(let i = scrapPickups.length - 1; i >= 0; i--){
      const pickup = scrapPickups[i];
      pickup.update(player);
      if(this.isInRange(pickup, player, 16)){
        run.scrapEarned += pickup.amount;
        run.score += pickup.amount * 5;
        scrapPickups.splice(i, 1);
      }
    }
  }

  gainXp(amount){
    const player = this.getPlayer();
    const run = this.getRun();
    player.xp += amount;
    run.score += 3;
    if(player.xp >= player.xpNeeded){
      player.xp -= player.xpNeeded;
      player.level += 1;
      player.xpNeeded = Math.round(6 + player.level * 3.2);
      this.onLevelUp();
      return true;
    }
    return false;
  }

  getLevelUpChoices(){
    const player = this.getPlayer();
    const explosionActive = (player.upgradeCounts.explosive || 0) > 0;
    const explosionChoices = explosionActive
      ? EXPLOSION_SUB_DEFS
      : LEVEL_UP_DEFS.filter(upgrade => upgrade.id === 'explosive');
    const regularChoices = LEVEL_UP_DEFS.filter(upgrade => upgrade.id !== 'explosive');
    return regularChoices.concat(explosionChoices)
      .filter(upgrade => upgrade.max !== 1 || (player.upgradeCounts[upgrade.id] || 0) < upgrade.max)
      .sort(() => this.random(-1, 1))
      .slice(0, 3);
  }

  applyUpgrade(upgrade){
    const player = this.getPlayer();
    const level = player.upgradeCounts[upgrade.id] || 0;
    if(upgrade.max === 1 && level >= upgrade.max) return false;
    upgrade.apply(player);
    player.upgradeCounts[upgrade.id] = level + 1;
    return true;
  }

  settleRunRewards(){
    const run = this.getRun();
    const earned = run.scrapEarned;
    run.scrapEarned = earned;
    this.meta.scrap += earned;
    return earned;
  }
}
