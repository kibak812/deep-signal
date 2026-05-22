import { CARDS, CARD_BY_ID, REWARD_CARD_IDS } from "../data/cards.js";
import { CHALLENGE_MODIFIERS, CHALLENGE_MODIFIER_BY_ID } from "../data/challenges.js";
import { CHARACTER, DIFFICULTIES } from "../data/character.js";
import { ENEMIES, ENEMY_BY_ID, NORMAL_ENEMY_IDS, ELITE_ENEMY_IDS, BOSS_IDS } from "../data/enemies.js";
import { EVENTS, EVENT_BY_ID } from "../data/events.js";
import { RELICS, RELIC_BY_ID, REWARD_RELIC_IDS } from "../data/relics.js";
import { choice, hashSeed, random, randomInt, shuffle, weightedChoice } from "./random.js";

const HARMFUL_STATUSES = ["virus", "vulnerable", "weak", "frail", "fragile", "mark"];
const DECAY_STATUSES = ["vulnerable", "weak", "frail", "fragile"];
const RARITY_WEIGHTS = [
  { value: "common", weight: 62 },
  { value: "uncommon", weight: 30 },
  { value: "rare", weight: 8 }
];
const BUILD_CONCEPTS = [
  {
    id: "charge",
    keywords: ["charge", "focus"],
    effects: ["gainCharge", "gainFocus", "damageByCharge", "spendChargeDamage", "chargePerEnemy"]
  },
  {
    id: "mark",
    keywords: ["mark", "damage"],
    effects: ["damage"]
  },
  {
    id: "virus",
    keywords: ["virus", "weak", "vulnerable", "frail"],
    effects: ["apply"]
  },
  {
    id: "ward",
    keywords: ["block", "counter", "plated"],
    effects: ["block", "blockPerHand"]
  },
  {
    id: "cycle",
    keywords: ["exhaust", "temporary", "retain"],
    effects: ["draw", "generate", "discardRandom", "resetHand", "exhaustRandomHand", "discountRandomHand", "upgradeRandomHand"]
  },
  {
    id: "risk",
    keywords: ["fragile"],
    effects: ["gainEnergy", "gainMaxEnergy", "loseHp", "loseMaxHp", "gainGold"]
  }
];

function hasFinalConsonant(text) {
  const char = [...String(text).trim()].pop();
  if (!char) return false;
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function withObjectParticle(text) {
  return `${text}${hasFinalConsonant(text) ? "을" : "를"}`;
}

export function contentCounts() {
  return {
    cards: CARDS.length,
    rewardCards: REWARD_CARD_IDS.length,
    relics: RELICS.length,
    normalEnemies: NORMAL_ENEMY_IDS.length,
    eliteEnemies: ELITE_ENEMY_IDS.length,
    bosses: BOSS_IDS.length,
    events: EVENTS.length,
    difficulties: DIFFICULTIES.length
  };
}

function normalizeChallenge(challenge) {
  if (!challenge || typeof challenge !== "object") return null;
  const modifiers = (challenge.modifiers ?? [])
    .map((modifier) => (typeof modifier === "string" ? modifier : modifier?.id))
    .filter((id) => CHALLENGE_MODIFIER_BY_ID[id])
    .slice(0, 3);
  return { ...challenge, modifiers };
}

function applyChallengeModifiers(run) {
  for (const modifier of challengeModifiers(run)) {
    const effects = modifier.effects ?? {};
    if (effects.maxHp) {
      run.player.maxHp = Math.max(40, run.player.maxHp + effects.maxHp);
      run.player.hp = Math.min(run.player.maxHp, Math.max(1, run.player.hp + effects.maxHp));
    }
    if (effects.startingGold) run.player.gold = Math.max(0, run.player.gold + effects.startingGold);
    if (effects.startCharge) addRunFlag(run, "startCharge", effects.startCharge);
    if (effects.startWeak) addRunFlag(run, "startWeak", effects.startWeak);
    if (effects.startVulnerable) addRunFlag(run, "startVulnerable", effects.startVulnerable);
    if (effects.startFrail) addRunFlag(run, "startFrail", effects.startFrail);
    if (effects.enemyStartVirus) addRunFlag(run, "enemyStartVirus", effects.enemyStartVirus);
    if (effects.rewardCardBonus) addRunFlag(run, "rewardCardBonus", effects.rewardCardBonus);
    if (effects.eliteGoldBonus) addRunFlag(run, "eliteGoldBonus", effects.eliteGoldBonus);
    if (effects.firstTurnDraw) addRunFlag(run, "firstTurnDraw", effects.firstTurnDraw);
    if (effects.enemyHpMultiplier) multiplyRunFlag(run, "enemyHpMultiplier", effects.enemyHpMultiplier);
    if (effects.rewardGoldMultiplier) multiplyRunFlag(run, "rewardGoldMultiplier", effects.rewardGoldMultiplier);
    if (effects.shopPriceMultiplier) multiplyRunFlag(run, "shopPriceMultiplier", effects.shopPriceMultiplier);
  }
}

function addRunFlag(run, flag, amount) {
  run.runFlags[flag] = (run.runFlags[flag] ?? 0) + amount;
}

function multiplyRunFlag(run, flag, amount) {
  run.runFlags[flag] = (run.runFlags[flag] ?? 1) * amount;
}

function challengeModifiers(run) {
  return (run.challenge?.modifiers ?? []).map((id) => CHALLENGE_MODIFIER_BY_ID[id]).filter(Boolean);
}

function challengeLabel(run) {
  if (!run.challenge?.name) return null;
  const names = challengeModifiers(run).map((modifier) => modifier.name);
  return names.length ? `${run.challenge.name}: ${names.join(", ")}` : run.challenge.name;
}

function challengeSummary(run) {
  if (!run.challenge?.name) return {};
  return {
    challenge: challengeLabel(run),
    challengeType: run.challenge.type ?? null,
    challengeDate: run.challenge.date ?? null,
    challengeModifiers: run.challenge.modifiers ?? [],
    challengeModifierNames: challengeModifiers(run).map((modifier) => modifier.name)
  };
}

export function newRun({ seed = `${Date.now()}`, difficulty = 0, challenge = null } = {}) {
  const selectedDifficulty = DIFFICULTIES.find((item) => item.id === Number(difficulty)) ?? DIFFICULTIES[0];
  const challengeConfig = normalizeChallenge(challenge);
  const run = {
    version: 1,
    id: `run-${Date.now().toString(36)}`,
    seed: String(seed),
    rngState: hashSeed(seed),
    nextUid: 1,
    phase: "map",
    difficulty: selectedDifficulty.id,
    challenge: challengeConfig,
    characterId: CHARACTER.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    currentNodeId: null,
    currentRow: -1,
    availableNodeIds: [],
    map: [],
    seenEventIds: [],
    player: {
      name: CHARACTER.name,
      title: CHARACTER.title,
      maxHp: Math.max(40, CHARACTER.maxHp + selectedDifficulty.playerMaxHp),
      hp: Math.max(40, CHARACTER.maxHp + selectedDifficulty.playerMaxHp),
      gold: CHARACTER.gold,
      energy: CHARACTER.energy,
      deck: [],
      relics: [CHARACTER.starterRelic],
      statuses: {},
      block: 0
    },
    stats: {
      floors: 0,
      fights: 0,
      enemiesKilled: 0,
      elitesKilled: 0,
      bossesKilled: 0,
      damageDealt: 0,
      damageTaken: 0,
      cardsAdded: 0,
      cardsRemoved: 0,
      relicsFound: 1,
      goldEarned: 0,
      buildTags: {}
    },
    runFlags: {
      seenActInterludes: []
    },
    nextCombatFlags: {},
    combat: null,
    reward: null,
    event: null,
    shop: null,
    selector: null,
    lastInterlude: null,
    summary: null,
    relicTriggers: [],
    log: []
  };

  applyChallengeModifiers(run);
  run.player.deck = CHARACTER.starterDeck.map((cardId) => makeCard(run, cardId));
  run.map = generateMap(run);
  run.availableNodeIds = run.map[0].map((node) => node.id);
  addLog(run, "딥 시그널의 표층이 열렸습니다.", "system");
  return touch(run);
}

export function restoreRun(raw) {
  if (!raw || typeof raw !== "object") return null;
  const run = structuredClone(raw);
  if (!run.version || !run.player?.deck || !run.map) return null;
  run.log ??= [];
  run.availableNodeIds ??= [];
  run.player.relics ??= [];
  run.player.statuses ??= {};
  run.player.block ??= 0;
  run.player.gold ??= 0;
  run.player.maxHp ??= 1;
  run.player.hp ??= run.player.maxHp;
  run.seenEventIds ??= [];
  run.relicTriggers ??= [];
  run.runFlags ??= {};
  if (!Array.isArray(run.runFlags.seenActInterludes)) run.runFlags.seenActInterludes = [];
  run.nextCombatFlags ??= {};
  run.lastInterlude ??= null;
  run.stats ??= {};
  run.stats.buildTags ??= {};
  if (run.reward) normalizeReward(run.reward);
  if (run.combat) normalizeCombat(run.combat);
  return run;
}

function normalizeReward(reward) {
  reward.cards ??= [];
  reward.relicChoices ??= [];
  reward.selectedCardId ??= null;
  reward.cardSkipped ??= false;
  reward.selectedRelicId ??= null;
}

function normalizeCombat(combat) {
  combat.drawPile ??= [];
  combat.discardPile ??= [];
  combat.hand ??= [];
  combat.exhaustPile ??= [];
  combat.enemies ??= [];
  combat.turnCostMods ??= {};
  combat.relicTriggers ??= [];
  for (const enemy of combat.enemies) enemy.statuses ??= {};
}

export function getDifficulty(run) {
  return DIFFICULTIES.find((item) => item.id === run.difficulty) ?? DIFFICULTIES[0];
}

function emptyEnemyIntentForecast() {
  return {
    incomingDamage: 0,
    blockedDamage: 0,
    hpLoss: 0,
    incomingStatuses: [],
    enemyBlock: 0,
    enemyHealing: 0,
    enemyBuffs: [],
    summons: 0,
    attackIntents: 0
  };
}

function enemyIntentForecastForEnemies(run, enemies) {
  const combat = run.combat;
  if (!combat) return emptyEnemyIntentForecast();

  let incomingDamage = 0;
  let simulatedPlayerMark = getStatus(run.player, "mark");
  const incomingStatuses = new Map();
  const enemyBuffs = new Map();
  let enemyBlock = 0;
  let enemyHealing = 0;
  let summons = 0;
  let attackIntents = 0;

  for (const enemy of enemies) {
    const move = enemy.nextMove;
    if (!move) continue;
    if (move.damage) {
      attackIntents += 1;
      const hits = move.hits ?? 1;
      for (let hit = 0; hit < hits; hit += 1) {
        let damage = Math.max(0, Math.round(move.damage * getDifficulty(run).enemyDamage) + getStatus(enemy, "strength"));
        if (getStatus(enemy, "weak") > 0) damage = Math.floor(damage * 0.75);
        if (getStatus(run.player, "vulnerable") > 0) damage = Math.ceil(damage * 1.5);
        if (getStatus(run.player, "fragile") > 0) damage = Math.ceil(damage * 1.15);
        if (simulatedPlayerMark > 0) {
          damage += 2;
          simulatedPlayerMark -= 1;
        }
        incomingDamage += damage;
      }
    }
    enemyBlock += move.block ?? 0;
    enemyHealing += move.heal ?? 0;
    for (const status of move.applyToPlayer ?? []) {
      incomingStatuses.set(status.status, (incomingStatuses.get(status.status) ?? 0) + status.amount);
    }
    for (const status of move.self ?? []) {
      enemyBuffs.set(status.status, (enemyBuffs.get(status.status) ?? 0) + status.amount);
    }
    for (const summon of move.summon ?? []) {
      summons += summon.count ?? 1;
    }
  }

  const blockedDamage = Math.min(run.player.block, incomingDamage);
  return {
    incomingDamage,
    blockedDamage,
    hpLoss: Math.max(0, incomingDamage - blockedDamage),
    incomingStatuses: [...incomingStatuses].map(([status, amount]) => ({ status, amount })),
    enemyBlock,
    enemyHealing,
    enemyBuffs: [...enemyBuffs].map(([status, amount]) => ({ status, amount })),
    summons,
    attackIntents
  };
}

export function enemyIntentForecast(run) {
  return enemyIntentForecastForEnemies(run, getAliveEnemies(run));
}

export function enemyIntentForecastAfterDefeat(run, defeatedUids = []) {
  const defeated = new Set(defeatedUids.map(Number));
  const remainingEnemies = getAliveEnemies(run).filter((enemy) => !defeated.has(enemy.uid));
  return enemyIntentForecastForEnemies(run, remainingEnemies);
}

export function cardPlayPreview(run, cardInstance, targetUid = null) {
  const combat = run?.combat;
  const card = cardInstance ? effectiveCard(cardInstance) : null;
  const preview = {
    playable: false,
    cost: 0,
    energyDelta: 0,
    energyAfter: combat?.energy ?? 0,
    targetName: null,
    repeats: 1,
    targetMode: "none",
    damage: 0,
    blockedDamage: 0,
    block: 0,
    draw: 0,
    charge: 0,
    chargeSpent: 0,
    focus: 0,
    generated: 0,
    discarded: 0,
    exhausted: 0,
    upgraded: 0,
    discounted: 0,
    cleansed: 0,
    heal: 0,
    hpLoss: 0,
    gold: 0,
    maxEnergy: 0,
    maxHpLoss: 0,
    exhaustsSelf: false,
    statuses: [],
    relics: [],
    conditions: [],
    enemyDeltas: [],
    warnings: []
  };

  if (!combat || run.phase !== "combat" || !card) {
    preview.warnings.push("전투 중에만 사용");
    return preview;
  }

  const cost = cardCost(cardInstance, combat);
  const target = getTargetEnemy(run, targetUid ?? combat.selectedEnemyUid);
  const aliveEnemies = getAliveEnemies(run);
  const playerStatuses = { ...run.player.statuses };
  const enemies = new Map(
    aliveEnemies.map((enemy) => [
      enemy.uid,
      {
        uid: enemy.uid,
        name: enemy.name,
        hp: enemy.hp,
        block: enemy.block,
        statuses: { ...enemy.statuses }
      }
    ])
  );
  let simulatedBlock = run.player.block;
  let simulatedCharge = statusFrom(playerStatuses, "charge");
  let simulatedFocus = statusFrom(playerStatuses, "focus");
  const handAfterPlay = Math.max(0, combat.hand.length - 1);
  const attacksAfterPlay = combat.attacksPlayedThisTurn + (card.type === "attack" ? 1 : 0);
  const skillsAfterPlay = combat.skillsPlayedThisTurn + (card.type === "skill" ? 1 : 0);

  preview.cost = cost;
  preview.energyDelta = -cost;
  preview.energyAfter = combat.energy - cost;
  preview.targetName = target?.name ?? null;
  preview.repeats = statusFrom(playerStatuses, "echo") > 0 ? 2 : 1;
  preview.exhaustsSelf = Boolean(card.exhaust || card.type === "power" || cardInstance.temporary);
  preview.playable = !card.unplayable && cost <= combat.energy && (!requiresTarget(card) || Boolean(target));

  if (card.unplayable) preview.warnings.push("사용 불가");
  if (cost > combat.energy) preview.warnings.push(`전하 ${cost - combat.energy} 부족`);
  if (requiresTarget(card) && !target) preview.warnings.push("대상 필요");

  const addRelicPreview = (relicId) => {
    if (!preview.relics.includes(relicId)) preview.relics.push(relicId);
  };
  const addPreviewStatus = (scope, status, amount) => {
    if (!amount) return;
    preview.statuses.push({ scope, status, amount });
  };
  const addPlayerStatus = (status, amount) => {
    playerStatuses[status] = Math.max(0, statusFrom(playerStatuses, status) + amount);
    if (playerStatuses[status] === 0) delete playerStatuses[status];
    if (status === "charge") simulatedCharge = statusFrom(playerStatuses, "charge");
    if (status === "focus") simulatedFocus = statusFrom(playerStatuses, "focus");
  };
  const addEnemyStatus = (enemy, status, amount, scope = "enemy") => {
    if (!enemy) return;
    enemy.statuses[status] = Math.max(0, statusFrom(enemy.statuses, status) + amount);
    if (enemy.statuses[status] === 0) delete enemy.statuses[status];
    addPreviewStatus(scope, status, amount);
  };
  const recordEnemyDelta = (enemy, beforeHp, beforeBlock, dealt, blocked) => {
    let delta = preview.enemyDeltas.find((item) => item.uid === enemy.uid);
    if (!delta) {
      delta = {
        uid: enemy.uid,
        name: enemy.name,
        hpBefore: beforeHp,
        hpAfter: enemy.hp,
        blockBefore: beforeBlock,
        blockAfter: enemy.block,
        damage: 0,
        blockedDamage: 0,
        lethal: false
      };
      preview.enemyDeltas.push(delta);
    }
    delta.hpAfter = enemy.hp;
    delta.blockAfter = enemy.block;
    delta.damage += dealt;
    delta.blockedDamage += blocked;
    delta.lethal = delta.hpBefore > 0 && enemy.hp <= 0;
  };
  const previewAttack = (enemy, amount) => {
    if (!enemy || enemy.hp <= 0) return;
    const beforeHp = enemy.hp;
    const beforeBlock = enemy.block;
    let damage = Math.max(0, amount + statusFrom(playerStatuses, "strength"));
    if (statusFrom(playerStatuses, "weak") > 0) damage = Math.floor(damage * 0.75);
    if (statusFrom(enemy.statuses, "vulnerable") > 0) damage = Math.ceil(damage * 1.5);
    if (statusFrom(enemy.statuses, "mark") > 0) {
      damage += 2 + (hasRelic(run, "lens_prism") ? 2 : 0);
      enemy.statuses.mark = Math.max(0, statusFrom(enemy.statuses, "mark") - 1);
      if (enemy.statuses.mark === 0) delete enemy.statuses.mark;
      if (hasRelic(run, "lens_prism")) addRelicPreview("lens_prism");
    }
    const blocked = Math.min(enemy.block, damage);
    enemy.block -= blocked;
    const dealt = Math.max(0, damage - blocked);
    enemy.hp = Math.max(0, enemy.hp - dealt);
    preview.damage += dealt;
    preview.blockedDamage += blocked;
    recordEnemyDelta(enemy, beforeHp, beforeBlock, dealt, blocked);
    if (card.type === "attack" && hasRelic(run, "abyssal_needle")) {
      addEnemyStatus(enemy, "virus", 1);
      addRelicPreview("abyssal_needle");
    }
  };
  const previewBlock = (amount) => {
    let block = Math.max(0, amount + simulatedFocus);
    if (statusFrom(playerStatuses, "frail") > 0) block = Math.floor(block * 0.75);
    simulatedBlock += block;
    preview.block += block;
    if (block >= 12 && hasRelic(run, "counterweight")) {
      addPlayerStatus("counter", 3);
      addPreviewStatus("self", "counter", 3);
      addRelicPreview("counterweight");
    }
  };
  const previewCleanse = (amount) => {
    let remaining = amount;
    let removedTotal = 0;
    for (const status of HARMFUL_STATUSES) {
      if (remaining <= 0) break;
      const removed = Math.min(remaining, statusFrom(playerStatuses, status));
      if (removed > 0) {
        addPlayerStatus(status, -removed);
        remaining -= removed;
        removedTotal += removed;
      }
    }
    preview.cleansed += removedTotal;
  };
  const adjustedPreviewStatusAmount = (status, amount) => {
    if (status === "virus" && hasRelic(run, "black_coral")) {
      addRelicPreview("black_coral");
      return amount + 1;
    }
    return amount;
  };
  const targetCopies = (effect) => {
    if (effect.target === "allEnemies") {
      preview.targetMode = "all";
      return [...enemies.values()].filter((enemy) => enemy.hp > 0);
    }
    if (target) {
      preview.targetMode = "single";
      return [enemies.get(target.uid)].filter(Boolean);
    }
    return [];
  };
  const simulateEffects = (effects) => {
    for (const effect of effects) {
      switch (effect.op) {
        case "damage":
          for (const enemy of targetCopies(effect)) {
            for (let hit = 0; hit < (effect.hits ?? 1); hit += 1) previewAttack(enemy, effect.amount);
          }
          break;
        case "damageByCharge":
          for (const enemy of targetCopies(effect)) previewAttack(enemy, effect.base + simulatedCharge * effect.per);
          break;
        case "spendChargeDamage": {
          const spent = simulatedCharge;
          simulatedCharge = 0;
          playerStatuses.charge = 0;
          delete playerStatuses.charge;
          preview.chargeSpent += spent;
          for (const enemy of targetCopies(effect)) previewAttack(enemy, effect.base + spent * effect.per);
          break;
        }
        case "damagePerExhaust":
          for (const enemy of targetCopies(effect)) previewAttack(enemy, combat.exhaustPile.length * effect.amount);
          break;
        case "block":
          previewBlock(effect.amount);
          break;
        case "blockPerHand":
          previewBlock(handAfterPlay * effect.amount);
          break;
        case "apply": {
          const amount = adjustedPreviewStatusAmount(effect.status, effect.amount);
          if (effect.target === "self") {
            addPlayerStatus(effect.status, amount);
            addPreviewStatus("self", effect.status, amount);
          } else if (effect.target === "allEnemies") {
            for (const enemy of targetCopies(effect)) addEnemyStatus(enemy, effect.status, amount, "allEnemies");
          } else {
            for (const enemy of targetCopies(effect)) addEnemyStatus(enemy, effect.status, amount, "enemy");
          }
          break;
        }
        case "gainStatus":
          if (effect.target === "self") {
            addPlayerStatus(effect.status, effect.amount);
            addPreviewStatus("self", effect.status, effect.amount);
          } else {
            for (const enemy of targetCopies(effect)) addEnemyStatus(enemy, effect.status, effect.amount, "enemy");
          }
          break;
        case "draw":
          preview.draw += effect.amount;
          break;
        case "gainEnergy":
          preview.energyDelta += effect.amount;
          break;
        case "gainCharge": {
          const amount = Math.max(0, effect.amount + simulatedFocus);
          simulatedCharge += amount;
          playerStatuses.charge = simulatedCharge;
          preview.charge += amount;
          break;
        }
        case "gainFocus":
          simulatedFocus += effect.amount;
          playerStatuses.focus = simulatedFocus;
          preview.focus += effect.amount;
          addPreviewStatus("self", "focus", effect.amount);
          break;
        case "generate":
          preview.generated += effect.amount;
          break;
        case "discardRandom":
          preview.discarded += Math.min(effect.amount, handAfterPlay);
          break;
        case "upgradeRandomHand":
          preview.upgraded += effect.amount;
          break;
        case "discountRandomHand":
          preview.discounted += effect.count ?? 1;
          break;
        case "exhaustRandomHand":
          preview.exhausted += Math.min(effect.amount, handAfterPlay);
          break;
        case "cleanse":
          previewCleanse(effect.amount);
          break;
        case "loseHp":
          preview.hpLoss += effect.amount;
          break;
        case "heal":
          preview.heal += Math.min(effect.amount, run.player.maxHp - run.player.hp);
          break;
        case "gainGold":
          preview.gold += effect.amount;
          break;
        case "ifEnemyStatus": {
          const enemy = target ? enemies.get(target.uid) : null;
          const met = Boolean(enemy && statusFrom(enemy.statuses, effect.status) > 0);
          preview.conditions.push({ type: "enemyStatus", status: effect.status, met });
          if (met) simulateEffects(effect.effects ?? []);
          break;
        }
        case "ifPlayerBlock": {
          const met = simulatedBlock > 0;
          preview.conditions.push({ type: "playerBlock", met });
          if (met) simulateEffects(effect.effects ?? []);
          break;
        }
        case "ifAttackCount": {
          const met = attacksAfterPlay >= effect.count;
          preview.conditions.push({ type: "attackCount", count: effect.count, met });
          if (met) simulateEffects(effect.effects ?? []);
          break;
        }
        case "chargePerEnemy": {
          const amount = aliveEnemies.length * effect.amount + simulatedFocus;
          simulatedCharge += amount;
          playerStatuses.charge = simulatedCharge;
          preview.charge += amount;
          break;
        }
        case "resetHand":
          preview.discarded += handAfterPlay;
          preview.draw += handAfterPlay;
          preview.energyDelta += effect.energy;
          break;
        case "gainMaxEnergy":
          preview.maxEnergy += effect.amount;
          break;
        case "loseMaxHp":
          preview.maxHpLoss += effect.amount;
          break;
        default:
          preview.warnings.push("사용 후 추가 효과 적용");
      }
    }
  };

  for (let repeat = 0; repeat < preview.repeats; repeat += 1) simulateEffects(card.effects ?? []);

  if (hasRelic(run, "tide_metronome") && (combat.cardsPlayedThisTurn + 1) % 3 === 0) {
    preview.energyDelta += 1;
    addRelicPreview("tide_metronome");
  }
  if (card.type === "skill" && hasRelic(run, "glass_inkwell") && skillsAfterPlay % 2 === 0) {
    preview.draw += 1;
    addRelicPreview("glass_inkwell");
  }
  if (card.type === "power" && hasRelic(run, "harmonic_spool")) {
    preview.draw += 1;
    addRelicPreview("harmonic_spool");
  }
  if (card.type === "attack" && !combat.firstAttackPlayed && target && hasRelic(run, "cracked_anchor")) {
    addPreviewStatus("enemy", "mark", 2);
    addRelicPreview("cracked_anchor");
  }
  if (preview.exhaustsSelf) {
    preview.exhausted += 1;
    if (hasRelic(run, "recursive_key") && !combat.firstExhaustTriggered) {
      preview.draw += 1;
      preview.energyDelta += 1;
      addRelicPreview("recursive_key");
    }
  }

  preview.energyAfter = combat.energy + preview.energyDelta;
  return preview;
}

export function getCard(cardInstanceOrId) {
  const cardId = typeof cardInstanceOrId === "string" ? cardInstanceOrId : cardInstanceOrId.cardId;
  return CARD_BY_ID[cardId];
}

export function effectiveCard(cardInstance) {
  const template = getCard(cardInstance);
  if (!cardInstance?.upgraded || !template.upgrade) {
    return template;
  }
  return {
    ...template,
    cost: template.upgrade.cost ?? template.cost,
    text: template.upgradedText ?? template.text,
    effects: template.upgrade.effects ?? template.effects,
    exhaust: template.upgrade.exhaust ?? template.exhaust,
    retain: template.upgrade.retain ?? template.retain
  };
}

export function cardCost(cardInstance, combat = null) {
  const card = effectiveCard(cardInstance);
  if (card.unplayable) return 99;
  return Math.max(0, (card.cost ?? 0) + (cardInstance.costMod ?? 0) + (combat?.turnCostMods?.[cardInstance.uid] ?? 0));
}

export function isUpgradeableCard(cardInstance) {
  const card = getCard(cardInstance);
  if (!card || cardInstance?.upgraded || !card.upgrade) return false;
  const upgradedCost = card.upgrade.cost ?? card.cost;
  const upgradedText = card.upgradedText ?? card.text;
  const upgradedEffects = JSON.stringify(card.upgrade.effects ?? card.effects ?? []);
  const baseEffects = JSON.stringify(card.effects ?? []);
  return (
    upgradedText !== card.text ||
    upgradedCost !== card.cost ||
    upgradedEffects !== baseEffects ||
    card.upgrade.exhaust !== undefined ||
    card.upgrade.retain !== undefined
  );
}

export function hasUpgradeableCards(run) {
  return run.player.deck.some((card) => isUpgradeableCard(card));
}

export function enterNode(run, nodeId) {
  if (run.phase !== "map") return run;
  const node = findNode(run, nodeId);
  if (!node || node.completed || !run.availableNodeIds.includes(nodeId)) return run;
  run.currentNodeId = nodeId;
  run.currentRow = node.row;
  run.stats.floors = Math.max(run.stats.floors, node.row + 1);
  run.reward = null;
  run.event = null;
  run.shop = null;
  run.selector = null;
  run.lastInterlude = null;

  if (node.type === "combat" || node.type === "elite" || node.type === "boss") {
    return startCombat(run, node.type, { act: node.act });
  }
  if (node.type === "event") return startEvent(run);
  if (node.type === "shop") return startShop(run);
  if (node.type === "rest") return startRest(run);
  return run;
}

export function playCard(run, uid, targetUid = null) {
  const combat = run.combat;
  if (!combat || run.phase !== "combat") return run;
  const index = combat.hand.findIndex((card) => card.uid === uid);
  if (index < 0) return run;
  const cardInstance = combat.hand[index];
  const card = effectiveCard(cardInstance);
  const cost = cardCost(cardInstance, combat);
  if (card.unplayable || cost > combat.energy) {
    addLog(run, `${withObjectParticle(card.name)} 사용할 수 없습니다.`, "warn");
    return touch(run);
  }

  const target = getTargetEnemy(run, targetUid ?? combat.selectedEnemyUid);
  if (requiresTarget(card) && !target) {
    addLog(run, "대상이 필요합니다.", "warn");
    return touch(run);
  }

  combat.hand.splice(index, 1);
  combat.energy -= cost;
  combat.cardsPlayedThisTurn += 1;
  if (card.type === "attack") combat.attacksPlayedThisTurn += 1;
  if (card.type === "skill") combat.skillsPlayedThisTurn += 1;
  addLog(run, `${card.name}${cardInstance.upgraded ? "+" : ""} 사용.`, "card");

  const echoCount = getStatus(run.player, "echo") > 0 ? 2 : 1;
  if (echoCount > 1) {
    addStatus(run.player, "echo", -1);
    addLog(run, "잔향이 카드를 한 번 더 울립니다.", "buff");
  }
  for (let repeat = 0; repeat < echoCount; repeat += 1) {
    applyEffects(run, card.effects ?? [], target, card);
    if (run.phase !== "combat") return touch(run);
  }

  triggerCardRelics(run, card, target);
  triggerPowerSideEffects(run, card);

  const shouldExhaust = Boolean(card.exhaust || card.type === "power" || cardInstance.temporary);
  if (shouldExhaust) {
    combat.exhaustPile.push(cardInstance);
    triggerExhaustRelics(run);
  } else {
    combat.discardPile.push(cardInstance);
  }

  removeDeadEnemies(run);
  if (combatVictoryAchieved(run)) {
    return winCombat(run);
  }
  return touch(run);
}

export function selectEnemy(run, uid) {
  if (run.combat?.enemies.some((enemy) => enemy.uid === uid && enemy.hp > 0)) {
    run.combat.selectedEnemyUid = uid;
  }
  return touch(run);
}

export function endTurn(run) {
  const combat = run.combat;
  if (!combat || run.phase !== "combat") return run;

  for (const card of combat.hand) {
    const template = getCard(card);
    if (template.id === "dead_letter") {
      loseHp(run, card.upgraded ? 1 : 2, "사망한 편지");
      if (run.phase !== "combat") return touch(run);
    }
  }

  const retained = [];
  for (const card of combat.hand) {
    const template = effectiveCard(card);
    if (template.retain) retained.push(card);
    else combat.discardPile.push(card);
  }
  combat.hand = retained;

  for (const enemy of getAliveEnemies(run)) {
    enemyTurn(run, enemy);
    if (run.phase !== "combat") return touch(run);
  }

  removeDeadEnemies(run);
  if (combatVictoryAchieved(run)) {
    return winCombat(run);
  }

  decayStatuses(run.player, DECAY_STATUSES);
  for (const enemy of getAliveEnemies(run)) {
    decayStatuses(enemy, DECAY_STATUSES);
    chooseEnemyIntent(run, enemy);
  }

  if (run.player.hp <= 0) return loseRun(run, "체력이 0이 되었습니다.");
  startPlayerTurn(run);
  return touch(run);
}

export function chooseRewardCard(run, cardId) {
  if (run.phase !== "reward" || !run.reward) return run;
  if (!cardId || !run.reward.cards.includes(cardId)) return run;
  normalizeReward(run.reward);
  run.reward.selectedCardId = cardId;
  run.reward.cardSkipped = false;
  return collectRewardAndComplete(run);
}

export function skipReward(run) {
  if (run.phase !== "reward" || !run.reward) return run;
  normalizeReward(run.reward);
  run.reward.selectedCardId = null;
  run.reward.cardSkipped = true;
  return collectRewardAndComplete(run);
}

export function chooseRewardRelic(run, relicId) {
  if (run.phase !== "reward" || !run.reward) return run;
  normalizeReward(run.reward);
  if (!run.reward.relicChoices.includes(relicId)) return run;
  run.reward.selectedRelicId = relicId;
  return collectRewardAndComplete(run);
}

export function chooseEventOption(run, optionIndex) {
  if (run.phase !== "event" || !run.event) return run;
  const eventDefinition = EVENT_BY_ID[run.event.eventId];
  const option = eventDefinition.choices[optionIndex];
  if (!option || eventChoiceBlockReason(run, option.effects)) return run;
  addLog(run, `${eventDefinition.name}: ${option.label}`, "event");
  run.event.chosen = optionIndex;
  applyRunOperations(run, option.effects, { source: "event" });
  if (run.phase === "event") completeNode(run);
  return touch(run);
}

export function buyShopCard(run, index) {
  const item = run.shop?.cards[index];
  if (run.phase !== "shop" || !item || item.sold || run.player.gold < item.price) return run;
  run.player.gold -= item.price;
  addDeckCard(run, item.cardId);
  item.sold = true;
  run.stats.cardsAdded += 1;
  addLog(run, `${getCard(item.cardId).name} 구매.`, "shop");
  return touch(run);
}

export function buyShopRelic(run, index) {
  const item = run.shop?.relics[index];
  if (run.phase !== "shop" || !item || item.sold || run.player.gold < item.price) return run;
  run.player.gold -= item.price;
  addRelic(run, item.relicId);
  item.sold = true;
  addLog(run, `${RELIC_BY_ID[item.relicId].name} 구매.`, "shop");
  return touch(run);
}

export function buyShopHeal(run) {
  const price = shopPrice(run, 50);
  if (run.phase !== "shop" || run.player.gold < price || run.player.hp >= run.player.maxHp) return run;
  run.player.gold -= price;
  heal(run, 20);
  addLog(run, "마켓에서 체력을 회복했습니다.", "shop");
  return touch(run);
}

export function requestShopRemove(run) {
  const price = Math.max(25, shopPrice(run, 75) - (hasRelic(run, "archive_pass") ? 30 : 0));
  if (run.phase !== "shop" || run.player.gold < price || run.player.deck.length <= 1) return run;
  run.player.gold -= price;
  run.selector = { mode: "remove", context: "shop", refund: price, after: "shop" };
  return touch(run);
}

export function requestShopUpgrade(run) {
  const price = shopPrice(run, 90);
  if (run.phase !== "shop" || run.player.gold < price || !hasUpgradeableCards(run)) return run;
  run.player.gold -= price;
  run.selector = { mode: "upgrade", context: "shop", refund: price, after: "shop" };
  return touch(run);
}

export function chooseRest(run, action) {
  if (run.phase !== "rest") return run;
  if (action === "heal") {
    if (hasRelic(run, "resting_gear")) triggerRelic(run, "resting_gear");
    heal(run, restHealAmount(run));
    addLog(run, "정박지에서 숨을 고릅니다.", "rest");
    completeNode(run);
  }
  if (action === "upgrade") {
    if (!hasUpgradeableCards(run)) {
      addLog(run, "강화할 카드가 없습니다.", "warn");
      return touch(run);
    }
    run.selector = { mode: "upgrade", context: "rest", after: "completeNode" };
  }
  if (action === "remove") {
    if (run.player.hp <= 5 || run.player.deck.length <= 1) {
      addLog(run, "카드 제거를 진행할 수 없습니다.", "warn");
      return touch(run);
    }
    run.selector = { mode: "remove", context: "rest", hpCost: 5, after: "completeNode" };
  }
  return touch(run);
}

export function resolveDeckSelection(run, uid) {
  if (!run.selector) return run;
  const card = run.player.deck.find((item) => item.uid === uid);
  if (!card) return run;
  if (run.selector.mode === "upgrade") {
    if (!isUpgradeableCard(card)) {
      addLog(run, "이미 강화되었거나 강화 효과가 없는 카드입니다.", "warn");
      return touch(run);
    }
    card.upgraded = true;
    addLog(run, `${getCard(card).name} 강화.`, "deck");
  }
  if (run.selector.mode === "remove") {
    if (run.selector.hpCost) loseHp(run, run.selector.hpCost, "카드 제거 정비");
    if (run.phase === "summary") return touch(run);
    run.player.deck = run.player.deck.filter((item) => item.uid !== uid);
    run.stats.cardsRemoved += 1;
    addLog(run, `${getCard(card).name} 제거.`, "deck");
  }
  const after = run.selector.after;
  run.selector = null;
  if (after === "completeNode") completeNode(run);
  return touch(run);
}

export function cancelDeckSelection(run) {
  if (!run.selector) return run;
  if (run.selector.refund) run.player.gold += run.selector.refund;
  run.selector = null;
  return touch(run);
}

export function leaveShop(run) {
  if (run.phase === "shop") completeNode(run);
  return touch(run);
}

export function shopServicePrices(run) {
  return {
    heal: shopPrice(run, 50),
    remove: Math.max(25, shopPrice(run, 75) - (hasRelic(run, "archive_pass") ? 30 : 0)),
    upgrade: shopPrice(run, 90)
  };
}

export function restHealAmount(run) {
  return Math.ceil(run.player.maxHp * 0.38) + (hasRelic(run, "resting_gear") ? 10 : 0);
}

export function bossRecoveryAmount(run) {
  const ratios = {
    0: 0.48,
    1: 0.44,
    2: 0.4,
    3: 0.37,
    4: 0.35,
    5: 0.38
  };
  return Math.ceil(run.player.maxHp * (ratios[run.difficulty] ?? 0.35));
}

export function continueFromInfo(run) {
  if (["event", "shop", "rest", "summary"].includes(run.phase)) return run;
  return touch(run);
}

export function visibleMapRows(run) {
  return run.map;
}

export function enemyIdsForNode(type, act = 1) {
  if (type === "boss") {
    return [BOSS_IDS[Math.max(0, Math.min(BOSS_IDS.length - 1, act - 1))]].filter(Boolean);
  }
  if (type === "elite") return eliteEnemyPool(act);
  if (type === "combat" || type === "normal") return normalEnemyPool(act);
  return [];
}

function generateMap(run) {
  const rows = [];
  const rowCount = 21;
  for (let row = 0; row < rowCount; row += 1) {
    const act = row < 7 ? 1 : row < 14 ? 2 : 3;
    const isBoss = row === 6 || row === 13 || row === 20;
    const isPreBossRest = row === 5 || row === 12 || row === 19;
    const width = isBoss ? 1 : 3;
    const nodes = [];
    for (let col = 0; col < width; col += 1) {
      nodes.push({
        id: `n-${row}-${col}`,
        row,
        col,
        act,
        type: isBoss ? "boss" : isPreBossRest ? "rest" : pickNodeType(run, row, col),
        completed: false,
        connections: []
      });
    }
    rows.push(nodes);
  }

  for (let row = 0; row < rows.length - 1; row += 1) {
    for (const node of rows[row]) {
      const nextWidth = rows[row + 1].length;
      const candidates = [];
      for (let col = 0; col < nextWidth; col += 1) {
        if (nextWidth === 1 || Math.abs(col - node.col) <= 1) candidates.push(rows[row + 1][col].id);
      }
      node.connections = shuffle(run, candidates).slice(0, Math.min(candidates.length, randomInt(run, 1, 2))).sort();
    }
  }
  keepEliteForksOptional(rows);
  return rows;
}

function keepEliteForksOptional(rows) {
  for (let row = 0; row < rows.length - 1; row += 1) {
    const nextRow = rows[row + 1];
    const hasElite = nextRow.some((node) => node.type === "elite");
    const safeOptions = nextRow.filter((node) => node.type !== "elite");
    if (!hasElite || !safeOptions.length) continue;
    for (const node of rows[row]) {
      const connected = node.connections.map((id) => nextRow.find((candidate) => candidate.id === id)).filter(Boolean);
      if (!connected.length || connected.some((candidate) => candidate.type !== "elite")) continue;
      const fallback = safeOptions
        .filter((candidate) => Math.abs(candidate.col - node.col) <= 1)
        .sort((left, right) => Math.abs(left.col - node.col) - Math.abs(right.col - node.col) || left.col - right.col)[0];
      if (fallback) node.connections = [...new Set([...node.connections, fallback.id])].sort();
    }
  }
}

function pickNodeType(run, row, col) {
  const localRow = row % 7;
  if (localRow === 0) return "combat";
  if (localRow === 4 && col === 0) return "elite";
  if (localRow === 4 && col === 1) return "shop";
  const eliteWeight = localRow >= 4 ? 14 : 0;
  const weights = [
    { value: "combat", weight: 48 },
    { value: "event", weight: 25 },
    { value: "elite", weight: eliteWeight },
    { value: "shop", weight: localRow >= 2 ? 8 : 3 },
    { value: "rest", weight: localRow >= 3 ? 7 : 2 }
  ];
  return weightedChoice(run, weights);
}

function startCombat(run, type = "combat", options = {}) {
  run.phase = "combat";
  run.stats.fights += 1;
  const enemies = createEnemiesForCombat(run, type, options.act);
  const deck = shuffle(run, run.player.deck.map((item) => ({ ...item, costMod: 0 })));
  run.player.statuses = {};
  run.player.block = 0;
  run.combat = {
    type,
    eventRewardRelic: options.rewardRelic ?? false,
    turn: 0,
    drawPile: deck,
    discardPile: [],
    hand: [],
    exhaustPile: [],
    enemies,
    selectedEnemyUid: enemies[0]?.uid ?? null,
    energy: 0,
    maxEnergy: baseEnergy(run),
    tempMaxEnergy: 0,
    cardsPlayedThisTurn: 0,
    attacksPlayedThisTurn: 0,
    skillsPlayedThisTurn: 0,
    turnCostMods: {},
    firstAttackPlayed: false,
    firstExhaustTriggered: false,
    relicTriggers: []
  };
  if (hasRelic(run, "dead_battery")) {
    loseHp(run, 2, "죽은 축전지");
    if (run.phase !== "combat" || !run.combat) return touch(run);
  }
  applyCombatStartRelics(run);
  if (run.phase !== "combat" || !run.combat) return touch(run);
  for (const enemy of enemies) chooseEnemyIntent(run, enemy, true);
  startPlayerTurn(run);
  if (run.phase !== "combat" || !run.combat) return touch(run);
  clearNextCombatFlags(run);
  addLog(run, `${combatTitle(type)} 시작.`, "combat");
  return touch(run);
}

function createEnemiesForCombat(run, type, act = 1) {
  if (type === "boss") {
    const bossId = BOSS_IDS[Math.max(0, Math.min(BOSS_IDS.length - 1, act - 1))];
    return [createEnemy(run, bossId)];
  }
  if (type === "elite") {
    return [createEnemy(run, choice(run, eliteEnemyPool(act)))];
  }
  const countChance = act <= 1 ? 0.22 : act === 2 ? 0.34 : 0.42;
  const count = random(run) < countChance ? 2 : 1;
  const pool = normalEnemyPool(act);
  return Array.from({ length: count }, () => createEnemy(run, choice(run, pool)));
}

function normalEnemyPool(act) {
  if (act <= 1) {
    return ["silt_clerk", "lantern_crab", "index_wisp", "glass_eel", "archive_leech", "drowned_page", "ledger_mite"];
  }
  if (act === 2) {
    return ["rust_choir", "brine_sentinel", "cipher_ray", "coral_hound", "archive_leech", "barnacle_drone", "null_squid", "mirror_jelly", "ledger_mite"];
  }
  return NORMAL_ENEMY_IDS;
}

function eliteEnemyPool(act) {
  if (act <= 1) return ["axiom_bailiff", "mnemonic_knight", "viral_cantor"];
  if (act === 2) return ["axiom_bailiff", "coral_engine", "mnemonic_knight", "viral_cantor"];
  return ELITE_ENEMY_IDS;
}

function createEnemy(run, enemyId, options = {}) {
  const template = ENEMY_BY_ID[enemyId];
  const difficulty = getDifficulty(run);
  const finalBossHp = template.tier === "boss" && template.act >= 3 ? (difficulty.finalBossHp ?? 1) : 1;
  const hp = Math.max(1, Math.round(randomInt(run, template.hp[0], template.hp[1]) * difficulty.enemyHp * finalBossHp * (options.hpScale ?? 1) * (run.runFlags.enemyHpMultiplier ?? 1)));
  return {
    uid: makeUid(run),
    templateId: enemyId,
    name: template.name,
    maxHp: hp,
    hp,
    block: 0,
    statuses: {},
    phase: 1,
    moveCursor: randomInt(run, 0, template.moves.length - 1),
    nextMove: null,
    summoned: Boolean(options.summoned)
  };
}

function startPlayerTurn(run) {
  const combat = run.combat;
  combat.turn += 1;
  if (combat.turn > 1) run.player.block = 0;
  combat.turnCostMods = {};
  combat.cardsPlayedThisTurn = 0;
  combat.attacksPlayedThisTurn = 0;
  combat.skillsPlayedThisTurn = 0;
  combat.energy = combat.maxEnergy + combat.tempMaxEnergy;
  combat.tempMaxEnergy = 0;

  if (getStatus(run.player, "virus") > 0) {
    directDamagePlayer(run, getStatus(run.player, "virus"), "바이러스");
    if (run.phase !== "combat") return;
    addStatus(run.player, "virus", -1);
  }
  if (getStatus(run.player, "plated") > 0) {
    gainBlock(run, getStatus(run.player, "plated"), "도금");
    addStatus(run.player, "plated", -1);
  }
  if (getStatus(run.player, "contagion") > 0) {
    applyToEnemies(run, (enemy) => addStatus(enemy, "virus", getStatus(run.player, "contagion")));
  }
  if (getStatus(run.player, "nextEnergy") > 0) {
    combat.energy += getStatus(run.player, "nextEnergy");
    run.player.statuses.nextEnergy = 0;
  }
  if (getStatus(run.player, "pearlEngine") > 0 && getStatus(run.player, "charge") >= getStatus(run.player, "pearlEngine")) {
    combat.energy += 1;
    addLog(run, "진주 엔진이 추가 에너지를 공급합니다.", "relic");
  }
  if (hasRelic(run, "engine_oil") && combat.turn === 1) {
    combat.energy += 1;
    triggerRelic(run, "engine_oil");
  }
  if (hasRelic(run, "pearl_turbine") && getStatus(run.player, "charge") > 0) {
    gainBlock(run, 3, "진주 터빈");
    triggerRelic(run, "pearl_turbine");
  }
  if (hasRelic(run, "sealed_hourglass") && combat.turn % 3 === 0) {
    triggerRelic(run, "sealed_hourglass");
    applyToEnemies(run, (enemy) => {
      addStatus(enemy, "weak", 1);
      addStatus(enemy, "vulnerable", 1);
    });
  }

  let drawAmount = 5;
  if (getStatus(run.player, "deepIndex") > 0) drawAmount += getStatus(run.player, "deepIndex");
  if (hasRelic(run, "salted_compass") && combat.turn === 1) {
    drawAmount += 1;
    triggerRelic(run, "salted_compass");
  }
  if (hasRelic(run, "clockwork_gill") && run.player.hp <= run.player.maxHp / 2) {
    drawAmount += 1;
    triggerRelic(run, "clockwork_gill");
  }
  if (combat.turn === 1 && combatStartFlag(run, "firstTurnDraw")) drawAmount += combatStartFlag(run, "firstTurnDraw");
  drawCards(run, drawAmount);
  if (run.player.hp <= 0) loseRun(run, "상태 피해로 쓰러졌습니다.");
}

function drawCards(run, amount) {
  const combat = run.combat;
  for (let count = 0; count < amount; count += 1) {
    if (combat.drawPile.length === 0) {
      if (combat.discardPile.length === 0) return;
      combat.drawPile = shuffle(run, combat.discardPile);
      combat.discardPile = [];
      addLog(run, "버림 더미를 섞어 뽑기 더미로 되돌렸습니다.", "system");
    }
    const card = combat.drawPile.pop();
    const template = getCard(card);
    if (template.id === "waterlogged_doubt") {
      addStatus(run.player, "frail", 1);
      addLog(run, "젖은 의심이 균열을 남깁니다.", "curse");
    }
    if (combat.hand.length >= 10) combat.discardPile.push(card);
    else combat.hand.push(card);
  }
}

function addGeneratedCardToCombat(run, card, zone = "hand") {
  const combat = run.combat;
  if (!combat) return;
  if (zone === "discard") {
    combat.discardPile.push(card);
    return;
  }
  if (combat.hand.length >= 10) {
    combat.discardPile.push(card);
    addLog(run, `${getCard(card).name} 생성 공간 부족: 버림 더미로 보냈습니다.`, "system");
    return;
  }
  combat.hand.push(card);
}

function enemyTurn(run, enemy) {
  if (enemy.hp <= 0) return;
  enemy.block = 0;
  if (getStatus(enemy, "virus") > 0) {
    const bonus = hasRelic(run, "red_ledger") ? 1 : 0;
    if (bonus) triggerRelic(run, "red_ledger");
    directDamageEnemy(run, enemy, getStatus(enemy, "virus") + bonus, "바이러스");
    addStatus(enemy, "virus", -1);
    if (enemy.hp <= 0) return;
  }

  const move = enemy.nextMove;
  if (!move) return;
  if (move.block) {
    enemy.block += move.block;
    addLog(run, `${enemy.name}: 방어도 ${move.block}.`, "enemy");
  }
  for (const status of move.self ?? []) addStatus(enemy, status.status, status.amount);
  if (move.heal) {
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + move.heal);
    addLog(run, `${enemy.name}: 체력 ${move.heal} 회복.`, "enemy");
  }
  if (move.summon) {
    summonEnemies(run, move.summon, enemy);
  }
  if (move.damage) {
    const hits = move.hits ?? 1;
    for (let hit = 0; hit < hits; hit += 1) {
      enemyAttack(run, enemy, Math.round(move.damage * getDifficulty(run).enemyDamage));
      if (run.player.hp <= 0) {
        loseRun(run, `${enemy.name}의 공격으로 쓰러졌습니다.`);
        return;
      }
    }
  }
  for (const status of move.applyToPlayer ?? []) addStatus(run.player, status.status, status.amount);
}

function summonEnemies(run, summons, summoner) {
  const combat = run.combat;
  for (const summon of summons) {
    for (let count = 0; count < (summon.count ?? 1); count += 1) {
      if (getAliveEnemies(run).length >= 4) {
        addLog(run, `${summoner.name}: 소환 공간이 부족합니다.`, "enemy");
        return;
      }
      const summoned = createEnemy(run, summon.enemyId, { hpScale: summon.hpScale ?? 0.55, summoned: true });
      combat.enemies.push(summoned);
      chooseEnemyIntent(run, summoned, true);
      if (!combat.selectedEnemyUid || !getTargetEnemy(run, combat.selectedEnemyUid)) {
        combat.selectedEnemyUid = summoned.uid;
      }
      addLog(run, `${summoner.name}: ${summoned.name} 소환.`, "enemy");
    }
  }
}

function combatVictoryAchieved(run) {
  const combat = run.combat;
  if (!combat) return false;
  const alive = getAliveEnemies(run);
  if (alive.length === 0) return true;
  if (combat.type !== "boss") return false;
  return !alive.some((enemy) => ENEMY_BY_ID[enemy.templateId]?.tier === "boss");
}

function chooseEnemyIntent(run, enemy, initial = false) {
  const template = ENEMY_BY_ID[enemy.templateId];
  const phase = enemyPhase(enemy);
  const pool = template.moves.filter((move) => !move.phase || move.phase <= phase);
  if (!initial) enemy.moveCursor += 1;
  enemy.phase = phase;
  enemy.nextMove = pool[Math.abs(enemy.moveCursor) % pool.length];
}

function applyEffects(run, effects, target, sourceCard = null) {
  for (const effect of effects) {
    applyEffect(run, effect, target, sourceCard);
    if (run.phase !== "combat") return;
  }
}

function applyEffect(run, effect, target, sourceCard) {
  const combat = run.combat;
  switch (effect.op) {
    case "damage": {
      const targets = effect.target === "allEnemies" ? getAliveEnemies(run) : [target].filter(Boolean);
      for (const enemy of targets) {
        for (let hit = 0; hit < (effect.hits ?? 1); hit += 1) {
          playerAttack(run, enemy, effect.amount, sourceCard);
        }
      }
      break;
    }
    case "damageByCharge":
      playerAttack(run, target, effect.base + getStatus(run.player, "charge") * effect.per, sourceCard);
      break;
    case "spendChargeDamage": {
      const spent = getStatus(run.player, "charge");
      run.player.statuses.charge = 0;
      playerAttack(run, target, effect.base + spent * effect.per, sourceCard);
      addLog(run, `전하 ${spent} 소비.`, "card");
      break;
    }
    case "damagePerExhaust":
      playerAttack(run, target, combat.exhaustPile.length * effect.amount, sourceCard);
      break;
    case "block":
      gainBlock(run, effect.amount, sourceCard?.name);
      break;
    case "blockPerHand":
      gainBlock(run, combat.hand.length * effect.amount, sourceCard?.name);
      break;
    case "apply": {
      const amount = adjustedAppliedStatus(run, effect.status, effect.amount);
      if (effect.target === "allEnemies") applyToEnemies(run, (enemy) => addStatus(enemy, effect.status, amount));
      else if (effect.target === "self") addStatus(run.player, effect.status, amount);
      else if (target) addStatus(target, effect.status, amount);
      break;
    }
    case "gainStatus":
      if (effect.target === "self") addStatus(run.player, effect.status, effect.amount);
      else if (target) addStatus(target, effect.status, effect.amount);
      break;
    case "draw":
      drawCards(run, effect.amount);
      break;
    case "gainEnergy":
      combat.energy += effect.amount;
      break;
    case "gainCharge":
      addStatus(run.player, "charge", Math.max(0, effect.amount + getStatus(run.player, "focus")));
      break;
    case "gainFocus":
      addStatus(run.player, "focus", effect.amount);
      break;
    case "generate":
      for (let index = 0; index < effect.amount; index += 1) {
        const generated = makeCard(run, effect.cardId, { upgraded: Boolean(effect.upgraded), temporary: Boolean(effect.temporary) });
        addGeneratedCardToCombat(run, generated, effect.zone);
      }
      break;
    case "discardRandom":
      for (let index = 0; index < effect.amount; index += 1) {
        if (combat.hand.length === 0) return;
        const discardIndex = randomInt(run, 0, combat.hand.length - 1);
        combat.discardPile.push(combat.hand.splice(discardIndex, 1)[0]);
      }
      break;
    case "upgradeRandomHand":
      shuffle(run, combat.hand.filter((card) => isUpgradeableCard(card))).slice(0, effect.amount).forEach((card) => {
        card.upgraded = true;
        addLog(run, `${getCard(card).name} 전투 중 강화.`, "deck");
      });
      break;
    case "discountRandomHand":
      shuffle(run, combat.hand).slice(0, effect.count ?? 1).forEach((card) => {
        combat.turnCostMods[card.uid] = (combat.turnCostMods[card.uid] ?? 0) - effect.amount;
      });
      break;
    case "exhaustRandomHand":
      for (let index = 0; index < effect.amount; index += 1) {
        if (combat.hand.length === 0) return;
        const exhaustIndex = randomInt(run, 0, combat.hand.length - 1);
        combat.exhaustPile.push(combat.hand.splice(exhaustIndex, 1)[0]);
        triggerExhaustRelics(run);
      }
      break;
    case "cleanse":
      cleanse(run.player, effect.amount);
      break;
    case "loseHp":
      loseHp(run, effect.amount, sourceCard?.name);
      break;
    case "heal":
      heal(run, effect.amount);
      break;
    case "gainGold":
      gainGold(run, effect.amount);
      break;
    case "ifEnemyStatus":
      if (target && getStatus(target, effect.status) > 0) applyEffects(run, effect.effects, target, sourceCard);
      break;
    case "ifPlayerBlock":
      if (run.player.block > 0) applyEffects(run, effect.effects, target, sourceCard);
      break;
    case "ifAttackCount":
      if (combat.attacksPlayedThisTurn >= effect.count) applyEffects(run, effect.effects, target, sourceCard);
      break;
    case "chargePerEnemy":
      addStatus(run.player, "charge", getAliveEnemies(run).length * effect.amount + getStatus(run.player, "focus"));
      break;
    case "resetHand": {
      const discarded = combat.hand.splice(0);
      combat.discardPile.push(...discarded);
      drawCards(run, discarded.length);
      combat.energy += effect.energy;
      break;
    }
    case "gainMaxEnergy":
      combat.maxEnergy += effect.amount;
      break;
    case "loseMaxHp":
      loseMaxHp(run, effect.amount);
      break;
    default:
      addLog(run, `알 수 없는 효과: ${effect.op}`, "warn");
  }
}

function playerAttack(run, enemy, amount, sourceCard) {
  if (!enemy || enemy.hp <= 0) return;
  let damage = Math.max(0, amount + getStatus(run.player, "strength"));
  if (getStatus(run.player, "weak") > 0) damage = Math.floor(damage * 0.75);
  if (getStatus(enemy, "vulnerable") > 0) damage = Math.ceil(damage * 1.5);
  if (getStatus(enemy, "mark") > 0) {
    const markBonus = 2 + (hasRelic(run, "lens_prism") ? 2 : 0);
    damage += markBonus;
    addStatus(enemy, "mark", -1);
    if (hasRelic(run, "lens_prism")) triggerRelic(run, "lens_prism");
  }
  damage = Math.max(0, damage);
  const blocked = Math.min(enemy.block, damage);
  enemy.block -= blocked;
  const dealt = damage - blocked;
  enemy.hp = Math.max(0, enemy.hp - dealt);
  run.stats.damageDealt += dealt;
  addLog(run, `${enemy.name}에게 피해 ${dealt}${blocked ? ` (방어 ${blocked})` : ""}.`, "damage");
  updateEnemyPhase(run, enemy);
  if (getStatus(enemy, "counter") > 0 && dealt > 0) directDamagePlayer(run, getStatus(enemy, "counter"), `${enemy.name} 반격`);
  if (sourceCard?.type === "attack" && hasRelic(run, "abyssal_needle")) {
    addStatus(enemy, "virus", 1);
    triggerRelic(run, "abyssal_needle");
  }
}

function enemyAttack(run, enemy, amount) {
  let damage = Math.max(0, amount + getStatus(enemy, "strength"));
  if (getStatus(enemy, "weak") > 0) damage = Math.floor(damage * 0.75);
  if (getStatus(run.player, "vulnerable") > 0) damage = Math.ceil(damage * 1.5);
  if (getStatus(run.player, "fragile") > 0) damage = Math.ceil(damage * 1.15);
  if (getStatus(run.player, "mark") > 0) {
    damage += 2;
    addStatus(run.player, "mark", -1);
  }
  const blocked = Math.min(run.player.block, damage);
  run.player.block -= blocked;
  const dealt = damage - blocked;
  run.player.hp = Math.max(0, run.player.hp - dealt);
  run.stats.damageTaken += dealt;
  addLog(run, `${enemy.name}의 공격: 피해 ${dealt}${blocked ? ` (방어 ${blocked})` : ""}.`, "enemy");
  if (getStatus(run.player, "counter") > 0 && dealt > 0) {
    directDamageEnemy(run, enemy, getStatus(run.player, "counter"), "반격");
  }
}

function directDamageEnemy(run, enemy, amount, source) {
  enemy.hp = Math.max(0, enemy.hp - amount);
  run.stats.damageDealt += amount;
  addLog(run, `${source}: ${enemy.name}에게 피해 ${amount}.`, "damage");
  updateEnemyPhase(run, enemy);
}

function directDamagePlayer(run, amount, source) {
  run.player.hp = Math.max(0, run.player.hp - amount);
  run.stats.damageTaken += amount;
  addLog(run, `${source}: 피해 ${amount}.`, "damage");
}

function gainBlock(run, amount, source = "방어") {
  let block = Math.max(0, amount + getStatus(run.player, "focus"));
  if (getStatus(run.player, "frail") > 0) block = Math.floor(block * 0.75);
  const before = run.player.block;
  run.player.block += block;
  addLog(run, `${source}: 방어도 ${block}.`, "block");
  if (run.player.block - before >= 12 && hasRelic(run, "counterweight")) {
    addStatus(run.player, "counter", 3);
    triggerRelic(run, "counterweight");
  }
}

function triggerCardRelics(run, card, target) {
  const combat = run.combat;
  if (hasRelic(run, "tide_metronome") && combat.cardsPlayedThisTurn % 3 === 0) {
    combat.energy += 1;
    triggerRelic(run, "tide_metronome");
  }
  if (card.type === "skill" && hasRelic(run, "glass_inkwell") && combat.skillsPlayedThisTurn % 2 === 0) {
    drawCards(run, 1);
    triggerRelic(run, "glass_inkwell");
  }
  if (card.type === "power" && hasRelic(run, "harmonic_spool")) {
    drawCards(run, 1);
    triggerRelic(run, "harmonic_spool");
  }
  if (card.type === "attack" && !combat.firstAttackPlayed) {
    combat.firstAttackPlayed = true;
    if (hasRelic(run, "cracked_anchor") && target) {
      addStatus(target, "mark", 2);
      triggerRelic(run, "cracked_anchor");
    }
  }
}

function triggerPowerSideEffects(run, card) {
  if (card.type === "skill" && getStatus(run.player, "choir") > 0) {
    const amount = getStatus(run.player, "choir");
    applyToEnemies(run, (enemy) => directDamageEnemy(run, enemy, amount, "성가 회로"));
  }
}

function triggerExhaustRelics(run) {
  const combat = run.combat;
  if (hasRelic(run, "recursive_key") && !combat.firstExhaustTriggered) {
    combat.firstExhaustTriggered = true;
    drawCards(run, 1);
    combat.energy += 1;
    triggerRelic(run, "recursive_key");
  }
}

function applyCombatStartRelics(run) {
  if (hasRelic(run, "brass_compass")) {
    addStatus(run.player, "charge", 2);
    triggerRelic(run, "brass_compass");
  }
  if (hasRelic(run, "coral_seal")) {
    addStatus(run.player, "plated", 2);
    triggerRelic(run, "coral_seal");
  }
  if (hasRelic(run, "mnemonic_shell")) {
    gainBlock(run, 6, "기억 소라");
    triggerRelic(run, "mnemonic_shell");
  }
  if (hasRelic(run, "quarantine_tag")) {
    applyToEnemies(run, (enemy) => addStatus(enemy, "virus", 2));
    triggerRelic(run, "quarantine_tag");
  }
  if (hasRelic(run, "pressure_vial")) {
    applyToEnemies(run, (enemy) => addStatus(enemy, "vulnerable", 1));
    addStatus(run.player, "frail", 1);
    triggerRelic(run, "pressure_vial");
  }
  if (hasRelic(run, "echo_chamber")) {
    addStatus(run.player, "echo", 1);
    triggerRelic(run, "echo_chamber");
  }
  if (hasRelic(run, "choir_bell")) {
    addStatus(run.player, "choir", 1);
    triggerRelic(run, "choir_bell");
  }
  const enemyStartVirus = combatStartFlag(run, "enemyStartVirus");
  const startFrail = combatStartFlag(run, "startFrail");
  const startVulnerable = combatStartFlag(run, "startVulnerable");
  const startWeak = combatStartFlag(run, "startWeak");
  const startCharge = combatStartFlag(run, "startCharge");
  if (enemyStartVirus) applyToEnemies(run, (enemy) => addStatus(enemy, "virus", enemyStartVirus));
  if (startFrail) addStatus(run.player, "frail", startFrail);
  if (startVulnerable) addStatus(run.player, "vulnerable", startVulnerable);
  if (startWeak) addStatus(run.player, "weak", startWeak);
  if (startCharge) addStatus(run.player, "charge", startCharge);
}

function combatStartFlag(run, flag) {
  return (run.runFlags?.[flag] ?? 0) + (run.nextCombatFlags?.[flag] ?? 0);
}

function clearNextCombatFlags(run) {
  if (!run.nextCombatFlags || Object.keys(run.nextCombatFlags).length === 0) return;
  run.nextCombatFlags = {};
  addLog(run, "예비 보정이 이번 전투에 적용되었습니다.", "event");
}

function winCombat(run) {
  const combat = run.combat;
  const node = findNode(run, run.currentNodeId);
  run.stats.enemiesKilled += combat.enemies.length;
  if (combat.type === "elite") run.stats.elitesKilled += 1;
  if (combat.type === "boss") run.stats.bossesKilled += 1;
  run.phase = "reward";
  const forcedRelic = combat.type === "elite" || combat.type === "boss" || combat.eventRewardRelic;
  run.reward = createReward(run, combat.type, forcedRelic);
  run.combat = null;
  addLog(run, `${node?.type === "boss" ? "보스" : "전투"} 승리. 보상을 선택하세요.`, "reward");
  return touch(run);
}

function createReward(run, type, forcedRelic = false) {
  const cardCount = (hasRelic(run, "map_of_silt") ? 4 : 3) + (run.runFlags.rewardCardBonus ?? 0);
  if (hasRelic(run, "map_of_silt")) triggerRelic(run, "map_of_silt");
  let gold = randomInt(run, 18, 32);
  if (type === "elite") gold += 20;
  if (type === "boss") gold += 45;
  if (type === "elite" && run.runFlags.eliteGoldBonus) gold += run.runFlags.eliteGoldBonus;
  if (hasRelic(run, "salvaged_lens")) {
    gold += 10;
    triggerRelic(run, "salvaged_lens");
  }
  if (type === "elite" && hasRelic(run, "diver_medal")) {
    gold += 35;
    triggerRelic(run, "diver_medal");
  }
  if (hasRelic(run, "brittle_crown")) gold = Math.floor(gold * 0.75);
  if (run.runFlags.rewardGoldMultiplier) gold = Math.floor(gold * run.runFlags.rewardGoldMultiplier);
  gold = Math.floor(gold * getDifficulty(run).gold);
  const relicDrop = forcedRelic || random(run) < 0.35;
  return {
    cards: uniqueRandomCards(run, cardCount),
    gold,
    relicId: null,
    relicChoices: relicDrop ? uniqueRandomRelics(run, 3) : [],
    selectedCardId: null,
    cardSkipped: false,
    selectedRelicId: null,
    sourceType: type
  };
}

function collectRewardAndComplete(run) {
  if (!run.reward) return run;
  normalizeReward(run.reward);
  if (!rewardCardDecided(run.reward) || !rewardRelicDecided(run.reward)) return touch(run);
  const pickedCard = run.reward.selectedCardId;
  const pickedRelic = run.reward.selectedRelicId ?? run.reward.relicId ?? null;
  if (run.reward.gold) gainGold(run, run.reward.gold);
  if (pickedCard) {
    addDeckCard(run, pickedCard);
    run.stats.cardsAdded += 1;
    const pickedCardName = getCard(pickedCard).name;
    addLog(run, `${pickedCardName}${koreanObjectParticle(pickedCardName)} 덱에 추가했습니다.`, "reward");
  } else {
    if (hasRelic(run, "austere_tablet")) {
      gainMaxHp(run, 1);
      triggerRelic(run, "austere_tablet");
    }
    addLog(run, "카드 보상을 건너뛰었습니다.", "reward");
  }
  if (pickedRelic) addRelic(run, pickedRelic);
  run.reward = null;
  completeNode(run);
  return touch(run);
}

function koreanObjectParticle(text) {
  const last = [...String(text).trim()].pop();
  if (!last) return "을";
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "을";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

function rewardCardDecided(reward) {
  return !reward.cards?.length || Boolean(reward.selectedCardId) || Boolean(reward.cardSkipped);
}

function rewardRelicDecided(reward) {
  return !reward.relicChoices?.length || Boolean(reward.selectedRelicId);
}

function completeNode(run) {
  const node = findNode(run, run.currentNodeId);
  if (!node) return run;
  const alreadyCompleted = Boolean(node.completed);
  node.completed = true;
  if (node.type === "boss" && node.act === 3) {
    return winRun(run);
  }
  if (node.type === "boss") {
    const recovery = alreadyCompleted ? 0 : bossRecoveryAmount(run);
    const beforeHp = run.player.hp;
    if (recovery > 0) heal(run, recovery);
    const recovered = Math.max(0, run.player.hp - beforeHp);
    const boss = ENEMIES.find((enemy) => enemy.tier === "boss" && enemy.act === node.act) ?? ENEMY_BY_ID[BOSS_IDS[node.act - 1]];
    const nextBoss = ENEMIES.find((enemy) => enemy.tier === "boss" && enemy.act === node.act + 1) ?? ENEMY_BY_ID[BOSS_IDS[node.act]];
    const presentationKey = actInterludePresentationKey(node, boss, nextBoss);
    const alreadySeen = alreadyCompleted || seenActInterludeKeys(run).includes(presentationKey);
    run.lastInterlude = {
      type: "act-transition",
      fromAct: node.act,
      toAct: node.act + 1,
      floor: node.row + 1,
      bossName: boss?.name ?? "보스",
      nextBossName: nextBoss?.name ?? "다음 보스",
      recovery,
      recovered,
      hpAfter: run.player.hp,
      maxHp: run.player.maxHp,
      presentationKey,
      ackRequired: !alreadySeen,
      dismissed: alreadySeen,
      seenAt: alreadySeen ? Date.now() : null,
      dismissedAt: alreadySeen ? Date.now() : null,
      at: Date.now()
    };
    if (!alreadyCompleted) addLog(run, "보스를 넘기고 장비를 재정비했습니다.", "rest");
  } else {
    run.lastInterlude = null;
  }
  const nextRow = run.map[node.row + 1];
  if (!nextRow) return winRun(run);
  run.availableNodeIds = node.connections.length ? node.connections : nextRow.map((item) => item.id);
  run.phase = "map";
  run.currentNodeId = null;
  run.event = null;
  run.shop = null;
  return run;
}

function actInterludePresentationKey(node, boss, nextBoss) {
  const bossKey = boss?.id ?? boss?.name ?? "boss";
  const nextBossKey = nextBoss?.id ?? nextBoss?.name ?? "next";
  return `act-${node.act}-${node.act + 1}-${node.row + 1}-${bossKey}-${nextBossKey}`;
}

function seenActInterludeKeys(run) {
  run.runFlags ??= {};
  if (!Array.isArray(run.runFlags.seenActInterludes)) run.runFlags.seenActInterludes = [];
  return run.runFlags.seenActInterludes;
}

function startEvent(run) {
  run.phase = "event";
  run.seenEventIds ??= [];
  const used = new Set(run.seenEventIds);
  const pool = EVENTS.filter((eventDefinition) => !used.has(eventDefinition.id));
  const eventDefinition = choice(run, pool.length ? pool : EVENTS);
  if (!used.has(eventDefinition.id)) run.seenEventIds.push(eventDefinition.id);
  run.event = { eventId: eventDefinition.id, chosen: null };
  addLog(run, `${eventDefinition.name} 발견.`, "event");
  return touch(run);
}

function startShop(run) {
  run.phase = "shop";
  const cards = uniqueRandomCards(run, 5).map((cardId) => ({ cardId, price: shopCardPrice(run, cardId), sold: false }));
  const relics = uniqueRandomRelics(run, 3).map((relicId) => ({ relicId, price: shopRelicPrice(run, relicId), sold: false }));
  run.shop = { cards, relics };
  addLog(run, "마켓에 도착했습니다.", "shop");
  return touch(run);
}

function startRest(run) {
  run.phase = "rest";
  addLog(run, "세이프룸에 도착했습니다.", "rest");
  return touch(run);
}

function applyRunOperations(run, operations, context = {}) {
  for (const operation of operations) {
    switch (operation.op) {
      case "loseHp":
        loseHp(run, operation.amount, context.source);
        break;
      case "heal":
        heal(run, operation.amount);
        break;
      case "gainGold":
        gainGold(run, operation.amount);
        break;
      case "loseGold":
        run.player.gold = Math.max(0, run.player.gold - operation.amount);
        break;
      case "gainMaxHp":
        gainMaxHp(run, operation.amount);
        break;
      case "loseMaxHp":
        loseMaxHp(run, operation.amount);
        break;
      case "upgradeRandomDeck":
        upgradeRandomDeck(run, operation.amount);
        break;
      case "gainRelic":
        addRelic(run, randomRelic(run, operation.rarity));
        break;
      case "addCard":
        addDeckCard(run, operation.cardId);
        run.stats.cardsAdded += 1;
        break;
      case "addRandomCard":
        addDeckCard(run, randomRewardCard(run, operation));
        run.stats.cardsAdded += 1;
        break;
      case "removeCard":
        removeRandomDeckCard(run);
        break;
      case "duplicateCard":
        duplicateRandomDeckCard(run);
        break;
      case "transformCard":
        transformRandomDeckCard(run, operation.rarity);
        break;
      case "cardReward":
        run.phase = "reward";
        if (hasRelic(run, "map_of_silt")) triggerRelic(run, "map_of_silt");
        run.reward = { cards: uniqueRandomCards(run, hasRelic(run, "map_of_silt") ? 4 : 3, operation.rarity), gold: 0, relicId: null, sourceType: "event" };
        break;
      case "chanceRelic":
        if (random(run) < operation.chance) addRelic(run, randomRelic(run));
        break;
      case "chanceCurse":
        if (random(run) < operation.chance) {
          addDeckCard(run, "waterlogged_doubt");
          run.stats.cardsAdded += 1;
        }
        break;
      case "gainRunFlag":
        if (operation.scope === "nextCombat") {
          run.nextCombatFlags ??= {};
          run.nextCombatFlags[operation.flag] = (run.nextCombatFlags[operation.flag] ?? 0) + operation.amount;
        } else {
          run.runFlags[operation.flag] = (run.runFlags[operation.flag] ?? 0) + operation.amount;
        }
        break;
      case "eventCombat":
        startCombat(run, "combat", { rewardRelic: Boolean(operation.rewardRelic) });
        break;
      default:
        addLog(run, `알 수 없는 이벤트 효과: ${operation.op}`, "warn");
    }
    if (run.phase === "summary") return;
  }
}

export function canChooseEventOption(run, operations = []) {
  return !eventChoiceBlockReason(run, operations);
}

export function eventChoiceBlockReason(run, operations = []) {
  if (!canPayOperations(run, operations)) return "cost";
  if (!eventChoiceHasMeaningfulOutcome(run, operations)) return "noValue";
  return null;
}

function canPayOperations(run, operations = []) {
  return operations.every((operation) => {
    if (operation.op === "loseGold") return run.player.gold >= operation.amount;
    return true;
  });
}

function eventChoiceHasMeaningfulOutcome(run, operations = []) {
  if (!operations.length) return true;
  return operations.some((operation) => eventOperationHasValue(run, operation));
}

function eventOperationHasValue(run, operation) {
  switch (operation.op) {
    case "loseHp":
    case "loseGold":
    case "loseMaxHp":
    case "chanceCurse":
      return false;
    case "heal":
      return run.player.hp < run.player.maxHp;
    case "upgradeRandomDeck":
      return hasUpgradeableCards(run);
    case "removeCard":
      return run.player.deck.length > 1;
    case "duplicateCard":
    case "transformCard":
      return run.player.deck.length > 0;
    case "gainRunFlag":
      return operation.flag === "startCharge";
    default:
      return true;
  }
}

function addDeckCard(run, cardId, options = {}) {
  run.player.deck.push(makeCard(run, cardId, options));
  const card = getCard(cardId);
  for (const keyword of card.keywords ?? []) run.stats.buildTags[keyword] = (run.stats.buildTags[keyword] ?? 0) + 1;
}

function removeRandomDeckCard(run) {
  if (run.player.deck.length <= 1) return;
  const removable = run.player.deck.filter((card) => getCard(card).rarity !== "curse");
  const picked = choice(run, removable.length ? removable : run.player.deck);
  run.player.deck = run.player.deck.filter((card) => card.uid !== picked.uid);
  run.stats.cardsRemoved += 1;
  addLog(run, `${getCard(picked).name} 제거.`, "deck");
}

function duplicateRandomDeckCard(run) {
  const picked = choice(run, run.player.deck);
  addDeckCard(run, picked.cardId, { upgraded: picked.upgraded });
  run.stats.cardsAdded += 1;
  addLog(run, `${getCard(picked).name} 복제.`, "deck");
}

function transformRandomDeckCard(run, rarity = null) {
  if (run.player.deck.length === 0) return;
  const index = randomInt(run, 0, run.player.deck.length - 1);
  const old = run.player.deck[index];
  const newCardId = randomRewardCard(run, { rarity });
  run.player.deck[index] = makeCard(run, newCardId);
  addLog(run, `${getCard(old).name}이 ${getCard(newCardId).name}(으)로 변환.`, "deck");
}

function upgradeRandomDeck(run, amount) {
  const candidates = run.player.deck.filter((card) => isUpgradeableCard(card));
  shuffle(run, candidates).slice(0, amount).forEach((card) => {
    card.upgraded = true;
    addLog(run, `${getCard(card).name} 강화.`, "deck");
  });
}

function uniqueRandomCards(run, count, forcedRarity = null) {
  const picked = new Set();
  while (picked.size < count && picked.size < REWARD_CARD_IDS.length) {
    picked.add(randomRewardCard(run, { rarity: forcedRarity }));
  }
  return [...picked];
}

function randomRewardCard(run, filter = {}) {
  const rarity = filter.rarity ?? weightedChoice(run, RARITY_WEIGHTS);
  let pool = REWARD_CARD_IDS.map((cardId) => CARD_BY_ID[cardId]).filter((card) => card.rarity === rarity);
  if (filter.type) pool = pool.filter((card) => card.type === filter.type);
  if (filter.tag) pool = pool.filter((card) => card.keywords?.includes(filter.tag) || card.id.includes(filter.tag));
  if (pool.length === 0) pool = REWARD_CARD_IDS.map((cardId) => CARD_BY_ID[cardId]).filter((card) => card.type !== "curse");
  return choice(run, pool).id;
}

function randomRelic(run, forcedRarity = null, excludedRelicIds = []) {
  const owned = new Set([...run.player.relics, ...excludedRelicIds]);
  let pool = REWARD_RELIC_IDS.map((id) => RELIC_BY_ID[id]).filter((relic) => !owned.has(relic.id));
  if (forcedRarity) pool = pool.filter((relic) => relic.rarity === forcedRarity);
  if (pool.length === 0) pool = REWARD_RELIC_IDS.map((id) => RELIC_BY_ID[id]).filter((relic) => !owned.has(relic.id));
  return pool.length ? choice(run, pool).id : null;
}

function uniqueRandomRelics(run, count, forcedRarity = null) {
  const picked = new Set();
  while (picked.size < count) {
    const relicId = randomRelic(run, forcedRarity, picked);
    if (!relicId) break;
    picked.add(relicId);
  }
  return [...picked];
}

function addRelic(run, relicId) {
  if (!relicId || run.player.relics.includes(relicId)) return;
  run.player.relics.push(relicId);
  run.stats.relicsFound += 1;
  addLog(run, `${RELIC_BY_ID[relicId].name} 획득.`, "relic");
  if (relicId === "brittle_crown") {
    gainGold(run, 90);
    triggerRelic(run, "brittle_crown");
  }
}

function shopPrice(run, base) {
  return Math.max(1, Math.floor(base * (hasRelic(run, "flooded_coin") ? 0.85 : 1) * (run.runFlags.shopPriceMultiplier ?? 1)));
}

function shopCardPrice(run, cardId) {
  const rarity = getCard(cardId).rarity;
  const base = rarity === "rare" ? 125 : rarity === "uncommon" ? 82 : 55;
  return shopPrice(run, base);
}

function shopRelicPrice(run, relicId) {
  const rarity = RELIC_BY_ID[relicId].rarity;
  const base = rarity === "rare" ? 185 : rarity === "uncommon" ? 145 : 110;
  return shopPrice(run, base);
}

function winRun(run) {
  run.phase = "summary";
  run.summary = buildSummary(run, true, "마지막 문 성가대를 넘어 심해 코어를 회수했습니다.");
  clearTransientRunState(run);
  addLog(run, "런 승리.", "system");
  return touch(run);
}

function loseRun(run, reason) {
  run.phase = "summary";
  run.summary = buildSummary(run, false, reason);
  clearTransientRunState(run);
  addLog(run, `패배: ${reason}`, "system");
  return touch(run);
}

export function abandonRun(run, reason = "탐사를 중단하고 이번 런을 기록했습니다.") {
  run.phase = "summary";
  run.summary = { ...buildSummary(run, false, reason), abandoned: true };
  clearTransientRunState(run);
  addLog(run, "런 포기.", "system");
  return touch(run);
}

function clearTransientRunState(run) {
  run.combat = null;
  run.reward = null;
  run.event = null;
  run.shop = null;
  run.selector = null;
}

function buildSummary(run, won, reason) {
  const completedBossNodes = run.map.flat().filter((node) => node.type === "boss" && node.completed);
  const killedBosses = completedBossNodes.map((node) => {
    const bossId = BOSS_IDS[Math.max(0, Math.min(BOSS_IDS.length - 1, node.act - 1))];
    return ENEMY_BY_ID[bossId]?.name ?? bossId;
  });
  const difficulty = getDifficulty(run);
  return {
    won,
    reason,
    seed: run.seed,
    difficultyId: difficulty.id,
    difficulty: difficulty.name,
    ...challengeSummary(run),
    durationSeconds: Math.max(0, Math.round((Date.now() - run.createdAt) / 1000)),
    floors: run.stats.floors,
    bossesDefeated: completedBossNodes.length,
    killedBosses,
    hp: run.player.hp,
    maxHp: run.player.maxHp,
    fights: run.stats.fights,
    elitesKilled: run.stats.elitesKilled,
    cardsAdded: run.stats.cardsAdded,
    cardsRemoved: run.stats.cardsRemoved,
    deckSize: run.player.deck.length,
    relics: run.player.relics.length,
    gold: run.player.gold,
    killed: run.stats.enemiesKilled,
    damageDealt: run.stats.damageDealt,
    damageTaken: run.stats.damageTaken,
    finalCombat: summarizeFinalCombat(run),
    route: summarizeRoute(run),
    build: summarizeBuild(run)
  };
}

function summarizeFinalCombat(run) {
  if (!run.combat) return null;
  const aliveEnemies = getAliveEnemies(run);
  const boss =
    aliveEnemies.find((enemy) => ENEMY_BY_ID[enemy.templateId]?.tier === "boss") ??
    run.combat.enemies.find((enemy) => ENEMY_BY_ID[enemy.templateId]?.tier === "boss") ??
    null;
  const focusEnemy = boss ?? aliveEnemies[0] ?? run.combat.enemies[0] ?? null;
  const template = focusEnemy ? ENEMY_BY_ID[focusEnemy.templateId] : null;
  const forecast = enemyIntentForecast(run);
  return {
    type: run.combat.type,
    turn: run.combat.turn,
    enemyCount: aliveEnemies.length,
    bossId: boss?.templateId ?? null,
    bossName: boss?.name ?? null,
    bossHp: boss?.hp ?? null,
    bossMaxHp: boss?.maxHp ?? null,
    bossBlock: boss?.block ?? null,
    bossPhase: boss?.phase ?? null,
    bossMove: boss?.nextMove?.id ?? null,
    bossIntent: boss?.nextMove?.intent ?? "",
    focusEnemyId: focusEnemy?.templateId ?? null,
    focusEnemyName: focusEnemy?.name ?? null,
    focusEnemyTier: template?.tier ?? null,
    playerHp: run.player.hp,
    playerBlock: run.player.block,
    playerStatuses: summarizePositiveStatuses(run.player.statuses),
    forecast,
    handPlan: summarizeFinalCombatHandPlan(run, focusEnemy, forecast)
  };
}

function summarizePositiveStatuses(statuses = {}) {
  return Object.fromEntries(Object.entries(statuses).filter(([, value]) => value > 0));
}

function summarizeFinalCombatHandPlan(run, target, forecast = enemyIntentForecast(run)) {
  const combat = run.combat;
  if (!combat) return null;
  const previews = combat.hand
    .map((card) => cardPlayPreview(run, card, target?.uid))
    .filter((preview) => preview.playable);
  const bestBlock = bestPreviewTotalForSummary(previews, combat.energy, "block");
  const retainedCards = combat.hand.map((card) => effectiveCard(card)).filter((card) => card.retain);
  const retainedProfiles = retainedCards.map((card) => finalCombatCardDefenseProfile(card));
  const retainedDefenseBlock = retainedProfiles.reduce((total, profile) => total + profile.block, 0);
  const retainedWeak = retainedProfiles.reduce((total, profile) => total + profile.weak, 0);
  const retainedPlated = retainedProfiles.reduce((total, profile) => total + profile.plated, 0);
  const retainedBurstCards = retainedCards
    .map((card, index) => ({ card, profile: retainedProfiles[index] }))
    .filter((entry) => finalCombatSupportsBurstDefense(entry.profile));
  const incomingDamage = Math.max(0, forecast?.incomingDamage ?? 0);
  const currentCover = Math.max(0, run.player.block + bestBlock);
  return {
    handSize: combat.hand.length,
    playableCards: previews.length,
    energy: combat.energy,
    bestBlock,
    currentCover,
    incomingDamage,
    remainingRisk: Math.max(0, incomingDamage - currentCover),
    retainedCards: retainedCards.length,
    retainedBurstDefense: retainedBurstCards.length,
    retainedDefenseBlock,
    retainedWeak,
    retainedPlated,
    plated: getStatus(run.player, "plated"),
    retainedDefenseNames: retainedBurstCards.map((entry) => entry.card.name).slice(0, 3)
  };
}

function bestPreviewTotalForSummary(previews, energy, key) {
  const budget = Math.max(0, Math.floor(energy));
  const totals = Array(budget + 1).fill(0);
  for (const preview of previews) {
    const value = Math.max(0, Math.floor(preview[key] ?? 0));
    if (value <= 0) continue;
    const cost = Math.max(0, Math.min(budget, Math.floor(preview.cost ?? 0)));
    for (let spent = budget; spent >= cost; spent -= 1) {
      totals[spent] = Math.max(totals[spent], totals[spent - cost] + value);
    }
  }
  return Math.max(...totals);
}

function finalCombatCardDefenseProfile(card) {
  const profile = { block: 0, weak: 0, plated: 0 };
  for (const effect of finalCombatCardEffects(card.effects ?? [])) {
    if (effect.op === "block") profile.block += effect.amount ?? 0;
    if (effect.op === "blockPerHand") profile.block += (effect.amount ?? 0) * 5;
    if (effect.op === "gainStatus" && effect.target === "self" && effect.status === "plated") profile.plated += effect.amount ?? 0;
    if (effect.op === "apply" && effect.status === "weak" && ["enemy", "allEnemies"].includes(effect.target)) profile.weak += effect.amount ?? 0;
  }
  return profile;
}

function finalCombatCardEffects(effects = []) {
  const output = [];
  for (const effect of effects) {
    output.push(effect);
    if (effect.effects) output.push(...finalCombatCardEffects(effect.effects));
  }
  return output;
}

function finalCombatSupportsBurstDefense(profile) {
  return profile.block >= 11 || profile.weak >= 1 || profile.plated >= 2;
}

function summarizeRoute(run) {
  const currentNode = findNode(run, run.currentNodeId);
  const reachedNodes = run.map
    .flat()
    .filter((node) => node.completed || node.id === currentNode?.id)
    .sort((left, right) => left.row - right.row || left.col - right.col);
  const acts = [1, 2, 3].map((act) => {
    const nodes = reachedNodes.filter((node) => node.act === act);
    const counts = { combat: 0, elite: 0, event: 0, shop: 0, rest: 0, boss: 0 };
    for (const node of nodes) counts[node.type] = (counts[node.type] ?? 0) + 1;
    const last = nodes.at(-1) ?? null;
    const bossNode = nodes.find((node) => node.type === "boss");
    return {
      act,
      floors: nodes.length,
      ...counts,
      lastFloor: last ? last.row + 1 : 0,
      stoppedAt: last ? { floor: last.row + 1, type: last.type, completed: Boolean(last.completed) } : null,
      boss: bossNode?.completed ? "defeated" : bossNode ? "reached" : "unseen"
    };
  });
  return {
    totalFloors: reachedNodes.length,
    elites: reachedNodes.filter((node) => node.type === "elite").length,
    events: reachedNodes.filter((node) => node.type === "event").length,
    shops: reachedNodes.filter((node) => node.type === "shop").length,
    rests: reachedNodes.filter((node) => node.type === "rest").length,
    bosses: reachedNodes.filter((node) => node.type === "boss").length,
    acts
  };
}

function summarizeBuild(run) {
  const scores = Object.fromEntries(BUILD_CONCEPTS.map((concept) => [concept.id, 0]));
  for (const card of run.player.deck) {
    const template = effectiveCard(card);
    const keywords = new Set(template.keywords ?? []);
    const effects = new Set(buildEffectOps(template.effects ?? []));
    for (const concept of BUILD_CONCEPTS) {
      const keywordHits = concept.keywords.filter((keyword) => keywords.has(keyword)).length;
      const effectHits = concept.effects.filter((effect) => effects.has(effect)).length;
      scores[concept.id] += keywordHits * 2 + effectHits;
      if (concept.id === "ward" && template.type === "skill") scores[concept.id] += 0.5;
      if (concept.id === "mark" && template.type === "attack" && keywords.has("mark")) scores[concept.id] += 0.5;
      if (concept.id === "cycle" && template.cost === 0 && (keywords.has("exhaust") || keywords.has("temporary") || effects.has("draw"))) scores[concept.id] += 0.25;
    }
  }
  return Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key]) => key);
}

function buildEffectOps(effects = []) {
  const ops = [];
  for (const effect of effects) {
    ops.push(effect.op);
    if (effect.effects) ops.push(...buildEffectOps(effect.effects));
  }
  return ops;
}

function makeCard(run, cardId, options = {}) {
  return {
    uid: makeUid(run),
    cardId,
    upgraded: Boolean(options.upgraded),
    temporary: Boolean(options.temporary),
    costMod: options.costMod ?? 0
  };
}

function makeUid(run) {
  const uid = run.nextUid;
  run.nextUid += 1;
  return uid;
}

function findNode(run, nodeId) {
  return run.map.flat().find((node) => node.id === nodeId);
}

function getAliveEnemies(run) {
  return run.combat?.enemies.filter((enemy) => enemy.hp > 0) ?? [];
}

function getTargetEnemy(run, uid) {
  const enemies = getAliveEnemies(run);
  return enemies.find((enemy) => enemy.uid === uid) ?? enemies[0] ?? null;
}

function removeDeadEnemies(run) {
  for (const enemy of run.combat?.enemies ?? []) {
    if (enemy.hp <= 0 && !enemy.countedDead) {
      enemy.countedDead = true;
      addLog(run, `${enemy.name} 침묵.`, "combat");
    }
  }
}

function enemyPhase(enemy) {
  const template = ENEMY_BY_ID[enemy.templateId];
  return template.phaseAt && enemy.hp <= enemy.maxHp * template.phaseAt ? 2 : 1;
}

function updateEnemyPhase(run, enemy) {
  if (!enemy || enemy.hp <= 0) return;
  const nextPhase = enemyPhase(enemy);
  if (nextPhase <= (enemy.phase ?? 1)) return;
  enemy.phase = nextPhase;
  chooseEnemyIntent(run, enemy);
  const template = ENEMY_BY_ID[enemy.templateId];
  addLog(run, `${enemy.name}: ${template.phaseName ?? "2단계"} 진입.`, "enemy");
}

function applyToEnemies(run, callback) {
  for (const enemy of getAliveEnemies(run)) callback(enemy);
}

function requiresTarget(card) {
  return (card.effects ?? []).some((effect) => {
    if (["damage", "damageByCharge", "spendChargeDamage", "damagePerExhaust"].includes(effect.op)) return effect.target !== "allEnemies";
    if (effect.op === "apply") return !["allEnemies", "self"].includes(effect.target);
    return false;
  });
}

function getStatus(entity, status) {
  return Math.max(0, entity.statuses?.[status] ?? 0);
}

function statusFrom(statuses, status) {
  return Math.max(0, statuses?.[status] ?? 0);
}

function addStatus(entity, status, amount) {
  entity.statuses ??= {};
  entity.statuses[status] = Math.max(0, (entity.statuses[status] ?? 0) + amount);
  if (entity.statuses[status] === 0) delete entity.statuses[status];
}

function decayStatuses(entity, statuses) {
  for (const status of statuses) {
    if (getStatus(entity, status) > 0) addStatus(entity, status, -1);
  }
}

function cleanse(entity, amount) {
  for (const status of HARMFUL_STATUSES) {
    if (amount <= 0) return;
    const removed = Math.min(amount, getStatus(entity, status));
    addStatus(entity, status, -removed);
    amount -= removed;
  }
}

function adjustedAppliedStatus(run, status, amount) {
  if (status === "virus" && hasRelic(run, "black_coral")) {
    triggerRelic(run, "black_coral");
    return amount + 1;
  }
  return amount;
}

function hasRelic(run, relicId) {
  return run.player.relics.includes(relicId);
}

function triggerRelic(run, relicId) {
  const relic = RELIC_BY_ID[relicId];
  if (!relic) return;
  run.relicTriggers ??= [];
  run.relicTriggers.push({ relicId, at: Date.now() });
  if (run.relicTriggers.length > 12) run.relicTriggers.shift();
  run.combat?.relicTriggers.push({ relicId, at: Date.now() });
  if (run.combat?.relicTriggers.length > 8) run.combat.relicTriggers.shift();
  addLog(run, `${relic.name} 발동.`, "relic");
}

function baseEnergy(run) {
  return CHARACTER.energy + (hasRelic(run, "dead_battery") ? 1 : 0);
}

function gainGold(run, amount) {
  run.player.gold += amount;
  run.stats.goldEarned += amount;
}

function heal(run, amount) {
  run.player.hp = Math.min(run.player.maxHp, run.player.hp + amount);
}

function gainMaxHp(run, amount) {
  run.player.maxHp += amount;
  run.player.hp += amount;
}

function loseMaxHp(run, amount) {
  run.player.maxHp = Math.max(1, run.player.maxHp - amount);
  run.player.hp = Math.min(run.player.hp, run.player.maxHp);
}

function loseHp(run, amount, source = "피해") {
  run.player.hp = Math.max(0, run.player.hp - amount);
  run.stats.damageTaken += amount;
  addLog(run, `${source}: 체력 ${amount} 손실.`, "damage");
  if (run.player.hp <= 0) loseRun(run, `${source}로 쓰러졌습니다.`);
}

function combatTitle(type) {
  if (type === "elite") return "엘리트 전투";
  if (type === "boss") return "보스 전투";
  return "전투";
}

function addLog(run, text, tone = "system") {
  run.log.push({ text, tone, at: Date.now() });
  if (run.log.length > 80) run.log.shift();
}

function touch(run) {
  run.updatedAt = Date.now();
  return run;
}

export const GAME_DATA = {
  cards: CARDS,
  relics: RELICS,
  enemies: ENEMIES,
  events: EVENTS,
  difficulties: DIFFICULTIES,
  challengeModifiers: CHALLENGE_MODIFIERS,
  character: CHARACTER
};
