import assert from "node:assert/strict";
import test from "node:test";
import {
  cardCost,
  cancelDeckSelection,
  bossRecoveryAmount,
  canChooseEventOption,
  chooseEventOption,
  chooseRewardCard,
  chooseRewardRelic,
  chooseRest,
  contentCounts,
  effectiveCard,
  endTurn,
  enemyIdsForNode,
  enterNode,
  enemyIntentForecast,
  hasUpgradeableCards,
  isUpgradeableCard,
  buyShopCard,
  buyShopRelic,
  cardPlayPreview,
  leaveShop,
  newRun,
  playCard,
  requestShopUpgrade,
  restHealAmount,
  restoreRun,
  resolveDeckSelection,
  shopServicePrices,
  skipReward
} from "../src/engine/game.js";
import { defaultRecords, normalizeRecords, recordRunSummary } from "../src/engine/records.js";
import { deleteSavedRun, loadRunFromStorage, saveRunToStorage, SAVE_BACKUP_KEY, SAVE_KEY } from "../src/engine/save-slots.js";
import { CARDS } from "../src/data/cards.js";
import { EVENT_BY_ID } from "../src/data/events.js";
import { BOSS_IDS, ENEMIES, ENEMY_BY_ID } from "../src/data/enemies.js";
import { runBalanceSuite } from "../scripts/balance-runner.mjs";

function memoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

test("content meets commercial-slice minimums", () => {
  const counts = contentCounts();
  assert.ok(counts.cards >= 60, `expected 60 cards, got ${counts.cards}`);
  assert.ok(counts.relics >= 30, `expected 30 relics, got ${counts.relics}`);
  assert.ok(counts.normalEnemies >= 15, `expected 15 normal enemies, got ${counts.normalEnemies}`);
  assert.ok(counts.eliteEnemies >= 5, `expected 5 elite enemies, got ${counts.eliteEnemies}`);
  assert.ok(counts.bosses >= 3, `expected 3 bosses, got ${counts.bosses}`);
  assert.ok(counts.events >= 20, `expected 20 events, got ${counts.events}`);
  assert.ok(counts.difficulties >= 5, `expected 5 difficulties, got ${counts.difficulties}`);
});

test("new run creates a connected opening map and starter deck", () => {
  const run = newRun({ seed: "map-test", difficulty: 0 });
  assert.equal(run.phase, "map");
  assert.equal(run.player.deck.length, 10);
  assert.equal(run.availableNodeIds.length, 3);
  assert.ok(run.map.length >= 20);
  assert.ok(run.map.flat().some((node) => node.type === "boss" && node.act === 3));
});

test("stale map clicks cannot restart a node after combat has opened", () => {
  const run = newRun({ seed: "stale-map-click", difficulty: 0 });
  const nodeId = run.availableNodeIds[0];
  enterNode(run, nodeId);
  assert.equal(run.phase, "combat");
  const combat = run.combat;
  const fights = run.stats.fights;
  enterNode(run, nodeId);
  assert.equal(run.phase, "combat");
  assert.strictEqual(run.combat, combat);
  assert.equal(run.stats.fights, fights);
});

test("each act gives early growth before the elite fork", () => {
  const run = newRun({ seed: "elite-cadence", difficulty: 0 });
  for (let act = 1; act <= 3; act += 1) {
    const actStart = (act - 1) * 7;
    assert.ok(run.map[actStart].every((node) => node.type === "combat"), `${act}막 첫 층은 전투로 시작해야 합니다.`);
    assert.equal(run.map[actStart + 4][0].type, "elite", `${act}막 후반에 엘리트 선택지가 있어야 합니다.`);
    assert.equal(run.map[actStart + 4][1].type, "shop", `${act}막 후반에 상점 선택지가 있어야 합니다.`);
    const earlyNodes = run.map.slice(actStart, actStart + 4).flat();
    assert.ok(earlyNodes.every((node) => node.type !== "elite"), `${act}막 초반 4층 전에는 엘리트가 나오지 않아야 합니다.`);
    for (const node of run.map[actStart + 3]) {
      const connectedTypes = node.connections.map((id) => run.map[actStart + 4].find((candidate) => candidate.id === id)?.type);
      assert.ok(connectedTypes.some((type) => type && type !== "elite"), `${act}막 첫 엘리트 직전에는 안전한 대안 경로가 남아야 합니다.`);
    }
  }
});

test("route scout enemy pools come from the same act gates as combat creation", () => {
  assert.deepEqual(enemyIdsForNode("combat", 1), ["silt_clerk", "lantern_crab", "index_wisp", "glass_eel", "archive_leech", "drowned_page", "ledger_mite"]);
  assert.deepEqual(enemyIdsForNode("combat", 2), ["rust_choir", "brine_sentinel", "cipher_ray", "coral_hound", "archive_leech", "barnacle_drone", "null_squid", "mirror_jelly", "ledger_mite"]);
  assert.equal(enemyIdsForNode("combat", 3).length, ENEMIES.filter((enemy) => enemy.tier === "normal").length);
  assert.deepEqual(enemyIdsForNode("elite", 1), ["axiom_bailiff", "mnemonic_knight", "viral_cantor"]);
  assert.deepEqual(enemyIdsForNode("boss", 2), [BOSS_IDS[1]]);
  assert.deepEqual(enemyIdsForNode("event", 1), []);
});

test("seeded and challenge runs preserve deterministic route identity", () => {
  const first = newRun({ seed: "shared-seed", difficulty: 2, challenge: { type: "daily", name: "오늘의 계약" } });
  const second = newRun({ seed: "shared-seed", difficulty: 2, challenge: { type: "daily", name: "오늘의 계약" } });
  const signature = (run) => run.map.map((row) => row.map((node) => `${node.type}:${node.connections.join(".")}`).join("|")).join("/");
  assert.equal(signature(first), signature(second));
  assert.equal(first.challenge.name, "오늘의 계약");
});

test("save slots keep a backup and recover from a damaged primary save", () => {
  const storage = memoryStorage();
  const run = newRun({ seed: "save-recovery-flow", difficulty: 1 });
  const saved = saveRunToStorage(storage, run);
  assert.equal(saved.ok, true);
  assert.ok(storage.getItem(SAVE_KEY));
  assert.ok(storage.getItem(SAVE_BACKUP_KEY));

  storage.setItem(SAVE_KEY, "{broken primary");
  const recovered = loadRunFromStorage(storage);
  assert.ok(recovered.run);
  assert.equal(recovered.run.seed, "save-recovery-flow");
  assert.equal(recovered.notice.recovered, true);
  assert.match(recovered.notice.title, /백업/);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).seed, "save-recovery-flow");

  storage.setItem(SAVE_KEY, "{broken primary");
  storage.setItem(SAVE_BACKUP_KEY, "{broken backup");
  const failed = loadRunFromStorage(storage);
  assert.equal(failed.run, null);
  assert.equal(failed.notice.recovered, false);

  deleteSavedRun(storage);
  assert.equal(storage.getItem(SAVE_KEY), null);
  assert.equal(storage.getItem(SAVE_BACKUP_KEY), null);
});

test("save slots recover the newest backup after an interrupted primary write", () => {
  const storage = memoryStorage();
  const first = newRun({ seed: "save-primary-old", difficulty: 0 });
  first.updatedAt = 1000;
  assert.equal(saveRunToStorage(storage, first).ok, true);

  const second = newRun({ seed: "save-backup-new", difficulty: 0 });
  second.updatedAt = 2000;
  const failingPrimaryStorage = {
    getItem: storage.getItem,
    removeItem: storage.removeItem,
    setItem(key, value) {
      if (key === SAVE_KEY) throw new Error("primary write interrupted");
      storage.setItem(key, value);
    }
  };
  const interrupted = saveRunToStorage(failingPrimaryStorage, second);
  assert.equal(interrupted.ok, false);

  const recovered = loadRunFromStorage(storage);
  assert.equal(recovered.run.seed, "save-backup-new");
  assert.equal(recovered.notice.recovered, true);
  assert.match(recovered.notice.title, /백업/);
  assert.equal(JSON.parse(storage.getItem(SAVE_KEY)).seed, "save-backup-new");
});

test("save slots warn clearly when browser storage is unavailable", () => {
  const run = newRun({ seed: "storage-unavailable", difficulty: 0 });

  const missing = loadRunFromStorage(null);
  assert.equal(missing.run, null);
  assert.equal(missing.notice.recovered, false);
  assert.match(missing.notice.title, /저장소/);

  const saved = saveRunToStorage(undefined, run);
  assert.equal(saved.ok, false);
  assert.match(saved.notice.detail, /이어하기/);

  assert.doesNotThrow(() => deleteSavedRun({}));
});

test("daily contract modifiers normalize and alter run rules", () => {
  const run = newRun({
    seed: "daily-contract-rules",
    difficulty: 0,
    challenge: {
      type: "daily",
      name: "오늘의 계약",
      modifiers: ["ion_current", { id: "thin_oxygen" }, "missing_contract", "quarantine_breach", "static_archive"]
    }
  });
  assert.deepEqual(run.challenge.modifiers, ["ion_current", "thin_oxygen", "quarantine_breach"]);
  assert.equal(run.player.maxHp, 86);
  assert.equal(run.player.hp, 86);
  assert.equal(run.runFlags.startCharge, 2);
  assert.equal(run.runFlags.rewardCardBonus, 1);
  assert.equal(run.runFlags.enemyStartVirus, 2);
  assert.equal(run.runFlags.startVulnerable, 1);

  const baseline = newRun({ seed: "daily-contract-rules", difficulty: 0 });
  enterNode(baseline, baseline.availableNodeIds[0]);
  enterNode(run, run.availableNodeIds[0]);
  assert.ok(run.combat.enemies[0].maxHp > baseline.combat.enemies[0].maxHp);
  assert.equal(run.player.statuses.charge, 2);
  assert.equal(run.player.statuses.vulnerable, 1);
  assert.ok(run.combat.enemies.every((enemy) => enemy.statuses.virus === 2));

  run.combat.enemies.forEach((enemy) => {
    enemy.hp = 1;
    enemy.block = 0;
  });
  run.combat.hand = [{ uid: 1131, cardId: "rust_bloom", upgraded: true, temporary: false, costMod: 0 }];
  run.combat.energy = 3;
  playCard(run, 1131, run.combat.enemies[0].uid);
  assert.equal(run.phase, "reward");
  assert.equal(run.reward.cards.length, 4);
});

test("daily contract modifiers can reshape first turns and shop economy", () => {
  const drawRun = newRun({
    seed: "daily-contract-draw",
    difficulty: 0,
    challenge: { type: "daily", name: "오늘의 계약", modifiers: ["static_archive"] }
  });
  enterNode(drawRun, drawRun.availableNodeIds[0]);
  assert.equal(drawRun.player.statuses.weak, 1);
  assert.equal(drawRun.combat.hand.length, 7);

  const economyRun = newRun({
    seed: "daily-contract-economy",
    difficulty: 0,
    challenge: { type: "daily", name: "오늘의 계약", modifiers: ["salvage_quota", "expedition_tax"] }
  });
  assert.equal(economyRun.player.gold, 139);
  assert.equal(shopServicePrices(economyRun).remove, 84);
});

test("combat card play spends energy and damages a selected enemy", () => {
  const run = newRun({ seed: "combat-test", difficulty: 0 });
  enterNode(run, run.availableNodeIds[0]);
  assert.equal(run.phase, "combat");
  const enemy = run.combat.enemies[0];
  run.combat.hand = [{ uid: 999, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 }];
  run.combat.energy = 3;
  const beforeHp = enemy.hp;
  playCard(run, 999, enemy.uid);
  assert.ok(enemy.hp < beforeHp);
  assert.equal(run.combat.energy, 2);
});

test("card play preview reflects damage, block, and energy without mutating combat", () => {
  const run = newRun({ seed: "card-preview", difficulty: 0 });
  enterNode(run, run.availableNodeIds[0]);
  const enemy = run.combat.enemies[0];
  enemy.block = 2;
  enemy.statuses = { vulnerable: 1, mark: 1 };
  run.player.statuses = { strength: 1 };
  run.combat.hand = [{ uid: 919, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 }];
  run.combat.energy = 3;
  const before = { hp: enemy.hp, block: enemy.block, mark: enemy.statuses.mark, energy: run.combat.energy };

  const preview = cardPlayPreview(run, run.combat.hand[0], enemy.uid);

  assert.equal(preview.playable, true);
  assert.equal(preview.damage, 11);
  assert.equal(preview.blockedDamage, 2);
  assert.equal(preview.energyDelta, -1);
  assert.equal(preview.energyAfter, 2);
  assert.equal(enemy.hp, before.hp);
  assert.equal(enemy.block, before.block);
  assert.equal(enemy.statuses.mark, before.mark);
  assert.equal(run.combat.energy, before.energy);
});

test("all playable cards expose complete use previews", () => {
  const run = newRun({ seed: "card-preview-coverage", difficulty: 0 });
  enterNode(run, run.availableNodeIds[0]);
  const enemy = run.combat.enemies[0];
  enemy.hp = 999;
  enemy.block = 4;
  enemy.statuses = { vulnerable: 1, mark: 2, virus: 2, weak: 1, frail: 1 };
  run.player.block = 20;
  run.player.statuses = { charge: 4, focus: 2, strength: 1 };
  run.combat.energy = 99;
  run.combat.attacksPlayedThisTurn = 5;

  let uid = 12000;
  for (const card of CARDS.filter((item) => !item.unplayable)) {
    for (const upgraded of [false, Boolean(card.upgrade)]) {
      const cardInstance = { uid: uid += 1, cardId: card.id, upgraded, temporary: false, costMod: 0 };
      run.combat.hand = [cardInstance];
      const preview = cardPlayPreview(run, cardInstance, enemy.uid);
      assert.equal(preview.playable, true, `${card.id}${upgraded ? "+" : ""} should be preview-playable`);
      assert.deepEqual(preview.warnings, [], `${card.id}${upgraded ? "+" : ""} has incomplete preview warnings`);
    }
  }
});

test("enemy intent forecast exposes exact incoming damage and pressure", () => {
  const run = newRun({ seed: "intent-forecast", difficulty: 2 });
  enterNode(run, run.availableNodeIds[0]);
  const enemy = run.combat.enemies[0];
  run.player.block = 5;
  run.player.statuses = { vulnerable: 1, mark: 1 };
  enemy.statuses = { strength: 2 };
  enemy.nextMove = {
    id: "forecast_test",
    label: "압력 검산",
    intent: "공격 10 x2, 약화 1",
    type: "attack",
    damage: 10,
    hits: 2,
    block: 7,
    applyToPlayer: [{ status: "weak", amount: 1 }],
    self: [{ status: "strength", amount: 1 }],
    summon: [{ enemyId: "ledger_mite", count: 2 }]
  };

  const forecast = enemyIntentForecast(run);

  assert.equal(forecast.incomingDamage, 38);
  assert.equal(forecast.blockedDamage, 5);
  assert.equal(forecast.hpLoss, 33);
  assert.deepEqual(forecast.incomingStatuses, [{ status: "weak", amount: 1 }]);
  assert.deepEqual(forecast.enemyBuffs, [{ status: "strength", amount: 1 }]);
  assert.equal(forecast.enemyBlock, 7);
  assert.equal(forecast.summons, 2);
  assert.equal(forecast.attackIntents, 1);
});

test("every playable card and upgrade executes safely in combat", () => {
  const playableCards = CARDS.filter((card) => !card.unplayable && card.type !== "curse");
  for (const card of playableCards) {
    const variants = card.upgrade ? [false, true] : [false];
    for (const upgraded of variants) {
      const run = preparedCardRun(`card-smoke-${card.id}-${upgraded ? "upgraded" : "base"}`, card.id, upgraded);
      const target = run.combat.enemies[0];
      assert.doesNotThrow(() => playCard(run, 9001, target.uid), `${card.id}${upgraded ? "+" : ""} should execute`);
      assert.ok(["combat", "reward", "summary"].includes(run.phase), `${card.id}${upgraded ? "+" : ""} left run in ${run.phase}`);
      if (run.phase === "combat") {
        assert.ok(run.combat.hand.every((item) => item.uid !== 9001), `${card.id}${upgraded ? "+" : ""} should leave hand after use`);
      }
    }
  }
});

test("draw and discard piles recycle after end turn", () => {
  const run = newRun({ seed: "pile-test", difficulty: 0 });
  enterNode(run, run.availableNodeIds[0]);
  run.combat.hand = [];
  run.combat.drawPile = [];
  run.combat.discardPile = [
    { uid: 91, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 },
    { uid: 92, cardId: "tide_ward", upgraded: false, temporary: false, costMod: 0 }
  ];
  endTurn(run);
  assert.ok(run.combat.hand.length > 0 || run.phase === "summary");
});

test("generated cards respect the hand limit and overflow to discard", () => {
  const run = newRun({ seed: "generated-hand-limit", difficulty: 0 });
  enterNode(run, run.availableNodeIds[0]);
  run.combat.energy = 3;
  run.combat.hand = [
    { uid: 8100, cardId: "index_spark", upgraded: false, temporary: false, costMod: 0 },
    ...Array.from({ length: 9 }, (_, index) => ({
      uid: 8101 + index,
      cardId: "tide_ward",
      upgraded: false,
      temporary: false,
      costMod: 0
    }))
  ];
  run.combat.discardPile = [];

  playCard(run, 8100, run.combat.enemies[0].uid);

  const generated = [...run.combat.hand, ...run.combat.discardPile].filter((card) => card.cardId === "null_pin" && card.temporary);
  assert.ok(run.combat.hand.length <= 10);
  assert.equal(generated.length, 2);
  assert.ok(run.combat.discardPile.some((card) => card.cardId === "null_pin" && card.temporary));
  assert.ok(run.log.some((entry) => entry.text.includes("생성 공간 부족")));
});

test("reward choice adds a card and advances after combat victory", () => {
  const run = newRun({ seed: "reward-test", difficulty: 0 });
  enterNode(run, run.availableNodeIds[0]);
  const enemy = run.combat.enemies[0];
  enemy.hp = 1;
  enemy.block = 0;
  run.combat.hand = [{ uid: 1000, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 }];
  run.combat.energy = 3;
  playCard(run, 1000, enemy.uid);
  assert.equal(run.phase, "reward");
  run.reward.cards = ["wire_reef"];
  run.reward.relicChoices = [];
  const picked = run.reward.cards[0];
  const beforeDeck = run.player.deck.length;
  chooseRewardCard(run, picked);
  chooseFirstRewardRelicIfNeeded(run);
  assert.equal(run.phase, "map");
  assert.equal(run.player.deck.length, beforeDeck + 1);
  assert.ok(run.log.some((entry) => entry.text.includes("전선 암초를 덱에 추가했습니다.")));
});

test("relic rewards require a meaningful relic choice before completion", () => {
  const run = newRun({ seed: "relic-choice-reward", difficulty: 0 });
  const eliteNode = run.map.flat().find((node) => node.type === "elite");
  run.availableNodeIds = [eliteNode.id];
  enterNode(run, eliteNode.id);
  run.combat.enemies.forEach((enemy) => {
    enemy.hp = 1;
    enemy.block = 0;
  });
  run.combat.hand = [{ uid: 1050, cardId: "rust_bloom", upgraded: true, temporary: false, costMod: 0 }];
  run.combat.energy = 3;
  playCard(run, 1050, run.combat.enemies[0].uid);

  assert.equal(run.phase, "reward");
  assert.ok(run.reward.relicChoices.length >= 2);
  const pickedCard = run.reward.cards[0];
  const pickedRelic = run.reward.relicChoices[0];
  const beforeDeck = run.player.deck.length;
  const beforeRelics = run.player.relics.length;

  chooseRewardCard(run, pickedCard);
  assert.equal(run.phase, "reward");
  assert.equal(run.reward.selectedCardId, pickedCard);
  assert.equal(run.player.deck.length, beforeDeck);

  chooseRewardRelic(run, pickedRelic);
  assert.equal(run.phase, "map");
  assert.equal(run.player.deck.length, beforeDeck + 1);
  assert.equal(run.player.relics.length, beforeRelics + 1);
  assert.ok(run.player.relics.includes(pickedRelic));
});

test("invalid reward actions cannot complete a reward or trigger skip relics", () => {
  const run = newRun({ seed: "invalid-reward-action", difficulty: 0 });
  run.player.relics.push("austere_tablet");
  enterNode(run, run.availableNodeIds[0]);
  run.combat.enemies.forEach((enemy) => {
    enemy.hp = 1;
    enemy.block = 0;
  });
  run.combat.hand = [{ uid: 1101, cardId: "rust_bloom", upgraded: true, temporary: false, costMod: 0 }];
  run.combat.energy = 3;
  playCard(run, 1101, run.combat.enemies[0].uid);

  assert.equal(run.phase, "reward");
  const beforeMaxHp = run.player.maxHp;
  const beforeDeck = run.player.deck.length;
  chooseRewardCard(run, "not-a-real-reward");
  assert.equal(run.phase, "reward");
  assert.equal(run.player.deck.length, beforeDeck);
  assert.equal(run.player.maxHp, beforeMaxHp);

  const offPhaseRun = newRun({ seed: "skip-off-phase", difficulty: 0 });
  offPhaseRun.player.relics.push("austere_tablet");
  const offPhaseMaxHp = offPhaseRun.player.maxHp;
  skipReward(offPhaseRun);
  assert.equal(offPhaseRun.phase, "map");
  assert.equal(offPhaseRun.player.maxHp, offPhaseMaxHp);
  assert.equal(relicWasTriggered(offPhaseRun, "austere_tablet"), false);
});

test("skip reward preserves deck size and can be serialized", () => {
  const run = newRun({ seed: "serialize-test", difficulty: 0 });
  enterNode(run, run.availableNodeIds[0]);
  run.combat.enemies.forEach((enemy) => {
    enemy.hp = 1;
    enemy.block = 0;
  });
  run.combat.hand = [{ uid: 1001, cardId: "rust_bloom", upgraded: true, temporary: false, costMod: 0 }];
  run.combat.energy = 3;
  playCard(run, 1001, run.combat.enemies[0].uid);
  const beforeDeck = run.player.deck.length;
  assert.equal(run.phase, "reward");
  skipReward(run);
  chooseFirstRewardRelicIfNeeded(run);
  const restored = restoreRun(JSON.parse(JSON.stringify(run)));
  assert.equal(restored.player.deck.length, beforeDeck);
  assert.equal(restored.phase, "map");
});

test("upgraded cards expose upgraded text, effects, and cost", () => {
  const run = newRun({ seed: "upgrade-test", difficulty: 0 });
  const card = { uid: 7, cardId: "pulse_lance", upgraded: true, temporary: false, costMod: 0 };
  assert.match(effectiveCard(card).text, /피해 9/);
  assert.equal(cardCost(card, null), 1);
  assert.equal(run.player.relics[0], "salted_compass");
});

test("random upgrade effects only choose cards with real upgrade value", () => {
  const combatRun = newRun({ seed: "random-hand-upgrade-candidates", difficulty: 0 });
  enterNode(combatRun, combatRun.availableNodeIds[0]);
  combatRun.combat.energy = 3;
  combatRun.combat.hand = [
    { uid: 4101, cardId: "minor_rewrite", upgraded: false, temporary: false, costMod: 0 },
    { uid: 4102, cardId: "waterlogged_doubt", upgraded: false, temporary: false, costMod: 0 },
    { uid: 4103, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 }
  ];

  playCard(combatRun, 4101, combatRun.combat.enemies[0].uid);

  assert.equal(combatRun.combat.hand.find((card) => card.uid === 4103).upgraded, true);
  assert.equal(combatRun.combat.hand.find((card) => card.uid === 4102).upgraded, false);

  const eventRun = newRun({ seed: "random-deck-upgrade-candidates", difficulty: 0 });
  const upgradable = eventRun.player.deck.find((card) => card.cardId === "pulse_lance");
  eventRun.player.deck = [
    { uid: 4202, cardId: "waterlogged_doubt", upgraded: false, temporary: false, costMod: 0 },
    upgradable
  ];
  eventRun.phase = "event";
  eventRun.event = { eventId: "singing_server", chosen: null };
  eventRun.player.hp = eventRun.player.maxHp;

  chooseEventOption(eventRun, 0);

  assert.equal(upgradable.upgraded, true);
  assert.equal(eventRun.player.deck.find((card) => card.cardId === "waterlogged_doubt").upgraded, false);
});

test("event choices cannot resolve when their rewards have no current value", () => {
  const noUpgradeRun = newRun({ seed: "event-no-value-upgrade", difficulty: 0 });
  noUpgradeRun.player.deck = [{ uid: 4301, cardId: "waterlogged_doubt", upgraded: false, temporary: false, costMod: 0 }];
  noUpgradeRun.phase = "event";
  noUpgradeRun.event = { eventId: "cracked_bell", chosen: null };
  const hpBefore = noUpgradeRun.player.hp;

  assert.equal(canChooseEventOption(noUpgradeRun, EVENT_BY_ID.cracked_bell.choices[1].effects), false);
  chooseEventOption(noUpgradeRun, 1);

  assert.equal(noUpgradeRun.phase, "event");
  assert.equal(noUpgradeRun.event.chosen, null);
  assert.equal(noUpgradeRun.player.hp, hpBefore);
  assert.equal(noUpgradeRun.player.deck[0].upgraded, false);

  const mixedValueRun = newRun({ seed: "event-mixed-heal-value", difficulty: 0 });
  mixedValueRun.player.deck = [{ uid: 4302, cardId: "waterlogged_doubt", upgraded: false, temporary: false, costMod: 0 }];
  mixedValueRun.phase = "event";
  mixedValueRun.event = { eventId: "frozen_choir", chosen: null };
  mixedValueRun.player.hp = mixedValueRun.player.maxHp - 6;

  assert.equal(canChooseEventOption(mixedValueRun, EVENT_BY_ID.frozen_choir.choices[1].effects), true);
  chooseEventOption(mixedValueRun, 1);

  assert.equal(mixedValueRun.event.chosen, 1);
  assert.equal(mixedValueRun.player.hp, mixedValueRun.player.maxHp - 2);
});

test("cleanse cache is a reliable starter answer to stacked harmful statuses", () => {
  const run = newRun({ seed: "cleanse-cache-balance", difficulty: 0 });
  enterNode(run, run.availableNodeIds[0]);
  run.player.statuses = { virus: 4, weak: 2 };
  run.combat.hand = [{ uid: 7101, cardId: "cleanse_cache", upgraded: false, temporary: false, costMod: 0 }];
  run.combat.drawPile = [{ uid: 7102, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 }];
  run.combat.energy = 3;
  playCard(run, 7101, run.combat.enemies[0].uid);
  assert.equal(run.player.statuses.virus, 1);
  assert.equal(run.player.statuses.weak, 2);
  assert.ok(run.combat.hand.some((cardInstance) => cardInstance.uid === 7102));

  const upgradedRun = newRun({ seed: "cleanse-cache-upgraded-balance", difficulty: 0 });
  enterNode(upgradedRun, upgradedRun.availableNodeIds[0]);
  upgradedRun.player.statuses = { virus: 4, weak: 2 };
  upgradedRun.combat.hand = [{ uid: 7201, cardId: "cleanse_cache", upgraded: true, temporary: false, costMod: 0 }];
  upgradedRun.combat.drawPile = [{ uid: 7202, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 }];
  upgradedRun.combat.energy = 3;
  playCard(upgradedRun, 7201, upgradedRun.combat.enemies[0].uid);
  assert.equal(upgradedRun.player.statuses.virus, undefined);
  assert.equal(upgradedRun.player.statuses.weak, 1);
  assert.match(effectiveCard({ uid: 7201, cardId: "cleanse_cache", upgraded: true, temporary: false, costMod: 0 }).text, /해로운 상태를 5/);
});

test("relic triggers are retained for visible combat feedback", () => {
  const run = newRun({ seed: "relic-feedback", difficulty: 0 });
  enterNode(run, run.availableNodeIds[0]);

  assert.ok(run.relicTriggers.some((trigger) => trigger.relicId === "salted_compass"));
  assert.ok(run.combat.relicTriggers.some((trigger) => trigger.relicId === "salted_compass"));
  assert.ok(run.log.some((entry) => entry.tone === "relic" && entry.text.includes("염분 나침반")));

  const restored = restoreRun(JSON.parse(JSON.stringify(run)));
  assert.ok(restored.relicTriggers.length > 0);
});

test("restored combat saves normalize transient feedback state before relic triggers", () => {
  const run = newRun({ seed: "restore-combat-feedback", difficulty: 0 });
  run.player.relics.push("red_ledger");
  enterNode(run, run.availableNodeIds[0]);
  run.combat.enemies = [run.combat.enemies[0]];
  run.combat.enemies[0].maxHp = 999;
  run.combat.enemies[0].hp = 999;
  run.combat.enemies[0].statuses = { virus: 3 };
  run.combat.enemies[0].nextMove = { label: "검증 대기", intent: "대기", type: "defend", block: 0 };
  run.combat.hand = [];
  run.player.maxHp = 200;
  run.player.hp = 200;

  const saved = JSON.parse(JSON.stringify(run));
  delete saved.combat.relicTriggers;
  delete saved.combat.turnCostMods;

  const restored = restoreRun(saved);
  assert.deepEqual(restored.combat.relicTriggers, []);
  assert.deepEqual(restored.combat.turnCostMods, {});
  assert.doesNotThrow(() => endTurn(restored));
  assert.ok(relicWasTriggered(restored, "red_ledger"));
});

test("combat start and turn-start relics apply readable state changes", () => {
  const run = combatRunWithRelics(
    ["brass_compass", "coral_seal", "mnemonic_shell", "quarantine_tag", "pressure_vial", "echo_chamber", "choir_bell", "engine_oil"],
    { hp: 40 }
  );
  const enemy = run.combat.enemies[0];
  assert.equal(run.player.statuses.charge, 2);
  assert.equal(run.player.statuses.echo, 1);
  assert.equal(run.player.statuses.choir, 1);
  assert.equal(run.player.statuses.frail, 1);
  assert.ok(run.player.block >= 6, "combat-start block should survive the opening turn");
  assert.equal(run.combat.energy, 4);
  assert.equal(enemy.statuses.virus, 2);
  assert.equal(enemy.statuses.vulnerable, 1);
  for (const relicId of ["brass_compass", "coral_seal", "mnemonic_shell", "quarantine_tag", "pressure_vial", "echo_chamber", "choir_bell", "engine_oil"]) {
    assert.ok(relicWasTriggered(run, relicId), `${relicId} should trigger`);
  }

  const batteryRun = combatRunWithRelics(["dead_battery"], { hp: 80 });
  assert.equal(batteryRun.combat.maxEnergy, 4);
  assert.equal(batteryRun.player.hp, 78);

  const gillRun = combatRunWithRelics(["clockwork_gill"], { hp: 40 });
  assert.ok(relicWasTriggered(gillRun, "clockwork_gill"));

  const turbineRun = combatRunWithRelics(["pearl_turbine"]);
  turbineRun.player.statuses.charge = 2;
  endTurn(turbineRun);
  assert.ok(relicWasTriggered(turbineRun, "pearl_turbine"));

  const hourglassRun = combatRunWithRelics(["sealed_hourglass"]);
  endTurn(hourglassRun);
  endTurn(hourglassRun);
  assert.ok(relicWasTriggered(hourglassRun, "sealed_hourglass"));
});

test("card-use relics alter combat decisions at their documented timings", () => {
  const attackRun = preparedRelicCardRun(["cracked_anchor", "abyssal_needle", "lens_prism"], [
    { uid: 9101, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 }
  ]);
  attackRun.combat.enemies[0].statuses.mark = 1;
  playCard(attackRun, 9101, attackRun.combat.enemies[0].uid);
  assert.ok(relicWasTriggered(attackRun, "cracked_anchor"));
  assert.ok(relicWasTriggered(attackRun, "abyssal_needle"));
  assert.ok(relicWasTriggered(attackRun, "lens_prism"));
  assert.ok((attackRun.combat.enemies[0].statuses.virus ?? 0) >= 1);

  const metronomeRun = preparedRelicCardRun(["tide_metronome"], [
    { uid: 9201, cardId: "null_pin", upgraded: false, temporary: false, costMod: 0 },
    { uid: 9202, cardId: "null_pin", upgraded: false, temporary: false, costMod: 0 },
    { uid: 9203, cardId: "null_pin", upgraded: false, temporary: false, costMod: 0 }
  ]);
  metronomeRun.combat.energy = 0;
  for (const uid of [9201, 9202, 9203]) playCard(metronomeRun, uid, metronomeRun.combat.enemies[0].uid);
  assert.equal(metronomeRun.combat.energy, 1);
  assert.ok(relicWasTriggered(metronomeRun, "tide_metronome"));

  const skillRun = preparedRelicCardRun(["glass_inkwell"], [
    { uid: 9301, cardId: "tide_ward", upgraded: false, temporary: false, costMod: 0 },
    { uid: 9302, cardId: "cleanse_cache", upgraded: false, temporary: false, costMod: 0 }
  ]);
  playCard(skillRun, 9301, skillRun.combat.enemies[0].uid);
  playCard(skillRun, 9302, skillRun.combat.enemies[0].uid);
  assert.ok(relicWasTriggered(skillRun, "glass_inkwell"));

  const powerRun = preparedRelicCardRun(["harmonic_spool", "recursive_key"], [
    { uid: 9401, cardId: "deep_index", upgraded: false, temporary: false, costMod: 0 }
  ]);
  playCard(powerRun, 9401, powerRun.combat.enemies[0].uid);
  assert.ok(relicWasTriggered(powerRun, "harmonic_spool"));
  assert.ok(relicWasTriggered(powerRun, "recursive_key"));
  assert.ok(powerRun.combat.exhaustPile.some((card) => card.uid === 9401));

  const blockRun = preparedRelicCardRun(["counterweight"], [{ uid: 9501, cardId: "reef_bastion", upgraded: false, temporary: false, costMod: 0 }]);
  playCard(blockRun, 9501, blockRun.combat.enemies[0].uid);
  assert.equal(blockRun.player.statuses.counter, 3);
  assert.ok(relicWasTriggered(blockRun, "counterweight"));

  const coralRun = preparedRelicCardRun(["black_coral"], [{ uid: 9601, cardId: "static_psalm", upgraded: false, temporary: false, costMod: 0 }]);
  coralRun.combat.enemies[0].statuses = {};
  playCard(coralRun, 9601, coralRun.combat.enemies[0].uid);
  assert.equal(coralRun.combat.enemies[0].statuses.virus, 5);
  assert.ok(relicWasTriggered(coralRun, "black_coral"));

  const ledgerRun = combatRunWithRelics(["red_ledger"]);
  ledgerRun.combat.enemies[0].statuses.virus = 3;
  const damageBefore = ledgerRun.stats.damageDealt;
  endTurn(ledgerRun);
  assert.ok(ledgerRun.stats.damageDealt >= damageBefore + 4);
  assert.ok(relicWasTriggered(ledgerRun, "red_ledger"));
});

test("reward shop and rest relics change non-combat economy flows", () => {
  const mappedRewardRun = forcedRewardRun(["map_of_silt"], "combat");
  assert.equal(mappedRewardRun.reward.cards.length, 4);
  assert.ok(relicWasTriggered(mappedRewardRun, "map_of_silt"));

  const lensRewardRun = forcedRewardRun(["salvaged_lens"], "combat");
  assert.ok(lensRewardRun.reward.gold >= 28);
  assert.ok(relicWasTriggered(lensRewardRun, "salvaged_lens"));

  const medalRun = forcedRewardRun(["diver_medal"], "elite");
  assert.ok(medalRun.reward.gold >= 73);
  assert.ok(relicWasTriggered(medalRun, "diver_medal"));

  const austereRun = forcedRewardRun(["austere_tablet"], "combat");
  const maxHpBefore = austereRun.player.maxHp;
  skipReward(austereRun);
  chooseFirstRewardRelicIfNeeded(austereRun);
  assert.equal(austereRun.player.maxHp, maxHpBefore + 1);
  assert.ok(relicWasTriggered(austereRun, "austere_tablet"));

  const crownRun = newRun({ seed: "brittle-crown-shop", difficulty: 0 });
  crownRun.phase = "shop";
  crownRun.player.gold = 0;
  crownRun.shop = { cards: [], relics: [{ relicId: "brittle_crown", price: 0, sold: false }] };
  buyShopRelic(crownRun, 0);
  assert.equal(crownRun.player.gold, 90);
  assert.ok(relicWasTriggered(crownRun, "brittle_crown"));

  const priceRun = newRun({ seed: "shop-price-relics", difficulty: 0 });
  const defaultPrices = shopServicePrices(priceRun);
  priceRun.player.relics.push("flooded_coin", "archive_pass");
  const discountedPrices = shopServicePrices(priceRun);
  assert.ok(discountedPrices.heal < defaultPrices.heal);
  assert.ok(discountedPrices.remove < defaultPrices.remove);

  const restRun = newRun({ seed: "resting-gear-flow", difficulty: 0 });
  restRun.phase = "rest";
  restRun.player.relics = ["resting_gear"];
  restRun.player.maxHp = 100;
  restRun.player.hp = 10;
  assert.equal(restHealAmount(restRun), 48);
  chooseRest(restRun, "heal");
  assert.equal(restRun.player.hp, 58);
  assert.ok(relicWasTriggered(restRun, "resting_gear"));
});

test("combat max energy effects match card text without phantom next-turn energy", () => {
  const run = newRun({ seed: "max-energy-card", difficulty: 0 });
  enterNode(run, run.availableNodeIds[0]);
  run.player.maxHp = 99;
  run.player.hp = 99;
  run.combat.hand = [{ uid: 3001, cardId: "oath_of_the_deep", upgraded: true, temporary: false, costMod: 0 }];
  run.combat.drawPile = [];
  run.combat.discardPile = [];
  run.combat.energy = 3;
  run.combat.maxEnergy = 3;
  const enemy = run.combat.enemies[0];
  enemy.nextMove = { label: "검증 대기", intent: "대기", type: "defend", block: 0 };

  playCard(run, 3001, enemy.uid);
  assert.equal(run.phase, "combat");
  assert.equal(run.combat.energy, 1);
  assert.equal(run.combat.maxEnergy, 4);
  assert.equal(run.combat.tempMaxEnergy, 0);

  endTurn(run);
  assert.equal(run.phase, "combat");
  assert.equal(run.combat.energy, 4);
  assert.equal(run.combat.maxEnergy, 4);
});

test("shop, rest, final boss victory, and defeat flows are reachable", () => {
  const shopRun = newRun({ seed: "shop-flow", difficulty: 0 });
  shopRun.map[0][0].type = "shop";
  shopRun.availableNodeIds = [shopRun.map[0][0].id];
  enterNode(shopRun, shopRun.availableNodeIds[0]);
  assert.equal(shopRun.phase, "shop");
  const beforeShopDeck = shopRun.player.deck.length;
  buyShopCard(shopRun, 0);
  assert.equal(shopRun.player.deck.length, beforeShopDeck + 1);

  const restRun = newRun({ seed: "rest-flow", difficulty: 0 });
  restRun.player.hp = 30;
  restRun.map[0][0].type = "rest";
  restRun.availableNodeIds = [restRun.map[0][0].id];
  enterNode(restRun, restRun.availableNodeIds[0]);
  assert.equal(restRun.phase, "rest");
  chooseRest(restRun, "heal");
  assert.equal(restRun.phase, "map");
  assert.ok(restRun.player.hp > 30);

  const winRun = newRun({ seed: "boss-flow", difficulty: 0 });
  const finalBoss = winRun.map.flat().find((node) => node.type === "boss" && node.act === 3);
  winRun.availableNodeIds = [finalBoss.id];
  enterNode(winRun, finalBoss.id);
  assert.equal(winRun.phase, "combat");
  winRun.combat.enemies[0].hp = 1;
  winRun.combat.enemies[0].block = 0;
  winRun.combat.hand = [{ uid: 2001, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 }];
  winRun.combat.energy = 3;
  playCard(winRun, 2001, winRun.combat.enemies[0].uid);
  assert.equal(winRun.phase, "reward");
  skipReward(winRun);
  chooseFirstRewardRelicIfNeeded(winRun);
  assert.equal(winRun.phase, "summary");
  assert.equal(winRun.summary.won, true);
  assert.deepEqual(winRun.summary.killedBosses, [ENEMY_BY_ID[BOSS_IDS[2]].name]);
  assert.equal(winRun.summary.difficulty, "표층");
  assert.equal(winRun.summary.difficultyId, 0);
  assert.equal(typeof winRun.summary.durationSeconds, "number");
  assert.equal(typeof winRun.summary.hp, "number");
  assert.equal(typeof winRun.summary.maxHp, "number");
  assert.equal(typeof winRun.summary.fights, "number");
  assert.equal(typeof winRun.summary.cardsAdded, "number");
  assert.equal(typeof winRun.summary.cardsRemoved, "number");
  assert.equal(winRun.summary.route.acts.length, 3);
  assert.equal(winRun.summary.route.acts[2].boss, "defeated");
  assert.equal(winRun.summary.route.acts[2].stoppedAt.type, "boss");

  const loseRun = newRun({ seed: "loss-flow", difficulty: 0 });
  enterNode(loseRun, loseRun.availableNodeIds[0]);
  loseRun.player.hp = 1;
  loseRun.player.block = 0;
  loseRun.combat.hand = [];
  loseRun.combat.enemies[0].nextMove = { label: "검증 공격", intent: "공격 9", type: "attack", damage: 9 };
  endTurn(loseRun);
  assert.equal(loseRun.phase, "summary");
  assert.equal(loseRun.summary.won, false);
  assert.equal(loseRun.summary.route.acts[0].stoppedAt.type, "combat");
  assert.equal(loseRun.summary.route.acts[0].stoppedAt.completed, false);
});

test("act boss rewards include an interlude recovery before the next zone", () => {
  const run = newRun({ seed: "boss-interlude-recovery", difficulty: 0 });
  const bossNode = run.map.flat().find((node) => node.type === "boss" && node.act === 1);
  run.availableNodeIds = [bossNode.id];
  run.player.hp = 18;
  const expectedRecovery = bossRecoveryAmount(run);
  enterNode(run, bossNode.id);
  run.player.hp = 18;
  run.combat.enemies[0].hp = 1;
  run.combat.enemies[0].block = 0;
  run.combat.hand = [{ uid: 6101, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 }];
  run.combat.energy = 3;

  playCard(run, 6101, run.combat.enemies[0].uid);
  assert.equal(run.phase, "reward");
  skipReward(run);
  chooseFirstRewardRelicIfNeeded(run);

  assert.equal(run.phase, "map");
  assert.equal(run.player.hp, 18 + expectedRecovery);
  assert.equal(run.lastInterlude.type, "act-transition");
  assert.equal(run.lastInterlude.fromAct, 1);
  assert.equal(run.lastInterlude.toAct, 2);
  assert.equal(run.lastInterlude.recovered, expectedRecovery);
  assert.match(run.lastInterlude.nextBossName, /\S/);
  assert.match(run.lastInterlude.presentationKey, /^act-1-2-7-/);
  assert.equal(run.lastInterlude.ackRequired, true);
  assert.equal(run.lastInterlude.dismissed, false);
  assert.ok(run.log.some((entry) => entry.tone === "rest" && entry.text.includes("장비")));

  enterNode(run, run.availableNodeIds[0]);
  assert.equal(run.lastInterlude, null);

  const highDifficultyRun = newRun({ seed: "boss-interlude-recovery-high", difficulty: 5 });
  assert.ok(bossRecoveryAmount(run) > bossRecoveryAmount(highDifficultyRun));
});

test("boss phase transition updates intent and logs the named phase", () => {
  const run = newRun({ seed: "boss-phase-flow", difficulty: 0 });
  const bossNode = run.map.flat().find((node) => node.type === "boss" && node.act === 1);
  run.availableNodeIds = [bossNode.id];
  enterNode(run, bossNode.id);
  const boss = run.combat.enemies[0];
  const template = ENEMY_BY_ID[boss.templateId];
  boss.hp = Math.ceil(boss.maxHp * template.phaseAt) + 2;
  boss.block = 0;
  boss.phase = 1;
  run.combat.hand = [{ uid: 5001, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 }];
  run.combat.energy = 3;

  playCard(run, 5001, boss.uid);

  assert.equal(run.phase, "combat");
  assert.equal(boss.phase, 2);
  assert.ok(boss.nextMove);
  assert.ok(run.log.some((entry) => entry.tone === "enemy" && entry.text.includes(template.phaseName)));
});

test("upgrade services cannot waste resources when no meaningful upgrades remain", () => {
  const shopRun = newRun({ seed: "no-upgrades-shop", difficulty: 0 });
  shopRun.map[0][0].type = "shop";
  shopRun.availableNodeIds = [shopRun.map[0][0].id];
  shopRun.player.deck.forEach((card) => {
    card.upgraded = true;
  });
  shopRun.player.gold = 200;
  enterNode(shopRun, shopRun.availableNodeIds[0]);
  const beforeGold = shopRun.player.gold;

  assert.equal(hasUpgradeableCards(shopRun), false);
  requestShopUpgrade(shopRun);
  assert.equal(shopRun.player.gold, beforeGold);
  assert.equal(shopRun.selector, null);

  const restRun = newRun({ seed: "no-upgrades-rest", difficulty: 0 });
  restRun.map[0][0].type = "rest";
  restRun.availableNodeIds = [restRun.map[0][0].id];
  restRun.player.deck.forEach((card) => {
    card.upgraded = true;
  });
  enterNode(restRun, restRun.availableNodeIds[0]);
  chooseRest(restRun, "upgrade");
  assert.equal(restRun.phase, "rest");
  assert.equal(restRun.selector, null);
  assert.ok(restRun.log.some((entry) => entry.tone === "warn" && entry.text.includes("강화할 카드가 없습니다")));

  const selectorRun = newRun({ seed: "invalid-upgrade-select", difficulty: 0 });
  selectorRun.selector = { mode: "upgrade", context: "rest", after: "completeNode" };
  const alreadyUpgraded = selectorRun.player.deck[0];
  alreadyUpgraded.upgraded = true;
  resolveDeckSelection(selectorRun, alreadyUpgraded.uid);
  assert.equal(selectorRun.selector.mode, "upgrade");
  assert.ok(selectorRun.log.some((entry) => entry.tone === "warn" && entry.text.includes("강화 효과가 없는")));
  assert.equal(isUpgradeableCard({ uid: 9999, cardId: "waterlogged_doubt", upgraded: false }), false);
});

test("rest remove charges health only after a card is actually removed", () => {
  const cancelRun = newRun({ seed: "rest-remove-cancel", difficulty: 0 });
  cancelRun.player.hp = 40;
  cancelRun.map[0][0].type = "rest";
  cancelRun.availableNodeIds = [cancelRun.map[0][0].id];
  enterNode(cancelRun, cancelRun.availableNodeIds[0]);
  chooseRest(cancelRun, "remove");

  assert.equal(cancelRun.phase, "rest");
  assert.equal(cancelRun.player.hp, 40);
  assert.equal(cancelRun.selector.mode, "remove");
  assert.equal(cancelRun.selector.hpCost, 5);

  cancelDeckSelection(cancelRun);
  assert.equal(cancelRun.phase, "rest");
  assert.equal(cancelRun.player.hp, 40);
  assert.equal(cancelRun.selector, null);

  const confirmRun = newRun({ seed: "rest-remove-confirm", difficulty: 0 });
  confirmRun.player.hp = 40;
  confirmRun.map[0][0].type = "rest";
  confirmRun.availableNodeIds = [confirmRun.map[0][0].id];
  enterNode(confirmRun, confirmRun.availableNodeIds[0]);
  chooseRest(confirmRun, "remove");
  const removedUid = confirmRun.player.deck[0].uid;
  const beforeDeck = confirmRun.player.deck.length;

  resolveDeckSelection(confirmRun, removedUid);
  assert.equal(confirmRun.phase, "map");
  assert.equal(confirmRun.player.hp, 35);
  assert.equal(confirmRun.player.deck.length, beforeDeck - 1);
  assert.ok(confirmRun.log.some((entry) => entry.tone === "damage" && entry.text.includes("카드 제거 정비")));
});

test("non-combat lethal choices clear transient UI state before summary", () => {
  const eventRun = newRun({ seed: "event-lethal-cleanup", difficulty: 0 });
  eventRun.phase = "event";
  eventRun.event = { eventId: "deep_archive", chosen: null };
  eventRun.player.hp = 4;

  chooseEventOption(eventRun, 0);
  assert.equal(eventRun.phase, "summary");
  assert.equal(eventRun.reward, null);
  assert.equal(eventRun.event, null);
  assert.equal(eventRun.selector, null);
  assert.match(eventRun.summary.reason, /event/);

  const selectorRun = newRun({ seed: "selector-lethal-cleanup", difficulty: 0 });
  selectorRun.player.hp = 3;
  selectorRun.selector = { mode: "remove", context: "rest", hpCost: 5, after: "completeNode" };
  const removedUid = selectorRun.player.deck[0].uid;

  resolveDeckSelection(selectorRun, removedUid);
  assert.equal(selectorRun.phase, "summary");
  assert.equal(selectorRun.selector, null);
  assert.equal(selectorRun.reward, null);
  assert.equal(selectorRun.event, null);
});

test("enemy summon intents create active minions with readable next intents", () => {
  const run = newRun({ seed: "summon-flow", difficulty: 0 });
  enterNode(run, run.availableNodeIds[0]);
  run.player.hp = run.player.maxHp;
  run.player.block = 999;
  const summoner = run.combat.enemies[0];
  const beforeCount = run.combat.enemies.length;
  summoner.nextMove = {
    label: "검증 소환",
    intent: "소환",
    type: "summon",
    summon: [{ enemyId: "ledger_mite", count: 1, hpScale: 0.5 }]
  };
  endTurn(run);
  assert.equal(run.phase, "combat");
  assert.equal(run.combat.enemies.length, beforeCount + 1);
  const summoned = run.combat.enemies.at(-1);
  assert.equal(summoned.summoned, true);
  assert.ok(summoned.nextMove.intent.length > 0);
});

test("every enemy move executes safely through enemy turns", () => {
  const checkedMoves = [];
  for (const enemyTemplate of ENEMIES) {
    for (const move of enemyTemplate.moves) {
      const run = preparedEnemyMoveRun(enemyTemplate, move);
      const actorUid = run.combat.enemies[0].uid;
      const beforePlayerHp = run.player.hp;
      const beforeDamageTaken = run.stats.damageTaken;
      const beforeEnemyHp = run.combat.enemies[0].hp;
      const beforeEnemyCount = run.combat.enemies.length;

      assert.doesNotThrow(() => endTurn(run), `${enemyTemplate.id}.${move.id} should execute`);
      assert.equal(run.phase, "combat", `${enemyTemplate.id}.${move.id} should keep the high-health test combat active`);

      const actor = run.combat.enemies.find((enemy) => enemy.uid === actorUid);
      assert.ok(actor, `${enemyTemplate.id}.${move.id} should keep the acting enemy present`);
      if (move.damage) assert.ok(run.player.hp < beforePlayerHp, `${enemyTemplate.id}.${move.id} should deal player damage`);
      if (move.block) assert.ok(actor.block >= move.block, `${enemyTemplate.id}.${move.id} should grant enemy block`);
      if (move.heal) assert.ok(actor.hp > beforeEnemyHp, `${enemyTemplate.id}.${move.id} should heal the acting enemy`);
      if (move.summon) assert.ok(run.combat.enemies.length > beforeEnemyCount, `${enemyTemplate.id}.${move.id} should summon a minion`);

      for (const status of move.self ?? []) {
        assert.ok((actor.statuses[status.status] ?? 0) >= status.amount, `${enemyTemplate.id}.${move.id} should apply ${status.status} to itself`);
      }
      for (const status of move.applyToPlayer ?? []) {
        const expectedAfterTurn = ENEMY_MOVE_DECAYING_STATUSES.has(status.status) ? Math.max(0, status.amount - 1) : status.amount;
        if (expectedAfterTurn > 0) {
          assert.ok(
            (run.player.statuses[status.status] ?? 0) >= expectedAfterTurn,
            `${enemyTemplate.id}.${move.id} should leave readable ${status.status} on the player`
          );
        }
        if (status.status === "virus") {
          assert.ok(run.stats.damageTaken > beforeDamageTaken, `${enemyTemplate.id}.${move.id} virus should tick on the next player turn`);
        }
      }
      checkedMoves.push(`${enemyTemplate.id}.${move.id}`);
    }
  }

  assert.ok(checkedMoves.length >= 60, `expected broad enemy move coverage, got ${checkedMoves.length}`);
});

test("enemy death from turn-processing damage still resolves combat victory", () => {
  const run = newRun({ seed: "dot-victory", difficulty: 0 });
  enterNode(run, run.availableNodeIds[0]);
  const enemy = run.combat.enemies[0];
  run.combat.enemies = [enemy];
  enemy.hp = 2;
  enemy.block = 0;
  enemy.statuses = { virus: 3 };
  enemy.nextMove = { label: "검증 대기", intent: "대기", type: "defend", block: 0 };
  run.combat.hand = [];
  run.player.hp = run.player.maxHp;

  endTurn(run);
  assert.equal(run.phase, "reward");
  assert.ok(run.reward.cards.length >= 3);
});

test("turn-start and end-turn lethal status damage finish cleanly", () => {
  const virusRun = newRun({ seed: "lethal-virus-clean", difficulty: 0 });
  enterNode(virusRun, virusRun.availableNodeIds[0]);
  virusRun.player.hp = 1;
  virusRun.player.statuses.virus = 2;
  assert.doesNotThrow(() => endTurn(virusRun));
  assert.equal(virusRun.phase, "summary");
  assert.equal(virusRun.combat, null);

  const curseRun = newRun({ seed: "lethal-dead-letter-clean", difficulty: 0 });
  enterNode(curseRun, curseRun.availableNodeIds[0]);
  curseRun.player.hp = 1;
  curseRun.player.block = 999;
  curseRun.combat.hand = [{ uid: 7001, cardId: "dead_letter", upgraded: false, temporary: false, costMod: 0 }];
  curseRun.combat.enemies[0].nextMove = { label: "검증 대기", intent: "대기", type: "defend", block: 0 };
  assert.doesNotThrow(() => endTurn(curseRun));
  assert.equal(curseRun.phase, "summary");
  assert.equal(curseRun.combat, null);
});

test("event next-combat start effects apply once while run-wide effects persist", () => {
  const oneShotRun = newRun({ seed: "event-next-combat-flags", difficulty: 0 });
  const eventNode = oneShotRun.map[0][0];
  const firstFight = oneShotRun.map[1][0];
  const secondFight = oneShotRun.map[2][0];
  eventNode.type = "event";
  firstFight.type = "combat";
  secondFight.type = "combat";
  eventNode.connections = [firstFight.id];
  firstFight.connections = [secondFight.id];
  oneShotRun.currentNodeId = eventNode.id;
  oneShotRun.phase = "event";
  oneShotRun.event = { eventId: "forgotten_diver", chosen: null };

  chooseEventOption(oneShotRun, 1);

  assert.equal(oneShotRun.runFlags.startFrail, undefined);
  assert.equal(oneShotRun.nextCombatFlags.startFrail, 2);
  assert.equal(oneShotRun.phase, "map");
  enterNode(oneShotRun, firstFight.id);
  assert.equal(oneShotRun.player.statuses.frail, 2);
  assert.deepEqual(oneShotRun.nextCombatFlags, {});

  oneShotRun.phase = "map";
  oneShotRun.combat = null;
  oneShotRun.player.statuses = {};
  oneShotRun.availableNodeIds = [secondFight.id];
  enterNode(oneShotRun, secondFight.id);
  assert.equal(oneShotRun.player.statuses.frail, undefined);

  const persistentRun = newRun({ seed: "event-run-wide-flags", difficulty: 0 });
  const station = persistentRun.map[0][0];
  const persistentFight = persistentRun.map[1][0];
  station.type = "event";
  persistentFight.type = "combat";
  station.connections = [persistentFight.id];
  persistentRun.currentNodeId = station.id;
  persistentRun.phase = "event";
  persistentRun.event = { eventId: "final_waystation", chosen: null };

  chooseEventOption(persistentRun, 1);

  assert.equal(persistentRun.runFlags.startCharge, 2);
  assert.equal(persistentRun.nextCombatFlags.startCharge, undefined);
  enterNode(persistentRun, persistentFight.id);
  assert.equal(persistentRun.player.statuses.charge, 2);
  assert.equal(persistentRun.runFlags.startCharge, 2);
});

test("events do not repeat within a run until the event pool is exhausted", () => {
  const run = newRun({ seed: "event-variety", difficulty: 0 });
  run.player.maxHp = 999;
  run.player.hp = 999;
  run.player.gold = 999;
  const eventNode = run.map[0][0];
  eventNode.type = "event";

  const seen = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    eventNode.completed = false;
    run.availableNodeIds = [eventNode.id];
    enterNode(run, eventNode.id);
    assert.equal(run.phase, "event");
    seen.push(run.event.eventId);

    const eventDefinition = EVENT_BY_ID[run.event.eventId];
    const safeOptionIndex = eventDefinition.choices.findIndex(
      (choice) => !(choice.effects ?? []).some((effect) => effect.op === "eventCombat") && canChooseEventOption(run, choice.effects)
    );
    assert.ok(safeOptionIndex >= 0, `${eventDefinition.id} needs a directly resolving test option`);
    chooseEventOption(run, safeOptionIndex);
    if (run.phase === "reward") skipReward(run);
    chooseFirstRewardRelicIfNeeded(run);
    assert.equal(run.phase, "map");
  }

  assert.equal(new Set(seen).size, seen.length);
  assert.deepEqual(run.seenEventIds, seen);
});

test("event card rewards trigger reward-shaping relic feedback", () => {
  const run = newRun({ seed: "event-relic-feedback", difficulty: 0 });
  run.player.relics.push("map_of_silt");
  run.phase = "event";
  run.event = { eventId: "coral_contract", chosen: null };

  chooseEventOption(run, 1);

  assert.equal(run.phase, "reward");
  assert.equal(run.reward.cards.length, 4);
  assert.ok(run.log.some((entry) => entry.tone === "relic" && entry.text.includes("실트 지도")));
});

test("event curse penalties count as added cards in run summaries", () => {
  const run = newRun({ seed: "curse-1", difficulty: 0 });
  run.phase = "event";
  run.event = { eventId: "tidal_lottery", chosen: null };
  run.rngState = 0;
  const beforeDeck = run.player.deck.length;

  chooseEventOption(run, 1);

  assert.equal(run.player.deck.length, beforeDeck + 2);
  assert.equal(run.stats.cardsAdded, 2);
  assert.equal(run.player.deck.at(-1).cardId, "waterlogged_doubt");
});

test("assisted full-run smoke reaches the final summary without dead phases", () => {
  for (const seed of ["tour-a", "tour-b", "tour-c"]) {
    const run = newRun({ seed, difficulty: 0 });
    run.player.maxHp = 600;
    run.player.hp = 600;
    run.player.gold = 600;

    let steps = 0;
    while (run.phase !== "summary" && steps < 900) {
      steps += 1;
      if (run.selector) {
        resolveDeckSelection(run, selectableDeckCard(run).uid);
        continue;
      }
      if (run.phase === "map") {
        enterNode(run, preferredNode(run).id);
        continue;
      }
      if (run.phase === "combat") {
        assistedCombatStep(run);
        continue;
      }
      if (run.phase === "reward") {
        chooseRewardCard(run, run.reward.cards[0]);
        chooseFirstRewardRelicIfNeeded(run);
        continue;
      }
      if (run.phase === "event") {
        chooseEventOption(run, payableEventChoice(run));
        continue;
      }
      if (run.phase === "shop") {
        buyShopCard(run, 0);
        buyShopRelic(run, 0);
        leaveShop(run);
        continue;
      }
      if (run.phase === "rest") {
        chooseRest(run, "upgrade");
        continue;
      }
      assert.fail(`unhandled phase ${run.phase}`);
    }

    assert.equal(run.phase, "summary", `${seed} did not reach summary`);
    assert.equal(run.summary.won, true, `${seed} should defeat the final boss`);
    assert.ok(run.summary.floors >= 21, `${seed} should traverse all floors`);
    assert.ok(steps < 900, `${seed} used too many simulation steps`);
  }
});

test("run records preserve recent builds and defeated boss names", () => {
  const run = newRun({ seed: "record-flow", difficulty: 0 });
  run.phase = "summary";
  run.summary = {
    won: true,
    reason: "검증 승리",
    seed: "record-flow",
    difficultyId: 0,
    difficulty: "표층",
    challenge: "오늘의 계약: 원정세, 정전 아카이브",
    challengeType: "daily",
    challengeDate: "2026-05-16",
    challengeModifiers: ["expedition_tax", "static_archive"],
    challengeModifierNames: ["원정세", "정전 아카이브"],
    durationSeconds: 91,
    floors: 21,
    bossesDefeated: 2,
    killedBosses: ["목록화자", "마지막 문 성가대"],
    hp: 42,
    maxHp: 92,
    deckSize: 28,
    relics: 9,
    gold: 77,
    cardsAdded: 18,
    cardsRemoved: 3,
    damageDealt: 321,
    damageTaken: 44,
    build: ["charge", "virus"]
  };

  const records = recordRunSummary(defaultRecords(), run, 123456);
  assert.equal(records.runs, 1);
  assert.equal(records.wins, 1);
  assert.equal(records.bossesKilled, 2);
  assert.equal(records.bestDamage, 321);
  assert.equal(records.builds.charge, 1);
  assert.equal(records.bosses["마지막 문 성가대"], 1);
  assert.equal(records.difficulties["0"].runs, 1);
  assert.equal(records.difficulties["0"].wins, 1);
  assert.equal(records.difficulties["0"].bestFloor, 21);
  assert.equal(records.difficulties["0"].bossesKilled, 2);
  assert.equal(records.difficulties["0"].lastSeed, "record-flow");
  assert.equal(records.difficulties["0"].lastWon, true);
  assert.equal(records.dailyContracts.runs, 1);
  assert.equal(records.dailyContracts.wins, 1);
  assert.equal(records.dailyContracts.bestFloor, 21);
  assert.equal(records.dailyContracts.history[0].date, "2026-05-16");
  assert.equal(records.dailyContracts.history[0].difficulty, "표층");
  assert.deepEqual(records.dailyContracts.history[0].modifiers, ["원정세", "정전 아카이브"]);
  assert.equal(records.dailyContracts.history[0].seed, "record-flow");
  assert.equal(records.history.length, 1);
  assert.equal(records.history[0].challenge, "오늘의 계약: 원정세, 정전 아카이브");
  assert.equal(records.history[0].challengeType, "daily");
  assert.equal(records.history[0].challengeDate, "2026-05-16");
  assert.deepEqual(records.history[0].challengeModifierNames, ["원정세", "정전 아카이브"]);
  assert.equal(records.history[0].seed, "record-flow");
  assert.equal(records.history[0].difficultyId, 0);
  assert.equal(records.history[0].durationSeconds, 91);
  assert.equal(records.history[0].cardsAdded, 18);
  assert.equal(records.history[0].cardsRemoved, 3);
  assert.equal(records.history[0].damageTaken, 44);
  assert.equal(records.history[0].gold, 77);
  assert.equal(records.history[0].hp, 42);
  assert.equal(records.history[0].maxHp, 92);
  assert.deepEqual(records.history[0].killedBosses, ["목록화자", "마지막 문 성가대"]);

  const unchanged = recordRunSummary(records, run, 999999);
  assert.equal(unchanged.runs, 1);
  assert.equal(normalizeRecords({ runs: 3 }).history.length, 0);
  assert.equal(normalizeRecords({ runs: 3 }).dailyContracts.history.length, 0);
  assert.equal(normalizeRecords({ difficulties: { 2: { runs: 1, wins: 0, bestFloor: 8, lastSeed: "d2" } } }).difficulties["2"].lastSeed, "d2");
  assert.deepEqual(normalizeRecords({ dailyContracts: { history: [{ modifiers: null, build: null }] } }).dailyContracts.history[0].modifiers, []);
  assert.deepEqual(normalizeRecords({ history: [{ seed: "old", killedBosses: null, build: null }] }).history[0].build, []);
});

test("balance report highlights death causes, floor bands, and build performance", () => {
  const report = runBalanceSuite({ seeds: ["qa-a", "qa-b"], difficulties: [0, 2], maxSteps: 900 });
  assert.equal(report.totals.runs, 4);
  assert.ok(Array.isArray(report.lossReasons));
  assert.ok(report.floorBands.some((band) => band.id === "early" && band.label.includes("1-7")));
  assert.ok(report.floorBands.some((band) => band.id === "final"));
  assert.ok(report.buildTags.length > 0);
  assert.ok(report.buildTags.every((entry) => typeof entry.winRate === "number"));
  assert.ok(report.primaryBuilds.length > 0);
  assert.ok(report.primaryBuilds.every((entry) => entry.runs >= entry.wins));
  assert.ok(report.byDifficulty.every((entry) => Array.isArray(entry.lossReasons)));
  assert.ok(report.byDifficulty.every((entry) => entry.floorBands.some((band) => band.id === "early")));
  assert.ok(report.recommendations.length > 0);
  assert.ok(report.recommendations.every((item) => item.area && item.text));
});

function preferredNode(run) {
  const available = run.map.flat().filter((node) => run.availableNodeIds.includes(node.id));
  const priority = ["boss", "elite", "event", "shop", "rest", "combat"];
  return available.sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type))[0];
}

function preparedCardRun(seed, cardId, upgraded) {
  const run = newRun({ seed, difficulty: 0 });
  run.player.relics = [];
  enterNode(run, run.availableNodeIds[0]);
  run.player.maxHp = 240;
  run.player.hp = 220;
  run.player.gold = 120;
  run.player.statuses = { charge: 8, focus: 2, weak: 1, vulnerable: 1, frail: 1, virus: 2 };
  run.player.block = 18;
  run.combat.energy = 12;
  run.combat.maxEnergy = 12;
  run.combat.attacksPlayedThisTurn = 4;
  run.combat.hand = [
    { uid: 9001, cardId, upgraded, temporary: false, costMod: 0 },
    { uid: 9002, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 },
    { uid: 9003, cardId: "tide_ward", upgraded: false, temporary: false, costMod: 0 },
    { uid: 9004, cardId: "memory_sift", upgraded: false, temporary: false, costMod: 0 }
  ];
  run.combat.drawPile = [
    { uid: 9010, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 },
    { uid: 9011, cardId: "tide_ward", upgraded: false, temporary: false, costMod: 0 },
    { uid: 9012, cardId: "null_pin", upgraded: false, temporary: false, costMod: 0 },
    { uid: 9013, cardId: "cleanse_cache", upgraded: false, temporary: false, costMod: 0 }
  ];
  run.combat.discardPile = [
    { uid: 9020, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 },
    { uid: 9021, cardId: "tide_ward", upgraded: false, temporary: false, costMod: 0 }
  ];
  run.combat.exhaustPile = [
    { uid: 9030, cardId: "blue_ledger", upgraded: false, temporary: false, costMod: 0 }
  ];
  for (const enemy of run.combat.enemies) {
    enemy.maxHp = 9999;
    enemy.hp = 9999;
    enemy.block = 0;
    enemy.statuses = { virus: 4, vulnerable: 2, weak: 1, mark: 2 };
  }
  run.combat.selectedEnemyUid = run.combat.enemies[0].uid;
  return run;
}

function combatRunWithRelics(relics, options = {}) {
  const run = newRun({ seed: `relic-${relics.join("-")}-${options.hp ?? "full"}`, difficulty: 0 });
  run.player.relics = relics;
  if (options.hp) run.player.hp = options.hp;
  enterNode(run, run.availableNodeIds[0]);
  run.player.hp = Math.max(run.player.hp, 1);
  for (const enemy of run.combat.enemies) {
    enemy.maxHp = 9999;
    enemy.hp = 9999;
    enemy.block = 0;
    enemy.nextMove = { label: "검증 대기", intent: "방어 0", type: "defend", block: 0 };
  }
  run.combat.selectedEnemyUid = run.combat.enemies[0].uid;
  return run;
}

function preparedRelicCardRun(relics, hand) {
  const run = combatRunWithRelics(relics);
  run.player.statuses = {};
  run.player.block = 0;
  run.combat.energy = 12;
  run.combat.maxEnergy = 12;
  run.combat.cardsPlayedThisTurn = 0;
  run.combat.attacksPlayedThisTurn = 0;
  run.combat.skillsPlayedThisTurn = 0;
  run.combat.firstAttackPlayed = false;
  run.combat.firstExhaustTriggered = false;
  run.combat.hand = hand;
  run.combat.drawPile = [
    { uid: 9801, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 },
    { uid: 9802, cardId: "tide_ward", upgraded: false, temporary: false, costMod: 0 },
    { uid: 9803, cardId: "memory_sift", upgraded: false, temporary: false, costMod: 0 }
  ];
  run.combat.discardPile = [];
  run.combat.exhaustPile = [];
  for (const enemy of run.combat.enemies) {
    enemy.maxHp = 9999;
    enemy.hp = 9999;
    enemy.block = 0;
    enemy.statuses = {};
  }
  return run;
}

function forcedRewardRun(relics, combatType) {
  const run = combatRunWithRelics(relics);
  run.combat.type = combatType;
  run.combat.enemies.forEach((enemy) => {
    enemy.hp = 1;
    enemy.block = 0;
  });
  run.combat.hand = [{ uid: 9901, cardId: "rust_bloom", upgraded: true, temporary: false, costMod: 0 }];
  run.combat.energy = 3;
  playCard(run, 9901, run.combat.enemies[0].uid);
  assert.equal(run.phase, "reward");
  return run;
}

function chooseFirstRewardRelicIfNeeded(run) {
  if (run.phase === "reward" && run.reward?.relicChoices?.length) {
    chooseRewardRelic(run, run.reward.selectedRelicId ?? run.reward.relicChoices[0]);
  }
}

function relicWasTriggered(run, relicId) {
  return (run.relicTriggers ?? []).some((trigger) => trigger.relicId === relicId) || (run.combat?.relicTriggers ?? []).some((trigger) => trigger.relicId === relicId);
}

const ENEMY_MOVE_DECAYING_STATUSES = new Set(["vulnerable", "weak", "frail", "fragile", "virus"]);

function preparedEnemyMoveRun(enemyTemplate, move) {
  const run = newRun({ seed: `enemy-move-${enemyTemplate.id}-${move.id}`, difficulty: 0 });
  run.player.relics = [];
  enterNode(run, run.availableNodeIds[0]);
  run.player.maxHp = 1000;
  run.player.hp = 1000;
  run.player.block = 0;
  run.player.statuses = {};
  run.combat.energy = 0;
  run.combat.hand = [];
  run.combat.drawPile = [];
  run.combat.discardPile = [];
  run.combat.exhaustPile = [];
  run.combat.enemies = [
    {
      uid: 777701,
      templateId: enemyTemplate.id,
      name: enemyTemplate.name,
      maxHp: 1000,
      hp: move.heal ? 900 : 1000,
      block: 0,
      statuses: {},
      phase: move.phase ?? 1,
      moveCursor: 0,
      nextMove: move,
      summoned: false
    }
  ];
  run.combat.selectedEnemyUid = 777701;
  return run;
}

function assistedCombatStep(run) {
  run.player.hp = Math.max(run.player.hp, 250);
  for (const enemy of run.combat.enemies) {
    if (enemy.hp > 0 && enemy.hp > 18) enemy.hp = 18;
  }
  let playable = [...run.combat.hand].find((card) => cardCost(card, run.combat) <= run.combat.energy && cardCost(card, run.combat) < 90);
  if (!playable && run.combat.turn > 10) {
    run.combat.energy = Math.max(run.combat.energy, 1);
    run.combat.hand.push({ uid: run.nextUid++, cardId: "pulse_lance", upgraded: true, temporary: true, costMod: 0 });
    playable = run.combat.hand.at(-1);
  }
  if (playable) {
    const target = run.combat.enemies.find((enemy) => enemy.hp > 0);
    playCard(run, playable.uid, target?.uid);
  } else {
    endTurn(run);
  }
}

function payableEventChoice(run) {
  const eventDefinition = EVENT_BY_ID[run.event.eventId];
  const index = eventDefinition.choices.findIndex((choice) => canChooseEventOption(run, choice.effects));
  return Math.max(0, index);
}

function selectableDeckCard(run) {
  if (run.selector?.mode === "upgrade") return run.player.deck.find((card) => !card.upgraded) ?? run.player.deck[0];
  return run.player.deck.find((card) => card.cardId !== "pulse_lance") ?? run.player.deck[0];
}
