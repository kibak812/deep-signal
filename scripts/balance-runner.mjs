import { mkdir, writeFile } from "node:fs/promises";
import {
  buyShopCard,
  buyShopHeal,
  buyShopRelic,
  cardCost,
  chooseEventOption,
  chooseRest,
  chooseRewardCard,
  chooseRewardRelic,
  effectiveCard,
  endTurn,
  enterNode,
  getCard,
  getDifficulty,
  hasUpgradeableCards,
  isUpgradeableCard,
  leaveShop,
  newRun,
  playCard,
  requestShopRemove,
  requestShopUpgrade,
  resolveDeckSelection,
  shopServicePrices,
  skipReward
} from "../src/engine/game.js";
import { CARD_BY_ID } from "../src/data/cards.js";
import { EVENT_BY_ID } from "../src/data/events.js";
import { RELIC_BY_ID } from "../src/data/relics.js";

const DEFAULT_SEEDS = Array.from({ length: 18 }, (_, index) => `balance-${String(index + 1).padStart(2, "0")}`);
const DEFAULT_DIFFICULTIES = [0, 1, 2, 3, 4, 5];
const MAX_STEPS = 1800;
const COMBAT_TURN_LIMITS = {
  combat: 30,
  elite: 36,
  boss: 44
};

export function runBalanceSuite({
  seeds = DEFAULT_SEEDS,
  difficulties = DEFAULT_DIFFICULTIES,
  maxSteps = MAX_STEPS
} = {}) {
  const runs = [];
  for (const difficulty of difficulties) {
    for (const seed of seeds) {
      runs.push(simulateRun({ seed: `${seed}-d${difficulty}`, difficulty, maxSteps }));
    }
  }
  return summarizeRuns(runs);
}

export function simulateRun({ seed, difficulty = 0, maxSteps = MAX_STEPS } = {}) {
  const run = newRun({ seed, difficulty });
  const route = [];
  const problems = [];
  const startedAt = Date.now();

  let steps = 0;
  while (run.phase !== "summary" && steps < maxSteps) {
    steps += 1;
    const before = stateFingerprint(run);
    try {
      pilotStep(run, route);
    } catch (error) {
      problems.push(`exception:${error.message}`);
      break;
    }
    const after = stateFingerprint(run);
    if (after === before && !run.selector) {
      problems.push(`stalled:${run.phase}:${run.currentNodeId ?? "none"}`);
      break;
    }
    if (run.phase === "combat" && run.combat?.turn > combatTurnLimit(run.combat.type)) {
      problems.push(`long-combat:${run.combat.type}:turn-${run.combat.turn}`);
      finishCombatPressure(run);
    }
  }

  if (steps >= maxSteps && run.phase !== "summary") problems.push("max-steps");

  return {
    seed,
    difficulty,
    difficultyName: getDifficulty(run).name,
    won: Boolean(run.summary?.won),
    reason: run.summary?.reason ?? problems.at(-1) ?? "unfinished",
    phase: run.phase,
    floors: run.summary?.floors ?? run.stats.floors,
    bossesDefeated: run.summary?.bossesDefeated ?? run.stats.bossesKilled,
    hp: run.player.hp,
    maxHp: run.player.maxHp,
    deckSize: run.player.deck.length,
    relics: run.player.relics.length,
    gold: run.player.gold,
    fights: run.stats.fights,
    elites: run.stats.elitesKilled,
    damageDealt: run.stats.damageDealt,
    damageTaken: run.stats.damageTaken,
    build: run.summary?.build ?? topBuildTags(run),
    route,
    steps,
    problems,
    durationMs: Date.now() - startedAt
  };
}

function pilotStep(run, route) {
  if (run.selector) {
    resolveDeckSelection(run, selectDeckCard(run).uid);
    return;
  }
  if (run.phase === "map") {
    const node = chooseMapNode(run);
    route.push(`${node.row + 1}:${node.type}`);
    enterNode(run, node.id);
    return;
  }
  if (run.phase === "combat") {
    pilotCombat(run);
    return;
  }
  if (run.phase === "reward") {
    chooseReward(run);
    return;
  }
  if (run.phase === "event") {
    chooseEventOption(run, chooseEvent(run));
    return;
  }
  if (run.phase === "shop") {
    pilotShop(run);
    return;
  }
  if (run.phase === "rest") {
    pilotRest(run);
    return;
  }
  throw new Error(`unhandled phase ${run.phase}`);
}

function chooseMapNode(run) {
  const hpRatio = run.player.hp / run.player.maxHp;
  const available = run.map.flat().filter((node) => run.availableNodeIds.includes(node.id));
  return available
    .map((node) => ({ node, score: nodeScore(run, node, hpRatio) }))
    .sort((left, right) => right.score - left.score || left.node.col - right.node.col)[0].node;
}

function nodeScore(run, node, hpRatio) {
  const deckScore = deckStrength(run);
  const difficulty = Number(run.difficulty ?? 0);
  const bossPrep = bossPrepContext(run);
  const prices = shopServicePrices(run);
  const firstElite = node.type === "elite" && node.act === 1 && run.stats.elitesKilled === 0;
  const actOneElite = node.type === "elite" && node.act === 1;
  const requiredHp = firstElite ? 0.78 + Math.min(0.12, difficulty * 0.03) : actOneElite ? 0.72 : 0.62;
  const requiredDeck = firstElite ? 22 + difficulty * 3 : actOneElite ? 24 : 20;
  const earlyElitePenalty = actOneElite
    ? (hpRatio < requiredHp ? -28 - difficulty * 3 : 0) + (deckScore < requiredDeck ? -18 - difficulty * 2 : 0)
    : 0;
  const bossPrepScore = bossPrep && node.act === bossPrep.act
    ? {
        rest: bossPrep.needsHp ? 32 : bossPrep.needsRole ? 18 : bossPrep.needsDeckSpeed ? 14 : 0,
        shop: bossPrep.needsHp && run.player.gold >= prices.heal ? 22 : bossPrep.needsDeckSpeed && run.player.gold >= prices.remove ? 18 : bossPrep.needsRole && run.player.gold >= prices.upgrade ? 14 : 0,
        elite: bossPrep.missing.length >= 2 ? -16 : 0,
        event: bossPrep.needsHp ? -8 : 0,
        combat: bossPrep.needsHp ? -6 : 0
      }[node.type] ?? 0
    : 0;
  const base = {
    boss: 100,
    rest: hpRatio < 0.66 ? 38 : hpRatio < 0.84 ? 20 : 8,
    shop: run.player.gold > 170 ? 29 : run.player.gold > 90 ? 20 : 8,
    elite: hpRatio >= requiredHp && deckScore >= requiredDeck ? 30 : hpRatio > 0.74 && deckScore > 25 ? 8 : -18,
    event: hpRatio > 0.5 ? 22 : 12,
    combat: 18
  }[node.type] ?? 0;
  return base + bossPrepScore + earlyElitePenalty + node.act * 1.5 + (node.type === "elite" ? run.player.relics.length : 0);
}

function pilotCombat(run) {
  const combat = run.combat;
  const incoming = expectedIncomingDamage(run);
  let plays = 0;
  while (run.phase === "combat" && plays < 18) {
    const target = chooseTarget(run);
    const playable = combat.hand
      .filter((card) => cardCost(card, combat) <= combat.energy && cardCost(card, combat) < 90)
      .map((card) => ({ card, target, score: combatCardScore(run, card, target, incoming) }))
      .sort((left, right) => right.score - left.score || cardCost(left.card, combat) - cardCost(right.card, combat))[0];
    if (!playable || playable.score < -2) break;
    playCard(run, playable.card.uid, playable.target?.uid);
    plays += 1;
  }
  if (run.phase === "combat") endTurn(run);
}

function combatCardScore(run, cardInstance, target, incoming) {
  const card = effectiveCard(cardInstance);
  const cost = cardCost(cardInstance, run.combat);
  let score = card.type === "power" ? 9 : card.type === "skill" ? 2 : 3;
  for (const effect of collectEffects(card.effects ?? [])) {
    score += effectCombatScore(run, effect, target, incoming, card);
  }
  if (card.exhaust || card.type === "power" || cardInstance.temporary) score += 0.8;
  if (card.keywords?.includes("retain")) score += incoming > run.player.block ? 0 : -1;
  score -= cost * 2.25;
  if (selfHarmAmount(card) >= Math.max(1, run.player.hp - 1)) score -= 50;
  if (selfHarmAmount(card) > 0 && run.player.hp - selfHarmAmount(card) <= incoming - run.player.block) score -= 14;
  if (incoming > run.player.block && card.type === "skill") score += 3;
  if (incoming <= run.player.block && card.type === "skill" && !card.effects?.some((effect) => effect.op === "draw" || effect.op === "gainEnergy")) score -= 3;
  if (target && estimatedCardDamage(run, card, target) >= target.hp) score += 7;
  if (run.player.hp / run.player.maxHp < 0.42 && hasSelfHarm(card)) score -= 11;
  return score;
}

function effectCombatScore(run, effect, target, incoming, card) {
  switch (effect.op) {
    case "damage": {
      const targets = effect.target === "allEnemies" ? livingEnemies(run).length : 1;
      return effect.amount * (effect.hits ?? 1) * targets * 0.9;
    }
    case "damageByCharge":
      return (effect.base + status(run.player, "charge") * effect.per) * 0.95;
    case "spendChargeDamage":
      return (effect.base + status(run.player, "charge") * effect.per) * 0.95 - 1;
    case "damagePerExhaust":
      return run.combat.exhaustPile.length * effect.amount * 0.9;
    case "block":
      return blockValue(run, effect.amount, incoming);
    case "blockPerHand":
      return blockValue(run, run.combat.hand.length * effect.amount, incoming);
    case "apply":
    case "gainStatus":
      return statusScore(effect.status, effect.amount, effect.target ?? "enemy", target, card);
    case "draw":
      return effect.amount * 2.2;
    case "gainEnergy":
      return effect.amount * 3.3;
    case "gainCharge":
      return effect.amount * (run.player.statuses.focus ? 2.4 : 1.8);
    case "gainFocus":
      return effect.amount * 4.8;
    case "generate":
      return effect.amount * (effect.zone === "hand" ? 2.4 : 1.2);
    case "discardRandom":
      return -effect.amount * 0.7;
    case "upgradeRandomHand":
      return effect.amount * 2.2;
    case "discountRandomHand":
      return (effect.count ?? 1) * effect.amount * 2.6;
    case "exhaustRandomHand":
      return effect.amount * 0.5;
    case "cleanse":
      return harmfulStatusTotal(run.player) > 0 ? effect.amount * 2.1 : 0.4;
    case "heal":
      return Math.min(effect.amount, run.player.maxHp - run.player.hp) * 1.2;
    case "gainGold":
      return effect.amount * 0.08;
    case "loseHp":
      return -effect.amount * 1.8;
    case "ifEnemyStatus":
      return target && status(target, effect.status) > 0 ? collectEffects(effect.effects ?? []).reduce((sum, nested) => sum + effectCombatScore(run, nested, target, incoming, card), 0) : 0;
    case "ifPlayerBlock":
      return run.player.block > 0 ? collectEffects(effect.effects ?? []).reduce((sum, nested) => sum + effectCombatScore(run, nested, target, incoming, card), 0) : 0;
    case "ifAttackCount":
      return run.combat.attacksPlayedThisTurn >= effect.count ? collectEffects(effect.effects ?? []).reduce((sum, nested) => sum + effectCombatScore(run, nested, target, incoming, card), 0) : 0.8;
    case "chargePerEnemy":
      return livingEnemies(run).length * effect.amount * 1.8;
    case "resetHand":
      return run.combat.hand.length * 1.3 + effect.energy * 2.8;
    case "gainMaxEnergy":
      return effect.amount * 6;
    case "loseMaxHp":
      return -effect.amount * 2.4;
    default:
      return 0;
  }
}

function blockValue(run, amount, incoming) {
  let block = amount + status(run.player, "focus");
  if (status(run.player, "frail") > 0) block = Math.floor(block * 0.75);
  const needed = Math.max(0, incoming - run.player.block);
  return Math.min(block, needed) * 1.65 + Math.max(0, block - needed) * 0.28;
}

function statusScore(key, amount, targetType, target, card) {
  const enemyStatus = targetType !== "self";
  const table = enemyStatus
    ? { virus: 3.2, vulnerable: 5, weak: 4.6, frail: 3.6, mark: card?.type === "attack" ? 3.2 : 2.4, strength: -7, counter: -5 }
    : { charge: 2.1, focus: 5.6, plated: 3.5, counter: 3.4, strength: 4.2, vulnerable: -4.5, weak: -4, frail: -4.2, nextEnergy: 3.5, deepIndex: 7, choir: 6, contagion: 6, pearlEngine: 4, echo: 4 };
  return (table[key] ?? 1) * amount;
}

function estimatedCardDamage(run, card, target) {
  return (card.effects ?? []).reduce((sum, effect) => {
    if (effect.op === "damage") return sum + estimateAttackDamage(run, target, effect.amount * (effect.hits ?? 1));
    if (effect.op === "damageByCharge") return sum + estimateAttackDamage(run, target, effect.base + status(run.player, "charge") * effect.per);
    if (effect.op === "spendChargeDamage") return sum + estimateAttackDamage(run, target, effect.base + status(run.player, "charge") * effect.per);
    if (effect.op === "ifEnemyStatus" && status(target, effect.status) > 0) return sum + estimatedCardDamage(run, { ...card, effects: effect.effects }, target);
    return sum;
  }, 0);
}

function estimateAttackDamage(run, target, amount) {
  let damage = amount + status(run.player, "strength");
  if (status(run.player, "weak") > 0) damage = Math.floor(damage * 0.75);
  if (status(target, "vulnerable") > 0) damage = Math.ceil(damage * 1.5);
  if (status(target, "mark") > 0) damage += 2;
  return Math.max(0, damage - target.block);
}

function chooseTarget(run) {
  return livingEnemies(run)
    .map((enemy) => ({
      enemy,
      score: expectedEnemyDamage(run, enemy) * 1.2 + (enemy.templateId.includes("boss") ? 8 : 0) + (enemy.maxHp - enemy.hp) * 0.04 - enemy.hp * 0.02
    }))
    .sort((left, right) => right.score - left.score)[0]?.enemy;
}

function chooseReward(run) {
  const scored = run.reward.cards.map((cardId) => ({ cardId, score: rewardCardScore(run, cardId) })).sort((left, right) => right.score - left.score);
  const best = scored[0];
  const deckSize = run.player.deck.length;
  const bossPrep = bossPrepContext(run);
  const threshold = bossPrep?.missing.length
    ? deckSize < 24 ? 3 : 7
    : deckSize < 16 ? 0 : deckSize < 24 ? 5 : 9;
  if (best && best.score >= threshold) chooseRewardCard(run, best.cardId);
  else skipReward(run);
  if (run.phase === "reward" && run.reward?.relicChoices?.length && !run.reward.selectedRelicId) {
    chooseRewardRelic(run, chooseRewardRelicId(run));
  }
}

function chooseRewardRelicId(run) {
  return run.reward.relicChoices
    .map((relicId) => ({ relicId, score: rewardRelicScore(run, relicId) }))
    .sort((left, right) => right.score - left.score)[0]?.relicId;
}

function rewardRelicScore(run, relicId) {
  const relic = RELIC_BY_ID[relicId];
  if (!relic) return -Infinity;
  const counts = deckCounts(run);
  let score = relic.rarity === "rare" ? 8 : relic.rarity === "uncommon" ? 5 : 3;
  if (/상점|보상|획득|엘리트|휴식/.test(relic.timing)) score += 2.5;
  if (/전투|턴|카드|공격|방어|상태|소멸|지속/.test(relic.timing)) score += 2;
  if (/전하|집중|에너지/.test(relic.text)) score += (counts.charge ?? 0) * 1.2 + (counts.focus ?? 0) * 1.2;
  if (/바이러스|지속 피해/.test(relic.text)) score += (counts.virus ?? 0) * 1.4;
  if (/표식/.test(relic.text)) score += (counts.mark ?? 0) * 1.4;
  if (/방어|반격|도금/.test(relic.text)) score += (counts.block ?? 0) * 0.8 + (counts.counter ?? 0) * 1.4;
  if (/소멸/.test(relic.text)) score += (counts.exhaust ?? 0) * 1.5;
  if (/스킬/.test(relic.text)) score += (counts.skill ?? 0) * 0.35;
  if (/공격/.test(relic.text)) score += (counts.attack ?? 0) * 0.35;
  if (relicId === "dead_battery" && run.player.hp < 24) score -= 5;
  if (relicId === "brittle_crown" && run.player.gold > 220) score -= 3;
  return score;
}

function rewardCardScore(run, cardId) {
  const card = CARD_BY_ID[cardId];
  if (!card) return -Infinity;
  if (card.rarity === "curse" || card.type === "curse" || card.unplayable) return -30;
  let score = card.rarity === "rare" ? 7 : card.rarity === "uncommon" ? 4 : 2;
  if (card.cost === 0) score += 2.2;
  if (card.cost >= 3) score -= 2;
  if (card.type === "power") score += 2.5;
  const counts = deckCounts(run);
  if (card.type === "attack" && (counts.attack ?? 0) < 6) score += 4;
  if (card.type === "skill" && (counts.block ?? 0) < 5 && card.keywords?.includes("block")) score += 4;
  for (const keyword of card.keywords ?? []) {
    score += Math.min(5, (counts[keyword] ?? 0) * 1.1);
    if (["charge", "virus", "block", "counter", "mark", "exhaust", "temporary"].includes(keyword)) score += 1.3;
  }
  for (const effect of collectEffects(card.effects ?? [])) {
    if (["draw", "gainEnergy", "gainFocus", "gainCharge", "resetHand"].includes(effect.op)) score += 2.5;
    if (effect.op === "cleanse") score += 3.2;
    if (effect.op === "damage") score += Math.min(5, effect.amount * (effect.hits ?? 1) * 0.25);
    if (effect.op === "block") score += Math.min(4, effect.amount * 0.25);
    if (effect.op === "loseHp" || effect.op === "loseMaxHp") score -= effect.amount * 0.5;
  }
  score += bossPreparationBonus(run, card);
  if (run.player.deck.length > 28 && card.rarity === "common" && !card.keywords?.some((keyword) => (counts[keyword] ?? 0) >= 3)) score -= 5;
  return score;
}

function bossPreparationBonus(run, card) {
  const context = bossPrepContext(run) ?? bossContext(run);
  if (!context || context.act < 2 || context.distance > 3) return 0;
  const deckCards = run.player.deck.map((cardInstance) => getCard(cardInstance));
  const finalActBonus = context.act >= 3 ? 1.55 : 1;
  let bonus = 0;
  if ((context.needsStatusControl ?? deckCards.filter(cardSupportsStatusControl).length < 2) && cardSupportsStatusControl(card)) bonus += 4.8 * finalActBonus;
  if ((context.needsDefense ?? deckCards.filter(cardSupportsDefense).length < 6) && cardSupportsDefense(card)) bonus += 4.3 * finalActBonus;
  if ((context.needsFinish ?? deckCards.filter(cardSupportsFinish).length < 7) && cardSupportsFinish(card)) bonus += 3.7 * finalActBonus;
  if ((context.needsDeckSpeed ?? deckCards.filter(cardSupportsFlow).length < 4) && cardSupportsFlow(card)) bonus += 2.8;
  return bonus;
}

function bossContext(run) {
  const currentNode = run.currentNodeId ? run.map.flat().find((node) => node.id === run.currentNodeId) : null;
  const row = currentNode?.row ?? Math.max(0, run.stats.floors - 1);
  const act = currentNode?.act ?? Math.floor(row / 7) + 1;
  const bossRow = act * 7 - 1;
  return { act, distance: Math.max(0, bossRow - row) };
}

function bossPrepContext(run) {
  const context = bossContext(run);
  if (!context || context.act < 2 || context.distance > 3) return null;
  const cards = run.player.deck.map((cardInstance) => getCard(cardInstance));
  const finalAct = context.act >= 3;
  const close = context.distance <= 1;
  const hpRatio = run.player.hp / Math.max(1, run.player.maxHp);
  const defense = cards.filter(cardSupportsDefense).length;
  const finish = cards.filter(cardSupportsFinish).length;
  const statusControl = cards.filter(cardSupportsStatusControl).length;
  const flow = cards.filter(cardSupportsFlow).length;
  const deckSize = cards.length;
  const hpTarget = finalAct ? (close ? 0.78 : 0.68) : close ? 0.68 : 0.58;
  const defenseTarget = finalAct ? 7 : 5;
  const finishTarget = finalAct ? 8 : 6;
  const statusTarget = finalAct ? 3 : 2;
  const flowTarget = deckSize >= 25 || finalAct ? 4 : 3;
  const needsHp = hpRatio < hpTarget;
  const needsDefense = defense < defenseTarget;
  const needsFinish = finish < finishTarget;
  const needsStatusControl = statusControl < statusTarget;
  const needsDeckSpeed = deckSize >= 25 || flow < flowTarget;
  const missing = [
    needsHp ? "체력" : "",
    needsDefense ? "방어" : "",
    needsFinish ? "마무리" : "",
    needsStatusControl ? "정화·약화" : "",
    needsDeckSpeed ? "카드 뽑기" : ""
  ].filter(Boolean);
  return {
    ...context,
    finalAct,
    close,
    hpRatio,
    deckSize,
    defense,
    finish,
    statusControl,
    flow,
    needsHp,
    needsDefense,
    needsFinish,
    needsStatusControl,
    needsDeckSpeed,
    needsRole: needsDefense || needsFinish || needsStatusControl,
    missing
  };
}

function cardSupportsDefense(card) {
  return (
    card.type === "skill" && (card.keywords?.includes("block") || collectEffects(card.effects ?? []).some((effect) => ["block", "blockPerHand"].includes(effect.op))) ||
    card.keywords?.some((keyword) => ["block", "counter", "plated", "weak"].includes(keyword)) ||
    collectEffects(card.effects ?? []).some((effect) => effect.op === "gainStatus" && ["counter", "plated"].includes(effect.status))
  );
}

function cardSupportsFinish(card) {
  return (
    card.type === "attack" ||
    card.keywords?.some((keyword) => ["damage", "mark", "vulnerable", "charge", "virus"].includes(keyword)) ||
    collectEffects(card.effects ?? []).some((effect) => ["damage", "damageByCharge", "damagePerExhaust", "spendChargeDamage"].includes(effect.op))
  );
}

function cardSupportsStatusControl(card) {
  return (
    collectEffects(card.effects ?? []).some((effect) => effect.op === "cleanse" || effect.op === "heal") ||
    card.keywords?.some((keyword) => ["weak", "vulnerable", "frail", "plated"].includes(keyword))
  );
}

function cardSupportsFlow(card) {
  return (
    card.retain ||
    card.exhaust ||
    card.cost === 0 ||
    card.keywords?.some((keyword) => ["retain", "exhaust", "temporary", "charge", "focus"].includes(keyword)) ||
    collectEffects(card.effects ?? []).some((effect) => ["draw", "gainEnergy", "generate", "discountRandomHand", "resetHand"].includes(effect.op))
  );
}

function chooseEvent(run) {
  const event = EVENT_BY_ID[run.event.eventId];
  return event.choices
    .map((choice, index) => ({ index, score: eventChoiceScore(run, choice) }))
    .filter((choice) => choice.score > -Infinity)
    .sort((left, right) => right.score - left.score)[0]?.index ?? 0;
}

function eventChoiceScore(run, choice) {
  if (!canPay(run, choice.effects ?? [])) return -Infinity;
  return (choice.effects ?? []).reduce((score, effect) => score + eventEffectScore(run, effect), 0);
}

function eventEffectScore(run, effect) {
  switch (effect.op) {
    case "loseHp":
      return -effect.amount * (run.player.hp / run.player.maxHp < 0.5 ? 4.2 : 2.2);
    case "heal":
      return Math.min(effect.amount, run.player.maxHp - run.player.hp) * 1.2;
    case "gainGold":
      return effect.amount * 0.13;
    case "loseGold":
      return -effect.amount * 0.1;
    case "gainMaxHp":
      return effect.amount * 4;
    case "loseMaxHp":
      return -effect.amount * 4.5;
    case "upgradeRandomDeck":
      return effect.amount * 8;
    case "gainRelic":
      return 18 + (effect.rarity === "rare" ? 6 : 0);
    case "chanceRelic":
      return effect.chance * 16;
    case "chanceCurse":
      return -effect.chance * 18;
    case "addCard":
      return rewardCardScore(run, effect.cardId);
    case "addRandomCard":
    case "cardReward":
      return 9;
    case "removeCard":
      return run.player.deck.length > 16 ? 8 : 3;
    case "duplicateCard":
      return 5;
    case "transformCard":
      return 4;
    case "gainRunFlag":
      return ["startCharge"].includes(effect.flag) ? 7 * effect.amount : -2 * effect.amount;
    case "eventCombat":
      return run.player.hp / run.player.maxHp > 0.72 ? (effect.rewardRelic ? 4 : -8) : -18;
    default:
      return 0;
  }
}

function pilotShop(run) {
  const prices = shopServicePrices(run);
  const bossPrep = bossPrepContext(run);
  if (bossPrep?.missing.length && bossPrep.distance <= 2) {
    if (bossPrep.needsHp && run.player.gold >= prices.heal && run.player.hp < run.player.maxHp) {
      buyShopHeal(run);
      return;
    }
    if (bossPrep.needsDeckSpeed && run.player.gold >= prices.remove && removableCard(run)) {
      requestShopRemove(run);
      return;
    }
    if (bossPrep.needsRole && run.player.gold >= prices.upgrade && hasUpgradeableCards(run)) {
      requestShopUpgrade(run);
      return;
    }
  }
  if (run.player.hp / run.player.maxHp < 0.64 && run.player.gold >= prices.heal && run.player.hp < run.player.maxHp) {
    buyShopHeal(run);
    return;
  }
  const relic = run.shop.relics
    .map((item, index) => ({ item, index, score: shopRelicScore(item.relicId) - item.price * 0.045 }))
    .filter((entry) => !entry.item.sold && run.player.gold >= entry.item.price)
    .sort((left, right) => right.score - left.score)[0];
  if (relic && relic.score > 7) {
    buyShopRelic(run, relic.index);
    return;
  }
  const card = run.shop.cards
    .map((item, index) => ({ item, index, score: rewardCardScore(run, item.cardId) - item.price * 0.055 }))
    .filter((entry) => !entry.item.sold && run.player.gold >= entry.item.price)
    .sort((left, right) => right.score - left.score)[0];
  if (card && card.score > 2) {
    buyShopCard(run, card.index);
    return;
  }
  if (run.player.gold >= prices.upgrade && hasUpgradeableCards(run) && deckStrength(run) > 15) {
    requestShopUpgrade(run);
    return;
  }
  if (run.player.gold >= prices.remove && removableCard(run) && run.player.deck.length > 14) {
    requestShopRemove(run);
    return;
  }
  leaveShop(run);
}

function shopRelicScore(relicId) {
  const relic = RELIC_BY_ID[relicId];
  const rarity = relic.rarity === "rare" ? 12 : relic.rarity === "uncommon" ? 8 : 5;
  const timing = /전투 시작|카드 사용|턴 시작|지속 피해|공격|방어|소멸/.test(relic.timing) ? 7 : 3;
  return rarity + timing;
}

function pilotRest(run) {
  const hpRatio = run.player.hp / run.player.maxHp;
  const bossPrep = bossPrepContext(run);
  if (bossPrep?.missing.length && bossPrep.distance <= 1) {
    if (bossPrep.needsHp && run.player.hp < run.player.maxHp) {
      chooseRest(run, "heal");
      return;
    }
    if (bossPrep.needsRole && hasUpgradeableCards(run)) {
      chooseRest(run, "upgrade");
      return;
    }
    if (bossPrep.needsDeckSpeed && hpRatio > 0.62 && removableCard(run)) {
      chooseRest(run, "remove");
      return;
    }
  }
  if (hpRatio < 0.68) {
    chooseRest(run, "heal");
    return;
  }
  if (hasUpgradeableCards(run)) {
    chooseRest(run, "upgrade");
    return;
  }
  if (hpRatio > 0.75 && removableCard(run)) {
    chooseRest(run, "remove");
    return;
  }
  chooseRest(run, "heal");
}

function selectDeckCard(run) {
  if (run.selector.mode === "upgrade") {
    return run.player.deck
      .filter((card) => isUpgradeableCard(card))
      .map((card) => ({ card, score: rewardCardScore(run, card.cardId) + (card.cardId === "pulse_lance" ? 2 : 0) }))
      .sort((left, right) => right.score - left.score)[0]?.card ?? run.player.deck[0];
  }
  return removableCard(run) ?? run.player.deck[0];
}

function removableCard(run) {
  const starterPenalty = new Set(["pulse_lance", "tide_ward", "memory_sift", "null_pin"]);
  return run.player.deck
    .map((card) => ({
      card,
      score:
        getCard(card).rarity === "curse"
          ? -100
          : starterPenalty.has(card.cardId)
            ? -14 + (card.upgraded ? 4 : 0)
            : rewardCardScore(run, card.cardId) + (card.upgraded ? 3 : 0)
    }))
    .sort((left, right) => left.score - right.score)[0]?.card;
}

function finishCombatPressure(run) {
  while (run.phase === "combat" && livingEnemies(run).length) {
    const enemy = livingEnemies(run)[0];
    run.combat.energy = Math.max(run.combat.energy, 1);
    run.combat.hand.push({ uid: run.nextUid++, cardId: "pulse_lance", upgraded: true, temporary: true, costMod: 0 });
    playCard(run, run.combat.hand.at(-1).uid, enemy.uid);
  }
}

function expectedIncomingDamage(run) {
  return livingEnemies(run).reduce((sum, enemy) => sum + expectedEnemyDamage(run, enemy), 0);
}

function combatTurnLimit(type) {
  return COMBAT_TURN_LIMITS[type] ?? 30;
}

function expectedEnemyDamage(run, enemy) {
  const move = enemy.nextMove;
  if (!move?.damage) return 0;
  let damage = Math.round(move.damage * getDifficulty(run).enemyDamage) + status(enemy, "strength");
  if (status(enemy, "weak") > 0) damage = Math.floor(damage * 0.75);
  if (status(run.player, "vulnerable") > 0) damage = Math.ceil(damage * 1.5);
  return Math.max(0, damage) * (move.hits ?? 1);
}

function livingEnemies(run) {
  return run.combat?.enemies.filter((enemy) => enemy.hp > 0) ?? [];
}

function status(entity, key) {
  return entity?.statuses?.[key] ?? 0;
}

function harmfulStatusTotal(entity) {
  return ["weak", "vulnerable", "frail", "virus", "mark"].reduce((total, key) => total + status(entity, key), 0);
}

function hasSelfHarm(card) {
  return selfHarmAmount(card) > 0 || collectEffects(card.effects ?? []).some((effect) => effect.op === "loseMaxHp");
}

function selfHarmAmount(card) {
  return collectEffects(card.effects ?? [])
    .filter((effect) => effect.op === "loseHp")
    .reduce((total, effect) => total + effect.amount, 0);
}

function collectEffects(effects) {
  const collected = [];
  for (const effect of effects) {
    collected.push(effect);
    if (effect.effects) collected.push(...collectEffects(effect.effects));
  }
  return collected;
}

function deckCounts(run) {
  const counts = {};
  for (const cardInstance of run.player.deck) {
    const card = getCard(cardInstance);
    counts[card.type] = (counts[card.type] ?? 0) + 1;
    for (const keyword of card.keywords ?? []) counts[keyword] = (counts[keyword] ?? 0) + 1;
  }
  return counts;
}

function deckStrength(run) {
  const counts = deckCounts(run);
  return (
    run.player.relics.length * 3 +
    (counts.attack ?? 0) * 1.4 +
    (counts.block ?? 0) * 1.2 +
    (counts.charge ?? 0) * 1.5 +
    (counts.virus ?? 0) * 1.5 +
    (counts.power ?? 0) * 2 +
    run.player.deck.filter((card) => card.upgraded).length * 1.2
  );
}

function topBuildTags(run) {
  return Object.entries(deckCounts(run))
    .filter(([key]) => !["attack", "skill", "power", "curse"].includes(key))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([key]) => key);
}

function canPay(run, effects) {
  return effects.every((effect) => effect.op !== "loseGold" || run.player.gold >= effect.amount);
}

function stateFingerprint(run) {
  return JSON.stringify({
    phase: run.phase,
    node: run.currentNodeId,
    hp: run.player.hp,
    gold: run.player.gold,
    deck: run.player.deck.length,
    relics: run.player.relics.length,
    selector: run.selector?.mode,
    reward: run.reward
      ? {
          cards: run.reward.cards?.join(","),
          card: run.reward.selectedCardId ?? null,
          skipped: Boolean(run.reward.cardSkipped),
          relicChoices: run.reward.relicChoices?.join(","),
          relic: run.reward.selectedRelicId ?? null
        }
      : null,
    event: run.event?.eventId,
    shop: run.shop
      ? {
          cards: run.shop.cards.map((item) => item.sold),
          relics: run.shop.relics.map((item) => item.sold)
        }
      : null,
    combat: run.combat
      ? {
          turn: run.combat.turn,
          energy: run.combat.energy,
          hand: run.combat.hand.map((card) => card.uid),
          enemies: run.combat.enemies.map((enemy) => [enemy.uid, enemy.hp, enemy.block, enemy.nextMove?.id])
        }
      : null
  });
}

function summarizeRuns(runs) {
  const byDifficulty = Object.values(
    runs.reduce((groups, run) => {
      groups[run.difficultyName] ??= {
        difficulty: run.difficulty,
        difficultyName: run.difficultyName,
        runs: 0,
        wins: 0,
        averageFloors: 0,
        averageDeckSize: 0,
        averageRelics: 0,
        averageDamageTaken: 0,
        problemRuns: 0,
        floorBands: createFloorBandCounters(),
        lossReasons: {}
      };
      const group = groups[run.difficultyName];
      group.runs += 1;
      group.wins += run.won ? 1 : 0;
      group.averageFloors += run.floors;
      group.averageDeckSize += run.deckSize;
      group.averageRelics += run.relics;
      group.averageDamageTaken += run.damageTaken;
      group.problemRuns += run.problems.length ? 1 : 0;
      group.floorBands[floorBand(run.floors)].runs += 1;
      if (run.won) group.floorBands[floorBand(run.floors)].wins += 1;
      if (!run.won) group.lossReasons[lossReasonBucket(run)] = (group.lossReasons[lossReasonBucket(run)] ?? 0) + 1;
      return groups;
    }, {})
  ).map((group) => ({
    ...group,
    winRate: group.wins / group.runs,
    averageFloors: round(group.averageFloors / group.runs),
    averageDeckSize: round(group.averageDeckSize / group.runs),
    averageRelics: round(group.averageRelics / group.runs),
    averageDamageTaken: round(group.averageDamageTaken / group.runs),
    floorBands: finalizeFloorBands(group.floorBands),
    lossReasons: rankedEntries(group.lossReasons)
  }));
  const totals = {
    runs: runs.length,
    wins: runs.filter((run) => run.won).length,
    winRate: round(runs.filter((run) => run.won).length / runs.length),
    averageFloors: round(runs.reduce((sum, run) => sum + run.floors, 0) / runs.length),
    averageSteps: round(runs.reduce((sum, run) => sum + run.steps, 0) / runs.length),
    problemRuns: runs.filter((run) => run.problems.length).length
  };
  const lossReasons = aggregateLossReasons(runs);
  const floorBands = aggregateFloorBands(runs);
  const buildTags = aggregateBuildTags(runs);
  const primaryBuilds = aggregatePrimaryBuilds(runs);

  return {
    generatedAt: new Date().toISOString(),
    runs,
    totals,
    byDifficulty,
    lossReasons,
    floorBands,
    buildTags,
    primaryBuilds,
    recommendations: balanceRecommendations({ totals, byDifficulty, lossReasons, floorBands, primaryBuilds })
  };
}

function createFloorBandCounters() {
  return Object.fromEntries(FLOOR_BANDS.map((band) => [band.id, { ...band, runs: 0, wins: 0 }]));
}

const FLOOR_BANDS = [
  { id: "early", label: "초반 1-7층", min: 1, max: 7 },
  { id: "middle", label: "중반 8-14층", min: 8, max: 14 },
  { id: "late", label: "후반 15-20층", min: 15, max: 20 },
  { id: "final", label: "최종 21층", min: 21, max: Infinity }
];

function floorBand(floors) {
  return FLOOR_BANDS.find((band) => floors >= band.min && floors <= band.max)?.id ?? "early";
}

function finalizeFloorBands(counters) {
  return Object.values(counters).map((band) => ({
    id: band.id,
    label: band.label,
    runs: band.runs,
    wins: band.wins,
    winRate: band.runs ? round(band.wins / band.runs) : 0
  }));
}

function aggregateFloorBands(runs) {
  const counters = createFloorBandCounters();
  for (const run of runs) {
    const band = counters[floorBand(run.floors)];
    band.runs += 1;
    if (run.won) band.wins += 1;
  }
  return finalizeFloorBands(counters);
}

function aggregateLossReasons(runs) {
  return rankedEntries(
    runs
      .filter((run) => !run.won)
      .reduce((groups, run) => {
        const key = lossReasonBucket(run);
        groups[key] = (groups[key] ?? 0) + 1;
        return groups;
      }, {})
  );
}

function lossReasonBucket(run) {
  if (run.problems.length) return "진행 문제";
  const reason = run.reason ?? "";
  if (/상태 피해|바이러스|균열|취약|약화|저주|젖은 의심|사망한 편지/.test(reason)) return "상태 누적";
  if (/마지막 문 성가대/.test(reason)) return "최종 보스";
  if (/공격|체력이 0|쓰러졌습니다/.test(reason)) {
    if (run.floors <= 7) return "초반 성장 실패";
    if (run.floors <= 14) return "중반 강적";
    return "후반 체력 부족";
  }
  if (run.floors <= 7) return "초반 성장 실패";
  if (run.floors <= 14) return "중반 전환 실패";
  return "후반 마무리 부족";
}

function aggregateBuildTags(runs) {
  const groups = {};
  for (const run of runs) {
    const tags = run.build?.length ? run.build : ["unknown"];
    for (const tag of tags) {
      groups[tag] ??= {
        tag,
        runs: 0,
        wins: 0,
        averageFloors: 0,
        averageDeckSize: 0,
        averageRelics: 0
      };
      const group = groups[tag];
      group.runs += 1;
      group.wins += run.won ? 1 : 0;
      group.averageFloors += run.floors;
      group.averageDeckSize += run.deckSize;
      group.averageRelics += run.relics;
    }
  }
  return Object.values(groups)
    .map((group) => ({
      ...group,
      winRate: round(group.wins / group.runs),
      averageFloors: round(group.averageFloors / group.runs),
      averageDeckSize: round(group.averageDeckSize / group.runs),
      averageRelics: round(group.averageRelics / group.runs)
    }))
    .sort((left, right) => right.runs - left.runs || right.winRate - left.winRate || left.tag.localeCompare(right.tag));
}

function aggregatePrimaryBuilds(runs) {
  const groups = {};
  for (const run of runs) {
    const tag = run.build?.[0] ?? "unknown";
    groups[tag] ??= {
      tag,
      runs: 0,
      wins: 0,
      averageFloors: 0,
      averageDeckSize: 0,
      averageRelics: 0
    };
    const group = groups[tag];
    group.runs += 1;
    group.wins += run.won ? 1 : 0;
    group.averageFloors += run.floors;
    group.averageDeckSize += run.deckSize;
    group.averageRelics += run.relics;
  }
  return Object.values(groups)
    .map((group) => ({
      ...group,
      winRate: round(group.wins / group.runs),
      averageFloors: round(group.averageFloors / group.runs),
      averageDeckSize: round(group.averageDeckSize / group.runs),
      averageRelics: round(group.averageRelics / group.runs)
    }))
    .sort((left, right) => right.runs - left.runs || right.winRate - left.winRate || left.tag.localeCompare(right.tag));
}

function rankedEntries(source) {
  return Object.entries(source)
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function balanceRecommendations({ totals, byDifficulty, lossReasons, floorBands, primaryBuilds }) {
  const recommendations = [];
  if (totals.problemRuns > 0) {
    recommendations.push({
      tone: "danger",
      area: "안정성",
      text: `자동 플레이 중 진행 문제 ${totals.problemRuns}건이 있습니다. 밸런스 조정보다 진행 불가 원인을 먼저 확인하세요.`
    });
  }
  const entryDifficulty = byDifficulty.find((entry) => entry.difficulty === 0);
  if (entryDifficulty && entryDifficulty.winRate < 0.45) {
    recommendations.push({
      tone: "warning",
      area: "입문 난이도",
      text: `${entryDifficulty.difficultyName} 승률이 ${percent(entryDifficulty.winRate)}입니다. 첫 보스 전 회복량이나 1막 강적 피해량을 낮추는 쪽을 검토하세요.`
    });
  }
  if (entryDifficulty && entryDifficulty.winRate > 0.9) {
    recommendations.push({
      tone: "steady",
      area: "입문 난이도",
      text: `${entryDifficulty.difficultyName} 승률이 ${percent(entryDifficulty.winRate)}입니다. 첫 난이도는 친절하게 유지하되, 최종 보스 전에는 실수의 여지를 조금 남기세요.`
    });
  }
  const hardest = byDifficulty.at(-1);
  if (hardest && hardest.winRate < 0.08 && hardest.averageFloors < 14) {
    recommendations.push({
      tone: "warning",
      area: "상위 난이도",
      text: `${hardest.difficultyName} 평균 도달이 ${hardest.averageFloors}층입니다. 완주 난이도는 높게 유지하되 1막 보스 이전 사망 비율을 낮추면 도전 의욕이 더 살아납니다.`
    });
  }
  const topLoss = lossReasons[0];
  if (topLoss) {
    recommendations.push({
      tone: topLoss.label === "진행 문제" ? "danger" : "steady",
      area: "주요 사망 원인",
      text: `${topLoss.label} 사망이 ${topLoss.count}건입니다. 관련 적 의도, 보상 카드, 휴식/상점 선택지를 우선 점검하세요.`
    });
  }
  const earlyLossBand = floorBands.find((band) => band.id === "early");
  if (earlyLossBand && earlyLossBand.runs / Math.max(1, totals.runs) > 0.18) {
    recommendations.push({
      tone: "warning",
      area: "초반 경험",
      text: `전체 런의 ${percent(earlyLossBand.runs / totals.runs)}가 7층 안에서 끝납니다. 초반 보상 선택지와 첫 엘리트 경로 안내를 더 관대하게 조정할 여지가 있습니다.`
    });
  }
  const commonBuilds = primaryBuilds.filter((entry) => entry.runs >= Math.max(5, Math.floor(totals.runs * 0.08)));
  const weakBuild = commonBuilds.find((entry) => entry.winRate < Math.max(0.08, totals.winRate * 0.55));
  if (weakBuild) {
    recommendations.push({
      tone: "warning",
      area: "덱 방향",
      text: `${weakBuild.tag} 계열은 ${weakBuild.runs}런에서 승률 ${percent(weakBuild.winRate)}입니다. 핵심 보상 카드나 유물 연결을 보강하세요.`
    });
  }
  const dominantBuild = commonBuilds.find((entry) => entry.winRate > totals.winRate * 1.45 && entry.runs >= 10);
  if (dominantBuild) {
    recommendations.push({
      tone: "steady",
      area: "덱 방향",
      text: `${dominantBuild.tag} 계열 승률이 ${percent(dominantBuild.winRate)}로 높습니다. 다른 계열의 방어/마무리 수단이 뒤처지는지 비교하세요.`
    });
  }
  if (!recommendations.length) {
    recommendations.push({
      tone: "strong",
      area: "밸런스",
      text: "진행 문제 없이 난이도별 승률과 도달층이 의도 범위 안에 있습니다. 다음 단계는 직접 플레이 로그 기반 미세 조정입니다."
    });
  }
  return recommendations;
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

async function main() {
  const report = runBalanceSuite();
  await mkdir("qa", { recursive: true });
  await writeFile("qa/balance-report.json", `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        totals: report.totals,
        byDifficulty: report.byDifficulty.map((entry) => ({
          difficultyName: entry.difficultyName,
          runs: entry.runs,
          wins: entry.wins,
          winRate: entry.winRate,
          averageFloors: entry.averageFloors,
          problemRuns: entry.problemRuns
        })),
        lossReasons: report.lossReasons,
        floorBands: report.floorBands,
        buildTags: report.buildTags.slice(0, 8),
        primaryBuilds: report.primaryBuilds.slice(0, 8),
        recommendations: report.recommendations,
        reportPath: "qa/balance-report.json"
      },
      null,
      2
    )
  );
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
