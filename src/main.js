import {
  GAME_DATA,
  abandonRun,
  buyShopCard,
  buyShopHeal,
  buyShopRelic,
  cancelDeckSelection,
  cardPlayPreview,
  cardCost,
  chooseEventOption,
  chooseRest,
  chooseRewardCard,
  chooseRewardRelic,
  contentCounts,
  effectiveCard,
  endTurn,
  enemyIdsForNode,
  eventChoiceBlockReason,
  enterNode,
  enemyIntentForecast,
  enemyIntentForecastAfterDefeat,
  hasUpgradeableCards,
  isUpgradeableCard,
  leaveShop,
  newRun,
  playCard,
  requestShopRemove,
  requestShopUpgrade,
  restHealAmount,
  resolveDeckSelection,
  selectEnemy,
  shopServicePrices,
  skipReward
} from "./engine/game.js";
import { defaultRecords, normalizeRecords, recordRunSummary } from "./engine/records.js";
import { deleteSavedRun, loadRunFromStorage, saveRunToStorage } from "./engine/save-slots.js";
import { loadSettingsFromStorage, saveSettingsToStorage } from "./engine/settings.js";
import { EVENT_BY_ID } from "./data/events.js";
import { KEYWORDS, STATUS_LABELS } from "./data/keywords.js";
import { RELIC_BY_ID } from "./data/relics.js";

const RECORDS_KEY = "abyssalArchive.records.v1";
const RELIC_SYNERGY_HINTS = [
  { id: "brass_compass", keywords: ["charge"], text: "황동 방향계가 첫 전하를 보태 줍니다." },
  { id: "pearl_turbine", keywords: ["charge"], text: "진주 터빈은 전하가 있는 턴마다 방어를 보태 줍니다." },
  { id: "red_ledger", keywords: ["virus"], text: "레드 로그가 바이러스 피해를 키웁니다." },
  { id: "quarantine_tag", keywords: ["virus"], text: "격리 표찰의 시작 바이러스와 맞물립니다." },
  { id: "abyssal_needle", keywords: ["damage", "virus"], text: "심연 바늘은 공격 카드에 바이러스를 더합니다." },
  { id: "cracked_anchor", keywords: ["mark", "damage"], text: "금 간 닻이 첫 공격의 표식 피해를 키웁니다." },
  { id: "counterweight", keywords: ["block", "counter", "plated"], text: "균형추가 방어를 크게 쌓은 턴에 반격을 더합니다." },
  { id: "coral_seal", keywords: ["block", "plated"], text: "산호 봉인이 초반 방어를 안정시킵니다." },
  { id: "mnemonic_shell", keywords: ["block"], text: "기억 소라가 방어를 크게 쌓기 쉽게 해 줍니다." },
  { id: "harmonic_spool", keywords: ["power"], text: "화음 물레가 동조 카드를 쓸 때 카드를 더 뽑게 해 줍니다." },
  { id: "recursive_key", keywords: ["exhaust"], text: "재귀 열쇠가 첫 소멸 때 카드와 에너지를 되돌려줍니다." },
  { id: "echo_chamber", keywords: ["damage", "charge", "virus", "mark"], text: "잔향실은 강한 한 장의 효과를 한 번 더 울립니다." },
  { id: "choir_bell", keywords: ["block", "temporary", "power"], text: "합창종은 기술 사용 빈도가 높을수록 강합니다." },
  { id: "pressure_vial", keywords: ["vulnerable", "damage"], text: "압력 유리병의 취약 시작과 공격 카드가 잘 맞습니다." }
];
const DECK_AXIS_DEFINITIONS = [
  {
    id: "charge",
    label: "전하 모아 한 번에 쓰기",
    shortLabel: "전하 피니시",
    keywords: ["charge", "focus"],
    effects: ["gainCharge", "gainFocus", "damageByCharge", "spendChargeDamage", "chargePerEnemy"],
    detail: "전하를 쌓아 두었다가 큰 공격이나 방어 카드에 한 번에 씁니다."
  },
  {
    id: "mark",
    label: "표식 남기고 연달아 공격",
    shortLabel: "표식 러시",
    keywords: ["mark", "damage"],
    effects: ["damage"],
    detail: "표식을 먼저 남기고 싼 공격을 이어서 피해를 키웁니다."
  },
  {
    id: "virus",
    label: "바이러스와 약화로 버티기",
    shortLabel: "바이러스 제어",
    keywords: ["virus", "weak", "vulnerable", "frail"],
    effects: ["apply"],
    detail: "바이러스 피해로 오래 깎고 약화·취약으로 위험한 턴을 낮춥니다."
  },
  {
    id: "ward",
    label: "막고 되받아치기",
    shortLabel: "가드 카운터",
    keywords: ["block", "counter", "plated"],
    effects: ["block", "blockPerHand"],
    detail: "공격을 막은 뒤 반격으로 적 턴에도 피해를 돌려줍니다."
  },
  {
    id: "cycle",
    label: "필요한 카드 다시 찾기",
    shortLabel: "카드 루프",
    keywords: ["exhaust", "temporary", "retain"],
    effects: ["draw", "generate", "discardRandom", "resetHand", "exhaustRandomHand", "discountRandomHand", "upgradeRandomHand"],
    detail: "뽑기, 보존, 생성으로 필요한 카드를 다시 잡습니다."
  },
  {
    id: "risk",
    label: "대가를 내고 더 행동하기",
    shortLabel: "오버드라이브",
    keywords: ["fragile"],
    effects: ["gainEnergy", "gainMaxEnergy", "loseHp", "loseMaxHp", "gainGold"],
    detail: "체력이나 최대 체력을 내고 더 많은 에너지·크레딧·행동을 얻습니다."
  }
];
const PLAYER_HARMFUL_STATUSES = ["virus", "vulnerable", "weak", "frail", "fragile", "mark"];
const COMBAT_PREVIEW_TONE_CLASSES = ["preview-damage", "preview-block", "preview-resource", "preview-status", "preview-warn", "preview-steady"];
const CORE_CONCEPT_GUIDE = [
  {
    axisId: "charge",
    pick: "전하를 얻는 카드와 전하를 쓰는 카드가 함께 보일 때",
    care: "전하만 모으면 힘이 남습니다. 전하를 쓰는 공격이나 방어도 같이 챙기세요."
  },
  {
    axisId: "mark",
    pick: "0비용 공격이나 여러 번 때리는 공격이 많을 때",
    care: "표식만 남기고 공격을 잇지 못하면 효과가 작습니다."
  },
  {
    axisId: "virus",
    pick: "보스전처럼 긴 전투를 안정적으로 깎고 싶을 때",
    care: "약한 적을 빨리 끝낼 직접 피해도 챙기세요."
  },
  {
    axisId: "ward",
    pick: "큰 공격을 막으면서 적 턴에도 피해를 주고 싶을 때",
    care: "방어만 많으면 전투가 길어지니 마무리 피해가 필요합니다."
  },
  {
    axisId: "cycle",
    pick: "필요한 카드를 빨리 다시 보고 싶을 때",
    care: "카드를 찾는 수단만 많아지면 실제 피해와 방어가 부족해집니다."
  },
  {
    axisId: "risk",
    pick: "추가 에너지로 바로 피해나 방어를 만들 수 있을 때",
    care: "체력을 쓴 뒤 회복하거나 전투를 끝낼 길을 확인하세요."
  }
];
const COMBAT_PILE_DEFINITIONS = [
  { id: "draw", label: "뽑기", property: "drawPile", hint: "오른쪽 위 카드부터 뽑습니다. 다음 턴에 쓸 에너지를 미리 가늠하세요." },
  { id: "hand", label: "손패", property: "hand", hint: "지금 사용할 수 있는 카드입니다. 비용과 대상 조건을 함께 확인하세요." },
  { id: "discard", label: "버림", property: "discardPile", hint: "뽑기 더미가 비면 이 더미를 섞어 새 뽑기 더미로 만듭니다." },
  { id: "exhaust", label: "소멸", property: "exhaustPile", hint: "이번 전투에서 사라진 카드입니다. 소멸 수를 참조하는 카드와 연결됩니다." }
];

const CARD_ART_TYPE_HUES = {
  attack: 8,
  skill: 188,
  power: 43,
  curse: 334,
  status: 214
};

const ENEMY_SPRITE_MOTIFS = {
  clerk: "paper",
  crab: "claw",
  wisp: "spirit",
  choir: "choir",
  eel: "serpent",
  leech: "leech",
  sentinel: "armored",
  ray: "ray",
  hound: "hound",
  page: "paper",
  drone: "machine",
  squid: "squid",
  mite: "claw",
  diver: "diver",
  jelly: "spirit",
  bailiff: "armored",
  engine: "engine",
  knight: "armored",
  cantor: "choir",
  colossus: "colossus",
  cataloger: "catalog",
  algorithm: "algorithm",
  lastgate: "gate"
};

const ENEMY_SPRITE_POSES = {
  clerk: { scale: 1.03, rotate: -2, shiftY: "1%" },
  crab: { scale: 1.08, rotate: -3, shiftY: "5%" },
  drone: { scale: 1.07, rotate: 2, shiftY: "4%" },
  eel: { scale: 1.05, rotate: -5, shiftX: "-2%", shiftY: "2%" },
  hound: { scale: 1.06, rotate: -2, shiftX: "2%", shiftY: "3%" },
  jelly: { scale: 1.05, shiftY: "2%" },
  leech: { scale: 1.07, rotate: 3, shiftY: "4%" },
  mite: { scale: 1.09, rotate: 2, shiftY: "5%" },
  page: { scale: 1.04, rotate: -4, shiftY: "2%" },
  ray: { scale: 1.08, rotate: -3, shiftY: "3%" },
  squid: { scale: 1.04, rotate: 3, shiftY: "2%" },
  wisp: { scale: 1.05, shiftY: "1%" },
  engine: { scale: 1.04, shiftY: "2%" },
  colossus: { scale: 1.04, shiftY: "1%" }
};

const SPRITE_ATLAS_COLUMNS = 8;
const SPRITE_ATLAS_ROWS = 4;
const SPRITE_ATLAS_CELLS = {
  player: [0, 0],
  orbSpirit: [1, 0],
  crab: [2, 0],
  tankDrone: [3, 0],
  squid: [4, 0],
  diverKnight: [5, 0],
  orbEngine: [6, 0],
  bookRelic: [7, 0],
  gateBoss: [0, 1],
  whaleBoss: [1, 1],
  redBoss: [2, 1],
  roundRelic: [3, 1],
  crystalRelic: [4, 1],
  shellRelic: [5, 1],
  tubeRelic: [6, 1],
  coralRelic: [7, 1],
  cardStrike: [0, 2],
  cardDiver: [1, 2],
  cardWard: [2, 2],
  cardCharge: [3, 2],
  cardPower: [4, 2],
  cardVirus: [5, 2],
  statusGuard: [6, 2],
  statusHeal: [7, 2],
  statusHourglass: [0, 3],
  statusDash: [1, 3],
  statusWarning: [2, 3],
  statusFlame: [3, 3],
  statusSkull: [4, 3],
  statusFragile: [5, 3],
  relicCompass: [6, 3],
  relicAnchor: [7, 3]
};

const CARD_ART_ATLAS_COLUMNS = 9;
const CARD_ART_ATLAS_ROWS = 8;
const CARD_ART_KEYS = [...new Set(GAME_DATA.cards.map((card) => card.art))];
const CARD_ILLUSTRATION_CELLS = Object.fromEntries(CARD_ART_KEYS.map((key, index) => [key, [index % CARD_ART_ATLAS_COLUMNS, Math.floor(index / CARD_ART_ATLAS_COLUMNS)]]));

const ARENA_BACKDROP_COLUMNS = 3;
const ARENA_BACKDROP_ROWS = 2;
const ARENA_SCENE_DEFINITIONS = {
  archive: { label: "침수 기록실", cell: [0, 0], hue: 205, fogX: 34, fogY: 38, sweep: 128, lightX: 48, lightY: 28 },
  pressure: { label: "압력 관측실", cell: [1, 0], hue: 190, fogX: 52, fogY: 34, sweep: 108, lightX: 52, lightY: 25 },
  coral: { label: "산호 전초지", cell: [2, 0], hue: 346, fogX: 42, fogY: 45, sweep: 64, lightX: 70, lightY: 36 },
  machine: { label: "잠긴 서버 구역", cell: [0, 1], hue: 44, fogX: 56, fogY: 40, sweep: 146, lightX: 50, lightY: 30 },
  abyss: { label: "심해 균열", cell: [1, 1], hue: 228, fogX: 50, fogY: 48, sweep: 118, lightX: 46, lightY: 34 },
  gate: { label: "마지막 문", cell: [2, 1], hue: 354, fogX: 54, fogY: 50, sweep: 92, lightX: 52, lightY: 26 }
};
const ARENA_VARIANT_SCENES = ["archive", "pressure", "coral", "machine", "abyss", "gate"];

const ENEMY_SPRITE_ATLAS = {
  clerk: "bookRelic",
  crab: "crab",
  wisp: "orbSpirit",
  choir: "gateBoss",
  eel: "squid",
  leech: "shellRelic",
  sentinel: "diverKnight",
  ray: "whaleBoss",
  hound: "orbEngine",
  page: "bookRelic",
  drone: "tankDrone",
  squid: "squid",
  mite: "crab",
  diver: "player",
  jelly: "orbSpirit",
  bailiff: "diverKnight",
  engine: "roundRelic",
  knight: "diverKnight",
  cantor: "gateBoss",
  colossus: "orbEngine",
  cataloger: "gateBoss",
  algorithm: "whaleBoss",
  lastgate: "redBoss"
};

const ENEMY_PORTRAIT_ATLAS_COLUMNS = 6;
const ENEMY_PORTRAIT_ATLAS_ROWS = 4;
const ENEMY_PORTRAIT_CELLS = {
  clerk: [0, 0],
  crab: [1, 0],
  wisp: [2, 0],
  choir: [3, 0],
  eel: [4, 0],
  leech: [5, 0],
  sentinel: [0, 1],
  ray: [1, 1],
  hound: [2, 1],
  page: [3, 1],
  drone: [4, 1],
  squid: [5, 1],
  mite: [0, 2],
  diver: [1, 2],
  jelly: [2, 2],
  bailiff: [3, 2],
  engine: [4, 2],
  knight: [5, 2],
  cantor: [0, 3],
  colossus: [1, 3],
  cataloger: [2, 3],
  algorithm: [3, 3],
  lastgate: [4, 3]
};

const ENEMY_MOTIF_ATLAS = {
  paper: "bookRelic",
  claw: "crab",
  spirit: "orbSpirit",
  choir: "gateBoss",
  serpent: "squid",
  leech: "shellRelic",
  armored: "diverKnight",
  ray: "whaleBoss",
  hound: "orbEngine",
  machine: "tankDrone",
  squid: "squid",
  diver: "player",
  engine: "roundRelic",
  colossus: "orbEngine",
  catalog: "bookRelic",
  algorithm: "whaleBoss",
  gate: "redBoss"
};

const CARD_ART_ATLAS_MOTIFS = {
  strike: ["lance", "rill_cut", "brass", "harpoon", "beam", "knife", "redaction_blade"],
  ward: ["ward", "seal", "bastion", "armor", "firewall", "coat", "mirror"],
  virus: ["virus", "static_psalm", "hex", "quarantine", "outbreak", "pressure_bloom"],
  charge: ["charge", "current", "gate", "circuit", "pearl", "cathedral", "lattice"],
  cycle: ["memory_sift", "drift_scan", "echo", "shard", "rite", "reset", "chrono"],
  power: ["index", "algorithm", "royal", "cathedral", "covenant", "oath", "leviathan"],
  curse: ["dead_letter", "waterlogged_doubt", "null", "dust"],
  tide: ["current", "dive", "breath", "signal", "coral", "reef", "leviathan"]
};

const CARD_ART_SIGIL_CELLS = {
  damage: "cardStrike",
  mark: "relicCompass",
  block: "cardWard",
  counter: "statusGuard",
  plated: "statusGuard",
  charge: "cardCharge",
  focus: "crystalRelic",
  virus: "cardVirus",
  weak: "statusFragile",
  vulnerable: "statusWarning",
  frail: "statusSkull",
  temporary: "statusDash",
  exhaust: "statusHourglass",
  retain: "relicAnchor",
  power: "cardPower"
};

const ENEMY_INTENT_SIGIL_CELLS = {
  attack: "cardStrike",
  defend: "cardWard",
  buff: "cardPower",
  debuff: "statusWarning",
  summon: "relicAnchor",
  none: "statusHourglass"
};

const CARD_ART_EXACT_ATLAS = {
  lance: "pulseLance",
  pin: "zeroPin",
  memory_sift: "memoryShift",
  rill_cut: "pulseLance",
  drift_scan: "tideCurrent",
  static_psalm: "virusBloom",
  ledger: "deadLetter",
  needle: "zeroPin",
  salvage: "anchorStrike",
  bolt: "chargeCrystal",
  mirror: "counterBarrier",
  net: "algorithmLattice",
  lantern: "oathFlare",
  glass: "pressureBloom",
  shard: "echoWave",
  box: "nullVoid",
  kick: "tideCurrent",
  rite: "chronoLoop",
  suture: "pearlFocus",
  bargain: "deadLetter",
  axiom: "algorithmLattice",
  cleanse: "cacheCleanse",
  cache: "cacheCleanse",
  ward: "shieldWard",
  seal: "shieldWard",
  bastion: "shieldWard",
  armor: "shieldWard",
  coat: "shieldWard",
  charge: "chargeCrystal",
  spark: "chargeCrystal",
  brass: "chargeCrystal",
  circuit: "chargeCrystal",
  pearl: "pearlFocus",
  virus: "virusBloom",
  outbreak: "virusBloom",
  hex: "virusBloom",
  quarantine: "quarantineSeal",
  anchor: "anchorStrike",
  harpoon: "harpoonBeam",
  beam: "harpoonBeam",
  knife: "harpoonBeam",
  redaction_blade: "harpoonBeam",
  algorithm: "algorithmLattice",
  lattice: "algorithmLattice",
  index: "algorithmLattice",
  rewrite: "algorithmLattice",
  dead_letter: "deadLetter",
  waterlogged_doubt: "deadLetter",
  current: "tideCurrent",
  dive: "tideCurrent",
  breath: "tideCurrent",
  echo: "echoWave",
  signal: "echoWave",
  sonar_choir: "echoWave",
  coral: "coralEngine",
  reef: "coralEngine",
  rust_bloom: "coralEngine",
  firewall: "firewallWall",
  pressure_bloom: "pressureBloom",
  chrono: "chronoLoop",
  reset: "chronoLoop",
  royal: "royalConduit",
  cathedral: "royalConduit",
  gate: "royalConduit",
  null: "nullVoid",
  dust: "nullVoid",
  tax: "nullVoid",
  footnote: "nullVoid",
  covenant: "oathFlare",
  oath: "oathFlare",
  sunrise: "oathFlare",
  leviathan: "leviathan"
};

const CARD_ART_ATLAS_FALLBACK = ["lance", "ward", "memory_sift", "pin", "charge", "virus"];

const app = document.querySelector("#app");
const cardTooltipLayer = document.createElement("div");
cardTooltipLayer.className = "card-portal-tooltip";
cardTooltipLayer.hidden = true;
document.body.append(cardTooltipLayer);
const statusTooltipLayer = document.createElement("div");
statusTooltipLayer.className = "status-portal-tooltip";
statusTooltipLayer.hidden = true;
document.body.append(statusTooltipLayer);
const intentTooltipLayer = document.createElement("div");
intentTooltipLayer.className = "intent-portal-tooltip";
intentTooltipLayer.hidden = true;
document.body.append(intentTooltipLayer);
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
let saveRecoveryNotice = null;
const initialRun = loadRun();
let pointerCardDrag = null;
let suppressPointerClick = false;
let cardTooltipSource = null;
let statusTooltipSource = null;
let intentTooltipSource = null;
let cardTooltipSuppressUntil = 0;
let combatPreviewSource = null;
let combatPreviewTargetUid = null;
let combatPreviewAssistSnapshot = null;
const CHOICE_PULSE_ACTIONS = new Set([
  "reward-card",
  "reward-relic",
  "skip-reward",
  "dismiss-act-interlude",
  "event-option",
  "shop-card",
  "shop-relic",
  "shop-heal",
  "shop-remove",
  "shop-upgrade",
  "rest",
  "deck-select"
]);
const REPEAT_GUARDED_ACTIONS = new Set([
  "dismiss-victory-coda",
  "dismiss-act-interlude",
  "enter-node",
  "play-card",
  "end-turn",
  "reward-card",
  "reward-relic",
  "skip-reward",
  "event-option",
  "shop-card",
  "shop-relic",
  "shop-heal",
  "shop-remove",
  "shop-upgrade",
  "leave-shop",
  "rest",
  "deck-select"
]);
const state = {
  screen: "title",
  returnScreen: null,
  run: initialRun,
  saveNotice: saveRecoveryNotice,
  selectedDifficulty: 0,
  customSeed: "",
  deckOpen: false,
  settings: loadSettings(),
  records: loadRecords(),
  pileOpen: null,
  relicOpen: false,
  pendingStart: null,
  pendingDeleteSave: null,
  pendingAbandonRun: null,
  audio: null,
  music: null,
  combatFx: null,
  combatFxTimer: null,
  combatTurnCue: null,
  combatTurnCueTimer: null,
  combatTurnActionTimer: null,
  combatTurnFollowupTimer: null,
  combatVictoryCoda: null,
  combatVictoryTimer: null,
  seenCombatVictoryCodaKeys: new Set(),
  dismissedCombatVictoryCodaKeys: new Set(),
  seenActInterludeKeys: new Set(),
  dismissedActInterludeKeys: new Set(),
  choicePulse: null,
  choicePulseTimer: null,
  rewardPreviewCardId: null,
  mapPreviewNodeId: null,
  phaseTransition: null,
  lastBossPhaseCue: null,
  lastActionStamp: null,
  lastRenderKey: null
};

applySettings();
render();

app.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  const index = Number(target.dataset.index ?? -1);
  if (event.isTrusted) ensureAudio();
  hideCardPortalTooltip();
  hideStatusPortalTooltip();
  hideIntentPortalTooltip();

  if (suppressPointerClick) {
    suppressPointerClick = false;
    event.preventDefault();
    return;
  }

  if (state.pendingStart && !["start-confirmed", "start-cancel", "continue-run"].includes(action)) {
    event.preventDefault();
    playTone("danger");
    return;
  }
  if (state.pendingDeleteSave && !["delete-save-confirmed", "delete-save-cancel"].includes(action)) {
    event.preventDefault();
    playTone("danger");
    return;
  }
  if (state.pendingAbandonRun && !["abandon-run-confirmed", "abandon-run-cancel"].includes(action)) {
    event.preventDefault();
    playTone("danger");
    return;
  }

  if (action === "screen") {
    openScreen(id);
    playTone("button");
    render();
    return;
  }
  if (action === "return-screen") {
    state.pendingStart = null;
    state.pendingDeleteSave = null;
    state.pendingAbandonRun = null;
    returnToPreviousScreen();
    playTone("button");
    render();
    return;
  }
  if (action === "new-run") {
    requestRunStart(selectedRunConfig(), sanitizeSeed(state.customSeed) ? "시드 런" : "새 런");
    return;
  }
  if (action === "daily-run") {
    requestRunStart(dailyRunConfig(), "오늘의 계약");
    return;
  }
  if (action === "replay-seed") {
    const seed = sanitizeSeed(id);
    if (!seed) {
      playTone("danger");
      return;
    }
    const replayDifficulty = Number(target.dataset.difficulty);
    state.selectedDifficulty = Number.isFinite(replayDifficulty) ? replayDifficulty : state.selectedDifficulty;
    requestRunStart({ seed, challenge: { type: "seed", name: "기록 재도전" } }, "시드 재도전");
    return;
  }
  if (action === "start-confirmed") {
    const pending = state.pendingStart;
    state.pendingStart = null;
    if (pending?.config) startRunFromTitle(pending.config);
    else render();
    return;
  }
  if (action === "start-cancel") {
    state.pendingStart = null;
    playTone("button");
    render();
    return;
  }
  if (action === "dismiss-save-notice") {
    state.saveNotice = null;
    playTone("button");
    render();
    return;
  }
  if (action === "delete-save-confirmed") {
    deleteSavedRunNow();
    return;
  }
  if (action === "delete-save-cancel") {
    state.pendingDeleteSave = null;
    playTone("button");
    render();
    return;
  }
  if (action === "abandon-run-confirmed") {
    abandonCurrentRunNow();
    return;
  }
  if (action === "abandon-run-cancel") {
    state.pendingAbandonRun = null;
    playTone("button");
    render();
    return;
  }
  if (action === "continue-run") {
    const saved = loadRun();
    if (saveRecoveryNotice) state.saveNotice = saveRecoveryNotice;
    if (saved) {
      state.pendingStart = null;
      state.pendingDeleteSave = null;
      state.pendingAbandonRun = null;
      state.run = saved;
      state.screen = "game";
      state.returnScreen = null;
      suppressCardPortalTooltip();
      playTone("button");
      render();
    }
    return;
  }
  if (action === "difficulty") {
    state.pendingStart = null;
    state.pendingDeleteSave = null;
    state.selectedDifficulty = Number(id);
    playTone("button");
    render();
    return;
  }
  if (action === "preview-sound") {
    ensureAudio();
    playTone(id || "attackCard");
    return;
  }
  if (action === "preview-music") {
    ensureAudio();
    syncMusic();
    playTone("button");
    return;
  }
  if (action === "delete-save") {
    requestDeleteSave();
    return;
  }
  if (action === "abandon-run") {
    requestAbandonRun();
    return;
  }
  if (action === "toggle-deck") {
    state.deckOpen = !state.deckOpen;
    state.pileOpen = null;
    state.relicOpen = false;
    playTone("button");
    render();
    return;
  }
  if (!state.run) return;

  const run = state.run;
  const choiceBefore = CHOICE_PULSE_ACTIONS.has(action) ? choicePulseSnapshot(run, action, id, index) : null;
  let deferredMutation = false;
  let deferredTone = null;
  if (action === "start-next-difficulty") {
    const nextDifficulty = GAME_DATA.difficulties.find((difficulty) => difficulty.id === Number(target.dataset.difficulty));
    if (!nextDifficulty) {
      playTone("danger");
      return;
    }
    state.selectedDifficulty = nextDifficulty.id;
    requestRunStart({ seed: `abyss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, challenge: null }, `${nextDifficulty.name} 도전`);
    return;
  }
  if (action === "open-relics") {
    state.relicOpen = true;
    state.deckOpen = false;
    state.pileOpen = null;
    playTone("button");
    render();
    return;
  }
  if (action === "close-relics") {
    state.relicOpen = false;
    playTone("button");
    render();
    return;
  }
  if (action === "open-pile") {
    if (run.phase === "combat") {
      state.pileOpen = COMBAT_PILE_DEFINITIONS.some((pileDef) => pileDef.id === id) ? id : "draw";
      state.deckOpen = false;
      state.relicOpen = false;
      playTone("button");
      render();
    }
    return;
  }
  if (action === "close-pile") {
    state.pileOpen = null;
    playTone("button");
    render();
    return;
  }
  if (action === "dismiss-victory-coda") {
    if (shouldIgnoreRepeatedAction(action, id, index, run)) return;
    if (dismissCombatVictoryCoda(run)) {
      playTone("reward");
      render();
    }
    return;
  }
  if (action === "dismiss-act-interlude") {
    if (shouldIgnoreRepeatedAction(action, id, index, run)) return;
    if (dismissActInterlude(id)) {
      if (state.run) saveRun(state.run);
      playTone("button");
      render();
    }
    return;
  }
  if (!actionAllowedForPhase(action, run)) {
    event.preventDefault();
    return;
  }
  if (combatTurnInputLocked() && ["select-enemy", "cycle-enemy", "play-card", "end-turn"].includes(action)) {
    event.preventDefault();
    playTone("danger");
    return;
  }
  if (action === "play-card" && target.getAttribute("aria-disabled") === "true") {
    event.preventDefault();
    playTone("danger");
    showCombatCardPreview(target, null, "hover");
    return;
  }
  if (shouldIgnoreRepeatedAction(action, id, index, run)) return;
  if (action === "enter-node") {
    clearCombatFx();
    clearChoicePulse();
    clearMapRoutePreview();
    suppressCardPortalTooltip();
    enterNode(run, id);
  }
  if (action === "select-enemy") {
    clearCombatFx();
    selectEnemy(run, Number(id));
  }
  if (action === "cycle-enemy") {
    clearCombatFx();
    cycleCombatTarget(run, Number(id) || 1);
  }
  if (action === "play-card") playCardWithFx(run, Number(id));
  if (action === "end-turn") {
    deferredTone = soundCueForEndTurn(run);
    deferredMutation = endTurnWithFx(run);
  }
  if (action === "reward-card") {
    state.rewardPreviewCardId = null;
    chooseRewardCard(run, id);
  }
  if (action === "reward-relic") {
    state.rewardPreviewCardId = null;
    chooseRewardRelic(run, id);
  }
  if (action === "skip-reward") {
    state.rewardPreviewCardId = null;
    skipReward(run);
  }
  if (action === "event-option") chooseEventOption(run, index);
  if (action === "shop-card") buyShopCard(run, index);
  if (action === "shop-relic") buyShopRelic(run, index);
  if (action === "shop-heal") buyShopHeal(run);
  if (action === "shop-remove") requestShopRemove(run);
  if (action === "shop-upgrade") requestShopUpgrade(run);
  if (action === "leave-shop") leaveShop(run);
  if (action === "rest") chooseRest(run, id);
  if (action === "deck-select") resolveDeckSelection(run, Number(id));
  if (action === "deck-cancel") cancelDeckSelection(run);
  if (action === "back-title") {
    state.screen = "title";
    state.returnScreen = null;
    state.deckOpen = false;
    state.pileOpen = null;
    state.relicOpen = false;
    state.pendingDeleteSave = null;
    state.pendingAbandonRun = null;
  }
  stageChoicePulse(action, choiceBefore, run);
  if (deferredMutation) {
    playTone(deferredTone ?? "button");
    render();
    return;
  }
  afterMutation(action);
});

app.addEventListener("input", (event) => {
  const seedInput = event.target.closest("[data-seed-input]");
  if (seedInput) {
    state.customSeed = sanitizeSeed(seedInput.value);
    seedInput.value = state.customSeed;
    return;
  }
  const input = event.target.closest("[data-setting]");
  if (!input) return;
  const key = input.dataset.setting;
  if (input.type === "checkbox") state.settings[key] = input.checked;
  else state.settings[key] = Number(input.value);
  const settingsStored = saveSettings();
  applySettings();
  if (key === "volume" || key === "musicVolume") ensureAudio();
  syncMusic();
  updateSettingReadouts();
  if (!settingsStored || state.screen === "settings") refreshSettingsSaveNotice();
});

app.addEventListener("pointerover", (event) => {
  if (event.pointerType === "touch" || pointerCardDrag) return;
  const routeCard = event.target.closest(".route-card[data-action='enter-node']");
  if (routeCard && app.contains(routeCard)) previewMapRouteFromElement(routeCard);
  const statusChip = event.target.closest(".status-chip");
  if (statusChip && app.contains(statusChip)) showStatusPortalTooltip(statusChip);
  const intent = event.target.closest(".intent");
  if (intent && app.contains(intent)) showIntentPortalTooltip(intent);
  const card = event.target.closest(".game-card");
  if (card && app.contains(card) && !card.closest(".reward-option")) showCardPortalTooltip(card);
  const rewardCard = event.target.closest(".reward-option .game-card[data-action='reward-card']");
  if (rewardCard && app.contains(rewardCard)) previewRewardCardFromElement(rewardCard);
});

app.addEventListener("pointerout", (event) => {
  const routeCard = event.target.closest(".route-card[data-action='enter-node']");
  if (routeCard && !routeCard.contains(event.relatedTarget)) clearMapRoutePreview();
  const statusChip = event.target.closest(".status-chip");
  if (statusChip && !statusChip.contains(event.relatedTarget)) hideStatusPortalTooltip(statusChip);
  const intent = event.target.closest(".intent");
  if (intent && !intent.contains(event.relatedTarget)) hideIntentPortalTooltip(intent);
  const rewardOption = event.target.closest(".reward-option");
  if (rewardOption && !rewardOption.contains(event.relatedTarget)) clearRewardCardPreview();
  const card = event.target.closest(".game-card");
  if (!card || card.contains(event.relatedTarget)) return;
  hideCardPortalTooltip(card);
});

app.addEventListener("mouseover", (event) => {
  if (pointerCardDrag) return;
  const rewardCard = event.target.closest(".reward-option .game-card[data-action='reward-card']");
  if (rewardCard && app.contains(rewardCard)) previewRewardCardFromElement(rewardCard);
  const intent = event.target.closest(".intent");
  if (intent && app.contains(intent)) showIntentPortalTooltip(intent);
  const card = event.target.closest(".game-card");
  if (card && app.contains(card) && !card.closest(".reward-option")) showCardPortalTooltip(card);
});

app.addEventListener("mouseout", (event) => {
  const rewardOption = event.target.closest(".reward-option");
  if (rewardOption && !rewardOption.contains(event.relatedTarget)) clearRewardCardPreview();
  const intent = event.target.closest(".intent");
  if (intent && !intent.contains(event.relatedTarget)) hideIntentPortalTooltip(intent);
  const card = event.target.closest(".game-card");
  if (!card || card.contains(event.relatedTarget)) return;
  hideCardPortalTooltip(card);
});

app.addEventListener("focusin", (event) => {
  const routeCard = event.target.closest(".route-card[data-action='enter-node']");
  if (routeCard && app.contains(routeCard)) previewMapRouteFromElement(routeCard);
  const statusChip = event.target.closest(".status-chip");
  if (statusChip && app.contains(statusChip)) showStatusPortalTooltip(statusChip);
  const enemy = event.target.closest(".enemy-card");
  if (enemy && app.contains(enemy)) showIntentPortalTooltip(enemy.querySelector(".intent"));
  const card = event.target.closest(".game-card");
  if (card && app.contains(card) && !card.closest(".reward-option")) showCardPortalTooltip(card);
  const rewardCard = event.target.closest(".reward-option .game-card[data-action='reward-card']");
  if (rewardCard && app.contains(rewardCard)) previewRewardCardFromElement(rewardCard);
});

app.addEventListener("focusout", (event) => {
  const routeCard = event.target.closest(".route-card[data-action='enter-node']");
  if (routeCard && !routeCard.contains(event.relatedTarget)) clearMapRoutePreview();
  const statusChip = event.target.closest(".status-chip");
  if (statusChip && !statusChip.contains(event.relatedTarget)) hideStatusPortalTooltip(statusChip);
  const enemy = event.target.closest(".enemy-card");
  if (enemy && !enemy.contains(event.relatedTarget)) hideIntentPortalTooltip(enemy.querySelector(".intent"));
  const rewardOption = event.target.closest(".reward-option");
  if (rewardOption && !rewardOption.contains(event.relatedTarget)) clearRewardCardPreview();
  const card = event.target.closest(".game-card");
  if (!card || card.contains(event.relatedTarget)) return;
  hideCardPortalTooltip(card);
});

app.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-action='play-card']");
  if (!card || card.disabled) return;
  hideCardPortalTooltip();
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", card.dataset.id);
  card.classList.add("dragging");
  document.body.classList.add("dragging-card");
  showCombatCardPreview(card, null, "drag");
});

app.addEventListener("dragend", (event) => {
  event.target.closest(".game-card")?.classList.remove("dragging");
  document.body.classList.remove("dragging-card");
  clearCombatCardPreview();
});

app.addEventListener("dragover", (event) => {
  if (!document.body.classList.contains("dragging-card")) return;
  const draggedCard = app.querySelector(".game-card.dragging[data-action='play-card']");
  const enemy = event.target.closest(".enemy-card");
  if (!enemy) {
    if (draggedCard) showCombatCardPreview(draggedCard, null, "drag");
    return;
  }
  event.preventDefault();
  enemy.classList.add("drop-ready");
  if (draggedCard) showCombatCardPreview(draggedCard, Number(enemy.dataset.id), "drag");
});

app.addEventListener("dragleave", (event) => {
  event.target.closest(".enemy-card")?.classList.remove("drop-ready");
});

app.addEventListener("drop", (event) => {
  const enemy = event.target.closest(".enemy-card");
  const uid = Number(event.dataTransfer.getData("text/plain"));
  document.body.classList.remove("dragging-card");
  app.querySelectorAll(".drop-ready, .dragging").forEach((element) => element.classList.remove("drop-ready", "dragging"));
  clearCombatCardPreview();
  if (!enemy || !state.run || !uid) return;
  event.preventDefault();
  selectEnemy(state.run, Number(enemy.dataset.id));
  playCardWithFx(state.run, uid, Number(enemy.dataset.id));
  afterMutation("play-card");
});

app.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" || event.button > 0) return;
  const card = event.target.closest("[data-action='play-card']");
  if (!card || card.disabled || card.getAttribute("aria-disabled") === "true" || state.screen !== "game" || state.run?.phase !== "combat") return;
  hideCardPortalTooltip();
  pointerCardDrag = {
    pointerId: event.pointerId,
    uid: Number(card.dataset.id),
    card,
    startX: event.clientX,
    startY: event.clientY,
    active: false
  };
});

app.addEventListener("pointermove", (event) => {
  syncCardHoverFromPointer(event);
  if (!pointerCardDrag || pointerCardDrag.pointerId !== event.pointerId) return;
  const dx = event.clientX - pointerCardDrag.startX;
  const dy = event.clientY - pointerCardDrag.startY;
  const distance = Math.hypot(dx, dy);
  if (!pointerCardDrag.active && distance < 10) return;
  if (!pointerCardDrag.active) {
    if (event.pointerType === "touch" && Math.abs(dx) > Math.abs(dy) * 1.15) {
      clearPointerCardDrag();
      return;
    }
    pointerCardDrag.active = true;
    pointerCardDrag.card.classList.add("dragging");
    document.body.classList.add("dragging-card");
    pointerCardDrag.card.setPointerCapture?.(event.pointerId);
  }
  event.preventDefault();
  highlightPointerDropTarget(event.clientX, event.clientY);
});

app.addEventListener("mousemove", (event) => {
  syncCardHoverFromPointer(event);
});

app.addEventListener("pointerup", (event) => {
  if (!pointerCardDrag || pointerCardDrag.pointerId !== event.pointerId) return;
  const drag = pointerCardDrag;
  const enemy = drag.active ? enemyCardAtPoint(event.clientX, event.clientY) : null;
  clearPointerCardDrag();
  if (!drag.active) return;
  suppressPointerClick = true;
  event.preventDefault();
  if (!enemy || !state.run || !drag.uid) {
    playTone("button");
    return;
  }
  if (shouldIgnoreRepeatedAction("play-card", drag.uid, Number(enemy.dataset.id), state.run)) return;
  selectEnemy(state.run, Number(enemy.dataset.id));
  playCardWithFx(state.run, drag.uid, Number(enemy.dataset.id));
  afterMutation("play-card");
});

app.addEventListener("pointercancel", () => {
  clearPointerCardDrag();
});

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || isEditingText(event.target)) return;
  const managedDialog = activeManagedDialog();
  if (managedDialog && event.key === "Tab") {
    trapDialogFocus(event, managedDialog);
    return;
  }
  if (event.key === "Escape") {
    if (closePendingConfirmation()) {
      event.preventDefault();
      playTone("button");
      render();
      return;
    }
    if (state.run?.selector) {
      event.preventDefault();
      cancelDeckSelection(state.run);
      afterMutation("deck-cancel");
      return;
    }
    if (state.deckOpen) {
      event.preventDefault();
      state.deckOpen = false;
      playTone("button");
      render();
      return;
    }
    if (state.pileOpen) {
      event.preventDefault();
      state.pileOpen = null;
      playTone("button");
      render();
      return;
    }
    if (state.relicOpen) {
      event.preventDefault();
      state.relicOpen = false;
      playTone("button");
      render();
      return;
    }
    if (state.screen !== "game" && state.screen !== "title") {
      event.preventDefault();
      returnToPreviousScreen();
      playTone("button");
      render();
    }
    return;
  }
  const key = event.key?.toLowerCase();
  if ((key === "d" || event.code === "KeyD") && state.screen === "game" && state.run && !state.run.selector && !state.pileOpen) {
    event.preventDefault();
    state.deckOpen = !state.deckOpen;
    playTone("button");
    render();
    return;
  }
  if (handleCombatHotkey(event)) {
    event.preventDefault();
  }
});

window.addEventListener("resize", () => {
  positionCardPortalTooltip();
  positionStatusPortalTooltip();
  positionIntentPortalTooltip();
});
window.addEventListener("resize", () => positionCombatAimLine());
window.addEventListener("scroll", () => {
  positionCardPortalTooltip();
  positionStatusPortalTooltip();
  positionIntentPortalTooltip();
}, true);
window.addEventListener("scroll", () => positionCombatAimLine(), true);

function handleCombatHotkey(event) {
  const run = state.run;
  if (state.screen !== "game" || !run || run.phase !== "combat" || state.deckOpen || state.pileOpen || run.selector) return false;
  if (combatTurnInputLocked()) return true;
  const key = event.key?.toLowerCase();
  const cardIndex = combatCardHotkeyIndex(event);
  if (cardIndex >= 0) {
    const card = run.combat.hand[cardIndex];
    if (card) {
      if (event.repeat || shouldIgnoreRepeatedAction("play-card", card.uid, cardIndex, run)) return true;
      const preview = cardPlayPreview(run, card);
      if (!preview.playable) {
        playTone("danger");
        return true;
      }
      playCardWithFx(run, card.uid);
      afterMutation("play-card");
    } else {
      playTone("danger");
    }
    return true;
  }
  if (key === "e" || event.code === "Space") {
    if (event.repeat || shouldIgnoreRepeatedAction("end-turn", "", -1, run)) return true;
    const endTurnTone = soundCueForEndTurn(run);
    if (endTurnWithFx(run)) {
      playTone(endTurnTone);
      render();
    } else {
      afterMutation("end-turn");
    }
    return true;
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    clearCombatFx();
    cycleCombatTarget(run, event.key === "ArrowRight" ? 1 : -1);
    afterMutation("select-enemy");
    return true;
  }
  return false;
}

function combatCardHotkeyIndex(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return -1;
  if (/^Digit[0-9]$/.test(event.code)) return event.code === "Digit0" ? 9 : Number(event.code.slice(5)) - 1;
  if (/^Numpad[0-9]$/.test(event.code)) return event.code === "Numpad0" ? 9 : Number(event.code.slice(6)) - 1;
  return -1;
}

function playCardWithFx(run, uid, targetUid = null) {
  if (!run?.combat || run.phase !== "combat") return run;
  const cardInstance = run.combat.hand.find((card) => card.uid === uid);
  const preview = cardPlayPreview(run, cardInstance, targetUid);
  if (!preview.playable) return playCard(run, uid, targetUid);
  clearCombatTurnCue();
  cardTooltipSuppressUntil = Date.now() + combatFxDuration() + 900;
  hideCardPortalTooltip();
  hideIntentPortalTooltip();
  clearCombatCardPreview();
  const victorySnapshot = combatVictorySnapshot(run, uid, targetUid);
  const before = combatFxSnapshot(run);
  stageCombatFx(run, uid, targetUid);
  const result = playCard(run, uid, targetUid);
  finishCombatCardFx(result, before);
  stageCombatVictoryCoda(result, victorySnapshot);
  return result;
}

function combatVictorySnapshot(run, uid, targetUid = null) {
  if (!run?.combat || run.phase !== "combat") return null;
  const combat = run.combat;
  const cardInstance = combat.hand.find((card) => card.uid === uid);
  if (!cardInstance) return null;
  const card = effectiveCard(cardInstance);
  const aliveEnemies = combat.enemies.filter((enemy) => enemy.hp > 0);
  const target = aliveEnemies.find((enemy) => enemy.uid === (targetUid ?? combat.selectedEnemyUid)) ?? aliveEnemies[0] ?? null;
  return {
    seed: run.seed,
    nodeId: run.currentNodeId ?? null,
    row: run.currentRow ?? null,
    cardName: `${card.name}${cardInstance.upgraded ? "+" : ""}`,
    targetName: target?.name ?? "적",
    sourceType: combat.type,
    arena: combatVictoryArenaSnapshot(run),
    selectedEnemyUid: target?.uid ?? combat.selectedEnemyUid ?? null,
    enemies: aliveEnemies.map((enemy) => ({
      uid: enemy.uid,
      name: enemy.name,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      block: enemy.block,
      statuses: { ...(enemy.statuses ?? {}) },
      templateId: enemy.templateId,
      nextMove: enemy.nextMove ? { ...enemy.nextMove } : null,
      phase: enemy.phase ?? 1,
      summoned: Boolean(enemy.summoned)
    }))
  };
}

function combatVictoryArenaSnapshot(run) {
  const boss = activeCombatBoss(run);
  const scene = combatArenaScene(run, boss);
  return {
    key: scene.key,
    label: scene.label,
    boardStyle: scene.boardStyle,
    backgroundStyle: scene.backgroundStyle,
    classes: combatVictoryArenaClasses(run, boss)
  };
}

function combatVictoryArenaClasses(run, boss) {
  const act = Math.max(1, Math.min(3, Math.floor(Number(run.currentRow ?? 0) / 7) + 1));
  const classes = [`arena-act-${act}`, `arena-${run.combat?.type ?? "combat"}`, ...combatArenaVariantClasses(run)];
  if (boss) {
    classes.push("boss-fight", `boss-${boss.template.sprite}`);
    if ((boss.enemy.phase ?? 1) >= 2) classes.push("boss-phase-two");
  }
  return classes.join(" ");
}

function stageCombatVictoryCoda(run, before) {
  if (!before || run?.phase !== "reward" || !run.reward) return;
  const defeatedNames = before.enemies.map((enemy) => enemy.name);
  const relicChoices = rewardRelicChoices(run.reward);
  const key = combatVictoryCodaKey(before, run.reward, relicChoices);
  if (state.combatVictoryCoda?.key === key && activeCombatVictoryCoda(run)) return;
  if (state.seenCombatVictoryCodaKeys.has(key)) return;
  if (state.dismissedCombatVictoryCodaKeys.has(key)) return;
  const sourceType = run.reward.sourceType ?? before.sourceType ?? "combat";
  const mode = sourceType === "combat" ? "quick" : "full";
  const duration = combatVictoryCodaDuration(sourceType);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  clearCombatFx();
  clearChoicePulse();
  clearCombatVictoryCoda();
  rememberCombatVictoryCodaKey(key);
  state.combatVictoryCoda = {
    id,
    key,
    cardName: before.cardName,
    targetName: before.targetName,
    arena: before.arena,
    defeatedNames,
    enemies: before.enemies,
    rewardGold: run.reward.gold ?? 0,
    rewardCards: run.reward.cards?.length ?? 0,
    rewardRelics: relicChoices.length,
    sourceType,
    mode,
    until: Date.now() + duration
  };
  state.combatVictoryTimer = window.setTimeout(() => {
    if (state.combatVictoryCoda?.id === id) {
      state.combatVictoryCoda = null;
      state.combatVictoryTimer = null;
      render();
    }
  }, duration);
}

function combatVictoryCodaKey(before, reward, relicChoices = []) {
  return [
    before.seed,
    before.nodeId,
    before.row,
    before.cardName,
    before.sourceType,
    before.enemies.map((enemy) => enemy.uid).sort((a, b) => a - b).join(","),
    reward?.gold ?? 0,
    reward?.cards?.join(",") ?? "",
    relicChoices.join(",")
  ].join("|");
}

function rememberCombatVictoryCodaKey(key) {
  if (!key) return;
  state.seenCombatVictoryCodaKeys.add(key);
  if (state.seenCombatVictoryCodaKeys.size <= 24) return;
  const oldest = state.seenCombatVictoryCodaKeys.values().next().value;
  state.seenCombatVictoryCodaKeys.delete(oldest);
}

function rememberDismissedCombatVictoryCodaKey(key) {
  if (!key) return;
  state.dismissedCombatVictoryCodaKeys.add(key);
  if (state.dismissedCombatVictoryCodaKeys.size <= 24) return;
  const oldest = state.dismissedCombatVictoryCodaKeys.values().next().value;
  state.dismissedCombatVictoryCodaKeys.delete(oldest);
}

function dismissCombatVictoryCoda(run = state.run) {
  const coda = activeCombatVictoryCoda(run);
  if (!coda) return false;
  rememberCombatVictoryCodaKey(coda.key);
  rememberDismissedCombatVictoryCodaKey(coda.key);
  clearCombatVictoryCoda();
  return true;
}

function clearCombatVictoryCoda() {
  if (state.combatVictoryTimer) {
    window.clearTimeout(state.combatVictoryTimer);
    state.combatVictoryTimer = null;
  }
  state.combatVictoryCoda = null;
}

function combatVictoryCodaDuration(sourceType = "combat") {
  return (sourceType === "combat" ? 2800 : 4200) / motionScale();
}

function activeCombatVictoryCoda(run = state.run) {
  if (!state.combatVictoryCoda || run?.phase !== "reward") return null;
  return Date.now() <= state.combatVictoryCoda.until ? state.combatVictoryCoda : null;
}

function combatFxDuration() {
  return 3000 / motionScale();
}

function combatTurnCueDuration(kind = "enemy") {
  return (kind === "enemy" ? 1900 : 2100) / motionScale();
}

function combatTurnActionDelay() {
  return 980 / motionScale();
}

function combatTurnFollowupDelay() {
  return combatFxDuration() + 180 / motionScale();
}

function setCombatFx(fx) {
  if (state.combatFxTimer) {
    window.clearTimeout(state.combatFxTimer);
    state.combatFxTimer = null;
  }
  state.combatFx = fx;
  if (!fx) return;
  const id = fx.id;
  state.combatFxTimer = window.setTimeout(() => {
    if (state.combatFx?.id === id) {
      const finishedFx = state.combatFx;
      state.combatFx = null;
      state.combatFxTimer = null;
      if (finishedFx.kind === "enemy-action" && state.combatTurnFollowupTimer) {
        window.clearTimeout(state.combatTurnFollowupTimer);
        state.combatTurnFollowupTimer = null;
      }
      if (finishedFx.kind === "enemy-action" && state.screen === "game" && state.run?.phase === "combat" && !activeCombatTurnCue(state.run)) {
        stagePlayerTurnCue(state.run);
      }
      render();
    }
  }, combatFxDuration());
}

function clearCombatFx() {
  if (state.combatFxTimer) {
    window.clearTimeout(state.combatFxTimer);
    state.combatFxTimer = null;
  }
  state.combatFx = null;
  clearCombatTurnCue();
}

function setCombatTurnCue(cue) {
  if (state.combatTurnCueTimer) {
    window.clearTimeout(state.combatTurnCueTimer);
    state.combatTurnCueTimer = null;
  }
  state.combatTurnCue = cue ? { ...cue, until: Date.now() + combatTurnCueDuration(cue.kind) } : null;
  if (!state.combatTurnCue) return;
  const id = state.combatTurnCue.id;
  state.combatTurnCueTimer = window.setTimeout(() => {
    if (state.combatTurnCue?.id === id) {
      state.combatTurnCue = null;
      state.combatTurnCueTimer = null;
      render();
    }
  }, combatTurnCueDuration(cue.kind));
}

function clearCombatTurnCue() {
  if (state.combatTurnCueTimer) {
    window.clearTimeout(state.combatTurnCueTimer);
    state.combatTurnCueTimer = null;
  }
  if (state.combatTurnActionTimer) {
    window.clearTimeout(state.combatTurnActionTimer);
    state.combatTurnActionTimer = null;
  }
  if (state.combatTurnFollowupTimer) {
    window.clearTimeout(state.combatTurnFollowupTimer);
    state.combatTurnFollowupTimer = null;
  }
  state.combatTurnCue = null;
}

function activeCombatTurnCue(run = state.run) {
  if (!state.combatTurnCue || run?.phase !== "combat") return null;
  return Date.now() <= state.combatTurnCue.until ? state.combatTurnCue : null;
}

function combatTurnInputLocked(run = state.run) {
  return Boolean(activeCombatTurnCue(run)) || Boolean(state.combatTurnActionTimer) || state.combatFx?.kind === "enemy-action";
}

function combatTurnLockReason(run = state.run) {
  const cue = activeCombatTurnCue(run);
  if (cue?.kind === "enemy") {
    return {
      kind: "enemy",
      label: "상대 턴",
      key: "…",
      small: "처리 중",
      ariaLabel: "상대 턴 진행 중",
      title: "상대 행동을 처리하는 중입니다.",
      disabledReason: "상대 턴에는 사용할 수 없음"
    };
  }
  if (cue?.kind === "player") {
    return {
      kind: "player-ready",
      label: "내 턴",
      key: "…",
      small: "준비 중",
      ariaLabel: "내 턴 준비 중",
      title: "새 손패와 에너지를 정리하는 중입니다.",
      disabledReason: "내 턴을 준비하는 중"
    };
  }
  return {
    kind: "processing",
    label: "처리 중",
    key: "…",
    small: "잠시만",
    ariaLabel: "전투 효과 처리 중",
    title: "피해와 상태 변화를 처리하는 중입니다.",
    disabledReason: "전투 효과 처리 중"
  };
}

function combatEndTurnButtonState(run, preview) {
  if (!combatTurnInputLocked(run)) {
    return {
      kind: "ready",
      locked: false,
      label: "턴 종료",
      key: "E",
      small: preview.label,
      ariaLabel: "턴 종료",
      title: preview.detail,
      disabledReason: ""
    };
  }
  return { ...combatTurnLockReason(run), locked: true };
}

function endTurnWithFx(run) {
  if (!run?.combat || run.phase !== "combat" || combatTurnInputLocked(run)) return false;
  clearCombatTurnCue();
  setCombatFx(null);
  const before = combatFxSnapshot(run);
  stageEnemyTurnCue(run);
  state.combatTurnActionTimer = window.setTimeout(() => {
    state.combatTurnActionTimer = null;
    if (state.run !== run || run.phase !== "combat") return;
    endTurn(run);
    stageEnemyTurnFx(run, before);
    if (run.phase === "combat") {
      state.combatTurnFollowupTimer = window.setTimeout(() => {
        state.combatTurnFollowupTimer = null;
        if (state.screen !== "game" || state.run?.phase !== "combat") return;
        if (activeCombatTurnCue(state.run)) return;
        stagePlayerTurnCue(state.run);
        render();
      }, combatTurnFollowupDelay());
    }
    afterMutation("end-turn");
  }, combatTurnActionDelay());
  return true;
}

function stageCombatFx(run, uid, targetUid = null) {
  if (!run?.combat || run.phase !== "combat") {
    clearCombatFx();
    return;
  }
  const combat = run.combat;
  const cardInstance = combat.hand.find((card) => card.uid === uid);
  if (!cardInstance) {
    clearCombatFx();
    return;
  }
  const card = effectiveCard(cardInstance);
  const cost = cardCost(cardInstance, combat);
  const aliveEnemies = combat.enemies.filter((enemy) => enemy.hp > 0);
  const target = aliveEnemies.find((enemy) => enemy.uid === (targetUid ?? combat.selectedEnemyUid)) ?? aliveEnemies[0] ?? null;
  const preview = cardPlayPreview(run, cardInstance, target?.uid);
  const tone = combatFxTone(preview, card);
  const hitsAllEnemies = preview.targetMode === "all" || preview.statuses?.some((status) => status.scope === "allEnemies");
  const hitsEnemy = preview.damage > 0 || preview.blockedDamage > 0 || preview.statuses?.some((status) => status.scope === "enemy" || status.scope === "allEnemies");
  const targetMode = hitsAllEnemies ? "all-enemies" : hitsEnemy ? "enemy" : "self";
  const chips = cardPreviewChips(preview).slice(0, 2);
  setCombatFx({
    id: `${Date.now()}-${uid}-${combat.turn}`,
    kind: "card",
    tone,
    targetMode,
    targetUid: targetMode === "enemy" ? target?.uid ?? null : null,
    cardId: cardInstance.cardId,
    cardType: card.type,
    cardRarity: card.rarity,
    cardCost: cardCost(cardInstance, combat),
    cardUpgraded: Boolean(cardInstance.upgraded),
    cardName: `${card.name}${cardInstance.upgraded ? "+" : ""}`,
    targetName: targetMode === "all-enemies" ? "모든 적" : targetMode === "enemy" ? target?.name ?? "적" : run.player.name,
    label: combatFxLabel(preview, tone),
    chips,
    energySpent: Math.max(0, Math.min(combat.energy, cost)),
    energyAfter: Math.max(0, combat.energy - cost),
    sourceMode: targetMode === "enemy" || targetMode === "all-enemies" ? "player" : "card",
    geometry: combatFxGeometryForCard(uid, targetMode, targetMode === "enemy" ? target?.uid ?? null : null),
    selfBlockGain: targetMode === "self" ? preview.block ?? 0 : 0,
    selfHeal: targetMode === "self" ? preview.heal ?? 0 : 0,
    selfCleanse: targetMode === "self" ? preview.cleansed ?? 0 : 0
  });
}

function finishCombatCardFx(run, before) {
  const fx = state.combatFx;
  if (!fx || fx.kind !== "card" || !before || !run?.combat || run.phase !== "combat") return;
  const afterEnemies = run.combat.enemies ?? [];
  const damaged = [];
  const defeated = [];
  for (const enemy of before.enemies) {
    if (enemy.hp <= 0) continue;
    const after = afterEnemies.find((candidate) => candidate.uid === enemy.uid);
    if (!after) continue;
    const hpLoss = Math.max(0, enemy.hp - after.hp);
    const blockLoss = Math.max(0, enemy.block - after.block);
    if (hpLoss > 0 || blockLoss > 0) damaged.push({ ...enemy, hpLoss, blockLoss, afterHp: after.hp });
    if (after.hp <= 0) defeated.push({ ...enemy, hpLoss, afterHp: 0 });
  }
  if (!damaged.length && !defeated.length) return;
  fx.hitUids = damaged.map((enemy) => enemy.uid);
  fx.hitAmounts = Object.fromEntries(damaged.map((enemy) => [enemy.uid, enemy.hpLoss]));
  fx.blockLossAmounts = Object.fromEntries(damaged.map((enemy) => [enemy.uid, enemy.blockLoss]));
  if (defeated.length) {
    fx.lethal = true;
    fx.defeatedUids = defeated.map((enemy) => enemy.uid);
    fx.tone = "damage";
    fx.targetMode = fx.targetMode === "all-enemies" || defeated.length > 1 ? "all-enemies" : "enemy";
    if (fx.targetMode === "enemy") fx.targetUid = defeated[0].uid;
    fx.targetName = defeated.length > 1 ? `적 ${defeated.length}명` : defeated[0].name;
    fx.label = defeated.length > 1 ? `처치 ${defeated.length}` : "처치";
    fx.chips = combatFxMergeChips([{ label: "처치", tone: "damage" }, ...combatFxSupportingChips(fx.chips)], 2);
  } else {
    const totalHpLoss = damaged.reduce((total, enemy) => total + enemy.hpLoss, 0);
    const totalBlockLoss = damaged.reduce((total, enemy) => total + enemy.blockLoss, 0);
    const hitChip = totalHpLoss > 0 ? { label: `체력 -${totalHpLoss}`, tone: "damage" } : { label: `방어 -${totalBlockLoss}`, tone: "damage" };
    if (totalHpLoss <= 0 && totalBlockLoss > 0) fx.label = `방어 -${totalBlockLoss}`;
    fx.chips = combatFxMergeChips([hitChip, ...combatFxSupportingChips(fx.chips)], 2);
  }
}

function combatFxHitAmount(fx, uid) {
  return Number(fx?.hitAmounts?.[uid] ?? 0);
}

function combatFxBlockLossAmount(fx, uid) {
  return Number(fx?.blockLossAmounts?.[uid] ?? 0);
}

function combatFxMergeChips(chips, limit = 2) {
  const seen = new Set();
  const merged = [];
  for (const chip of chips) {
    const key = `${chip.tone}:${chip.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(chip);
    if (merged.length >= limit) break;
  }
  return merged;
}

function combatFxSupportingChips(chips = []) {
  return (chips ?? []).filter((chip) => {
    const label = chip?.label ?? "";
    return !/^처치$/.test(label) && !/^체력 -/.test(label) && !/^(광역 )?피해 /.test(label) && !/^방어 -/.test(label);
  });
}

function combatFxSnapshot(run) {
  if (!run?.combat || run.phase !== "combat") return null;
  return {
    player: {
      hp: run.player.hp,
      block: run.player.block,
      statuses: { ...(run.player.statuses ?? {}) }
    },
    enemies: run.combat.enemies.map((enemy) => ({
      uid: enemy.uid,
      templateId: enemy.templateId,
      name: enemy.name,
      hp: enemy.hp,
      block: enemy.block,
      statuses: { ...(enemy.statuses ?? {}) },
      move: enemy.nextMove ? { ...enemy.nextMove } : null
    }))
  };
}

function stageEnemyTurnCue(run) {
  if (!run?.combat || run.phase !== "combat") return;
  const forecast = enemyIntentForecast(run);
  const outcome = enemyTurnCueTitle(forecast);
  setCombatTurnCue({
    id: `${Date.now()}-enemy-turn-${run.combat.turn}`,
    kind: "enemy",
    tone: forecast.hpLoss > 0 ? "danger" : forecast.incomingDamage > 0 ? "guarded" : forecast.incomingStatuses.length ? "warning" : "enemy",
    kicker: "턴 전환",
    title: "상대 턴",
    detail: `${outcome} · ${enemyTurnCueDetail(run, forecast)}`,
    chips: enemyTurnCueChips(run, forecast)
  });
}

function stagePlayerTurnCue(run) {
  if (!run?.combat || run.phase !== "combat") return;
  setCombatTurnCue({
    id: `${Date.now()}-player-turn-${run.combat.turn}`,
    kind: "player",
    tone: "ready",
    kicker: "턴 전환",
    title: "내 턴",
    detail: `카드 사용 가능 · ${run.combat.turn}턴 · 에너지 ${run.combat.energy}/${run.combat.maxEnergy} · 손패 ${run.combat.hand.length}장`,
    chips: [
      { tone: run.combat.energy > 0 ? "resource" : "muted", label: `에너지 ${run.combat.energy}` },
      { tone: "card", label: `카드 ${run.combat.hand.length}장` },
      run.player.block > 0 ? { tone: "block", label: `방어 ${run.player.block}` } : null
    ].filter(Boolean)
  });
}

function enemyTurnCueTitle(forecast) {
  if (forecast.hpLoss > 0) return "피해가 들어옵니다";
  if (forecast.incomingDamage > 0) return "방어로 버팁니다";
  if (forecast.incomingStatuses.length) return "상태 이상이 옵니다";
  if (combatSetupText(forecast) !== "준비 없음") return "적이 전열을 정비합니다";
  return "적이 움직입니다";
}

function enemyTurnCueDetail(run, forecast) {
  const actors = (run.combat?.enemies ?? [])
    .filter((enemy) => enemy.hp > 0 && enemy.nextMove)
    .map((enemy) => `${enemy.name}: ${enemy.nextMove.intent ?? enemy.nextMove.label ?? "행동"}`);
  const actorText = actors.length ? actors.slice(0, 2).join(" · ") + (actors.length > 2 ? ` 외 ${actors.length - 2}` : "") : "적 의도를 처리합니다";
  const forecastText = forecast.hpLoss > 0
    ? damageForecastText(run, forecast)
    : forecast.incomingDamage > 0
      ? "이번 공격은 방어로 막습니다"
      : forecast.incomingStatuses.length
        ? "해로운 상태가 적용됩니다"
        : combatSetupText(forecast) !== "준비 없음"
          ? "방어와 강화가 적용됩니다"
          : "피해 없이 넘어갑니다";
  return `${actorText} · ${forecastText}`;
}

function enemyTurnCueChips(run, forecast) {
  const chips = [];
  if (forecast.incomingDamage > 0) chips.push({ tone: forecast.hpLoss > 0 ? "danger" : "guarded", label: `공격 ${forecast.incomingDamage}` });
  if (forecast.blockedDamage > 0) chips.push({ tone: "block", label: `방어 ${forecast.blockedDamage}` });
  if (forecast.hpLoss > 0) chips.push({ tone: "danger", label: `체력 -${forecast.hpLoss}` });
  if (forecast.incomingStatuses.length) {
    const status = forecast.incomingStatuses[0];
    chips.push({ tone: "warning", label: `${keywordLabel(status.status)} ${status.amount}` });
  }
  if (forecast.summons > 0) chips.push({ tone: "status", label: `소환 ${forecast.summons}` });
  if (!chips.length && combatSetupText(forecast) !== "준비 없음") chips.push({ tone: "status", label: combatSetupText(forecast) });
  if (!chips.length) chips.push({ tone: "muted", label: `방어 ${run.player.block}` });
  return chips.slice(0, 3);
}

function stageEnemyTurnFx(run, before) {
  if (!before || run.phase !== "combat" || !run.combat) {
    clearCombatFx();
    return;
  }
  const actor = enemyFxActor(before, run);
  if (!actor) {
    clearCombatFx();
    return;
  }
  const actorCount = enemyFxActorCount(before);
  const playerHpLoss = Math.max(0, before.player.hp - run.player.hp);
  const playerBlockLoss = Math.max(0, before.player.block - run.player.block);
  const playerStatusChips = [
    ...combatStatusDeltaChips(before.player.statuses, run.player.statuses, true),
    ...moveStatusChips(actor.move)
  ];
  const afterEnemy = run.combat.enemies.find((enemy) => enemy.uid === actor.uid);
  const enemyBlockGain = Math.max(actor.move?.block ?? 0, afterEnemy ? Math.max(0, afterEnemy.block - actor.block) : 0);
  const enemyHeal = afterEnemy ? Math.max(0, afterEnemy.hp - actor.hp) : 0;
  const enemyStatusChips = afterEnemy ? combatStatusDeltaChips(actor.statuses, afterEnemy.statuses, false) : [];
  const summonedCount = Math.max(0, run.combat.enemies.length - before.enemies.length);
  const playerWasHit = playerHpLoss > 0 || playerStatusChips.length > 0 || actor.move?.damage;
  const targetMode = playerWasHit ? "self" : "enemy";
  const targetUid = targetMode === "enemy" ? actor.uid : null;
  const hitCount = enemyFxTotalHitCount(before, actor);
  const tone = enemyFxTone({ playerHpLoss, playerBlockLoss, playerStatusChips, enemyBlockGain, enemyHeal, enemyStatusChips, summonedCount, move: actor.move });
  const chips = enemyFxChips({
    playerHpLoss,
    playerBlockLoss,
    playerStatusChips,
    enemyBlockGain,
    enemyHeal,
    enemyStatusChips,
    summonedCount,
    move: actor.move,
    hitCount,
    actorCount
  });
  const label = enemyFxLabel({
    playerHpLoss,
    playerBlockLoss,
    playerStatusChips,
    enemyBlockGain,
    enemyHeal,
    enemyStatusChips,
    summonedCount,
    move: actor.move,
    tone
  });
  setCombatFx({
    id: `${Date.now()}-enemy-${run.combat.turn}`,
    kind: "enemy-action",
    tone,
    targetMode,
    targetUid,
    actorTemplateId: actor.templateId,
    actorUid: actor.uid,
    actorCount,
    actorName: enemyFxActorName(actor, actorCount),
    moveName: enemyFxMoveName(actor, actorCount),
    cardName: enemyFxMoveName(actor, actorCount),
    hitCount,
    targetName: targetMode === "self" ? run.player.name : actor.name,
    label,
    chips,
    geometry: combatFxGeometryForEnemy(actor.uid, targetMode, targetUid),
    selfHpLoss: playerHpLoss,
    selfBlockLoss: playerBlockLoss,
    enemyBlockGain,
    enemyHeal
  });
}

function enemyFxActorCount(before) {
  return Math.max(1, before?.enemies?.filter((enemy) => enemy.hp > 0 && enemy.move).length ?? 1);
}

function enemyFxTotalHitCount(before, fallbackActor = null) {
  const activeBefore = before?.enemies?.filter((enemy) => enemy.hp > 0 && enemy.move) ?? [];
  const damagingMoves = activeBefore
    .map((enemy) => enemy.move)
    .filter((move) => enemyMoveDamageTotal(move) > 0);
  if (!damagingMoves.length) return enemyFxHitCount(fallbackActor?.move ?? {});
  return damagingMoves.reduce((sum, move) => sum + enemyFxHitCount(move), 0);
}

function enemyFxActorName(actor, actorCount = 1) {
  if (actorCount <= 1) return actor.name;
  return `${actor.name} 외 ${actorCount - 1}명`;
}

function enemyFxMoveName(actor, actorCount = 1) {
  if (actorCount > 1) return "연속 행동";
  return actor.move?.label ?? enemyMoveFallbackLabel(actor.move);
}

function enemyMoveFallbackLabel(move) {
  return {
    attack: "공격",
    defend: "방어",
    debuff: "상태 부여",
    buff: "강화",
    summon: "소환",
    special: "행동"
  }[move?.type] ?? "적 행동";
}

function enemyFxActor(before, run) {
  const activeBefore = before.enemies.filter((enemy) => enemy.hp > 0 && enemy.move);
  const multiHit = activeBefore.find((enemy) => enemy.move?.damage && enemyFxHitCount(enemy.move) > 1);
  if (multiHit) return multiHit;
  const damaging = activeBefore.find((enemy) => enemy.move?.damage || enemy.move?.applyToPlayer?.length);
  if (damaging) return damaging;
  const boardChanging = activeBefore.find((enemy) => {
    const after = run.combat?.enemies.find((candidate) => candidate.uid === enemy.uid);
    return enemy.move?.summon || enemy.move?.block || enemy.move?.heal || enemy.move?.self?.length || (after && (after.block > enemy.block || after.hp > enemy.hp));
  });
  return boardChanging ?? activeBefore[0] ?? null;
}

function enemyFxHitCount(move = {}) {
  return Math.max(1, Number(move?.hits ?? 1) || 1);
}

function enemyFxTone({ playerHpLoss, playerBlockLoss, playerStatusChips, enemyBlockGain, enemyHeal, enemyStatusChips, summonedCount, move }) {
  if (playerHpLoss > 0 || move?.damage) return "enemy";
  if (playerBlockLoss > 0) return "block";
  if (playerStatusChips.length > 0 || move?.applyToPlayer?.length) return "warn";
  if (enemyBlockGain > 0 || enemyHeal > 0) return "block";
  if (summonedCount > 0) return "summon";
  if (enemyStatusChips.length > 0 || move?.self?.length) return "status";
  return "enemy";
}

function enemyFxLabel({ playerHpLoss, playerBlockLoss, playerStatusChips, enemyBlockGain, enemyHeal, enemyStatusChips, summonedCount, move, tone }) {
  if (playerHpLoss > 0) return `피해 ${playerHpLoss}`;
  if (playerBlockLoss > 0) return `방어 -${playerBlockLoss}`;
  if (move?.damage) return "공격";
  if (playerStatusChips.length > 0) return "상태 부여";
  if (enemyBlockGain > 0) return `방어 +${enemyBlockGain}`;
  if (enemyHeal > 0) return `회복 +${enemyHeal}`;
  if (summonedCount > 0) return `소환 ${summonedCount}`;
  if (enemyStatusChips.length > 0) return "강화";
  return tone === "block" ? "방어" : "적 행동";
}

function enemyFxChips({ playerHpLoss, playerBlockLoss, playerStatusChips, enemyBlockGain, enemyHeal, enemyStatusChips, summonedCount, move, hitCount = enemyFxHitCount(move), actorCount = 1 }) {
  const chips = [];
  if (playerHpLoss > 0) chips.push({ label: `체력 -${playerHpLoss}`, tone: "damage" });
  else if (playerBlockLoss > 0) chips.push({ label: `방어 -${playerBlockLoss}`, tone: "block" });
  if ((playerHpLoss > 0 || playerBlockLoss > 0 || move?.damage) && hitCount > 1) {
    chips.push({ label: `${actorCount > 1 ? "총 타격" : "연타"} ×${hitCount}`, tone: "control" });
  }
  chips.push(...dedupeFxChips(playerStatusChips));
  if (enemyBlockGain > 0) chips.push({ label: `방어 +${enemyBlockGain}`, tone: "block" });
  if (enemyHeal > 0) chips.push({ label: `회복 +${enemyHeal}`, tone: "block" });
  if (summonedCount > 0) chips.push({ label: `소환 ${summonedCount}`, tone: "status" });
  chips.push(...dedupeFxChips(enemyStatusChips));
  if (!chips.length && move?.intent) chips.push({ label: move.intent, tone: "control" });
  return chips.slice(0, 2);
}

function moveStatusChips(move) {
  return (move?.applyToPlayer ?? []).map((status) => ({
    label: `${keywordLabel(status.status)} +${status.amount}`,
    tone: "warn"
  }));
}

function combatStatusDeltaChips(before = {}, after = {}, harmful = false) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .map((key) => ({ key, delta: Math.max(0, after[key] ?? 0) - Math.max(0, before[key] ?? 0) }))
    .filter((item) => item.delta > 0)
    .map((item) => ({
      label: `${keywordLabel(item.key)} +${item.delta}`,
      tone: harmful || PLAYER_HARMFUL_STATUSES.includes(item.key) ? "warn" : "status"
    }));
}

function dedupeFxChips(chips) {
  const seen = new Set();
  return chips.filter((chip) => {
    const key = `${chip.tone}:${chip.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function combatFxTone(preview, card) {
  if (!preview.playable) return "warn";
  if (preview.damage > 0 || preview.blockedDamage > 0) return "damage";
  if (preview.block > 0 || preview.heal > 0 || preview.cleansed > 0) return "block";
  if (preview.energyDelta + preview.cost > 0 || preview.draw > 0 || preview.generated > 0 || preview.charge > 0) return "resource";
  if (preview.statuses?.length) return "status";
  return card.type === "power" ? "resource" : "card";
}

function combatFxLabel(preview, tone) {
  if (!preview.playable) return preview.warnings?.[0] ?? "사용 불가";
  if (preview.damage > 0) return `${preview.targetMode === "all" ? "광역 " : ""}피해 ${preview.damage}`;
  if (preview.blockedDamage > 0) return `방어 -${preview.blockedDamage}`;
  if (preview.block > 0) return `방어 +${preview.block}`;
  if (preview.cleansed > 0) return `정화 ${preview.cleansed}`;
  if (preview.heal > 0) return `회복 +${preview.heal}`;
  if (preview.draw > 0) return `뽑기 +${preview.draw}`;
  if (preview.charge > 0) return `전하 +${preview.charge}`;
  if (preview.generated > 0) return `생성 ${preview.generated}장`;
  if (tone === "status") return combatFxStatusLabel(preview);
  return "카드 사용";
}

function combatFxStatusLabel(preview) {
  const status = aggregatePreviewStatuses(preview.statuses ?? [])[0];
  if (!status) return "상태 부여";
  return `${keywordLabel(status.status)} ${signed(status.amount)}`;
}

function cycleCombatTarget(run, delta) {
  const enemies = run.combat?.enemies.filter((enemy) => enemy.hp > 0) ?? [];
  if (!enemies.length) return;
  const currentIndex = Math.max(0, enemies.findIndex((enemy) => enemy.uid === run.combat.selectedEnemyUid));
  const next = enemies[(currentIndex + delta + enemies.length) % enemies.length];
  selectEnemy(run, next.uid);
}

function highlightPointerDropTarget(x, y) {
  const enemy = enemyCardAtPoint(x, y);
  app.querySelectorAll(".enemy-card.drop-ready").forEach((element) => {
    if (element !== enemy) element.classList.remove("drop-ready");
  });
  enemy?.classList.add("drop-ready");
  if (pointerCardDrag?.card) {
    showCombatCardPreview(pointerCardDrag.card, enemy ? Number(enemy.dataset.id) : null, "drag");
  }
}

function enemyCardAtPoint(x, y) {
  return document.elementFromPoint(x, y)?.closest(".enemy-card:not(.dead)") ?? null;
}

function clearPointerCardDrag() {
  if (pointerCardDrag?.card && pointerCardDrag.pointerId != null && pointerCardDrag.card.hasPointerCapture?.(pointerCardDrag.pointerId)) {
    pointerCardDrag.card.releasePointerCapture?.(pointerCardDrag.pointerId);
  }
  pointerCardDrag?.card?.classList.remove("dragging");
  pointerCardDrag = null;
  document.body.classList.remove("dragging-card");
  app.querySelectorAll(".enemy-card.drop-ready").forEach((element) => element.classList.remove("drop-ready"));
  clearCombatCardPreview();
}

function afterMutation(action = "button") {
  const phaseCue = bossPhaseCue(state.run);
  playTone(phaseCue ? "bossPhase" : soundCueFor(action, state.run));
  if (phaseCue) state.lastBossPhaseCue = phaseCue;
  if (state.run?.phase !== "combat") state.pileOpen = null;
  if (state.run?.phase !== "map") state.mapPreviewNodeId = null;
  if (state.run?.phase !== "reward" || state.run?.reward?.selectedCardId || state.run?.reward?.cardSkipped) state.rewardPreviewCardId = null;
  if (state.run?.phase === "summary") state.relicOpen = false;
  if (state.run?.phase === "summary") {
    recordSummary(state.run);
    deleteSavedRun(browserStorage());
  } else if (state.run) {
    saveRun(state.run);
  }
  render();
}

function actionAllowedForPhase(action, run = state.run) {
  if (!run) return false;
  if (["open-relics", "close-relics", "back-title", "start-next-difficulty"].includes(action)) return true;
  if (action === "deck-select" || action === "deck-cancel") return Boolean(run.selector);
  if (action === "dismiss-victory-coda") return Boolean(activeCombatVictoryCoda(run));
  const phaseActions = {
    map: new Set(["enter-node"]),
    combat: new Set(["select-enemy", "cycle-enemy", "play-card", "end-turn", "open-pile", "close-pile"]),
    reward: new Set(["reward-card", "reward-relic", "skip-reward"]),
    event: new Set(["event-option"]),
    shop: new Set(["shop-card", "shop-relic", "shop-heal", "shop-remove", "shop-upgrade", "leave-shop"]),
    rest: new Set(["rest"]),
    summary: new Set([])
  };
  return phaseActions[run.phase]?.has(action) ?? false;
}

function shouldIgnoreRepeatedAction(action, id = "", index = -1, run = state.run) {
  if (!REPEAT_GUARDED_ACTIONS.has(action)) return false;
  const now = Date.now();
  const key = repeatedActionKey(action, id, index, run);
  const windowMs = action === "play-card" || action === "end-turn" ? 720 : 520;
  if (state.lastActionStamp?.key === key && now - state.lastActionStamp.at < windowMs) return true;
  state.lastActionStamp = { key, at: now };
  return false;
}

function repeatedActionKey(action, id = "", index = -1, run = state.run) {
  return [
    state.screen,
    run?.phase ?? "none",
    run?.currentNodeId ?? "none",
    run?.selector?.mode ?? "none",
    action,
    id ?? "",
    index,
    run?.reward?.selectedCardId ?? "",
    run?.reward?.selectedRelicId ?? "",
    run?.reward?.cardSkipped ? "skip" : "pick"
  ].join("|");
}

function choicePulseSnapshot(run, action = "", id = null, index = -1) {
  if (!run?.player) return null;
  return {
    action,
    id,
    index,
    phase: run.phase,
    nodeId: run.currentNodeId ?? null,
    hp: run.player.hp,
    maxHp: run.player.maxHp,
    gold: run.player.gold,
    deckSize: run.player.deck.length,
    relicCount: run.player.relics.length,
    upgradedCount: run.player.deck.filter((card) => card.upgraded).length,
    cards: run.player.deck.map((card) => ({ uid: card.uid, cardId: card.cardId, upgraded: Boolean(card.upgraded) })),
    relicIds: [...run.player.relics],
    rewardSelectedCardId: run.reward?.selectedCardId ?? null,
    rewardCardSkipped: Boolean(run.reward?.cardSkipped),
    rewardSelectedRelicId: run.reward?.selectedRelicId ?? null,
    rewardRelicChoices: run.reward ? rewardRelicChoices(run.reward) : [],
    selector: run.selector ? { ...run.selector } : null,
    targetName: choicePulseTargetName(run, action, id, index)
  };
}

function choicePulseTargetName(run, action, id, index) {
  if (!run) return "";
  if (action === "reward-card") return id ? effectiveCard({ cardId: id }).name : "";
  if (action === "reward-relic") return RELIC_BY_ID[id]?.name ?? "";
  if (action === "shop-card") {
    const cardId = run.shop?.cards?.[index]?.cardId;
    return cardId ? effectiveCard({ cardId }).name : "";
  }
  if (action === "shop-relic") return RELIC_BY_ID[run.shop?.relics?.[index]?.relicId]?.name ?? "";
  if (action === "event-option") return EVENT_BY_ID[run.event?.eventId]?.choices?.[index]?.label ?? "선택 완료";
  if (action === "rest") return restActionLabel(id);
  if (action === "deck-select") {
    const card = run.player.deck.find((item) => item.uid === Number(id));
    return card ? effectiveCard(card).name : "";
  }
  return "";
}

function stageChoicePulse(action, before, run) {
  if (!before || !CHOICE_PULSE_ACTIONS.has(action) || !run?.player) return;
  if (["reward-card", "reward-relic", "skip-reward"].includes(action)) return;
  const pulse = choicePulseFromDelta(action, before, choicePulseSnapshot(run, action, before.id, before.index));
  if (pulse) setChoicePulse(pulse);
}

function choicePulseFromDelta(action, before, after) {
  if (!before || !after) return null;
  if ((after.selector && action !== "deck-select") || action === "shop-remove" || action === "shop-upgrade" || (action === "rest" && after.selector)) {
    return choicePulseForSelector(action, before, after);
  }
  const chips = choicePulseDeltaChips(before, after);
  const selectionChips = choicePulseSelectionChips(action, before, after);
  const nextChip = choicePulseNextStepChip(action, before, after);
  const meaningful = chips.length || selectionChips.length || choicePulseSelectionChanged(action, before, after) || before.phase !== after.phase;
  if (!meaningful) return null;
  const title = choicePulseTitle(action, before, after);
  const detail = choicePulseDetail(action, before, after);
  if (!chips.length && !title) return null;
  const visibleChips = choicePulseVisibleChips([...chips, ...selectionChips], nextChip);
  return {
    id: `${Date.now()}-${action}`,
    phase: after.phase,
    nodeId: after.nodeId ?? null,
    tone: choicePulseTone(action, before, after),
    title,
    detail,
    chips: visibleChips,
    until: Date.now() + choicePulseDuration()
  };
}

function choicePulseForSelector(action, before, after) {
  if (!after.selector) return null;
  const modeLabel = after.selector.mode === "upgrade" ? "강화할 카드 선택" : "제거할 카드 선택";
  const chips = [];
  const goldDelta = after.gold - before.gold;
  if (goldDelta < 0) chips.push({ tone: "cost", label: `크레딧 ${goldDelta}` });
  if (after.selector.refund) chips.push({ tone: "steady", label: "취소 시 환불" });
  if (after.selector.hpCost) chips.push({ tone: "warn", label: `체력 -${after.selector.hpCost}` });
  chips.push({ tone: "next", label: "카드 선택 필요" });
  return {
    id: `${Date.now()}-${action}-selector`,
    phase: after.phase,
    nodeId: after.nodeId ?? null,
    tone: after.selector.mode === "remove" ? "warning" : "craft",
    title: modeLabel,
    detail: after.selector.mode === "upgrade" ? "강화할 카드를 고르면 정비가 확정됩니다." : "제거할 카드를 고르면 덱이 한 장 줄어듭니다.",
    chips,
    until: Date.now() + choicePulseDuration()
  };
}

function choicePulseDeltaChips(before, after) {
  const chips = [];
  const goldDelta = after.gold - before.gold;
  const hpDelta = after.hp - before.hp;
  const maxHpDelta = after.maxHp - before.maxHp;
  const deckDelta = after.deckSize - before.deckSize;
  const relicDelta = after.relicCount - before.relicCount;
  const upgradeDelta = after.upgradedCount - before.upgradedCount;
  if (goldDelta) chips.push({ tone: goldDelta > 0 ? "reward" : "cost", label: `크레딧 ${signed(goldDelta)}` });
  if (hpDelta) chips.push({ tone: hpDelta > 0 ? "heal" : "warn", label: `체력 ${signed(hpDelta)}` });
  if (maxHpDelta) chips.push({ tone: maxHpDelta > 0 ? "heal" : "warn", label: `최대 체력 ${signed(maxHpDelta)}` });
  if (deckDelta) chips.push({ tone: deckDelta > 0 ? "deck" : "craft", label: `덱 ${signed(deckDelta)}장` });
  if (relicDelta) chips.push({ tone: "relic", label: `유물 ${signed(relicDelta)}` });
  if (upgradeDelta) chips.push({ tone: "craft", label: `강화 ${signed(upgradeDelta)}` });
  const removedCard = before.cards.find((card) => !after.cards.some((item) => item.uid === card.uid));
  if (removedCard) chips.push({ tone: "craft", label: `${effectiveCard(removedCard).name} 제거` });
  const upgradedCard = after.cards.find((card) => card.upgraded && before.cards.some((item) => item.uid === card.uid && !item.upgraded));
  if (upgradedCard) chips.push({ tone: "craft", label: `${effectiveCard(upgradedCard).name}+` });
  const newRelicId = after.relicIds.find((relicId) => !before.relicIds.includes(relicId));
  if (newRelicId) chips.push({ tone: "relic", label: RELIC_BY_ID[newRelicId]?.name ?? "유물" });
  return dedupeChoiceChips(chips);
}

function choicePulseSelectionChips(action, before, after) {
  if (action === "reward-card" && choicePulseSelectionChanged(action, before, after) && after.phase === "reward") {
    return [{ tone: "next", label: "유물 선택 필요" }];
  }
  if (action === "skip-reward" && choicePulseSelectionChanged(action, before, after) && after.phase === "reward") {
    return [
      { tone: "steady", label: "카드 받지 않음" },
      { tone: "next", label: "유물 선택 필요" }
    ];
  }
  if (action === "reward-relic" && choicePulseSelectionChanged(action, before, after) && after.phase === "reward") {
    return [{ tone: "next", label: "카드 선택 필요" }];
  }
  return [];
}

function choicePulseVisibleChips(chips, nextChip = null) {
  const merged = dedupeChoiceChips([...chips, ...(nextChip ? [nextChip] : [])]);
  if (!nextChip || merged.length <= 4) return merged.slice(0, 4);
  const nextLabel = nextChip.label;
  const withoutNext = merged.filter((chip) => chip.label !== nextLabel).slice(0, 3);
  return [...withoutNext, nextChip];
}

function choicePulseNextStepChip(action, before, after) {
  if (after.selector || (before.phase === after.phase && !["shop-card", "shop-relic", "shop-heal"].includes(action))) return null;
  if (after.phase === "map") return { tone: "next", label: "다음 경로 선택" };
  if (after.phase === "reward") return { tone: "next", label: "보상 선택" };
  if (after.phase === "shop") return { tone: "next", label: "정비 계속" };
  if (after.phase === "rest") return { tone: "next", label: "정비 선택" };
  if (after.phase === "event") return { tone: "next", label: "선택 계속" };
  return null;
}

function choicePulseSelectionChanged(action, before, after) {
  if (action === "reward-card") return before.rewardSelectedCardId !== after.rewardSelectedCardId || before.rewardCardSkipped !== after.rewardCardSkipped;
  if (action === "skip-reward") return before.rewardSelectedCardId !== after.rewardSelectedCardId || before.rewardCardSkipped !== after.rewardCardSkipped;
  if (action === "reward-relic") return before.rewardSelectedRelicId !== after.rewardSelectedRelicId;
  return false;
}

function choicePulseTitle(action, before, after) {
  if (action === "reward-card") return after.deckSize > before.deckSize || after.phase !== "reward" ? "카드 확보" : "카드 선택 완료";
  if (action === "reward-relic") return "유물 확보";
  if (action === "skip-reward") return after.phase === "reward" ? "카드 보상 넘김" : "보상 넘김";
  if (action === "event-option") return "이벤트 선택 완료";
  if (action === "shop-card") return "카드 구매";
  if (action === "shop-relic") return "유물 구매";
  if (action === "shop-heal") return "체력 회복 완료";
  if (action === "rest") return "세이프룸 정비 완료";
  if (action === "deck-select") {
    if (before.selector?.mode === "upgrade") return "카드 강화 완료";
    if (before.selector?.mode === "remove") return "카드 제거 완료";
    return "덱 정비 완료";
  }
  return after.targetName ? `${after.targetName} 선택` : "선택 완료";
}

function choicePulseDetail(action, before, after) {
  const target = after.targetName || before.targetName;
  if (action === "reward-card" && target) {
    if (after.deckSize > before.deckSize || after.phase !== "reward") return `${withSubjectParticle(target)} 덱에 들어왔습니다.`;
    return `${target} 선택 완료. 유물까지 고르면 보상이 확정됩니다.`;
  }
  if (action === "reward-relic" && target) return `${withSubjectParticle(target)} 이번 런에 추가되었습니다.`;
  if (action === "skip-reward") return "카드를 받지 않고 현재 덱 흐름을 유지했습니다.";
  if (action === "event-option" && target) return `${target} 결과가 바로 적용되었습니다.`;
  if (action === "shop-card" && target) return `${target} 구매 완료. 남은 크레딧과 덱 크기를 확인하세요.`;
  if (action === "shop-relic" && target) return `${target} 구매 완료. 유물 줄에서 발동 시점을 확인할 수 있습니다.`;
  if (action === "shop-heal") return "체력을 회복했습니다. 남은 크레딧으로 추가 정비를 판단하세요.";
  if (action === "rest") return "휴식 선택이 적용되고 다음 경로로 돌아갑니다.";
  if (action === "deck-select" && target) {
    if (before.selector?.mode === "upgrade") return `${target} 강화가 확정되었습니다.`;
    if (before.selector?.mode === "remove") return `${withObjectParticle(target)} 덱에서 제거했습니다.`;
  }
  return "선택 결과가 적용되었습니다.";
}

function choicePulseTone(action, before, after) {
  if (action === "event-option" && after.hp < before.hp) return "warning";
  if (action === "skip-reward") return "steady";
  if (action === "reward-relic" || action === "shop-relic") return "relic";
  if (action === "shop-card" || action === "shop-heal") return "shop";
  if (action === "rest" || action === "deck-select") return "craft";
  if (action === "event-option") return "event";
  return "reward";
}

function dedupeChoiceChips(chips) {
  const seen = new Set();
  return chips.filter((chip) => {
    const key = `${chip.tone}:${chip.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withSubjectParticle(text) {
  return `${text}${koreanSubjectParticle(text)}`;
}

function withObjectParticle(text) {
  return `${text}${koreanObjectParticle(text)}`;
}

function withTopicParticle(text) {
  return `${text}${koreanTopicParticle(text)}`;
}

function koreanTopicParticle(text) {
  return koreanHasFinalConsonant(text) ? "은" : "는";
}

function koreanSubjectParticle(text) {
  return koreanHasFinalConsonant(text) ? "이" : "가";
}

function koreanObjectParticle(text) {
  return koreanHasFinalConsonant(text) ? "을" : "를";
}

function koreanHasFinalConsonant(text) {
  const last = [...String(text).trim()].pop();
  if (!last) return false;
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

function choicePulseDuration() {
  return 2600 / motionScale();
}

function setChoicePulse(pulse) {
  if (pulse && state.choicePulse?.key === choicePulseKey(pulse) && activeChoicePulse()) return;
  if (state.choicePulseTimer) {
    window.clearTimeout(state.choicePulseTimer);
    state.choicePulseTimer = null;
  }
  state.choicePulse = pulse ? { ...pulse, key: choicePulseKey(pulse) } : null;
  if (!pulse) return;
  const id = state.choicePulse.id;
  state.choicePulseTimer = window.setTimeout(() => {
    if (state.choicePulse?.id === id) {
      state.choicePulse = null;
      state.choicePulseTimer = null;
      render();
    }
  }, choicePulseDuration());
}

function clearChoicePulse() {
  if (state.choicePulseTimer) {
    window.clearTimeout(state.choicePulseTimer);
    state.choicePulseTimer = null;
  }
  state.choicePulse = null;
}

function choicePulseKey(pulse) {
  if (!pulse) return "";
  const chips = (pulse.chips ?? []).map((chip) => `${chip.tone}:${chip.label}`).join(",");
  return `${pulse.tone}|${pulse.title}|${pulse.detail}|${chips}`;
}

function requestRunStart(config, label = "새 런") {
  const saved = loadRun();
  if (saveRecoveryNotice) state.saveNotice = saveRecoveryNotice;
  if (saved && saved.phase !== "summary") {
    state.pendingStart = { config, label };
    playTone("button");
    render();
    return;
  }
  state.pendingStart = null;
  startRunFromTitle(config);
}

function requestDeleteSave() {
  const saved = loadRun();
  if (saveRecoveryNotice) state.saveNotice = saveRecoveryNotice;
  state.pendingDeleteSave = {
    saved,
    notice: state.saveNotice,
    requestedAt: Date.now()
  };
  playTone("danger");
  render();
}

function requestAbandonRun() {
  if (!state.run || state.run.phase === "summary") {
    playTone("danger");
    return;
  }
  state.pendingAbandonRun = {
    runId: state.run.id,
    requestedAt: Date.now()
  };
  playTone("danger");
  render();
}

function deleteSavedRunNow() {
  deleteSavedRun(browserStorage());
  state.run = null;
  state.returnScreen = null;
  state.pendingStart = null;
  state.pendingDeleteSave = null;
  state.pendingAbandonRun = null;
  state.saveNotice = null;
  playTone("danger");
  render();
}

function abandonCurrentRunNow() {
  const run = state.run;
  state.pendingAbandonRun = null;
  if (!run || run.phase === "summary") {
    render();
    return;
  }
  clearTransientRunUi();
  state.screen = "game";
  state.returnScreen = null;
  abandonRun(run);
  afterMutation("abandon-run");
}

function startRunFromTitle(config) {
  clearTransientRunUi();
  state.run = newRun({ seed: config.seed, difficulty: state.selectedDifficulty, challenge: config.challenge ?? null });
  state.screen = "game";
  state.returnScreen = null;
  state.deckOpen = false;
  state.pileOpen = null;
  state.relicOpen = false;
  state.pendingStart = null;
  state.pendingDeleteSave = null;
  state.pendingAbandonRun = null;
  afterMutation("start");
}

function clearTransientRunUi() {
  clearCombatFx();
  clearCombatVictoryCoda();
  clearChoicePulse();
  clearMapRoutePreview();
  hideCardPortalTooltip();
  hideStatusPortalTooltip();
  hideIntentPortalTooltip();
  state.seenCombatVictoryCodaKeys = new Set();
  state.dismissedCombatVictoryCodaKeys = new Set();
  state.seenActInterludeKeys = new Set();
  state.dismissedActInterludeKeys = new Set();
  state.lastActionStamp = null;
  state.rewardPreviewCardId = null;
  state.deckOpen = false;
  state.pileOpen = null;
  state.relicOpen = false;
}

function selectedRunConfig() {
  const seed = sanitizeSeed(state.customSeed);
  if (seed) {
    return { seed, challenge: { type: "seed", name: "시드 런" } };
  }
  return { seed: `abyss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, challenge: null };
}

function dailyRunConfig(date = new Date()) {
  const dateKey = localDateKey(date);
  const difficulty = state.selectedDifficulty;
  const modifiers = dailyModifierIds(dateKey, difficulty);
  return {
    seed: `daily-${dateKey}-d${difficulty}`,
    challenge: { type: "daily", name: "오늘의 계약", date: dateKey, modifiers }
  };
}

function dailyModifierIds(dateKey, difficulty) {
  const pool = GAME_DATA.challengeModifiers ?? [];
  if (pool.length <= 2) return pool.map((modifier) => modifier.id);
  const start = visualSeed(`${dateKey}:${difficulty}:contract`) % pool.length;
  const step = (visualSeed(`${dateKey}:${difficulty}:step`) % (pool.length - 1)) + 1;
  const picked = [];
  let cursor = start;
  while (picked.length < 2) {
    const id = pool[cursor % pool.length].id;
    if (!picked.includes(id)) picked.push(id);
    cursor += step;
  }
  return picked;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sanitizeSeed(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 32);
}

function render() {
  applySettings();
  const previousRenderKey = state.lastRenderKey;
  const renderKey = currentRenderKey();
  state.phaseTransition = phaseTransitionCue(previousRenderKey, renderKey, state.run);
  const resetScroll = state.lastRenderKey !== renderKey;
  if (state.screen === "settings") {
    setAppHtml(renderSettings(), resetScroll);
    state.lastRenderKey = renderKey;
    syncMusic();
    return;
  }
  if (state.screen === "about") {
    setAppHtml(renderAbout(), resetScroll);
    state.lastRenderKey = renderKey;
    syncMusic();
    return;
  }
  if (state.screen === "guide") {
    setAppHtml(renderGuide(), resetScroll);
    state.lastRenderKey = renderKey;
    syncMusic();
    return;
  }
  if (state.screen === "records") {
    setAppHtml(renderRecords(), resetScroll);
    state.lastRenderKey = renderKey;
    syncMusic();
    return;
  }
  if (state.screen === "codex") {
    setAppHtml(renderCodex(), resetScroll);
    state.lastRenderKey = renderKey;
    syncMusic();
    return;
  }
  if (state.screen === "game" && state.run) {
    setAppHtml(renderGame(state.run), state.run.phase !== "combat" || resetScroll);
    state.lastRenderKey = renderKey;
    syncMusic();
    return;
  }
  setAppHtml(renderTitle(), resetScroll);
  state.lastRenderKey = renderKey;
  syncMusic();
}

function currentRenderKey() {
  if (state.screen === "game" && state.run) return `game:${state.run.phase}`;
  return state.screen;
}

function openScreen(screen) {
  const canReturnToGame = state.screen === "game" && state.run && screen !== "game";
  state.returnScreen = canReturnToGame ? "game" : null;
  state.screen = screen;
  state.deckOpen = false;
  state.pileOpen = null;
  state.relicOpen = false;
}

function returnToPreviousScreen() {
  state.screen = state.returnScreen === "game" && state.run ? "game" : "title";
  state.returnScreen = null;
  state.deckOpen = false;
  state.pileOpen = null;
  state.relicOpen = false;
}

function returnButtonLabel() {
  return state.returnScreen === "game" && state.run ? "게임으로" : "돌아가기";
}

function isEditingText(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.matches("input, textarea, select, [contenteditable='true']");
}

function syncCardHoverFromPointer(event) {
  if (event.pointerType === "touch" || pointerCardDrag) return;
  if (state.combatFx && state.run?.phase === "combat") return;
  if (Date.now() < cardTooltipSuppressUntil) return;
  const card = event.target?.closest?.(".game-card");
  if (card && app.contains(card)) {
    if (card.closest(".reward-option")) {
      hideCardPortalTooltip();
      return;
    }
    if (cardTooltipSource !== card || cardTooltipLayer.hidden) showCardPortalTooltip(card);
    return;
  }
  if (cardTooltipSource && !cardTooltipSource.contains(event.target)) hideCardPortalTooltip();
}

function showCardPortalTooltip(cardElement) {
  if (state.combatFx && state.run?.phase === "combat") return;
  if (Date.now() < cardTooltipSuppressUntil) return;
  if (cardElement?.closest?.(".deck-select-grid")) return;
  if (cardElement?.closest?.(".reward-option")) return;
  const tooltip = cardElement?.querySelector?.(".tooltip");
  if (!tooltip) return;
  cardTooltipSource = cardElement;
  const isCombatHandCard = cardElement.matches("[data-action='play-card']") && cardElement.closest(".hand-zone");
  if (isCombatHandCard) showCombatCardPreview(cardElement);
  const tone = ["attack", "skill", "power", "curse", "status"].find((type) => cardElement.classList.contains(type)) ?? "neutral";
  cardTooltipLayer.className = `card-portal-tooltip tone-${tone}${isCombatHandCard ? " hand-tooltip" : ""}`;
  cardTooltipLayer.innerHTML = tooltip.innerHTML;
  cardTooltipLayer.hidden = false;
  cardTooltipLayer.style.visibility = "hidden";
  positionCardPortalTooltip();
  if (cardTooltipSource === cardElement) cardTooltipLayer.style.visibility = "visible";
  requestAnimationFrame(() => {
    positionCardPortalTooltip();
    if (cardTooltipSource === cardElement) cardTooltipLayer.style.visibility = "visible";
  });
}

function hideCardPortalTooltip(source = null) {
  if (source && cardTooltipSource && source !== cardTooltipSource) return;
  clearCombatCardPreview(source);
  cardTooltipSource = null;
  cardTooltipLayer.hidden = true;
  cardTooltipLayer.style.visibility = "hidden";
  cardTooltipLayer.innerHTML = "";
}

function showStatusPortalTooltip(statusChip) {
  if (!statusChip?.classList?.contains("status-chip")) return;
  const label = statusChip.dataset.statusLabel ?? statusChip.getAttribute("aria-label") ?? "상태";
  const description = statusChip.dataset.statusDescription ?? "";
  const key = statusChip.dataset.statusKey ?? "more";
  const tone = statusChip.classList.contains("harmful") ? "harmful" : statusChip.classList.contains("beneficial") ? "beneficial" : "neutral";
  statusTooltipSource = statusChip;
  statusTooltipLayer.className = `status-portal-tooltip tone-${tone} status-${key}`;
  statusTooltipLayer.innerHTML = `
    <span class="status-tooltip-icon ${statusIconClass(key)}" aria-hidden="true"></span>
    <strong>${label}</strong>
    <small>${description}</small>
  `;
  statusTooltipLayer.hidden = false;
  statusTooltipLayer.style.visibility = "hidden";
  positionStatusPortalTooltip();
  if (statusTooltipSource === statusChip) statusTooltipLayer.style.visibility = "visible";
  requestAnimationFrame(() => {
    positionStatusPortalTooltip();
    if (statusTooltipSource === statusChip) statusTooltipLayer.style.visibility = "visible";
  });
}

function hideStatusPortalTooltip(source = null) {
  if (source && statusTooltipSource && source !== statusTooltipSource) return;
  statusTooltipSource = null;
  statusTooltipLayer.hidden = true;
  statusTooltipLayer.style.visibility = "hidden";
  statusTooltipLayer.innerHTML = "";
}

function showIntentPortalTooltip(intentElement) {
  if (!intentElement?.classList?.contains("intent") || state.screen !== "game" || state.run?.phase !== "combat") return;
  const enemyCard = intentElement.closest(".enemy-card");
  const uid = Number(enemyCard?.dataset?.id);
  const enemy = state.run.combat?.enemies.find((item) => item.uid === uid);
  if (!enemy || enemy.hp <= 0) return;
  const selected = state.run.combat?.selectedEnemyUid === enemy.uid;
  const move = enemy.nextMove ?? {};
  const threat = enemyThreatProfile(enemy, selected);
  intentTooltipSource = intentElement;
  intentTooltipLayer.className = `intent-portal-tooltip tone-${threat.tone} intent-${move.type ?? "none"}`;
  intentTooltipLayer.innerHTML = `
    <span class="intent-tooltip-icon" aria-hidden="true">${enemyIntentIconLabel(move)}</span>
    <strong>${enemyMoveLabel(move)}</strong>
    <small>${threat.detail}</small>
    <div>
      ${threat.chips
        .map((chip) => {
          const visual = enemyThreatIconVisual(chip);
          return `<i class="${chip.tone}"><b aria-hidden="true">${visual.icon}</b><em>${visual.value}</em><span>${chip.label}</span></i>`;
        })
        .join("")}
    </div>
  `;
  intentTooltipLayer.hidden = false;
  intentTooltipLayer.style.visibility = "hidden";
  positionIntentPortalTooltip();
  if (intentTooltipSource === intentElement) intentTooltipLayer.style.visibility = "visible";
  requestAnimationFrame(() => {
    positionIntentPortalTooltip();
    if (intentTooltipSource === intentElement) intentTooltipLayer.style.visibility = "visible";
  });
}

function hideIntentPortalTooltip(source = null) {
  if (source && intentTooltipSource && source !== intentTooltipSource) return;
  intentTooltipSource = null;
  intentTooltipLayer.hidden = true;
  intentTooltipLayer.style.visibility = "hidden";
  intentTooltipLayer.innerHTML = "";
}

function positionIntentPortalTooltip() {
  if (!intentTooltipSource || intentTooltipLayer.hidden || !document.body.contains(intentTooltipSource)) return;
  const sourceRect = intentTooltipSource.getBoundingClientRect();
  const margin = 10;
  const width = Math.min(304, window.innerWidth - margin * 2);
  intentTooltipLayer.style.width = `${width}px`;
  const height = intentTooltipLayer.offsetHeight || 94;
  let left = sourceRect.left + sourceRect.width / 2 - width / 2;
  let top = sourceRect.top - height - 12;
  if (top < 70) top = sourceRect.bottom + 12;
  left = clamp(left, margin, window.innerWidth - width - margin);
  top = clamp(top, margin, window.innerHeight - height - margin);
  intentTooltipLayer.style.left = `${Math.round(left)}px`;
  intentTooltipLayer.style.top = `${Math.round(top)}px`;
}

function positionStatusPortalTooltip() {
  if (!statusTooltipSource || statusTooltipLayer.hidden) return;
  const sourceRect = statusTooltipSource.getBoundingClientRect();
  const margin = 8;
  const width = Math.min(260, window.innerWidth - margin * 2);
  statusTooltipLayer.style.width = `${width}px`;
  const height = statusTooltipLayer.offsetHeight || 72;
  let left = sourceRect.left + sourceRect.width / 2 - width / 2;
  let top = sourceRect.top - height - 10;
  if (top < margin) top = sourceRect.bottom + 10;
  left = clamp(left, margin, window.innerWidth - width - margin);
  top = clamp(top, margin, window.innerHeight - height - margin);
  statusTooltipLayer.style.left = `${Math.round(left)}px`;
  statusTooltipLayer.style.top = `${Math.round(top)}px`;
}

function suppressCardPortalTooltip(duration = 900) {
  cardTooltipSuppressUntil = Date.now() + duration;
  hideCardPortalTooltip();
  hideStatusPortalTooltip();
  hideIntentPortalTooltip();
}

function showCombatCardPreview(cardElement, targetUid = null, mode = "hover") {
  if (!cardElement?.matches?.("[data-action='play-card']") || state.screen !== "game" || state.run?.phase !== "combat" || !state.run?.combat) return;
  const run = state.run;
  const combat = run.combat;
  const cardUid = Number(cardElement.dataset.id);
  const cardInstance = combat.hand.find((card) => card.uid === cardUid);
  const aliveEnemies = combat.enemies.filter((enemy) => enemy.hp > 0);
  const selected = aliveEnemies.find((enemy) => enemy.uid === (targetUid ?? combat.selectedEnemyUid)) ?? aliveEnemies[0];
  const previewRail = app.querySelector(".combat-card-preview-rail");
  if (!cardInstance || !selected || !previewRail) return;
  if (combatPreviewSource === cardElement && combatPreviewTargetUid === selected.uid && !previewRail.hidden) return;
  clearCombatCardPreview();
  const preview = cardPlayPreview(run, cardInstance, selected.uid);
  const card = effectiveCard(cardInstance);
  const tone = combatPreviewTone(preview, selected);
  const targetUids = combatPreviewTargetUids(preview, aliveEnemies, selected);
  const targetBadge = preview.playable ? combatPreviewTargetBadge(preview, selected, targetUids.length) : combatPreviewEffectBadge(preview, selected, targetUids.length);
  combatPreviewSource = cardElement;
  combatPreviewTargetUid = selected.uid;
  app.querySelector(".combat-board")?.classList.add("preview-active");
  cardElement.classList.add("previewing-card");
  setCombatPreviewAssist(card, preview, selected, aliveEnemies, mode, tone);
  const lethalTargetUids = [];
  for (const enemyUid of targetUids) {
    const enemyCard = app.querySelector(`.enemy-card[data-id="${enemyUid}"]`);
    const enemy = aliveEnemies.find((item) => item.uid === enemyUid);
    const delta = combatPreviewEnemyDelta(preview, enemy ?? selected);
    const lethal = Boolean(delta?.lethal) || Boolean(enemy && !delta && preview.damage >= enemy.hp);
    if (lethal && enemy) lethalTargetUids.push(enemy.uid);
    enemyCard?.classList.add("preview-target", `preview-${tone}`);
    setCombatPreviewHealthProjection(enemyCard, enemy, delta);
    const marker = combatPreviewMarker(preview, enemy ?? selected, targetUids.length, lethal ? "처치 가능" : targetBadge);
    enemyCard?.setAttribute("data-preview-label", marker.label);
    enemyCard?.setAttribute("data-preview-icon", marker.icon);
    enemyCard?.setAttribute("data-preview-value", marker.value);
    enemyCard?.setAttribute("data-preview-text", combatPreviewMarkerText(marker));
    if (lethal) enemyCard?.classList.add("preview-lethal");
  }
  if (!targetUids.length && combatPreviewAffectsSelf(preview)) {
    const playerStand = app.querySelector(".player-stand");
    const selfMarker = combatPreviewMarker(preview, selected, 0, preview.playable ? combatPreviewSelfBadge(preview) : combatPreviewEffectBadge(preview, selected, 0));
    playerStand?.classList.add("preview-self", `preview-${tone}`);
    setCombatPreviewSelfProjection(playerStand, preview);
    playerStand?.setAttribute("data-preview-label", selfMarker.label);
    playerStand?.setAttribute("data-preview-icon", selfMarker.icon);
    playerStand?.setAttribute("data-preview-value", selfMarker.value);
    playerStand?.setAttribute("data-preview-text", combatPreviewMarkerText(selfMarker));
  }
  if (preview.playable && lethalTargetUids.length) {
    setCombatPreviewThreatReduction(app.querySelector(".player-stand"), lethalTargetUids);
  }
  previewRail.className = `combat-card-preview-rail ${tone} preview-${mode}${preview.playable ? "" : " blocked"}`;
  previewRail.setAttribute("aria-label", combatPreviewRailLabel(card, preview, selected, targetUids.length, mode));
  previewRail.innerHTML = renderCombatCardPreviewRail(card, preview, selected, targetUids.length, mode);
  previewRail.hidden = false;
  positionCombatAimLine();
}

function clearCombatCardPreview(source = null) {
  if (source && combatPreviewSource && source !== combatPreviewSource) return;
  combatPreviewSource?.classList.remove("previewing-card");
  combatPreviewSource = null;
  combatPreviewTargetUid = null;
  app.querySelector(".combat-board")?.classList.remove("preview-active");
  hideCombatAimLine();
  app.querySelector(".combat-card-preview-rail")?.replaceChildren();
  const previewRail = app.querySelector(".combat-card-preview-rail");
  if (previewRail) {
    previewRail.hidden = true;
    previewRail.setAttribute("aria-label", "카드 대상 미리보기");
  }
  restoreCombatPreviewAssist();
  app.querySelectorAll(".preview-target, .preview-lethal, .preview-self, .preview-threat-reduced").forEach((element) => {
    element.classList.remove("preview-target", "preview-lethal", "preview-self", "preview-threat-reduced", ...COMBAT_PREVIEW_TONE_CLASSES);
    clearCombatPreviewHealthProjection(element);
    clearCombatPreviewSelfProjection(element);
    element.removeAttribute("data-preview-label");
    element.removeAttribute("data-preview-icon");
    element.removeAttribute("data-preview-value");
    element.removeAttribute("data-preview-text");
  });
}

function combatPreviewEnemyDelta(preview, enemy) {
  if (!preview?.enemyDeltas?.length || !enemy) return null;
  return preview.enemyDeltas.find((delta) => delta.uid === enemy.uid) ?? null;
}

function setCombatPreviewHealthProjection(enemyCard, enemy, delta) {
  if (!enemyCard || !enemy || !delta || delta.damage <= 0) return;
  const maxHp = Math.max(1, enemy.maxHp);
  const beforePct = clamp((delta.hpBefore / maxHp) * 100, 0, 100);
  const afterPct = clamp((delta.hpAfter / maxHp) * 100, 0, 100);
  const resultText = delta.lethal ? "처치" : `-${delta.damage}`;
  enemyCard.style.setProperty("--preview-hp-before", `${beforePct.toFixed(2)}%`);
  enemyCard.style.setProperty("--preview-hp-after", `${afterPct.toFixed(2)}%`);
  enemyCard.style.setProperty("--preview-hp-loss", `${Math.max(0, beforePct - afterPct).toFixed(2)}%`);
  const health = enemyCard.querySelector(".health-bar");
  health?.setAttribute("data-preview-result", resultText);
}

function clearCombatPreviewHealthProjection(element) {
  if (!element) return;
  element.style.removeProperty("--preview-hp-before");
  element.style.removeProperty("--preview-hp-after");
  element.style.removeProperty("--preview-hp-loss");
  const health = element.querySelector?.(".health-bar");
  health?.removeAttribute("data-preview-result");
}

function setCombatPreviewSelfProjection(playerStand, preview) {
  if (!playerStand || !preview?.playable || preview.block <= 0) return;
  const blockReadout = playerStand.querySelector(".block-readout");
  const blockValue = blockReadout?.querySelector("strong");
  const currentBlock = Math.max(0, Number(state.run?.player?.block ?? 0));
  blockReadout?.classList.add("preview-block");
  blockReadout?.setAttribute("data-preview-result", `+${preview.block}`);
  blockValue?.setAttribute("data-preview-after", String(currentBlock + preview.block));
  setCombatPreviewSelfHealthProjection(playerStand, preview, currentBlock);
}

function clearCombatPreviewSelfProjection(element) {
  if (!element) return;
  const blockReadout = element.querySelector?.(".block-readout.preview-block");
  const blockValue = blockReadout?.querySelector("strong");
  blockReadout?.classList.remove("preview-block");
  blockReadout?.removeAttribute("data-preview-result");
  blockValue?.removeAttribute("data-preview-after");
  clearCombatPreviewSelfHealthProjection(element);
}

function setCombatPreviewIncomingHealthProjection(playerStand, forecast, projectedHpLoss, options = {}) {
  const run = state.run;
  if (!playerStand || !run?.combat || run.phase !== "combat") return;
  if ((forecast?.hpLoss ?? 0) <= 0 || projectedHpLoss >= forecast.hpLoss) return;
  const health = playerStand.querySelector(".health-bar.incoming-health-loss");
  if (!health) return;
  const hpAfter = Math.max(0, run.player.hp - projectedHpLoss);
  const prevented = Math.max(0, forecast.hpLoss - projectedHpLoss);
  const maxHp = Math.max(1, run.player.maxHp);
  const hpLossPercent = clamp((Math.min(projectedHpLoss, run.player.hp) / maxHp) * 100, 0, 100);
  const hpAfterPercent = clamp((hpAfter / maxHp) * 100, 0, 100);
  if (!health.dataset.previewBaseHpAfter) {
    health.dataset.previewBaseHpAfter = health.style.getPropertyValue("--incoming-hp-after");
    health.dataset.previewBaseHpLoss = health.style.getPropertyValue("--incoming-hp-loss");
    health.dataset.previewBaseAria = health.getAttribute("aria-label") ?? "";
  }
  health.classList.add("preview-incoming-health");
  health.classList.toggle("preview-safe", projectedHpLoss <= 0);
  health.style.setProperty("--incoming-hp-after", `${hpAfterPercent.toFixed(2)}%`);
  health.style.setProperty("--incoming-hp-loss", `${hpLossPercent.toFixed(2)}%`);
  health.setAttribute("data-preview-incoming-result", projectedHpLoss > 0 ? `-${projectedHpLoss}` : "0");
  health.setAttribute("data-preview-incoming-label", options.label ?? (projectedHpLoss > 0 ? `예상 -${projectedHpLoss}` : "위험 제거"));
  health.setAttribute("data-preview-prevented", `+${prevented}`);
  health.setAttribute(
    "aria-label",
    options.aria ?? `이 카드를 쓰면 턴 종료 시 예상 손실 ${forecast.hpLoss}에서 ${projectedHpLoss}로 줄어듭니다. 남은 체력 ${hpAfter}.`
  );
}

function setCombatPreviewSelfHealthProjection(playerStand, preview, currentBlock = 0) {
  const run = state.run;
  if (!run?.combat || run.phase !== "combat") return;
  const forecast = enemyIntentForecast(run);
  if ((forecast?.hpLoss ?? 0) <= 0 || (forecast?.incomingDamage ?? 0) <= 0) return;
  const projectedBlock = currentBlock + Math.max(0, Number(preview.block ?? 0));
  const projectedHpLoss = Math.max(0, forecast.incomingDamage - projectedBlock);
  setCombatPreviewIncomingHealthProjection(playerStand, forecast, projectedHpLoss, {
    label: projectedHpLoss > 0 ? `방어 후 -${projectedHpLoss}` : "방어 완료",
    aria: `이 카드를 쓰면 턴 종료 시 예상 손실 ${forecast.hpLoss}에서 ${projectedHpLoss}로 줄어듭니다. 남은 체력 ${Math.max(0, run.player.hp - projectedHpLoss)}.`
  });
}

function setCombatPreviewThreatReduction(playerStand, defeatedUids = []) {
  const run = state.run;
  if (!playerStand || !run?.combat || run.phase !== "combat" || !defeatedUids.length) return;
  const forecast = enemyIntentForecast(run);
  if ((forecast?.hpLoss ?? 0) <= 0) return;
  const projectedForecast = enemyIntentForecastAfterDefeat(run, defeatedUids);
  const projectedHpLoss = Math.max(0, projectedForecast.hpLoss ?? 0);
  if (projectedHpLoss >= forecast.hpLoss) return;
  playerStand.classList.add("preview-threat-reduced");
  setCombatPreviewIncomingHealthProjection(playerStand, forecast, projectedHpLoss, {
    label: projectedHpLoss > 0 ? `처치 후 -${projectedHpLoss}` : "위험 제거",
    aria: `이 카드를 쓰면 적을 처치해 턴 종료 시 예상 손실 ${forecast.hpLoss}에서 ${projectedHpLoss}로 줄어듭니다. 남은 체력 ${Math.max(0, run.player.hp - projectedHpLoss)}.`
  });
}

function clearCombatPreviewSelfHealthProjection(element) {
  const health = element.querySelector?.(".health-bar.preview-incoming-health");
  if (!health) return;
  const baseAfter = health.dataset.previewBaseHpAfter ?? "";
  const baseLoss = health.dataset.previewBaseHpLoss ?? "";
  if (baseAfter) health.style.setProperty("--incoming-hp-after", baseAfter);
  else health.style.removeProperty("--incoming-hp-after");
  if (baseLoss) health.style.setProperty("--incoming-hp-loss", baseLoss);
  else health.style.removeProperty("--incoming-hp-loss");
  if (health.dataset.previewBaseAria) health.setAttribute("aria-label", health.dataset.previewBaseAria);
  health.classList.remove("preview-incoming-health", "preview-safe");
  health.removeAttribute("data-preview-incoming-result");
  health.removeAttribute("data-preview-incoming-label");
  health.removeAttribute("data-preview-prevented");
  delete health.dataset.previewBaseHpAfter;
  delete health.dataset.previewBaseHpLoss;
  delete health.dataset.previewBaseAria;
}

function setCombatPreviewAssist(card, preview, selected, aliveEnemies, mode, tone) {
  const assist = app.querySelector(".target-assist");
  if (!assist) return;
  if (!combatPreviewAssistSnapshot) {
    combatPreviewAssistSnapshot = {
      className: assist.className,
      html: assist.innerHTML,
      ariaLabel: assist.getAttribute("aria-label")
    };
  }
  const targetInfo = combatPreviewAssistTargetInfo(preview, selected, aliveEnemies);
  const actionLabel = preview.playable ? (mode === "drag" ? "놓으면 사용" : "미리보기") : "사용 불가";
  const actionDetail = preview.playable ? combatPreviewDetail(preview, selected) : preview.warnings?.[0] ?? "조건을 확인하세요.";
  assist.className = `target-assist combat-action-guide previewing ${tone}${preview.playable ? "" : " blocked"}`;
  assist.setAttribute("aria-label", `카드 미리보기. 적용 대상 ${targetInfo.label}. ${card.name}. ${actionDetail}`);
  assist.innerHTML = `
      <div class="assist-target-lock">
        <span class="assist-label">적용 대상</span>
        <strong>${targetInfo.label}</strong>
        <small>${targetInfo.detail}</small>
      </div>
      <div class="assist-action-lock">
        <span>${actionLabel}</span>
        <b>${card.name}</b>
        <small class="assist-reason">${actionDetail}</small>
      </div>
    `;
}

function combatPreviewAssistTargetInfo(preview, selected, aliveEnemies = []) {
  const targetUids = combatPreviewTargetUids(preview, aliveEnemies, selected);
  if (targetUids.length > 1) {
    return { label: "모든 적", detail: combatPreviewEffectBadge(preview, selected, targetUids.length) };
  }
  if (targetUids.length === 1) {
    return { label: selected?.name ?? "적", detail: combatPreviewEffectBadge(preview, selected, 1) };
  }
  if (combatPreviewAffectsSelf(preview)) {
    return { label: "나", detail: combatPreviewEffectBadge(preview, selected, 0) };
  }
  return { label: selected?.name ?? "대상 없음", detail: "효과 확인" };
}

function restoreCombatPreviewAssist() {
  if (!combatPreviewAssistSnapshot) return;
  const assist = app.querySelector(".target-assist");
  if (assist) {
    assist.className = combatPreviewAssistSnapshot.className;
    assist.innerHTML = combatPreviewAssistSnapshot.html;
    if (combatPreviewAssistSnapshot.ariaLabel) assist.setAttribute("aria-label", combatPreviewAssistSnapshot.ariaLabel);
    else assist.removeAttribute("aria-label");
  }
  combatPreviewAssistSnapshot = null;
}

function positionCombatAimLine() {
  const line = app.querySelector(".combat-aim-line");
  const run = state.run;
  if (!line || !combatPreviewSource || state.screen !== "game" || run?.phase !== "combat" || !document.body.contains(combatPreviewSource)) {
    hideCombatAimLine();
    return;
  }
  const cardUid = Number(combatPreviewSource.dataset.id);
  const cardInstance = run.combat.hand.find((card) => card.uid === cardUid);
  const aliveEnemies = run.combat.enemies.filter((enemy) => enemy.hp > 0);
  const selected = aliveEnemies.find((enemy) => enemy.uid === combatPreviewTargetUid) ?? aliveEnemies.find((enemy) => enemy.uid === run.combat.selectedEnemyUid) ?? aliveEnemies[0];
  if (!cardInstance || !selected) {
    hideCombatAimLine();
    return;
  }
  const preview = cardPlayPreview(run, cardInstance, selected.uid);
  const targetUids = combatPreviewTargetUids(preview, aliveEnemies, selected);
  if (!combatPreviewShouldDrawAimLine(preview, targetUids)) {
    hideCombatAimLine();
    return;
  }
  const target = combatAimTargetElement(preview, targetUids);
  if (!target) {
    hideCombatAimLine();
    return;
  }
  const sourceRect = combatPreviewSource.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const startX = sourceRect.left + sourceRect.width / 2;
  const startY = sourceRect.top + sourceRect.height * 0.22;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height * 0.42;
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 48) {
    hideCombatAimLine();
    return;
  }
  const previewRail = app.querySelector(".combat-card-preview-rail");
  const tone = combatPreviewTone(preview, selected);
  const mode = previewRail?.classList.contains("preview-drag") ? "drag" : "hover";
  line.className = `combat-aim-line ${tone} aim-${mode}${preview.playable ? "" : " blocked"}`;
  line.style.setProperty("--aim-left", `${startX}px`);
  line.style.setProperty("--aim-top", `${startY}px`);
  line.style.setProperty("--aim-width", `${length}px`);
  line.style.setProperty("--aim-angle", `${Math.atan2(dy, dx)}rad`);
  line.hidden = false;
}

function combatPreviewShouldDrawAimLine(preview, targetUids = []) {
  return targetUids.length > 0;
}

function combatAimTargetElement(preview, targetUids) {
  if (targetUids.length > 1) return app.querySelector(".enemy-line");
  if (targetUids.length === 1) return app.querySelector(`.enemy-card[data-id="${targetUids[0]}"]`);
  if (combatPreviewAffectsSelf(preview)) return app.querySelector(".player-stand");
  return null;
}

function combatFxGeometryForCard(uid, targetMode, targetUid = null) {
  const cardSource = app.querySelector(`[data-action="play-card"][data-id="${uid}"]`);
  const playerSource = app.querySelector(".player-stand .character-sprite") ?? app.querySelector(".player-stand");
  const source = targetMode === "enemy" || targetMode === "all-enemies" ? playerSource ?? cardSource : cardSource ?? playerSource;
  const target =
    targetMode === "all-enemies"
      ? app.querySelector(".enemy-line")
      : targetMode === "enemy" && targetUid
        ? app.querySelector(`.enemy-card[data-id="${targetUid}"] .character-sprite`) ?? app.querySelector(`.enemy-card[data-id="${targetUid}"]`)
        : app.querySelector(".player-stand .character-sprite") ?? app.querySelector(".player-stand");
  const sourceOptions = source === playerSource ? { sourceX: 0.68, sourceY: 0.38 } : { sourceY: 0.24 };
  return combatFxGeometryFromElements(source, target, { ...sourceOptions, targetY: targetMode === "self" ? 0.38 : 0.42 });
}

function combatFxGeometryForEnemy(uid, targetMode, targetUid = null) {
  const source = app.querySelector(`.enemy-card[data-id="${uid}"] .character-sprite`) ?? app.querySelector(`.enemy-card[data-id="${uid}"]`);
  const target = targetMode === "self"
    ? app.querySelector(".player-stand .character-sprite") ?? app.querySelector(".player-stand")
    : app.querySelector(`.enemy-card[data-id="${targetUid ?? uid}"] .character-sprite`) ?? app.querySelector(`.enemy-card[data-id="${targetUid ?? uid}"]`);
  return combatFxGeometryFromElements(source, target, { sourceY: 0.42, targetY: 0.4 });
}

function combatFxGeometryFromElements(source, target, options = {}) {
  if (!source || !target) return null;
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (!sourceRect.width || !sourceRect.height || !targetRect.width || !targetRect.height) return null;
  const startX = sourceRect.left + sourceRect.width * (options.sourceX ?? 0.5);
  const startY = sourceRect.top + sourceRect.height * (options.sourceY ?? 0.5);
  const endX = targetRect.left + targetRect.width * (options.targetX ?? 0.5);
  const endY = targetRect.top + targetRect.height * (options.targetY ?? 0.5);
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 24) return null;
  return { startX, startY, endX, endY, distance, angle: Math.atan2(dy, dx) };
}

function roundCssPx(value) {
  return Math.round(Number(value) * 10) / 10;
}

function hideCombatAimLine() {
  const line = app.querySelector(".combat-aim-line");
  if (!line) return;
  line.hidden = true;
  line.removeAttribute("style");
}

function renderCombatCardPreviewRail(card, preview, selected, targetCount, mode = "hover") {
  const chips = cardPreviewChips(preview).filter((chip) => preview.playable || chip.tone !== "warn").slice(0, 2);
  const targetName = combatPreviewTargetName(preview, selected, targetCount);
  const primary = combatPreviewMarker(preview, selected, targetCount);
  const visualChips = chips.length ? chips : [{ label: primary.label, tone: combatPreviewTone(preview, selected) }];
  const actionLabel = mode === "drag" ? "놓으면 사용" : preview.playable ? "사용 가능" : "사용 불가";
  const actionIcon = preview.playable ? (mode === "drag" ? "↓" : "✓") : "!";
  const detail = combatPreviewDetail(preview, selected);
  return `
    <span class="preview-action-symbol" title="${actionLabel}" data-symbol="${actionIcon}" aria-hidden="true"></span>
    <strong class="preview-target-name" title="${targetName}"><i data-symbol="${combatPreviewTargetIcon(targetCount)}" aria-hidden="true"></i><em>${targetName}</em></strong>
    <div class="preview-effect-icons" aria-hidden="true">
      ${visualChips
        .map((chip) => {
          const visual = cardOutcomeVisual(chip);
          return `<i class="${chip.tone}" title="${chip.label}"><em>${cardCompactOutcomeText(chip, visual)}</em></i>`;
        })
        .join("")}
    </div>
    <b class="preview-energy-after" title="사용 후 남은 전하 ${Math.max(0, preview.energyAfter)}" aria-hidden="true"><span class="preview-energy-icon"></span><em>${Math.max(0, preview.energyAfter)}</em></b>
    <span class="sr-only">${card.name}. ${actionLabel}. 대상 ${targetName}. ${detail}. 사용 후 남은 전하 ${Math.max(0, preview.energyAfter)}.</span>
  `;
}

function combatPreviewRailLabel(card, preview, selected, targetCount, mode = "hover") {
  const actionLabel = mode === "drag" ? "놓으면 사용" : preview.playable ? "사용 가능" : "사용 불가";
  return `${card.name}. ${actionLabel}. 대상 ${combatPreviewTargetName(preview, selected, targetCount)}. ${combatPreviewDetail(preview, selected)}. 사용 후 남은 전하 ${Math.max(0, preview.energyAfter)}.`;
}

function cardCompactOutcomeText(chip, visual) {
  const label = String(chip?.label ?? "").trim();
  const value = String(visual?.value ?? cardOutcomeText(chip, visual)).trim();
  const cleanNumber = value.replace(/^[+−-]/, "");
  if (/처치/.test(label)) return "처치";
  if (/피해|체력 -|방어 -/.test(label)) return cleanNumber ? `피해 ${cleanNumber}` : "피해";
  if (/방어/.test(label)) return cleanNumber ? `방어 ${cleanNumber}` : "방어";
  if (/뽑기/.test(label)) return cleanNumber ? `뽑기 ${cleanNumber}` : "뽑기";
  if (/에너지|전하/.test(label)) return cleanNumber ? `전하 ${cleanNumber}` : "전하";
  if (/정화/.test(label)) return cleanNumber ? `정화 ${cleanNumber}` : "정화";
  if (/회복/.test(label)) return cleanNumber ? `회복 ${cleanNumber}` : "회복";
  if (/약화|취약|바이러스|표식|집중|상태/.test(label) || chip?.tone === "status") {
    return label.replace(/^(대상|자신|모든 적)\s+/, "").replace(/\s+/g, " ").trim();
  }
  return value || label || "효과";
}

function combatPreviewTargetName(preview, selected, targetCount = 1) {
  if (targetCount > 1) return `적 ${targetCount}명`;
  if (targetCount === 1) return selected?.name ?? "적";
  if (combatPreviewAffectsSelf(preview)) return "나";
  return selected?.name ?? "대상";
}

function combatPreviewTargetIcon(targetCount = 1) {
  if (targetCount > 1) return "◇";
  if (targetCount === 0) return "⬡";
  return "⌖";
}

function renderBlockReadout(block = 0) {
  const amount = Math.max(0, Number(block ?? 0));
  return `<div class="block-readout ${amount > 0 ? "active" : "empty"}" aria-label="방어 ${amount}"><span aria-hidden="true">⬡</span><strong>${amount}</strong></div>`;
}

function combatPreviewTone(preview, selected) {
  if (!preview.playable) return "warn";
  if (selected && preview.damage >= selected.hp) return "damage";
  if (preview.block > 0 || preview.cleansed > 0 || preview.heal > 0) return "block";
  if (preview.draw > 0 || preview.charge > 0 || preview.energyDelta + preview.cost > 0 || preview.generated > 0) return "resource";
  if (preview.statuses?.length) return "status";
  if (preview.damage > 0 || preview.blockedDamage > 0) return "damage";
  return "steady";
}

function combatPreviewDetail(preview, selected) {
  if (!preview.playable) return preview.warnings?.[0] ?? "에너지 또는 조건을 확인하세요.";
  if (selected && preview.damage >= selected.hp) return `${selected.name} 처치 가능`;
  const parts = [];
  if (preview.damage > 0) parts.push(`피해 ${preview.damage}`);
  else if (preview.blockedDamage > 0) parts.push(`방어 -${preview.blockedDamage}`);
  if (preview.block > 0) parts.push(`방어 +${preview.block}`);
  if (preview.draw > 0) parts.push(`뽑기 +${preview.draw}`);
  if (preview.charge > 0) parts.push(`전하 +${preview.charge}`);
  if (preview.statuses?.length) parts.push(aggregatePreviewStatuses(preview.statuses).slice(0, 2).map((status) => `${status.scopeLabel} ${keywordLabel(status.status)} ${signed(status.amount)}`).join(", "));
  return parts.filter(Boolean).join(" · ") || "카드 효과 확인";
}

function combatPreviewTargetBadge(preview, selected, targetCount = 1) {
  if (!preview.playable) return "사용 불가";
  if (selected && preview.damage >= selected.hp) return "처치 가능";
  return combatPreviewEffectBadge(preview, selected, targetCount);
}

function combatPreviewEffectBadge(preview, selected, targetCount = 1) {
  if (preview.playable && selected && preview.damage >= selected.hp) return "처치 가능";
  const prefix = targetCount > 1 ? "광역 " : "";
  if (preview.damage > 0) return `${prefix}피해 ${preview.damage}`;
  if (preview.blockedDamage > 0) return `${prefix}방어 -${preview.blockedDamage}`;
  if (preview.block > 0) return `방어 +${preview.block}`;
  if (preview.draw > 0) return `뽑기 +${preview.draw}`;
  if (preview.charge > 0) return `전하 +${preview.charge}`;
  if (preview.cleansed > 0) return `정화 ${preview.cleansed}`;
  if (preview.heal > 0) return `회복 +${preview.heal}`;
  const enemyStatus = aggregatePreviewStatuses(preview.statuses).find((status) => status.scope === "enemy" || status.scope === "allEnemies");
  if (enemyStatus) return `${keywordLabel(enemyStatus.status)} ${signed(enemyStatus.amount)}`;
  const selfStatus = aggregatePreviewStatuses(preview.statuses).find((status) => status.scope === "self");
  if (selfStatus) return `${keywordLabel(selfStatus.status)} ${signed(selfStatus.amount)}`;
  if (preview.generated > 0) return `생성 ${preview.generated}장`;
  if (preview.discarded > 0) return `버림 ${preview.discarded}장`;
  if (preview.exhausted > 0) return `소멸 ${preview.exhausted}장`;
  if (preview.upgraded > 0) return `강화 ${preview.upgraded}장`;
  if (preview.discounted > 0) return `비용 감소 ${preview.discounted}장`;
  return "효과 적용";
}

function combatPreviewSelfBadge(preview) {
  if (!preview.playable) return "사용 불가";
  if (preview.block > 0) return `방어 +${preview.block}`;
  if (preview.draw > 0) return `뽑기 +${preview.draw}`;
  if (preview.charge > 0) return `전하 +${preview.charge}`;
  if (preview.cleansed > 0) return `정화 ${preview.cleansed}`;
  if (preview.heal > 0) return `회복 +${preview.heal}`;
  const selfStatus = aggregatePreviewStatuses(preview.statuses).find((status) => status.scope === "self");
  if (selfStatus) return `${keywordLabel(selfStatus.status)} ${signed(selfStatus.amount)}`;
  return "자신에게 적용";
}

function combatPreviewMarker(preview, selected, targetCount = 1, label = "") {
  const readableLabel = label || (targetCount === 0 ? combatPreviewSelfBadge(preview) : combatPreviewTargetBadge(preview, selected, targetCount));
  const tone = combatPreviewTone(preview, selected);
  const lethal = preview.playable && selected && preview.damage >= selected.hp;
  if (lethal) return { label: readableLabel, icon: "✕", value: "" };
  const visual = cardOutcomeVisual({ label: readableLabel, tone });
  if (targetCount > 1 && preview.damage > 0) return { label: readableLabel, icon: "✦", value: `-${preview.damage}` };
  return { label: readableLabel, icon: visual.icon, value: visual.value };
}

function combatPreviewMarkerText(marker) {
  const label = String(marker?.label ?? "").trim();
  if (label) return cardOutcomeText({ label }, { value: marker?.value ?? "" });
  const value = String(marker?.value ?? "").trim();
  return `${marker?.icon ?? ""} ${value}`.trim();
}

function combatPreviewTargetUids(preview, aliveEnemies, selected) {
  const affectsEnemy = preview.damage > 0 || preview.blockedDamage > 0 || preview.statuses?.some((status) => status.scope === "enemy" || status.scope === "allEnemies");
  if (!affectsEnemy) return [];
  if (preview.targetMode === "all" || preview.statuses?.some((status) => status.scope === "allEnemies")) return aliveEnemies.map((enemy) => enemy.uid);
  return selected ? [selected.uid] : [];
}

function combatPreviewAffectsSelf(preview) {
  return preview.block > 0 || preview.draw > 0 || preview.charge > 0 || preview.focus > 0 || preview.energyDelta !== -preview.cost || preview.cleansed > 0 || preview.heal > 0 || preview.statuses?.some((status) => status.scope === "self");
}

function positionCardPortalTooltip() {
  if (!cardTooltipSource || cardTooltipLayer.hidden || !document.body.contains(cardTooltipSource)) return;
  const sourceRect = cardTooltipSource.getBoundingClientRect();
  const margin = 12;
  const isHandCard = Boolean(cardTooltipSource.closest(".hand-zone"));
  const preferredWidth = Math.min(isHandCard ? 292 : 306, window.innerWidth - margin * 2);
  cardTooltipLayer.style.width = `${preferredWidth}px`;
  const layerRect = cardTooltipLayer.getBoundingClientRect();
  const width = layerRect.width || preferredWidth;
  const height = layerRect.height || 160;
  let left = clamp(sourceRect.left + sourceRect.width / 2 - width / 2, margin, window.innerWidth - width - margin);
  const aboveTop = sourceRect.top - height - 14;
  const belowTop = sourceRect.bottom + 14;
  let top = aboveTop >= 76 ? aboveTop : clamp(belowTop, margin, window.innerHeight - height - margin);
  const avoidPanels = cardTooltipSource.closest(".hand-zone")
    ? [...document.querySelectorAll(".combat-play-panel, .target-assist, .combat-card-preview-rail:not([hidden]), .combat-action-recap")]
    : [];
  for (const panel of avoidPanels) {
    const avoidRect = panel.getBoundingClientRect();
    if (!avoidRect.width || !avoidRect.height) continue;
    const tooltipRect = { left, right: left + width, top, bottom: top + height };
    const overlapsPanel =
      tooltipRect.right > avoidRect.left &&
      tooltipRect.left < avoidRect.right &&
      tooltipRect.bottom > avoidRect.top &&
      tooltipRect.top < avoidRect.bottom;
    if (overlapsPanel) {
      top = clamp(avoidRect.top - height - margin, margin, window.innerHeight - height - margin);
    }
  }
  const combatHud = cardTooltipSource.closest(".hand-zone") ? document.querySelector(".combat-hud") : null;
  if (combatHud) {
    const hudRect = combatHud.getBoundingClientRect();
    const tooltipRect = { left, right: left + width, top, bottom: top + height };
    const outsideGuidance = avoidPanels.every((panel) => {
      const panelRect = panel.getBoundingClientRect();
      return tooltipRect.right <= panelRect.left || tooltipRect.left >= panelRect.right;
    });
    const crossesHudX = tooltipRect.right > hudRect.left && tooltipRect.left < hudRect.right;
    if (outsideGuidance && crossesHudX && top < hudRect.bottom + 8) {
      top = clamp(hudRect.bottom + 8, margin, window.innerHeight - height - margin);
    }
  }
  if (isHandCard) {
    const best = bestCombatHandTooltipPosition({ left, top, width, height, sourceRect, margin });
    left = best.left;
    top = best.top;
  }
  cardTooltipLayer.style.left = `${left}px`;
  cardTooltipLayer.style.top = `${top}px`;
}

function bestCombatHandTooltipPosition({ left, top, width, height, sourceRect, margin }) {
  const xCandidates = uniqueTooltipPositions([
    left,
    sourceRect.right + 12,
    sourceRect.left - width - 12,
    margin + 24,
    window.innerWidth * 0.25 - width / 2,
    window.innerWidth * 0.5 - width / 2,
    window.innerWidth * 0.75 - width / 2,
    window.innerWidth - width - margin,
    window.innerWidth - width - 128
  ].map((value) => clamp(value, margin, window.innerWidth - width - margin)));
  const yCandidates = uniqueTooltipPositions([
    top,
    sourceRect.top - height - 14,
    sourceRect.top - height - 48,
    sourceRect.top - height - 84,
    sourceRect.top - height - 128,
    88,
    128,
    176,
    224,
    sourceRect.top - height + 18
  ].map((value) => clamp(value, margin, window.innerHeight - height - margin)));
  const avoidRects = combatTooltipAvoidRects();
  let best = { left, top, score: Infinity };
  for (const candidateLeft of xCandidates) {
    for (const candidateTop of yCandidates) {
      const score = combatTooltipPositionScore(candidateLeft, candidateTop, width, height, sourceRect, avoidRects);
      if (score < best.score) best = { left: candidateLeft, top: candidateTop, score };
    }
  }
  if (combatTooltipStrictOverlapArea(best.left, best.top, width, height, avoidRects) > 0) {
    const fallback = bestCombatHandTooltipFallback(width, height, sourceRect, avoidRects, margin);
    if (fallback) best = fallback;
  }
  return best;
}

function bestCombatHandTooltipFallback(width, height, sourceRect, avoidRects, margin) {
  const xStep = Math.max(96, Math.floor(width / 2));
  const yStep = 44;
  const xPositions = [];
  const yPositions = [];
  for (let x = margin; x <= window.innerWidth - width - margin; x += xStep) xPositions.push(x);
  xPositions.push(window.innerWidth - width - margin);
  for (let y = 82; y <= window.innerHeight - height - margin; y += yStep) yPositions.push(y);
  yPositions.push(margin, window.innerHeight - height - margin);
  let best = null;
  for (const candidateLeft of uniqueTooltipPositions(xPositions.map((value) => clamp(value, margin, window.innerWidth - width - margin)))) {
    for (const candidateTop of uniqueTooltipPositions(yPositions.map((value) => clamp(value, margin, window.innerHeight - height - margin)))) {
      if (combatTooltipStrictOverlapArea(candidateLeft, candidateTop, width, height, avoidRects) > 0) continue;
      const score = combatTooltipPositionScore(candidateLeft, candidateTop, width, height, sourceRect, avoidRects) + 420;
      if (!best || score < best.score) best = { left: candidateLeft, top: candidateTop, score };
    }
  }
  return best;
}

function combatTooltipAvoidRects() {
  return [...document.querySelectorAll(".player-sprite, .player-plate, .enemy-sprite, .enemy-intent-lane, .enemy-card .combatant-plate, .combat-card-preview-rail:not([hidden]), .target-assist, .combat-play-panel, .combat-action-recap, .combat-hud, .end-turn")]
    .map((element) => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const combatant = element.matches(".player-sprite, .player-plate, .enemy-sprite, .enemy-intent-lane, .enemy-card .combatant-plate");
      const guidance = element.matches(".combat-card-preview-rail:not([hidden]), .target-assist, .combat-play-panel, .combat-action-recap");
      return { rect, weight: combatant ? 9 : guidance ? 6 : 3, strict: combatant || guidance };
    })
    .filter(Boolean);
}

function combatTooltipPositionScore(left, top, width, height, sourceRect, avoidRects) {
  const rect = { left, top, right: left + width, bottom: top + height };
  const preferredTop = sourceRect.top - height - 14;
  let score = Math.abs(left + width / 2 - (sourceRect.left + sourceRect.width / 2)) * 0.08 + Math.abs(top - preferredTop) * 0.12;
  for (const item of avoidRects) {
    const overlap = rectOverlapArea(rect, item.rect);
    if (item.strict && overlap > 0) score += 1000000 + overlap * 80;
    score += overlap * item.weight;
  }
  score += rectOverlapArea(rect, sourceRect) * 5;
  if (top < 76) score += 8000;
  return score;
}

function combatTooltipStrictOverlapArea(left, top, width, height, avoidRects) {
  const rect = { left, top, right: left + width, bottom: top + height };
  return avoidRects.reduce((total, item) => total + (item.strict ? rectOverlapArea(rect, item.rect) : 0), 0);
}

function uniqueTooltipPositions(values) {
  return [...new Set(values.map((value) => Math.round(value)))];
}

function rectOverlapArea(a, b) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function setAppHtml(html, resetScroll = true) {
  hideCardPortalTooltip();
  hideStatusPortalTooltip();
  hideIntentPortalTooltip();
  clearCombatCardPreview();
  app.innerHTML = `${html}${renderStartConfirmOverlay()}${renderDeleteSaveConfirmOverlay()}${renderAbandonRunConfirmOverlay()}`;
  focusPendingDialogControl();
  if (resetScroll) {
    resetPageScroll();
  }
}

function activeConfirmationDialog() {
  if (!state.pendingStart && !state.pendingDeleteSave && !state.pendingAbandonRun) return null;
  return app.querySelector(".modal-backdrop [role='dialog']");
}

function activeDeckSelectorDialog() {
  if (!state.run?.selector) return null;
  return app.querySelector(".modal-backdrop .selector-modal[role='dialog']");
}

function activeManagedDialog() {
  return activeConfirmationDialog() ?? activeDeckSelectorDialog();
}

function closePendingConfirmation() {
  if (state.pendingStart) {
    state.pendingStart = null;
    return true;
  }
  if (state.pendingDeleteSave) {
    state.pendingDeleteSave = null;
    return true;
  }
  if (state.pendingAbandonRun) {
    state.pendingAbandonRun = null;
    return true;
  }
  return false;
}

function focusPendingDialogControl() {
  const dialog = activeManagedDialog();
  const target = dialog?.querySelector("[data-dialog-initial-focus]") ?? dialogFocusableControls(dialog)[0];
  target?.focus?.({ preventScroll: true });
}

function trapDialogFocus(event, dialog) {
  const controls = dialogFocusableControls(dialog);
  if (!controls.length) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement;
  const currentIndex = controls.indexOf(active);
  const fallbackIndex = event.shiftKey ? controls.length - 1 : 0;
  const nextIndex =
    currentIndex < 0
      ? fallbackIndex
      : event.shiftKey
        ? (currentIndex - 1 + controls.length) % controls.length
        : (currentIndex + 1) % controls.length;
  event.preventDefault();
  controls[nextIndex]?.focus({ preventScroll: true });
}

function dialogFocusableControls(dialog) {
  if (!dialog) return [];
  return [...dialog.querySelectorAll("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")]
    .filter((element) => element.offsetParent !== null);
}

function resetPageScroll() {
  window.scrollTo(0, 0);
  requestAnimationFrame(() => window.scrollTo(0, 0));
  window.setTimeout(() => window.scrollTo(0, 0), 0);
  window.setTimeout(() => window.scrollTo(0, 0), 120);
}

function renderStartConfirmOverlay() {
  const pending = state.pendingStart;
  if (!pending) return "";
  const savedRun = loadRun();
  const savedPhase = savedRun ? savedRunLine(savedRun) : "저장된 런 없음";
  return `
    <div class="modal-backdrop">
      <section class="deck-modal start-confirm" role="dialog" aria-modal="true" aria-label="새 런 시작 확인">
        <header>
          <div>
            <h2>저장된 런을 덮어쓸까요?</h2>
            <p>선택한 런을 시작하면 현재 브라우저에 저장된 런이 새 런으로 교체됩니다.</p>
          </div>
        </header>
        <dl>
          <div><dt>현재 저장</dt><dd>${savedPhase}</dd></div>
          <div><dt>시작할 런</dt><dd>${pending.label}</dd></div>
          <div><dt>시드</dt><dd>${pending.config?.seed ?? "미기록"}</dd></div>
          <div><dt>저장 시각</dt><dd>${formatSavedAt(savedRun?.updatedAt)}</dd></div>
        </dl>
        <div class="start-confirm-actions">
          <button data-dialog-initial-focus data-action="start-cancel">취소</button>
          ${savedRun ? `<button data-action="continue-run">기존 런 이어하기</button>` : ""}
          <button class="danger" data-action="start-confirmed">덮어쓰고 시작</button>
        </div>
      </section>
    </div>
  `;
}

function renderDeleteSaveConfirmOverlay() {
  const pending = state.pendingDeleteSave;
  if (!pending) return "";
  const savedRun = pending.saved;
  const savedPhase = savedRun ? savedRunLine(savedRun) : "복구 가능한 런 없음";
  const savedState = savedRun
    ? `체력 ${savedRun.player?.hp ?? 0}/${savedRun.player?.maxHp ?? 0} · 크레딧 ${savedRun.player?.gold ?? 0} · 덱 ${savedRun.player?.deck?.length ?? 0}장`
    : pending.notice?.title ?? "저장 슬롯이 손상되었거나 비어 있습니다.";
  return `
    <div class="modal-backdrop">
      <section class="deck-modal start-confirm delete-confirm" role="dialog" aria-modal="true" aria-label="저장 삭제 확인">
        <header>
          <div>
            <h2>저장된 런을 삭제할까요?</h2>
            <p>이 작업은 현재 브라우저의 주 저장과 백업 저장을 모두 지웁니다.</p>
          </div>
        </header>
        <dl>
          <div><dt>현재 저장</dt><dd>${savedPhase}</dd></div>
          <div><dt>상태</dt><dd>${savedState}</dd></div>
          <div><dt>시드</dt><dd>${savedRun?.seed ?? "미기록"}</dd></div>
          <div><dt>저장 시각</dt><dd>${formatSavedAt(savedRun?.updatedAt)}</dd></div>
        </dl>
        <div class="start-confirm-actions">
          <button data-dialog-initial-focus data-action="delete-save-cancel">취소</button>
          <button class="danger" data-action="delete-save-confirmed">삭제 확정</button>
        </div>
      </section>
    </div>
  `;
}

function renderAbandonRunConfirmOverlay() {
  if (!state.pendingAbandonRun || !state.run || state.run.phase === "summary") return "";
  const run = state.run;
  const context = savedRunResumeContext(run);
  const current = currentNodeLabel(run);
  return `
    <div class="modal-backdrop">
      <section class="deck-modal start-confirm abandon-confirm" role="dialog" aria-modal="true" aria-label="런 포기 확인">
        <header>
          <div>
            <h2>이번 런을 포기할까요?</h2>
            <p>탐사를 종료하고 지금까지의 기록을 요약 화면에 남깁니다. 저장된 이어하기는 지워집니다.</p>
          </div>
        </header>
        <dl>
          <div><dt>현재 위치</dt><dd>${current} · ${phaseBriefLabel(run.phase)}</dd></div>
          <div><dt>현재 상태</dt><dd>체력 ${run.player.hp}/${run.player.maxHp} · 크레딧 ${run.player.gold}</dd></div>
          <div><dt>덱/유물</dt><dd>덱 ${run.player.deck.length}장 · 유물 ${run.player.relics.length}개</dd></div>
          <div><dt>주력</dt><dd>${context.deckText}</dd></div>
        </dl>
        <div class="start-confirm-actions">
          <button data-dialog-initial-focus data-action="abandon-run-cancel">계속 탐사</button>
          <button class="danger" data-action="abandon-run-confirmed">런 포기 확정</button>
        </div>
      </section>
    </div>
  `;
}

function renderTitle() {
  const counts = contentCounts();
  const savedRun = loadRun();
  if (saveRecoveryNotice) state.saveNotice = saveRecoveryNotice;
  const daily = dailyRunConfig();
  const selectedDifficulty = GAME_DATA.difficulties.find((difficulty) => difficulty.id === state.selectedDifficulty) ?? GAME_DATA.difficulties[0];
  const selectedProgress = difficultyProgress(selectedDifficulty.id);
  const seedLabel = sanitizeSeed(state.customSeed) || "랜덤";
  const savedLabel = savedRun ? savedRunLine(savedRun) : "저장 없음";
  const startHint = savedRun
    ? "저장된 런을 이어가거나, 새 런으로 다시 시작할 수 있습니다."
    : "선택한 난이도와 시드로 바로 시작합니다.";
  return `
    <main class="title-screen">
      <section class="title-hero">
        <div class="title-copy">
          <div class="brand-mark" aria-hidden="true">
            <img src="./public/assets/deep-signal-mark.png" alt="">
          </div>
          <h1>딥 시그널</h1>
          <p>침수된 데이터 심해로 내려가 카드를 고르고, 위험한 경로를 돌파해 최심부의 왜곡을 잠재우세요.</p>
        </div>
        <section class="title-start-panel" aria-label="런 시작">
          <div class="title-start-copy">
            <small>탐사 준비</small>
            <strong>${selectedDifficulty.name} · ${seedLabel}</strong>
            <span>${startHint}</span>
          </div>
          <div class="title-actions">
            <button class="primary" data-action="new-run">새 런 시작</button>
            <button data-action="daily-run">오늘의 계약</button>
            <button data-action="continue-run" ${savedRun ? "" : "disabled"} title="${savedRun ? "저장된 런으로 돌아갑니다." : "저장된 런이 없습니다."}">이어하기</button>
          </div>
          <div class="title-run-readout" aria-label="현재 시작 설정">
            <span><small>난이도</small><b>${selectedDifficulty.name}</b></span>
            <span><small>시드</small><b>${seedLabel}</b></span>
            <span><small>계약</small><b>${daily.challenge.name}</b></span>
            <span><small>저장</small><b>${savedLabel}</b></span>
          </div>
        </section>
        <nav class="title-secondary-actions" aria-label="보조 메뉴">
          <button data-action="screen" data-id="records">기록</button>
          <button data-action="screen" data-id="codex">코덱스</button>
          <button data-action="screen" data-id="guide">가이드</button>
          <button data-action="screen" data-id="settings">설정</button>
          <button data-action="screen" data-id="about">게임 정보</button>
        </nav>
        ${renderSaveRecoveryNotice()}
        <details class="run-options" aria-label="런 준비 옵션">
          <summary>
            <strong>런 준비</strong>
            <span>시드와 계약, 저장 상태 확인</span>
          </summary>
          <div class="run-options-body">
            <div class="run-setup" aria-label="런 설정">
              <label>
                <span>커스텀 시드</span>
                <input data-seed-input type="text" inputmode="latin" autocomplete="off" maxlength="32" value="${state.customSeed}" placeholder="${daily.seed}" aria-label="런 시드" />
              </label>
              <span>${daily.challenge.date}</span>
            </div>
            ${renderDailyContract(daily.challenge)}
            ${renderContinuePreview(savedRun)}
          </div>
        </details>
      </section>
      <aside class="title-sidebar">
        ${renderCharacterPanel()}
        <section class="difficulty-panel">
          <header class="difficulty-head">
            <h2>난이도 선택</h2>
            <span>${selectedDifficulty.name} · ${selectedDifficulty.text} ${selectedProgress.detail}</span>
          </header>
          <div class="difficulty-list">
            ${GAME_DATA.difficulties
              .map(
                (difficulty) => {
                  const progress = difficultyProgress(difficulty.id);
                  return `
                  <button class="difficulty ${state.selectedDifficulty === difficulty.id ? "selected" : ""} ${progress.tone}" data-action="difficulty" data-id="${difficulty.id}">
                    <strong>${difficulty.name}</strong>
                    ${renderDifficultyProgress(progress, true)}
                  </button>
                `;
                }
              )
              .join("")}
          </div>
          <div class="content-strip" aria-label="콘텐츠 수">
            <span>카드 ${counts.cards}</span>
            <span>유물 ${counts.relics}</span>
            <span>적 ${counts.normalEnemies + counts.eliteEnemies + counts.bosses}</span>
            <span>이벤트 ${counts.events}</span>
          </div>
        </section>
      </aside>
    </main>
  `;
}

function renderSaveRecoveryNotice() {
  const notice = state.saveNotice;
  if (!notice) return "";
  return `
    <section class="save-notice ${notice.tone}" aria-label="저장 복구 알림">
      <div>
        <strong>${notice.title}</strong>
        <span>${notice.detail}</span>
      </div>
      <div class="save-notice-actions">
        <button data-action="dismiss-save-notice">알림 닫기</button>
        ${notice.recovered ? "" : `<button class="danger" data-action="delete-save">손상 저장 삭제</button>`}
      </div>
    </section>
  `;
}

function renderContinuePreview(run) {
  if (!run) return "";
  const difficulty = GAME_DATA.difficulties.find((item) => item.id === run.difficulty);
  const contract = challengeLabel(run.challenge);
  const context = savedRunResumeContext(run);
  return `
    <details class="continue-preview" aria-label="이어하기 미리보기">
      <summary>
        <span>이어하기</span>
        <strong>${context.location}</strong>
        <small>${context.nextAction} · ${formatSavedAt(run.updatedAt)}</small>
      </summary>
      <dl>
        <div><dt>위치</dt><dd>${context.location}</dd></div>
        <div><dt>할 일</dt><dd>${context.nextAction}</dd></div>
        <div><dt>상태</dt><dd>체력 ${run.player?.hp ?? 0}/${run.player?.maxHp ?? 0} · 크레딧 ${run.player?.gold ?? 0}</dd></div>
        <div><dt>덱/유물</dt><dd>${run.player?.deck?.length ?? 0}장 · ${run.player?.relics?.length ?? 0}개</dd></div>
      </dl>
      <div class="continue-context ${context.tone}">
        <strong>${context.title}</strong>
        <span>${context.detail}</span>
      </div>
      <p>${difficulty?.name ?? "표층"} · ${contract || `시드 ${run.seed ?? "미기록"}`}</p>
    </details>
  `;
}

function savedRunLine(run) {
  const context = savedRunResumeContext(run);
  return `${context.location} · ${context.nextAction}`;
}

function savedRunResumeContext(run) {
  const progress = runProgressBrief(run);
  const analysis = deckAnalysis(run);
  const choices = availableNodeLabels(run);
  const current = currentNodeLabel(run);
  const phase = phaseBriefLabel(run.phase);
  const nextAction = savedRunNextAction(run, choices);
  const deckText = analysis.primary.score > 0 ? `${analysis.primary.label} 중심` : "중심 카드 탐색 중";
  const title = run.phase === "map" ? progress.actLabel : `${current} · ${phase}`;
  const detail = run.phase === "map" && choices.length
    ? `${progress.bossText} · ${progress.distanceText}. 다음 경로: ${choices.slice(0, 3).join(" / ")}.`
    : `${progress.bossText} · ${progress.distanceText}. ${progress.nextText}`;
  return {
    phase,
    location: `${Math.max(1, run.stats?.floors ?? 1)}층 · ${phase}`,
    nextAction,
    deckText,
    title,
    detail,
    tone: progress.tone
  };
}

function savedRunNextAction(run, choices = availableNodeLabels(run)) {
  if (run.phase === "map") {
    return choices.length ? `${choices.slice(0, 3).join(" / ")} 중 하나 선택` : "다음 경로 확인";
  }
  return {
    combat: "적 의도 확인 후 카드 사용",
    reward: "보상 선택 또는 받지 않기",
    event: "선택 고르기",
    shop: "구매·제거·회복 정비",
    rest: "회복·강화·제거 선택",
    summary: "결과 확인"
  }[run.phase] ?? "현재 화면 이어가기";
}

function availableNodeLabels(run) {
  const active = new Set(run.availableNodeIds ?? []);
  return [
    ...new Set(
      (run.map?.flat?.() ?? [])
        .filter((node) => active.has(node.id) && !node.completed)
        .map((node) => nodeTypeLabel(node.type))
        .filter(Boolean)
    )
  ];
}

function currentNodeLabel(run) {
  const node = run.currentNodeId ? (run.map?.flat?.() ?? []).find((item) => item.id === run.currentNodeId) : null;
  return node ? `${node.row + 1}층 ${nodeTypeLabel(node.type)}` : `${Math.max(1, run.stats?.floors ?? 1)}층`;
}

function difficultyProgress(difficultyId) {
  const entry = state.records?.difficulties?.[String(difficultyId)];
  if (!entry?.runs) {
    return { tone: "untried", label: "미도전", detail: "아직 기록 없음", entry: null };
  }
  if (entry.wins > 0) {
    return {
      tone: "cleared",
      label: `클리어 ${entry.wins}`,
      detail: `${entry.runs}런 · 최고 ${entry.bestFloor}층`,
      entry
    };
  }
  return {
    tone: "attempted",
    label: `최고 ${entry.bestFloor}층`,
    detail: `${entry.runs}런 · 보스 ${entry.bossesKilled}`,
    entry
  };
}

function renderDifficultyProgress(progress, compact = false) {
  return `
    <small class="difficulty-progress ${progress.tone}">
      <b>${progress.label}</b>
      ${compact ? "" : `<span>${progress.detail}</span>`}
    </small>
  `;
}

function renderDailyContract(challenge) {
  const modifiers = challengeModifiers(challenge);
  if (!modifiers.length) return "";
  const summary = modifiers.map((modifier) => modifier.name).join(" / ");
  return `
    <details class="daily-contract" aria-label="오늘의 계약 조항">
      <summary>
        <strong>오늘의 계약</strong>
        <span>${challenge.date} · ${summary}</span>
      </summary>
      <div>
        ${modifiers
          .map(
            (modifier) => `
              <article class="${modifier.tone}" title="${modifier.text}">
                <b>${modifier.name}</b>
                <span>${modifier.text}</span>
              </article>
            `
          )
          .join("")}
      </div>
    </details>
  `;
}

function challengeModifiers(challenge) {
  return (challenge?.modifiers ?? []).map((id) => GAME_DATA.challengeModifiers.find((modifier) => modifier.id === id)).filter(Boolean);
}

function challengeLabel(challenge) {
  if (!challenge?.name) return "";
  const names = challengeModifiers(challenge).map((modifier) => modifier.name);
  return names.length ? `${challenge.name}: ${names.join(", ")}` : challenge.name;
}

function renderCharacterPanel() {
  const character = GAME_DATA.character;
  const selectedDifficulty = GAME_DATA.difficulties.find((difficulty) => difficulty.id === state.selectedDifficulty) ?? GAME_DATA.difficulties[0];
  const maxHp = Math.max(40, character.maxHp + selectedDifficulty.playerMaxHp);
  const deckSummary = starterDeckSummary(character.starterDeck);
  const starterRelic = RELIC_BY_ID[character.starterRelic];
  return `
    <section class="character-panel" aria-label="선택한 캐릭터">
      <div class="character-core">
        <div class="diver-emblem" aria-hidden="true">
          <img src="./public/assets/echo-diver-emblem.png" alt="">
        </div>
        <header>
          <span>플레이어</span>
          <h2>${character.name}</h2>
          <p>${character.title}</p>
        </header>
      </div>
      <div class="character-mechanic-chips" aria-label="주요 키워드">
        ${(character.mechanics ?? []).map((mechanic) => `<span>${mechanic.split(":")[0]}</span>`).join("")}
      </div>
      <dl class="character-stats">
        <div><dt>체력</dt><dd>${maxHp}</dd></div>
        <div><dt>에너지</dt><dd>${character.energy}</dd></div>
        <div><dt>크레딧</dt><dd>${character.gold}</dd></div>
        <div><dt>덱</dt><dd>${character.starterDeck.length}</dd></div>
      </dl>
      <div class="starter-relic">
        <span>시작 유물</span>
        <div class="starter-relic-row">
          ${renderRelic(character.starterRelic)}
          <strong>${starterRelic?.name ?? character.starterRelic}</strong>
          <small>${starterRelic?.text ?? ""}</small>
        </div>
      </div>
      <details class="character-extra">
        <summary>주력 전략 · 시작 덱</summary>
        <div class="mechanic-list">
          ${(character.mechanics ?? []).map((mechanic) => `<p>${mechanic}</p>`).join("")}
        </div>
        <div class="starter-deck-preview" aria-label="시작 덱 구성">
          <strong>시작 덱</strong>
          ${deckSummary.map((entry) => `<span>${entry.name} x${entry.count}</span>`).join("")}
        </div>
      </details>
    </section>
  `;
}

function starterDeckSummary(deck) {
  const counts = new Map();
  for (const cardId of deck) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  return [...counts].map(([cardId, count]) => ({
    name: GAME_DATA.cards.find((card) => card.id === cardId)?.name ?? cardId,
    count
  }));
}

function renderGame(run) {
  const victoryCoda = activeCombatVictoryCoda(run);
  const displayPhase = victoryCoda ? "combat-victory" : run.phase;
  const compactPhase = ["combat", "combat-victory", "reward", "map", "event", "shop", "rest"].includes(displayPhase);
  return `
    <main class="game-screen phase-${displayPhase}">
      ${victoryCoda ? "" : renderTopBar(run)}
      ${victoryCoda ? "" : renderPhaseTransition(run)}
      ${run.phase === "summary" || compactPhase ? "" : renderRunBriefing(run)}
      ${run.phase === "summary" || compactPhase ? "" : renderTacticalAdvisor(run)}
      ${victoryCoda ? "" : renderRelicPulse(run)}
      ${victoryCoda ? "" : renderChoicePulse(run)}
      ${victoryCoda ? renderCombatVictoryCoda(victoryCoda, run) : renderPhase(run)}
      ${run.phase === "summary" || victoryCoda ? "" : renderLog(run)}
      ${run.selector ? renderDeckSelector(run) : ""}
      ${state.deckOpen ? renderDeckOverlay(run) : ""}
      ${state.pileOpen ? renderCombatPileInspector(run) : ""}
      ${state.relicOpen ? renderRelicInspector(run) : ""}
    </main>
  `;
}

function renderRunBriefing(run) {
  const brief = runProgressBrief(run);
  const contract = challengeLabel(run.challenge);
  return `
    <section class="run-briefing ${brief.tone}" aria-label="런 진행 브리핑">
      <div class="briefing-copy">
        <span>${brief.actLabel}</span>
        <strong>${brief.title}</strong>
        <small>${brief.detail}</small>
      </div>
      <div class="act-meter" aria-label="${brief.actLabel} 진행도 ${brief.progress}%">
        <span style="width:${brief.progress}%"></span>
      </div>
      <div class="briefing-tags">
        <span>${brief.bossText}</span>
        <span>${brief.distanceText}</span>
        <span>${brief.nextText}</span>
        ${contract ? `<span>${contract}</span>` : ""}
      </div>
      ${brief.readiness ? renderBossReadiness(brief.readiness) : ""}
    </section>
  `;
}

function renderBossReadiness(readiness) {
  return `
    <div class="boss-readiness ${readiness.tone}" aria-label="보스 대비 점검">
      <div class="boss-readiness-copy">
        <span>보스 대비</span>
        <strong>${readiness.title}</strong>
        <small>${readiness.detail}</small>
      </div>
      <div class="boss-readiness-list">
        ${readiness.metrics
          .map(
            (metric) => `
              <span class="${metric.tone}">
                <b>${metric.label}</b>
                <small>${metric.value}</small>
              </span>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderTacticalAdvisor(run) {
  if (state.settings.tacticalAdvisor === false || run.phase === "summary") return "";
  const advice = tacticalAdvisor(run);
  return `
    <section class="tactical-advisor ${advice.tone}" aria-label="플레이 힌트">
      <div class="advisor-copy">
        <span>플레이 힌트</span>
        <strong>${advice.title}</strong>
        <small>${advice.detail}</small>
      </div>
      <div class="advisor-chips">
        ${advice.chips.map((chip) => `<span class="${chip.tone ?? "steady"}">${chip.text}</span>`).join("")}
      </div>
    </section>
  `;
}

function tacticalAdvisor(run) {
  if (run.phase === "combat") return combatAdvisor(run);
  if (run.phase === "reward") return rewardAdvisor(run);
  if (run.phase === "event") return eventAdvisor(run);
  if (run.phase === "shop") return shopAdvisor(run);
  if (run.phase === "rest") return restAdvisor(run);
  return mapAdvisor(run);
}

function mapAdvisor(run) {
  const active = new Set(run.availableNodeIds);
  const choices = run.map.flat().filter((node) => active.has(node.id) && !node.completed);
  const analysis = deckAnalysis(run);
  const hpRatio = run.player.hp / Math.max(1, run.player.maxHp);
  const rest = choices.find((node) => node.type === "rest");
  const shop = choices.find((node) => node.type === "shop");
  const elite = choices.find((node) => node.type === "elite");
  const combat = choices.find((node) => node.type === "combat");
  const event = choices.find((node) => node.type === "event");
  const prices = shopServicePrices(run);
  const saferPick =
    (rest && hpRatio <= 0.64 ? rest : null) ??
    (shop && (hpRatio <= 0.58 || run.player.gold >= Math.min(prices.heal, prices.remove)) ? shop : null) ??
    combat ??
    event ??
    rest ??
    shop ??
    choices.find((node) => node.type !== "elite") ??
    choices[0];
  const eliteStatus = elite ? eliteReadiness(run, elite) : null;
  let pick = saferPick;
  let title = "보상과 위험 비교";
  let detail = "체력, 크레딧, 덱 상태를 보고 지금 가장 필요한 보상을 고르세요.";
  let tone = "steady";

  if (hpRatio <= 0.42 && rest) {
    pick = rest;
    title = "세이프룸에서 회복";
    detail = `체력 ${run.player.hp}/${run.player.maxHp}. 살아남는 선택이 먼저입니다.`;
    tone = "guarded";
  } else if (run.player.gold >= prices.remove && shop && (analysis.curses > 0 || analysis.total >= 20)) {
    pick = shop;
    title = "상점에서 카드 제거";
    detail = `크레딧 ${run.player.gold}. 제거 비용 ${prices.remove}으로 덱을 가볍게 만들 수 있습니다.`;
    tone = "strong";
  } else if (elite && eliteStatus?.tone === "strong") {
    pick = elite;
    title = "엘리트에 도전할 만함";
    detail = `${eliteStatus.shortDetail ?? eliteStatus.detail} 유물 보상을 노려볼 만합니다.`;
    tone = "pressure";
  } else if (elite && eliteStatus) {
    pick = saferPick;
    title = eliteStatus.label;
    detail = `${eliteStatus.shortDetail ?? eliteStatus.detail} 전투, 상점, 세이프룸 중 안전한 쪽을 먼저 보세요.`;
    tone = eliteStatus.tone === "danger" ? "guarded" : "warning";
  } else if (analysis.primary.score < 4 && (combat || event)) {
    pick = combat ?? event;
    title = "주력 먼저 정하기";
    detail = "전하, 표식, 바이러스, 반격 중 지금 덱과 이어지는 카드를 우선하세요.";
    tone = "steady";
  } else if (shop && run.player.gold >= prices.heal && hpRatio <= 0.58) {
    pick = shop;
    title = "상점 회복과 저가 구매";
    detail = `체력이 낮고 크레딧 ${run.player.gold}가 있습니다. 회복 후 싼 카드나 유물을 보세요.`;
    tone = "guarded";
  }

  return {
    tone,
    title,
    detail,
    recommendedNodeId: pick?.id ?? null,
    chips: [
      { tone: "strong", text: pick ? `${nodeTypeLabel(pick.type)} 추천` : "경로 선택" },
      { tone: hpRatio <= 0.42 ? "danger" : hpRatio <= 0.6 ? "guarded" : "steady", text: `체력 ${Math.round(hpRatio * 100)}%` },
      { tone: analysis.primary.score >= 5 ? "strong" : "steady", text: `${analysis.primary.label} ${analysis.primary.score}` },
      { tone: "steady", text: `선택지 ${choices.length}` }
    ]
  };
}

function combatAdvisor(run) {
  const combat = run.combat;
  const plan = combatTurnPlan(run);
  const forecast = enemyIntentForecast(run);
  const aliveEnemies = combat.enemies.filter((enemy) => enemy.hp > 0);
  const selected = aliveEnemies.find((enemy) => enemy.uid === combat.selectedEnemyUid) ?? aliveEnemies[0];
  const playableCount = combat.hand.filter((card) => cardCost(card, combat) <= combat.energy).length;
  const incomingStatusText = forecast.incomingStatuses.length
    ? forecast.incomingStatuses.map((item) => `${STATUS_LABELS[item.status] ?? item.status} ${item.amount}`).join(" / ")
    : "해로운 상태 없음";
  const finisherReserve = finalBossFinisherReserveCue(run);

  if (plan.tone === "danger") {
    return {
      tone: "danger",
      title: plan.survival.title,
      detail: "방어, 약화, 처치 중 하나로 이번 턴 손실을 줄이세요.",
      chips: combatAdvisorChips(forecast, playableCount, selected, incomingStatusText)
    };
  }
  if (finisherReserve && forecast.hpLoss <= 0) {
    return {
      tone: finisherReserve.tone,
      title: finisherReserve.title,
      detail: finisherReserve.detail,
      chips: [...finisherReserve.chips, ...combatAdvisorChips(forecast, playableCount, selected, incomingStatusText)].slice(0, 4)
    };
  }
  if (plan.pressure.title.includes("처치 가능")) {
    return {
      tone: "pressure",
      title: "처치로 피해 줄이기",
      detail: "한 적을 쓰러뜨리면 이번 턴과 다음 턴이 함께 편해집니다.",
      chips: combatAdvisorChips(forecast, playableCount, selected, incomingStatusText)
    };
  }
  if (forecast.hpLoss > 0) {
    return {
      tone: "guarded",
      title: "방어 먼저",
      detail: "막은 뒤 남는 에너지는 표식, 바이러스, 전하처럼 남는 효과에 쓰세요.",
      chips: combatAdvisorChips(forecast, playableCount, selected, incomingStatusText)
    };
  }
  if (forecast.summons || forecast.enemyBuffs.length || forecast.enemyBlock > 0) {
    return {
      tone: "warning",
      title: "강화하는 적 먼저 보기",
      detail: "공격이 약한 턴입니다. 소환, 방어, 버프를 쌓는 적부터 끊어두세요.",
      chips: combatAdvisorChips(forecast, playableCount, selected, incomingStatusText)
    };
  }
  return {
    tone: "steady",
    title: "뽑고, 쓰고, 남기지 않기",
    detail: "드로우나 에너지 회복 카드를 먼저 쓰고 남은 에너지로 선택한 적을 공격하세요.",
    chips: combatAdvisorChips(forecast, playableCount, selected, incomingStatusText)
  };
}

function combatAdvisorChips(forecast, playableCount, selected, incomingStatusText) {
  return [
    { tone: forecast.hpLoss > 0 ? "danger" : forecast.incomingDamage > 0 ? "guarded" : "steady", text: `예고 ${forecast.incomingDamage} · 체력 -${forecast.hpLoss}` },
    { tone: playableCount ? "strong" : "danger", text: `사용 가능 ${playableCount}장` },
    { tone: selected ? "pressure" : "steady", text: selected ? `대상 ${selected.name}` : "대상 없음" },
    { tone: forecast.incomingStatuses.length ? "warning" : "steady", text: incomingStatusText }
  ];
}

function rewardAdvisor(run) {
  const analysis = deckAnalysis(run);
  const relicChoices = rewardRelicChoices(run.reward);
  const cardReady = Boolean(run.reward.selectedCardId || run.reward.cardSkipped);
  const relicReady = !relicChoices.length || Boolean(run.reward.selectedRelicId);
  const skip = skipRewardInsight(run);
  if (!cardReady) {
    return {
      tone: analysis.primary.score >= 5 ? "strong" : "steady",
      title: analysis.primary.score >= 5 ? `${analysis.primary.label} 보강하기` : "보상으로 핵심 카드 찾기",
      detail: skip.detail,
      chips: [
        { tone: skip.tone, text: skip.label },
        { tone: "steady", text: `덱 ${analysis.total}장` },
        { tone: analysis.curses > 0 ? "warning" : "steady", text: `저주 ${analysis.curses}` },
        { tone: relicChoices.length ? "relic" : "steady", text: relicChoices.length ? "유물 선택 포함" : "카드 보상만" }
      ]
    };
  }
  if (!relicReady) {
    return {
      tone: "relic",
      title: "유물로 규칙을 바꿀 차례",
      detail: "카드 선택은 정해졌습니다. 현재 덱 키워드와 발동 시점이 맞는 유물을 고르면 다음 전투 방식이 달라집니다.",
      chips: [
        { tone: "strong", text: "카드 결정됨" },
        { tone: "relic", text: `유물 ${relicChoices.length}택` },
        { tone: "steady", text: analysis.primary.label },
        { tone: "steady", text: `덱 ${analysis.total}장` }
      ]
    };
  }
  return {
    tone: "strong",
    title: "선택 완료",
    detail: "맵으로 돌아가 다음 보상과 위험을 다시 비교할 수 있습니다.",
    chips: [
      { tone: "strong", text: "카드 준비" },
      { tone: "relic", text: relicChoices.length ? "유물 준비" : "유물 없음" },
      { tone: "steady", text: analysis.primary.label }
    ]
  };
}

function eventAdvisor(run) {
  const eventDefinition = EVENT_BY_ID[run.event.eventId];
  const previews = eventDefinition.choices.map((choice) => eventChoicePreview(run, choice));
  const available = previews.filter((preview) => !preview.blocked);
  const risky = available.filter((preview) => preview.tone === "risky" || preview.tone === "lethal").length;
  const rewarding = available.filter((preview) => preview.tone === "rewarding").length;
  return {
    tone: risky && run.player.hp <= Math.ceil(run.player.maxHp * 0.45) ? "danger" : rewarding ? "strong" : "steady",
    title: rewarding ? "보상 선택지를 먼저 비교" : "이벤트 비용 확인",
    detail: risky
      ? `현재 체력 ${run.player.hp}/${run.player.maxHp}입니다. 체력 비용 선택지는 다음 전투까지 감당 가능한지 먼저 따져야 합니다.`
      : "크레딧, 카드, 유물, 강화가 지금 핵심 카드에 실제로 보탬이 되는지 먼저 보세요.",
    chips: [
      { tone: "steady", text: `선택지 ${eventDefinition.choices.length}` },
      { tone: rewarding ? "strong" : "steady", text: `보상형 ${rewarding}` },
      { tone: risky ? "warning" : "steady", text: `위험형 ${risky}` },
      { tone: run.player.hp <= Math.ceil(run.player.maxHp * 0.45) ? "danger" : "steady", text: `체력 ${run.player.hp}` }
    ]
  };
}

function eventRecommendedChoice(run, previews) {
  let best = { index: -1, score: -Infinity };
  previews.forEach((preview, index) => {
    if (preview.blocked || preview.tone === "lethal") return;
    let score = preview.tone === "rewarding" ? 40 : preview.tone === "steady" ? 18 : 8;
    for (const chip of preview.chips) {
      if (chip.tone === "gain" || chip.tone === "relic" || chip.tone === "card" || chip.tone === "deck") score += 12;
      if (chip.tone === "cost") score -= run.player.hp <= Math.ceil(run.player.maxHp * 0.45) ? 14 : 6;
      if (chip.tone === "danger") score -= 50;
      if (/체력 \+/.test(chip.text) && run.player.hp <= Math.ceil(run.player.maxHp * 0.6)) score += 14;
      if (/저주/.test(chip.text)) score -= 16;
    }
    if (score > best.score) best = { index, score };
  });
  return best.index;
}

function shopAdvisor(run) {
  const prices = shopServicePrices(run);
  const analysis = deckAnalysis(run);
  const missingHp = run.player.maxHp - run.player.hp;
  const canRemove = run.player.gold >= prices.remove && run.player.deck.length > 1;
  const canHeal = run.player.gold >= prices.heal && missingHp > 0;
  const canUpgrade = run.player.gold >= prices.upgrade && hasUpgradeableCards(run);
  const bossPrep = bossPreparationServiceAdvice(run, { canHeal, canRemove, canUpgrade, analysis });
  if (bossPrep) {
    return {
      tone: bossPrep.tone,
      title: bossPrep.title,
      detail: bossPrep.detail,
      recommendedService: bossPrep.service,
      chips: shopAdvisorChips(run, prices, analysis, bossPrep)
    };
  }
  if (canRemove && (analysis.curses > 0 || analysis.total >= 22)) {
    return {
      tone: "strong",
      title: "덱을 줄일 타이밍",
      detail: `덱 ${analysis.total}장, 저주 ${analysis.curses}장. 불필요한 카드를 빼면 핵심 카드가 더 빨리 옵니다.`,
      recommendedService: "remove",
      chips: shopAdvisorChips(run, prices, analysis)
    };
  }
  if (canHeal && missingHp >= 22) {
    return {
      tone: "guarded",
      title: "체력 먼저 회복",
      detail: `현재 체력 ${run.player.hp}/${run.player.maxHp}. 회복 뒤 남는 크레딧만 쓰는 편이 안전합니다.`,
      recommendedService: "heal",
      chips: shopAdvisorChips(run, prices, analysis)
    };
  }
  if (canUpgrade && analysis.primary.score >= 4) {
    return {
      tone: "strong",
      title: "강화 효율 좋음",
      detail: `${analysis.primary.label} 카드가 보입니다. 카드를 늘리지 않고 힘을 올릴 수 있습니다.`,
      recommendedService: "upgrade",
      chips: shopAdvisorChips(run, prices, analysis)
    };
  }
  return {
    tone: "steady",
    title: "필요한 것만 구매",
    detail: "카드와 유물은 현재 덱에 맞을 때만 사고, 제거와 회복 비용을 남길지 같이 보세요.",
    recommendedService: null,
    chips: shopAdvisorChips(run, prices, analysis)
  };
}

function bossPreparationServiceAdvice(run, options = {}) {
  const progress = runProgressBrief(run);
  const readiness = progress.readiness;
  const missing = bossReadinessMissing(readiness);
  if (!readiness || !missing.length) return null;
  const closeEnough = progress.distanceText === "보스층" || /보스까지 [012]층/.test(progress.distanceText);
  if (!closeEnough) return null;
  const bossName = readiness.title.split("까지")[0].replace(" 전투 중", "");
  const missingText = missing.slice(0, 3).join(", ");
  const needsHp = missing.includes("체력");
  const needsDeckSpeed = missing.includes("카드 뽑기") || options.analysis?.total >= 25;
  const needsRole = missing.some((label) => ["방어", "큰 방어", "연속 방어", "마무리", "정화·약화"].includes(label));
  if (needsHp && options.canHeal) {
    return {
      tone: "guarded",
      title: "보스 전 체력 확보",
      detail: `${bossName} 전입니다. 부족: ${missingText}. 회복을 먼저 하고 남은 크레딧을 쓰세요.`,
      service: "heal",
      missing
    };
  }
  if (needsDeckSpeed && options.canRemove && !needsHp) {
    return {
      tone: "strong",
      title: "핵심 카드 더 자주 보기",
      detail: `${bossName} 전입니다. 부족: ${missingText}. 제거로 손패를 가볍게 만들면 필요한 카드가 빨리 옵니다.`,
      service: "remove",
      missing
    };
  }
  if (needsRole && options.canUpgrade) {
    return {
      tone: "strong",
      title: "보스용 카드 강화",
      detail: `${bossName} 전입니다. 부족: ${missingText}. 카드를 늘리기보다 자주 쓰는 방어, 정화, 마무리 카드를 키우세요.`,
      service: "upgrade",
      missing
    };
  }
  return {
    tone: "warning",
    title: "보스 준비 점검",
    detail: `${bossName} 전입니다. 부족: ${missingText}. 구매 전에 회복, 제거, 강화 비용을 남길지 먼저 보세요.`,
    service: null,
    missing
  };
}

function shopAdvisorChips(run, prices, analysis, bossPrep = null) {
  const chips = [
    { tone: run.player.gold >= prices.remove ? "strong" : "steady", text: `크레딧 ${run.player.gold}` },
    { tone: "steady", text: `제거 ${prices.remove}` },
    { tone: "steady", text: `강화 ${prices.upgrade}` },
    { tone: analysis.primary.score >= 5 ? "strong" : "steady", text: analysis.primary.label }
  ];
  if (!bossPrep?.missing?.length) return chips;
  return [
    { tone: bossPrep.tone, text: `부족 ${bossPrep.missing.slice(0, 2).join(" · ")}` },
    ...chips.slice(0, 3)
  ];
}

function restAdvisor(run) {
  const healAmount = restHealAmount(run);
  const missingHp = run.player.maxHp - run.player.hp;
  const analysis = deckAnalysis(run);
  const canUpgrade = hasUpgradeableCards(run);
  const canRemove = run.player.hp > 5 && run.player.deck.length > 1;
  const bossPrep = bossPreparationRestAdvice(run, { healAmount, analysis, canUpgrade, canRemove });
  if (bossPrep) {
    return {
      tone: bossPrep.tone,
      title: bossPrep.title,
      detail: bossPrep.detail,
      recommendedRest: bossPrep.rest,
      chips: restAdvisorChips(run, healAmount, analysis, canUpgrade, bossPrep)
    };
  }
  if (missingHp >= healAmount || run.player.hp <= Math.ceil(run.player.maxHp * 0.45)) {
    const hpAfter = Math.min(run.player.maxHp, run.player.hp + healAmount);
    return {
      tone: "guarded",
      title: "체력 먼저 회복",
      detail: `체력 +${hpAfter - run.player.hp} · ${hpAfter}/${run.player.maxHp}. 위험한 경로 앞에서는 회복이 가장 확실합니다.`,
      recommendedRest: "heal",
      chips: restAdvisorChips(run, healAmount, analysis, canUpgrade)
    };
  }
  if ((analysis.curses > 0 || analysis.total >= 24) && run.player.hp > 5) {
    return {
      tone: "strong",
      title: "덱 줄이기 좋음",
      detail: `덱 ${analysis.total}장, 저주 ${analysis.curses}장. 체력 5를 내도 다음 손패가 좋아질 수 있습니다.`,
      recommendedRest: "remove",
      chips: restAdvisorChips(run, healAmount, analysis, canUpgrade)
    };
  }
  if (canUpgrade) {
    return {
      tone: "strong",
      title: "카드 강화 추천",
      detail: "체력이 버틸 만합니다. 자주 쓰는 공격, 방어, 전하/바이러스 카드를 키우세요.",
      recommendedRest: "upgrade",
      chips: restAdvisorChips(run, healAmount, analysis, canUpgrade)
    };
  }
  return {
    tone: "steady",
    title: "필요한 것 고르기",
    detail: "강화할 카드가 없다면 회복과 카드 제거 중 다음 경로에 더 필요한 쪽을 고르세요.",
    recommendedRest: null,
    chips: restAdvisorChips(run, healAmount, analysis, canUpgrade)
  };
}

function bossPreparationRestAdvice(run, options = {}) {
  const progress = runProgressBrief(run);
  const readiness = progress.readiness;
  const missing = bossReadinessMissing(readiness);
  if (!readiness || !missing.length || !/보스까지 [01]층|보스층/.test(progress.distanceText)) return null;
  const bossName = readiness.title.split("까지")[0].replace(" 전투 중", "");
  const missingText = missing.slice(0, 3).join(", ");
  const hpAfter = Math.min(run.player.maxHp, run.player.hp + options.healAmount);
  if (missing.includes("체력")) {
    return {
      tone: "guarded",
      title: "보스 전 회복",
      detail: `${bossName} 전입니다. 부족: ${missingText}. 체력을 ${hpAfter}/${run.player.maxHp}까지 올리고 들어가세요.`,
      rest: "heal",
      missing
    };
  }
  if (missing.some((label) => ["방어", "큰 방어", "연속 방어", "마무리", "정화·약화"].includes(label)) && options.canUpgrade) {
    return {
      tone: "strong",
      title: "보스용 카드 강화",
      detail: `${bossName} 전입니다. 부족: ${missingText}. 새 카드를 늘리기보다 이미 쓰는 핵심 카드를 키우세요.`,
      rest: "upgrade",
      missing
    };
  }
  if ((missing.includes("카드 뽑기") || options.analysis?.total >= 26) && options.canRemove && run.player.hp > Math.ceil(run.player.maxHp * 0.55)) {
    return {
      tone: "strong",
      title: "덱을 가볍게 만들기",
      detail: `${bossName} 전입니다. 부족: ${missingText}. 체력 5를 내도 핵심 카드를 더 자주 볼 수 있습니다.`,
      rest: "remove",
      missing
    };
  }
  return {
    tone: "warning",
    title: "보스 준비 점검",
    detail: `${bossName} 전입니다. 부족: ${missingText}. 회복과 강화 중 더 급한 쪽을 고르세요.`,
    rest: null,
    missing
  };
}

function restAdvisorChips(run, healAmount, analysis, canUpgrade, bossPrep = null) {
  const chips = [
    { tone: "guarded", text: `회복 +${healAmount}` },
    { tone: canUpgrade ? "strong" : "warning", text: canUpgrade ? "강화 후보 있음" : "강화 후보 없음" },
    { tone: analysis.total >= 24 || analysis.curses > 0 ? "strong" : "steady", text: `덱 ${analysis.total}장` },
    { tone: run.player.hp > 5 ? "steady" : "danger", text: "제거 비용 체력 5" }
  ];
  if (!bossPrep?.missing?.length) return chips;
  return [
    { tone: bossPrep.tone, text: `부족 ${bossPrep.missing.slice(0, 2).join(" · ")}` },
    ...chips.slice(0, 3)
  ];
}

function renderTopBar(run) {
  const difficulty = GAME_DATA.difficulties.find((item) => item.id === run.difficulty);
  const activeRelics = new Set(recentRelicTriggers(run).map((trigger) => trigger.relicId));
  return `
    <header class="top-bar">
      <button class="brand-button" data-action="back-title" title="시작 화면">딥 시그널</button>
      <div class="hud-stat"><span>체력</span><strong>${run.player.hp}/${run.player.maxHp}</strong></div>
      <div class="hud-stat"><span>크레딧</span><strong>${run.player.gold}</strong></div>
      <div class="hud-stat"><span>층</span><strong>${Math.max(1, run.stats.floors)}</strong></div>
      <div class="hud-stat"><span>난이도</span><strong>${difficulty?.name ?? "표층"}</strong></div>
      ${renderTopObjective(run)}
      ${renderTopRouteCompass(run)}
      <div class="save-status" aria-label="자동 저장 상태"><span>자동 저장</span><strong>${formatSavedAt(run.updatedAt)}</strong></div>
      <button class="relic-row relic-row-button" data-action="open-relics" aria-label="유물 ${run.player.relics.length}개 상세 보기" title="유물 상세 보기">
        ${run.player.relics.map((id) => renderRelic(id, false, activeRelics.has(id), run)).join("")}
      </button>
      <button class="icon-button deck-toggle-button" data-action="toggle-deck" data-count="${run.player.deck.length}" title="덱 보기">덱 ${run.player.deck.length}</button>
      <button class="icon-button" data-action="screen" data-id="codex" title="코덱스">코덱스</button>
      <button class="icon-button" data-action="screen" data-id="guide" title="가이드">가이드</button>
      <button class="icon-button" data-action="screen" data-id="settings" title="설정">설정</button>
    </header>
  `;
}

function renderTopRouteCompass(run) {
  const progress = runProgressBrief(run);
  const currentStep = clamp(Math.round((progress.progress / 100) * 6), 0, 6);
  const phaseLabel = phaseBriefLabel(run.phase);
  const aria = `${progress.actLabel}. ${currentStep + 1}/7. ${progress.distanceText}. 현재 ${phaseLabel}.`;
  return `
    <section class="top-route-compass ${progress.tone}" aria-label="${aria}">
      <span><b>${progress.act}막</b><em>${phaseLabel}</em></span>
      <div class="top-route-pips" aria-hidden="true">
        ${Array.from({ length: 7 }, (_, index) => {
          const classes = [
            index < currentStep ? "done" : "",
            index === currentStep ? "current" : "",
            index === 6 ? "boss" : ""
          ].filter(Boolean).join(" ");
          const label = index === 6 ? nodeIcon("boss") : "";
          return `<i class="${classes}" data-step="${index + 1}">${label}</i>`;
        }).join("")}
      </div>
      <strong>${progress.distanceText}</strong>
    </section>
  `;
}

function renderTopObjective(run) {
  const objective = currentRunObjective(run);
  return `
    <section class="top-objective ${objective.tone} phase-${run.phase}" aria-label="현재 목표: ${objective.title}. ${objective.detail}">
      <span>${objective.label}</span>
      <strong>${objective.title}</strong>
      <small>${objective.detail}</small>
    </section>
  `;
}

function currentRunObjective(run) {
  const progress = runProgressBrief(run);
  if (run.phase === "combat" && run.combat) return combatTopObjective(run, progress);
  const labels = {
    map: "경로",
    reward: "보상",
    event: "선택",
    shop: "마켓",
    rest: "세이프룸",
    summary: "요약"
  };
  const titles = {
    map: "다음 장소 선택",
    reward: "카드나 유물 고르기",
    event: "이벤트 선택 고르기",
    shop: "덱 정비하기",
    rest: "회복·강화·제거 선택",
    summary: "이번 런 확인"
  };
  const details = {
    map: progress.nextText,
    reward: "보상을 정하면 맵으로 돌아갑니다",
    event: "잃는 것과 얻는 것만 확인하세요",
    shop: "구매보다 제거가 나을 때도 있습니다",
    rest: "보스 전에는 체력부터 확인하세요",
    summary: "다음 런의 첫 선택을 정해보세요"
  };
  return {
    tone: progress.tone,
    label: labels[run.phase] ?? "현재",
    title: titles[run.phase] ?? "다음 행동 확인",
    detail: details[run.phase] ?? progress.nextText
  };
}

function combatTopObjective(run, progress) {
  const forecast = enemyIntentForecast(run);
  const aliveEnemies = run.combat.enemies.filter((enemy) => enemy.hp > 0);
  const selected = aliveEnemies.find((enemy) => enemy.uid === run.combat.selectedEnemyUid) ?? aliveEnemies[0];
  if (forecast.hpLoss > 0) {
    return {
      tone: "danger",
      label: "전투",
      title: `피해 ${forecast.hpLoss} 막기`,
      detail: selected ? `${selected.name} 의도 확인` : progress.distanceText
    };
  }
  if (forecast.incomingStatuses.length) {
    return {
      tone: "warning",
      label: "전투",
      title: "해로운 상태 대비",
      detail: statusListText(forecast.incomingStatuses, "예정 상태 없음")
    };
  }
  const lowEnemy = aliveEnemies.find((enemy) => enemy.hp <= Math.max(7, Math.round(enemy.maxHp * 0.28)));
  if (lowEnemy) {
    return {
      tone: "strong",
      label: "전투",
      title: `${lowEnemy.name} 마무리`,
      detail: progress.distanceText
    };
  }
  return {
    tone: progress.tone,
    label: "전투",
    title: "카드 사용",
    detail: selected ? `대상: ${selected.name}` : progress.distanceText
  };
}

function renderRelicInspector(run) {
  const activeRelics = new Set(recentRelicTriggers(run).map((trigger) => trigger.relicId));
  return `
    <div class="modal-backdrop">
      <section class="deck-modal relic-modal" aria-label="유물 상세">
        <header>
          <div>
            <h2>획득한 유물</h2>
            <p>유물 효과와 지금 덱에서 특히 좋은 이유를 확인하세요.</p>
          </div>
          <button data-action="close-relics">닫기</button>
        </header>
        <section class="relic-insight" aria-label="유물 요약">
          <div><dt>보유</dt><dd>${run.player.relics.length}</dd></div>
          <div><dt>최근 발동</dt><dd>${recentRelicTriggers(run).length}</dd></div>
          <div><dt>전투형</dt><dd>${run.player.relics.filter((id) => relicTimingTone(RELIC_BY_ID[id]?.timing) === "combat").length}</dd></div>
          <div><dt>경제/보상</dt><dd>${run.player.relics.filter((id) => relicTimingTone(RELIC_BY_ID[id]?.timing) === "economy").length}</dd></div>
        </section>
        <div class="relic-detail-grid">
          ${run.player.relics.map((id) => renderRelic(id, true, activeRelics.has(id), run)).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderRelicPulse(run) {
  const triggers = recentRelicTriggers(run).slice(-3).reverse();
  if (!triggers.length) return "";
  return `
    <div class="relic-pulse-stack" role="status" aria-live="polite">
      ${triggers
        .map((trigger) => {
          const relic = RELIC_BY_ID[trigger.relicId];
          if (!relic) return "";
          return `
            <div class="relic-pulse">
              <span class="relic-icon icon-${relic.icon}"></span>
              <span><strong>${relic.name}</strong><small>${relic.timing} · ${relic.text}</small></span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderChoicePulse(run) {
  const pulse = activeChoicePulse(run);
  if (!pulse || ["combat", "summary"].includes(run.phase)) return "";
  return `
    <section class="choice-result-pulse ${pulse.tone}" role="status" aria-live="polite">
      <span>${choicePulseKicker(pulse.tone)}</span>
      <strong>${pulse.title}</strong>
      <small>${pulse.detail}</small>
      <div>
        ${pulse.chips.map((chip) => `<i class="${chip.tone}">${chip.label}</i>`).join("")}
      </div>
    </section>
  `;
}

function activeChoicePulse(run = state.run) {
  if (!state.choicePulse || !run) return null;
  if (state.choicePulse.phase && state.choicePulse.phase !== run.phase) {
    clearChoicePulse();
    return null;
  }
  const currentNodeId = run.currentNodeId ?? null;
  if ("nodeId" in state.choicePulse && state.choicePulse.nodeId !== currentNodeId) {
    clearChoicePulse();
    return null;
  }
  if (Date.now() > state.choicePulse.until) {
    clearChoicePulse();
    return null;
  }
  return state.choicePulse;
}

function choicePulseKicker(tone) {
  return {
    craft: "정비 완료",
    event: "선택 결과",
    relic: "유물 획득",
    reward: "보상 적용",
    shop: "마켓 결과",
    steady: "덱 유지",
    warning: "위험 감수"
  }[tone] ?? "선택 결과";
}

function recentRelicTriggers(run) {
  const now = Date.now();
  return (run.relicTriggers ?? []).filter((trigger) => now - trigger.at < 3500);
}

function renderPhase(run) {
  if (run.phase === "map") return renderMap(run);
  if (run.phase === "combat") return renderCombat(run);
  if (run.phase === "reward") return renderReward(run);
  if (run.phase === "event") return renderEvent(run);
  if (run.phase === "shop") return renderShop(run);
  if (run.phase === "rest") return renderRest(run);
  if (run.phase === "summary") return renderSummary(run);
  return `<section class="panel"><h2>알 수 없는 상태</h2></section>`;
}

function renderCombatVictoryCoda(coda, run) {
  const defeatedText = coda.defeatedNames.length ? coda.defeatedNames.join(" · ") : coda.targetName;
  const arena = coda.arena ?? {};
  const quick = coda.mode === "quick";
  const rewardChips = [
    coda.rewardGold > 0 ? { icon: "¢", label: `+${coda.rewardGold}` } : null,
    coda.rewardCards ? { icon: "▤", label: `카드 ${coda.rewardCards}장` } : null,
    coda.rewardRelics ? { icon: "◇", label: `유물 ${coda.rewardRelics}택1` } : null
  ].filter(Boolean);
  return `
    <section class="combat-board victory-coda-board ${quick ? "quick-coda-board" : ""} feedback-reward ${arena.classes ?? ""}" style="${arena.boardStyle ?? ""}" aria-label="전투 승리">
      <div class="combat-background" style="${arena.backgroundStyle ?? ""}" data-scene="${arena.label ?? "전투 종료"}" data-scene-key="${arena.key ?? "victory"}">
        <span class="arena-depth-fog"></span>
        <span class="arena-light-rig"></span>
        <span class="arena-props"></span>
        <span class="arena-stage-floor"></span>
        <span class="arena-foreground"></span>
      </div>
      <div class="combat-victory-coda ${quick ? "quick" : "full"}" data-coda-id="${coda.id}" role="status" aria-live="assertive">
        <div class="victory-coda-impact" aria-hidden="true">
          <i></i>
          <i></i>
          <i></i>
        </div>
        <div class="victory-coda-mark" aria-hidden="true"></div>
        <span>${victoryCodaKicker(coda.sourceType)}</span>
        <h2>승리</h2>
        <div class="victory-coda-finisher" aria-label="마무리 카드">
          <span>마무리</span>
          <strong>${coda.cardName}</strong>
          <i>${coda.defeatedNames.length > 1 ? `적 ${coda.defeatedNames.length}명 격파` : "격파"}</i>
        </div>
        <div class="victory-coda-enemies" aria-label="처치한 적">
          ${coda.enemies.slice(0, 3).map((enemy, index) => renderVictoryCodaEnemy(enemy, index)).join("")}
        </div>
        <p class="victory-coda-summary"><b>${defeatedText}</b><span aria-hidden="true">→</span><strong>보상 확인</strong></p>
        <div class="victory-coda-rewards" aria-label="획득 예정 보상">
          ${rewardChips.map((chip) => `<i><b aria-hidden="true">${chip.icon}</b><span>${chip.label}</span></i>`).join("")}
        </div>
        <div class="victory-coda-actions">
          <button class="primary victory-reward-button" data-action="dismiss-victory-coda" aria-label="전투 보상 확인">보상 확인</button>
          <small>${quick ? "잠시 후 자동 이동" : "자동으로 열립니다"}</small>
        </div>
      </div>
    </section>
  `;
}

function renderVictoryCodaEnemy(enemy, index = 0) {
  const template = GAME_DATA.enemies.find((item) => item.id === enemy.templateId);
  return `
    <article class="victory-coda-enemy" style="--enemy-index:${index}">
      ${renderEnemySprite({ ...enemy, hp: 0 }, template)}
      <span class="victory-enemy-stamp" aria-hidden="true">처치</span>
      <strong>${enemy.name}</strong>
    </article>
  `;
}

function renderMap(run) {
  const active = new Set(run.availableNodeIds);
  const preview = mapRoutePreview(run);
  const routeChoices = run.map.flat().filter((node) => active.has(node.id) && !node.completed);
  const routeAdvice = mapAdvisor(run);
  const progress = runProgressBrief(run);
  const recommendedNodeId = routeAdvice?.recommendedNodeId ?? routeChoices[0]?.id ?? null;
  return `
    <section class="map-layout">
      <div class="map-copy">
        <h2>경로 선택</h2>
        <p>위험과 보상을 보고 다음 층을 고르세요.</p>
        ${renderActInterlude(run)}
        ${renderMapProgressRail(run, routeChoices)}
        ${renderMapHorizon(run, progress, routeChoices, routeAdvice)}
        ${renderRouteChoices(run, routeChoices, routeAdvice)}
        <div class="legend">
          ${nodeLegend("combat", "전투")}
          ${nodeLegend("elite", "엘리트")}
          ${nodeLegend("event", "이벤트")}
          ${nodeLegend("shop", "상점")}
          ${nodeLegend("rest", "휴식")}
          ${nodeLegend("boss", "보스")}
        </div>
      </div>
      <div class="map-board">
        ${renderMapBoardHeader(run, routeChoices, routeAdvice, progress)}
        <div class="map-route-map" aria-label="층별 경로 지도">
        ${renderMapConnections(run)}
        ${run.map
          .map(
            (row) => `
              <div class="${mapRowClass(row, active)}" data-floor="${row[0]?.row + 1 ?? ""}층">
                ${row
                  .map((node) => {
                    const available = active.has(node.id);
                    const disabled = !available || node.completed;
                    const previewClass = preview?.rootId === node.id ? "previewing" : preview?.nodeIds.has(node.id) ? "preview-child" : "";
                    const recommended = recommendedNodeId === node.id && available && !node.completed;
                    return `
                      <button
                        class="map-node ${node.type} ${available ? "available" : ""} ${node.completed ? "completed" : ""} ${recommended ? "recommended" : ""} ${previewClass}"
                        data-action="enter-node"
                        data-id="${node.id}"
                        data-depth="${node.row + 1}층"
                        ${disabled ? "disabled" : ""}
                        title="${routeNodeTitle(run, node)}"
                        aria-label="${routeNodeTitle(run, node)}"
                      >
                        <span class="map-node-icon">${nodeIcon(node.type)}</span>
                        <span class="map-node-label">${nodeTypeLabel(node.type)}</span>
                      </button>
                    `;
                  })
                  .join("")}
              </div>
            `
          )
          .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderMapBoardHeader(run, routeChoices, routeAdvice, progress) {
  const recommendedNode = routeChoices.find((node) => node.id === routeAdvice?.recommendedNodeId) ?? routeChoices[0];
  const boss = bossForAct(recommendedNode?.act ?? rowToAct(Math.max(0, run.stats.floors - 1)));
  const nextLabel = recommendedNode ? `${recommendedNode.row + 1}층 · ${nodeTypeLabel(recommendedNode.type)}` : "경로 선택";
  return `
    <section class="map-board-header ${progress.tone}" aria-label="지도 현재 위치">
      <span>
        <small>${progress.actLabel}</small>
        <strong>${progress.distanceText}</strong>
      </span>
      <p>${boss ? `목표: ${boss.name}` : "목표 확인"}</p>
      <div>
        <i>${nextLabel}</i>
        <i>${routeAdvice?.title ?? "다음 경로 선택"}</i>
      </div>
    </section>
  `;
}

function mapRowClass(row, active) {
  const hasNext = row.some((node) => active.has(node.id) && !node.completed);
  const hasDone = row.some((node) => node.completed);
  const hasBoss = row.some((node) => node.type === "boss");
  return `map-row ${hasNext ? "has-next" : ""} ${hasDone ? "has-done" : ""} ${hasBoss ? "has-boss" : ""}`.trim();
}

function renderMapObjectiveCard(run, progress) {
  const analysis = deckAnalysis(run);
  const buildLabel = analysis.primary.score > 0 ? analysis.primary.label : "아직 탐색 중";
  const readiness = progress.readiness;
  const weak = readiness?.metrics?.filter((metric) => metric.tone === "warning" || metric.tone === "danger").map((metric) => metric.label).slice(0, 3) ?? [];
  const nextFocus = weak.length ? `${weak.join(", ")} 보강` : analysis.primary.score > 0 ? `${analysis.primary.label} 보강` : "주력 정하기";
  return `
    <section class="map-objective-card ${readiness?.tone ?? progress.tone}" aria-label="현재 목표">
      <span>${progress.actLabel}</span>
      <strong>${progress.title}</strong>
      <small>${progress.bossText} · ${progress.distanceText}</small>
      <p>${nextFocus}</p>
      <div>
        <i>체력 ${run.player.hp}/${run.player.maxHp}</i>
        <i>덱 ${run.player.deck.length}장</i>
        <i>${buildLabel}</i>
      </div>
    </section>
  `;
}

function renderMapHorizon(run, progress, routeChoices = [], routeAdvice = null) {
  const recommendedNode = routeChoices.find((node) => node.id === routeAdvice?.recommendedNodeId) ?? routeChoices[0];
  const boss = bossForAct(recommendedNode?.act ?? rowToAct(Math.max(0, run.stats.floors - 1)));
  const hpRatio = run.player.hp / Math.max(1, run.player.maxHp);
  const hpTone = hpRatio <= 0.42 ? "danger" : hpRatio <= 0.62 ? "warning" : "steady";
  const deck = run.player.deck.length;
  const nextLabel = recommendedNode ? `${recommendedNode.row + 1}층 · ${nodeTypeLabel(recommendedNode.type)}` : "경로 선택";
  const focusTags = bossHorizonTags(boss, progress.readiness);
  return `
    <section class="map-horizon ${progress.tone}" aria-label="현재 진행 목표">
      ${boss ? `<span class="map-horizon-portrait sprite-${boss.sprite}" style="${mapHorizonBossStyle(boss)}" aria-hidden="true"></span>` : ""}
      <div class="map-horizon-main">
        <span>${progress.actLabel}</span>
        <strong>${progress.distanceText}</strong>
        <small>${boss ? boss.name : "보스 미확인"}</small>
      </div>
      <div class="map-horizon-boss" aria-label="보스 대비">
        ${focusTags.map((tag) => `<i>${tag}</i>`).join("")}
      </div>
      <div class="map-horizon-status" aria-label="현재 상태">
        <i class="${hpTone}">체력 ${run.player.hp}/${run.player.maxHp}</i>
        <i>덱 ${deck}장</i>
        <i>${nextLabel}</i>
      </div>
    </section>
  `;
}

function bossFocusTags(boss) {
  const text = boss?.mechanic ?? "";
  const tags = [];
  if (/바이러스|정화/.test(text)) tags.push("바이러스 관리");
  if (/약화|취약|균열/.test(text)) tags.push("해로운 상태 정리");
  if (/연속|여러 번|x\d|강공격/.test(text)) tags.push("큰 공격 대비");
  if (/소환|졸개/.test(text)) tags.push("소환 대응");
  if (/방어|방어벽/.test(text)) tags.push("방어벽 돌파");
  return tags.length ? tags.slice(0, 3) : ["체력 유지", "마무리 피해", "방어 준비"];
}

function bossHorizonTags(boss, readiness = null) {
  const missing = bossReadinessMissing(readiness);
  if (missing.length) return missing.map((label) => `${label} 보강`).slice(0, 3);
  return bossFocusTags(boss);
}

function mapHorizonBossStyle(boss) {
  if (!boss?.sprite) return "";
  return `--map-boss-image:url('${enemyCombatantImage(boss)}');`;
}

function renderMapDecisionPanel(run, routeChoices, routeAdvice = null) {
  if (!routeChoices.length) return "";
  const recommendedNode = routeChoices.find((node) => node.id === routeAdvice?.recommendedNodeId) ?? routeChoices[0];
  const detail = nodeRiskReward(recommendedNode.type);
  const scout = routeStrategicPreview(run, recommendedNode);
  const connection = routeConnectionSummary(run, recommendedNode).replace(/^다음:\s*/, "");
  const tone = routeAdvice?.tone ?? scout.tone ?? "steady";
  return `
    <section class="map-decision-panel ${tone}" aria-label="추천 경로 판단">
      <span>추천 길</span>
      <strong>${recommendedNode.row + 1}층 · ${nodeTypeLabel(recommendedNode.type)}</strong>
      <p>${routeAdvice?.detail ?? scout.detail}</p>
      <div>
        <i><b>보상</b>${detail.reward}</i>
        <i><b>주의</b>${routeDecisionRiskText(recommendedNode, detail, scout)}</i>
        <i><b>다음</b>${connection}</i>
      </div>
    </section>
  `;
}

function renderMapConnections(run) {
  const flat = run.map?.flat?.() ?? [];
  if (!flat.length) return "";
  const active = new Set(run.availableNodeIds ?? []);
  const preview = mapRoutePreview(run);
  const completed = new Set(flat.filter((node) => node.completed).map((node) => node.id));
  const nodeById = Object.fromEntries(flat.map((node) => [node.id, node]));
  const rowGap = 70;
  const height = Math.max(120, (run.map.length - 1) * rowGap + 56);
  const paths = flat.flatMap((node) =>
    (node.connections ?? [])
      .map((targetId) => {
        const target = nodeById[targetId];
        if (!target) return "";
        const from = mapNodePoint(node, rowGap);
        const to = mapNodePoint(target, rowGap);
        const tension = Math.max(18, (to.y - from.y) * 0.48);
        const state =
          completed.has(node.id) && completed.has(target.id)
            ? "completed"
            : completed.has(node.id) && active.has(target.id)
              ? "available"
              : active.has(node.id)
                ? "preview"
                : "locked";
        const edgeKey = mapEdgeKey(node.id, target.id);
        const previewClass = preview?.edgeKeys.has(edgeKey) ? "route-previewed" : "";
        return `<path class="${state} ${previewClass}" data-edge="${edgeKey}" d="M ${from.x} ${from.y} C ${from.x} ${from.y + tension}, ${to.x} ${to.y - tension}, ${to.x} ${to.y}" />`;
      })
      .filter(Boolean)
  );
  return `
    <svg class="map-connections" viewBox="0 0 300 ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      ${paths.join("")}
    </svg>
  `;
}

function mapRoutePreview(run, previewNodeId = state.mapPreviewNodeId) {
  if (state.screen !== "game" || run?.phase !== "map" || !previewNodeId) return null;
  const flat = run.map?.flat?.() ?? [];
  const active = new Set(run.availableNodeIds ?? []);
  const root = flat.find((node) => node.id === previewNodeId);
  if (!root || root.completed || !active.has(root.id)) return null;
  const nodeById = Object.fromEntries(flat.map((node) => [node.id, node]));
  const nodeIds = new Set([root.id]);
  const edgeKeys = new Set();
  let frontier = [root];
  for (let depth = 0; depth < 3; depth += 1) {
    const next = [];
    for (const node of frontier) {
      for (const targetId of node.connections ?? []) {
        const target = nodeById[targetId];
        if (!target) continue;
        nodeIds.add(target.id);
        edgeKeys.add(mapEdgeKey(node.id, target.id));
        next.push(target);
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return { rootId: root.id, nodeIds, edgeKeys };
}

function mapEdgeKey(fromId, toId) {
  return `${fromId}->${toId}`;
}

function mapNodePoint(node, rowGap = 70) {
  const x = node.type === "boss" ? 150 : 50 + (node.col ?? 0) * 100;
  return { x, y: 28 + node.row * rowGap };
}

function previewMapRouteFromElement(routeElement) {
  const run = state.run;
  const nodeId = routeElement?.dataset?.id;
  if (!nodeId || state.screen !== "game" || run?.phase !== "map") return;
  if (!mapRoutePreview(run, nodeId) || state.mapPreviewNodeId === nodeId) return;
  state.mapPreviewNodeId = nodeId;
  refreshMapRoutePreview();
}

function clearMapRoutePreview() {
  if (!state.mapPreviewNodeId) return;
  state.mapPreviewNodeId = null;
  refreshMapRoutePreview();
}

function refreshMapRoutePreview() {
  const run = state.run;
  if (state.screen !== "game" || run?.phase !== "map") return;
  const preview = mapRoutePreview(run);
  app.querySelectorAll(".route-card.previewing").forEach((card) => card.classList.remove("previewing"));
  app.querySelectorAll(".map-node.previewing, .map-node.preview-child").forEach((node) => node.classList.remove("previewing", "preview-child"));
  app.querySelectorAll(".map-connections path.route-previewed").forEach((path) => path.classList.remove("route-previewed"));
  refreshMapRouteFocusPanel(run);
  if (!preview) return;
  app.querySelector(`.route-card[data-id="${cssEscape(preview.rootId)}"]`)?.classList.add("previewing");
  app.querySelectorAll(".map-node[data-id]").forEach((node) => {
    const id = node.dataset.id;
    if (id === preview.rootId) node.classList.add("previewing");
    else if (preview.nodeIds.has(id)) node.classList.add("preview-child");
  });
  app.querySelectorAll(".map-connections path[data-edge]").forEach((path) => {
      if (preview.edgeKeys.has(path.dataset.edge)) path.classList.add("route-previewed");
  });
}

function refreshMapRouteFocusPanel(run = state.run) {
  if (state.screen !== "game" || run?.phase !== "map") return;
  const panel = app.querySelector(".route-focus-panel");
  if (!panel) return;
  const routeChoices = (run.map?.flat?.() ?? []).filter((node) => (run.availableNodeIds ?? []).includes(node.id) && !node.completed);
  const nextPanel = renderRouteFocusPanel(run, routeChoices, mapAdvisor(run)).trim();
  if (nextPanel) panel.outerHTML = nextPanel;
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

function renderActInterlude(run) {
  const interlude = run.lastInterlude;
  if (!interlude || interlude.type !== "act-transition" || run.phase !== "map") return "";
  if (interlude.dismissed) return "";
  const view = actInterludeView(interlude);
  if (view.hidden) return "";
  return `
    <section class="act-interlude ${view.fresh ? "is-new" : "is-active is-compact"}" data-interlude-key="${view.key}" data-one-shot="true" aria-label="${interlude.fromAct}막 돌파 결과">
      <span>${interlude.fromAct}막 완료</span>
      <strong>${interlude.toAct}막으로 진입</strong>
      <p>${interlude.bossName} 격파 · ${actName(interlude.toAct)} · 다음 보스 ${interlude.nextBossName}</p>
      <div class="act-interlude-chips">
        <i>회복 +${interlude.recovered}</i>
        <i>체력 ${interlude.hpAfter}/${interlude.maxHp}</i>
        <i>${interlude.floor}층 돌파</i>
      </div>
    </section>
  `;
}

function actInterludeView(interlude) {
  const key = actInterludeKey(interlude);
  if (interlude.dismissed) return { key, fresh: false, hidden: true };
  if (interlude.seenAt) return { key, fresh: false, hidden: true };
  if (runHasSeenActInterludeKey(state.run, key)) {
    markActInterludeSeen(interlude, key);
    return { key, fresh: false, hidden: true };
  }
  if (state.dismissedActInterludeKeys.has(key)) return { key, fresh: false, hidden: true };
  if (state.seenActInterludeKeys.has(key)) return { key, fresh: false, hidden: true };
  markActInterludeSeen(interlude, key);
  return { key, fresh: true, hidden: false };
}

function actInterludeKey(interlude) {
  if (interlude.presentationKey) return interlude.presentationKey;
  return `act-${interlude.fromAct}-${interlude.toAct}-${interlude.floor}-${visualSeed(`${interlude.bossName}:${interlude.nextBossName}`)}`;
}

function markActInterludeSeen(interlude, key) {
  rememberActInterludeKey(key);
  rememberDismissedActInterludeKey(key);
  const runFlagChanged = rememberRunActInterludeKey(state.run, key);
  const changed = runFlagChanged || interlude.presentationKey !== key || interlude.ackRequired !== false || interlude.dismissed !== true || !interlude.seenAt;
  interlude.presentationKey = key;
  interlude.ackRequired = false;
  interlude.dismissed = true;
  if (!interlude.seenAt) interlude.seenAt = Date.now();
  if (!interlude.dismissedAt) interlude.dismissedAt = interlude.seenAt;
  if (changed && state.run?.lastInterlude === interlude) saveRun(state.run);
}

function runHasSeenActInterludeKey(run, key) {
  return Boolean(key && Array.isArray(run?.runFlags?.seenActInterludes) && run.runFlags.seenActInterludes.includes(key));
}

function rememberRunActInterludeKey(run, key) {
  if (!run || !key) return false;
  run.runFlags ??= {};
  if (!Array.isArray(run.runFlags.seenActInterludes)) run.runFlags.seenActInterludes = [];
  if (run.runFlags.seenActInterludes.includes(key)) return false;
  run.runFlags.seenActInterludes.push(key);
  if (run.runFlags.seenActInterludes.length > 8) {
    run.runFlags.seenActInterludes = run.runFlags.seenActInterludes.slice(-8);
  }
  return true;
}

function rememberActInterludeKey(key) {
  if (!key) return;
  state.seenActInterludeKeys.add(key);
  if (state.seenActInterludeKeys.size <= 16) return;
  const oldest = state.seenActInterludeKeys.values().next().value;
  state.seenActInterludeKeys.delete(oldest);
}

function rememberDismissedActInterludeKey(key) {
  if (!key) return;
  state.dismissedActInterludeKeys.add(key);
  if (state.dismissedActInterludeKeys.size <= 16) return;
  const oldest = state.dismissedActInterludeKeys.values().next().value;
  state.dismissedActInterludeKeys.delete(oldest);
}

function dismissActInterlude(key) {
  const interlude = state.run?.lastInterlude;
  if (!interlude || interlude.type !== "act-transition") return false;
  const activeKey = actInterludeKey(interlude);
  if (key && key !== activeKey) return false;
  interlude.dismissed = true;
  interlude.ackRequired = false;
  interlude.dismissedAt = Date.now();
  interlude.presentationKey = activeKey;
  rememberRunActInterludeKey(state.run, activeKey);
  rememberDismissedActInterludeKey(activeKey);
  return true;
}

function renderPhaseTransition(run) {
  const cue = state.phaseTransition;
  if (!cue || !run || run.phase === "summary" || run.phase === "map" || run.phase === "reward") return "";
  return `
    <div class="phase-transition phase-${run.phase} ${cue.tone}" role="status" aria-live="polite">
      <span>${cue.kicker}</span>
      <strong>${cue.title}</strong>
      <small>${cue.detail}</small>
      <div>
        ${cue.chips.map((chip) => `<i>${chip}</i>`).join("")}
      </div>
    </div>
  `;
}

function phaseTransitionCue(previousKey, nextKey, run) {
  if (!run || !nextKey?.startsWith("game:") || previousKey === nextKey) return null;
  const nextPhase = nextKey.slice(5);
  const progress = runProgressBrief(run);
  const currentNode = currentRunNode(run);
  const baseChips = [progress.actLabel, progress.distanceText].filter(Boolean);
  if (nextPhase === "map" || nextPhase === "reward") {
    return null;
  }
  if (nextPhase === "combat") {
    const combatType = currentNode?.type === "boss" ? "보스전" : currentNode?.type === "elite" ? "엘리트" : "전투";
    return {
      tone: currentNode?.type === "boss" ? "boss" : currentNode?.type === "elite" ? "elite" : "combat",
      kicker: combatType,
      title: currentNode ? `${currentNode.row + 1}층` : "전투",
      detail: "적 의도와 손패를 확인하세요.",
      chips: [...baseChips, `체력 ${run.player.hp}/${run.player.maxHp}`]
    };
  }
  if (nextPhase === "event") {
    return {
      tone: "event",
      kicker: "이벤트",
      title: currentNode ? `${currentNode.row + 1}층 · 선택 고르기` : "선택 고르기",
      detail: "잃는 것과 얻는 것을 보고 고르세요.",
      chips: [...baseChips, `크레딧 ${run.player.gold}`]
    };
  }
  if (nextPhase === "shop") {
    return {
      tone: "shop",
      kicker: "상점",
      title: "덱을 정비할 시간입니다",
      detail: "구매보다 제거와 강화가 더 좋은 순간도 있습니다.",
      chips: [...baseChips, `크레딧 ${run.player.gold}`]
    };
  }
  if (nextPhase === "rest") {
    return {
      tone: "rest",
      kicker: "휴식 지점",
      title: "회복, 강화, 제거 중 하나",
      detail: "다음 위험에 맞춰 체력과 덱 속도 중 더 급한 쪽을 고르세요.",
      chips: [...baseChips, `체력 ${run.player.hp}/${run.player.maxHp}`]
    };
  }
  if (nextPhase === "summary") return null;
  return null;
}

function rewardSourceKicker(type) {
  return {
    combat: "전투 보상",
    elite: "엘리트 보상",
    boss: "보스 보상",
    event: "이벤트 보상"
  }[type] ?? "보상 발견";
}

function victoryCodaKicker(type) {
  return {
    combat: "일반 전투 완료",
    elite: "엘리트 격파",
    boss: "보스 격파",
    event: "특수 보상"
  }[type] ?? "보상 발견";
}

function currentRunNode(run) {
  if (!run?.currentNodeId) return null;
  return (run.map?.flat?.() ?? []).find((node) => node.id === run.currentNodeId) ?? null;
}

function renderMapProgressRail(run, routeChoices = []) {
  const flat = run.map?.flat?.() ?? [];
  if (!flat.length) return "";
  const active = new Set(run.availableNodeIds ?? []);
  const currentNode = currentRunNode(run);
  const reference = routeChoices[0] ?? currentNode ?? flat.find((node) => node.row + 1 >= run.stats.floors) ?? flat[0];
  const act = reference?.act ?? rowToAct(reference?.row ?? 0);
  const actStart = (act - 1) * 7;
  const steps = Array.from({ length: 7 }, (_, index) => {
    const row = actStart + index;
    const nodes = flat.filter((node) => node.row === row);
    const available = nodes.some((node) => active.has(node.id) && !node.completed);
    const completed = nodes.some((node) => node.completed);
    const current = currentNode?.row === row;
    const boss = nodes.some((node) => node.type === "boss");
    const primaryType = boss ? "boss" : nodes.find((node) => active.has(node.id))?.type ?? nodes.find((node) => node.completed)?.type ?? nodes[0]?.type ?? "combat";
    return {
      row,
      label: `${index + 1}`,
      type: primaryType,
      state: boss ? "boss" : available ? "next" : current ? "current" : completed ? "done" : "locked"
    };
  });
  const nextTypes = routeChoices.map((node) => nodeTypeLabel(node.type)).filter(Boolean);
  const nextText = nextTypes.length ? `다음 선택: ${[...new Set(nextTypes)].slice(0, 3).join(" / ")}` : "다음 선택지를 확인하세요";
  return `
    <div class="map-progress-rail" aria-label="${act}막 진행도">
      <span>
        <strong>${act}막 진행</strong>
        <small>${nextText}</small>
      </span>
      <div class="map-progress-steps">
        ${steps
          .map(
            (step) => `
              <i class="${step.state} ${step.type}" title="${step.row + 1}층 ${nodeTypeLabel(step.type)}">
                ${step.label}
              </i>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderRouteChoices(run, routeChoices, routeAdvice = null) {
  if (!routeChoices.length) return "";
  return `
    <div class="route-preview" aria-label="선택 가능한 경로">
      <h3>다음 경로</h3>
      ${renderRouteFocusPanel(run, routeChoices, routeAdvice)}
      <div class="route-card-list">
        ${routeChoices.map((node) => renderRouteCard(run, node, routeAdvice)).join("")}
      </div>
    </div>
  `;
}

function renderRouteFocusPanel(run, routeChoices, routeAdvice = null) {
  const focusedNode =
    routeChoices.find((node) => node.id === state.mapPreviewNodeId) ??
    routeChoices.find((node) => node.id === routeAdvice?.recommendedNodeId) ??
    routeChoices[0];
  if (!focusedNode) return "";
  const previewing = state.mapPreviewNodeId === focusedNode.id;
  const detail = nodeRiskReward(focusedNode.type);
  const scout = routeStrategicPreview(run, focusedNode);
  const connection = routeBranchSummaryText(run, focusedNode);
  const rewardText = routeRewardShortLabel(focusedNode.type);
  const riskText = routeRiskLevel(focusedNode.type, scout);
  const riskDetail = routeDecisionRiskText(focusedNode, detail, scout);
  const focusSummary = routeFocusSummary(run, focusedNode, routeAdvice, scout, previewing);
  const tone = routeAdvice?.recommendedNodeId === focusedNode.id ? routeAdvice?.tone ?? scout.tone : scout.tone;
  return `
    <section class="route-focus-panel ${focusedNode.type} ${tone} ${previewing ? "is-previewing" : "is-recommended"}" data-focus-node="${focusedNode.id}" aria-label="${previewing ? "검토 중인 경로" : "추천 경로"} 요약">
      <span>${previewing ? "검토 중" : "추천 경로"}</span>
      <strong>${focusedNode.row + 1}층 · ${routePathLabel(run, focusedNode)}</strong>
      <small>${focusSummary}</small>
      <div>
        <i title="보상: ${detail.reward}"><b>보상</b><span>${rewardText}</span></i>
        <i title="주의: ${riskDetail}"><b>주의</b><span>${riskText}</span></i>
        <i title="이후: ${connection}"><b>이후</b><span>${connection}</span></i>
      </div>
    </section>
  `;
}

function renderRouteCard(run, node, routeAdvice = null) {
  const detail = nodeRiskReward(node.type);
  const scout = routeStrategicPreview(run, node);
  const recommended = routeAdvice?.recommendedNodeId === node.id;
  const previewing = state.mapPreviewNodeId === node.id;
  const aria = `${routeNodeTitle(run, node)}${recommended ? " · 추천 경로" : ""}`;
  const pathLabel = routePathLabel(run, node);
  const branchText = routeBranchSummaryText(run, node);
  const trail = renderRouteTrail(run, node);
  return `
    <button class="route-card ${node.type} ${recommended ? "recommended" : ""} ${previewing ? "previewing" : ""}" data-action="enter-node" data-id="${node.id}" aria-label="${aria}">
      <span class="route-icon">${nodeIcon(node.type)}</span>
      <span class="route-copy">
        <span class="route-head">
          <strong>${node.row + 1}층 · ${pathLabel}</strong>
          <span class="route-head-tools">
            ${trail}
            ${recommended ? `<span class="route-recommendation">추천</span>` : ""}
          </span>
        </span>
        <span class="route-meta">
          <em>${routeRewardShortLabel(node.type)}</em>
          <small>${routeRiskLevel(node.type, scout)}</small>
          <span class="route-scout ${scout.tone}" title="${scout.detail}"><b>${scout.label}</b><span>${scout.detail}</span></span>
          <i>${branchText}</i>
        </span>
      </span>
      <span class="route-action" aria-hidden="true">${recommended ? "추천" : "선택"}</span>
    </button>
  `;
}

function renderCombat(run) {
  const combat = run.combat;
  const lastTone = run.log.at(-1)?.tone ?? "system";
  const boss = activeCombatBoss(run);
  const boardClass = combatBoardClass(run, lastTone, boss);
  const recommendedCardUid = combatRecommendedCardUid(run);
  const turnLocked = combatTurnInputLocked(run);
  const arenaScene = combatArenaScene(run, boss);
  const endTurnPreview = combatEndTurnPreview(run);
  const endTurnButton = combatEndTurnButtonState(run, endTurnPreview);
  const visibleEnemies = combat.enemies.filter((enemy) => enemy.hp > 0 || state.combatFx?.defeatedUids?.includes(enemy.uid));
  return `
    <section class="${boardClass}" style="${arenaScene.boardStyle}">
      <div class="combat-background" style="${arenaScene.backgroundStyle}" data-scene="${arenaScene.label}" data-scene-key="${arenaScene.key}">
        <span class="arena-depth-fog"></span>
        <span class="arena-light-rig"></span>
        <span class="arena-props"></span>
        <span class="arena-stage-floor"></span>
        <span class="arena-foreground"></span>
      </div>
      ${renderBossPhaseShock(run, boss)}
      <div class="combat-hud">
        ${renderCombatDepthRail(run)}
        ${renderCombatMissionStrip(run)}
        ${renderCombatCommandRow(run, recommendedCardUid)}
      </div>
      ${renderBossStatusStrip(boss)}
      ${renderCombatEventFeed(run)}
      ${renderCombatFxLayer(run)}
      ${renderCombatTurnCue(run)}
      <div class="combat-aim-line" hidden aria-hidden="true"><span></span></div>
      ${renderBossCurtain(boss)}
      <div class="arena">
        <article class="player-stand ${state.combatFx?.targetMode === "self" ? "fx-target" : ""}" aria-label="${playerCombatantAriaLabel(run)}">
          ${renderEntityImpactRing("self")}
          ${renderEntityHitSparks("self")}
          <div class="character-sprite player-sprite">
            <span class="sprite-motion-echo"></span>
            <span class="sprite-ground-burst"></span>
          </div>
          ${renderEntityResultStack("self")}
          <div class="combatant-plate player-plate">
            <h2>${run.player.name}</h2>
            ${playerHealthBar(run)}
            ${renderBlockReadout(run.player.block)}
            ${renderStatuses(run.player.statuses)}
          </div>
          ${renderEntityFxBadge("self")}
        </article>
        <div class="enemy-line enemy-count-${visibleEnemies.length}" style="--enemy-count:${Math.max(1, visibleEnemies.length)}">
          ${renderEnemyCrowdStrip(run, visibleEnemies)}
          ${visibleEnemies.map((enemy, index) => renderEnemy(run, enemy, index, visibleEnemies.length)).join("")}
        </div>
      </div>
      ${renderCombatResourceDock(run)}
      ${renderCombatPlayPanel(run, recommendedCardUid)}
      <div class="hand-zone" style="${handLayoutStyle(combat.hand.length)}" aria-label="손패 ${combat.hand.length}장">
        ${combat.hand
          .map((card, index) => {
            const energyReady = cardCost(card, combat) <= combat.energy;
            const playable = !turnLocked && energyReady;
            return renderCard(card, {
              run,
              combat,
              playable,
              hardDisabled: turnLocked,
              disabledReason: turnLocked ? endTurnButton.disabledReason : "전하 부족",
              hotkey: handHotkeyLabel(index),
              recommended: !turnLocked && card.uid === recommendedCardUid
            });
          })
          .join("")}
      </div>
      <button class="end-turn ${turnLocked ? `is-locked turn-${endTurnButton.kind}` : ""} risk-${endTurnPreview.tone}" data-action="end-turn" data-risk-detail="${endTurnButton.title}" aria-keyshortcuts="E Space" aria-label="${endTurnButton.ariaLabel}" title="${endTurnButton.title}" ${turnLocked ? "disabled" : ""}>
        <span class="end-turn-key" aria-hidden="true">${endTurnButton.key}</span>
        <strong>${endTurnButton.label}</strong>
        <small>${endTurnButton.small}</small>
      </button>
    </section>
  `;
}

function combatEndTurnPreview(run) {
  const forecast = enemyIntentForecast(run);
  if (forecast.hpLoss > 0) {
    return {
      tone: "danger",
      label: `체력 -${forecast.hpLoss}`,
      detail: `턴을 넘기면 ${damageForecastText(run, forecast)}.`
    };
  }
  if (forecast.incomingStatuses.length) {
    const status = forecast.incomingStatuses[0];
    return {
      tone: "warning",
      label: `${keywordLabel(status.status)} +${status.amount}`,
      detail: `턴을 넘기면 ${statusListText(forecast.incomingStatuses, "상태 이상")}을 받습니다.`
    };
  }
  if (forecast.incomingDamage > 0) {
    return {
      tone: "guarded",
      label: "방어 OK",
      detail: `턴을 넘기면 ${damageForecastText(run, forecast)}.`
    };
  }
  if (combatSetupText(forecast) !== "준비 없음") {
    return {
      tone: "setup",
      label: "적 준비",
      detail: `턴을 넘기면 ${combatSetupText(forecast)}이 적용됩니다.`
    };
  }
  return {
    tone: "safe",
    label: "안전",
    detail: "턴을 넘겨도 바로 들어오는 피해나 상태 이상이 없습니다."
  };
}

function renderCombatMissionStrip(run) {
  const nodeType = combatMissionNodeType(run);
  const progress = runProgressBrief(run);
  const mission = combatMissionForNode(nodeType, progress);
  const chips = [
    nodeTypeLabel(nodeType),
    progress.distanceText,
    `체력 ${run.player.hp}/${run.player.maxHp}`,
    `덱 ${run.player.deck.length}장`
  ];
  return `
    <section class="combat-mission-strip ${progress.tone} node-${nodeType}" aria-label="전투 목표: ${mission.title}. ${mission.detail}">
      <span>${mission.label}</span>
      <strong>${mission.title}</strong>
      <small>${mission.detail}</small>
      ${renderCombatReadinessStrip(progress.readiness)}
      <div class="combat-mission-chips">
        ${chips.map((chip) => `<i>${chip}</i>`).join("")}
      </div>
    </section>
  `;
}

function renderCombatReadinessStrip(readiness) {
  if (!readiness) return "";
  const highlights = combatReadinessHighlights(readiness);
  const aria = highlights.map((metric) => `${metric.label} ${metric.value}`).join(", ");
  const detail = (readiness.detail ?? "").replace(/[.。]+$/, "");
  return `
    <div class="combat-readiness-strip ${readiness.tone}" aria-label="보스 대비: ${detail}${aria ? `. ${aria}` : ""}">
      <b>보스 대비</b>
      ${highlights.map((metric) => `<span class="${metric.tone}"><em>${metric.label}</em>${metric.value}</span>`).join("")}
    </div>
  `;
}

function combatReadinessHighlights(readiness) {
  const metrics = readiness?.metrics ?? [];
  const weak = metrics.filter((metric) => metric.tone === "danger" || metric.tone === "warning");
  return (weak.length ? weak : metrics).slice(0, 3);
}

function combatMissionNodeType(run) {
  const currentNode = currentRunNode(run);
  if (currentNode?.type) return currentNode.type;
  return { normal: "combat" }[run.combat?.type] ?? run.combat?.type ?? "combat";
}

function combatMissionForNode(type, progress) {
  const detail = `${progress.bossText} · ${progress.distanceText}`;
  if (type === "elite") return { label: "전투 목표", title: "유물 획득 기회", detail };
  if (type === "boss") return { label: "전투 목표", title: "구역 보스 격파", detail: progress.detail };
  if (type === "event") return { label: "전투 목표", title: "위험 보상 회수", detail };
  return { label: "전투 목표", title: "카드 보상 확보", detail };
}

function renderCombatDepthRail(run) {
  const row = Number(run.currentRow ?? 0);
  const act = Math.max(1, Math.min(3, Math.floor(row / 7) + 1));
  const localFloor = (row % 7) + 1;
  const bossDistance = Math.max(0, 7 - localFloor);
  const nodeType = combatMissionNodeType(run);
  const rewardLabel = combatRouteRewardLabel(nodeType);
  const boss = bossForAct(act);
  const bossTargetLabel = boss?.name ?? "보스 미확인";
  const distanceLabel = bossDistance ? `보스까지 ${bossDistance}층` : "보스전";
  const detailLabel = `${act}막 ${localFloor}층. ${distanceLabel}. 목표 ${bossTargetLabel}. 전투 후 ${rewardLabel}.`;
  const pips = Array.from({ length: 7 }, (_, index) => {
    const current = index + 1 === localFloor;
    const completed = index + 1 < localFloor;
    const boss = index === 6;
    return `<i class="${current ? "current" : ""} ${completed ? "done" : ""} ${boss ? "boss" : ""}" aria-hidden="true"></i>`;
  }).join("");
  return `
    <div class="depth-rail combat-route-beacon node-${nodeType} ${bossDistance <= 1 ? "near-boss" : ""}" aria-label="현재 위치 ${act}막 ${localFloor}층. ${distanceLabel}. 목표 ${bossTargetLabel}. 전투 후 ${rewardLabel}" title="${detailLabel}">
      <span class="route-kicker">진행</span>
      <strong><b>${act}막</b><em>${localFloor}층</em></strong>
      <div class="route-pips">${pips}</div>
      <small><i aria-hidden="true">${nodeIcon(nodeType)}</i><b>${distanceLabel}</b><em>${bossTargetLabel}</em></small>
    </div>
  `;
}

function combatRouteRewardLabel(type) {
  return {
    combat: "카드 선택",
    elite: "유물 획득",
    event: "특수 보상",
    shop: "정비 기회",
    rest: "휴식",
    boss: "구역 돌파"
  }[type] ?? "다음 선택";
}

function renderCombatEventFeed(run) {
  const entry = run.log.at(-1);
  const tone = entry?.tone ?? "system";
  const visibleTones = new Set(["curse", "relic", "warn", "reward", "system"]);
  if (!entry || state.combatFx || !visibleTones.has(tone)) return "";
  return `
    <div class="combat-alerts" role="status" aria-live="polite" aria-atomic="true" aria-label="전투 피드백">
      <span class="${tone}">
        <b>${combatEventLabel(tone)}</b>
        <small>${entry.text}</small>
      </span>
    </div>
  `;
}

function combatEventLabel(tone = "system") {
  return {
    block: "방어",
    buff: "강화",
    card: "카드",
    combat: "전투",
    curse: "저주",
    damage: "피해",
    deck: "덱",
    enemy: "적",
    event: "이벤트",
    relic: "유물",
    rest: "휴식",
    reward: "보상",
    shop: "상점",
    system: "알림",
    warn: "주의"
  }[tone] ?? "기록";
}

function renderCombatFxLayer(run) {
  const fx = state.combatFx;
  if (!fx || run.phase !== "combat") return "";
  return `
    <div class="combat-action-fx fx-${fx.tone} fx-${fx.targetMode}${fx.kind ? ` fx-${fx.kind}` : ""}${fx.sourceMode ? ` fx-source-${fx.sourceMode}` : ""}${fx.lethal ? " fx-lethal" : ""}${fx.actorCount > 1 ? " fx-grouped" : ""}" data-fx-id="${fx.id}" style="${combatFxInlineStyle(fx)}" aria-hidden="true">
      <span class="fx-source-pulse"></span>
      ${renderCombatFxSource(fx)}
      <span class="fx-action-line">
        <b>${fx.cardName}</b>
        <i>→</i>
        <b>${fx.targetName}</b>
      </span>
      <span class="fx-trail"><i></i></span>
      <span class="fx-impact">
        <strong>${fx.label}</strong>
        <small>${fx.targetName}</small>
      </span>
      ${renderCombatFxChipRow(fx)}
      ${fx.lethal ? `<span class="fx-lethal-stamp">처치</span>` : ""}
    </div>
  `;
}

function combatFxInlineStyle(fx) {
  const geometry = fx?.geometry;
  if (!geometry) return "";
  const entries = {
    "--fx-start-x": `${roundCssPx(geometry.startX)}px`,
    "--fx-start-y": `${roundCssPx(geometry.startY)}px`,
    "--fx-end-x": `${roundCssPx(geometry.endX)}px`,
    "--fx-end-y": `${roundCssPx(geometry.endY)}px`,
    "--fx-distance": `${roundCssPx(geometry.distance)}px`,
    "--fx-angle": `${roundCssPx(geometry.angle)}rad`
  };
  return Object.entries(entries).map(([key, value]) => `${key}:${value}`).join(";");
}

function renderCombatTurnCue(run) {
  const cue = activeCombatTurnCue(run);
  if (!cue) return "";
  const aria = `${cue.kicker}. ${cue.title}${cue.detail ? `. ${cue.detail}` : ""}`;
  return `
    <section class="combat-turn-cue ${cue.kind} ${cue.tone}" role="status" aria-live="${cue.kind === "enemy" ? "assertive" : "polite"}" aria-label="${aria}">
      <span>${cue.kicker}</span>
      <strong>${cue.title}</strong>
      ${cue.detail ? `<small>${cue.detail}</small>` : ""}
      ${cue.chips?.length ? `<div aria-hidden="true">${cue.chips.map((chip) => {
        const visual = turnCueChipVisual(chip);
        return `<i class="${chip.tone}" title="${chip.label}"><b>${visual.icon}</b><em>${visual.value}</em></i>`;
      }).join("")}</div>` : ""}
    </section>
  `;
}

function turnCueChipVisual(chip) {
  const label = chip?.label ?? "";
  const number = label.match(/[+-]?\d+/)?.[0] ?? "";
  if (/체력 -|피해|공격/.test(label)) return { icon: "✦", value: number ? signedVisualValue(label, number) : "!" };
  if (/방어/.test(label)) return { icon: "⬡", value: number ? signedVisualValue(label, number) : "+" };
  if (/에너지/.test(label)) return { icon: "⚡", value: number || "0" };
  if (/카드|손패/.test(label)) return { icon: "▤", value: number || "0" };
  if (/소환/.test(label)) return { icon: "◇", value: number ? `×${Math.abs(Number(number))}` : "+" };
  if (/약화|취약|바이러스|표식|상태/.test(label)) return { icon: "◎", value: number ? signedVisualValue(label, number) : "!" };
  return { icon: "•", value: number || "!" };
}

function renderCombatFxSource(fx) {
  if (fx.kind === "card" && fx.cardId) {
    const card = effectiveCard({ cardId: fx.cardId, upgraded: fx.cardUpgraded });
    const rarity = (fx.cardRarity ?? card.rarity) === "starter" ? "common" : fx.cardRarity ?? card.rarity;
    const cost = Number(fx.cardCost ?? card.cost ?? 0);
    return `
      <div class="fx-card-echo ${fx.cardType ?? card.type} rarity-${rarity}">
        <span class="fx-card-cost">${cost >= 90 ? "-" : cost}</span>
        <span class="fx-card-type" aria-hidden="true">${cardTypeIcon(fx.cardType ?? card.type)}</span>
        ${renderCardArt(card)}
        <strong>${fx.cardName}</strong>
      </div>
    `;
  }
  const actorTemplate = fx.actorTemplateId ? GAME_DATA.enemies.find((enemy) => enemy.id === fx.actorTemplateId) : null;
  if (fx.kind === "enemy-action" && actorTemplate) {
    const hitLabel = Number(fx.hitCount ?? 1) > 1 ? `×${fx.hitCount}` : "";
    const hitTitle = hitLabel ? ` · ${fx.actorCount > 1 ? "총 타격" : "연타"} ${hitLabel}` : "";
    return `
      <span class="fx-actor-echo" title="${fx.actorName ? `${fx.actorName} · ` : ""}${fx.moveName ?? fx.cardName}${hitTitle}"${fx.actorCount > 1 ? ` data-actor-count="×${fx.actorCount}"` : ""}${hitLabel ? ` data-hit-count="${hitLabel}"` : ""}>
        ${renderEnemySprite({ templateId: actorTemplate.id, name: actorTemplate.name, hp: actorTemplate.maxHp, maxHp: actorTemplate.maxHp }, actorTemplate)}
        <strong>${fx.moveName ?? fx.cardName}</strong>
        ${fx.actorName ? `<em>${fx.actorName}</em>` : ""}
      </span>
    `;
  }
  return `<span class="fx-card-name">${fx.cardName}</span>`;
}

function renderCombatFxChipRow(fx) {
  const chips = combatFxMergeChips(fx.chips ?? [], 2);
  if (!chips.length) return "";
  return `
    <span class="fx-chip-row">
      ${chips.map((chip) => `<i class="${chip.tone}" title="${chip.label}"><b aria-hidden="true">${combatFxChipIcon(chip)}</b><em>${combatFxVisibleChipText(chip)}</em></i>`).join("")}
    </span>
  `;
}

function combatFxChipIcon(chip = {}) {
  return cardOutcomeVisual(chip).icon;
}

function combatFxVisibleChipText(chip = {}) {
  const label = String(chip.label ?? "").trim();
  if (/^처치$/.test(label)) return "처치";
  return cardOutcomeText(chip, cardOutcomeVisual(chip));
}

function renderCombatActionRecap(run) {
  const fx = state.combatFx;
  if (!fx || run.phase !== "combat") return "";
  return `
    <section class="combat-action-recap sr-only fx-${fx.tone}" role="status" aria-live="polite" aria-label="${combatFxResultSentence(fx)}">
      <strong>${combatFxResultSentence(fx)}</strong>
    </section>
  `;
}

function combatFxKindLabel(fx) {
  if (fx.kind === "enemy-action") return "적 행동 결과";
  if (fx.targetMode === "all-enemies") return "광역 결과";
  return "카드 결과";
}

function combatFxActionSteps(fx) {
  return [
    { label: fx.kind === "enemy-action" ? "행동" : "카드", value: fx.cardName, tone: fx.kind === "enemy-action" ? "enemy" : fx.tone },
    { label: combatFxTargetStepLabel(fx), value: fx.targetName, tone: fx.targetMode === "self" ? "block" : "damage" },
    { label: "결과", value: fx.label, tone: fx.lethal ? "damage" : fx.tone }
  ];
}

function combatFxTargetStepLabel(fx) {
  if (fx.targetMode === "all-enemies") return "대상";
  if (fx.targetMode === "self") return fx.kind === "enemy-action" ? "대상" : "나";
  return "대상";
}

function combatFxResultSentence(fx) {
  if (fx.kind === "enemy-action") return `${fx.actorName ? `${fx.actorName}의 ` : ""}${fx.cardName} → ${fx.targetName}: ${fx.label}`;
  if (fx.targetMode === "self") return `${fx.cardName}: ${fx.label}`;
  if (fx.targetMode === "all-enemies") return `${fx.cardName}: 모든 적에게 ${fx.label}`;
  return `${fx.cardName}: ${fx.targetName}에게 ${fx.label}`;
}

function renderEntityFxBadge(mode, uid = null) {
  return "";
}

function renderEntityResultStack(mode, uid = null, options = {}) {
  const fx = state.combatFx;
  const chips = combatFxEntityResultChips(fx, mode, uid, options);
  if (!chips.length) return "";
  return `
    <div class="entity-result-stack ${mode}" aria-hidden="true">
      ${chips.map((chip) => `<i class="${chip.tone}${chip.emphasis ? " emphasis" : ""}" title="${chip.label}"><b>${combatFxChipIcon(chip)}</b><em>${combatFxVisibleChipText(chip)}</em></i>`).join("")}
    </div>
  `;
}

function combatFxEntityResultChips(fx, mode, uid = null, options = {}) {
  if (!fx || !combatFxTargetsEntity(fx, mode, uid)) return [];
  const chips = [];
  if (mode === "self") {
    if ((fx.selfHpLoss ?? 0) > 0) chips.push({ label: `-${fx.selfHpLoss}`, tone: "damage", emphasis: true });
    else if ((fx.selfBlockLoss ?? 0) > 0) chips.push({ label: `방어 -${fx.selfBlockLoss}`, tone: "block", emphasis: true });
    if ((fx.selfBlockGain ?? 0) > 0) chips.push({ label: `방어 +${fx.selfBlockGain}`, tone: "block", emphasis: true });
    if ((fx.selfHeal ?? 0) > 0) chips.push({ label: `회복 +${fx.selfHeal}`, tone: "block" });
    if ((fx.selfCleanse ?? 0) > 0) chips.push({ label: `정화 ${fx.selfCleanse}`, tone: "block" });
  } else {
    const hitAmount = combatFxHitAmount(fx, uid);
    const blockLossAmount = combatFxBlockLossAmount(fx, uid);
    if (!options.suppressPrimaryDamage) {
      if (fx.defeatedUids?.includes(uid)) chips.push({ label: "처치", tone: "damage", emphasis: true });
      else if (hitAmount > 0) chips.push({ label: `-${hitAmount}`, tone: "damage", emphasis: true });
      if (blockLossAmount > 0) chips.push({ label: `방어 -${blockLossAmount}`, tone: "damage", emphasis: hitAmount <= 0 });
    }
    if ((fx.enemyBlockGain ?? 0) > 0 && fx.targetUid === uid) chips.push({ label: `방어 +${fx.enemyBlockGain}`, tone: "block", emphasis: true });
    if ((fx.enemyHeal ?? 0) > 0 && fx.targetUid === uid) chips.push({ label: `회복 +${fx.enemyHeal}`, tone: "block" });
  }
  if (combatFxTargetsEntity(fx, mode, uid)) {
    for (const chip of fx.chips ?? []) {
      if (/^처치$/.test(chip.label)) continue;
      if (/^체력 -/.test(chip.label)) continue;
      if (/^방어 -/.test(chip.label)) continue;
      if (/^피해 /.test(chip.label) && chips.some((item) => item.tone === "damage")) continue;
      if (/^방어 /.test(chip.label) && chips.some((item) => item.tone === "block")) continue;
      chips.push({ label: chip.label, tone: chip.tone });
      if (chips.length >= 2) break;
    }
  }
  return dedupeFxChips(chips).slice(0, 2);
}

function renderEntityImpactRing(mode, uid = null) {
  const fx = state.combatFx;
  if (!fx || !combatFxTargetsEntity(fx, mode, uid)) return "";
  const tone = fx.lethal ? "lethal" : fx.tone;
  return `<span class="entity-impact-ring ${tone}" aria-hidden="true"></span>`;
}

function renderEntityHitSparks(mode, uid = null) {
  const fx = state.combatFx;
  if (!fx || !combatFxTargetsEntity(fx, mode, uid)) return "";
  const selfHit = mode === "self" && ((fx.selfHpLoss ?? 0) > 0 || (fx.selfBlockLoss ?? 0) > 0 || fx.kind === "enemy-action");
  const enemyBlockLoss = combatFxBlockLossAmount(fx, uid);
  const enemyHit = mode === "enemy" && (combatFxHitAmount(fx, uid) > 0 || enemyBlockLoss > 0 || fx.defeatedUids?.includes(uid));
  if (!selfHit && !enemyHit) return "";
  const tone = fx.defeatedUids?.includes(uid)
    ? "lethal"
    : enemyBlockLoss > 0 || (mode === "self" && (fx.selfBlockLoss ?? 0) > 0)
      ? "block"
      : "damage";
  return `
    <span class="entity-hit-sparks ${tone}" aria-hidden="true">
      <i></i><i></i><i></i>
    </span>
  `;
}

function combatFxTargetsEntity(fx, mode, uid = null) {
  if (!fx) return false;
  if (mode === "self") return fx.targetMode === "self";
  if (mode === "enemy") return fx.targetMode === "all-enemies" || (fx.targetMode === "enemy" && fx.targetUid === uid) || fx.hitUids?.includes(uid) || fx.defeatedUids?.includes(uid);
  return false;
}

function renderCombatCommandRow(run, recommendedCardUid) {
  const focus = combatFocus(run, recommendedCardUid);
  const showAdvisor = state.settings.tacticalAdvisor !== false;
  const signal = combatFocusSignal(focus);
  return `
    <section class="combat-command-row ${focus.tone} ${showAdvisor ? "" : "advisor-off"}" aria-label="이번 턴 핵심 정보">
      ${renderCombatForecast(run)}
      <div class="combat-focus-card" aria-label="${focus.title}. ${focus.detail}">
        <span>${signal.label}</span>
        <strong>${signal.value}</strong>
        <small>${focus.detail}</small>
      </div>
      ${showAdvisor ? renderTurnPlan(run) : ""}
    </section>
  `;
}

function combatFocusSignal(focus) {
  const signals = {
    danger: { label: "판단", value: "막기" },
    warning: { label: "주의", value: "상태" },
    pressure: { label: "기회", value: "처치" },
    steady: { label: "추천", value: "카드" }
  };
  return signals[focus.tone] ?? signals.steady;
}

function combatFocus(run, recommendedCardUid) {
  const combat = run.combat;
  const forecast = enemyIntentForecast(run);
  const aliveEnemies = combat.enemies.filter((enemy) => enemy.hp > 0);
  const selected = aliveEnemies.find((enemy) => enemy.uid === combat.selectedEnemyUid) ?? aliveEnemies[0];
  const recommended = combat.hand.find((card) => card.uid === recommendedCardUid);
  const recommendedName = recommended ? effectiveCard(recommended).name : "";
  const recommendedPreview = selected && recommended ? cardPlayPreview(run, recommended, selected.uid) : null;
  if (forecast.hpLoss > 0) {
    return {
      tone: "danger",
      title: "막거나 끝내기",
      detail: `그냥 넘기면 ${damageForecastText(run, forecast)}`
    };
  }
  if (selected && recommendedPreview) {
    if (recommendedPreview.playable && recommendedPreview.damage >= selected.hp) {
      return {
        tone: "pressure",
        title: `${selected.name} 마무리`,
        detail: `${recommendedName} 사용`
      };
    }
  }
  if (forecast.incomingStatuses.length) {
    const statusText = statusListText(forecast.incomingStatuses, "해로운 상태 없음");
    if (recommendedName && recommendedPreview?.playable) {
      return {
        tone: "warning",
        title: `${recommendedName} 사용`,
        detail: combatFocusStatusDetail(recommendedPreview, selected, aliveEnemies, statusText)
      };
    }
    return {
      tone: "warning",
      title: "상태 이상 대비",
      detail: `예정 상태: ${statusText}`
    };
  }
  if (recommendedName) {
    return {
      tone: "steady",
      title: `${recommendedName} 사용`,
      detail: recommendedPreview ? combatFocusTargetDetail(recommendedPreview, selected, aliveEnemies) : "추천 카드 강조 중"
    };
  }
  return {
    tone: "steady",
    title: "카드 사용",
    detail: selected ? `대상: ${selected.name}` : "쓸 카드 선택"
  };
}

function combatFocusStatusDetail(preview, selected, aliveEnemies, statusText) {
  const forecastText = `예정 상태: ${statusText}`;
  if (preview.cleansed > 0) return `현재 상태 정리 · ${forecastText}`;
  if (selected && preview.damage >= selected.hp) return `${selected.name} 처치로 상태 차단`;
  return `${combatFocusTargetDetail(preview, selected, aliveEnemies)} · ${forecastText}`;
}

function combatFocusTargetDetail(preview, selected, aliveEnemies = []) {
  const target = combatRecommendationTargetInfo(preview, selected, aliveEnemies);
  if (target.label === "나") return `나에게 ${target.detail}`;
  if (target.label === "모든 적") return `모든 적: ${target.detail}`;
  if (target.label === "대상 없음") return target.detail;
  return `${target.label}: ${target.detail}`;
}

function renderBossPhaseShock(run, boss) {
  if (!boss || !isFreshBossPhaseLog(run, boss.template)) return "";
  return `
    <div class="boss-phase-shock" role="status" aria-live="assertive">
      <span>2단계 전환</span>
      <strong>${boss.template.phaseName}</strong>
    </div>
  `;
}

function activeCombatBoss(run) {
  if (run.phase !== "combat") return null;
  const enemy = run.combat?.enemies?.find((item) => item.hp > 0 && GAME_DATA.enemies.find((template) => template.id === item.templateId)?.tier === "boss");
  if (!enemy) return null;
  const template = GAME_DATA.enemies.find((item) => item.id === enemy.templateId);
  return template ? { enemy, template } : null;
}

function combatBoardClass(run, lastTone, boss) {
  const base = [`combat-board`, `feedback-${lastTone}`];
  const turnCue = activeCombatTurnCue(run);
  const fx = run.phase === "combat" ? state.combatFx : null;
  const act = Math.max(1, Math.min(3, Math.floor(Number(run.currentRow ?? 0) / 7) + 1));
  const forecast = run.phase === "combat" ? enemyIntentForecast(run) : null;
  base.push(`arena-act-${act}`, `arena-${run.combat?.type ?? "combat"}`);
  if ((forecast?.incomingDamage ?? 0) > 0) base.push("enemy-aiming");
  if ((forecast?.hpLoss ?? 0) > 0) base.push("enemy-aiming-danger");
  if (combatTurnInputLocked(run)) base.push("turn-locked");
  if (turnCue?.kind) base.push(`turn-cue-${turnCue.kind}`);
  if (fx) {
    base.push("fx-active", `fx-tone-${fx.tone}`, `fx-mode-${fx.targetMode}`);
    if (fx.lethal) base.push("fx-lethal-board");
    if (fx.kind === "enemy-action") base.push("fx-enemy-board");
  }
  base.push(...combatArenaVariantClasses(run));
  if (boss) {
    base.push("boss-fight", `boss-${boss.template.sprite}`);
    if ((boss.enemy.phase ?? 1) >= 2) base.push("boss-phase-two");
  }
  return base.join(" ");
}

function combatArenaVariantClasses(run) {
  const node = currentRunNode(run);
  const row = Number(node?.row ?? run.currentRow ?? 0);
  const col = Number(node?.col ?? 0);
  const aliveEnemies = run.combat?.enemies?.filter((enemy) => enemy.hp > 0) ?? [];
  const enemyKey = aliveEnemies.map((enemy) => enemy.templateId).join(":") || "empty";
  const variant = visualSeed(`${run.seed}:${row}:${col}:${enemyKey}`) % 6;
  const localFloor = ((row % 7) + 7) % 7;
  const depth = localFloor <= 1 ? "entry" : localFloor >= 5 ? "deep" : "mid";
  return [`arena-variant-${variant}`, `arena-depth-${depth}`, combatArenaMotifClass(aliveEnemies)];
}

function combatArenaScene(run, boss) {
  const node = currentRunNode(run);
  const row = Number(node?.row ?? run.currentRow ?? 0);
  const col = Number(node?.col ?? 0);
  const aliveEnemies = run.combat?.enemies?.filter((enemy) => enemy.hp > 0) ?? [];
  const enemyKey = aliveEnemies.map((enemy) => enemy.templateId).join(":") || "empty";
  const seed = visualSeed(`${run.seed}:${row}:${col}:${enemyKey}:arena-scene`);
  const variant = seed % ARENA_VARIANT_SCENES.length;
  const motif = combatArenaMotifClass(aliveEnemies);
  let sceneKey = ARENA_VARIANT_SCENES[variant];
  if (boss?.template?.sprite === "cataloger") sceneKey = "archive";
  else if (boss?.template?.sprite === "algorithm") sceneKey = "abyss";
  else if (boss?.template?.sprite === "lastgate") sceneKey = "gate";
  else if (run.combat?.type === "elite" && motif === "arena-motif-machine") sceneKey = "machine";
  else if (motif === "arena-motif-coral" && variant % 2 === 0) sceneKey = "coral";
  else if (motif === "arena-motif-archive" && variant % 2 === 1) sceneKey = "archive";
  const scene = ARENA_SCENE_DEFINITIONS[sceneKey] ?? ARENA_SCENE_DEFINITIONS.abyss;
  const position = arenaBackdropPosition(scene.cell);
  const panX = (((seed >>> 5) % 9) - 4) * 0.42;
  const panY = (((seed >>> 9) % 7) - 3) * 0.34;
  const zoom = 1.0 + ((seed >>> 14) % 6) / 100;
  const hue = wrapHue(scene.hue + ((seed >>> 18) % 15) - 7);
  const fogX = clamp(scene.fogX + (((seed >>> 22) % 9) - 4), 18, 82);
  const fogY = clamp(scene.fogY + (((seed >>> 26) % 7) - 3), 22, 68);
  const lightX = clamp(scene.lightX + (((seed >>> 3) % 11) - 5), 18, 82);
  const lightY = clamp(scene.lightY + (((seed >>> 11) % 9) - 4), 16, 56);
  const localFloor = ((row % 7) + 7) % 7;
  const depthName = localFloor <= 1 ? "entry" : localFloor >= 5 ? "deep" : "mid";
  const stageHorizon = { entry: 58, mid: 61, deep: 64 }[depthName];
  const stageGlow = clamp(0.24 + (boss ? 0.08 : 0) + (run.combat?.type === "elite" ? 0.05 : 0) + localFloor * 0.012, 0.22, 0.42);
  const propDepth = clamp(0.96 + ((seed >>> 28) % 5) / 100, 0.96, 1.02);
  const commonStyle = `--arena-hue:${hue}; --arena-fog-x:${fogX}%; --arena-fog-y:${fogY}%; --arena-sweep:${scene.sweep}deg; --arena-drift-x:${panX.toFixed(1)}%; --arena-drift-y:${panY.toFixed(1)}%; --arena-light-x:${lightX}%; --arena-light-y:${lightY}%; --arena-zoom:${zoom.toFixed(2)}; --arena-horizon:${stageHorizon}%; --arena-stage-glow:${stageGlow.toFixed(2)}; --arena-prop-depth:${propDepth.toFixed(2)};`;
  return {
    key: sceneKey,
    label: scene.label,
    boardStyle: commonStyle,
    backgroundStyle: `${commonStyle} --arena-x:${position.x}; --arena-y:${position.y};`
  };
}

function arenaBackdropPosition(cell) {
  const [column, row] = cell;
  const x = ARENA_BACKDROP_COLUMNS <= 1 ? 0 : (column / (ARENA_BACKDROP_COLUMNS - 1)) * 100;
  const y = ARENA_BACKDROP_ROWS <= 1 ? 0 : (row / (ARENA_BACKDROP_ROWS - 1)) * 100;
  return { x: `${Number(x.toFixed(4))}%`, y: `${Number(y.toFixed(4))}%` };
}

function combatArenaMotifClass(enemies) {
  const sprites = enemies
    .map((enemy) => GAME_DATA.enemies.find((template) => template.id === enemy.templateId)?.sprite)
    .filter(Boolean);
  if (sprites.some((sprite) => ["hound", "engine", "jelly"].includes(sprite))) return "arena-motif-coral";
  if (sprites.some((sprite) => ["squid", "eel", "ray", "wisp"].includes(sprite))) return "arena-motif-signal";
  if (sprites.some((sprite) => ["clerk", "page", "choir", "mite"].includes(sprite))) return "arena-motif-archive";
  if (sprites.some((sprite) => ["sentinel", "drone", "diver", "bailiff"].includes(sprite))) return "arena-motif-machine";
  return "arena-motif-abyss";
}

function renderBossCurtain(boss) {
  if (!boss) return "";
  const { enemy, template } = boss;
  const threshold = Math.round(enemy.maxHp * (template.phaseAt ?? 0));
  const phaseTwo = (enemy.phase ?? 1) >= 2;
  const move = enemy.nextMove;
  const intentText = enemyIntentReadout(move);
  const objective = bossObjectiveText(template, "aria");
  const label = `보스전 상황: ${enemy.name}. ${phaseTwo ? template.phaseName : template.mechanic}. ${objective}. 현재 의도 ${intentText}. ${enemy.phase ?? 1}단계. 2단계 전환 체력 ${threshold} 이하`;
  return `
    <section class="boss-curtain ${phaseTwo ? "phase-two" : ""} sr-only" aria-label="${label}" title="${label}" aria-live="${phaseTwo ? "assertive" : "polite"}">
      <div class="boss-curtain-title">
        <span>${phaseTwo ? "2단계 돌입" : "심층 보스"}</span>
        <h2>${enemy.name}</h2>
        <p>${phaseTwo ? template.phaseName : template.mechanic}</p>
      </div>
      <dl class="boss-curtain-readout">
        <div><dt>목표</dt><dd>${objective}</dd></div>
        <div><dt>현재 의도</dt><dd>${intentText}</dd></div>
        <div><dt>단계</dt><dd>${enemy.phase ?? 1}단계</dd></div>
        <div><dt>전환 체력</dt><dd>${threshold} 이하</dd></div>
      </dl>
    </section>
  `;
}

function renderBossStatusStrip(boss) {
  if (!boss) return "";
  const { enemy, template } = boss;
  const threshold = Math.round(enemy.maxHp * (template.phaseAt ?? 0));
  const phaseTwo = (enemy.phase ?? 1) >= 2;
  const hpPercent = clamp(Math.round((enemy.hp / Math.max(1, enemy.maxHp)) * 100), 0, 100);
  const thresholdPercent = clamp(Math.round((threshold / Math.max(1, enemy.maxHp)) * 100), 0, 100);
  const move = enemy.nextMove;
  const intentLabel = enemyMoveLabel(move);
  const intentValue = enemyIntentCompactValue(move);
  const intentIcon = enemyIntentIconLabel(move);
  const phaseLabel = phaseTwo ? template.phaseName : "1단계";
  const objective = bossObjectiveText(template);
  const objectiveAria = bossObjectiveText(template, "aria");
  const patternCue = bossPatternCue(enemy, template);
  const patternAria = patternCue ? `. ${patternCue.title}. ${patternCue.detail}` : "";
  const aria = `${enemy.name}. ${phaseLabel}. ${objectiveAria}. 현재 의도 ${enemyIntentReadout(move)}. 2단계 전환 체력 ${threshold} 이하. 현재 체력 ${enemy.hp}/${enemy.maxHp}${patternAria}`;
  return `
    <section class="boss-status-strip ${phaseTwo ? "phase-two" : ""}" style="--boss-hp:${hpPercent}%; --boss-threshold:${thresholdPercent}%;" aria-label="${aria}">
      <header class="boss-status-head">
        <span>보스</span>
        <strong>${enemy.name}</strong>
        <em>${phaseLabel}</em>
      </header>
      <div class="boss-status-meter" aria-hidden="true"><i></i><b></b></div>
      <div class="boss-status-readout">
        <b class="boss-objective" title="${objectiveAria}">${objective}</b>
        <small title="${enemyIntentReadout(move)}"><b aria-hidden="true">${intentIcon}</b><span>${intentLabel}</span><i>${intentValue}</i></small>
      </div>
      ${renderBossPatternCue(patternCue)}
    </section>
  `;
}

function renderBossPatternCue(cue) {
  if (!cue) return "";
  return `
    <div class="boss-pattern-cue ${cue.tone}" aria-label="${cue.title}. ${cue.detail}">
      <strong>${cue.title}</strong>
      <ol>
        ${cue.steps.map((step) => `
          <li class="${step.tone} ${step.state}" title="${step.title}">
            <span>${step.label}</span>
          </li>
        `).join("")}
      </ol>
      <p>${cue.detail}</p>
    </div>
  `;
}

function bossPatternCue(enemy, template) {
  if (template?.id !== "last_gate_choir") return null;
  const phaseTwo = (enemy.phase ?? 1) >= 2;
  const currentId = enemy.nextMove?.id ?? "";
  const chain = [
    { id: "gate_slam", label: "문 낙하", title: "문 낙하: 큰 단타 뒤 호출이 이어집니다.", tone: "danger" },
    { id: "gate_call", label: "문지기 호출", title: "문지기 호출: 다음 레퀴엠을 앞두고 소환체가 시간을 빼앗습니다.", tone: "summon" },
    { id: "phase_requiem", label: "레퀴엠", title: "종말 레퀴엠: 4연타를 넘기면 마무리 기회가 열립니다.", tone: "danger" }
  ];
  const currentIndex = chain.findIndex((step) => step.id === currentId);
  const nextId = currentIndex >= 0 ? chain[(currentIndex + 1) % chain.length].id : chain[0].id;
  const title = phaseTwo ? "2페이즈 연쇄" : "2페이즈 예고";
  const detail = finalBossPatternDetail(currentId, phaseTwo);
  const tone = currentId === "phase_requiem" ? "danger" : currentId === "gate_call" ? "warning" : phaseTwo ? "pressure" : "steady";
  return {
    title,
    detail,
    tone,
    steps: chain.map((step) => ({
      ...step,
      state: step.id === currentId ? "current" : step.id === nextId ? "next" : ""
    }))
  };
}

function finalBossPatternDetail(currentId, phaseTwo) {
  if (currentId === "gate_slam") return "문 낙하 뒤 호출과 레퀴엠이 이어집니다. 체력과 다음 턴 방어를 남기세요.";
  if (currentId === "gate_call") return "다음은 레퀴엠입니다. 도금, 약화, 0-1비용 방어를 손패에 남기세요.";
  if (currentId === "phase_requiem") return "이번 턴은 연속 방어가 핵심입니다. 넘기면 마무리 기회가 열립니다.";
  if (phaseTwo) return "곧 문 낙하→호출→레퀴엠 순서가 옵니다. 체력과 방어 카드 순서를 아껴두세요.";
  return "2단계부터 문 낙하→호출→레퀴엠이 이어집니다. 진입 전 체력과 연속 방어를 보존하세요.";
}

function handLayoutStyle(count) {
  const cardWidth = count >= 8 ? 158 : count === 7 ? 164 : count === 6 ? 168 : 180;
  const cardHeight = count >= 6 ? 276 : 278;
  const gap = 8;
  const targetWidth = 980;
  const naturalWidth = count * cardWidth + Math.max(0, count - 1) * gap;
  const overlap = count > 5 ? Math.min(108, Math.max(0, Math.ceil((naturalWidth - targetWidth) / Math.max(1, count - 1)))) : 0;
  return `--hand-count:${count}; --hand-card-width:${cardWidth}px; --hand-card-height:${cardHeight}px; --hand-overlap:${overlap}px;`;
}

function renderCombatPlayPanel(run, recommendedCardUid) {
  const dockFx = state.combatFx?.targetMode === "self" ? state.combatFx : null;
  const dockFxClass = dockFx ? ` fx-target fx-${dockFx.tone}` : "";
  const dockFxLabel = dockFx ? ` data-fx-label="${dockFx.label}"` : "";
  return `
    <section class="combat-play-panel${dockFxClass}"${dockFxLabel} aria-label="카드 사용 영역">
      <div class="combat-guidance-stack">
        ${renderCombatActionRecap(run)}
        ${renderTargetSwitcher(run)}
        ${renderTargetAssist(run, recommendedCardUid)}
        ${renderFinalBossFinisherReserve(run)}
        ${renderRequiemReadiness(run)}
        <section class="combat-card-preview-rail" aria-label="카드 대상 미리보기" aria-live="polite" hidden></section>
      </div>
    </section>
  `;
}

function renderFinalBossFinisherReserve(run) {
  const cue = finalBossFinisherReserveCue(run);
  if (!cue) return "";
  const aria = [cue.kicker, cue.title, cue.detail, ...cue.metrics.map((metric) => `${metric.label} ${metric.value}`)].join(". ");
  return `
    <section class="requiem-readiness finisher-reserve ${cue.tone}" aria-label="${aria}">
      <div class="requiem-readiness-copy">
        <span>${cue.kicker}</span>
        <strong>${cue.title}</strong>
        <p>${cue.detail}</p>
      </div>
      <div class="requiem-readiness-metrics" aria-hidden="true">
        ${cue.metrics.map((metric) => `<i class="${metric.tone}"><b>${metric.label}</b><span>${metric.value}</span></i>`).join("")}
      </div>
    </section>
  `;
}

function finalBossFinisherReserveCue(run) {
  const boss = activeCombatBoss(run);
  if (!boss || boss.template.id !== "last_gate_choir" || (boss.enemy.phase ?? 1) >= 2) return null;
  const combat = run.combat;
  const threshold = Math.round(boss.enemy.maxHp * (boss.template.phaseAt ?? 0));
  const damageToPhase = Math.max(0, boss.enemy.hp - threshold);
  const previewEntries = (combat?.hand ?? [])
    .map((card) => {
      const preview = cardPlayPreview(run, card, boss.enemy.uid);
      return {
        card,
        preview,
        bossDamage: combatPreviewDamageToEnemy(preview, boss.enemy.uid)
      };
    })
    .filter((entry) => entry.preview.playable);
  if (!previewEntries.length) return null;

  const bossDamagePreviews = previewEntries.map((entry) => ({ ...entry.preview, bossDamage: entry.bossDamage }));
  const bestBossDamage = bestPreviewTotal(bossDamagePreviews, combat?.energy ?? 0, "bossDamage");
  const finisherCards = previewEntries
    .filter((entry) => cardSupportsFinish(effectiveCard(entry.card)))
    .map((entry) => effectiveCard(entry.card).name);
  const finisherNames = [...new Set(finisherCards)].slice(0, 2);
  const finisherText = finisherNames.length ? finisherNames.join(" · ") : "없음";
  const canFinishBoss = bestBossDamage >= boss.enemy.hp;
  const canOpenPhase = damageToPhase > 0 && bestBossDamage >= damageToPhase && !canFinishBoss;
  const nearPhaseLine = damageToPhase > 0 && damageToPhase <= Math.max(8, Math.ceil(boss.enemy.maxHp * 0.08));

  if (canFinishBoss) {
    return {
      tone: "pressure",
      kicker: "마지막 문",
      title: "본체 처치 우선",
      detail: "소환수가 남아도 본체를 쓰러뜨리면 전투가 끝납니다. 큰 피해 카드는 지금 본체에 모으세요.",
      chips: [
        { tone: "pressure", text: "본체 처치" },
        { tone: "danger", text: `피해 ${bestBossDamage}/${boss.enemy.hp}` },
        { tone: finisherNames.length ? "strong" : "steady", text: `마무리 ${finisherText}` }
      ],
      metrics: [
        requiemMetric("본체 체력", boss.enemy.hp, "danger"),
        requiemMetric("본체 피해", bestBossDamage, "pressure"),
        requiemMetric("마무리", finisherCards.length, finisherCards.length ? "guarded" : "warning"),
        requiemMetric("에너지", combat?.energy ?? 0, "steady")
      ]
    };
  }

  if (canOpenPhase) {
    return {
      tone: "warning",
      kicker: "2단계 전환선",
      title: "2단계 진입 전 마무리 보존",
      detail: `이번 손패로 전환선까지 ${damageToPhase} 피해를 밀 수 있습니다. 본체 처치가 아니면 큰 피해 카드를 모두 쓰지 마세요.`,
      chips: [
        { tone: "warning", text: `전환선 ${damageToPhase}` },
        { tone: "pressure", text: `본체 피해 ${bestBossDamage}` },
        { tone: finisherNames.length ? "strong" : "danger", text: `보존 ${finisherText}` }
      ],
      metrics: [
        requiemMetric("전환선", damageToPhase, "warning"),
        requiemMetric("본체 피해", bestBossDamage, "pressure"),
        requiemMetric("마무리", finisherCards.length, finisherCards.length ? "guarded" : "danger"),
        requiemMetric("체력", boss.enemy.hp, "steady")
      ]
    };
  }

  if (nearPhaseLine && finisherCards.length) {
    return {
      tone: "guarded",
      kicker: "마무리 카드 보존",
      title: "문을 열 카드와 끝낼 카드 분리",
      detail: `2단계 전환선까지 ${damageToPhase} 피해 남았습니다. 문 낙하 뒤 바로 끝낼 큰 피해나 뽑기 카드를 한 장 남기세요.`,
      chips: [
        { tone: "guarded", text: `전환선 ${damageToPhase}` },
        { tone: "strong", text: `보존 ${finisherText}` },
        { tone: "steady", text: `본체 체력 ${boss.enemy.hp}` }
      ],
      metrics: [
        requiemMetric("전환선", damageToPhase, "guarded"),
        requiemMetric("본체 피해", bestBossDamage, bestBossDamage > 0 ? "pressure" : "steady"),
        requiemMetric("마무리", finisherCards.length, "guarded"),
        requiemMetric("에너지", combat?.energy ?? 0, "steady")
      ]
    };
  }

  return null;
}

function combatPreviewDamageToEnemy(preview, enemyUid) {
  return preview.enemyDeltas?.find((delta) => delta.uid === enemyUid)?.damage ?? 0;
}

function renderRequiemReadiness(run) {
  const cue = finalBossRequiemReadiness(run);
  if (!cue) return "";
  const aria = [cue.kicker, cue.title, cue.detail, ...cue.metrics.map((metric) => `${metric.label} ${metric.value}`)].join(". ");
  return `
    <section class="requiem-readiness ${cue.tone}" aria-label="${aria}">
      <div class="requiem-readiness-copy">
        <span>${cue.kicker}</span>
        <strong>${cue.title}</strong>
        <p>${cue.detail}</p>
      </div>
      <div class="requiem-readiness-metrics" aria-hidden="true">
        ${cue.metrics.map((metric) => `<i class="${metric.tone}"><b>${metric.label}</b><span>${metric.value}</span></i>`).join("")}
      </div>
    </section>
  `;
}

function finalBossRequiemReadiness(run) {
  const boss = activeCombatBoss(run);
  if (!boss || boss.template.id !== "last_gate_choir" || (boss.enemy.phase ?? 1) < 2) return null;
  const moveId = boss.enemy.nextMove?.id ?? "";
  const requiemMove = boss.template.moves.find((move) => move.id === "phase_requiem");
  if (!requiemMove) return null;

  const combat = run.combat;
  const selected = combat?.enemies?.find((enemy) => enemy.uid === combat.selectedEnemyUid && enemy.hp > 0) ?? boss.enemy;
  const previews = (combat?.hand ?? [])
    .map((card) => cardPlayPreview(run, card, selected?.uid))
    .filter((preview) => preview.playable);
  const handBlock = bestPreviewTotal(previews, combat?.energy ?? 0, "block");
  const retainedCards = (combat?.hand ?? []).map((card) => effectiveCard(card)).filter((card) => card.retain);
  const retainedProfiles = retainedCards.map((card) => cardDefenseProfile(card));
  const retainedBlock = retainedProfiles.reduce((total, profile) => total + profile.block, 0);
  const retainedBurst = retainedCards.filter((card) => cardSupportsBurstDefense(card)).length;
  const retainedWeak = retainedProfiles.reduce((total, profile) => total + profile.weak, 0);
  const plated = statusAmount(run.player, "plated");
  const currentForecast = enemyIntentForecast(run);
  const projectedRequiem = finalBossProjectedMoveDamage(run, boss.enemy, requiemMove, moveId === "gate_slam" ? 2 : moveId === "gate_call" ? 1 : 0);

  if (moveId === "phase_requiem") {
    const incoming = Math.max(currentForecast.incomingDamage, projectedRequiem);
    const cover = Math.max(0, run.player.block + handBlock);
    const gap = Math.max(0, incoming - cover);
    return {
      tone: gap > 0 ? "danger" : "guarded",
      kicker: "종말 레퀴엠",
      title: gap > 0 ? "레퀴엠 방어 부족" : "레퀴엠 방어 가능",
      detail: gap > 0
        ? `예상 피해 ${incoming}, 현재/손패 방어 ${cover}. 체력 ${gap} 손실 전에 방어를 먼저 쓰세요.`
        : `예상 피해 ${incoming}, 현재/손패 방어 ${cover}. 이번 턴을 넘기면 마무리 기회가 열립니다.`,
      metrics: [
        requiemMetric("예상", incoming, gap > 0 ? "danger" : "steady"),
        requiemMetric("손패 방어", cover, gap > 0 ? "warning" : "guarded"),
        requiemMetric("에너지", combat?.energy ?? 0, "steady")
      ]
    };
  }

  if (moveId === "gate_call") {
    const prepCover = retainedBlock + plated;
    const gap = Math.max(0, projectedRequiem - prepCover);
    const hasPrep = retainedBurst > 0 || plated > 0 || retainedWeak > 0;
    return {
      tone: hasPrep ? gap > 0 ? "warning" : "guarded" : "danger",
      kicker: "다음 행동",
      title: hasPrep ? "레퀴엠 준비 있음" : "레퀴엠 방어 손패 없음",
      detail: hasPrep
        ? `다음 레퀴엠 본체 예상 ${projectedRequiem}. 보존 방어 ${retainedBurst}장과 도금 ${plated}로 버틸 순서를 남기세요.`
        : `다음 레퀴엠 본체 예상 ${projectedRequiem}. 보존 방어가 없으니 뽑기, 도금, 약화 카드를 우선하세요.`,
      metrics: [
        requiemMetric("예상", projectedRequiem, "danger"),
        requiemMetric("보존", retainedBurst, hasPrep ? "guarded" : "danger"),
        requiemMetric("보존 방어", retainedBlock, retainedBlock > 0 ? "guarded" : "warning"),
        requiemMetric("도금", plated, plated > 0 ? "guarded" : "steady")
      ]
    };
  }

  if (moveId === "gate_slam") {
    const currentGap = Math.max(0, currentForecast.hpLoss - handBlock);
    return {
      tone: currentGap > 0 ? "warning" : "steady",
      kicker: "연쇄 시작",
      title: "문 낙하 뒤 체력 보존",
      detail: `이번 손실 ${Math.max(0, currentForecast.hpLoss)}, 다음 레퀴엠 본체 예상 ${projectedRequiem}. 보존 방어와 도금을 남겨 두세요.`,
      metrics: [
        requiemMetric("이번 손실", Math.max(0, currentForecast.hpLoss), currentGap > 0 ? "warning" : "steady"),
        requiemMetric("손패 방어", handBlock, handBlock > 0 ? "guarded" : "warning"),
        requiemMetric("레퀴엠", projectedRequiem, "danger")
      ]
    };
  }

  return {
    tone: retainedBurst > 0 || plated > 0 ? "steady" : "warning",
    kicker: "2페이즈 대비",
    title: "레퀴엠 방어 준비",
    detail: `문 낙하→호출→레퀴엠 전까지 보존 방어, 약화, 도금을 손패에 남기세요.`,
    metrics: [
      requiemMetric("보존", retainedBurst, retainedBurst > 0 ? "guarded" : "warning"),
      requiemMetric("도금", plated, plated > 0 ? "guarded" : "steady"),
      requiemMetric("예상", projectedRequiem, "danger")
    ]
  };
}

function requiemMetric(label, value, tone) {
  return { label, value, tone };
}

function finalBossProjectedMoveDamage(run, enemy, move, turnsAway = 0) {
  if (!move?.damage) return 0;
  const difficulty = GAME_DATA.difficulties.find((item) => item.id === run.difficulty) ?? GAME_DATA.difficulties[0];
  const hits = move.hits ?? 1;
  const enemyWeak = Math.max(0, statusAmount(enemy, "weak") - Math.max(0, turnsAway));
  const playerVulnerable = Math.max(0, statusAmount(run.player, "vulnerable") - Math.max(0, turnsAway));
  const playerFragile = Math.max(0, statusAmount(run.player, "fragile") - Math.max(0, turnsAway));
  let simulatedMark = statusAmount(run.player, "mark");
  let incoming = 0;
  for (let hit = 0; hit < hits; hit += 1) {
    let damage = Math.max(0, Math.round(move.damage * (difficulty.enemyDamage ?? 1)) + statusAmount(enemy, "strength"));
    if (enemyWeak > 0) damage = Math.floor(damage * 0.75);
    if (playerVulnerable > 0) damage = Math.ceil(damage * 1.5);
    if (playerFragile > 0) damage = Math.ceil(damage * 1.15);
    if (simulatedMark > 0) {
      damage += 2;
      simulatedMark -= 1;
    }
    incoming += damage;
  }
  return incoming;
}

function statusAmount(entity, status) {
  return Math.max(0, entity?.statuses?.[status] ?? 0);
}

function renderCombatResourceDock(run) {
  const selfFx = state.combatFx?.targetMode === "self" ? state.combatFx : null;
  const spendFx = state.combatFx?.kind === "card" && state.combatFx.energySpent > 0 ? state.combatFx : null;
  const dockFx = selfFx ?? spendFx;
  const dockFxClass = [
    selfFx ? "fx-target" : "",
    spendFx ? "fx-spent" : "",
    dockFx ? `fx-${dockFx.tone}` : ""
  ].filter(Boolean).join(" ");
  const dockFxLabel = selfFx ? selfFx.label : spendFx ? `에너지 -${spendFx.energySpent}` : "";
  return `
    <aside class="combat-resource-stack${dockFxClass ? ` ${dockFxClass}` : ""}"${dockFxLabel ? ` data-fx-label="${dockFxLabel}"` : ""} aria-label="에너지와 전투 더미">
      ${renderCombatEnergyPanel(run.combat)}
      ${renderCombatPileDock(run.combat)}
    </aside>
  `;
}

function renderCombatPileDock(combat) {
  return `
    <nav class="combat-pile-dock" aria-label="전투 더미">
      <div class="pile-row">
        ${combatPileButton(combat, "draw")}
        ${combatPileButton(combat, "hand")}
        ${combatPileButton(combat, "discard")}
        ${combatPileButton(combat, "exhaust")}
      </div>
    </nav>
  `;
}

function renderCombatEnergyPanel(combat) {
  const pipCount = Math.max(combat.maxEnergy, combat.energy);
  const visiblePipCount = Math.min(8, pipCount);
  const playableCount = combat.hand.filter((card) => cardCost(card, combat) <= combat.energy).length;
  const energyState = combat.energy > 0 ? "ready" : "empty";
  const pips = Array.from({ length: visiblePipCount }, (_, index) => `<i class="${index < combat.energy ? "filled" : ""}" aria-hidden="true"></i>`).join("");
  return `
    <section class="combat-energy-panel ${energyState}" aria-label="에너지 ${combat.energy}/${combat.maxEnergy}. 지금 낼 수 있는 카드 ${playableCount}장">
      <span aria-hidden="true">⚡</span>
      <strong><b>${combat.energy}</b><small>/${combat.maxEnergy}</small></strong>
      <div class="energy-pips" style="--energy-pip-count:${visiblePipCount}">${pips}</div>
      <em>${playableCount ? `지금 낼 수 있는 카드 ${playableCount}장` : "전하 부족"}</em>
    </section>
  `;
}

function renderTurnPlan(run) {
  const plan = combatTurnPlan(run);
  const summary = turnPlanSummary(plan);
  const stepCount = plan.sequence.length;
  return `
    <details class="turn-plan ${plan.tone}" aria-label="추천 순서: ${summary}">
      <summary>
        <span>순서</span>
        <strong>${stepCount}</strong>
      </summary>
      <div class="turn-plan-grid">
        <article>
          <span>방어</span>
          <strong>${plan.survival.title}</strong>
          <small>${plan.survival.detail}</small>
        </article>
        <article>
          <span>처치</span>
          <strong>${plan.pressure.title}</strong>
          <small>${plan.pressure.detail}</small>
        </article>
        <article>
          <span>손패</span>
          <strong>${plan.flow.title}</strong>
          <small>${plan.flow.detail}</small>
        </article>
      </div>
      ${renderTurnPlanSequence(plan.sequence)}
    </details>
  `;
}

function renderTurnPlanSequence(sequence = []) {
  if (!sequence.length) return "";
  return `
    <ol class="turn-plan-sequence" aria-label="추천 사용 순서">
      ${sequence
        .map(
          (step, index) => `
            <li>
              <b>${index + 1}</b>
              <span>
                <strong>${step.cardName}</strong>
                <small>${step.reason}</small>
              </span>
              <em>${step.cost <= 0 ? "무료" : `에너지 ${step.cost}`}</em>
              <div>${step.chips.map((chip) => `<i class="${chip.tone}">${chip.label}</i>`).join("")}</div>
            </li>
          `
        )
        .join("")}
    </ol>
  `;
}

function turnPlanSummary(plan) {
  if (plan.tone === "danger" || plan.tone === "guarded") return plan.survival.title;
  if (plan.tone === "pressure") return plan.pressure.title;
  return plan.flow.title;
}

function combatTurnPlan(run) {
  const combat = run.combat;
  const forecast = enemyIntentForecast(run);
  const aliveEnemies = combat.enemies.filter((enemy) => enemy.hp > 0);
  const selected = aliveEnemies.find((enemy) => enemy.uid === combat.selectedEnemyUid) ?? aliveEnemies[0];
  const previewEntries = combat.hand
    .map((card) => ({ card, preview: cardPlayPreview(run, card, selected?.uid) }))
    .filter((entry) => entry.preview.playable);
  const previews = previewEntries.map((entry) => entry.preview);
  const harmfulCount = PLAYER_HARMFUL_STATUSES.reduce((total, status) => total + Math.max(0, run.player.statuses?.[status] ?? 0), 0);
  const bestBlock = bestPreviewTotal(previews, combat.energy, "block");
  const bestDamage = bestPreviewTotal(previews, combat.energy, "damage");
  const bestDraw = bestPreviewTotal(previews, combat.energy, "draw");
  const energyGain = previews.reduce((total, preview) => total + Math.max(0, preview.energyDelta + preview.cost), 0);
  const remainingRisk = Math.max(0, forecast.hpLoss - bestBlock);
  const survival =
    forecast.hpLoss <= 0
      ? { title: "현재 방어 충분", detail: damageForecastText(run, forecast) }
      : remainingRisk <= 0
        ? { title: "손패 방어로 막을 수 있음", detail: `이번 턴 예상 손실 ${forecast.hpLoss}, 손패 최대 방어 ${bestBlock}` }
        : { title: `체력 ${remainingRisk} 손실 위험`, detail: `이번 턴 예상 손실 ${forecast.hpLoss}, 손패 최대 방어 ${bestBlock}` };
  const pressure = selected
    ? bestDamage >= selected.hp
      ? { title: `${selected.name} 처치 가능`, detail: `예상 피해 ${bestDamage} · 남은 체력 ${selected.hp}` }
      : { title: `피해 ${bestDamage} 가능`, detail: `${selected.name} 체력 ${selected.hp}/${selected.maxHp} · ${enemyIntentReadout(selected.nextMove, "행동 확인 전")}` }
    : { title: "대상 없음", detail: "살아있는 적이 없습니다." };
  const flow = {
    title: `쓸 수 있는 카드 ${previews.length}장`,
    detail: [`에너지 ${combat.energy}`, bestDraw ? `추가 뽑기 ${bestDraw}` : "", energyGain ? `에너지 회복 ${energyGain}` : ""].filter(Boolean).join(" · ")
  };
  return {
    tone: remainingRisk > 0 ? "danger" : forecast.hpLoss > 0 ? "guarded" : bestDamage > 0 ? "pressure" : "steady",
    survival,
    pressure,
    flow,
    sequence: combatTurnSequence(run, previewEntries, forecast, selected, harmfulCount)
  };
}

function combatTurnSequence(run, previewEntries, forecast, selected, harmfulCount) {
  const combat = run.combat;
  let remainingEnergy = Math.max(0, combat.energy);
  return previewEntries
    .map((entry) => {
      const reason = combatRecommendationReason(entry.preview, forecast, selected, harmfulCount);
      const card = effectiveCard(entry.card);
      return {
        ...entry,
        cardName: card.name,
        reason,
        score: combatCardRecommendationScore(entry.preview, forecast, selected, harmfulCount)
      };
    })
    .filter((entry) => entry.score > 0 || cardPreviewChips(entry.preview).length > 0)
    .sort((left, right) => right.score - left.score || left.preview.cost - right.preview.cost || left.cardName.localeCompare(right.cardName))
    .reduce((sequence, entry) => {
      if (sequence.length >= 3) return sequence;
      const cost = Math.max(0, entry.preview.cost ?? 0);
      if (cost > remainingEnergy) return sequence;
      remainingEnergy = Math.max(0, remainingEnergy - cost + Math.max(0, entry.preview.energyDelta + cost));
      sequence.push({
        cardName: entry.cardName,
        cost,
        reason: entry.reason.text.replace(/[.。]+$/, ""),
        chips: cardPreviewChips(entry.preview).slice(0, 3)
      });
      return sequence;
    }, []);
}

function combatRecommendedCardUid(run) {
  if (run.phase !== "combat" || !run.combat) return null;
  const combat = run.combat;
  const forecast = enemyIntentForecast(run);
  const aliveEnemies = combat.enemies.filter((enemy) => enemy.hp > 0);
  const selected = aliveEnemies.find((enemy) => enemy.uid === combat.selectedEnemyUid) ?? aliveEnemies[0];
  const harmfulCount = PLAYER_HARMFUL_STATUSES.reduce((total, status) => total + Math.max(0, run.player.statuses?.[status] ?? 0), 0);
  let best = { uid: null, score: 0 };
  for (const card of combat.hand) {
    const preview = cardPlayPreview(run, card, selected?.uid);
    if (!preview.playable) continue;
    const score = combatCardRecommendationScore(preview, forecast, selected, harmfulCount);
    if (score > best.score) best = { uid: card.uid, score };
  }
  return best.uid;
}

function combatCardRecommendationScore(preview, forecast, selected, harmfulCount) {
  let score = 0;
  if (selected && preview.damage >= selected.hp) score += 80;
  score += preview.damage * (forecast.hpLoss > 0 ? 1.2 : 1.6);
  score += preview.block * (forecast.hpLoss > 0 ? 2.4 : 0.8);
  if (forecast.hpLoss > 0 && preview.block >= forecast.hpLoss) score += 20;
  score += preview.draw * 8;
  score += Math.max(0, preview.energyDelta + preview.cost) * 10;
  score += preview.charge * 3;
  score += preview.focus * 6;
  score += preview.generated * 4;
  score += preview.discounted * 3;
  score += preview.upgraded * 3;
  score += preview.heal * 6;
  score += preview.cleansed * (harmfulCount ? 14 : 2);
  score -= preview.hpLoss * (forecast.hpLoss > 0 ? 3 : 2);
  score -= preview.maxHpLoss * 5;
  score += preview.relics.length * 2;
  for (const status of preview.statuses) score += combatStatusRecommendationScore(status);
  for (const condition of preview.conditions ?? []) score += condition.met ? 4 : -5;
  return score;
}

function combatStatusRecommendationScore(status) {
  const amount = Math.max(0, status.amount ?? 0);
  if (!amount) return 0;
  if (status.scope === "enemy" || status.scope === "allEnemies") {
    const multiplier = status.scope === "allEnemies" ? 1.4 : 1;
    if (status.status === "weak") return amount * 7 * multiplier;
    if (status.status === "vulnerable") return amount * 6 * multiplier;
    if (status.status === "virus") return amount * 5 * multiplier;
    if (status.status === "mark") return amount * 4 * multiplier;
    if (status.status === "frail" || status.status === "fragile") return amount * 3 * multiplier;
  }
  if (status.scope === "self") {
    if (status.status === "counter" || status.status === "plated") return amount * 5;
    if (status.status === "charge" || status.status === "focus") return amount * 4;
  }
  return amount;
}

function bestPreviewTotal(previews, energy, key) {
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

function renderCombatPileInspector(run) {
  if (run.phase !== "combat" || !run.combat) return "";
  const current = combatPileDefinition(state.pileOpen) ?? COMBAT_PILE_DEFINITIONS[0];
  const cards = combatPileCards(run.combat, current.id);
  const summary = combatPileSummary(cards);
  const drawPreview = current.id === "draw" ? combatDrawPreview(cards) : "";
  return `
    <div class="modal-backdrop">
      <section class="deck-modal pile-modal" aria-label="전투 더미 점검">
        <header>
          <div>
            <h2>전투 더미 점검</h2>
            <p>${current.hint}</p>
          </div>
          <button data-action="close-pile">닫기</button>
        </header>
        <nav class="pile-tabs" aria-label="확인할 더미">
          ${COMBAT_PILE_DEFINITIONS.map((pileDef) => {
            const pileCards = combatPileCards(run.combat, pileDef.id);
            return `<button data-action="open-pile" data-id="${pileDef.id}" ${pileDef.id === current.id ? `aria-current="true"` : ""}><strong>${pileDef.label}</strong><span>${pileCards.length}</span></button>`;
          }).join("")}
        </nav>
        <section class="pile-insight" aria-label="${current.label} 요약">
          <div><dt>카드 수</dt><dd>${cards.length}</dd></div>
          <div><dt>평균 비용</dt><dd>${summary.averageCost}</dd></div>
          <div><dt>강화</dt><dd>${summary.upgraded}/${cards.length}</dd></div>
          <div><dt>주요 종류</dt><dd>${summary.primaryType}</dd></div>
          ${drawPreview}
        </section>
        <div class="deck-grid pile-grid">
          ${cards.length ? cards.map((card) => renderCard(card, { compact: true })).join("") : `<p class="empty-pile">이 더미는 비어 있습니다.</p>`}
        </div>
      </section>
    </div>
  `;
}

function combatPileButton(combat, id) {
  const pileDef = combatPileDefinition(id);
  const cards = combatPileCards(combat, id);
  const selected = state.pileOpen === id ? `aria-pressed="true"` : `aria-pressed="false"`;
  const emptyClass = cards.length ? "has-cards" : "is-empty";
  return `
    <button class="pile pile-${id} ${emptyClass}" data-action="open-pile" data-id="${id}" ${selected} aria-label="${pileDef.label} 더미 ${cards.length}장 보기" title="${pileDef.label} ${cards.length}장">
      <span class="pile-icon" aria-hidden="true">${combatPileIcon(id)}</span>
      <span class="pile-label">${pileDef.label}</span>
      <strong><b>${cards.length}</b><small>장</small></strong>
    </button>
  `;
}

function combatPileIcon(id) {
  return {
    draw: "↻",
    hand: "▣",
    discard: "↓",
    exhaust: "×"
  }[id] ?? "•";
}

function renderCombatForecast(run) {
  const forecast = enemyIntentForecast(run);
  const primary = combatForecastPrimary(run, forecast);
  const chips = combatForecastSecondaryChips(run, forecast)
    .filter((chip) => chip.tone !== "calm" && chip.value !== primary.value && chip.detail !== primary.detail)
    .slice(0, 2);
  const chipAria = chips.map((chip) => `${chip.fullLabel}: ${chip.value}`).join(". ");
  return `
    <div class="combat-forecast priority threat-${primary.tone}" aria-label="이번 턴 적 행동 예고. ${primary.ariaLabel ?? primary.label}: ${primary.value}. ${primary.detail}. ${chipAria}">
      <article class="forecast-primary ${primary.tone}" title="${primary.ariaLabel ?? primary.label}: ${primary.detail}">
        <span aria-hidden="true">${primary.icon}</span>
        <strong>${primary.value}</strong>
        <small>${primary.detail}</small>
      </article>
      ${chips.length ? `<div class="forecast-secondary">
        ${chips
          .map(
            (chip) => `
              <span class="forecast-chip ${chip.tone}" title="${chip.fullLabel}: ${chip.detail}" aria-label="${chip.fullLabel}: ${chip.value}. ${chip.detail}">
                <b aria-hidden="true">${chip.icon}</b>
                <strong>${chip.value}</strong>
              </span>
            `
          )
          .join("")}
      </div>` : ""}
    </div>
  `;
}

function combatForecastPrimary(run, forecast) {
  const setupText = combatSetupText(forecast);
  if (forecast.hpLoss > 0) {
    return {
      tone: "danger",
      icon: "✦",
      label: "피해",
      value: `-${forecast.hpLoss}`,
      ariaLabel: "막아야 할 피해",
      detail: damageForecastText(run, forecast)
    };
  }
  if (forecast.incomingDamage > 0) {
    return {
      tone: "guarded",
      icon: "⬡",
      label: "피해",
      value: "0",
      ariaLabel: "방어로 막는 피해",
      detail: damageForecastText(run, forecast)
    };
  }
  if (forecast.incomingStatuses.length) {
    return {
      tone: "warning",
      icon: "◎",
      label: "상태",
      value: `+${statusEntryTotal(forecast.incomingStatuses)}`,
      ariaLabel: "받을 상태 이상",
      detail: "해로운 상태를 받기 전에 처치, 약화, 정화를 고려하세요."
    };
  }
  if (setupText !== "준비 없음") {
    return {
      tone: "setup",
      icon: combatForecastSetupIcon(forecast),
      label: "준비",
      value: combatForecastSetupValue(forecast),
      ariaLabel: "적 준비 행동",
      detail: "다음 공격이 커질 수 있습니다."
    };
  }
  return {
    tone: "calm",
    icon: "✓",
    label: "안전",
    value: "0",
    ariaLabel: "적 공격 없음",
    detail: "공격하거나 다음 손패를 준비하세요."
  };
}

function statusEntryTotal(entries = []) {
  return entries.reduce((total, entry) => total + Math.max(1, Number(entry.amount ?? 1)), 0);
}

function combatForecastSetupIcon(forecast) {
  if (forecast.summons > 0) return "◇";
  if (forecast.enemyBlock > 0) return "⬡";
  return "+";
}

function combatForecastSetupValue(forecast) {
  if (forecast.summons > 0) return `×${forecast.summons}`;
  if (forecast.enemyBlock > 0) return `+${forecast.enemyBlock}`;
  if (forecast.enemyHealing > 0) return `+${forecast.enemyHealing}`;
  if (forecast.enemyBuffs.length) return String(statusEntryTotal(forecast.enemyBuffs));
  return "!";
}

function combatForecastSetupLabel(forecast) {
  if (forecast.summons > 0) return `소환 ${forecast.summons}`;
  if (forecast.enemyBlock > 0) return `방어 ${forecast.enemyBlock}`;
  if (forecast.enemyHealing > 0) return `회복 ${forecast.enemyHealing}`;
  if (forecast.enemyBuffs.length) return `강화 ${statusEntryTotal(forecast.enemyBuffs)}`;
  return "준비";
}

function combatForecastSecondaryChips(run, forecast) {
  const damageTone = forecast.hpLoss > 0 ? "danger" : forecast.incomingDamage > 0 ? "guarded" : "calm";
  const setupText = combatSetupText(forecast);
  const damageValue = forecast.hpLoss > 0 ? `-${forecast.hpLoss}` : "0";
  const statusValue = forecast.incomingStatuses.length ? `+${statusEntryTotal(forecast.incomingStatuses)}` : "0";
  const setupValue = setupText === "준비 없음" ? "0" : combatForecastSetupValue(forecast);
  return [
    { tone: damageTone, icon: "✦", label: "피해", fullLabel: "받을 피해", value: damageValue, detail: damageForecastText(run, forecast) },
    { tone: forecast.incomingStatuses.length ? "warning" : "calm", icon: "◎", label: "상태", fullLabel: "상태 이상", value: statusValue, detail: statusListText(forecast.incomingStatuses, "해로운 상태 없음") },
    { tone: setupText === "준비 없음" ? "calm" : "setup", icon: combatForecastSetupIcon(forecast), label: "준비", fullLabel: "적 준비", value: setupValue, detail: setupText }
  ];
}

function renderTargetAssist(run, recommendedCardUid = null) {
  const combat = run.combat;
  const aliveEnemies = combat.enemies.filter((enemy) => enemy.hp > 0);
  const selected = aliveEnemies.find((enemy) => enemy.uid === combat.selectedEnemyUid) ?? aliveEnemies[0];
  if (!selected) return "";
  const insight = state.settings.tacticalAdvisor !== false ? combatRecommendedCardInsight(run, recommendedCardUid) : null;
  const targetLabel = selected.name;
  const targetDetail = enemyIntentReadout(selected.nextMove, "행동 확인 전");
  const actionLabel = insight ? "추천" : "사용";
  const actionName = insight ? insight.cardName : "카드를 고르세요";
  const nextAction = insight ? `${insight.cardName} 사용` : "카드 선택";
  const reason = insight ? insight.reason : selected.nextMove ? `${enemyIntentReadout(selected.nextMove)} 확인` : "대상을 확인하세요";
  const assistLabel = insight ? `현재 대상 ${targetLabel}. 추천 ${nextAction}. ${reason}` : `현재 대상 ${targetLabel}. ${nextAction}. ${reason}`;
  return `
    <section class="target-assist combat-action-guide ${insight?.tone ?? "steady"}" aria-label="${assistLabel}" aria-live="polite">
      <div class="assist-target-lock">
        <span class="assist-label">대상</span>
        <strong>${targetLabel}</strong>
        <small>${targetDetail}</small>
      </div>
      <div class="assist-action-lock">
        <span>${actionLabel}</span>
        <b>${actionName}</b>
        <small class="assist-reason">${reason}</small>
      </div>
    </section>
  `;
}

function renderTargetSwitcher(run) {
  if (run.phase !== "combat" || !run.combat) return "";
  const aliveEnemies = run.combat.enemies.filter((enemy) => enemy.hp > 0);
  if (aliveEnemies.length <= 1) return "";
  const selectedIndex = Math.max(0, aliveEnemies.findIndex((enemy) => enemy.uid === run.combat.selectedEnemyUid));
  const selected = aliveEnemies[selectedIndex] ?? aliveEnemies[0];
  const targetPosition = `${selectedIndex + 1}/${aliveEnemies.length}`;
  const targetDetail = enemyIntentReadout(selected.nextMove, "행동 확인 전");
  return `
    <section class="target-switcher combat-action-guide" aria-label="대상 전환. 현재 대상 ${selected.name}, ${targetPosition}. ${targetDetail}">
      <button type="button" class="target-switch-button" data-action="cycle-enemy" data-id="-1" aria-label="이전 대상 선택" title="이전 대상">‹</button>
      <div class="target-switch-current">
        <span>대상</span>
        <strong>${selected.name}</strong>
        <small>${targetPosition} · ${targetDetail}</small>
      </div>
      <button type="button" class="target-switch-button" data-action="cycle-enemy" data-id="1" aria-label="다음 대상 선택" title="다음 대상">›</button>
    </section>
  `;
}

function renderPlayHint(run, recommendedCardUid) {
  const insight = combatRecommendedCardInsight(run, recommendedCardUid);
  if (!insight) return "";
  return `
    <section class="play-hint ${insight.tone}" aria-label="추천 카드 이유" role="status" aria-live="polite">
      <span>추천</span>
      <strong>${insight.cardName}</strong>
      <small>${insight.reason}</small>
      <div>
        ${insight.chips.map((chip) => `<b class="${chip.tone}">${chip.label}</b>`).join("")}
      </div>
    </section>
  `;
}

function combatRecommendedCardInsight(run, recommendedCardUid) {
  if (!recommendedCardUid) return null;
  const combat = run.combat;
  const card = combat.hand.find((item) => item.uid === recommendedCardUid);
  if (!card) return null;
  const aliveEnemies = combat.enemies.filter((enemy) => enemy.hp > 0);
  const selected = aliveEnemies.find((enemy) => enemy.uid === combat.selectedEnemyUid) ?? aliveEnemies[0];
  const preview = cardPlayPreview(run, card, selected?.uid);
  if (!preview.playable) return null;
  const forecast = enemyIntentForecast(run);
  const harmfulCount = PLAYER_HARMFUL_STATUSES.reduce((total, status) => total + Math.max(0, run.player.statuses?.[status] ?? 0), 0);
  const reason = combatRecommendationReason(preview, forecast, selected, harmfulCount);
  const targetInfo = combatRecommendationTargetInfo(preview, selected, aliveEnemies);
  return {
    cardName: effectiveCard(card).name,
    tone: reason.tone,
    reason: reason.text,
    targetLabel: targetInfo.label,
    targetDetail: targetInfo.detail,
    chips: cardPreviewChips(preview).slice(0, 4)
  };
}

function combatRecommendationTargetInfo(preview, selected, aliveEnemies = []) {
  const targetUids = combatPreviewTargetUids(preview, aliveEnemies, selected);
  if (targetUids.length > 1) {
    return { label: "모든 적", detail: combatPreviewTargetBadge(preview, selected, targetUids.length) };
  }
  if (targetUids.length === 1) {
    return { label: selected?.name ?? "적", detail: combatPreviewTargetBadge(preview, selected, 1) };
  }
  if (combatPreviewAffectsSelf(preview)) {
    return { label: "나", detail: combatPreviewSelfBadge(preview) };
  }
  return { label: selected?.name ?? "대상 없음", detail: enemyIntentReadout(selected?.nextMove, "행동 확인 전") };
}

function combatRecommendationReason(preview, forecast, selected, harmfulCount) {
  if (selected && preview.damage >= selected.hp) {
    return { tone: "damage", text: `${selected.name} 처치 가능.` };
  }
  if (forecast.hpLoss > 0 && preview.block >= forecast.hpLoss) {
    return { tone: "block", text: `예상 손실 ${forecast.hpLoss}를 막습니다.` };
  }
  if (preview.cleansed > 0 && harmfulCount > 0) {
    return { tone: "block", text: "쌓인 해로운 상태를 정리할 수 있습니다." };
  }
  if (preview.energyDelta + preview.cost > 0 || preview.draw > 0 || preview.generated > 0) {
    return { tone: "resource", text: "쓸 카드나 에너지를 늘립니다." };
  }
  if (forecast.hpLoss > 0 && preview.block > 0) {
    return { tone: "block", text: "이번 피해를 줄입니다." };
  }
  if (preview.damage > 0) {
    return { tone: "damage", text: selected ? `${selected.name}에게 피해를 넣습니다.` : "피해를 먼저 넣습니다." };
  }
  if (preview.blockedDamage > 0) {
    return { tone: "damage", text: selected ? `${selected.name}의 방어를 깎습니다.` : "적 방어를 먼저 깎습니다." };
  }
  if (preview.block > 0) {
    return { tone: "block", text: "다음 공격을 막습니다." };
  }
  return { tone: "steady", text: "지금 가장 무난한 선택입니다." };
}

function damageForecastText(run, forecast) {
  if (forecast.incomingDamage <= 0) return "공격 없음";
  if (forecast.hpLoss <= 0) return `현재 방어 ${run.player.block}로 모두 차단`;
  if (forecast.blockedDamage > 0) return `방어 ${forecast.blockedDamage} 차단 · 체력 -${forecast.hpLoss}`;
  return `방어 없음 · 체력 -${forecast.hpLoss}`;
}

function statusListText(entries, fallback) {
  if (!entries.length) return fallback;
  return entries.map(({ status, amount }) => `${keywordLabel(status)} ${amount}`).join(", ");
}

function combatSetupText(forecast) {
  const parts = [];
  if (forecast.enemyBlock > 0) parts.push(`방어 ${forecast.enemyBlock}`);
  if (forecast.enemyHealing > 0) parts.push(`회복 ${forecast.enemyHealing}`);
  if (forecast.enemyBuffs.length) parts.push(statusListText(forecast.enemyBuffs, ""));
  if (forecast.summons > 0) parts.push(`소환 ${forecast.summons}`);
  return parts.join(" · ") || "준비 없음";
}

function renderEnemyThreatStrip(enemy, selected = false) {
  const threat = enemyThreatProfile(enemy, selected);
  const visible = enemyThreatShouldSurface(threat, selected);
  return `
    <div class="enemy-threat ${threat.tone} ${visible ? "compact" : "sr-only"}" aria-label="${enemy.name} 위협 요약: ${threat.title}. ${threat.detail}">
      <span>${threat.label}</span>
      <strong>${threat.title}</strong>
      <small>${threat.detail}</small>
      <div>
        ${threat.chips
          .map((chip) => {
            const visual = enemyThreatIconVisual(chip);
            return `<i class="${chip.tone}" title="${chip.label}"><b aria-hidden="true">${visual.icon}</b><em>${visual.value}</em><span class="sr-only">${chip.label}</span></i>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

function enemyThreatShouldSurface(threat, selected = false) {
  if (!threat?.chips?.length) return false;
  if (threat.tone === "danger" || threat.tone === "warning" || threat.tone === "summon") return true;
  if (!selected || threat.tone !== "attack") return false;
  return threat.chips.some((chip) => chip.tone !== "attack" && chip.tone !== "calm");
}

function enemyThreatIconVisual(chip = {}) {
  const label = String(chip.label ?? "");
  const number = label.match(/[+-]?\d+/)?.[0] ?? "";
  if (/피해|공격/.test(label)) return { icon: "✦", value: number || "!" };
  if (/방어/.test(label)) return { icon: "⬡", value: number ? signedVisualValue(label, number) : "+" };
  if (/회복/.test(label)) return { icon: "+", value: number ? signedVisualValue(label, number) : "+" };
  if (/소환/.test(label)) return { icon: "◇", value: number ? `×${Math.abs(Number(number))}` : "+" };
  if (/약화|취약|바이러스|표식|상태|취약성|허약/.test(label)) return { icon: "◎", value: number || "!" };
  return { icon: "•", value: number || "!" };
}

function enemyThreatProfile(enemy, selected = false) {
  const move = enemy.nextMove ?? {};
  const damage = enemyMoveDamageTotal(move);
  const statuses = move.applyToPlayer ?? [];
  const statusText = statusListText(statuses, "");
  const setup = enemyMoveSetupParts(move);
  const chips = enemyThreatChips(move, damage, statuses, setup);
  if (damage > 0 && statuses.length) {
    return {
      tone: damage >= 14 ? "danger" : "warning",
      label: selected ? "현재 대상" : "위협",
      title: `피해 ${damage} + 상태`,
      detail: `${statusText}까지 함께 들어옵니다.`,
      chips
    };
  }
  if (damage > 0) {
    return {
      tone: damage >= 18 ? "danger" : "attack",
      label: selected ? "현재 대상" : "위협",
      title: damage >= 18 ? `큰 공격 ${damage}` : `공격 ${damage}`,
      detail: move.hits > 1 ? `${move.damage} 피해를 ${move.hits}번 시도합니다.` : "이번 턴 체력을 직접 깎으려 합니다.",
      chips
    };
  }
  if (statuses.length) {
    return {
      tone: "warning",
      label: selected ? "현재 대상" : "위협",
      title: "상태 이상",
      detail: `${statusText}을 받습니다. 정화나 빠른 처치를 고려하세요.`,
      chips
    };
  }
  if (setup.length) {
    return {
      tone: move.summon?.length ? "summon" : "setup",
      label: selected ? "현재 대상" : "준비",
      title: setup[0],
      detail: setup.length > 1 ? setup.slice(1).join(" · ") : "다음 턴 위협이 커질 수 있습니다.",
      chips
    };
  }
  return {
    tone: "calm",
    label: selected ? "현재 대상" : "여유",
    title: "직접 피해 없음",
    detail: "이번 턴은 공격이나 덱 정비에 시간을 쓸 수 있습니다.",
    chips: chips.length ? chips : [{ tone: "calm", label: "안전" }]
  };
}

function enemyMoveLabel(move = null, fallback = "행동 없음") {
  return move?.label ?? fallback;
}

function enemyIntentReadout(move = null, fallback = "행동 없음") {
  return move?.intent ?? move?.label ?? fallback;
}

function enemyIntentOutcomeLine(move = {}) {
  move ??= {};
  const parts = [];
  const damage = enemyMoveDamageTotal(move);
  if (damage > 0) parts.push(move.hits > 1 ? `피해 ${move.damage} x${move.hits} · 총 ${damage}` : `피해 ${damage}`);
  for (const status of move.applyToPlayer ?? []) parts.push(`${keywordLabel(status.status)} ${status.amount}`);
  for (const item of enemyMoveSetupParts(move)) parts.push(item);
  return parts.join(" · ") || enemyIntentReadout(move);
}

function enemyMoveDamageTotal(move = {}) {
  const safeMove = move ?? {};
  return Math.max(0, Number(safeMove.damage ?? 0) * Math.max(1, Number(safeMove.hits ?? 1)));
}

function enemyMoveSetupParts(move = {}) {
  move ??= {};
  const parts = [];
  if (move.block > 0) parts.push(`방어 +${move.block}`);
  if (move.heal > 0) parts.push(`회복 +${move.heal}`);
  if (move.summon?.length) parts.push(`소환 ${move.summon.length}`);
  if (move.self?.length) parts.push(statusListText(move.self, ""));
  return parts.filter(Boolean);
}

function enemyThreatChips(move = {}, damage = 0, statuses = [], setup = []) {
  const chips = [];
  if (damage > 0) chips.push({ tone: damage >= 18 ? "danger" : "attack", label: `피해 ${damage}` });
  if (move.hits > 1) chips.push({ tone: "attack", label: `${move.hits}회 공격` });
  for (const status of statuses.slice(0, 2)) chips.push({ tone: "warning", label: `${keywordLabel(status.status)} ${status.amount}` });
  for (const item of setup.slice(0, 2)) chips.push({ tone: item.startsWith("소환") ? "summon" : "setup", label: item });
  if (!chips.length && move.intent) chips.push({ tone: "calm", label: move.intent });
  return chips.slice(0, 4);
}

function renderEnemyCrowdStrip(run, enemies = []) {
  if (enemies.length < 3) return "";
  const attackers = enemies.filter((enemy) => enemyMoveDamageTotal(enemy.nextMove) > 0);
  const totalDamage = enemies.reduce((sum, enemy) => sum + enemyMoveDamageTotal(enemy.nextMove), 0);
  const specialMoves = enemies.filter((enemy) => enemyMoveSetupParts(enemy.nextMove).length || enemy.nextMove?.type === "summon" || enemy.nextMove?.type === "debuff");
  const selected = enemies.find((enemy) => enemy.uid === run.combat?.selectedEnemyUid) ?? enemies[0];
  const tone = totalDamage >= 30 ? "danger" : totalDamage > 0 ? "warning" : specialMoves.length ? "setup" : "calm";
  const chips = [
    { label: `적 ${enemies.length}`, tone: "count" },
    totalDamage > 0 ? { label: `예고 ${totalDamage}`, tone: "attack" } : { label: "공격 없음", tone: "calm" },
    specialMoves.length ? { label: `특수 ${specialMoves.length}`, tone: "setup" } : { label: `공격체 ${attackers.length}`, tone: "attack" },
    { label: `대상 ${selected?.name ?? "확인"}`, tone: "target" }
  ];
  const detail = totalDamage > 0
    ? `${attackers.length}명이 총 ${totalDamage} 피해를 예고합니다.`
    : specialMoves.length
      ? `${specialMoves.length}명이 상태 이상, 방어, 소환 같은 특수 행동을 준비합니다.`
      : "공격 예고는 없지만 다음 행동을 나눠 확인하세요.";
  return `
    <div class="enemy-crowd-strip ${tone}" aria-label="다수 조우 요약: ${detail} 현재 선택 대상 ${selected?.name ?? "없음"}">
      <span>다수 조우</span>
      <strong>${detail}</strong>
      <div>
        ${chips.map((chip) => `<i class="${chip.tone}">${chip.label}</i>`).join("")}
      </div>
    </div>
  `;
}

function renderEnemy(run, enemy, index = 0, totalEnemies = 1) {
  const selected = run.combat.selectedEnemyUid === enemy.uid;
  const move = enemy.nextMove;
  const template = GAME_DATA.enemies.find((item) => item.id === enemy.templateId);
  const attackDamage = enemyMoveDamageTotal(move);
  const fxTarget = combatFxTargetsEntity(state.combatFx, "enemy", enemy.uid);
  const fxSource = state.combatFx?.kind === "enemy-action" && state.combatFx?.actorUid === enemy.uid;
  const fxDefeated = state.combatFx?.defeatedUids?.includes(enemy.uid);
  if (enemy.hp <= 0 && !fxDefeated) return "";
  const fxHitAmount = combatFxHitAmount(state.combatFx, enemy.uid);
  const fxBlockLossAmount = combatFxBlockLossAmount(state.combatFx, enemy.uid);
  const fxHit = (fxHitAmount > 0 || fxBlockLossAmount > 0) && !fxDefeated;
  const enemyAria = enemyCombatantAriaLabel(enemy, move);
  const intentLabel = enemyMoveLabel(move);
  const intentVisualLabel = enemyIntentCompactLabel(move);
  const intentText = enemyIntentReadout(move);
  const intentOutcome = enemyIntentOutcomeLine(move);
  const intentAria = `${enemy.name} 다음 행동: ${intentLabel}${move?.intent ? ` ${move.intent}` : ""}`;
  return `
    <button class="enemy-card intent-${move?.type ?? "none"} ${attackDamage > 0 ? "intent-attack-player" : ""} ${attackDamage >= 18 ? "intent-heavy" : ""} ${selected ? "selected" : ""} ${fxSource ? "fx-source" : ""} ${fxTarget ? "fx-target" : ""} ${fxHit ? "fx-hit" : ""} ${fxDefeated ? "fx-defeated" : ""} ${enemy.summoned ? "summoned" : ""} ${enemy.hp <= 0 ? "dead" : ""}" data-action="select-enemy" data-id="${enemy.uid}" style="${enemyStageStyle(index, totalEnemies, template)}" aria-label="${enemyAria}">
      ${renderEntityImpactRing("enemy", enemy.uid)}
      ${selected ? `<span class="enemy-target-marker" aria-hidden="true"></span>` : ""}
      ${renderEntityHitSparks("enemy", enemy.uid)}
      ${renderEnemyIntentLane(move)}
      <div class="intent" aria-label="${intentAria}" data-intent-title="${intentText}" data-intent-outcome="${intentOutcome}">
        <i aria-hidden="true">${enemyIntentIconLabel(move)}</i>
        <span>
          <em>${intentVisualLabel}</em>
          <strong>${intentLabel}</strong>
          <small>${intentOutcome}</small>
        </span>
      </div>
      ${renderEnemyThreatStrip(enemy, selected)}
      ${renderEnemySprite(enemy, template)}
      ${renderEntityResultStack("enemy", enemy.uid, { suppressPrimaryDamage: Boolean(fxHitAmount || fxBlockLossAmount || fxDefeated) })}
      ${fxHitAmount ? `<div class="entity-damage-pop" aria-hidden="true"><b>✦</b><em>-${fxHitAmount}</em></div>` : fxBlockLossAmount ? `<div class="entity-damage-pop blocked" aria-hidden="true"><b>⬡</b><em>-${fxBlockLossAmount}</em></div>` : ""}
      <div class="combatant-plate enemy-plate">
        <h3><span class="enemy-name-text">${enemy.name}</span>${renderBossPhaseChip(enemy, template)}${enemy.summoned ? `<small>소환체</small>` : ""}</h3>
        ${healthBar(enemy.hp, enemy.maxHp)}
        ${renderBlockReadout(enemy.block)}
        ${renderStatuses(enemy.statuses)}
      </div>
      ${renderEntityFxBadge("enemy", enemy.uid)}
      ${renderBossMechanic(enemy, template)}
    </button>
  `;
}

function playerCombatantAriaLabel(run) {
  const block = run.player.block > 0 ? `방어 ${run.player.block}` : "방어 없음";
  return `${run.player.name}. 체력 ${run.player.hp}/${run.player.maxHp}. ${block}. ${statusSummarySentence(run.player.statuses)}`;
}

function enemyCombatantAriaLabel(enemy, move) {
  const block = enemy.block > 0 ? `방어 ${enemy.block}` : "방어 없음";
  const intent = move ? `다음 행동 ${enemyMoveLabel(move)}. ${move.intent ?? ""}` : "다음 행동 없음.";
  return `${enemy.name}. 체력 ${enemy.hp}/${enemy.maxHp}. ${block}. ${intent} ${statusSummarySentence(enemy.statuses)}`;
}

function renderEnemyIntentLane(move = {}) {
  const damage = enemyMoveDamageTotal(move);
  if (damage <= 0) return "";
  const label = move.hits > 1 ? `${move.damage}x${move.hits}` : String(damage);
  return `<span class="enemy-intent-lane" data-threat="${label}" aria-hidden="true"></span>`;
}

function renderBossPhaseChip(enemy, template) {
  if (!template || template.tier !== "boss") return "";
  const phase = enemy.phase ?? 1;
  const threshold = Math.round(enemy.maxHp * (template.phaseAt ?? 0));
  const phaseTwo = phase >= 2;
  const phaseName = phaseTwo ? template.phaseName : "1단계";
  const label = `${enemy.name} ${phase}단계. ${phaseName}. 2단계 전환 체력 ${threshold} 이하`;
  return `<span class="boss-phase-chip ${phaseTwo ? "phase-two" : ""}" title="${label}" aria-label="${label}"><b>${phase}</b><i>/2</i></span>`;
}

function enemyStageStyle(index = 0, totalEnemies = 1, template = null) {
  const total = Math.max(1, totalEnemies);
  const center = (total - 1) / 2;
  const offset = index - center;
  const depth = Math.min(2.2, Math.abs(offset));
  const isBoss = template?.tier === "boss";
  const isElite = template?.tier === "elite";
  const lift = isBoss ? 0 : Math.round(-12 - depth * 18 + (index % 2 === 0 ? 0 : -6));
  const scale = isBoss ? 1 : clamp(1 - depth * (isElite ? 0.035 : 0.055), 0.86, 1);
  const z = isBoss ? 50 : Math.round(44 - depth * 6 + index);
  return `--enemy-index:${index}; --enemy-count:${total}; --enemy-stage-y:${lift}px; --enemy-stage-scale:${scale.toFixed(3)}; --enemy-stage-z:${z}; --enemy-entry-delay:${index * 70}ms;`;
}

function enemyIntentIconLabel(move = {}) {
  return {
    attack: "✦",
    defend: "⬡",
    debuff: "!",
    buff: "+",
    summon: "◇"
  }[move?.type] ?? "•";
}

function enemyIntentCompactLabel(move = {}) {
  if (enemyMoveDamageTotal(move) > 0) return move.hits > 1 ? "연타" : "공격";
  if (move.block > 0) return "방어";
  if (move.heal > 0) return "회복";
  if (move.applyToPlayer?.length) return "상태";
  if (move.summon?.length) return "소환";
  if (move.self?.length) return "강화";
  return enemyMoveLabel(move, "대기");
}

function enemyIntentCompactValue(move = {}) {
  const damage = enemyMoveDamageTotal(move);
  if (damage > 0) return move.hits > 1 ? `${move.damage}x${move.hits}` : String(damage);
  if (move.block > 0) return `+${move.block}`;
  if (move.heal > 0) return `+${move.heal}`;
  if (move.applyToPlayer?.length) return String(statusEntryTotal(move.applyToPlayer));
  if (move.summon?.length) return `x${move.summon.length}`;
  if (move.self?.length) return "+";
  return "0";
}

function renderBossMechanic(enemy, template) {
  if (!template || template.tier !== "boss") return "";
  const threshold = Math.round(enemy.maxHp * (template.phaseAt ?? 0));
  const objective = bossObjectiveText(template);
  return `
    <div class="boss-mechanic">
      <strong>특징</strong>
      <span>${template.mechanic}</span>
      <small class="boss-objective">${objective}</small>
      <div class="boss-phase">
        <em>${enemy.phase ?? 1}단계${(enemy.phase ?? 1) >= 2 ? ` · ${template.phaseName}` : ""}</em>
        <small>2단계 전환 체력 ${threshold} 이하</small>
      </div>
    </div>
  `;
}

function bossObjectiveText(template, mode = "short") {
  if (!template || template.tier !== "boss") return "";
  return mode === "aria" ? "보스 본체를 쓰러뜨리면 전투가 끝납니다" : "본체 처치";
}

function renderEnemySprite(enemy, template) {
  const spriteTemplate = template ?? { id: enemy.templateId, tier: "normal", sprite: "unknown" };
  const motif = ENEMY_SPRITE_MOTIFS[spriteTemplate.sprite] ?? "machine";
  const seed = visualSeed(`${spriteTemplate.id}:${spriteTemplate.sprite}:${spriteTemplate.name}`);
  const phaseClass = spriteTemplate.tier === "boss" && (enemy.phase ?? 1) >= 2 ? "phase-two" : "";
  const atlasCell = enemySpriteAtlasCell(spriteTemplate, motif);
  const portraitCell = enemyPortraitCell(spriteTemplate);
  const intentCell = enemyIntentSigilCell(enemy.nextMove);
  return `
    <div class="character-sprite enemy-sprite sprite-${spriteTemplate.sprite} motif-${motif} tier-${spriteTemplate.tier} ${phaseClass}" data-sprite="${spriteTemplate.sprite}" data-atlas-cell="${atlasCell}" data-portrait-cell="${portraitCell}" data-intent-cell="${intentCell}" style="${enemySpriteStyle(spriteTemplate, seed, atlasCell, intentCell, portraitCell, enemy)}" aria-hidden="true">
      <span class="sprite-motion-echo"></span>
      <span class="sprite-ground-burst"></span>
      <span class="enemy-silhouette-glow"></span>
      <span class="enemy-sprite-art"></span>
      <span class="enemy-sprite-rim"></span>
      <span class="enemy-intent-sigil"></span>
    </div>
  `;
}

function enemyPortraitCell(template) {
  return ENEMY_PORTRAIT_CELLS[template.sprite] ? template.sprite : "drone";
}

function enemySpriteAtlasCell(template, motif) {
  return ENEMY_SPRITE_ATLAS[template.sprite] ?? ENEMY_MOTIF_ATLAS[motif] ?? "orbEngine";
}

function enemyIntentSigilCell(move) {
  if (move?.type === "attack" && (move.damage ?? 0) * (move.hits ?? 1) >= 18) return "statusWarning";
  return ENEMY_INTENT_SIGIL_CELLS[move?.type ?? "none"] ?? ENEMY_INTENT_SIGIL_CELLS.none;
}

function enemySpriteStyle(template, seed, atlasCell, intentCell, portraitCell, enemy = null) {
  const tierHue = { normal: 184, elite: 37, boss: 348 }[template.tier] ?? 184;
  const hue = wrapHue(tierHue + ((seed >>> 2) % 54) - 27);
  const accent = wrapHue(hue + 48 + ((seed >>> 9) % 46));
  const x = 22 + ((seed >>> 5) % 58);
  const y = 18 + ((seed >>> 11) % 54);
  const pose = ENEMY_SPRITE_POSES[template.sprite] ?? {};
  const scale = pose.scale ?? 1;
  const flip = pose.flip ?? 1;
  const rotate = pose.rotate ?? 0;
  const shiftX = pose.shiftX ?? "0px";
  const shiftY = pose.shiftY ?? "0px";
  const atlas = atlasPosition(atlasCell);
  const intent = atlasPosition(intentCell);
  const portrait = enemyPortraitPosition(portraitCell);
  return `--sprite-hue:${hue}; --sprite-accent:${accent}; --sprite-x:${x}%; --sprite-y:${y}%; --sprite-scale:${scale}; --sprite-flip:${flip}; --sprite-rotate:${rotate}deg; --sprite-shift-x:${shiftX}; --sprite-shift-y:${shiftY}; --sprite-atlas-x:${atlas.x}; --sprite-atlas-y:${atlas.y}; --enemy-portrait-x:${portrait.x}; --enemy-portrait-y:${portrait.y}; --intent-atlas-x:${intent.x}; --intent-atlas-y:${intent.y}; --enemy-sprite-image:url('${enemyCombatantImage(template, enemy)}');`;
}

function enemyCombatantImage(template, enemy = null) {
  const phaseTwo = template.tier === "boss" && (enemy?.phase ?? 1) >= 2;
  if (template.sprite === "cataloger") return phaseTwo ? "../public/assets/combatants/boss-cataloger-phase2.png" : "../public/assets/combatants/boss-cataloger.png";
  if (template.sprite === "algorithm") return phaseTwo ? "../public/assets/combatants/boss-algorithm-phase2.png" : "../public/assets/combatants/boss-algorithm.png";
  if (template.sprite === "lastgate") return phaseTwo ? "../public/assets/combatants/boss-lastgate-phase2.png" : "../public/assets/combatants/boss-lastgate.png";
  if (template.sprite === "bailiff") return "../public/assets/combatants/elite-bailiff.png";
  if (template.sprite === "engine") return "../public/assets/combatants/elite-engine.png";
  if (template.sprite === "knight") return "../public/assets/combatants/elite-knight.png";
  if (template.sprite === "cantor") return "../public/assets/combatants/elite-cantor.png";
  if (template.sprite === "colossus") return "../public/assets/combatants/elite-colossus.png";
  return `../public/assets/combatants/enemy-${template.sprite}.png`;
}

function enemyPortraitPosition(sprite) {
  const [column, row] = ENEMY_PORTRAIT_CELLS[sprite] ?? ENEMY_PORTRAIT_CELLS.drone;
  const x = ENEMY_PORTRAIT_ATLAS_COLUMNS <= 1 ? 0 : (column / (ENEMY_PORTRAIT_ATLAS_COLUMNS - 1)) * 100;
  const y = ENEMY_PORTRAIT_ATLAS_ROWS <= 1 ? 0 : (row / (ENEMY_PORTRAIT_ATLAS_ROWS - 1)) * 100;
  return { x: `${Number(x.toFixed(4))}%`, y: `${Number(y.toFixed(4))}%` };
}

function atlasPosition(cellName) {
  const [column, row] = SPRITE_ATLAS_CELLS[cellName] ?? SPRITE_ATLAS_CELLS.cardStrike;
  const x = SPRITE_ATLAS_COLUMNS <= 1 ? 0 : (column / (SPRITE_ATLAS_COLUMNS - 1)) * 100;
  const y = SPRITE_ATLAS_ROWS <= 1 ? 0 : (row / (SPRITE_ATLAS_ROWS - 1)) * 100;
  return { x: `${Number(x.toFixed(4))}%`, y: `${Number(y.toFixed(4))}%` };
}

function visualSeed(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function wrapHue(value) {
  return ((value % 360) + 360) % 360;
}

function renderReward(run) {
  const reward = run.reward;
  const relicChoices = rewardRelicChoices(reward);
  const cardReady = Boolean(reward.selectedCardId || reward.cardSkipped);
  const recommendedCardId = cardReady ? null : rewardRecommendedCardId(run);
  const skipRecommended = !cardReady && rewardSkipRecommended(run, recommendedCardId);
  const previewCardId = activeRewardPreviewCardId(run, cardReady);
  const sourceLabel = rewardSourceKicker(reward.sourceType);
  const relicBadge = relicChoices.length
    ? `<span><b aria-hidden="true">◇</b>${relicChoices.length}택1</span>`
    : reward.relicId
      ? renderRelic(reward.relicId, true)
      : "";
  return `
    <section class="reward-layout">
      <div class="reward-copy">
        <h2>보상 선택</h2>
        <p>필요한 것만 고르고 다음 경로로 이어갑니다.</p>
        <div class="reward-bonus">
          <span class="reward-source-chip">${sourceLabel}</span>
          <span><b aria-hidden="true">¢</b>+${reward.gold}</span>
          ${relicBadge}
        </div>
        ${renderRewardCompass(run)}
        ${renderRewardFlow(run)}
      </div>
      ${renderRewardSpotlight(run, recommendedCardId, skipRecommended, previewCardId)}
      <div class="reward-choice-stage ${relicChoices.length ? "with-relics" : "cards-only"} ${previewCardId ? "preview-active" : ""} ${cardReady ? "card-ready" : ""} ${run.reward.selectedRelicId ? "relic-ready" : ""}">
        <section class="reward-card-choices" aria-label="카드 보상 선택">
          <div class="reward-section-heading reward-card-heading">
            <strong>카드</strong>
            ${renderRewardSkipChoice(run, skipRecommended)}
          </div>
          <div class="reward-cards">
            ${reward.cards
              .map(
                (cardId) => `
                  <article class="reward-option ${reward.selectedCardId === cardId ? "selected" : ""} ${recommendedCardId === cardId ? "recommended" : ""} ${previewCardId === cardId ? "previewing" : ""}" role="group" aria-label="${rewardOptionAriaLabel(run, cardId, recommendedCardId === cardId, previewCardId === cardId, reward.selectedCardId === cardId)}">
                    ${renderCard({ uid: cardId, cardId, upgraded: false }, { action: "reward-card", id: cardId, recommended: recommendedCardId === cardId, recommendationLabel: "추천", ariaLabel: rewardOptionAriaLabel(run, cardId, recommendedCardId === cardId, previewCardId === cardId, reward.selectedCardId === cardId) })}
                    ${reward.selectedCardId === cardId ? `<em class="reward-selected-stamp">선택됨</em>` : ""}
                    ${renderRewardPickLine(run, cardId)}
                    ${renderRewardOptionDetail(run, cardId)}
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
        ${renderRewardRelicChoices(run)}
      </div>
    </section>
  `;
}

function activeRewardPreviewCardId(run, cardReady = Boolean(run?.reward?.selectedCardId || run?.reward?.cardSkipped)) {
  const previewCardId = state.rewardPreviewCardId;
  if (!run?.reward || cardReady || !previewCardId) return null;
  return run.reward.cards.includes(previewCardId) ? previewCardId : null;
}

function previewRewardCardFromElement(cardElement) {
  const run = state.run;
  const reward = run?.reward;
  if (state.screen !== "game" || run?.phase !== "reward" || !reward || reward.selectedCardId || reward.cardSkipped) return;
  const cardId = cardElement?.dataset?.id;
  if (!cardId || !reward.cards.includes(cardId) || state.rewardPreviewCardId === cardId) return;
  state.rewardPreviewCardId = cardId;
  refreshRewardPreview();
}

function clearRewardCardPreview() {
  if (!state.rewardPreviewCardId) return;
  state.rewardPreviewCardId = null;
  refreshRewardPreview();
}

function refreshRewardPreview() {
  const run = state.run;
  if (state.screen !== "game" || run?.phase !== "reward" || !run.reward) return;
  const reward = run.reward;
  const cardReady = Boolean(reward.selectedCardId || reward.cardSkipped);
  const recommendedCardId = cardReady ? null : rewardRecommendedCardId(run);
  const skipRecommended = !cardReady && rewardSkipRecommended(run, recommendedCardId);
  const previewCardId = activeRewardPreviewCardId(run, cardReady);
  const spotlight = app.querySelector(".reward-spotlight");
  if (spotlight) spotlight.outerHTML = renderRewardSpotlight(run, recommendedCardId, skipRecommended, previewCardId);
  const stage = app.querySelector(".reward-choice-stage");
  if (stage) {
    stage.classList.toggle("preview-active", Boolean(previewCardId));
    stage.classList.toggle("card-ready", cardReady);
    stage.classList.toggle("relic-ready", Boolean(reward.selectedRelicId));
  }
  app.querySelectorAll(".reward-option.previewing").forEach((option) => option.classList.remove("previewing"));
  if (!previewCardId) return;
  app.querySelectorAll(".reward-option .game-card[data-action='reward-card']").forEach((card) => {
    if (card.dataset.id === previewCardId) card.closest(".reward-option")?.classList.add("previewing");
  });
}

function renderRewardCompass(run) {
  const progress = runProgressBrief(run);
  const deck = deckAnalysis(run);
  const deckLabel = deck.primary.score > 0 ? deck.primary.label : "아직 탐색 중";
  const nextNeed = progress.readiness?.metrics?.filter((metric) => metric.tone === "warning" || metric.tone === "danger").map((metric) => metric.label).slice(0, 2);
  const needText = nextNeed?.length ? `${nextNeed.join(", ")} 보강` : "지금 흐름 유지";
  return `
    <div class="reward-compass" aria-label="현재 런 요약">
      <span>${progress.actLabel}</span>
      <strong>${deckLabel}</strong>
      <small>${progress.distanceText} · ${needText}</small>
      <div>
        <i>체력 ${run.player.hp}/${run.player.maxHp}</i>
        <i>덱 ${run.player.deck.length}장</i>
      </div>
    </div>
  `;
}

function renderRewardSpotlight(run, recommendedCardId, skipRecommended, previewCardId = null) {
  const reward = run.reward;
  const choices = rewardRelicChoices(reward);
  const hasRelicReward = Boolean(choices.length || reward.selectedRelicId || reward.relicId);
  const previewing = Boolean(previewCardId && !reward.selectedCardId && !reward.cardSkipped);
  const cardChoice = reward.selectedCardId ?? (reward.cardSkipped ? null : previewCardId ?? recommendedCardId);
  const card = cardChoice ? effectiveCard({ cardId: cardChoice, upgraded: false }) : null;
  const cardInsight = cardChoice ? rewardCardInsight(run, cardChoice) : skipRewardInsight(run);
  const recommendedRelicId = reward.selectedRelicId ?? reward.relicId ?? (choices.length ? rewardRecommendedRelicId(run, choices) : null);
  const relicInsight = recommendedRelicId ? rewardRelicInsight(run, recommendedRelicId) : null;
  const deck = deckAnalysis(run);
  const progress = runProgressBrief(run);
  const deckShift = cardChoice ? rewardDeckShift(run, cardChoice) : null;
  const cardTitle = reward.selectedCardId
    ? `${card.name} 선택됨`
      : reward.cardSkipped
        ? "카드 받지 않기 선택됨"
      : previewing && card
        ? card.name
      : card
        ? card.name
        : skipRecommended
          ? "덱 유지 추천"
          : "선택지 비교";
  const cardDetail = card ? rewardSpotlightDetail(cardInsight) : skipInsightShortDetail(cardInsight);
  const deckAxis = deck.primary.score > 0 ? deck.primary.label : "방향 탐색";
  const deckTitle = deckShift?.afterAxis ?? deckAxis;
  const deckDetail = deckShift
    ? `${deckShift.title} · 덱 ${deckShift.beforeSize}→${deckShift.afterSize}장 · 평균 비용 ${deckShift.beforeCostText}→${deckShift.afterCostText}`
    : `덱 ${deck.total}장 · 평균 비용 ${averageDeckCost(run.player.deck).toFixed(1)} · ${progress.distanceText}`;
  return `
    <section class="reward-spotlight ${hasRelicReward ? "" : "no-relic"} ${cardInsight.tone ?? "steady"} ${previewing ? "previewing" : ""}" aria-label="보상 추천 요약">
      <article class="reward-spotlight-card">
        ${renderRewardSpotlightCardArt(card)}
        <span>${reward.selectedCardId || reward.cardSkipped ? "선택 완료" : previewing ? "비교 중" : "추천"}</span>
        <strong>${cardTitle}</strong>
        <small>${cardDetail}</small>
      </article>
      ${hasRelicReward ? `
        <article class="reward-spotlight-relic ${relicInsight?.tone ?? "steady"}">
          <span>${reward.selectedRelicId || reward.relicId ? "유물 선택 완료" : "유물 추천"}</span>
          <div>${renderRelic(recommendedRelicId)}<strong>${RELIC_BY_ID[recommendedRelicId]?.name ?? recommendedRelicId}</strong></div>
          <small>${relicInsight?.label ?? "현재 덱과 발동 시점을 비교하세요."}</small>
        </article>
      ` : ""}
      <article class="reward-spotlight-deck">
        <span>${deckShift ? "고른 뒤 덱" : "현재 덱"}</span>
        <strong>${deckTitle}</strong>
        <small>${deckDetail}</small>
      </article>
    </section>
  `;
}

function renderRewardSpotlightCardArt(card) {
  if (!card) {
    return `
      <div class="reward-spotlight-card-art empty" aria-hidden="true">
        <b>×</b>
      </div>
    `;
  }
  const seed = visualSeed(`reward:${card.id}:${card.art}:${card.name}`);
  const motif = cardArtMotif(card);
  const atlasCell = cardArtAtlasCell(card, motif, seed);
  const sigilCell = cardArtSigilCell(card, motif);
  return `
    <div class="reward-spotlight-card-art art-${card.art} motif-${motif}" data-art-id="${card.id}" data-art-key="${card.art}" style="${cardArtStyle(card, seed, atlasCell, sigilCell)}" aria-hidden="true">
      <i class="card-art-image"></i>
    </div>
  `;
}

function rewardSpotlightDetail(insight) {
  if (!insight) return "이번 보상에서 덱의 중심을 정합니다.";
  if (/보스 대비|보스전/.test(insight.label ?? "")) return `${insight.detail.split(".")[0]}.`.replace(/\s+/g, " ");
  if (insight.concept?.label) return `${rewardConceptPhrase(insight.concept.label)}에 잘 맞습니다.`;
  return `${insight.detail.split(".")[0]}.`.replace(/\s+/g, " ");
}

function rewardConceptPhrase(label = "") {
  if (/전하/.test(label)) return "전하를 모아 크게 쓰는 방향";
  if (/표식/.test(label)) return "표식을 남기고 연달아 공격하는 방향";
  if (/바이러스|약화/.test(label)) return "바이러스를 쌓고 약화로 버티는 방향";
  if (/반격|방어|막고|되받아/.test(label)) return "막고 되받아치는 방향";
  if (/카드|뽑기|찾기|순환/.test(label)) return "카드를 빠르게 돌리는 방향";
  if (/체력|대가|위험/.test(label)) return "위험을 감수하고 크게 가져가는 방향";
  return `${String(label).replace(/\s+/g, " ")} 방향`;
}

function rewardFlowState(run) {
  const choices = rewardRelicChoices(run.reward);
  const cardReady = Boolean(run.reward.selectedCardId || run.reward.cardSkipped);
  const relicReady = !choices.length || Boolean(run.reward.selectedRelicId);
  const ready = cardReady && relicReady;
  const steps = choices.length
    ? [
        { label: "카드", state: cardReady ? "done" : "active" },
        { label: "유물", state: relicReady ? "done" : cardReady ? "active" : "muted" },
        { label: "경로", state: ready ? "done" : "muted" }
      ]
    : [
        { label: "카드", state: cardReady ? "done" : "active" },
        { label: "경로", state: ready ? "done" : "muted" }
      ];
  const stateName = ready ? "ready" : !cardReady ? "card" : choices.length && !relicReady ? "relic" : "path";
  const title = ready
    ? "경로 열림"
    : !cardReady
      ? "카드 선택"
      : choices.length && !relicReady
        ? "유물 선택"
        : "경로 확인";
  const detail = ready
    ? "다음 경로로 이어집니다."
    : !cardReady
      ? choices.length
        ? "하나를 고르거나 넘기면 유물을 고릅니다."
        : "하나를 고르거나 넘기면 됩니다."
      : choices.length && !relicReady
        ? "유물 하나를 고르면 경로가 열립니다."
        : "보상 처리가 끝났습니다.";
  return {
    choices,
    cardReady,
    relicReady,
    ready,
    hasRelicChoices: Boolean(choices.length),
    stateName,
    title,
    detail,
    steps
  };
}

function renderRewardFlow(run) {
  const flow = rewardFlowState(run);
  return `
    <div class="reward-flow${flow.hasRelicChoices ? "" : " no-relic"}" data-state="${flow.stateName}" aria-label="보상 진행: ${flow.title}. ${flow.detail}">
      <div class="reward-flow-steps">
        ${flow.steps.map((step, index) => `<span class="${step.state}" ${step.state === "active" ? 'aria-current="step"' : ""}><b>${index + 1}</b><i>${step.label}</i></span>`).join("")}
      </div>
      <div class="reward-flow-copy">
        <strong>${flow.title}</strong>
        <small>${flow.detail}</small>
      </div>
    </div>
  `;
}

function renderRewardInsight(run, cardId) {
  const insight = rewardCardInsight(run, cardId);
  const chips = rewardComparisonChips(run, cardId).slice(0, 3);
  return `
    <section class="reward-insight ${insight.tone}" title="${insight.detail}">
      <span class="reward-insight-head">
        <strong>${rewardInsightShortLabel(insight)}</strong>
        ${renderRewardConceptTag(insight.concept)}
      </span>
      <span class="reward-insight-detail">${insight.detail}</span>
      <div class="reward-compare-row">
        ${chips.map((chip) => `<small class="${chip.tone}">${chip.label}</small>`).join("")}
      </div>
    </section>
  `;
}

function renderRewardOptionDetail(run, cardId) {
  return `
    <details class="reward-option-detail">
      <summary>상세 비교</summary>
      <div class="reward-option-detail-body">
        ${renderRewardDeckShift(run, cardId)}
        ${renderRewardTakeVsSkip(run, cardId)}
        ${renderRewardInsight(run, cardId)}
      </div>
    </details>
  `;
}

function renderRewardPickLine(run, cardId) {
  const card = effectiveCard({ cardId, upgraded: false });
  const insight = rewardCardInsight(run, cardId);
  const conceptLabel = /^보스 대비/.test(insight.label ?? "") ? rewardCardRoleLabel(card) : insight.concept?.label ?? typeLabel(card.type);
  return `
    <div class="reward-pick-line ${insight.tone}" aria-label="${card.name} 선택 시 덱 변화">
      <span title="${conceptLabel}">${rewardCompactConceptLabel(conceptLabel)}</span>
      <strong>${rewardInsightShortLabel(insight)}</strong>
      <div class="reward-pick-metrics" aria-hidden="true">
        ${rewardPickMetricChips(run, cardId).map((chip) => `<i class="${chip.tone}" title="${chip.label}">${chip.label}</i>`).join("")}
      </div>
      <small>${rewardPickLineText(card, insight)}</small>
    </div>
  `;
}

function rewardPickMetricChips(run, cardId) {
  return rewardDeckShift(run, cardId).chips.slice(0, 2);
}

function rewardOptionAriaLabel(run, cardId, recommended = false, previewing = false, selected = false) {
  const card = effectiveCard({ cardId, upgraded: false });
  const insight = rewardCardInsight(run, cardId);
  const shift = rewardDeckShift(run, cardId);
  const takeVsSkip = rewardTakeVsSkip(run, cardId);
  const stateText = selected ? "선택됨" : previewing ? "비교 중" : recommended ? "추천 보상" : "보상 후보";
  return [
    `${card.name}. ${stateText}`,
    `${rarityLabel(card.rarity)} ${typeLabel(card.type)}. 비용 ${card.cost >= 90 ? "사용 불가" : card.cost}`,
    `${rewardInsightShortLabel(insight)}. ${insight.detail}`,
    `${shift.title}. ${shift.detail}`,
    `${takeVsSkip.title}. ${takeVsSkip.detail}`,
    `덱 ${shift.beforeSize}장에서 ${shift.afterSize}장. 평균 비용 ${shift.beforeCostText}에서 ${shift.afterCostText}`,
    card.text
  ].filter(Boolean).join(". ");
}

function rewardCompactConceptLabel(label = "") {
  if (/연속 방어/.test(label)) return "연속 방어";
  if (/큰 방어/.test(label)) return "큰 방어";
  if (/전하/.test(label)) return "전하";
  if (/표식/.test(label)) return "표식";
  if (/바이러스|약화/.test(label)) return "바이러스";
  if (/반격|방어|막고|되받아/.test(label)) return "반격";
  if (/카드|뽑기|찾기/.test(label)) return "순환";
  if (/체력|대가|위험/.test(label)) return "위험";
  return String(label).replace(/\s+/g, " ").slice(0, 4);
}

function renderRewardDeckShift(run, cardId) {
  const shift = rewardDeckShift(run, cardId);
  return `
    <div class="reward-deck-shift ${shift.tone}" aria-label="${shift.cardName} 선택 뒤 덱 변화">
      <span>고른 뒤</span>
      <strong>${shift.title}</strong>
      <small>${shift.detail}</small>
      <div>
        ${shift.chips.map((chip) => `<i class="${chip.tone}">${chip.label}</i>`).join("")}
      </div>
    </div>
  `;
}

function renderRewardTakeVsSkip(run, cardId) {
  const verdict = rewardTakeVsSkip(run, cardId);
  return `
    <section class="reward-take-vs-skip ${verdict.tone}" aria-label="받기와 스킵 비교: ${verdict.title}. ${verdict.detail}" title="${verdict.detail}">
      <span>받기/스킵</span>
      <strong>${verdict.title}</strong>
      <small>${verdict.detail}</small>
      <div>
        ${verdict.chips.map((chip) => `<i class="${chip.tone}">${chip.label}</i>`).join("")}
      </div>
    </section>
  `;
}

function rewardPickLineText(card, insight) {
  if (/보스|마무리|방어|정화|카드 찾기/.test(insight.label)) return insight.detail.split(".")[0] + ".";
  if (insight.concept?.label) return `${rewardConceptPhrase(insight.concept.label)}을 밀어줍니다.`;
  if (card.type === "attack") return "적을 끝낼 피해 수단을 보탭니다.";
  if (card.type === "skill") return "방어, 정비, 손패 흐름을 보탭니다.";
  if (card.type === "power") return "전투 내내 남는 규칙을 추가합니다.";
  return "덱의 빈 역할을 채웁니다.";
}

function renderRewardSkipChoice(run, skipRecommended = false) {
  const insight = skipRewardInsight(run);
  const shortDetail = skipInsightShortDetail(insight);
  return `
    <button class="reward-skip-choice ${run.reward.cardSkipped ? "selected" : ""} ${skipRecommended ? "recommended" : ""} ${insight.tone}" data-action="skip-reward" aria-label="카드 보상 받지 않기. ${shortDetail}${skipRecommended ? " 추천 선택." : ""}" title="${shortDetail}">
      <span>카드 받지 않기</span>
      <small>${shortDetail}</small>
      ${skipRecommended ? `<em class="skip-recommendation">추천</em>` : ""}
    </button>
  `;
}

function rewardInsightShortLabel(insight) {
  return {
    "강하게 맞물림": "강한 시너지",
    "현재 덱에 맞음": "덱에 맞음",
    "보유 유물에 맞음": "유물 연계",
    "받지 않기와 비교": "넘기기 비교",
    "중복 주의": "중복 주의",
    "새 방향 후보": "새 스타일",
    "가벼운 선택": "가벼운 카드",
    "새 도구": "새 도구"
  }[insight.label] ?? insight.label;
}

function renderRewardConceptTag(concept) {
  return concept ? `<small class="concept-tag">${concept.label}</small>` : "";
}

function skipInsightShortDetail(insight) {
  if (insight.tone === "strong") return "덱이 커졌다면 넘기는 선택도 좋습니다.";
  if (insight.tone === "warning") return "저주가 있으면 불필요한 카드는 피하세요.";
  if (insight.tone === "steady") return "덱에 맞지 않으면 넘겨도 됩니다.";
  return "전하, 표식, 바이러스, 반격 중 하나로 좁혀 보세요.";
}

function renderRewardRelicChoices(run) {
  const choices = rewardRelicChoices(run.reward);
  if (!choices.length) return "";
  const recommendedRelicId = run.reward.selectedRelicId ? null : rewardRecommendedRelicId(run, choices);
  return `
    <section class="reward-relic-choices" aria-label="유물 보상 선택">
      <div class="reward-section-heading">
        <strong>유물</strong>
        <span>하나만 고르세요.</span>
      </div>
      <div class="reward-relic-grid">
        ${choices
          .map((relicId) => {
            const relic = RELIC_BY_ID[relicId];
            const insight = rewardRelicInsight(run, relicId);
            const selected = run.reward.selectedRelicId === relicId;
            const recommended = recommendedRelicId === relicId;
            const aria = rewardRelicChoiceAriaLabel(relicId, insight, recommended, selected);
            return `
              <button class="reward-relic-choice ${selected ? "selected" : ""} ${recommended ? "recommended" : ""} ${insight.tone}" data-action="reward-relic" data-id="${relicId}" aria-label="${aria}" title="${relic?.text ?? ""}">
                <span class="reward-relic-icon-frame" aria-hidden="true">${renderRelic(relicId, false, false, run)}</span>
                <span class="reward-relic-copy">
                  <span class="reward-relic-head">
                    <strong>${relic?.name ?? relicId}</strong>
                    <em>${relic?.timing ?? "발동"}</em>
                  </span>
                  <span class="reward-relic-effect">${relic?.text ?? ""}</span>
                  <span class="reward-relic-fit">
                    <b>${rewardRelicFitLabel(insight)}</b>
                    ${renderRewardConceptTag(insight.concept)}
                  </span>
                </span>
                ${selected ? `<em class="reward-selected-stamp">선택됨</em>` : ""}
                ${recommended ? `<em class="reward-recommendation">추천</em>` : ""}
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function rewardRelicChoiceAriaLabel(relicId, insight, recommended = false, selected = false) {
  const relic = RELIC_BY_ID[relicId];
  return [
    `${relic?.name ?? relicId}. ${selected ? "선택됨" : recommended ? "추천 유물" : "유물 후보"}`,
    `${rarityLabel(relic?.rarity)} 유물`,
    `${relic?.timing ?? "발동"}: ${relic?.text ?? ""}`,
    `${rewardRelicFitLabel(insight)}. ${insight?.detail ?? ""}`
  ].filter(Boolean).join(". ");
}

function rewardRelicFitLabel(insight) {
  if (!insight) return "새 선택지";
  return {
    "현재 핵심 카드와 잘 맞음": "현재 덱과 강하게 맞음",
    "현재 덱에 맞음": "현재 덱에 맞음",
    "장기 성장": "장기 성장",
    "선택지 변화": "전투 선택지 변화",
    "새 승리 수단": "새 승리 수단"
  }[insight.label] ?? insight.label;
}

function renderRewardReadiness(run) {
  const choices = rewardRelicChoices(run.reward);
  const cardReady = Boolean(run.reward.selectedCardId || run.reward.cardSkipped);
  const relicReady = !choices.length || Boolean(run.reward.selectedRelicId);
  const ready = cardReady && relicReady;
  const cardText = run.reward.selectedCardId
    ? "카드 선택 완료"
    : run.reward.cardSkipped
      ? "카드 넘김"
      : "카드 선택";
  const relicText = run.reward.selectedRelicId
      ? "유물 선택 완료"
      : "유물 선택 필요";
  const title = ready ? "경로 열림" : choices.length ? "카드와 유물 선택" : "카드 선택";
  const detail = ready
    ? "선택이 끝났습니다. 다음 경로로 돌아갑니다."
    : choices.length
      ? "카드 한 장, 유물 하나를 고르면 다음 경로가 열립니다."
      : "카드를 고르거나 넘기면 다음 경로가 열립니다.";
  return `
    <section class="decision-footer reward-readiness ${ready ? "ready" : ""}" role="status" aria-label="보상 진행 상태">
      <span>진행</span>
      <strong>${title}</strong>
      <small>${detail}</small>
      <div>
        <i class="${cardReady ? "done" : "pending"}">${cardText}</i>
        ${choices.length ? `<i class="${relicReady ? "done" : "pending"}">${relicText}</i>` : ""}
        <i class="next">경로</i>
      </div>
    </section>
  `;
}

function renderEvent(run) {
  const eventDefinition = EVENT_BY_ID[run.event.eventId];
  const previews = eventDefinition.choices.map((option) => eventChoicePreview(run, option));
  const recommendedIndex = eventRecommendedChoice(run, previews);
  const recommendedPreview = previews[recommendedIndex] ?? previews.find((preview) => !preview.blocked) ?? previews[0];
  return `
    <section class="event-layout">
      <div class="event-illustration ${eventVisualClass(recommendedPreview)}" style="${eventIllustrationStyle(eventDefinition, recommendedPreview)}" aria-label="${eventDefinition.name} 이벤트 장면">
        ${renderEventSceneSet(eventDefinition, recommendedPreview)}
        ${renderEventSceneMarker(recommendedPreview)}
        ${renderEventSceneBrief(eventDefinition, previews, recommendedIndex)}
      </div>
      <div class="event-panel">
        <div class="event-title-row">
          <div>
            <span class="event-kicker">이벤트</span>
            <h2>${eventDefinition.name}</h2>
            <p>${eventDefinition.text}</p>
          </div>
        </div>
        ${renderEventStatusRail(run)}
        <div class="event-options">
          ${eventDefinition.choices
            .map((option, index) => {
              const preview = previews[index];
              const recommended = index === recommendedIndex;
              const aria = `${option.label}${recommended ? " · 추천 선택" : ""}. ${option.detail}`;
              return `
                <button class="event-choice ${preview.tone} ${recommended ? "recommended" : ""}" data-action="event-option" data-index="${index}" aria-label="${aria}" ${preview.blocked ? "disabled" : ""}>
                  <span class="event-choice-head">
                    <span class="event-choice-icon" aria-hidden="true">${eventChoiceGlyph(preview)}</span>
                    <span class="event-choice-copy">
                      <strong>${option.label}</strong>
                      <small class="event-choice-detail">${eventChoiceDecisionLine(preview)}</small>
                    </span>
                    <span class="event-choice-tags">
                      <em class="event-risk-label">${eventToneLabel(preview)}</em>
                      ${recommended ? `<em class="event-recommendation">추천</em>` : ""}
                    </span>
                  </span>
                  ${renderEventChoicePreview(preview)}
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderEventStatusRail(run) {
  const hpRatio = run.player.hp / Math.max(1, run.player.maxHp);
  const hpTone = hpRatio <= 0.34 ? "danger" : hpRatio <= 0.55 ? "warning" : "steady";
  const deckTone = run.player.deck.length >= 24 ? "warning" : "steady";
  return `
    <div class="event-status-strip" aria-label="이벤트 전 상태">
      <span class="${hpTone}"><em>체력</em><b>${run.player.hp}/${run.player.maxHp}</b></span>
      <span class="steady"><em>크레딧</em><b>${run.player.gold}</b></span>
      <span class="${deckTone}"><em>덱</em><b>${run.player.deck.length}장</b></span>
      <span class="steady"><em>유물</em><b>${run.player.relics.length}개</b></span>
    </div>
  `;
}

function eventChoiceGlyph(preview) {
  if (preview.blocked) return "×";
  return {
    lethal: "!",
    risky: "!",
    rewarding: "+",
    steady: "✓"
  }[preview.tone] ?? "·";
}

function renderEventSceneMarker(preview) {
  return `
    <div class="event-scene-marker ${preview?.tone ?? "steady"}" aria-hidden="true">
      <b>${eventSceneGlyph(preview)}</b>
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
}

function renderEventSceneSet(eventDefinition, preview) {
  const tone = preview?.tone ?? "steady";
  const scene = eventSceneIndex(eventDefinition, preview);
  return `
    <div class="event-scene-set event-scene-${scene} ${tone}" aria-hidden="true">
      <span class="event-scene-prop main"></span>
      <span class="event-scene-prop side"></span>
      <span class="event-scene-floor"></span>
      <span class="event-diver-sprite"></span>
    </div>
  `;
}

function eventSceneGlyph(preview) {
  if (preview?.blocked) return "×";
  return {
    lethal: "!",
    risky: "!",
    rewarding: "+",
    steady: "✓"
  }[preview?.tone] ?? "·";
}

function renderEventSceneBrief(eventDefinition, previews, recommendedIndex) {
  const safeIndex = recommendedIndex >= 0 ? recommendedIndex : previews.findIndex((preview) => !preview.blocked);
  const preview = previews[safeIndex] ?? previews[0];
  const option = eventDefinition.choices[safeIndex] ?? eventDefinition.choices[0];
  const chips = preview?.chips?.filter((chip) => chip.tone !== "neutral").slice(0, 3) ?? [];
  return `
    <div class="event-scene-brief ${preview?.tone ?? "steady"}">
      <span>${eventToneLabel(preview ?? { tone: "steady" })}</span>
      <strong>${option?.label ?? "선택 전"}</strong>
      <small>${eventChoiceDecisionLine(preview ?? { tone: "steady" })} ${preview?.detail ?? ""}</small>
      <div>
        ${chips.map((chip) => `<i class="${chip.tone}">${chip.text}</i>`).join("")}
      </div>
    </div>
  `;
}

function renderEventSpotlight(eventDefinition, previews, recommendedIndex) {
  const safeIndex = recommendedIndex >= 0 ? recommendedIndex : previews.findIndex((preview) => !preview.blocked);
  if (safeIndex < 0) return "";
  const preview = previews[safeIndex];
  const option = eventDefinition.choices[safeIndex];
  const chips = preview.chips.slice(0, 3);
  return `
    <section class="event-spotlight ${preview.tone}" aria-label="이벤트 추천 요약">
      <span>${preview.tone === "risky" ? "위험 보상" : preview.tone === "rewarding" ? "추천 선택" : "안전 선택"}</span>
      <strong>${option.label}</strong>
      <small>${eventChoiceDecisionLine(preview)} ${preview.detail}</small>
      <div>
        ${chips.map((chip) => `<i class="${chip.tone}">${chip.text}</i>`).join("")}
      </div>
    </section>
  `;
}

function eventVisualClass(preview) {
  return `event-visual-${preview?.tone ?? "steady"}`;
}

function eventIllustrationStyle(eventDefinition, preview) {
  const seed = visualSeed(`${eventDefinition.id}:${preview?.tone ?? "steady"}`);
  const scene = eventBackdropCell(eventDefinition, preview);
  const prop = eventPropCell(eventDefinition, preview);
  const hueBase = {
    rewarding: 186,
    risky: 38,
    lethal: 356,
    blocked: 326,
    steady: 154
  }[preview?.tone] ?? 188;
  const hue = wrapHue(hueBase + (seed % 42) - 21);
  const accent = wrapHue(hue + 48 + ((seed >>> 8) % 36));
  const x = 35 + ((seed >>> 4) % 36);
  const y = 30 + ((seed >>> 10) % 38);
  const propShift = 3 + (seed % 10);
  return `--event-hue:${hue}; --event-accent:${accent}; --event-x:${x}%; --event-y:${y}%; --event-bg-x:${scene.x}%; --event-bg-y:${scene.y}%; --event-prop-bg-x:${prop.x}%; --event-prop-bg-y:${prop.y}%; --event-side-bg-x:${prop.sideX}%; --event-side-bg-y:${prop.sideY}%; --event-prop-shift:${propShift}%;`;
}

function eventBackdropCell(eventDefinition, preview) {
  const index = eventSceneIndex(eventDefinition, preview);
  return {
    x: [0, 50, 100][index % 3],
    y: index >= 3 ? 100 : 0
  };
}

function eventPropCell(eventDefinition, preview) {
  const index = eventSceneIndex(eventDefinition, preview);
  const sideIndex = (index + 2 + (preview?.tone === "risky" || preview?.tone === "lethal" ? 1 : 0)) % 6;
  return {
    x: [0, 50, 100][index % 3],
    y: index >= 3 ? 100 : 0,
    sideX: [0, 50, 100][sideIndex % 3],
    sideY: sideIndex >= 3 ? 100 : 0
  };
}

function eventSceneIndex(eventDefinition, preview) {
  const eventId = eventDefinition?.id ?? "";
  let index = 0;
  if (/market|bazaar|lottery|suture|printer/.test(eventId)) index = 0;
  else if (/archive|terminal|server|prompt/.test(eventId)) index = 1;
  else if (/coral|reef|contract|relic/.test(eventId)) index = 2;
  else if (/trial|confessional|gate|bell/.test(eventId)) index = 3;
  else if (/current|diver|choir/.test(eventId)) index = 4;
  else if (/station|waystation|mirror|whale/.test(eventId)) index = 5;
  else index = visualSeed(eventId) % 6;
  if (preview?.tone === "lethal" || preview?.tone === "blocked") index = 3;
  return index;
}

function renderChoiceWayfinder(run, label) {
  const guide = choiceWayfinder(run, label);
  return `
    <div class="choice-wayfinder ${guide.tone}" aria-label="${label} 선택 브리핑">
      <span>${guide.actLabel}</span>
      <strong>${guide.title}</strong>
      <small>${guide.detail}</small>
      <div class="choice-wayfinder-chips">
        ${guide.chips.map((chip) => `<em class="${chip.tone}">${chip.text}</em>`).join("")}
      </div>
      <i aria-hidden="true"><b style="width:${guide.progress}%"></b></i>
    </div>
  `;
}

function choiceWayfinder(run, label) {
  const brief = runProgressBrief(run);
  const analysis = deckAnalysis(run);
  const hpRatio = run.player.hp / Math.max(1, run.player.maxHp);
  const deckAxis = analysis.primary.score > 0 ? analysis.primary.label : "아직 정해지지 않음";
  const nextChoices = availableNodeLabels(run);
  const tone = hpRatio <= 0.34 || brief.readiness?.tone === "danger" ? "danger" : hpRatio <= 0.52 || brief.readiness?.tone === "warning" || analysis.curses > 0 || analysis.total >= 24 ? "warning" : "steady";
  const title = choiceWayfinderTitle(label);
  const priority = choiceWayfinderPriority(run, analysis, brief);
  const detailPrefix = label === "경로" && nextChoices.length ? `다음 길: ${nextChoices.slice(0, 3).join(" / ")}.` : `현재 덱: ${deckAxis}.`;
  const chips = [
    { tone: hpRatio <= 0.34 ? "danger" : hpRatio <= 0.52 ? "warning" : "steady", text: `체력 ${run.player.hp}/${run.player.maxHp}` },
    { tone: analysis.total >= 24 ? "warning" : "steady", text: `덱 ${analysis.total}장` },
    { tone: analysis.primary.score > 0 ? "strong" : "muted", text: `방향 ${deckAxis}` },
    { tone: brief.tone, text: brief.distanceText }
  ];
  if (analysis.curses > 0) chips.splice(2, 0, { tone: "danger", text: `저주 ${analysis.curses}장` });
  return {
    tone,
    progress: brief.progress,
    actLabel: brief.actLabel,
    title,
    detail: `${detailPrefix} ${priority}`,
    chips
  };
}

function choiceWayfinderTitle(label) {
  return {
    "경로": "다음 위험 보고 고르기",
    "보상": "다음 전투에 필요한 한 장",
    "이벤트": "대가와 보상을 먼저 비교",
    "마켓": "크레딧으로 덱 정비",
    "세이프룸": "한 가지만 확실히 정비"
  }[label] ?? label;
}

function choiceWayfinderPriority(run, analysis, brief) {
  const hpRatio = run.player.hp / Math.max(1, run.player.maxHp);
  if (hpRatio <= 0.34) return "체력이 낮습니다. 회복이나 방어 카드를 우선하세요.";
  if (brief.readiness?.tone === "danger") return "보스가 가깝습니다. 부족한 대비를 먼저 메우세요.";
  if (analysis.curses > 0) return "저주가 있습니다. 제거 기회가 보이면 잡으세요.";
  if (analysis.total >= 24) return "덱이 커졌습니다. 새 카드보다 제거와 강화가 더 값질 수 있습니다.";
  if (analysis.primary.score <= 1) return "같은 키워드가 겹치는 보상을 고르면 방향이 잡힙니다.";
  return `${analysis.primary.label}에 맞는 카드와 유물을 찾으세요.`;
}

function renderEventChoicePreview(preview) {
  const visibleChips = preview.chips.filter((chip) => chip.tone !== "neutral").slice(0, 3);
  const hiddenChipCount = Math.max(0, preview.chips.length - visibleChips.length);
  return `
    <div class="event-choice-preview" aria-label="${preview.detail}">
      ${renderEventChoiceOutcome(preview)}
      <div class="event-chip-row">
        ${visibleChips.map((chip) => `<i class="event-chip ${chip.tone}">${chip.text}</i>`).join("")}
        ${hiddenChipCount ? `<i class="event-chip neutral">+${hiddenChipCount}</i>` : ""}
      </div>
      ${preview.showDetail ? `<small>${preview.detail}</small>` : ""}
    </div>
  `;
}

function renderEventChoiceOutcome(preview) {
  const resources = preview.resources ?? [];
  if (!resources.length) return "";
  return `
    <div class="event-choice-outcome" aria-label="선택 후 자원 변화">
      ${resources.map((resource) => `
        <span class="${resource.tone}">
          <em>${resource.label}</em>
          <strong>${resource.value}</strong>
          <i>${resource.delta}</i>
        </span>
      `).join("")}
    </div>
  `;
}

function eventChoiceDecisionLine(preview) {
  if (preview.blocked) return "지금은 선택할 수 없습니다.";
  if (preview.tone === "lethal") return "런이 끝날 수 있습니다.";
  if (preview.tone === "risky" && preview.hasReward) return "대가를 내고 보상을 노립니다.";
  if (preview.tone === "risky") return "체력이나 크레딧을 씁니다.";
  if (preview.tone === "rewarding") return "바로 보상을 받습니다.";
  return "위험 없이 지나갑니다.";
}

function eventChoicePreview(run, option) {
  const projected = {
    hp: run.player.hp,
    maxHp: run.player.maxHp,
    gold: run.player.gold,
    lethal: false,
    blocked: false,
    risky: false,
    hasReward: false
  };
  const chips = [];

  for (const effect of option.effects ?? []) {
    const chip = eventEffectChip(run, effect, projected);
    if (chip) chips.push(chip);
  }

  const blockReason = eventChoiceBlockReason(run, option.effects ?? []);
  if (blockReason) {
    projected.blocked = true;
    if (blockReason === "noValue") chips.push({ tone: "blocked", text: "효과 없음" });
  }
  if (!chips.length) chips.push({ tone: "neutral", text: "변화 없음" });
  const hpDelta = projected.hp - run.player.hp;
  const maxHpDelta = projected.maxHp - run.player.maxHp;
  const goldDelta = projected.gold - run.player.gold;
  const hpDeltaText = [hpDelta ? eventSignedDelta(hpDelta) : "", maxHpDelta ? `최대 ${eventSignedDelta(maxHpDelta)}` : ""].filter(Boolean).join(" · ");
  const hpText = hpDelta === 0 && maxHpDelta === 0 ? `체력 ${run.player.hp}/${run.player.maxHp}` : `체력 ${hpDeltaText} · ${projected.hp}/${projected.maxHp}`;
  const goldText = goldDelta === 0 ? `크레딧 ${run.player.gold}` : `크레딧 ${goldDelta > 0 ? "+" : ""}${goldDelta} · ${projected.gold} 보유`;
  const detail = projected.blocked
    ? blockReason === "noValue"
      ? "지금은 얻는 효과가 없어 선택할 수 없습니다."
      : "현재 자원으로 선택할 수 없습니다."
    : projected.lethal
      ? `${hpText}. 이 선택은 즉시 런을 끝낼 수 있습니다.`
      : `${hpText} · ${goldText}`;
  return {
    chips,
    detail,
    resources: eventChoiceResources(run, projected, blockReason),
    showDetail: projected.blocked || projected.lethal,
    hasReward: projected.hasReward,
    label: eventPreviewLabel(projected, blockReason),
    blocked: projected.blocked,
    tone: projected.blocked ? "blocked" : projected.lethal ? "lethal" : projected.risky ? "risky" : projected.hasReward ? "rewarding" : "steady"
  };
}

function eventChoiceResources(run, projected, blockReason = null) {
  const hpDelta = projected.hp - run.player.hp;
  const maxHpDelta = projected.maxHp - run.player.maxHp;
  const goldDelta = projected.gold - run.player.gold;
  const resources = [
    {
      label: "체력",
      value: `${projected.hp}/${projected.maxHp}`,
      delta: eventResourceDelta(hpDelta, maxHpDelta),
      tone: projected.lethal ? "danger" : hpDelta < 0 || maxHpDelta < 0 ? "cost" : hpDelta > 0 || maxHpDelta > 0 ? "gain" : "neutral",
      changed: Boolean(hpDelta || maxHpDelta || projected.lethal)
    },
    {
      label: "크레딧",
      value: `${projected.gold}`,
      delta: blockReason === "cost" && goldDelta < 0 ? "부족" : eventResourceDelta(goldDelta),
      tone: blockReason === "cost" && goldDelta < 0 ? "blocked" : goldDelta < 0 ? "cost" : goldDelta > 0 ? "gain" : "neutral",
      changed: Boolean(goldDelta || (blockReason === "cost" && goldDelta < 0))
    }
  ];
  return resources.filter((resource) => resource.changed || resource.tone === "danger" || resource.tone === "blocked");
}

function eventResourceDelta(delta = 0, maxDelta = 0) {
  const parts = [];
  if (delta) parts.push(eventSignedDelta(delta));
  if (maxDelta) parts.push(`최대 ${eventSignedDelta(maxDelta)}`);
  return parts.length ? parts.join(" · ") : "유지";
}

function eventSignedDelta(value) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function eventPreviewLabel(projected, blockReason) {
  if (projected.blocked) return blockReason === "noValue" ? "지금은 효과 없음" : "자원 부족";
  if (projected.lethal) return "런 종료 위험";
  if (projected.risky && projected.hasReward) return "대가 있는 보상";
  if (projected.risky) return "대가를 치르는 선택";
  if (projected.hasReward) return "보상 획득";
  return "상태 유지";
}

function eventToneLabel(preview) {
  return {
    blocked: "선택 불가",
    lethal: "런 종료",
    risky: "위험",
    rewarding: "이득",
    steady: "안전"
  }[preview.tone] ?? "선택";
}

function eventEffectChip(run, effect, projected) {
  switch (effect.op) {
    case "loseHp":
      projected.hp = Math.max(0, projected.hp - effect.amount);
      projected.risky = true;
      if (projected.hp <= 0) projected.lethal = true;
      return { tone: projected.lethal ? "danger" : "cost", text: `체력 -${effect.amount}` };
    case "heal": {
      const healed = Math.min(effect.amount, Math.max(0, projected.maxHp - projected.hp));
      projected.hp = Math.min(projected.maxHp, projected.hp + effect.amount);
      return { tone: "gain", text: healed > 0 ? `체력 +${healed}` : "체력 최대" };
    }
    case "gainGold":
      projected.gold += effect.amount;
      projected.hasReward = true;
      return { tone: "gain", text: `크레딧 +${effect.amount}` };
    case "loseGold":
      if (run.player.gold < effect.amount) projected.blocked = true;
      projected.gold = Math.max(0, projected.gold - effect.amount);
      projected.risky = true;
      return { tone: projected.blocked ? "blocked" : "cost", text: `크레딧 -${effect.amount}` };
    case "gainMaxHp":
      projected.maxHp += effect.amount;
      projected.hp += effect.amount;
      projected.hasReward = true;
      return { tone: "gain", text: `최대 체력 +${effect.amount}` };
    case "loseMaxHp":
      projected.maxHp = Math.max(1, projected.maxHp - effect.amount);
      projected.hp = Math.min(projected.hp, projected.maxHp);
      projected.risky = true;
      return { tone: "cost", text: `최대 체력 -${effect.amount}` };
    case "upgradeRandomDeck":
      projected.hasReward = true;
      return { tone: "gain", text: `강화 ${effect.amount}` };
    case "gainRelic":
      projected.hasReward = true;
      return { tone: "relic", text: `${effect.rarity === "rare" ? "희귀 " : effect.rarity === "common" ? "일반 " : ""}유물` };
    case "chanceRelic":
      projected.hasReward = true;
      return { tone: "relic", text: `${Math.round(effect.chance * 100)}% 유물` };
    case "addCard":
      projected.hasReward = true;
      return { tone: effect.cardId?.includes("doubt") || effect.cardId?.includes("letter") ? "danger" : "card", text: `카드: ${cardName(effect.cardId)}` };
    case "addRandomCard":
      projected.hasReward = true;
      return { tone: "card", text: `${eventCardPoolLabel(effect)} 카드` };
    case "cardReward":
      projected.hasReward = true;
      return { tone: "card", text: effect.rarity === "rare" ? "희귀 카드 보상" : "카드 보상" };
    case "removeCard":
      projected.hasReward = true;
      return { tone: "deck", text: "카드 제거" };
    case "duplicateCard":
      projected.hasReward = true;
      return { tone: "deck", text: "카드 복제" };
    case "transformCard":
      projected.hasReward = true;
      return { tone: "deck", text: effect.rarity === "rare" ? "희귀 변환" : "카드 변환" };
    case "chanceCurse":
      projected.risky = true;
      return { tone: "danger", text: `${Math.round(effect.chance * 100)}% 저주` };
    case "gainRunFlag":
      if (effect.flag === "startCharge") {
        projected.hasReward = true;
        return { tone: "gain", text: `${runFlagLabel(effect.flag, effect.scope)} +${effect.amount}` };
      }
      projected.risky = true;
      return { tone: "danger", text: `${runFlagLabel(effect.flag, effect.scope)} ${effect.amount}` };
    case "eventCombat":
      projected.risky = true;
      if (effect.rewardRelic) projected.hasReward = true;
      return { tone: "danger", text: effect.rewardRelic ? "전투 후 유물" : "전투 발생" };
    default:
      return { tone: "neutral", text: effect.op };
  }
}

function cardName(cardId) {
  return GAME_DATA.cards.find((card) => card.id === cardId)?.name ?? cardId;
}

function eventCardPoolLabel(effect) {
  if (effect.type) return typeLabel(effect.type);
  if (effect.tag) return keywordLabel(effect.tag);
  return "무작위";
}

function runFlagLabel(flag, scope = "run") {
  const prefix = scope === "nextCombat" ? "다음 전투" : "전투 시작";
  return {
    startFrail: `${prefix} 균열`,
    startVulnerable: `${prefix} 취약`,
    startWeak: `${prefix} 약화`,
    startCharge: `${prefix} 전하`,
    firstTurnDraw: `${prefix} 카드 뽑기`,
    enemyStartVirus: `${prefix} 적 바이러스`
  }[flag] ?? flag;
}

function renderShop(run) {
  const prices = shopServicePrices(run);
  const advice = shopAdvisor(run);
  return `
    <section class="shop-layout">
      <div class="shop-header">
        <div class="shop-header-main">
          <div>
            <h2>마켓</h2>
            <p>필요한 것만 사고, 남은 크레딧으로 다음 길을 준비하세요.</p>
          </div>
          ${advice?.recommendedService ? `<span class="shop-focus">추천 · ${shopServiceShortLabel(advice.recommendedService)}</span>` : ""}
        </div>
        <div class="shop-status-bar" aria-label="상점 현재 상태">
          <span>크레딧 <b>${run.player.gold}</b></span>
          <span>덱 <b>${run.player.deck.length}장</b></span>
          <span>체력 <b>${run.player.hp}/${run.player.maxHp}</b></span>
        </div>
        ${renderChoiceWayfinder(run, "마켓")}
        ${renderShopSpotlight(run, advice)}
        ${renderShopSpendPlan(run, advice, prices)}
      </div>
      <div class="shop-grid">
        <div class="shop-section card-shelf">
          <div class="shop-section-heading">
            <h3>카드</h3>
            <span>${run.shop.cards.filter((item) => !item.sold).length}장</span>
          </div>
          <div class="shop-cards">
            ${run.shop.cards
              .map(
                (item, index) => `
                  <div class="shop-item ${item.sold ? "sold" : ""}">
                    ${renderCard({ uid: item.cardId, cardId: item.cardId }, { compact: true })}
                    ${renderShopCardPreview(run, item)}
                    <button class="shop-buy-button" data-action="shop-card" data-index="${index}" ${item.sold || run.player.gold < item.price ? "disabled" : ""}>${item.sold ? "판매 완료" : `${item.price} 크레딧`}</button>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
        <aside class="shop-side-column" aria-label="마켓 정비와 유물">
          <div class="shop-section services">
            <div class="shop-section-heading">
              <h3>정비</h3>
              <span>회복 · 제거 · 강화</span>
            </div>
            <div class="shop-service-stack">
              ${renderShopService(run, "heal", prices.heal, advice)}
              ${renderShopService(run, "remove", prices.remove, advice)}
              ${renderShopService(run, "upgrade", prices.upgrade, advice)}
            </div>
            ${renderShopExitPanel(run, advice)}
          </div>
          <div class="shop-section relic-shelf">
            <div class="shop-section-heading">
              <h3>유물</h3>
              <span>${run.shop.relics.filter((item) => !item.sold).length}개</span>
            </div>
            <div class="shop-relics">
              ${run.shop.relics
                .map(
                  (item, index) => `
                    <div class="relic-sale ${item.sold ? "sold" : ""}">
                      ${renderRelic(item.relicId, true)}
                      ${renderShopRelicPreview(run, item)}
                      <button class="shop-buy-button" data-action="shop-relic" data-index="${index}" ${item.sold || run.player.gold < item.price ? "disabled" : ""}>${item.sold ? "판매 완료" : `${item.price} 크레딧`}</button>
                    </div>
                  `
                )
                .join("")}
            </div>
          </div>
        </aside>
      </div>
    </section>
  `;
}

function renderShopSpotlight(run, advice) {
  const chips = (advice?.chips ?? []).slice(0, 4);
  const detail = shopSpotlightShortDetail(advice);
  return `
    <section class="shop-spotlight ${advice?.tone ?? "steady"}" aria-label="상점 추천 요약">
      <span>추천 판단</span>
      <strong>${advice?.title ?? "필요한 것만 구매"}</strong>
      <small title="${advice?.detail ?? detail}">${detail}</small>
      <div>
        ${chips.map((chip) => `<i class="${chip.tone}">${chip.text}</i>`).join("")}
      </div>
    </section>
  `;
}

function renderShopSpendPlan(run, advice, prices) {
  const plan = shopSpendPlan(run, advice, prices);
  return `
    <section class="shop-spend-plan ${plan.tone}" aria-label="크레딧 사용 계획">
      <div class="shop-plan-copy">
        <span>크레딧 쓰는 순서</span>
        <strong>${plan.title}</strong>
        <small title="${plan.detail}">${plan.detail}</small>
      </div>
      <div class="shop-plan-wallet" aria-label="${plan.reserveLabel}">
        <span>보유 크레딧</span>
        <strong>${run.player.gold}</strong>
        <small>${plan.reserveLabel}</small>
        <i aria-hidden="true"><b style="width:${plan.walletFill}%"></b></i>
      </div>
      <div class="shop-plan-steps" aria-label="구매 순서">
        ${plan.steps.map((step, index) => `<em class="${step.tone}"><b>${index + 1}</b>${step.text}</em>`).join("")}
      </div>
    </section>
  `;
}

function shopSpotlightShortDetail(advice) {
  if (!advice) return "카드, 유물, 정비 비용을 비교하세요.";
  if (advice.recommendedService === "heal") return "체력이 낮으면 구매보다 회복을 먼저 보세요.";
  if (advice.recommendedService === "remove") return "새 카드보다 방해 카드 한 장을 빼는 편이 좋습니다.";
  if (advice.recommendedService === "upgrade") return "덱을 늘리지 않고 자주 쓰는 카드 한 장을 키웁니다.";
  return firstSentence(advice.detail);
}

function shopSpendPlan(run, advice, prices = shopServicePrices(run)) {
  const analysis = deckAnalysis(run);
  const missingHp = run.player.maxHp - run.player.hp;
  const upgradeable = run.player.deck.filter((card) => isUpgradeableCard(card)).length;
  const openCards = run.shop.cards.filter((item) => !item.sold);
  const openRelics = run.shop.relics.filter((item) => !item.sold);
  const cheapestCard = cheapestShopItem(openCards);
  const cheapestRelic = cheapestShopItem(openRelics);
  const affordableCards = openCards.filter((item) => run.player.gold >= item.price).length;
  const affordableRelics = openRelics.filter((item) => run.player.gold >= item.price).length;
  const canRemove = run.player.gold >= prices.remove && run.player.deck.length > 1;
  const canHeal = run.player.gold >= prices.heal && missingHp > 0;
  const canUpgrade = run.player.gold >= prices.upgrade && upgradeable > 0;
  const needsRemove = analysis.curses > 0 || analysis.total >= 22;
  const needsHeal = missingHp >= Math.max(18, Math.ceil(run.player.maxHp * 0.28));
  const biggestRelevantPrice = Math.max(
    1,
    run.player.gold,
    prices.remove,
    prices.heal,
    prices.upgrade,
    cheapestCard?.price ?? 0,
    cheapestRelic?.price ?? 0
  );
  const walletFill = Math.min(100, Math.round((run.player.gold / biggestRelevantPrice) * 100));

  let tone = "steady";
  let priority = "save";
  let title = "애매하면 크레딧 보존";
  let detail = "지금 덱에 바로 쓰일 때만 사고, 정비 비용은 남겨 둡니다.";
  let firstStep = "필요한 구매만 하고 나가기";

  if ((advice?.recommendedService === "remove" || needsRemove) && canRemove) {
    tone = "strong";
    priority = "remove";
    title = "카드 제거 먼저";
    detail = analysis.curses > 0
      ? "저주가 있으면 새 카드보다 제거가 먼저입니다."
      : "덱이 두꺼우면 새 카드보다 한 장 줄이는 편이 좋습니다.";
    firstStep = `카드 제거 ${prices.remove}`;
  } else if ((advice?.recommendedService === "heal" || needsHeal) && canHeal) {
    tone = "guarded";
    priority = "heal";
    title = "회복 먼저";
    detail = "회복으로 다음 전투를 버틸 여유를 먼저 만듭니다.";
    firstStep = `체력 회복 ${prices.heal}`;
  } else if ((advice?.recommendedService === "upgrade" || analysis.primary.score >= 4) && canUpgrade) {
    tone = "strong";
    priority = "upgrade";
    title = "강화 먼저";
    detail = "덱을 늘리지 않고 핵심 카드 한 장을 키웁니다.";
    firstStep = `카드 강화 ${prices.upgrade}`;
  } else if (affordableRelics > 0) {
    tone = "relic";
    priority = "relic";
    title = "유물부터 확인";
    detail = "유물은 런 끝까지 남습니다. 덱과 맞으면 먼저 확인하세요.";
    firstStep = `유물 ${cheapestRelic?.price ?? "?"}부터`;
  } else if (affordableCards > 0) {
    priority = "card";
    title = "카드는 한 장만 신중하게";
    detail = "덱에 바로 쓰일 카드 한 장만 고르세요.";
    firstStep = `카드 ${cheapestCard?.price ?? "?"}부터`;
  } else if (openCards.length || openRelics.length) {
    tone = "muted";
    title = "지금은 가격이 높음";
    detail = "살 수 있는 물건이 없습니다. 크레딧을 다음 마켓까지 가져가세요.";
    firstStep = "구매 보류";
  }

  const steps = shopSpendPlanSteps({
    priority,
    firstStep,
    tone,
    run,
    prices,
    analysis,
    missingHp,
    upgradeable,
    canRemove,
    canHeal,
    canUpgrade,
    affordableCards,
    affordableRelics,
    cheapestCard,
    cheapestRelic
  });

  return {
    tone,
    title,
    detail,
    steps,
    walletFill,
    reserveLabel: shopReserveLabel(run, prices, { needsRemove, needsHeal, canRemove, canHeal, canUpgrade })
  };
}

function cheapestShopItem(items) {
  return items.reduce((best, item) => (!best || item.price < best.price ? item : best), null);
}

function shopSpendPlanSteps(plan) {
  const steps = [{ tone: plan.tone === "muted" ? "muted" : "strong", text: plan.firstStep }];
  const add = (condition, tone, text) => {
    if (condition && steps.length < 3) steps.push({ tone, text });
  };
  add(plan.priority !== "heal" && plan.missingHp > 0, plan.canHeal ? "guarded" : "muted", plan.canHeal ? `체력 불안하면 회복 ${plan.prices.heal}` : `회복 ${plan.prices.heal - plan.run.player.gold} 부족`);
  add(
    plan.priority !== "remove" && (plan.analysis.curses > 0 || plan.analysis.total >= 22),
    plan.canRemove ? "strong" : "muted",
    plan.canRemove ? `방해 카드 제거 ${plan.prices.remove}` : shopUnavailableServiceText("제거", plan.prices.remove, plan.run.player.gold)
  );
  add(plan.priority !== "upgrade" && plan.upgradeable > 0, plan.canUpgrade ? "strong" : "muted", plan.canUpgrade ? `강화 후보 ${plan.upgradeable}장` : `강화 ${plan.prices.upgrade - plan.run.player.gold} 부족`);
  add(plan.priority !== "relic" && plan.affordableRelics > 0, "relic", `유물 ${plan.cheapestRelic?.price ?? "?"}부터 확인`);
  add(plan.priority !== "card" && plan.affordableCards > 0, "steady", `맞는 카드만 구매`);
  add(true, "steady", plan.run.player.gold >= Math.min(plan.prices.remove, plan.prices.heal) ? "크레딧 남겨도 좋음" : "다음 마켓까지 보존");
  return steps;
}

function shopReserveLabel(run, prices, flags) {
  if (flags.needsRemove) return flags.canRemove ? `제거 후 ${run.player.gold - prices.remove} 남음` : shopUnavailableServiceText("제거", prices.remove, run.player.gold);
  if (flags.needsHeal) return flags.canHeal ? `회복 후 ${run.player.gold - prices.heal} 남음` : `회복까지 ${prices.heal - run.player.gold} 부족`;
  if (flags.canUpgrade) return `강화 가능 · ${prices.upgrade} 필요`;
  return run.player.gold >= prices.remove ? "정비 비용을 남길 수 있음" : "크레딧 보존 추천";
}

function shopUnavailableServiceText(label, price, gold) {
  return gold >= price ? `${label}은 지금 불가` : `${label}까지 ${price - gold} 부족`;
}

function renderShopExitPanel(run, advice) {
  const service = advice?.recommendedService ? shopServiceShortLabel(advice.recommendedService) : "필요한 구매";
  const unsoldCards = run.shop.cards.filter((item) => !item.sold).length;
  const unsoldRelics = run.shop.relics.filter((item) => !item.sold).length;
  return `
    <section class="decision-footer shop-exit-panel" aria-label="상점 마무리">
      <div class="shop-exit-copy">
        <span>마켓 종료</span>
        <strong>${service} 확인 후 맵으로</strong>
        <small>남은 크레딧은 다음 마켓까지 그대로 가져갑니다.</small>
      </div>
      <div class="shop-exit-checks">
        <i class="done">크레딧 ${run.player.gold}</i>
        <i class="${unsoldCards ? "pending" : "done"}">카드 ${unsoldCards}장 남음</i>
        <i class="${unsoldRelics ? "pending" : "done"}">유물 ${unsoldRelics}개 남음</i>
      </div>
      <button class="primary shop-leave-button" data-action="leave-shop">맵으로 돌아가기</button>
    </section>
  `;
}

function renderShopCardPreview(run, item) {
  const insight = rewardCardInsight(run, item.cardId);
  const afford = shopAffordLabel(run, item.price, item.sold);
  return `
    ${renderShopPurchaseLine(run, item, "card")}
    <details class="shop-insight ${item.sold ? "muted" : insight.tone}">
          <summary>
            <span class="shop-insight-head">
              <strong>${item.sold ? "판매 완료" : "판단 근거"}</strong>
              ${renderRewardConceptTag(insight.concept)}
            </span>
          </summary>
      <span class="shop-insight-detail">${afford}. ${insight.detail}</span>
    </details>
  `;
}

function renderShopRelicPreview(run, item) {
  const insight = shopRelicInsight(run, item.relicId);
  const afford = shopAffordLabel(run, item.price, item.sold);
  return `
    ${renderShopPurchaseLine(run, item, "relic")}
    <details class="shop-insight ${item.sold ? "muted" : insight.tone}">
          <summary>
            <span class="shop-insight-head">
              <strong>${item.sold ? "판매 완료" : "효과 자세히"}</strong>
              ${renderRewardConceptTag(insight.concept)}
            </span>
          </summary>
      <span class="shop-insight-detail">${afford}. ${insight.detail}</span>
    </details>
  `;
}

function renderShopPurchaseLine(run, item, kind) {
  const sold = item.sold;
  const canAfford = run.player.gold >= item.price;
  const status = shopPurchaseStatus(run, item, sold);
  if (kind === "card") {
    const card = effectiveCard({ cardId: item.cardId, upgraded: false });
    const insight = rewardCardInsight(run, item.cardId);
    const conceptLabel = insight.concept?.label ?? typeLabel(card.type);
    return `
      <div class="shop-buy-line ${sold ? "muted" : insight.tone} ${!canAfford ? "cannot-afford" : ""}" aria-label="${card.name} 구매 후 변화">
        <span class="shop-buy-kind">${conceptLabel}</span>
        <strong>${sold ? "이미 구매했습니다" : shopCardSummary(insight)}</strong>
        <small>${sold ? `${withTopicParticle(card.name)} 이번 마켓에서 더 살 수 없습니다.` : `구매하면 ${rewardPickLineText(card, insight)}`}</small>
        <em class="shop-buy-status ${status.tone}">${status.label}</em>
      </div>
    `;
  }
  const relic = RELIC_BY_ID[item.relicId];
  const insight = shopRelicInsight(run, item.relicId);
  const conceptLabel = insight.concept?.label ?? "유물";
  return `
    <div class="shop-buy-line ${sold ? "muted" : insight.tone} ${!canAfford ? "cannot-afford" : ""}" aria-label="${relic.name} 구매 후 변화">
      <span class="shop-buy-kind">${conceptLabel}</span>
      <strong>${sold ? "이미 구매했습니다" : shopRelicSummary(insight)}</strong>
      <small>${sold ? `${withTopicParticle(relic.name)} 이번 마켓에서 더 살 수 없습니다.` : shopRelicLineText(relic, insight)}</small>
      <em class="shop-buy-status ${status.tone}">${status.label}</em>
    </div>
  `;
}

function shopPurchaseStatus(run, item, sold = false) {
  if (sold) return { tone: "muted", label: "구매 완료" };
  if (run.player.gold < item.price) return { tone: "warn", label: `${item.price - run.player.gold} 부족` };
  return { tone: "steady", label: `남음 ${Math.max(0, run.player.gold - item.price)}` };
}

function shopRelicLineText(relic, insight) {
  if (insight.tone === "strong") return insight.detail.split(".")[0] + ".";
  if (insight.concept?.label) return `${insight.concept.label} 방향을 여는 유물입니다.`;
  if (/전투 시작|턴 시작/.test(relic.timing)) return "전투 흐름을 자동으로 안정시킵니다.";
  if (/카드 사용|공격|방어|소멸/.test(relic.timing)) return "카드를 쓰는 방식 자체가 달라집니다.";
  if (/보상|상점|휴식/.test(relic.timing)) return "정비와 보상 선택의 가치를 바꿉니다.";
  return insight.detail;
}

function shopCardSummary(insight) {
  return {
    "강하게 맞물림": "강한 시너지",
    "현재 덱에 맞음": "덱에 맞음",
    "보유 유물에 맞음": "유물 연계",
    "받지 않기와 비교": "구매 보류",
    "중복 주의": "중복 주의",
    "새 방향 후보": "새 스타일",
    "가벼운 선택": "가벼운 카드",
    "새 도구": "새 도구"
  }[insight.label] ?? insight.label;
}

function shopRelicSummary(insight) {
  return {
    strong: "잘 맞음",
    relic: "새 방향",
    pivot: "정비 강화",
    warning: "주의",
    muted: "판매 완료"
  }[insight.tone] ?? "유물 효과";
}

function shopServiceShortLabel(service) {
  return {
    heal: "회복",
    remove: "제거",
    upgrade: "강화"
  }[service] ?? "정비";
}

function renderShopService(run, service, price, advice = null) {
  const preview = shopServicePreview(run, service, price);
  const recommended = advice?.recommendedService === service && !preview.disabled;
  const aria = `${preview.label}${recommended ? " · 추천" : ""}`;
  const metrics = preview.metrics.map((metric) => `<i class="${metric.tone}">${metric.label}</i>`).join("");
  return `
    <button class="shop-service ${preview.tone} ${recommended ? "recommended" : ""}" data-action="${preview.action}" aria-label="${aria}" ${preview.disabled ? "disabled" : ""}>
      <span class="shop-service-icon" aria-hidden="true">${shopServiceGlyph(service)}</span>
      <span class="shop-service-head">
        <strong>${preview.label}</strong>
        ${recommended ? `<em class="service-recommendation">추천</em>` : ""}
      </span>
      <span class="shop-service-result">${preview.detail}</span>
      <span class="shop-service-metrics" aria-label="${preview.metricLabel}">${metrics}</span>
      <small class="shop-service-cost" title="${preview.cost}">${preview.priceLabel}</small>
    </button>
  `;
}

function shopServiceGlyph(service) {
  return {
    heal: "+",
    remove: "-",
    upgrade: "↑"
  }[service] ?? "•";
}

function shopAffordLabel(run, price, sold = false) {
  if (sold) return "판매 완료";
  if (run.player.gold < price) return `${price - run.player.gold} 크레딧 부족`;
  const afterGold = run.player.gold - price;
  const reserveNote = shopPurchaseReserveNote(run, afterGold);
  return `잔액 ${afterGold}${reserveNote ? ` · ${reserveNote}` : ""}`;
}

function shopPurchaseReserveNote(run, afterGold) {
  const prices = shopServicePrices(run);
  const hasCurse = run.player.deck.some((card) => effectiveCard(card).type === "curse");
  const removalMatters = hasCurse || run.player.deck.length >= 22;
  if (removalMatters) return afterGold >= prices.remove ? "제거 가능" : "제거 불가";
  const missingHp = run.player.maxHp - run.player.hp;
  if (missingHp >= 20) return afterGold >= prices.heal ? "회복 가능" : "회복 불가";
  if (hasUpgradeableCards(run)) return afterGold >= prices.upgrade ? "강화 가능" : "강화 불가";
  return "";
}

function shopRelicInsight(run, relicId) {
  const relic = RELIC_BY_ID[relicId];
  const hint = RELIC_SYNERGY_HINTS.find((entry) => entry.id === relicId);
  const counts = deckKeywordCounts(run);
  const concept = conceptForRelic(relicId, run);
  const matching = hint?.keywords.filter((keyword) => (counts.get(keyword) ?? 0) > 0) ?? [];
  if (hint && matching.length) {
    return addConcept({
      tone: "strong",
      detail: `${matching.slice(0, 2).map(keywordLabel).join(", ")} 카드가 이미 많습니다. ${hint.text}`
    }, concept);
  }
  if (hint) {
    return addConcept({
      tone: "relic",
      detail: `${hint.keywords.slice(0, 2).map(keywordLabel).join(", ")} 카드를 고를 이유가 생깁니다.`
    }, concept);
  }
  if (/전투 시작|턴 시작/.test(relic.timing)) {
    return addConcept({ tone: "steady", detail: "런 전반을 안정시키는 자동 발동 유물입니다." }, concept);
  }
  if (/카드 사용|공격|방어|소멸/.test(relic.timing)) {
    return addConcept({ tone: "steady", detail: "카드 사용 방식을 바꾸는 유물입니다." }, concept);
  }
  if (/보상|상점|휴식/.test(relic.timing)) {
    return addConcept({ tone: "pivot", detail: "보상과 정비 선택의 값을 바꿉니다." }, concept);
  }
  return addConcept({ tone: "neutral", detail: relic.text }, concept);
}

function shopServicePreview(run, service, price) {
  const canAfford = run.player.gold >= price;
  const serviceCost = canAfford ? `${price} 크레딧 · 남음 ${run.player.gold - price}` : `${price - run.player.gold} 크레딧 부족`;
  const priceLabel = canAfford ? `${price} 크레딧` : `${price - run.player.gold} 부족`;
  const balanceMetric = canAfford
    ? { tone: "wallet", label: `남음 ${run.player.gold - price}` }
    : { tone: "warn", label: `${price - run.player.gold} 부족` };
  if (service === "heal") {
    const hpAfter = Math.min(run.player.maxHp, run.player.hp + 20);
    const healAmount = hpAfter - run.player.hp;
    return {
      action: "shop-heal",
      label: "체력 회복",
      detail: healAmount > 0 ? `체력 ${run.player.hp}→${hpAfter}` : "이미 최대 체력입니다.",
      cost: serviceCost,
      priceLabel,
      metricLabel: healAmount > 0 ? `체력 ${healAmount} 회복, ${serviceCost}` : `체력 최대, ${serviceCost}`,
      metrics: [
        { tone: healAmount > 0 ? "heal" : "muted", label: healAmount > 0 ? `체력 +${healAmount}` : "체력 최대" },
        { tone: "price", label: `${price} 크레딧` },
        balanceMetric
      ],
      disabled: !canAfford || run.player.hp >= run.player.maxHp,
      tone: hpAfter > run.player.hp ? "heal" : "muted"
    };
  }
  if (service === "remove") {
    return {
      action: "shop-remove",
      label: "카드 제거",
      detail: `덱 ${run.player.deck.length}→${Math.max(0, run.player.deck.length - 1)}장`,
      cost: serviceCost,
      priceLabel,
      metricLabel: `덱에서 카드 1장 제거, ${serviceCost}`,
      metrics: [
        { tone: "craft", label: "덱 -1장" },
        { tone: "price", label: `${price} 크레딧` },
        balanceMetric
      ],
      disabled: !canAfford || run.player.deck.length <= 1,
      tone: "craft"
    };
  }
  const upgradeable = run.player.deck.filter((card) => isUpgradeableCard(card)).length;
  return {
    action: "shop-upgrade",
    label: upgradeable ? "카드 강화" : "강화 가능 카드 없음",
    detail: upgradeable ? `후보 ${upgradeable}장 중 1장` : "이미 강화되었거나 변화 없는 카드뿐입니다.",
    cost: serviceCost,
    priceLabel,
    metricLabel: upgradeable ? `카드 1장 강화, ${serviceCost}` : `강화 가능 카드 없음, ${serviceCost}`,
    metrics: [
      { tone: upgradeable ? "craft" : "muted", label: upgradeable ? "강화 +1" : "후보 없음" },
      { tone: "price", label: `${price} 크레딧` },
      balanceMetric
    ],
    disabled: !canAfford || upgradeable <= 0,
    tone: upgradeable ? "craft" : "muted"
  };
}

function renderRest(run) {
  const healAmount = restHealAmount(run);
  const hpAfterHeal = Math.min(run.player.maxHp, run.player.hp + healAmount);
  const canUpgrade = hasUpgradeableCards(run);
  const upgradeableCount = run.player.deck.filter((card) => isUpgradeableCard(card)).length;
  const canRemove = run.player.hp > 5 && run.player.deck.length > 1;
  const restAdvice = restAdvisor(run);
  const progress = runProgressBrief(run);
  return `
    <section class="rest-layout" style="${restSceneStyle(run)}">
      <div class="rest-shell">
        <section class="rest-scene ${restAdvice.tone}" aria-label="세이프룸 상황">
          <div class="rest-scene-art" aria-hidden="true">
            <span class="rest-scene-props"></span>
            <span class="rest-floor-glow"></span>
            <span class="rest-diver-sprite"></span>
            <span class="rest-beacon"></span>
            <span class="rest-pod"></span>
            <span class="rest-workbench"></span>
          </div>
          <div class="rest-scene-copy">
            <span>${progress.actLabel} · ${progress.distanceText}</span>
            <h2>세이프룸</h2>
            <p>${restAdvice.detail}</p>
          </div>
          <div class="rest-vitals" aria-label="정비 전 핵심 상태">
            ${renderRestVital("체력", `${run.player.hp}/${run.player.maxHp}`, `회복 후 ${hpAfterHeal}/${run.player.maxHp}`, run.player.hp <= Math.ceil(run.player.maxHp * 0.45) ? "danger" : "steady")}
            ${renderRestVital("덱", `${run.player.deck.length}장`, canRemove ? "제거 가능" : "제거 불가", canRemove ? "craft" : "muted")}
            ${renderRestVital("강화", `${upgradeableCount}장`, canUpgrade ? "후보 있음" : "후보 없음", canUpgrade ? "craft" : "muted")}
          </div>
        </section>
        <section class="rest-console" aria-label="정비 선택">
          <div class="rest-title-row">
            <div>
              <h2>정비 선택</h2>
              <p>이번 층에서는 한 가지만 적용됩니다.</p>
            </div>
            <span>${restAdvice.title}</span>
          </div>
          <div class="rest-progress-line" aria-label="현재 런 진행">
            <span>${progress.title}</span>
            <i aria-hidden="true"><b style="width:${progress.progress}%"></b></i>
          </div>
          <div class="rest-actions">
            ${renderRestAction(run, "heal", restAdvice, false, "회복", `+${healAmount}`)}
            ${renderRestAction(run, "upgrade", restAdvice, !canUpgrade, "강화", `${upgradeableCount}장 후보`)}
            ${renderRestAction(run, "remove", restAdvice, !canRemove, "카드 제거", "체력 -5")}
          </div>
          <p class="rest-flow-note">강화와 제거는 카드를 고른 뒤 확정됩니다. 회복은 선택 즉시 다음 경로로 돌아갑니다.</p>
        </section>
      </div>
    </section>
  `;
}

function restSceneStyle(run) {
  const node = currentRunNode(run);
  const row = Number(node?.row ?? run.currentRow ?? 0);
  const col = Number(node?.col ?? 0);
  const seed = visualSeed(`${run.seed}:${row}:${col}:safe-room`);
  const sceneOrder = ["archive", "pressure", "machine", "coral", "abyss"];
  const act = Math.max(0, Math.floor(row / 7));
  let sceneKey = sceneOrder[(act + col + (seed % sceneOrder.length)) % sceneOrder.length];
  if (act >= 2 && seed % 3 === 0) sceneKey = "gate";
  const scene = ARENA_SCENE_DEFINITIONS[sceneKey] ?? ARENA_SCENE_DEFINITIONS.archive;
  const position = arenaBackdropPosition(scene.cell);
  const hue = wrapHue(scene.hue + ((seed >>> 7) % 17) - 8);
  const accent = wrapHue(hue + 42 + ((seed >>> 13) % 30));
  const lightX = clamp(scene.lightX + (((seed >>> 4) % 13) - 6), 18, 82);
  const lightY = clamp(scene.lightY + (((seed >>> 9) % 11) - 5), 16, 58);
  const driftX = (((seed >>> 16) % 9) - 4) * 0.34;
  const driftY = (((seed >>> 20) % 7) - 3) * 0.28;
  const zoom = 1.02 + ((seed >>> 24) % 5) / 100;
  return [
    `--rest-hue:${hue}`,
    `--rest-accent:${accent}`,
    `--rest-bg-x:${position.x}`,
    `--rest-bg-y:${position.y}`,
    `--rest-light-x:${lightX}%`,
    `--rest-light-y:${lightY}%`,
    `--rest-drift-x:${driftX.toFixed(1)}%`,
    `--rest-drift-y:${driftY.toFixed(1)}%`,
    `--rest-zoom:${zoom.toFixed(2)}`
  ].join("; ");
}

function renderRestVital(label, value, detail, tone = "steady") {
  return `
    <span class="rest-vital ${tone}">
      <small>${label}</small>
      <strong>${value}</strong>
      <em>${detail}</em>
    </span>
  `;
}

function restActionLabel(action) {
  return {
    heal: "회복",
    upgrade: "강화",
    remove: "카드 제거"
  }[action] ?? "정비";
}

function renderRestAction(run, id, advice, disabled, label, detail) {
  const recommended = advice?.recommendedRest === id && !disabled;
  const aria = `${label}${recommended ? " · 추천" : ""}`;
  const impact = restActionImpact(run, id, disabled);
  return `
    <button class="rest-action ${id} ${recommended ? "recommended" : ""}" data-action="rest" data-id="${id}" aria-label="${aria}" ${disabled ? "disabled" : ""}>
      <span class="rest-action-icon" aria-hidden="true">${restActionGlyph(id)}</span>
      <span class="rest-action-head">
        <strong>${label}</strong>
        ${recommended ? `<em class="rest-recommendation">추천</em>` : ""}
      </span>
      <span class="rest-action-role">${detail}</span>
      <span class="rest-action-impact">${impact.text}</span>
      <span class="rest-action-chips">
        ${impact.chips.map((chip) => `<i class="${chip.tone}">${chip.label}</i>`).join("")}
      </span>
    </button>
  `;
}

function restActionGlyph(id) {
  return {
    heal: "+",
    upgrade: "↑",
    remove: "-"
  }[id] ?? "•";
}

function restActionImpact(run, id, disabled) {
  if (disabled && id === "upgrade") {
    return { text: "강화할 카드가 없습니다.", chips: [{ tone: "muted", label: "선택 불가" }] };
  }
  if (disabled && id === "remove") {
    return { text: "체력이 낮거나 덱이 너무 얇습니다.", chips: [{ tone: "muted", label: "선택 불가" }] };
  }
  const bossPlan = restActionBossPlan(run, id);
  if (bossPlan) return bossPlan;
  if (id === "heal") {
    const heal = restHealAmount(run);
    const hpAfter = Math.min(run.player.maxHp, run.player.hp + heal);
    return {
      text: `${run.player.hp}/${run.player.maxHp} → ${hpAfter}/${run.player.maxHp}`,
      chips: [{ tone: "heal", label: "안전" }]
    };
  }
  if (id === "upgrade") {
    const count = run.player.deck.filter((card) => isUpgradeableCard(card)).length;
    return {
      text: "자주 쓰는 카드 1장을 키웁니다.",
      chips: [{ tone: "craft", label: `${count}장` }]
    };
  }
  const hpAfter = Math.max(0, run.player.hp - 5);
  return {
    text: `${run.player.hp}/${run.player.maxHp} → ${hpAfter}/${run.player.maxHp}`,
    chips: [{ tone: "craft", label: "덱 -1" }]
  };
}

function restActionBossPlan(run, id) {
  const context = deckSelectorBossContext(run);
  if (!context) return null;
  if (id === "heal" && context.missing.includes("체력")) {
    const heal = restHealAmount(run);
    const hpAfter = Math.min(run.player.maxHp, run.player.hp + heal);
    return {
      text: `${context.bossName} 전 체력 ${hpAfter}/${run.player.maxHp}`,
      chips: [{ tone: "heal", label: "보스 전 회복" }]
    };
  }
  if (id === "upgrade" && context.missing.some((label) => ["연속 방어", "큰 방어", "방어", "마무리", "정화·약화"].includes(label))) {
    const missing = context.missing.includes("연속 방어")
      ? "연속 방어"
      : context.missing.includes("큰 방어")
        ? "큰 방어"
        : context.missing.find((label) => ["방어", "마무리", "정화·약화"].includes(label));
    return {
      text: `${missing} 역할의 핵심 카드를 키웁니다.`,
      chips: [{ tone: context.missing.includes("연속 방어") || context.missing.includes("큰 방어") ? "guarded" : "craft", label: "보스 대비" }]
    };
  }
  if (id === "remove" && (context.missing.includes("카드 뽑기") || run.player.deck.length >= 26)) {
    const hpAfter = Math.max(0, run.player.hp - 5);
    return {
      text: `덱 -1 · 체력 ${hpAfter}/${run.player.maxHp}`,
      chips: [{ tone: "craft", label: "보스 전 압축" }]
    };
  }
  return null;
}

function renderSummary(run) {
  const summary = run.summary;
  const defeatedBosses = summary.killedBosses?.length ? summary.killedBosses.join(", ") : "없음";
  const replaySeed = sanitizeSeed(summary.seed ?? run.seed);
  const replayDifficulty = summary.difficultyId ?? run.difficulty ?? 0;
  const nextDifficulty = summary.won ? nextDifficultyAfter(replayDifficulty) : null;
  const verdict = summaryVerdict(summary, replaySeed, nextDifficulty);
  const summaryOpening = summary.won
    ? renderSummaryFinale(summary, defeatedBosses, replaySeed, nextDifficulty, verdict)
    : `${renderSummaryIntro(summary, run)}${renderSummaryVerdict(summary, replaySeed, nextDifficulty, verdict)}`;
  return `
    <section class="summary-layout">
      <div class="summary-panel ${summary.won ? "won" : "lost"}">
        ${summaryOpening}
        ${renderSummaryActions(summary, replaySeed, replayDifficulty, nextDifficulty, verdict)}
        <div class="summary-command-panel" aria-label="다음 런 바로가기">
          ${renderSummaryReplayPrompt(summary, replaySeed, nextDifficulty)}
          ${renderSummaryNextRail(summary)}
        </div>
        ${renderSummaryPathStrip(summary)}
        ${renderSummarySnapshot(summary, defeatedBosses)}
        ${renderSummaryFocusStrip(summary, verdict)}
        <details class="summary-details">
          <summary>
            <span>다음 런 준비</span>
            <strong>경로, 점검표, 다음 선택 자세히 보기</strong>
          </summary>
          ${renderSummaryRunHook(summary)}
          ${renderSummaryScorecard(summary)}
          ${renderSummaryRoute(summary)}
          ${renderSummaryDebrief(summary)}
          ${renderSummaryPlan(summary)}
        </details>
        <details class="summary-details summary-loadout">
          <summary>
            <span>최종 구성</span>
            <strong>덱 ${summary.deckSize}장 · 유물 ${summary.relics}개</strong>
          </summary>
          <div class="summary-collections">
            <section>
              <h3>최종 덱</h3>
              <div class="deck-grid summary-deck">
                ${run.player.deck.map((card) => renderCard(card, { compact: true })).join("")}
              </div>
            </section>
            <section>
              <h3>획득한 유물</h3>
              <div class="summary-relics">
                ${run.player.relics.map((id) => renderRelic(id, true)).join("")}
              </div>
            </section>
          </div>
        </details>
      </div>
    </section>
  `;
}

function renderSummaryIntro(summary, run) {
  return `
    <section class="summary-intro ${summary.won ? "won" : "lost"}" aria-label="런 종료 장면">
      <div class="summary-intro-copy">
        <h2>${summary.won ? "심해 코어 회수" : summary.abandoned ? "탐사를 중단했습니다" : "신호가 끊겼습니다"}</h2>
        <p>${summary.reason}</p>
        ${renderSummaryMeta(summary, run)}
      </div>
      <div class="summary-intro-stage" aria-hidden="true">
        <span class="summary-failure-diver"></span>
        <span class="summary-failure-signal"></span>
        <span class="summary-failure-floor"></span>
      </div>
    </section>
  `;
}

function renderSummaryMeta(summary, run) {
  return `
    <dl class="summary-meta">
      <div><dt>난이도</dt><dd>${summary.difficulty ?? "표층"}</dd></div>
      ${summary.challenge ? `<div><dt>계약</dt><dd>${summary.challenge}</dd></div>` : ""}
      <div><dt>시간</dt><dd>${formatDuration(summary.durationSeconds ?? 0)}</dd></div>
      <div><dt>시드</dt><dd>${summary.seed ?? run.seed}</dd></div>
    </dl>
  `;
}

function renderSummaryFinale(summary, defeatedBosses, replaySeed, nextDifficulty = null, verdict = summaryVerdict(summary, replaySeed, nextDifficulty)) {
  const finalBoss = summary.killedBosses?.at(-1) ?? "마지막 보스";
  const focus = summaryBuildLine(summary, "주력 미정");
  return `
    <section class="summary-finale won" aria-label="최종 승리 요약">
      <div class="summary-finale-copy">
        <span>최종 보스 격파</span>
        <h2>심해 코어 회수</h2>
        <p>${finalBoss}를 넘고 최심부의 왜곡을 끊어냈습니다.</p>
        <div class="summary-finale-chips" aria-label="완주 핵심 수치">
          <i><b>도달</b>${summary.floors ?? 0}층</i>
          <i><b>체력</b>${summary.hp ?? 0}/${summary.maxHp ?? "?"}</i>
          <i><b>보스</b>${summary.bossesDefeated ?? 0}명</i>
        </div>
      </div>
      <div class="summary-finale-stage" aria-hidden="true">
        <span class="summary-finale-boss"></span>
        <span class="summary-finale-core"></span>
        <span class="summary-finale-diver"></span>
      </div>
      ${renderSummaryMeta(summary, { seed: replaySeed })}
      <div class="summary-finale-brief" aria-label="다음 런 브리핑">
        <span>다음 런 브리핑</span>
        <strong>${verdict.action}</strong>
        <small>${focus} 선택은 유지하고, 역할이 겹치는 카드만 줄이세요.</small>
      </div>
      <p class="summary-finale-bosses">처치한 보스: ${defeatedBosses}</p>
    </section>
  `;
}

function renderSummaryActions(summary, replaySeed, replayDifficulty, nextDifficulty = null, verdict = summaryVerdict(summary, replaySeed, nextDifficulty)) {
  const primary =
    !summary.won && replaySeed
      ? {
          action: "replay-seed",
          attrs: `data-id="${replaySeed}" data-difficulty="${replayDifficulty}"`,
          eyebrow: "추천",
          label: "같은 시드 재도전",
          detail: verdict.action
        }
      : summary.won && nextDifficulty
        ? {
            action: "start-next-difficulty",
            attrs: `data-difficulty="${nextDifficulty.id}"`,
            eyebrow: "다음 도전",
            label: nextDifficulty.name,
            detail: "같은 빌드가 더 깊은 층에서도 통하는지 확인"
          }
        : {
            action: "new-run",
            attrs: "",
            eyebrow: summary.won ? "기록 갱신" : "새 시작",
            label: summary.won ? "새 런으로 기록 갱신" : "다른 런 시작",
            detail: verdict.action
          };
  const secondaryButtons = [
    primary.action !== "new-run" ? `<button data-action="new-run">다른 런 시작</button>` : "",
    summary.won && nextDifficulty && primary.action !== "start-next-difficulty" ? `<button data-action="start-next-difficulty" data-difficulty="${nextDifficulty.id}">${nextDifficulty.name} 도전</button>` : "",
    replaySeed && primary.action !== "replay-seed" ? `<button data-action="replay-seed" data-id="${replaySeed}" data-difficulty="${replayDifficulty}">같은 시드 재도전</button>` : "",
    `<button data-action="screen" data-id="records">기록 보기</button>`,
    `<button data-action="back-title">시작 화면</button>`
  ].filter(Boolean);
  return `
    <div class="summary-actions ${summary.won ? "won" : "lost"}" aria-label="런 종료 후 바로 할 수 있는 행동">
      <button class="primary summary-action-main" data-action="${primary.action}" ${primary.attrs}>
        <span>${primary.eyebrow}</span>
        <strong>${primary.label}</strong>
        <small>${primary.detail}</small>
      </button>
      <div class="summary-action-secondary">
        ${secondaryButtons.join("")}
      </div>
    </div>
  `;
}

function renderSummaryVerdict(summary, replaySeed, nextDifficulty = null, verdict = summaryVerdict(summary, replaySeed, nextDifficulty)) {
  return `
    <section class="summary-verdict ${summary.won ? "won" : "lost"}" aria-label="이번 런 결론">
      <div class="summary-verdict-copy">
        <span>${verdict.label}</span>
        <strong>${verdict.title}</strong>
        <p>${verdict.detail}</p>
      </div>
      <dl class="summary-verdict-stats">
        ${verdict.stats.map((stat) => `<div><dt>${stat.label}</dt><dd>${stat.value}</dd></div>`).join("")}
      </dl>
      <div class="summary-verdict-cta">
        <div class="summary-verdict-cta-main">
          <span>다음 런 브리핑</span>
          <strong>${verdict.action}</strong>
          <small>${summaryRetryBriefLine(summary)}</small>
        </div>
        <div class="summary-verdict-cta-chips">
          ${summaryRetryBriefChips(summary, replaySeed, nextDifficulty).map((chip) => `<i><b>${chip.label}</b>${chip.value}</i>`).join("")}
        </div>
      </div>
    </section>
  `;
}

function summaryVerdict(summary, replaySeed, nextDifficulty = null) {
  const stop = summaryStopPoint(summary);
  const focus = summaryBuildCompactLine(summary, "주력 미정");
  const headlineFocus = summaryPrimaryBuildText(summary, "선택한 방향");
  const firstStep = summaryNextRunSteps(summary)[0];
  const failureAdvice = summary.won ? null : summaryFailureAdvice(summary);
  const stats = [
    { label: "결과", value: summary.won ? "완주" : summary.abandoned ? "포기" : "실패" },
    { label: "지점", value: summary.won ? `${summary.floors ?? 0}층 완주` : stop },
    { label: "주력", value: focus }
  ];
  if (summary.won) {
    return {
      label: "완주",
      title: `${headlineFocus}로 코어를 회수했습니다`,
      detail: "같은 방향은 충분히 통했습니다. 다음 런에서는 역할이 겹치는 카드만 줄여 핵심 카드를 더 자주 뽑는 데 집중하세요.",
      action: nextDifficulty ? `${nextDifficulty.name} 도전` : replaySeed ? "같은 시드로 더 빠른 완주" : "새 런으로 기록 갱신",
      stats
    };
  }
  if (summary.abandoned) {
    return {
      label: "런 포기",
      title: `${stop}에서 탐사를 정리했습니다`,
      detail: "이 기록은 패배처럼 저장됩니다. 같은 시드로 다시 들어가 첫 경로와 보상 선택을 바꾸면 바로 비교할 수 있습니다.",
      action: replaySeed ? "같은 시드에서 다른 선택 시도" : "새 런에서 다른 주력 시도",
      stats
    };
  }
  return {
    label: "실패 지점",
    title: failureAdvice?.title ?? `${stop}에서 멈췄습니다`,
    detail: failureAdvice?.verdictDetail ?? failureAdvice?.detail ?? firstStep?.detail ?? "첫 보상에서 주력을 빨리 정하고, 맞지 않는 카드는 과감히 넘기세요.",
    action: replaySeed ? failureAdvice?.action ?? "같은 시드에서 첫 선택 바꿔보기" : "새 런에서 첫 선택부터 바꾸기",
    stats
  };
}

function summaryRetryBriefLine(summary) {
  if (summary.won) {
    return `${summaryPrimaryBuildText(summary, "핵심 카드")} 선택은 유지하고, 역할이 겹치는 카드만 줄이세요.`;
  }
  if (summary.abandoned) {
    return "포기한 지점의 체력, 덱 크기, 다음 경로를 보고 첫 선택을 하나만 바꿔 보세요.";
  }
  return summaryFailureAdvice(summary).brief;
}

function summaryRetryBriefChips(summary, replaySeed, nextDifficulty = null) {
  const firstStep = summaryNextRunSteps(summary)[0];
  const stop = summary.won ? `${summary.floors ?? 0}층 완주` : summaryStopPoint(summary);
  if (!summary.won && summaryFinalBossLoss(summary)) {
    return [
      { label: "막힌 곳", value: stop },
      { label: "첫 선택", value: firstStep?.title ?? "보스 전 정비" },
      summaryFinalBossRetryChip(summary)
    ];
  }
  const thirdChip = nextDifficulty
    ? { label: "다음", value: nextDifficulty.name }
    : { label: "시드", value: replaySeed || "랜덤" };
  return [
    { label: summary.won ? "완주" : "막힌 곳", value: stop },
    { label: summary.won ? "유지" : "첫 선택", value: firstStep?.title ?? "주력 정하기" },
    thirdChip
  ];
}

function renderSummaryFocusStrip(summary, verdict) {
  const stop = summary.won ? `${summary.floors ?? 0}층 완주` : summaryStopPoint(summary);
  const focus = summaryBuildCompactLine(summary, "주력 미정");
  const note = summaryBuildShortNote(summary);
  return `
    <section class="summary-focus-strip ${summary.won ? "won" : "lost"}" aria-label="이번 런과 다음 선택">
      <article>
        <span>이번 주력</span>
        <strong>${focus}</strong>
        <small>${note}</small>
      </article>
      <article>
        <span>${summary.won ? "완주 지점" : "막힌 곳"}</span>
        <strong>${stop}</strong>
        <small>${summary.won ? "다음 난이도에서 같은 선택이 통하는지 확인하세요." : "같은 시드로 들어가면 선택 차이를 바로 비교할 수 있습니다."}</small>
      </article>
      <article>
        <span>다음 선택</span>
        <strong>${verdict.action}</strong>
        <small>${summary.won ? "역할이 겹치는 카드만 줄여 속도를 올리세요." : "첫 보상과 첫 경로를 바꾸는 것부터 시작하세요."}</small>
      </article>
    </section>
  `;
}

function renderSummaryReplayPrompt(summary, replaySeed, nextDifficulty = null) {
  const prompt = summaryReplayPrompt(summary, replaySeed, nextDifficulty);
  return `
    <section class="summary-replay-prompt ${prompt.tone}" aria-label="재도전 제안">
      <span>다시 해볼 선택</span>
      <strong>${prompt.title}</strong>
      <p>${prompt.detail}</p>
      <div>
        ${prompt.chips.map((chip) => `<i><b>${chip.label}</b>${chip.value}</i>`).join("")}
      </div>
    </section>
  `;
}

function renderSummaryNextRail(summary) {
  const steps = summaryOpeningPlanSteps(summary);
  return `
    <section class="summary-next-rail ${summary.won ? "won" : "lost"}" aria-label="다음 런 추천 행동">
      <header>
        <span>${summary.won ? "첫 선택 플랜" : "재도전 플랜"}</span>
        <strong>${summary.won ? "잘 된 방향을 더 빨리 완성" : "막힌 지점을 첫 선택으로 고치기"}</strong>
      </header>
      <ol>
        ${steps
          .map(
            (step) => `
              <li class="${step.tone}" aria-label="${step.label}: ${step.title}. ${summaryNextStepShortText(step.detail)}" title="${summaryNextStepShortText(step.detail)}">
                <b>${step.label}</b>
                <div>
                  <strong>${step.title}</strong>
                  <small>${summaryNextStepShortText(step.detail)}</small>
                </div>
              </li>
            `
          )
          .join("")}
      </ol>
    </section>
  `;
}

function summaryOpeningPlanSteps(summary) {
  const labels = summaryOpeningPlanLabels(summary);
  return summaryNextRunSteps(summary)
    .slice(0, 3)
    .map((step, index) => ({
      ...step,
      label: labels[index] ?? `${index + 1}번`
    }));
}

function summaryOpeningPlanLabels(summary) {
  if (summary.won) return ["첫 보상", "덱 손질", "보스 전"];
  if (summaryFinalBossLoss(summary)) return ["마지막 정비", "보스 패턴", "마무리 턴"];
  return ["첫 보상", "첫 경로", "첫 정비"];
}

function summaryNextStepShortText(detail = "") {
  return firstSentence(detail).replace(/\s+/g, " ");
}

function renderSummarySnapshot(summary, defeatedBosses) {
  return `
    <section class="summary-snapshot" aria-label="이번 런 핵심 결과">
      <dl class="summary-stats">
        <div><dt>도달</dt><dd>${summary.floors}층</dd></div>
        <div><dt>덱</dt><dd>${summary.deckSize}장</dd></div>
        <div><dt>유물</dt><dd>${summary.relics}개</dd></div>
        <div><dt>보스</dt><dd>${summary.bossesDefeated ?? 0}</dd></div>
      </dl>
      <div class="summary-bosses">
        <strong>처치한 보스</strong>
        <span>${defeatedBosses}</span>
      </div>
      <dl class="summary-extra-stats">
        <div><dt>처치</dt><dd>${summary.killed}</dd></div>
        <div><dt>크레딧</dt><dd>${summary.gold ?? 0}</dd></div>
        <div><dt>피해</dt><dd>${summary.damageDealt}</dd></div>
        <div><dt>손실</dt><dd>${summary.damageTaken}</dd></div>
      </dl>
    </section>
  `;
}

function renderSummaryPathStrip(summary) {
  const acts = (summary.route?.acts ?? []).filter((act) => act.floors > 0 || act.stoppedAt);
  if (!acts.length) return "";
  const stop = summaryStopPoint(summary);
  const totalFloors = summary.route?.totalFloors ?? summary.floors ?? 0;
  return `
    <section class="summary-path-strip ${summary.won ? "won" : "lost"}" aria-label="런 진행 경로 요약">
      <header>
        <span>진행 경로</span>
        <strong>${summary.won ? `${totalFloors}층 완주` : `${stop}에서 멈춤`}</strong>
      </header>
      <div>
        ${acts.map((act) => renderSummaryPathAct(act)).join("")}
      </div>
    </section>
  `;
}

function renderSummaryPathAct(act) {
  const reached = act.floors > 0;
  const progress = Math.max(0, Math.min(100, Math.round(((act.floors ?? 0) / 7) * 100)));
  const stopped = act.stoppedAt ? `${act.stoppedAt.floor}층 ${nodeTypeLabel(act.stoppedAt.type)}` : "";
  const statusClass = reached ? act.boss || "reached" : "unseen";
  const label = act.boss === "defeated" ? "보스 격파" : act.boss === "reached" ? "보스전 도달" : stopped || (reached ? `${act.floors}층 도달` : "진입 전");
  return `
    <article class="${statusClass}">
      <span>${act.act}막</span>
      <i aria-hidden="true"><b style="width:${progress}%"></b></i>
      <small>${label}</small>
    </article>
  `;
}

function summaryReplayPrompt(summary, replaySeed, nextDifficulty = null) {
  const firstPlan = summaryPlanItems(summary)[0] ?? summaryNextRunSteps(summary)[0];
  const stop = summaryStopPoint(summary);
  const direction = summaryPrimaryBuildText(summary, "첫 핵심 카드");
  const failureAdvice = summary.won ? null : summaryFailureAdvice(summary);
  if (summary.won) {
    return {
      tone: "strong",
      title: nextDifficulty ? `${nextDifficulty.name}에서 같은 방향 시험` : "같은 방향으로 더 빠른 완주",
      detail: `${direction} 선택이 통했습니다. 다음에는 첫 세 보상 안에 같은 계열 2장을 모으고, 덱 크기만 조금 더 얇게 유지하세요.`,
      chips: [
        { label: "목표", value: firstPlan?.title ?? "핵심 카드 빨리 모으기" },
        { label: "조건", value: nextDifficulty ? `${nextDifficulty.name} 도전 가능` : "같은 시드 재도전" },
        { label: "시드", value: replaySeed || "랜덤" }
      ]
    };
  }
  const retryChips = summaryFinalBossLoss(summary)
    ? [
        { label: "목표", value: firstPlan?.title ?? "최종 보스 정비" },
        summaryFinalBossRetryChip(summary),
        summaryFinalBossReadinessChip(summary, replaySeed)
      ]
    : [
        { label: "목표", value: firstPlan?.title ?? "첫 방향 정하기" },
        { label: "막힌 곳", value: stop },
        { label: "시드", value: replaySeed || "랜덤" }
      ];
  return {
    tone: firstPlan?.tone ?? "steady",
    title: `${stop}에서 ${failureAdvice?.retryTitle ?? "다른 선택 보기"}`,
    detail: `${firstPlan?.detail ?? "첫 보상에서 주력을 빨리 정하세요."} 같은 시드로 들어가면 어느 선택이 달랐는지 비교하기 쉽습니다.`,
    chips: retryChips
  };
}

function summaryFinalBossRetryChip(summary) {
  const finalCombat = summary.finalCombat ?? {};
  const moveLabel = summaryFinalBossMoveLabel(finalCombat.bossMove);
  const incomingDamage = finalCombat.forecast?.incomingDamage ?? 0;
  const summons = finalCombat.forecast?.summons ?? 0;
  if (moveLabel && incomingDamage > 0) return { label: "패턴", value: `${moveLabel} ${incomingDamage}피해` };
  if (moveLabel && summons > 0) return { label: "패턴", value: `${moveLabel} 소환` };
  if (moveLabel) return { label: "패턴", value: moveLabel };
  if (Number.isFinite(finalCombat.bossHp) && Number.isFinite(finalCombat.bossMaxHp)) {
    return { label: "본체", value: `${Math.max(0, finalCombat.bossHp)}/${finalCombat.bossMaxHp}` };
  }
  return { label: "패턴", value: "2단계" };
}

function summaryFinalBossHpChip(summary, replaySeed) {
  const finalCombat = summary.finalCombat ?? {};
  if (Number.isFinite(finalCombat.bossHp) && Number.isFinite(finalCombat.bossMaxHp)) {
    return { label: "본체", value: `${Math.max(0, finalCombat.bossHp)}/${finalCombat.bossMaxHp}` };
  }
  return { label: "시드", value: replaySeed || "랜덤" };
}

function summaryFinalBossReadinessChip(summary, replaySeed) {
  const handPlan = summary.finalCombat?.handPlan;
  if (handPlan && Number.isFinite(handPlan.retainedBurstDefense) && handPlan.retainedBurstDefense <= 0) {
    return { label: "공백", value: "보존 방어 0" };
  }
  if (handPlan && Number.isFinite(handPlan.bestBlock)) {
    return { label: "손패", value: `방어 ${handPlan.bestBlock}` };
  }
  return summaryFinalBossHpChip(summary, replaySeed);
}

function summaryFinalBossMoveLabel(move = "") {
  const labels = {
    gate_slam: "문 낙하",
    gate_call: "문지기 호출",
    phase_requiem: "레퀴엠"
  };
  return labels[move] ?? "";
}

function summaryStopPoint(summary) {
  const stopped = (summary.route?.acts ?? [])
    .filter((act) => act.stoppedAt)
    .at(-1)?.stoppedAt;
  if (stopped) return `${stopped.floor}층 ${nodeTypeLabel(stopped.type)}`;
  if (summary.abandoned && (summary.floors ?? 0) <= 0) return "첫 경로 선택";
  return `${summary.floors ?? 0}층`;
}

function summaryStoppedAct(summary) {
  return (summary.route?.acts ?? []).filter((act) => act.stoppedAt).at(-1) ?? null;
}

function summaryFailureProfile(summary) {
  const stoppedAct = summaryStoppedAct(summary);
  const stoppedAt = stoppedAct?.stoppedAt ?? null;
  const stoppedType = stoppedAt?.type ?? "";
  const floor = stoppedAt?.floor ?? summary.floors ?? 0;
  const fights = Math.max(1, summary.fights ?? 1);
  const damagePerFight = Math.round((summary.damageTaken ?? 0) / fights);
  const deckSize = summary.deckSize ?? 0;
  const removed = summary.cardsRemoved ?? 0;
  const shops = summary.route?.shops ?? 0;
  const rests = summary.route?.rests ?? 0;
  const tags = summary.build ?? [];
  const profile = {
    reason: summary.reason ?? "",
    stoppedAct,
    stoppedAt,
    stoppedType,
    stopLabel: stoppedAt ? `${floor}층 ${nodeTypeLabel(stoppedType)}` : summaryStopPoint(summary),
    actLabel: stoppedAct?.act ? `${stoppedAct.act}막` : "이번 런",
    floor,
    fights,
    damagePerFight,
    deckSize,
    removed,
    shops,
    rests,
    tags,
    bosses: summary.bossesDefeated ?? 0,
    finalCombat: summary.finalCombat ?? null,
    finalBoss: summaryFinalBossLoss(summary, stoppedAct, stoppedAt)
  };
  return { ...profile, cause: summaryFailureCause(profile) };
}

function summaryFailureCause(profile) {
  if (profile.finalBoss) return "finalBoss";
  if (/상태 피해|바이러스|사망한 편지|젖은 의심/.test(profile.reason)) return "status";
  if (profile.stoppedType === "boss" || profile.stoppedAct?.boss === "reached") return "boss";
  if (profile.stoppedType === "elite") return "elite";
  if (profile.stoppedType === "event") return "event";
  if (/공격|체력이 0/.test(profile.reason) || profile.damagePerFight >= 14) return "survival";
  if (profile.deckSize >= 26 && profile.removed <= 1) return "deck";
  if (profile.shops + profile.rests <= 1 && profile.floor >= 10) return "route";
  return "direction";
}

function summaryFinalBossLoss(summary, stoppedAct = summaryStoppedAct(summary), stoppedAt = stoppedAct?.stoppedAt ?? null) {
  return Boolean(
    !summary.won &&
      (summary.finalCombat?.bossId === "last_gate_choir" ||
        summary.finalCombat?.bossName === "마지막 문 성가대" ||
        (stoppedAct?.act === 3 && stoppedAt?.type === "boss"))
  );
}

function summaryFailureAdvice(summary, profile = summaryFailureProfile(summary)) {
  if (profile.cause === "status") {
    return {
      tone: "warning",
      title: "해로운 상태를 지울 수단이 부족했습니다",
      detail: "감염과 저주가 손패를 막기 전에 전투를 끝내거나, 정화와 약화로 피해를 끊어야 합니다.",
      brief: "감염·저주가 보이면 정화, 약화, 빠른 처치 중 하나를 먼저 챙기세요.",
      action: "상태 대처 카드 먼저 찾기",
      retryTitle: "상태 대처부터 바꿔보기",
      chips: ["정화", "약화", "빠른 처치"],
      plan: {
        tone: "warning",
        label: "초반 선택",
        title: "정화와 약화 먼저 확보",
        detail: "첫 상점이나 보상에서 정화, 약화, 빠른 처치 중 하나를 우선하세요. 해로운 카드가 쌓이기 전에 전투를 짧게 끝내는 것이 핵심입니다."
      },
      threat: {
        label: "위험 신호",
        title: "해로운 상태가 손패를 막음",
        detail: "정화, 약화, 빠른 처치 카드의 우선순위를 올리면 바이러스와 저주의 누적 피해를 끊을 수 있습니다."
      },
      steps: [
        { tone: "warning", title: "상태 대처 카드 확보", detail: "정화, 약화, 빠른 처치 중 하나를 첫 구역에서 찾습니다." },
        { tone: "strong", title: "전투를 짧게 끝내기", detail: "상태를 쌓는 적은 방어만 하지 말고 마무리 피해를 우선합니다." },
        { tone: "steady", title: "상점에서는 제거 먼저", detail: "저주나 상태 카드가 늘면 구매보다 카드 제거를 먼저 씁니다." }
      ]
    };
  }
  if (profile.cause === "finalBoss") {
    return summaryFinalBossAdvice(profile);
  }
  if (profile.cause === "boss") {
    return {
      tone: "danger",
      title: `${profile.actLabel} 보스전 준비가 부족했습니다`,
      detail: "보스전까지 도달했습니다. 다음에는 보스 직전 경로에서 체력, 방어, 큰 피해 카드 중 빈 역할을 먼저 채우세요.",
      brief: "보스 직전에는 새 카드보다 회복, 방어, 큰 피해 카드 중 부족한 것부터 보세요.",
      action: "보스 전 정비 먼저 보기",
      retryTitle: "보스 전 선택 바꿔보기",
      chips: ["보스 전 정비", "회복", "큰 피해"],
      plan: {
        tone: "danger",
        label: "보스 준비",
        title: "보스 전 정비를 먼저 보기",
        detail: "보스 직전 체력이 절반 아래라면 강화보다 회복을, 피해가 부족하면 큰 공격 카드나 취약 부여를 먼저 고르세요."
      },
      threat: {
        label: "위험 신호",
        title: "보스전까지 갔지만 마지막 준비가 부족함",
        detail: "다음 런에서는 보스 직전의 상점과 휴식에서 체력, 방어, 큰 피해 중 가장 비어 있는 역할을 하나만 확실히 채우세요."
      },
      steps: [
        { tone: "danger", title: "보스 전 체력 확인", detail: "체력이 절반 아래면 강화보다 회복이나 안전 경로를 먼저 봅니다." },
        { tone: "strong", title: "큰 피해 카드 남기기", detail: "2막 이후에는 보스 체력을 끝낼 카드 1장을 덱 안에 확실히 둡니다." },
        { tone: "warning", title: "방어·약화 보강", detail: "큰 공격 예고를 넘길 방어 카드와 약화 카드의 가치를 더 높게 봅니다." }
      ]
    };
  }
  if (profile.cause === "elite") {
    return {
      tone: "warning",
      title: "엘리트 도전이 조금 빨랐습니다",
      detail: "유물 보상은 크지만 방어와 체력이 갖춰지기 전에는 손실이 더 큽니다. 다음에는 첫 엘리트 전에 생존 카드를 먼저 보세요.",
      brief: "방어와 체력이 갖춰지기 전에는 엘리트보다 상점·휴식 경로가 안정적입니다.",
      action: "첫 엘리트 타이밍 늦추기",
      retryTitle: "엘리트 전 경로 바꿔보기",
      chips: ["엘리트 타이밍", "방어", "휴식"],
      plan: {
        tone: "warning",
        label: "경로 선택",
        title: "첫 엘리트 전에 생존 카드 확보",
        detail: "방어 카드 2장, 약화 카드 1장, 체력 절반 이상 중 둘 이상이 갖춰졌을 때 엘리트를 노리세요."
      },
      threat: {
        label: "위험 신호",
        title: "준비 전 엘리트에서 체력 손실",
        detail: "초반에는 유물보다 생존이 먼저입니다. 방어와 약화가 부족하면 엘리트 대신 상점이나 휴식 경로를 택하세요."
      },
      steps: [
        { tone: "warning", title: "첫 엘리트 늦추기", detail: "방어와 약화가 부족하면 엘리트보다 상점이나 휴식 경로를 고릅니다." },
        { tone: "steady", title: "체력 절반 이상 유지", detail: "엘리트 직전 체력이 낮으면 회복을 먼저 선택합니다." },
        { tone: "strong", title: "유물은 준비 뒤에", detail: "첫 유물은 강하지만, 받을 피해를 줄일 수 있을 때 가치가 커집니다." }
      ]
    };
  }
  if (profile.cause === "event") {
    return {
      tone: "warning",
      title: "이벤트 리스크가 크게 돌아왔습니다",
      detail: "체력 지불이나 저주 선택은 덱이 준비됐을 때만 이득입니다. 체력이 낮으면 안전한 보상이나 상점 제거를 우선하세요.",
      brief: "체력이 낮을 때는 체력 지불·저주 선택보다 안전한 보상과 제거를 우선하세요.",
      action: "위험 이벤트 보수적으로 고르기",
      retryTitle: "이벤트 선택 바꿔보기",
      chips: ["체력 지불 주의", "저주 제거", "안전 보상"],
      plan: {
        tone: "warning",
        label: "이벤트 선택",
        title: "체력 지불은 여유 있을 때만",
        detail: "체력이 절반 아래라면 체력 지불 보상보다 안전한 선택을 고르고, 저주를 받았다면 다음 상점에서 제거를 먼저 쓰세요."
      },
      threat: {
        label: "위험 신호",
        title: "이벤트 선택이 체력과 덱을 흔듦",
        detail: "좋은 보상이라도 체력 지불과 저주는 다음 전투를 어렵게 만듭니다. 다음에는 현재 체력과 제거 기회를 먼저 계산하세요."
      },
      steps: [
        { tone: "warning", title: "체력 지불 줄이기", detail: "체력이 절반 아래일 때는 위험 보상보다 안전한 선택을 고릅니다." },
        { tone: "steady", title: "저주를 받으면 제거 예약", detail: "저주나 상태 카드를 받았다면 다음 상점에서 제거를 먼저 봅니다." },
        { tone: "strong", title: "강한 보상은 준비 뒤에", detail: "회복 경로가 보일 때만 큰 리스크 보상을 선택하세요." }
      ]
    };
  }
  if (profile.cause === "survival") {
    return {
      tone: "danger",
      title: "예고 피해를 버틸 카드가 부족했습니다",
      detail: `전투당 평균 피해가 ${profile.damagePerFight}였습니다. 다음에는 1막에서 방어 카드와 약화 카드를 먼저 확보하세요.`,
      brief: "큰 공격 턴을 넘길 방어와 약화를 1막에서 먼저 확보하세요.",
      action: "방어·약화 먼저 챙기기",
      retryTitle: "방어 선택부터 바꿔보기",
      chips: ["방어", "약화", "생존 유물"],
      plan: {
        tone: "danger",
        label: "초반 선택",
        title: "큰 공격 턴을 넘길 방어 확보",
        detail: "1막에서 방어 카드 2장, 약화 카드 1장, 첫 턴 생존 유물 중 최소 하나를 챙기면 엘리트와 보스가 훨씬 안정됩니다."
      },
      threat: {
        label: "위험 신호",
        title: "예고 피해를 넘기지 못함",
        detail: "다음 런에서는 방어 카드 2장 이상, 약화 부여, 첫 턴 생존 유물을 더 높게 평가해 큰 공격 턴을 통과하세요."
      },
      steps: [
        { tone: "danger", title: "큰 공격 턴 대비", detail: "방어 카드 2장과 약화 1장을 1막 안에 목표로 합니다." },
        { tone: "steady", title: "보스 전 체력 확인", detail: "체력이 낮으면 강화보다 회복을 고르는 편이 안정적입니다." },
        { tone: "warning", title: "엘리트는 준비 뒤에", detail: "초반 방어가 부족하면 엘리트보다 상점이나 휴식 경로를 택합니다." }
      ]
    };
  }
  if (profile.cause === "deck") {
    return {
      tone: "warning",
      title: "덱이 두꺼워져 핵심 카드가 늦었습니다",
      detail: `최종 덱이 ${profile.deckSize}장이었습니다. 다음에는 보상 스킵과 카드 제거로 핵심 카드를 더 자주 뽑게 만드세요.`,
      brief: "덱이 커질수록 핵심 카드가 늦게 옵니다. 상점에서는 구매보다 제거를 먼저 보세요.",
      action: "덱 제거 먼저 해보기",
      retryTitle: "덱 정리부터 바꿔보기",
      chips: ["카드 제거", "보상 스킵", "카드 뽑기"],
      plan: {
        tone: "warning",
        label: "덱 손질",
        title: "제거 2회 이상 노리기",
        detail: `최종 덱이 ${profile.deckSize}장이었습니다. 상점과 휴식의 카드 제거를 한 번씩 더 쓰면 핵심 카드가 빨리 돌아옵니다.`
      },
      threat: {
        label: "위험 신호",
        title: "핵심 카드가 늦게 잡힘",
        detail: "카드가 많으면 좋은 조합도 손패에 늦게 들어옵니다. 다음에는 맞지 않는 보상을 넘기고 제거를 먼저 쓰세요."
      },
      steps: [
        { tone: "warning", title: "카드 제거 먼저", detail: "상점에 들르면 구매 전 제거부터 계산합니다." },
        { tone: "steady", title: "안 맞는 보상 넘기기", detail: "주력과 맞지 않는 카드는 좋아 보여도 스킵합니다." },
        { tone: "strong", title: "카드 뽑기 보강", detail: "덱이 24장을 넘으면 추가 뽑기 카드의 가치가 크게 올라갑니다." }
      ]
    };
  }
  if (profile.cause === "route") {
    return {
      tone: "warning",
      title: "정비 없이 너무 깊게 들어갔습니다",
      detail: "상점과 휴식은 약한 선택이 아니라 런을 이어 주는 안전장치입니다. 체력이나 덱이 흔들리면 경로부터 바꾸세요.",
      brief: "체력이나 덱이 흔들릴 때는 전투 보상보다 상점·휴식 경로를 먼저 잡으세요.",
      action: "상점·휴식 경로 먼저 보기",
      retryTitle: "경로 선택 바꿔보기",
      chips: ["상점", "휴식", "카드 제거"],
      plan: {
        tone: "warning",
        label: "경로 선택",
        title: "상점·휴식 경로 확보",
        detail: "체력이 낮거나 덱이 커졌다면 다음 전투 보상보다 상점과 휴식 경로를 우선해 회복, 강화, 제거 중 하나를 해결하세요."
      },
      threat: {
        label: "위험 신호",
        title: "정비 기회가 부족함",
        detail: "상점과 휴식은 빌드를 다듬는 구간입니다. 다음 런에서는 위험 전투 전에 정비 지점을 하나 더 끼워 넣으세요."
      },
      steps: [
        { tone: "warning", title: "정비 지점 먼저 보기", detail: "다음 선택에서 상점이나 휴식이 보이면 체력과 덱 상태를 먼저 확인합니다." },
        { tone: "steady", title: "회복·강화 중 하나 선택", detail: "체력이 낮으면 회복, 핵심 카드가 있으면 강화가 우선입니다." },
        { tone: "strong", title: "상점에서는 제거 계산", detail: "구매 전에 제거로 덱이 얼마나 빨라지는지 먼저 봅니다." }
      ]
    };
  }
  return {
    tone: "steady",
    title: "카드 방향이 늦게 정해졌습니다",
    detail: "첫 세 번의 보상 안에 전하, 표식, 바이러스, 반격 중 하나를 정하고 맞지 않는 카드는 넘겨 보세요.",
    brief: "첫 보상부터 카드 방향을 하나로 좁히고, 맞지 않는 카드는 과감히 넘기세요.",
    action: "첫 보상부터 방향 좁히기",
    retryTitle: "첫 보상 바꿔보기",
    chips: ["방향 선택", "보상 스킵", "덱 정리"],
    plan: {
      tone: "steady",
      label: "초반 선택",
      title: "첫 세 보상 안에 주력 정하기",
      detail: "전하, 표식, 바이러스, 반격 중 하나를 고르고 맞지 않는 보상은 넘겨 핵심 카드를 더 자주 보세요."
    },
    threat: {
      label: "위험 신호",
      title: "중반 전환점에서 힘이 부족함",
      detail: "주력을 하나로 좁히고, 지금 덱과 맞지 않는 보상은 과감히 넘겨 핵심 카드를 더 자주 보세요."
    },
    steps: [
      { tone: "steady", title: "첫 세 보상 안에 하나만 고르기", detail: "전하, 표식, 바이러스, 반격 중 하나만 먼저 잡습니다." },
      { tone: "warning", title: "안 맞는 카드는 넘기기", detail: "지금 방향과 다른 카드는 좋아 보여도 스킵합니다." },
      { tone: "strong", title: "큰 피해 카드 확보", detail: "2막 전에는 보스 체력을 끝낼 공격 수단을 정합니다." }
    ]
  };
}

function summaryFinalBossAdvice(profile) {
  const cue = summaryFinalBossCue(profile.finalCombat);
  const bossState = summaryFinalBossStateText(profile.finalCombat);
  return {
    tone: "danger",
    title: cue.title,
    detail: `${cue.detail} ${bossState}`,
    verdictDetail: summaryFinalBossVerdictDetail(cue, profile.finalCombat),
    brief: cue.brief,
    action: cue.action,
    retryTitle: cue.retryTitle,
    chips: cue.chips,
    plan: {
      tone: "danger",
      label: "최종 보스",
      title: cue.planTitle,
      detail: cue.planDetail
    },
    threat: {
      label: "마지막 문",
      title: cue.threatTitle,
      detail: cue.threatDetail
    },
    steps: cue.steps
  };
}

function summaryFinalBossVerdictDetail(cue, finalCombat = {}) {
  const hand = summaryFinalBossHandPlanText(finalCombat.handPlan);
  if (hand) return `${cue.brief} ${hand}`;
  return cue.brief;
}

function summaryFinalBossCue(finalCombat = {}) {
  const hpRatio = finalCombat?.bossMaxHp ? (finalCombat.bossHp ?? 0) / Math.max(1, finalCombat.bossMaxHp) : 1;
  const move = finalCombat?.bossMove ?? "";
  const forecast = finalCombat?.forecast ?? {};
  const handPlan = finalCombat?.handPlan ?? {};
  const virus = finalCombat?.playerStatuses?.virus ?? 0;
  const moveSpecificThreat = ["gate_slam", "gate_call", "phase_requiem"].includes(move) || (forecast.incomingDamage ?? 0) >= 20;
  if (hpRatio <= 0.18 && !moveSpecificThreat) {
    return {
      title: "마지막 한 턴의 마무리 피해가 부족했습니다",
      detail: "본체 체력이 얼마 남지 않았습니다. 다음에는 큰 공격 카드, 취약, 전하 소모 카드를 같은 턴에 잡는 쪽을 우선하세요.",
      brief: "최종 보스전에서는 본체를 끝낼 카드와 그 카드를 찾을 뽑기 수단을 함께 챙기세요.",
      action: "마무리 피해와 카드 뽑기 보강",
      retryTitle: "본체 마무리 루트 다시 짜기",
      chips: ["본체 집중", "큰 피해", "카드 뽑기"],
      planTitle: "마무리 카드를 손패에 모으기",
      planDetail: "최종 보스 직전에는 새 시너지보다 큰 피해 카드, 비용 감소, 추가 뽑기를 우선해 본체 체력을 한 번에 밀 수 있게 만드세요.",
      threatTitle: "본체 체력이 낮은데 끝내지 못함",
      threatDetail: "소환수가 남아도 본체만 쓰러뜨리면 전투가 끝납니다. 마무리 턴에는 소환수보다 본체 피해를 먼저 계산하세요.",
      steps: [
        { tone: "danger", title: "본체 마무리 카드 확보", detail: "큰 피해 카드나 전하를 쓰는 공격을 최종 보스 전까지 1장 이상 준비합니다." },
        { tone: "strong", title: "그 카드를 찾을 수단 붙이기", detail: "추가 뽑기, 보존, 비용 감소가 있어야 마무리 턴에 핵심 카드가 손패에 옵니다." },
        { tone: "warning", title: "소환수보다 본체 계산", detail: "본체 처치가 보이면 소환수 정리보다 보스 체력 계산을 먼저 합니다." }
      ]
    };
  }
  if (move === "gate_slam" || ((finalCombat?.playerHp ?? 99) <= 12 && (forecast.incomingDamage ?? 0) > 0)) {
    return {
      title: "문 낙하를 맞을 체력이 남지 않았습니다",
      detail: "마지막 문은 문 낙하로 체력을 깎은 뒤 호출과 레퀴엠으로 시간을 빼앗습니다. 보스 직전에는 강화보다 회복, 단타 방어, 약화 중 하나를 먼저 계산하세요.",
      brief: "최종 보스 전 체력이 낮으면 강화보다 회복이나 단타 방어 수단을 우선하세요.",
      action: "보스 전 회복·단타 방어 챙기기",
      retryTitle: "마지막 휴식 선택 바꿔보기",
      chips: ["회복", "단타 방어", "약화"],
      planTitle: "문 낙하를 버틸 체력 남기기",
      planDetail: "마지막 구역에서 체력이 낮다면 핵심 카드 강화보다 회복을 먼저 보고, 한 번에 20 이상 막는 카드나 약화 부여를 함께 준비하세요.",
      threatTitle: "단타 공격을 맞을 여유가 부족함",
      threatDetail: "문 낙하는 예고가 선명한 공격입니다. 보스 직전 체력이 낮으면 큰 피해 카드보다 회복과 방어 선택의 가치가 올라갑니다.",
      steps: [
        { tone: "danger", title: "보스 전 체력 먼저 보기", detail: "최종 보스 직전 체력이 낮으면 강화보다 회복이나 안전 경로를 우선합니다." },
        { tone: "warning", title: "단타 방어 카드 남기기", detail: "한 번에 20 이상 막을 카드나 도금 유물이 있으면 문 낙하 턴을 넘기기 쉽습니다." },
        { tone: "strong", title: "약화로 큰 공격 줄이기", detail: "약화 1만 있어도 단타 피해가 줄어 다음 턴 마무리 기회가 생깁니다." }
      ]
    };
  }
  if (move === "gate_call" || (forecast.summons ?? 0) > 0 || (finalCombat?.enemyCount ?? 1) >= 2) {
    if (Number.isFinite(handPlan.retainedBurstDefense) && handPlan.retainedBurstDefense <= 0) {
      return {
        title: "다음 레퀴엠에 남길 보존 방어가 없었습니다",
        detail: "문지기 호출 다음에는 레퀴엠이 옵니다. 당시 보존 방어가 0장이어서 다음 턴에 쓸 방어를 손패에 남기기 어려웠습니다.",
        brief: "문지기 호출 턴에는 본체 처치 각이 없으면 보존 방어, 도금, 뽑기 수단을 우선 남기세요.",
        action: "보존 방어와 도금 먼저 남기기",
        retryTitle: "호출 턴 손패 관리 바꿔보기",
        chips: ["보존 방어", "도금", "뽑기"],
        planTitle: "호출 턴에 다음 턴 방어 남기기",
        planDetail: "마지막 문 2단계에서는 이번 턴 방어보다 다음 레퀴엠 턴에 남는 방어가 중요합니다. 보존 방어, 도금, 추가 뽑기 중 둘 이상을 준비하세요.",
        threatTitle: "호출 뒤 레퀴엠 손패 공백",
        threatDetail: "소환수를 정리하느라 손패를 비우면 다음 레퀴엠을 맞습니다. 본체 처치가 보이지 않을 때는 보존 카드와 도금을 남기는 쪽을 먼저 계산하세요.",
        steps: [
          { tone: "danger", title: "보존 방어 1장 이상 확보", detail: "보존이 붙은 방어, 약화, 도금 카드를 최종 보스 전까지 남겨 둡니다." },
          { tone: "warning", title: "호출 턴에 손패 비우지 않기", detail: "소환수 처치보다 다음 레퀴엠 턴에 남을 카드를 먼저 계산합니다." },
          { tone: "strong", title: "도금과 뽑기 같이 챙기기", detail: "도금은 다음 턴 방어를 예약하고, 뽑기는 레퀴엠 턴의 공백을 줄입니다." }
        ]
      };
    }
    return {
      title: "소환수에 시선이 갈 때 본체 피해가 끊겼습니다",
      detail: "마지막 문은 소환수로 시간을 벌지만, 승리 조건은 본체 처치입니다. 다음에는 소환수 정리와 본체 피해 중 어느 쪽이 빠른지 먼저 비교하세요.",
      brief: "소환 턴에는 본체 처치 각이 있는지 먼저 보고, 없을 때만 소환수를 정리하세요.",
      action: "소환 턴 본체 피해 먼저 계산",
      retryTitle: "소환 턴 판단 바꿔보기",
      chips: ["소환수", "본체 처치", "턴 계산"],
      planTitle: "소환 턴에도 본체 피해 유지",
      planDetail: "다단 공격, 광역 피해, 취약 부여처럼 소환수 정리와 본체 피해를 동시에 해결하는 카드를 더 높게 보세요.",
      threatTitle: "소환으로 본체 마무리 시간이 늘어남",
      threatDetail: "본체 처치가 가까우면 소환수를 모두 지우는 것보다 본체를 끝내는 편이 안전합니다.",
      steps: [
        { tone: "danger", title: "본체 처치 각 먼저 보기", detail: "소환수가 나와도 보스 체력을 먼저 계산합니다." },
        { tone: "strong", title: "광역·다단 피해 확보", detail: "소환수와 본체를 함께 누를 수 있는 공격을 1장 이상 준비합니다." },
        { tone: "warning", title: "긴 전투 대비 정화", detail: "소환 때문에 전투가 길어질 때를 대비해 바이러스 정화 수단을 챙깁니다." }
      ]
    };
  }
  if (move === "phase_requiem" || (forecast.incomingDamage ?? 0) >= 20) {
    const handDetail = Number.isFinite(handPlan.bestBlock)
      ? ` 당시 손패 방어 가능치는 ${handPlan.bestBlock}, 보존 방어는 ${handPlan.retainedBurstDefense ?? 0}장이었습니다.`
      : "";
    return {
      title: Number.isFinite(handPlan.bestBlock) && handPlan.bestBlock <= 0 ? "레퀴엠 턴 손패 방어가 비었습니다" : "레퀴엠 턴을 넘길 방어가 부족했습니다",
      detail: `2단계는 문 낙하→호출→레퀴엠 순서로 체력을 깎습니다.${handDetail} 큰 방어 한 장만 기다리기보다 도금, 약화, 가벼운 방어를 이어서 준비해야 합니다.`,
      brief: "레퀴엠 전에는 도금, 약화, 가벼운 방어를 이어서 쓸 수 있게 덱을 정리하세요.",
      action: "레퀴엠 대비 연속 방어 챙기기",
      retryTitle: "2단계 방어 턴 다시 준비",
      chips: ["연속 방어", "도금", "약화"],
      planTitle: "문 낙하 다음 턴까지 이어서 막기",
      planDetail: "마지막 문 2단계에서는 공격 카드만으로 밀기 어렵습니다. 도금, 큰 방어, 약화, 추가 뽑기 중 둘 이상을 마무리 카드와 함께 잡으세요.",
      threatTitle: "문 낙하 뒤 레퀴엠에 체력 손실",
      threatDetail: "레퀴엠 턴은 한 번만 넘겨도 마무리 기회가 생깁니다. 마지막 구역에서는 한 턴짜리 방어보다 다음 턴까지 이어지는 방어를 더 높게 보세요.",
      steps: [
        { tone: "danger", title: "문 낙하 뒤 체력 남기기", detail: "단타 공격을 막고도 다음 레퀴엠을 맞을 체력이 남아야 합니다." },
        { tone: "warning", title: "도금·약화 같이 쓰기", detail: "도금이나 약화가 있으면 연속 공격의 체력 손실이 크게 줄어듭니다." },
        { tone: "strong", title: "막은 다음 바로 마무리", detail: "방어 턴 다음에 본체를 끝낼 공격이나 추가 뽑기를 손패에 남겨둡니다." }
      ]
    };
  }
  if (virus >= 2) {
    return {
      title: "바이러스가 최종 보스전 시간을 빼앗았습니다",
      detail: "마지막 문은 긴 전투에서 손패와 체력을 동시에 갉아먹습니다. 정화나 빠른 마무리 중 하나가 필요했습니다.",
      brief: "바이러스가 쌓이면 정화 카드나 빠른 마무리 피해를 먼저 챙기세요.",
      action: "정화와 빠른 마무리 보강",
      retryTitle: "바이러스 관리부터 바꿔보기",
      chips: ["정화", "바이러스", "빠른 마무리"],
      planTitle: "정화 수단을 보스 전까지 확보",
      planDetail: "최종 구역에서는 방어만큼 정화가 중요합니다. 정화가 없으면 전투를 짧게 끝낼 피해 카드를 더 높게 보세요.",
      threatTitle: "바이러스가 손패와 체력을 갉음",
      threatDetail: "바이러스를 지우거나 보스 체력을 빠르게 밀어야 장기전 손실을 줄일 수 있습니다.",
      steps: [
        { tone: "warning", title: "정화 카드 확보", detail: "정화 카드가 보이면 보스 전까지 최소 1장 챙깁니다." },
        { tone: "strong", title: "전투를 짧게 끝내기", detail: "정화가 부족하면 큰 피해와 취약으로 본체 체력을 빨리 밀어야 합니다." },
        { tone: "steady", title: "덱을 너무 두껍게 만들지 않기", detail: "정화 카드가 덱 안에 있어도 늦게 오면 의미가 줄어듭니다." }
      ]
    };
  }
  return {
    title: "마지막 문 2단계에서 힘이 조금 모자랐습니다",
    detail: "최종 보스전까지 도달했습니다. 다음에는 방어, 정화, 본체 마무리 피해 중 비어 있는 역할 하나를 더 일찍 채우세요.",
    brief: "최종 보스 전에는 방어, 정화, 본체 마무리 중 빈 역할을 하나만 확실히 채우세요.",
    action: "최종 보스 역할 하나 보강",
    retryTitle: "마지막 구역 선택 바꿔보기",
    chips: ["방어", "정화", "마무리"],
    planTitle: "빈 역할 하나를 확실히 채우기",
    planDetail: "마지막 구역 보상은 새 방향보다 부족한 역할을 채우는 선택이 더 안전합니다.",
    threatTitle: "최종 보스 요구를 하나 덜 채움",
    threatDetail: "마지막 문은 방어, 정화, 본체 마무리를 모두 시험합니다. 부족한 하나를 먼저 보강하세요.",
    steps: [
      { tone: "danger", title: "빈 역할 하나 고르기", detail: "방어, 정화, 마무리 피해 중 가장 약한 역할을 먼저 확인합니다." },
      { tone: "strong", title: "본체 처치 조건 기억", detail: "본체를 쓰러뜨리면 전투가 끝나므로 마무리 피해를 가장 먼저 계산합니다." },
      { tone: "warning", title: "마지막 상점은 정비 우선", detail: "새 카드보다 제거, 회복, 핵심 카드 강화가 더 큰 차이를 냅니다." }
    ]
  };
}

function summaryFinalBossStateText(finalCombat = {}) {
  if (!finalCombat?.bossName) return "";
  const hp =
    Number.isFinite(finalCombat.bossHp) && Number.isFinite(finalCombat.bossMaxHp)
      ? `당시 ${finalCombat.bossName} 체력은 ${Math.max(0, finalCombat.bossHp)}/${finalCombat.bossMaxHp}였습니다.`
      : `${finalCombat.bossName}전에서 멈췄습니다.`;
  const intent = finalCombat.bossIntent ? ` 예고는 ${finalCombat.bossIntent}였습니다.` : "";
  const hand = summaryFinalBossHandPlanText(finalCombat.handPlan);
  return `${hp}${intent}${hand}`;
}

function summaryFinalBossHandPlanText(handPlan = null) {
  if (!handPlan || !Number.isFinite(handPlan.bestBlock)) return "";
  const retained = Number.isFinite(handPlan.retainedBurstDefense) ? handPlan.retainedBurstDefense : 0;
  const plated = Number.isFinite(handPlan.plated) ? handPlan.plated : 0;
  return ` 마지막 손패 방어 가능치는 ${handPlan.bestBlock}, 보존 방어 ${retained}장, 도금 ${plated}이었습니다.`;
}

function renderSummaryRunHook(summary) {
  const hook = summaryRunHook(summary);
  const steps = summaryNextRunSteps(summary);
  return `
    <section class="summary-run-hook ${hook.tone}" aria-label="다음 런 포인트">
      <div class="summary-hook-head">
        <div class="summary-hook-copy">
          <span>${summary.won ? "다음 도전" : "다음 런"}</span>
          <strong>${hook.title}</strong>
          <p>${hook.detail}</p>
        </div>
        <div class="summary-hook-chips">
          ${hook.chips.map((chip) => `<b>${chip}</b>`).join("")}
        </div>
      </div>
      <ol class="summary-next-steps">
        ${steps
          .map(
            (step, index) => `
              <li class="${step.tone}">
                <span>${index + 1}</span>
                <div>
                  <strong>${step.title}</strong>
                  <p>${step.detail}</p>
                </div>
              </li>
            `
          )
          .join("")}
      </ol>
    </section>
  `;
}

function summaryRunHook(summary) {
  const build = summaryPrimaryBuildText(summary, "핵심 카드");
  if (summary.won) {
    return {
      tone: "strong",
      title: `${build}로 완주`,
      detail: "다음 난이도에서는 같은 방향을 유지하고, 역할이 겹치는 카드만 줄이면 핵심 카드가 더 자주 잡힙니다.",
      chips: [`덱 ${summary.deckSize ?? "?"}장`, `보스 ${summary.bossesDefeated ?? 0}`, `체력 ${summary.hp ?? 0}/${summary.maxHp ?? "?"}`]
    };
  }
  const advice = summaryFailureAdvice(summary);
  return {
    tone: advice.tone,
    title: advice.title,
    detail: advice.detail,
    chips: advice.chips
  };
}

function summaryNextRunSteps(summary) {
  if (summary.won) {
    return [
      {
        tone: "strong",
        title: "잘 풀린 방향 유지",
        detail: `${summaryPrimaryBuildText(summary, "핵심 카드")} 보상이 보이면 초반에 2장까지 붙입니다.`
      },
      {
        tone: "steady",
        title: "덱은 가볍게",
        detail: `최종 ${summary.deckSize ?? "?"}장 기준으로 역할이 겹치는 카드부터 줄입니다.`
      },
      {
        tone: "warning",
        title: "다음 난이도 준비",
        detail: "첫 보스 전에는 방어와 마무리 피해를 함께 챙깁니다."
      }
    ];
  }
  return summaryFailureAdvice(summary).steps;
}

function renderSummaryRoute(summary) {
  const route = summary.route;
  if (!route?.acts?.length) return "";
  return `
    <section class="summary-route" aria-label="탐사 경로 회고">
      <header>
        <span>탐사 경로</span>
        <strong>${route.totalFloors ?? summary.floors ?? 0}층 · 엘리트 ${route.elites ?? 0} · 상점 ${route.shops ?? 0} · 휴식 ${route.rests ?? 0}</strong>
      </header>
      <div class="summary-route-grid">
        ${route.acts.map((act) => renderRouteActSummary(act)).join("")}
      </div>
    </section>
  `;
}

function renderRouteActSummary(act) {
  const reached = act.floors > 0;
  const bossLabel = act.boss === "defeated" ? "보스 격파" : act.boss === "reached" ? "보스전 도달" : reached ? "보스 미도달" : "미도달";
  const stop = act.stoppedAt ? `${act.stoppedAt.floor}층 ${nodeTypeLabel(act.stoppedAt.type)}${act.stoppedAt.completed ? " 완료" : " 진행 중"}` : "진입 전";
  return `
    <article class="${reached ? act.boss : "unseen"}">
      <span>${act.act}막</span>
      <strong>${bossLabel}</strong>
      <small>${stop}</small>
      <div>
        <b>전투 ${act.combat ?? 0}</b>
        <b>엘리트 ${act.elite ?? 0}</b>
        <b>이벤트 ${act.event ?? 0}</b>
        <b>상점 ${act.shop ?? 0}</b>
        <b>휴식 ${act.rest ?? 0}</b>
      </div>
    </article>
  `;
}

function nextDifficultyAfter(difficultyId) {
  const currentIndex = GAME_DATA.difficulties.findIndex((difficulty) => difficulty.id === Number(difficultyId));
  if (currentIndex < 0) return null;
  return GAME_DATA.difficulties[currentIndex + 1] ?? null;
}

function renderSummaryScorecard(summary) {
  return `
    <section class="summary-scorecard" aria-label="이번 런 점검표">
      <header>
        <span>이번 런 점검표</span>
        <strong>${summary.won ? "다음 난이도에서 유지할 강점" : "다음 런에서 먼저 고칠 부분"}</strong>
      </header>
      <div>
        ${summaryScorecardItems(summary)
          .map(
            (item) => `
              <article class="${item.tone}">
                <span>${item.label}</span>
                <strong>${item.value}</strong>
                <p>${item.detail}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function summaryScorecardItems(summary) {
  return [
    summarySurvivalScore(summary),
    summaryFocusScore(summary),
    summaryMaintenanceScore(summary),
    summaryThreatScore(summary)
  ];
}

function summarySurvivalScore(summary) {
  const hpRatio = (summary.hp ?? 0) / Math.max(1, summary.maxHp ?? 1);
  const fights = Math.max(1, summary.fights ?? 1);
  const damagePerFight = Math.round((summary.damageTaken ?? 0) / fights);
  if (summary.won) {
    return {
      tone: hpRatio >= 0.45 ? "strong" : "steady",
      label: "생존",
      value: `${summary.hp ?? 0}/${summary.maxHp ?? 0}`,
      detail: hpRatio >= 0.45 ? "체력 여유가 남았습니다. 같은 선택을 더 높은 난이도에서도 믿어볼 만합니다." : "완주는 했지만 체력 여유는 적었습니다. 방어와 약화 카드를 조금 더 높게 보세요."
    };
  }
  return {
    tone: damagePerFight >= 14 || hpRatio <= 0 ? "danger" : "warning",
    label: "생존",
    value: `전투당 피해 ${damagePerFight}`,
    detail: damagePerFight >= 14 ? "전투마다 체력이 크게 줄었습니다. 초반 방어, 약화, 회복 경로를 먼저 챙기세요." : "체력 손실은 감당 가능한 편이었습니다. 막힌 층의 적 의도에 맞는 해답을 보강하세요."
  };
}

function summaryFocusScore(summary) {
  const tags = summary.build ?? [];
  const deckSize = summary.deckSize ?? 0;
  if (tags.length >= 2 && deckSize <= 23) {
    return {
      tone: "strong",
      label: "주력",
      value: buildConceptText(tags, "주력 미정"),
      detail: "핵심 카드가 비교적 잘 모였습니다. 같은 키워드가 붙은 보상과 유물을 이어서 고르면 힘이 빨리 붙습니다."
    };
  }
  if (tags.length >= 1) {
    return {
      tone: deckSize >= 26 ? "warning" : "steady",
      label: "주력",
      value: buildConceptText(tags, "주력 미정"),
      detail: deckSize >= 26 ? "주력은 보였지만 카드가 많아졌습니다. 제거와 카드 뽑기로 핵심 카드를 더 자주 보세요." : "주력은 잡혔습니다. 남은 보상은 방어, 마무리, 정화·약화 중 빈 역할만 채우세요."
    };
  }
  return {
    tone: "warning",
    label: "주력",
    value: "주력 미정",
    detail: "핵심 카드가 늦게 모였습니다. 같은 키워드가 이어지는 보상을 우선하세요."
  };
}

function summaryMaintenanceScore(summary) {
  const removed = summary.cardsRemoved ?? 0;
  const shops = summary.route?.shops ?? 0;
  const rests = summary.route?.rests ?? 0;
  const deckSize = summary.deckSize ?? 0;
  if (removed >= 2 || deckSize <= 20 && removed >= 1) {
    return {
      tone: "strong",
      label: "정비",
      value: `제거 ${removed}회`,
      detail: "덱을 다듬는 선택을 했습니다. 다음에는 강화와 회복 중 어느 쪽이 보스전에 더 필요한지도 함께 보세요."
    };
  }
  if (shops + rests >= 3) {
    return {
      tone: deckSize >= 24 ? "warning" : "steady",
      label: "정비",
      value: `상점 ${shops} · 휴식 ${rests}`,
      detail: deckSize >= 24 ? "정비 기회는 있었지만 덱이 커졌습니다. 구매보다 제거를 한 번 더 선택할 만했습니다." : "정비 지점은 충분히 들렀습니다. 회복, 강화, 제거 중 부족한 한 가지만 더 명확히 고르세요."
    };
  }
  return {
    tone: "warning",
    label: "정비",
    value: `상점 ${shops} · 휴식 ${rests}`,
    detail: "정비 지점이 적었습니다. 체력이 낮거나 덱이 커질 때는 보상보다 상점과 휴식 경로를 더 높게 보세요."
  };
}

function summaryThreatScore(summary) {
  const bosses = summary.bossesDefeated ?? 0;
  const elites = summary.elitesKilled ?? summary.route?.elites ?? 0;
  if (summary.won || bosses >= 2) {
    return {
      tone: "strong",
      label: "강적 대비",
      value: `보스 ${bosses}`,
      detail: "보스 요구를 넘겼습니다. 다음 런에서는 같은 주력에 부족한 역할 하나만 더 빨리 붙이면 됩니다."
    };
  }
  if (bosses >= 1 || elites >= 2) {
    return {
      tone: "steady",
      label: "강적 대비",
      value: `엘리트 ${elites}`,
      detail: "강한 전투를 어느 정도 넘겼습니다. 다음 보스가 요구하는 방어와 마무리 피해를 더 일찍 준비하세요."
    };
  }
  return {
    tone: "warning",
    label: "강적 대비",
    value: `엘리트 ${elites}`,
    detail: "유물 보상으로 커지는 기회가 적었습니다. 체력과 방어가 갖춰진 뒤 첫 엘리트를 노려 보세요."
  };
}

function renderSummaryDebrief(summary) {
  return `
    <section class="summary-debrief" aria-label="다음 런 분석">
      ${summaryDebriefItems(summary)
        .map(
          (item) => `
            <article>
              <span>${item.label}</span>
              <strong>${item.title}</strong>
              <p>${item.detail}</p>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function summaryDebriefItems(summary) {
  return [summaryThreatRead(summary), summaryDeckRead(summary), summaryNextExperiment(summary)];
}

function renderSummaryPlan(summary) {
  const items = summaryPlanItems(summary);
  return `
    <section class="summary-plan" aria-label="다음 런 작전">
      <header>
        <span>다음 런 작전</span>
        <strong>${summary.won ? "강점을 유지하며 한 단계 더 깊게" : "이번 실패를 다음 선택으로 바꾸기"}</strong>
      </header>
      <div>
        ${items
          .map(
            (item) => `
              <article class="${item.tone}">
                <span>${item.label}</span>
                <strong>${item.title}</strong>
                <p>${item.detail}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function summaryPlanItems(summary) {
  const tags = summary.build ?? [];
  const items = [];
  if (summary.won) {
    items.push({
      tone: "strong",
      label: "초반 선택",
      title: "핵심 카드를 더 일찍 정하기",
      detail: `${summaryPrimaryBuildText(summary, "핵심 방향")} 카드가 보이면 첫 세 번의 보상 안에 같은 계열 2장을 모아 보세요.`
    });
  } else {
    items.push(summaryFailureAdvice(summary).plan);
  }

  if ((summary.deckSize ?? 0) >= 24) {
    items.push({
      tone: "warning",
      label: "덱 손질",
      title: "제거 2회 이상 노리기",
      detail: `최종 덱이 ${summary.deckSize}장이었습니다. 상점과 휴식의 카드 제거를 한 번씩 더 쓰면 핵심 카드가 빨리 돌아옵니다.`
    });
  } else if ((summary.deckSize ?? 0) <= 16) {
    items.push({
      tone: "steady",
      label: "덱 손질",
      title: "역할 카드 조금 더 받기",
      detail: "덱은 얇았습니다. 방어, 마무리, 정화·약화 중 비어 있는 역할 카드만 골라 보스 의도에 대비하세요."
    });
  } else {
    items.push({
      tone: "strong",
      label: "덱 손질",
      title: "덱 크기 유지",
      detail: "덱 크기는 좋은 편입니다. 같은 역할이 겹치는 카드만 줄이고, 카드 뽑기와 에너지 확보를 우선하세요."
    });
  }

  if (hasBuildConcept(tags, "charge")) {
    items.push({
      tone: "charge",
      label: "다음 방향",
      title: "전하를 모아 한 번에 쓰기",
      detail: "전하 카드 다음에는 카드 뽑기, 보존, 비용 감소를 챙겨 큰 공격 카드를 같은 턴에 찾으세요."
    });
  } else if (hasBuildConcept(tags, "virus")) {
    items.push({
      tone: "virus",
      label: "다음 방향",
      title: "지속 피해가 버틸 시간을 벌기",
      detail: "바이러스 카드와 약화/도금을 함께 잡으면 보스 체력이 녹는 동안 체력 손실을 줄일 수 있습니다."
    });
  } else if (hasBuildConcept(tags, "mark")) {
    items.push({
      tone: "mark",
      label: "다음 방향",
      title: "표식 뒤 연타 카드 늘리기",
      detail: "표식 부여 뒤 0비용 공격과 다단 공격을 이어가면 낮은 비용으로 마무리 피해를 만들 수 있습니다."
    });
  } else {
    items.push({
      tone: "steady",
      label: "다음 방향",
      title: "마무리 피해를 미리 확보",
      detail: "2막 전에는 보스 체력을 실제로 끝낼 공격 수단을 하나 정하세요. 방어만으로는 마지막 턴을 넘기기 어렵습니다."
    });
  }
  return items;
}

function summaryThreatRead(summary) {
  if (summary.won) {
    return {
      label: "완주 진단",
      title: `${summary.hp ?? 0}/${summary.maxHp ?? "?"} 체력으로 코어 회수`,
      detail: `보스 ${summary.bossesDefeated ?? 0}명을 넘겼습니다. 같은 방향으로 난이도를 올리거나, 덱을 ${summary.deckSize}장보다 조금 줄여 핵심 카드를 더 자주 뽑아 보세요.`
    };
  }
  return summaryFailureAdvice(summary).threat;
}

function summaryDeckRead(summary) {
  const removed = summary.cardsRemoved ?? 0;
  const added = summary.cardsAdded ?? 0;
  if ((summary.deckSize ?? 0) >= 26 && removed <= 1) {
    return {
      label: "카드 줄이기",
      title: `덱 ${summary.deckSize}장, 제거 ${removed}장`,
      detail: "카드가 많으면 핵심 조합이 늦게 보입니다. 상점/휴식의 제거를 한 번 더 선택하면 보스전 손패 구성이 좋아집니다."
    };
  }
  if ((summary.deckSize ?? 0) <= 16 && added < 7) {
    return {
      label: "덱 확장",
      title: `보상 카드 ${added}장 채택`,
      detail: "덱은 얇지만 선택지가 좁았습니다. 같은 방향의 보상 카드를 조금 더 받아 엘리트와 보스의 다양한 의도에 대비하세요."
    };
  }
  return {
    label: "덱 조정",
    title: `카드 +${added} / 제거 ${removed}`,
    detail: "덱 크기는 안정권입니다. 이제는 카드 뽑기, 에너지, 해로운 상태를 줄이는 카드의 비율이 중요합니다."
  };
}

function summaryNextExperiment(summary) {
  const tags = summary.build ?? [];
  if (hasBuildConcept(tags, "charge")) {
    return {
      label: "다음 시도",
      title: "전하를 쓸 카드까지 함께 찾기",
      detail: "전하 덱은 손패가 많을수록 강합니다. 비용 감소, 추가 뽑기, 보존 카드를 우선해 한 턴에 크게 몰아칠 힘을 키워 보세요."
    };
  }
  if (hasBuildConcept(tags, "virus")) {
    return {
      label: "다음 시도",
      title: "지속 피해와 약화 함께 쓰기",
      detail: "바이러스는 긴 전투에 강합니다. 약화와 방어 유물을 섞으면 피해가 쌓이는 시간을 더 안정적으로 벌 수 있습니다."
    };
  }
  if (hasBuildConcept(tags, "ward")) {
    return {
      label: "다음 시도",
      title: "큰 방어를 반격으로 잇기",
      detail: "반격과 도금이 보이면 큰 방어 카드, 취약 부여, 공격 유물을 함께 집어 방어하는 턴에도 적을 쓰러뜨리세요."
    };
  }
  if (hasBuildConcept(tags, "mark")) {
    return {
      label: "다음 시도",
      title: "표식 공격을 자주 다시 보기",
      detail: "표식은 여러 번 때릴수록 강합니다. 0비용 공격과 카드 뽑기를 늘리고, 역할이 겹치는 느린 카드는 줄이세요."
    };
  }
  return {
    label: "다음 시도",
    title: "핵심 카드 먼저 정하기",
    detail: "첫 세 번의 보상 안에 전하, 표식, 바이러스, 반격 중 하나를 정하고 같은 키워드 보상을 묶어 보세요."
  };
}

function renderDeckSelector(run) {
  const title = run.selector.mode === "upgrade" ? "강화할 카드 선택" : "제거할 카드 선택";
  const isUpgrade = run.selector.mode === "upgrade";
  const selectorHint = deckSelectorHint(run);
  const choices = run.player.deck.map((card, index) => ({ card, index, preview: deckChoicePreview(run, card) }));
  const recommendation = deckSelectorRecommendation(run, choices);
  const visibleChoices = recommendation
    ? [...choices].sort((left, right) => Number(right.card.uid === recommendation.uid) - Number(left.card.uid === recommendation.uid) || left.index - right.index)
    : choices;
  return `
    <div class="modal-backdrop">
      <section class="deck-modal selector-modal ${isUpgrade ? "upgrade" : "remove"}" role="dialog" aria-modal="true" aria-label="${title}">
        <header>
          <h2>${title}</h2>
          <button data-dialog-initial-focus data-action="deck-cancel">취소</button>
        </header>
        ${renderDeckSelectorBrief(run)}
        ${renderDeckSelectorFocus(run, recommendation)}
        ${selectorHint ? `<p class="selector-hint">${selectorHint}</p>` : ""}
        <div class="deck-grid deck-select-grid">
          ${visibleChoices
            .map(
              ({ card, preview }) => {
                const recommended = recommendation?.uid === card.uid;
                return `
                <article class="deck-select-option ${recommended ? "recommended" : ""}">
                  ${renderCard(card, {
                    action: "deck-select",
                    id: card.uid,
                    playable: !isUpgrade || isUpgradeableCard(card),
                    selectable: true,
                    recommended,
                    recommendationLabel: "추천"
                  })}
                  ${renderDeckChoicePreview(preview, recommended)}
                </article>
              `;
              }
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function renderDeckSelectorBrief(run) {
  const isUpgrade = run.selector?.mode === "upgrade";
  const analysis = deckAnalysis(run);
  const upgradeable = run.player.deck.filter((card) => isUpgradeableCard(card)).length;
  const hpCost = run.selector?.hpCost ?? 0;
  const hpAfter = Math.max(0, run.player.hp - hpCost);
  const mainLabel = isUpgrade ? "강화 후보" : "제거 후";
  const mainValue = isUpgrade ? `${upgradeable}장` : `덱 ${Math.max(0, run.player.deck.length - 1)}장`;
  const costLabel = hpCost ? `체력 ${run.player.hp}/${run.player.maxHp} → ${hpAfter}/${run.player.maxHp}` : "취소 무료";
  const deckLabel = analysis.primary.score > 0 ? analysis.primary.label : "아직 탐색 중";
  const bossContext = deckSelectorBossContext(run);
  return `
    <section class="selector-brief ${isUpgrade ? "upgrade" : "remove"} ${bossContext ? "with-boss" : ""}" aria-label="카드 선택 전 상태">
      <span><small>${mainLabel}</small><strong>${mainValue}</strong></span>
      <span><small>현재 덱</small><strong>${run.player.deck.length}장 · ${deckLabel}</strong></span>
      <span><small>비용</small><strong>${costLabel}</strong></span>
      ${bossContext ? `<span class="selector-boss-brief ${bossContext.tone}"><small>보스 대비</small><strong>${bossSelectorBriefText(bossContext)}</strong></span>` : ""}
    </section>
  `;
}

function renderDeckSelectorFocus(run, recommendation) {
  if (!recommendation) return "";
  const modeLabel = run.selector?.mode === "upgrade" ? "강화 추천" : "제거 추천";
  return `
    <section class="selector-focus ${recommendation.tone}" aria-label="추천 카드">
      <span>${modeLabel}</span>
      <strong>${recommendation.name}</strong>
      <p>${recommendation.reason}</p>
      <div>${recommendation.chips.map((chip) => `<small class="${chip.tone}">${chip.label}</small>`).join("")}</div>
    </section>
  `;
}

function renderDeckChoicePreview(preview, recommended = false) {
  const metrics = (preview.metrics ?? []).map((metric) => `<i class="${metric.tone}">${metric.label}</i>`).join("");
  return `
    <div class="deck-choice-preview ${preview.tone} ${recommended ? "recommended" : ""}">
      <strong>${recommended ? "추천 · " : ""}${preview.label}</strong>
      ${metrics ? `<div class="deck-choice-metrics" aria-label="선택 결과">${metrics}</div>` : ""}
      <span title="${preview.detail}">${preview.detail}</span>
      ${preview.after ? `<small title="${preview.after}">${preview.after}</small>` : ""}
    </div>
  `;
}

function deckSelectorHint(run) {
  if (!run.selector) return "";
  if (run.selector.mode === "upgrade") return "강화할 수 있는 카드만 선택됩니다.";
  if (run.selector.hpCost) return `선택하면 체력 -${run.selector.hpCost}. 취소는 무료입니다.`;
  if (run.selector.refund) return `선택하면 비용 확정. 취소하면 ${run.selector.refund} 크레딧 반환.`;
  return "";
}

function deckChoicePreview(run, cardInstance) {
  if (run.selector?.mode === "upgrade") return upgradeChoicePreview(cardInstance);
  return removeChoicePreview(run, cardInstance);
}

function deckSelectorRecommendation(run, choices) {
  if (!run.selector || !choices.length) return null;
  const analysis = deckAnalysis(run);
  const ranked = choices
    .map(({ card, preview }) => {
      const score =
        run.selector.mode === "upgrade"
          ? deckUpgradeRecommendationScore(card, analysis) + deckUpgradeBossBonus(run, card)
          : deckRemoveRecommendationScore(run, card, analysis) + deckRemoveBossAdjustment(run, card, analysis);
      return { card, preview, score };
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score || effectiveCard(left.card).name.localeCompare(effectiveCard(right.card).name));
  const pick = ranked[0];
  if (!pick) return null;
  const card = effectiveCard(pick.card);
  return {
    uid: pick.card.uid,
    name: `${card.name}${pick.card.upgraded ? "+" : ""}`,
    tone: pick.preview.tone,
    reason:
      run.selector.mode === "upgrade"
        ? deckUpgradeRecommendationReason(pick.card, analysis, run)
        : deckRemoveRecommendationReason(run, pick.card, analysis),
    chips:
      run.selector.mode === "upgrade"
        ? deckUpgradeRecommendationChips(pick.card, analysis, run)
        : deckRemoveRecommendationChips(run, pick.card, analysis)
  };
}

function deckSelectorBossContext(run) {
  const progress = runProgressBrief(run);
  const readiness = progress.readiness;
  const missing = bossReadinessMissing(readiness);
  if (!readiness || !missing.length || progress.distance > 3) return null;
  const bossName = progress.boss?.name ?? readiness.title.split("까지")[0].replace(" 전투 중", "");
  return {
    progress,
    readiness,
    missing,
    bossName,
    tone: readiness.tone,
    finalBoss: progress.act >= 3,
    close: progress.distance <= 1
  };
}

function bossSelectorBriefText(context) {
  const shortMissing = context.missing.slice(0, 2).join(" · ");
  return `${context.bossName} · ${shortMissing} 부족`;
}

function deckUpgradeBossBonus(run, cardInstance) {
  const context = deckSelectorBossContext(run);
  if (!context) return 0;
  const before = effectiveCard({ ...cardInstance, upgraded: false });
  const after = effectiveCard({ ...cardInstance, upgraded: true });
  const finalBonus = context.finalBoss ? 1.45 : 1;
  let score = 0;
  if ((context.missing.includes("연속 방어") || context.missing.includes("큰 방어")) && cardSupportsBurstDefense(after)) score += (cardSupportsBurstDefense(before) ? 10 : 16) * finalBonus;
  if (context.missing.includes("방어") && cardSupportsDefense(after)) score += 8 * finalBonus;
  if (context.missing.includes("정화·약화") && cardSupportsStatusControl(after)) score += 9 * finalBonus;
  if (context.missing.includes("마무리") && cardSupportsFinish(after)) score += 7 * finalBonus;
  if (context.missing.includes("카드 뽑기") && cardSupportsFlow(after)) score += 6;
  if ((after.cost ?? 0) < (before.cost ?? 0)) score += context.close ? 7 : 4;
  return score;
}

function deckRemoveBossAdjustment(run, cardInstance, analysis) {
  const context = deckSelectorBossContext(run);
  if (!context) return 0;
  const card = effectiveCard(cardInstance);
  const primaryMatch = analysis.primary?.score > 0 ? cardAxisMatch(card, analysis.primary).score : 0;
  const lowRoleFit = primaryMatch <= 0 && !cardSupportsBurstDefense(card) && !cardSupportsStatusControl(card) && !cardSupportsFinish(card);
  let score = 0;
  if ((context.missing.includes("연속 방어") || context.missing.includes("큰 방어")) && cardSupportsBurstDefense(card)) score -= context.finalBoss ? 32 : 22;
  if (context.missing.includes("방어") && cardSupportsDefense(card)) score -= 18;
  if (context.missing.includes("정화·약화") && cardSupportsStatusControl(card)) score -= 18;
  if (context.missing.includes("마무리") && cardSupportsFinish(card)) score -= 15;
  if (context.missing.includes("카드 뽑기") && cardSupportsFlow(card)) score -= 10;
  if (context.missing.includes("카드 뽑기") && lowRoleFit) score += 9;
  if (context.finalBoss && card.rarity === "starter" && lowRoleFit) score += 6;
  if (context.close && (card.cost ?? 0) >= 2 && lowRoleFit) score += 4;
  return score;
}

function deckUpgradeRecommendationScore(cardInstance, analysis) {
  if (!isUpgradeableCard(cardInstance)) return Number.NEGATIVE_INFINITY;
  const before = effectiveCard({ ...cardInstance, upgraded: false });
  const after = effectiveCard({ ...cardInstance, upgraded: true });
  const primaryMatch = analysis.primary?.score > 0 ? cardAxisMatch(after, analysis.primary).score : 0;
  const costGain = Math.max(0, (before.cost ?? 0) - (after.cost ?? 0));
  let score = 5 + primaryMatch * 2 + costGain * 6;
  if (before.text !== after.text) score += 3;
  if (after.rarity === "rare") score += 2;
  if (after.rarity === "uncommon") score += 1;
  if (cardSupportsFinish(after)) score += 2;
  if (cardSupportsDefense(after)) score += 2;
  if (cardSupportsBurstDefense(after)) score += 3;
  if (cardSupportsFlow(after)) score += 1;
  return score;
}

function deckRemoveRecommendationScore(run, cardInstance, analysis) {
  const card = effectiveCard(cardInstance);
  const duplicateCount = run.player.deck.filter((item) => item.cardId === cardInstance.cardId).length;
  const primaryMatch = analysis.primary?.score > 0 ? cardAxisMatch(card, analysis.primary).score : 0;
  const cards = run.player.deck.map(effectiveCard);
  const finishCount = cards.filter(cardSupportsFinish).length;
  const defenseCount = cards.filter(cardSupportsDefense).length;
  const flowCount = cards.filter(cardSupportsFlow).length;
  let score = 0;
  if (card.rarity === "curse" || card.type === "curse" || card.unplayable) score += 100;
  if (duplicateCount > 1) score += 18 + Math.min(8, duplicateCount);
  if (card.rarity === "starter") score += 12;
  if (card.cost >= 2 && primaryMatch <= 0) score += 4;
  if (run.player.deck.length >= 22) score += 4;
  if (cardInstance.upgraded) score -= 28;
  if (card.rarity === "rare") score -= 10;
  if (primaryMatch > 0) score -= primaryMatch * 6;
  if (cardSupportsFinish(card) && finishCount <= 4) score -= 14;
  if (cardSupportsDefense(card) && defenseCount <= 4) score -= 14;
  if (cardSupportsFlow(card) && flowCount <= 2) score -= 8;
  return score;
}

function deckUpgradeRecommendationReason(cardInstance, analysis, run = null) {
  const before = effectiveCard({ ...cardInstance, upgraded: false });
  const after = effectiveCard({ ...cardInstance, upgraded: true });
  const context = run ? deckSelectorBossContext(run) : null;
  if (context?.missing.includes("연속 방어") && cardSupportsBurstDefense(after)) return "마지막 문 앞입니다. 이 카드를 키우면 문 낙하 뒤 레퀴엠까지 버틸 여지가 생깁니다.";
  if (context?.missing.includes("큰 방어") && cardSupportsBurstDefense(after)) return "마지막 문 앞입니다. 이 카드를 키우면 문 낙하와 레퀴엠 턴에 버틸 여지가 생깁니다.";
  if (context?.missing.includes("정화·약화") && cardSupportsStatusControl(after)) return `${context.bossName} 전입니다. 해로운 상태를 줄이거나 적 공격을 낮추는 쪽을 보강합니다.`;
  if (context?.missing.includes("마무리") && cardSupportsFinish(after)) return `${context.bossName} 전입니다. 2단계로 넘어가기 전 보스 체력을 밀어낼 힘을 키웁니다.`;
  if (context?.missing.includes("카드 뽑기") && cardSupportsFlow(after)) return `${context.bossName} 전입니다. 필요한 카드를 더 빨리 다시 보게 만드는 강화입니다.`;
  if ((after.cost ?? 0) < (before.cost ?? 0)) return "비용이 낮아져 한 턴에 더 많은 카드를 쓸 수 있습니다.";
  if (analysis.primary?.score > 0 && cardAxisMatch(after, analysis.primary).score > 0) return `${analysis.primary.label} 덱에서 자주 쓰게 될 카드입니다.`;
  if (cardSupportsBurstDefense(after)) return "문 낙하나 레퀴엠처럼 큰 공격을 넘기기 쉬워집니다.";
  if (cardSupportsDefense(after)) return "큰 공격을 넘기는 턴이 더 안정됩니다.";
  if (cardSupportsFinish(after)) return "엘리트와 보스 체력을 마무리하는 힘이 올라갑니다.";
  return "전투마다 바로 체감되는 수치가 오릅니다.";
}

function deckRemoveRecommendationReason(run, cardInstance, analysis) {
  const card = effectiveCard(cardInstance);
  const duplicateCount = run.player.deck.filter((item) => item.cardId === cardInstance.cardId).length;
  const context = deckSelectorBossContext(run);
  if (card.rarity === "curse" || card.type === "curse" || card.unplayable) return "손패를 막는 카드라 가장 먼저 빼는 편이 좋습니다.";
  if (context?.missing.includes("카드 뽑기")) return `${context.bossName} 전입니다. 덱을 줄이면 방어와 마무리 카드를 더 빨리 봅니다.`;
  if (card.rarity === "starter" && duplicateCount > 1) return "기본 카드가 여러 장입니다. 한 장 줄이면 핵심 카드가 더 자주 옵니다.";
  if (analysis.primary?.score > 0 && cardAxisMatch(card, analysis.primary).score <= 0) return `${analysis.primary.label} 덱과 덜 맞아 제거 가치가 있습니다.`;
  if (duplicateCount > 1) return "같은 역할이 겹칩니다. 덱을 줄이면 필요한 카드가 빨리 돌아옵니다.";
  return "덱을 한 장 줄여 중요한 카드가 더 자주 보이게 합니다.";
}

function deckUpgradeRecommendationChips(cardInstance, analysis, run = null) {
  const before = effectiveCard({ ...cardInstance, upgraded: false });
  const after = effectiveCard({ ...cardInstance, upgraded: true });
  const context = run ? deckSelectorBossContext(run) : null;
  const chips = [];
  if (context?.missing.length) chips.push({ tone: context.tone === "danger" ? "danger" : "strong", label: "보스 대비" });
  if (context?.missing.includes("연속 방어") && cardSupportsBurstDefense(after)) chips.push({ tone: "guarded", label: "연속 방어" });
  if (context?.missing.includes("큰 방어") && cardSupportsBurstDefense(after)) chips.push({ tone: "guarded", label: "큰 방어" });
  if (context?.missing.includes("정화·약화") && cardSupportsStatusControl(after)) chips.push({ tone: "warning", label: "정화·약화" });
  const costGain = Math.max(0, (before.cost ?? 0) - (after.cost ?? 0));
  if (costGain > 0) chips.push({ tone: "strong", label: `비용 -${costGain}` });
  if (analysis.primary?.score > 0 && cardAxisMatch(after, analysis.primary).score > 0) chips.push({ tone: "steady", label: analysis.primary.label });
  if (cardSupportsDefense(after)) chips.push({ tone: "guarded", label: "방어 보강" });
  if (cardSupportsFinish(after)) chips.push({ tone: "danger", label: "마무리 강화" });
  return chips.slice(0, 3).length ? chips.slice(0, 3) : [{ tone: "steady", label: "효과 강화" }];
}

function deckRemoveRecommendationChips(run, cardInstance, analysis) {
  const card = effectiveCard(cardInstance);
  const duplicateCount = run.player.deck.filter((item) => item.cardId === cardInstance.cardId).length;
  const hpCost = run.selector?.hpCost ?? 0;
  const context = deckSelectorBossContext(run);
  const chips = [{ tone: "steady", label: `덱 ${Math.max(0, run.player.deck.length - 1)}장` }];
  if (context?.missing.includes("카드 뽑기")) chips.unshift({ tone: context.tone === "danger" ? "danger" : "strong", label: "보스 전 압축" });
  if (card.rarity === "curse" || card.type === "curse" || card.unplayable) chips.unshift({ tone: "warning", label: "저주 제거" });
  else if (card.rarity === "starter") chips.unshift({ tone: "strong", label: "기본 카드 정리" });
  else if (duplicateCount > 1) chips.unshift({ tone: "strong", label: "중복 정리" });
  else if (analysis.primary?.score > 0 && cardAxisMatch(card, analysis.primary).score <= 0) chips.unshift({ tone: "steady", label: "주력 밖 카드" });
  if (hpCost) chips.push({ tone: "warning", label: `체력 -${hpCost}` });
  else if (run.selector?.refund) chips.push({ tone: "steady", label: "취소 시 환불" });
  else chips.push({ tone: "steady", label: "취소 무료" });
  return chips.slice(0, 3);
}

function upgradeChoicePreview(cardInstance) {
  if (!isUpgradeableCard(cardInstance)) {
    return {
      tone: "muted",
      label: "강화 불가",
      detail: cardInstance.upgraded ? "이미 강화된 카드입니다." : "강화해도 비용이나 효과가 바뀌지 않습니다.",
      after: "",
      metrics: [{ tone: "muted", label: "선택 불가" }]
    };
  }
  const before = effectiveCard({ ...cardInstance, upgraded: false });
  const after = effectiveCard({ ...cardInstance, upgraded: true });
  const costMetric =
    before.cost === after.cost
      ? { tone: "steady", label: "비용 그대로" }
      : { tone: "strong", label: `비용 ${formatCardCost(before.cost)}→${formatCardCost(after.cost)}` };
  const costChange =
    before.cost === after.cost
      ? "비용은 그대로"
      : after.cost < before.cost
        ? `비용 ${formatCardCost(before.cost)}에서 ${formatCardCost(after.cost)}로 감소`
        : `비용 ${formatCardCost(after.cost)}로 변경`;
  const textChange = before.text === after.text ? "효과 구조 유지" : `효과 강화: ${compactEffectText(after.text)}`;
  return {
    tone: after.cost < before.cost ? "strong" : "steady",
    label: "강화 가능",
    detail: costChange,
    after: textChange,
    metrics: [
      costMetric,
      { tone: before.text === after.text ? "steady" : "strong", label: before.text === after.text ? "구조 유지" : "효과 강화" },
      { tone: "confirm", label: "선택 확정" }
    ]
  };
}

function compactEffectText(text) {
  return text.replace(/\s+/g, " ").replace(/\.$/, "");
}

function removeChoicePreview(run, cardInstance) {
  const card = effectiveCard(cardInstance);
  const hpCost = run.selector?.hpCost ?? 0;
  const hpAfter = Math.max(0, run.player.hp - hpCost);
  const deckAfter = Math.max(0, run.player.deck.length - 1);
  const keywords = (card.keywords ?? []).slice(0, 3).map(keywordLabel);
  const role = keywords.length ? keywords.join(", ") : typeLabel(card.type);
  const duplicateCount = run.player.deck.filter((item) => item.cardId === cardInstance.cardId).length;
  const label =
    card.rarity === "curse"
      ? "우선 제거"
      : cardInstance.upgraded
        ? "강화 카드 손실"
        : duplicateCount > 1
          ? "중복 제거"
          : "역할 제거";
  const tone = card.rarity === "curse" || duplicateCount > 1 ? "strong" : cardInstance.upgraded ? "warning" : "steady";
  return {
    tone,
    label,
    detail: `덱 -1장${hpCost ? ` · 체력 -${run.player.hp - hpAfter}` : ""}`,
    after: `${card.name} 빠짐 · 남은 덱 ${deckAfter}장 · ${role}`,
    metrics: [
      { tone: "strong", label: `덱 ${run.player.deck.length}→${deckAfter}장` },
      hpCost ? { tone: "warning", label: `체력 -${run.player.hp - hpAfter}` } : { tone: "steady", label: "체력 변화 없음" },
      { tone: "confirm", label: "선택 확정" }
    ]
  };
}

function formatCardCost(cost) {
  return cost >= 90 ? "-" : String(cost);
}

function renderDeckOverlay(run) {
  return `
    <div class="modal-backdrop">
      <section class="deck-modal">
        <header>
          <h2>현재 덱</h2>
          <button data-action="toggle-deck">닫기</button>
        </header>
        ${renderDeckAnalysis(run)}
        <div class="deck-grid">
          ${run.player.deck.map((card) => renderCard(card, { compact: true })).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderDeckAnalysis(run) {
  const analysis = deckAnalysis(run);
  return `
    <section class="deck-analysis" aria-label="덱 분석">
      <div class="deck-analysis-head">
        <strong>${analysis.primary.label}</strong>
        <span>${analysis.primary.score > 0 ? analysis.primary.detail : "아직 무엇으로 이길지 정해지는 중입니다."}</span>
      </div>
      <dl class="deck-metrics">
        <div><dt>평균 비용</dt><dd>${analysis.averageCost}</dd></div>
        <div><dt>강화</dt><dd>${analysis.upgraded}/${analysis.total}</dd></div>
        <div><dt>저주</dt><dd>${analysis.curses}</dd></div>
        <div><dt>덱 크기</dt><dd>${analysis.deckSizeLabel}</dd></div>
      </dl>
      <div class="deck-axis-list">
        ${analysis.axes
          .slice(0, 4)
          .map(
            (axis) => `
              <article class="${axis.tone}">
                <header><span>${axis.label}</span><strong>${axis.score}</strong></header>
                <div class="axis-meter"><span style="width:${axis.width}%"></span></div>
                <small>${axis.detail}</small>
                ${axis.guide ? `<small class="axis-pick">고를 때 · ${axis.guide.pick}</small>` : ""}
              </article>
            `
          )
          .join("")}
      </div>
      ${renderDeckActionPanel(analysis)}
      <div class="deck-advice">
        ${analysis.advice.map((item) => `<span class="${item.tone}">${item.text}</span>`).join("")}
      </div>
      <div class="deck-type-strip">
        ${analysis.types.map((item) => `<span>${item.label} ${item.count}</span>`).join("")}
      </div>
    </section>
  `;
}

function deckAnalysis(run) {
  const cards = run.player.deck.map((cardInstance) => effectiveCard(cardInstance));
  const playableCosts = cards.filter((card) => !card.unplayable && card.cost < 90).map((card) => card.cost ?? 0);
  const total = cards.length;
  const averageCost = playableCosts.length ? (playableCosts.reduce((sum, cost) => sum + cost, 0) / playableCosts.length).toFixed(1) : "-";
  const typeEntries = ["attack", "skill", "power", "curse"].map((type) => ({
    type,
    label: typeLabel(type),
    count: cards.filter((card) => card.type === type).length
  }));
  const axes = DECK_AXIS_DEFINITIONS.map((axis) => deckAxisScore(run, axis)).sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
  const maxScore = Math.max(1, axes[0]?.score ?? 1);
  const shapedAxes = axes.map((axis) => ({
    ...axis,
    guide: conceptGuideForAxis(axis.id),
    width: Math.max(6, Math.round((axis.score / maxScore) * 100)),
    tone: axis.score >= maxScore ? "strong" : axis.score >= 3 ? "steady" : "muted"
  }));
  const primary = shapedAxes.find((axis) => axis.score > 0) ?? { label: "탐색 중", score: 0, detail: "" };
  return {
    total,
    averageCost,
    upgraded: run.player.deck.filter((card) => card.upgraded).length,
    curses: cards.filter((card) => card.type === "curse").length,
    deckSizeLabel: deckSizeLabel(total),
    types: typeEntries,
    axes: shapedAxes,
    primary,
    spotlight: deckSpotlightCards(run, primary),
    nextPicks: deckNextPicks(run, { total, averageCost: Number(averageCost), curses: cards.filter((card) => card.type === "curse").length, primary }),
    advice: deckAdvice({ cards, total, typeEntries, axes: shapedAxes, averageCost: Number(averageCost), curses: cards.filter((card) => card.type === "curse").length })
  };
}

function renderDeckActionPanel(analysis) {
  const spotlight = analysis.spotlight.length
    ? analysis.spotlight
        .map(
          (item) => `
            <span>
              <strong>${item.name}${item.count > 1 ? ` x${item.count}` : ""}</strong>
              <small>${item.reason}</small>
            </span>
          `
        )
        .join("")
    : `<span><strong>아직 없음</strong><small>보상에서 같은 키워드가 붙은 카드를 두세 장 모으면 방향이 보입니다.</small></span>`;
  return `
    <div class="deck-action-panel" aria-label="덱 핵심 카드와 다음 보상 기준">
      <section>
        <h3>핵심 카드</h3>
        <div class="deck-spotlight-list">${spotlight}</div>
      </section>
      <section>
        <h3>다음 보상에서 찾기</h3>
        <div class="deck-next-picks">
          ${analysis.nextPicks.map((item) => `<span class="${item.tone}"><b>${item.label}</b><small>${item.detail}</small></span>`).join("")}
        </div>
      </section>
    </div>
  `;
}

function deckSpotlightCards(run, primary) {
  if (!primary?.id || primary.score <= 0) return [];
  const grouped = new Map();
  for (const cardInstance of run.player.deck) {
    const card = effectiveCard(cardInstance);
    const match = cardAxisMatch(card, primary);
    if (match.score <= 0) continue;
    const current = grouped.get(card.id) ?? { id: card.id, name: card.name, count: 0, upgraded: 0, score: 0, reasons: new Set() };
    current.count += 1;
    current.upgraded += cardInstance.upgraded ? 1 : 0;
    current.score += match.score;
    for (const reason of match.reasons) current.reasons.add(reason);
    grouped.set(card.id, current);
  }
  return [...grouped.values()]
    .map((item) => ({
      ...item,
      reason: deckSpotlightReason(item)
    }))
    .sort((left, right) => right.score - left.score || right.upgraded - left.upgraded || left.name.localeCompare(right.name))
    .slice(0, 4);
}

function cardAxisMatch(card, axis) {
  const keywords = new Set(card.keywords ?? []);
  const effects = new Set(cardEffectOps(card.effects ?? []));
  const reasons = [];
  let score = 0;
  for (const keyword of axis.keywords) {
    if (!keywords.has(keyword)) continue;
    if (axis.id === "mark" && keyword === "damage" && !keywords.has("mark")) continue;
    score += 2;
    reasons.push(keywordLabel(keyword));
  }
  for (const effect of axis.effects) {
    if (!effects.has(effect)) continue;
    score += 1;
    const reason = axisEffectReason(effect);
    if (reason) reasons.push(reason);
  }
  if (axis.id === "ward" && card.type === "skill" && effects.has("block")) {
    score += 1;
    reasons.push("방어");
  }
  if (axis.id === "mark" && card.type === "attack" && keywords.has("mark")) reasons.push("공격");
  if (axis.id === "cycle" && card.cost === 0) reasons.push("0비용");
  return { score, reasons: [...new Set(reasons)].slice(0, 3) };
}

function axisEffectReason(effect) {
  return {
    apply: "상태 부여",
    block: "방어",
    blockPerHand: "방어",
    chargePerEnemy: "전하",
    damage: "피해",
    damageByCharge: "전하 피해",
    discardRandom: "손패 교체",
    discountRandomHand: "비용 감소",
    draw: "카드 뽑기",
    exhaustRandomHand: "소멸",
    gainCharge: "전하",
    gainEnergy: "에너지",
    gainFocus: "집중",
    gainGold: "크레딧",
    gainMaxEnergy: "최대 에너지",
    generate: "생성",
    loseHp: "체력 대가",
    loseMaxHp: "최대 체력 대가",
    resetHand: "손패 교체",
    spendChargeDamage: "전하 소비",
    upgradeRandomHand: "강화"
  }[effect] ?? "";
}

function deckSpotlightReason(item) {
  const reasons = [...item.reasons];
  const tags = reasons.length ? reasons.join(" · ") : "핵심 카드";
  return `${tags}${item.upgraded ? ` · 강화 ${item.upgraded}` : ""}`;
}

function deckNextPicks(run, analysis) {
  const cards = run.player.deck.map(effectiveCard);
  const attacks = cards.filter((card) => card.type === "attack").length;
  const defenses = cards.filter(cardSupportsDefense).length;
  const cleaners = cards.filter(cardSupportsStatusControl).length;
  const flow = cards.filter(cardSupportsFlow).length;
  const picks = [];
  if (analysis.curses > 0) {
    picks.push({ tone: "warning", label: "저주 제거", detail: "상점이나 휴식에서 제거를 먼저 보세요." });
  }
  if (attacks < 4 || cards.filter(cardSupportsFinish).length < 5) {
    picks.push({ tone: "danger", label: "마무리 피해", detail: "엘리트와 보스를 끝낼 공격 카드가 필요합니다." });
  }
  if (defenses < 4) {
    picks.push({ tone: "guarded", label: "방어 카드", detail: "큰 공격 턴을 넘길 방어를 보강하세요." });
  }
  if (cleaners < 2) {
    picks.push({ tone: "steady", label: "정화·약화", detail: "바이러스, 취약, 약화가 쌓이는 전투를 대비합니다." });
  }
  if (flow < 3) {
    picks.push({ tone: "steady", label: "카드 뽑기", detail: "필요한 카드를 다시 보는 속도를 올립니다." });
  }
  if (Number.isFinite(analysis.averageCost) && analysis.averageCost >= 1.6) {
    picks.push({ tone: "steady", label: "에너지·비용 감소", detail: "비싼 손패가 막히지 않게 보조 카드를 찾으세요." });
  }
  if (analysis.primary?.score > 0) {
    const guide = conceptGuideForAxis(analysis.primary.id);
    if (guide) picks.push({ tone: "strong", label: analysis.primary.label, detail: guide.pick });
  }
  return picks.slice(0, 3).length ? picks.slice(0, 3) : [{ tone: "steady", label: "첫 핵심 카드", detail: "같은 키워드가 붙은 보상을 두세 장 이어서 고르세요." }];
}

function deckAxisScore(run, axis) {
  let score = 0;
  for (const cardInstance of run.player.deck) {
    const card = effectiveCard(cardInstance);
    const keywords = new Set(card.keywords ?? []);
    const effectOps = new Set(cardEffectOps(card.effects ?? []));
    const keywordHits = axis.keywords.filter((keyword) => keywords.has(keyword)).length;
    const effectHits = axis.effects.filter((effect) => effectOps.has(effect)).length;
    score += keywordHits * 2 + effectHits;
    if (axis.id === "ward" && card.type === "skill") score += 0.5;
    if (axis.id === "mark" && card.type === "attack") score += 0.5;
    if (axis.id === "cycle" && card.cost === 0) score += 0.25;
  }
  const relicHint = RELIC_SYNERGY_HINTS.find((hint) => run.player.relics.includes(hint.id) && hint.keywords.some((keyword) => axis.keywords.includes(keyword)));
  if (relicHint) score += 2;
  return { ...axis, score: Math.round(score * 10) / 10 };
}

function conceptGuideForAxis(axisId) {
  return CORE_CONCEPT_GUIDE.find((concept) => concept.axisId === axisId) ?? null;
}

function conceptForCard(card, run = null) {
  const keywords = new Set(card.keywords ?? []);
  const effectOps = new Set(cardEffectOps(card.effects ?? []));
  const deckCounts = run ? deckKeywordCounts(run) : new Map();
  const scored = DECK_AXIS_DEFINITIONS.map((axis) => {
    const keywordHits = axis.keywords.filter((keyword) => {
      if (!keywords.has(keyword)) return false;
      if (axis.id === "mark" && keyword === "damage") return (deckCounts.get("mark") ?? 0) > 0;
      return true;
    }).length;
    const effectHits = axis.effects.filter((effect) => {
      if (axis.id === "mark" && effect === "damage") return keywords.has("mark") || (deckCounts.get("mark") ?? 0) > 0;
      return effectOps.has(effect);
    }).length;
    const support = axis.id === "ward" && card.type === "skill" && effectOps.has("block") ? 1 : 0;
    return { axis, score: keywordHits * 2 + effectHits + support };
  }).sort((left, right) => right.score - left.score || left.axis.label.localeCompare(right.axis.label));
  return scored[0]?.score > 0 ? scored[0].axis : null;
}

function conceptForRelic(relicId, run = null) {
  const hint = RELIC_SYNERGY_HINTS.find((entry) => entry.id === relicId);
  const relic = RELIC_BY_ID[relicId];
  const text = `${relic?.timing ?? ""} ${relic?.text ?? ""}`;
  const fallbackKeywords = [];
  if (/전하/.test(text)) fallbackKeywords.push("charge");
  if (/바이러스|약화|취약|균열/.test(text)) fallbackKeywords.push("virus");
  if (/표식/.test(text)) fallbackKeywords.push("mark");
  if (/방어|반격|도금/.test(text)) fallbackKeywords.push("block");
  if (/소멸|카드 \d+장을? 뽑|카드 보상|카드 제거|보상.*선택/.test(text)) fallbackKeywords.push("exhaust");
  if (/에너지|최대 에너지|체력 \d+를 잃|크레딧 \d+/.test(text)) fallbackKeywords.push("fragile");
  if (!hint && !fallbackKeywords.length) return null;
  const scored = DECK_AXIS_DEFINITIONS.map((axis) => {
    const overlap = axis.keywords.filter((keyword) => hint?.keywords.includes(keyword)).length;
    const fallbackOverlap = axis.keywords.filter((keyword) => fallbackKeywords.includes(keyword)).length;
    const baseScore = overlap * 4 + fallbackOverlap * 3;
    const current = run ? deckAxisScore(run, axis).score : 0;
    return { axis, score: baseScore > 0 ? baseScore + Math.min(5, current) * 0.1 : 0 };
  }).sort((left, right) => right.score - left.score || left.axis.label.localeCompare(right.axis.label));
  return scored[0]?.score > 0 ? scored[0].axis : null;
}

function renderConceptTag(concept) {
  return renderRewardConceptTag(concept);
}

function addConcept(insight, concept) {
  return concept ? { ...insight, concept } : insight;
}

function buildConcepts(tags = []) {
  const tagSet = new Set(tags ?? []);
  return DECK_AXIS_DEFINITIONS.map((axis) => {
    const directHit = tagSet.has(axis.id) ? 3 : 0;
    const score = axis.keywords.filter((keyword) => {
      if (!tagSet.has(keyword)) return false;
      if (axis.id === "mark" && keyword === "damage" && !tagSet.has("mark")) return false;
      return true;
    }).length + directHit;
    return { axis, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || DECK_AXIS_DEFINITIONS.indexOf(left.axis) - DECK_AXIS_DEFINITIONS.indexOf(right.axis))
    .map((entry) => entry.axis);
}

function hasBuildConcept(tags, axisId) {
  return buildConcepts(tags).some((axis) => axis.id === axisId);
}

function buildConceptText(tags, emptyText = "주력 미정") {
  const labels = buildConcepts(tags).map((axis) => axis.label);
  return labels.length ? labels.slice(0, 3).join(" / ") : emptyText;
}

function buildConceptShortText(tags, emptyText = "주력 미정") {
  const labels = buildConcepts(tags).map((axis) => summaryConceptCompactLabel(axis));
  return labels.length ? labels.slice(0, 2).join(" · ") : emptyText;
}

function summaryPrimaryBuildText(summary, emptyText = "주력 미정") {
  const concepts = buildConcepts(summary?.build ?? []);
  if (!concepts.length) return emptyText;
  const label = summaryConceptLabel(concepts[0]);
  return concepts.length === 1 ? label : `${label} 중심`;
}

function summaryBuildLine(summary, emptyText = "주력 미정") {
  const concepts = buildConcepts(summary?.build ?? []);
  if (!concepts.length) return emptyText;
  if (concepts.length <= 2) return concepts.map(summaryConceptLabel).join(" · ");
  return `${summaryConceptLabel(concepts[0])} · ${summaryConceptLabel(concepts[1])} 외 ${concepts.length - 2}`;
}

function summaryBuildCompactLine(summary, emptyText = "주력 미정") {
  const concepts = buildConcepts(summary?.build ?? []);
  if (!concepts.length) return emptyText;
  if (concepts.length <= 2) return concepts.map(summaryConceptCompactLabel).join(" · ");
  return `${summaryConceptCompactLabel(concepts[0])} · ${summaryConceptCompactLabel(concepts[1])} +${concepts.length - 2}`;
}

function summaryConceptLabel(axis) {
  return axis?.shortLabel ?? axis?.label ?? "주력";
}

function summaryConceptCompactLabel(axis) {
  return {
    charge: "전하",
    mark: "표식",
    virus: "바이러스",
    ward: "반격",
    cycle: "순환",
    risk: "위험"
  }[axis?.id] ?? summaryConceptLabel(axis);
}

function renderBuildTags(tags, emptyText = "주력 미정") {
  const concepts = buildConcepts(tags);
  return concepts.map((axis) => `<span>${axis.label}</span>`).join("") || `<span>${emptyText}</span>`;
}

function buildConceptRecordEntries(builds = {}) {
  const counts = new Map();
  for (const [tag, count] of Object.entries(builds ?? {})) {
    for (const axis of buildConcepts([tag])) {
      const label = summaryConceptLabel(axis);
      counts.set(label, (counts.get(label) ?? 0) + Number(count || 0));
    }
  }
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 8);
}

function cardEffectOps(effects = []) {
  const ops = [];
  for (const effect of effects) {
    ops.push(effect.op);
    if (effect.effects) ops.push(...cardEffectOps(effect.effects));
  }
  return ops;
}

function deckSizeLabel(total) {
  if (total <= 12) return "얇음";
  if (total <= 18) return "균형";
  if (total <= 25) return "큼";
  return "너무 큼";
}

function deckAdvice({ cards, total, typeEntries, axes, averageCost, curses }) {
  const advice = [];
  const skills = typeEntries.find((entry) => entry.type === "skill")?.count ?? 0;
  const attacks = typeEntries.find((entry) => entry.type === "attack")?.count ?? 0;
  const topAxis = axes[0];
  if (curses > 0) advice.push({ tone: "warning", text: `저주 ${curses}장: 제거 가치가 높습니다.` });
  if (skills < Math.max(4, Math.floor(total * 0.28))) advice.push({ tone: "warning", text: "방어와 손패 정리 카드가 부족합니다." });
  if (attacks < 4) advice.push({ tone: "warning", text: "마무리 피해 카드가 부족합니다." });
  if (Number.isFinite(averageCost) && averageCost >= 1.6) advice.push({ tone: "steady", text: "평균 비용이 높아 에너지 보상과 비용 감소가 좋습니다." });
  if (total > 22) advice.push({ tone: "steady", text: "덱이 커졌습니다. 제거와 카드 뽑기 가치가 올라갑니다." });
  if (cards.filter((card) => card.upgrade).length >= total * 0.5) advice.push({ tone: "strong", text: "강화할 카드가 많아 휴식 강화가 좋습니다." });
  if (topAxis?.score > 0) advice.push({ tone: "strong", text: `${topAxis.label} 카드가 가장 많습니다.` });
  return advice.slice(0, 4);
}

function renderSettings() {
  const canAbandonRun = state.run && state.run.phase !== "summary";
  return `
    <main class="settings-screen">
      <section class="panel settings-panel">
        <header class="settings-header">
          <div>
            <h1>설정</h1>
            <p>소리, 화면, 힌트 표시를 조정합니다.</p>
          </div>
        </header>
        <div data-settings-save-notice>${renderSaveRecoveryNotice()}</div>
        <div class="settings-grid">
          <section class="settings-group" aria-label="사운드 설정">
            <h2>사운드</h2>
            ${renderSettingRange("volume", "효과음", "카드, 피해, 버튼, 승패", 0, 1, 0.05)}
            ${renderSettingRange("musicVolume", "배경음", "메뉴, 전투, 보스, 보상", 0, 1, 0.05)}
            <div class="settings-inline-actions" aria-label="사운드 미리듣기">
              <button type="button" data-action="preview-sound" data-id="attackCard">효과음 미리듣기</button>
              <button type="button" data-action="preview-music">배경음 켜기</button>
            </div>
          </section>
          <section class="settings-group" aria-label="화면 설정">
            <h2>화면</h2>
            ${renderSettingRange("motionSpeed", "애니메이션", "낮게: 천천히 · 높게: 빠르게", 0.4, 1.6, 0.1)}
            ${renderSettingRange("textScale", "텍스트 크기", "카드와 전투 UI 크기", 0.9, 1.25, 0.05)}
          </section>
          <section class="settings-group settings-wide" aria-label="접근성과 가이드 설정">
            <h2>접근성 · 가이드</h2>
            ${renderSettingSwitch("highContrast", "고대비 모드", "대비를 높이고 장식을 줄입니다.", state.settings.highContrast)}
            ${renderSettingSwitch("tacticalAdvisor", "플레이 힌트", "턴 요약과 추천 카드를 표시합니다.", state.settings.tacticalAdvisor !== false)}
          </section>
        </div>
        <div class="title-actions">
          <button data-action="return-screen">${returnButtonLabel()}</button>
          ${canAbandonRun ? `<button class="danger" data-action="abandon-run">런 포기</button>` : ""}
          <button class="danger" data-action="delete-save">저장 삭제</button>
        </div>
      </section>
    </main>
  `;
}

function renderSettingRange(key, label, detail, min, max, step) {
  return `
    <label class="settings-range">
      <span><strong>${label}</strong><small>${detail}</small></span>
      <span class="settings-control-line">
        <input type="range" min="${min}" max="${max}" step="${step}" value="${state.settings[key]}" data-setting="${key}" aria-label="${label}" />
        <output data-setting-value="${key}">${formatSettingValue(key)}</output>
      </span>
    </label>
  `;
}

function renderSettingSwitch(key, label, detail, checked) {
  return `
    <label class="settings-switch">
      <input type="checkbox" ${checked ? "checked" : ""} data-setting="${key}" />
      <span><strong>${label}</strong><small>${detail}</small></span>
    </label>
  `;
}

function renderAbout() {
  const counts = contentCounts();
  return `
    <main class="about-screen">
      <section class="panel about-panel">
        <header class="about-hero">
          <div>
            <span>심해 덱 빌딩 로그라이크</span>
            <h1>딥 시그널</h1>
            <p>카드를 고르고, 지우고, 강화하며 더 깊은 구역으로 내려가는 싱글플레이 게임입니다.</p>
          </div>
          <dl class="about-facts" aria-label="콘텐츠 요약">
            <div><dt>카드</dt><dd>${counts.cards}</dd></div>
            <div><dt>유물</dt><dd>${counts.relics}</dd></div>
            <div><dt>적</dt><dd>${counts.normalEnemies + counts.eliteEnemies + counts.bosses}</dd></div>
            <div><dt>이벤트</dt><dd>${counts.events}</dd></div>
          </dl>
        </header>
        <section class="about-art-window" aria-label="딥 시그널 아트 방향">
          <div>
            <span>아트 방향</span>
            <strong>낡은 탐사 장비, 심해 케이블, 빛나는 데이터 생물</strong>
            <small>카드와 전투 에셋은 같은 팔레트와 스프라이트 시트에서 읽히도록 구성했습니다.</small>
          </div>
        </section>
        <section class="about-flow" aria-label="플레이 흐름">
          ${["경로 선택", "전투", "보상", "정비", "보스"].map((step, index) => `
            <article>
              <span>${index + 1}</span>
              <strong>${step}</strong>
            </article>
          `).join("")}
        </section>
        <div class="about-grid">
          <article>
            <h2>핵심 조작</h2>
            <ul class="about-list">
              <li>카드 클릭 또는 드래그로 사용</li>
              <li>적 클릭, 방향키로 대상 변경</li>
              <li><kbd>1</kbd>-<kbd>9</kbd>, <kbd>0</kbd> 카드 사용</li>
              <li><kbd>E</kbd> 또는 <kbd>Space</kbd> 턴 종료</li>
            </ul>
          </article>
          <article>
            <h2>주력 전략</h2>
            <p>전하로 크게 폭발하거나, 표식과 바이러스로 적을 무너뜨리고, 막아낸 뒤 되받아치며 덱 방향을 잡습니다.</p>
            <div class="about-tags">
              ${renderBuildTags(DECK_AXIS_DEFINITIONS.map((axis) => axis.id))}
            </div>
          </article>
          <article>
            <h2>크레딧</h2>
            <p>기획, 코드, 데이터, 화면 구성, 세계관, 스프라이트 에셋과 사운드 구조는 이 프로젝트 안에서 새로 구성했습니다.</p>
          </article>
          <article>
            <h2>이용 안내 · 라이선스</h2>
            <p>외부 저작권 IP, 상용 이미지, 외부 음악 파일을 포함하지 않습니다.</p>
            <ul class="about-license-list">
              <li>게임 고유 명칭과 설정 사용</li>
              <li>브라우저에서 프론트엔드만으로 실행</li>
              <li>프로젝트 라이선스: UNLICENSED</li>
            </ul>
          </article>
        </div>
        <section class="about-release" aria-label="실행과 검증">
          <div>
            <strong>로컬 실행</strong>
            <code>npm run dev</code>
          </div>
          <div>
            <strong>검증</strong>
            <code>npm test · npm run build · npm run balance · npm run audit</code>
          </div>
        </section>
        <button data-action="return-screen">${returnButtonLabel()}</button>
      </section>
    </main>
  `;
}

function renderGuide() {
  return `
    <main class="guide-screen">
      <section class="panel guide-panel">
        <header class="compendium-header">
          <div>
            <h1>게임 가이드</h1>
            <p>막히면 지금 화면에서 바꿀 선택 하나만 고르세요.</p>
          </div>
          <div class="title-actions">
            ${state.returnScreen === "game" && state.run ? `<button data-action="return-screen">${returnButtonLabel()}</button>` : state.run ? `<button data-action="screen" data-id="game">게임으로</button>` : ""}
            <button data-action="screen" data-id="title">시작 화면</button>
          </div>
        </header>
        ${renderGuidePlaybook()}
        ${renderGuideConcepts()}
        <section class="guide-grid" aria-label="상황별 판단">
          ${renderGuideCard("경로 선택", [
            "일반 전투: 카드 보상으로 덱의 중심을 찾습니다.",
            "엘리트: 유물은 크지만 체력과 방어가 필요합니다.",
            "상점: 제거 비용이 있을 때 가장 좋습니다."
          ])}
          ${renderGuideCard("전투", [
            "적 의도를 보고 체력 손실부터 계산합니다.",
            "처치 가능한 적을 줄이면 다음 턴도 편해집니다.",
            "전하와 보존 카드는 다음 턴 가치까지 봅니다."
          ])}
          ${renderGuideCard("덱 정비", [
            "카드가 많아지면 핵심 카드가 늦게 옵니다.",
            "맞지 않는 보상은 넘기는 것도 좋은 선택입니다.",
            "강화는 덱을 키우지 않는 안전한 성장입니다."
          ])}
          ${renderGuideCard("보스 대비", [
            "대분류자 칼리스: 카드 뽑기와 정화가 좋습니다.",
            "익사한 알고리즘: 길어질수록 바이러스가 아픕니다.",
            "마지막 문 성가대: 방어, 소환 처리, 마무리를 모두 봅니다."
          ])}
        </section>
        <div class="guide-actions">
          <button data-action="screen" data-id="codex">코덱스에서 키워드 보기</button>
          ${state.run ? `<button class="primary" data-action="screen" data-id="game">현재 런으로 돌아가기</button>` : `<button class="primary" data-action="new-run">새 런 시작</button>`}
        </div>
      </section>
    </main>
  `;
}

function renderGuidePlaybook() {
  const steps = [
    {
      label: "보상",
      title: "같은 키워드 두 장",
      detail: "전하, 표식, 바이러스, 반격 중 하나가 반복되면 그쪽으로 갑니다.",
      chips: ["주력 선택", "스킵 가능"]
    },
    {
      label: "경로",
      title: "체력이 낮으면 안전하게",
      detail: "회복 수단이 없으면 엘리트보다 상점이나 휴식을 먼저 봅니다.",
      chips: ["체력 확인", "상점·휴식"]
    },
    {
      label: "보스",
      title: "빈 역할 하나 채우기",
      detail: "방어, 정화·약화, 마무리 중 없는 역할을 보스 전까지 붙입니다.",
      chips: ["방어", "정화·약화", "마무리"]
    }
  ];
  return `
    <section class="guide-playbook" aria-label="첫 런 플레이북">
      <header>
        <span>첫 런 기준</span>
        <strong>한 번에 하나만 정하세요</strong>
        <p>보상, 경로, 보스 대비를 동시에 고민하지 않아도 됩니다.</p>
      </header>
      <div class="guide-flow" aria-label="첫 런 추천 흐름">
        ${steps.map((step, index) => `
          <article>
            <span>${index + 1}</span>
            <div>
              <small>${step.label}</small>
              <strong>${step.title}</strong>
              <p>${step.detail}</p>
              <div class="guide-flow-chips">${step.chips.map((chip) => `<i>${chip}</i>`).join("")}</div>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderGuideConcepts() {
  return `
    <section class="guide-concepts" aria-label="주력 전략 빠른 보기">
      <div class="guide-section-heading">
        <h2>주력 전략</h2>
        <p>덱 방향은 카드 설명보다 흐름으로 먼저 읽습니다.</p>
      </div>
      <div class="guide-concept-grid">
        ${CORE_CONCEPT_GUIDE.map((concept) => {
          const axis = DECK_AXIS_DEFINITIONS.find((entry) => entry.id === concept.axisId);
          const flow = codexAxisFlow(axis.id);
          return `
            <details class="guide-concept-card concept-${axis.id}">
              <summary>
                <strong>${axis.shortLabel ?? axis.label}</strong>
                <span>${axis.keywords.slice(0, 3).map(keywordLabel).join(" · ")}</span>
                <div class="guide-concept-loop">
                  ${flow.map((item) => `<i><b>${item.step}</b>${item.value}</i>`).join("")}
                </div>
              </summary>
              <p>${axis.detail}</p>
              <dl>
                <div><dt>고를 때</dt><dd>${concept.pick}</dd></div>
                <div><dt>주의</dt><dd>${concept.care}</dd></div>
              </dl>
            </details>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderGuideCard(title, items) {
  return `
    <details class="guide-card">
      <summary>
        <h2>${title}</h2>
        <span>${items.length}가지 확인하기</span>
      </summary>
      <ul>
        ${items.map((item) => `<li>${item}</li>`).join("")}
      </ul>
    </details>
  `;
}

function renderRecords() {
  const records = state.records;
  const bossEntries = Object.entries(records.bosses ?? {}).sort((a, b) => b[1] - a[1]);
  const history = records.history ?? [];
  const conceptCounts = buildConceptRecordEntries(records.builds);
  return `
    <main class="records-screen">
      <section class="panel records-panel">
        <h1>기록</h1>
        ${renderRecordsCareer(records, history, conceptCounts, bossEntries)}
        <dl class="summary-stats records-stat-strip">
          <div><dt>런</dt><dd>${records.runs}</dd></div>
          <div><dt>승리</dt><dd>${records.wins}</dd></div>
          <div><dt>패배</dt><dd>${records.losses}</dd></div>
          <div><dt>최고 층</dt><dd>${records.bestFloor}</dd></div>
          <div><dt>처치한 보스</dt><dd>${records.bossesKilled}</dd></div>
          <div><dt>최대 피해</dt><dd>${records.bestDamage}</dd></div>
        </dl>
        ${renderRecordsNextGoal(records, history, conceptCounts)}
        <h2>난이도 진행</h2>
        ${renderDifficultyLadder(records)}
        <h2>일일 계약 기록</h2>
        ${renderDailyContractRecords(records)}
        <h2>자주 쓴 주력 전략</h2>
        <div class="build-tags concept-build-tags">${conceptCounts.map(([label, count]) => `<span>${label} ${count}</span>`).join("") || "<span>아직 기록 없음</span>"}</div>
        <h2>처치한 보스</h2>
        <div class="build-tags">${bossEntries.map(([boss, count]) => `<span>${boss} ${count}</span>`).join("") || "<span>아직 기록 없음</span>"}</div>
        <h2>최근 런</h2>
        <div class="run-history">
          ${history
            .map((entry) => {
              const replaySeed = sanitizeSeed(entry.seed);
              return `
                <article class="${entry.won ? "won" : "lost"}">
                  <header>
                    <strong>${entry.won ? "승리" : "패배"} · ${entry.difficulty}${entry.challenge ? ` · ${entry.challenge}` : ""}</strong>
                    <span>${new Date(entry.completedAt).toLocaleDateString()}</span>
                  </header>
                  <p>층 ${entry.floors} · 보스 ${entry.bossesDefeated} · 덱 ${entry.deckSize} · 유물 ${entry.relics} · 입힌 피해 ${entry.damageDealt}</p>
                  ${renderHistoryPathLine(entry)}
                  <details class="history-more">
                    <summary>세부 기록</summary>
                    <p class="history-detail">시드 ${entry.seed || "미기록"} · 시간 ${formatDuration(entry.durationSeconds)} · 카드 +${entry.cardsAdded}/-${entry.cardsRemoved} · 받은 피해 ${entry.damageTaken} · 크레딧 ${entry.gold}</p>
                    ${entry.route?.totalFloors ? `<p class="history-detail">${routeRecordText(entry.route)}</p>` : ""}
                    <div class="build-tags compact-tags concept-build-tags">${renderBuildTags(entry.build)}</div>
                  </details>
                  ${renderHistoryReplayCue(entry, replaySeed)}
                  <footer>
                    <small>${entry.killedBosses.length ? `처치: ${entry.killedBosses.join(", ")}` : entry.reason}</small>
                    ${replaySeed ? `<button data-action="replay-seed" data-id="${replaySeed}" data-difficulty="${entry.difficultyId ?? 0}">시드 재도전</button>` : ""}
                  </footer>
                </article>
              `;
            })
            .join("") || "<p class=\"empty-record\">아직 완료한 런이 없습니다.</p>"}
        </div>
        <button data-action="return-screen">${returnButtonLabel()}</button>
      </section>
    </main>
  `;
}

function renderRecordsCareer(records, history, conceptCounts, bossEntries) {
  const latest = history[0] ?? null;
  const runs = records.runs ?? 0;
  const winRate = runs ? Math.round(((records.wins ?? 0) / runs) * 100) : 0;
  const topBuild = conceptCounts[0]?.[0] ?? "아직 없음";
  const topBoss = bossEntries[0]?.[0] ?? "아직 없음";
  const next = recordsCareerNextAction(records, history, conceptCounts);
  return `
    <section class="records-career ${next.tone}" aria-label="기록 요약">
      <div class="records-career-copy">
        <span>${runs ? "기록 요약" : "첫 기록 준비"}</span>
        <strong>${runs ? `최고 ${records.bestFloor ?? 0}층 · 승률 ${winRate}%` : "첫 런을 기록해 보세요"}</strong>
        <p>${recordsCareerLine(records, latest, topBuild, topBoss)}</p>
      </div>
      <dl class="records-career-metrics">
        <div><dt>최근</dt><dd>${latest ? `${latest.won ? "승리" : "패배"} · ${latest.floors}층` : "기록 없음"}</dd></div>
        <div><dt>주력</dt><dd>${topBuild}</dd></div>
        <div><dt>보스</dt><dd>${topBoss}</dd></div>
      </dl>
      <div class="records-career-action">
        <span>다음 런</span>
        <strong>${next.title}</strong>
        <p>${next.detail}</p>
        ${renderRecordsCareerActionButton(next)}
      </div>
    </section>
  `;
}

function recordsCareerLine(records, latest, topBuild, topBoss) {
  if (!latest) return "런이 끝나면 시드, 주력, 보스 처치, 막힌 지점이 여기에 쌓입니다.";
  if (latest.won) return `${topBuild}이 통했습니다. 다음에는 난이도나 보스 전 경로를 바꿔 보세요.`;
  return `최근 ${historyStopPoint(latest)}에서 멈췄습니다. 같은 시드로 첫 보상과 경로를 바꿔 비교하세요.`;
}

function recordsCareerNextAction(records, history, conceptCounts) {
  const latest = history[0] ?? null;
  if (!latest) {
    return {
      tone: "steady",
      title: "표층에서 첫 기록 만들기",
      detail: "전하, 표식, 바이러스, 반격 중 하나를 먼저 고르고 같은 계열 보상을 이어서 보세요.",
      action: "new-run",
      actionLabel: "새 런 시작"
    };
  }
  const replaySeed = sanitizeSeed(latest.seed);
  const nextDifficulty = latest.won ? nextDifficultyAfter(latest.difficultyId ?? 0) : null;
  if (latest.won && nextDifficulty) {
    return {
      tone: "strong",
      title: `${nextDifficulty.name} 도전`,
      detail: "이미 통했던 첫 선택을 한 단계 깊은 난이도에서 다시 시험하세요.",
      action: "start-next-difficulty",
      actionLabel: `${nextDifficulty.name} 시작`,
      difficultyId: nextDifficulty.id
    };
  }
  if (replaySeed) {
    return {
      tone: latest.won ? "strong" : "warning",
      title: latest.won ? "같은 시드로 더 빠르게" : "같은 시드로 첫 선택 바꾸기",
      detail: latest.won
        ? "아는 경로에서 덱을 더 얇게 유지해 완주 시간을 줄여 보세요."
        : `${historyNextChoice(latest).title}부터 바꾸면 차이가 바로 보입니다.`,
      action: "replay-seed",
      actionLabel: "시드 재도전",
      seed: replaySeed,
      difficultyId: latest.difficultyId ?? 0
    };
  }
  return {
    tone: conceptCounts.length ? "steady" : "warning",
    title: "다른 주력으로 새 런",
    detail: "최근과 다른 주력 카드를 고르면 같은 보스도 다른 방식으로 풀립니다.",
    action: "new-run",
    actionLabel: "다른 런 시작"
  };
}

function renderRecordsCareerActionButton(next) {
  if (!next.action) return "";
  const seedAttr = next.seed ? ` data-id="${next.seed}"` : "";
  const difficultyAttr = Number.isFinite(Number(next.difficultyId)) ? ` data-difficulty="${next.difficultyId}"` : "";
  return `<button data-action="${next.action}"${seedAttr}${difficultyAttr}>${next.actionLabel}</button>`;
}

function renderHistoryPathLine(entry) {
  const stop = historyStopPoint(entry);
  const route = entry.route;
  const detail = route?.totalFloors
    ? `엘리트 ${route.elites ?? 0} · 상점 ${route.shops ?? 0} · 휴식 ${route.rests ?? 0}`
    : `층 ${entry.floors ?? 0}`;
  return `
    <div class="history-path-line ${entry.won ? "won" : "lost"}" aria-label="최근 런 경로 요약">
      <span>${entry.won ? "완주" : "멈춘 곳"}</span>
      <strong>${entry.won ? `${entry.floors}층` : stop}</strong>
      <small>${detail}</small>
    </div>
  `;
}

function renderHistoryReplayCue(entry, replaySeed = "") {
  const cue = historyReplayCue(entry, replaySeed);
  return `
    <section class="history-replay-cue ${cue.tone}" aria-label="기록 재도전 메모">
      <span>${entry.won ? "다음 도전" : "다시 해볼 선택"}</span>
      <strong>${cue.title}</strong>
      <p>${cue.detail}</p>
      <div>
        ${cue.chips.map((chip) => `<i><b>${chip.label}</b>${chip.value}</i>`).join("")}
      </div>
    </section>
  `;
}

function historyReplayCue(entry, replaySeed = "") {
  const stop = historyStopPoint(entry);
  const build = buildConceptShortText(entry.build, "주력 미기록");
  const nextChoice = historyNextChoice(entry);
  if (entry.won) {
    return {
      tone: "strong",
      title: `${build} 유지`,
      detail: `${entry.floors}층까지 통했습니다. 다음에는 난이도나 경로만 바꿔 보세요.`,
      chips: [
        { label: "유지", value: build },
        { label: "다음", value: "높은 난이도" },
        { label: "시드", value: replaySeed ? "재사용 가능" : "미기록" }
      ]
    };
  }
  return {
    tone: nextChoice.tone,
    title: `${stop}에서 ${nextChoice.title}`,
    detail: `${nextChoice.detail} 같은 시드로 바로 비교할 수 있습니다.`,
    chips: [
      { label: "막힌 곳", value: stop },
      { label: "먼저", value: nextChoice.title },
      { label: "시드", value: replaySeed ? "재사용 가능" : "미기록" }
    ]
  };
}

function historyStopPoint(entry) {
  const stopped = (entry.route?.acts ?? [])
    .filter((act) => act.stoppedAt)
    .at(-1)?.stoppedAt;
  if (stopped) return `${stopped.floor}층 ${nodeTypeLabel(stopped.type)}`;
  return `${entry.floors ?? 0}층`;
}

function historyNextChoice(entry) {
  if ((entry.damageTaken ?? 0) >= 80 || (entry.hp ?? 0) <= 0) {
    return {
      tone: "danger",
      title: "방어와 약화 먼저",
      detail: "큰 공격에 무너졌습니다. 첫 구역에서는 방어와 약화를 더 높게 보세요."
    };
  }
  if ((entry.deckSize ?? 0) >= 25 && (entry.cardsRemoved ?? 0) <= 1) {
    return {
      tone: "warning",
      title: "카드 제거 먼저",
      detail: "덱이 커졌습니다. 상점이나 휴식에서는 구매보다 제거를 먼저 보세요."
    };
  }
  if (!entry.build?.length) {
    return {
      tone: "warning",
      title: "첫 보상에서 방향 정하기",
      detail: "주력이 늦었습니다. 전하, 표식, 바이러스, 반격 중 하나만 먼저 고르세요."
    };
  }
  return {
    tone: "steady",
    title: "보스 전 빈 역할 채우기",
    detail: "주력은 보였습니다. 방어, 마무리, 정화·약화 중 빈 역할을 채우세요."
  };
}

function renderRecordsNextGoal(records, history, conceptCounts) {
  const items = recordsNextGoalItems(records, history, conceptCounts);
  return `
    <section class="records-next-goal" aria-label="다음 목표">
      <header>
        <span>다음 목표</span>
        <strong>${history.length ? "다음 런에서 바꿀 것" : "첫 기록 만들기"}</strong>
        <p>${history.length ? "방금 막힌 지점에서 바로 바꿀 선택만 추렸습니다." : "첫 런은 흐름을 익히고 기록을 남기는 것이 목표입니다."}</p>
      </header>
      <div class="records-goal-rail" aria-label="다음 런 실행 순서">
        ${items
          .map((item, index) => renderRecordsGoalStep(item, index))
          .join("")}
      </div>
    </section>
  `;
}

function renderRecordsGoalStep(item, index) {
  return `
    <article class="records-goal-step ${item.tone}">
      <i class="records-goal-index" aria-hidden="true">${index + 1}</i>
      <div>
        <span>${item.label}</span>
        <strong>${item.title}</strong>
        <small>${item.detail}</small>
        <div class="records-goal-chips">
          ${(item.chips ?? []).map((chip) => `<i><b>${chip.label}</b>${chip.value}</i>`).join("")}
        </div>
      </div>
      ${recordsGoalActionButton(item)}
    </article>
  `;
}

function recordsGoalActionButton(item) {
  if (!item.action) return "";
  const idAttr = item.seed ? ` data-id="${item.seed}"` : "";
  const difficultyAttr = Number.isFinite(Number(item.difficultyId)) ? ` data-difficulty="${item.difficultyId}"` : "";
  return `<button data-action="${item.action}"${idAttr}${difficultyAttr}>${item.actionLabel}</button>`;
}

function recordsNextGoalItems(records, history, conceptCounts) {
  const latest = history[0] ?? null;
  const items = [];
  if (!latest) {
    return [
      {
        tone: "steady",
        label: "첫 런",
        title: "표층에서 첫 루프 익히기",
        detail: "전하, 표식, 바이러스, 반격 중 하나를 먼저 고르세요.",
        chips: [
          { label: "먼저", value: "주력 1개" },
          { label: "목표", value: "보상 읽기" }
        ]
      },
      {
        tone: "strong",
        label: "첫 목표",
        title: "1막 보스까지 도달",
        detail: "초반 전투로 카드를 모으고, 체력이 낮으면 상점이나 휴식을 보세요.",
        chips: [
          { label: "경로", value: "전투 중심" },
          { label: "안전", value: "휴식 확인" }
        ]
      },
      {
        tone: "relic",
        label: "기록 열기",
        title: "시드와 주력 저장",
        detail: "런이 끝나면 시드, 덱 크기, 보스 처치, 사용한 주력이 이 화면에 남습니다.",
        chips: [
          { label: "남김", value: "시드" },
          { label: "비교", value: "주력" }
        ]
      }
    ];
  }

  const latestSeed = sanitizeSeed(latest.seed);
  const nextDifficulty = latest.won ? nextDifficultyAfter(latest.difficultyId ?? 0) : null;
  if (latestSeed) {
    items.push({
      tone: latest.won ? "strong" : "warning",
      label: latest.won ? "추천 재도전" : "막힌 지점",
      title: latest.won && nextDifficulty ? `${nextDifficulty.name}에서 같은 시드` : "같은 시드로 다른 선택",
      detail: latest.won && nextDifficulty
        ? "아는 지도에서 한 단계 깊게 내려가 같은 선택을 시험하세요."
        : `${latest.floors}층에서 멈췄습니다. 첫 경로와 첫 보상을 바꿔 보세요.`,
      action: "replay-seed",
      actionLabel: latest.won && nextDifficulty ? "높은 난이도 재도전" : "같은 시드 재도전",
      seed: latestSeed,
      difficultyId: nextDifficulty?.id ?? latest.difficultyId ?? 0,
      chips: [
        { label: "시드", value: "같게" },
        { label: "비교", value: latest.won && nextDifficulty ? "난이도" : "첫 선택" }
      ]
    });
  }

  items.push(recordsMaintenanceGoal(latest));
  items.push(recordsBuildGoal(records, conceptCounts, latest));
  return items.slice(0, 3);
}

function recordsMaintenanceGoal(latest) {
  if ((latest.deckSize ?? 0) >= 25) {
    return {
      tone: "warning",
      label: "덱 손질",
      title: "카드 제거를 한 번 더",
      detail: `최근 덱은 ${latest.deckSize}장입니다. 제거를 먼저 쓰면 핵심 카드가 더 자주 옵니다.`,
      chips: [
        { label: "덱", value: `${latest.deckSize}장` },
        { label: "먼저", value: "제거" }
      ]
    };
  }
  if ((latest.damageTaken ?? 0) >= 80 || (latest.hp ?? 0) <= 0) {
    return {
      tone: "danger",
      label: "생존 목표",
      title: "방어와 약화 먼저 챙기기",
      detail: `최근 받은 피해 ${latest.damageTaken ?? 0}. 큰 공격 앞에서는 방어와 약화를 먼저 보세요.`,
      chips: [
        { label: "받은 피해", value: latest.damageTaken ?? 0 },
        { label: "먼저", value: "방어" }
      ]
    };
  }
  return {
    tone: "steady",
    label: "경로 목표",
    title: "상점과 휴식 한 번씩 들르기",
    detail: "상점에서는 제거, 보스 전에는 회복이나 강화를 먼저 챙기세요.",
    chips: [
      { label: "상점", value: "제거" },
      { label: "휴식", value: "회복·강화" }
    ]
  };
}

function recordsBuildGoal(records, conceptCounts, latest) {
  const [topLabel, topCount] = conceptCounts[0] ?? [];
  if (topLabel && topCount >= 2) {
    return {
      tone: "strong",
      label: "주력 보강",
      title: `${topLabel}에 보조 역할 더하기`,
      detail: "방어, 마무리, 정화·약화 중 빈 역할 하나만 빨리 붙이세요.",
      chips: [
        { label: "주력", value: topLabel },
        { label: "횟수", value: topCount }
      ]
    };
  }
  if ((records.wins ?? 0) <= 0) {
    return {
      tone: "relic",
      label: "첫 승리",
      title: "전하 피니시나 표식 러시부터",
      detail: "처음엔 피해가 바로 보이는 주력이 좋습니다. 같은 키워드 카드를 둘 이상 모으세요.",
      chips: [
        { label: "추천", value: "전하·표식" },
        { label: "기준", value: "2장 이상" }
      ]
    };
  }
  return {
    tone: "steady",
    label: "다른 주력",
    title: buildConceptShortText(latest.build, "새 방향 찾기"),
    detail: "최근과 다른 주력 카드를 고르면 같은 보스도 다르게 풀립니다.",
    chips: [
      { label: "최근", value: buildConceptShortText(latest.build, "미기록") },
      { label: "다음", value: "다른 주력" }
    ]
  };
}

function routeRecordText(route) {
  const lastAct = route.acts?.filter((act) => act.floors > 0).at(-1);
  const stop = lastAct?.stoppedAt ? `${lastAct.stoppedAt.floor}층 ${nodeTypeLabel(lastAct.stoppedAt.type)}` : `${route.totalFloors ?? 0}층`;
  return `경로 ${stop} · 엘리트 ${route.elites ?? 0} · 이벤트 ${route.events ?? 0} · 상점 ${route.shops ?? 0} · 휴식 ${route.rests ?? 0}`;
}

function renderDailyContractRecords(records) {
  const daily = records.dailyContracts ?? { runs: 0, wins: 0, bestFloor: 0, history: [] };
  const winRate = daily.runs ? Math.round((daily.wins / daily.runs) * 100) : 0;
  return `
    <section class="daily-records" aria-label="일일 계약 기록">
      <dl class="daily-record-summary">
        <div><dt>계약 런</dt><dd>${daily.runs}</dd></div>
        <div><dt>계약 승리</dt><dd>${daily.wins}</dd></div>
        <div><dt>승률</dt><dd>${winRate}%</dd></div>
        <div><dt>최고 층</dt><dd>${daily.bestFloor}</dd></div>
      </dl>
      <div class="daily-record-list">
        ${(daily.history ?? [])
          .map((entry) => {
            const replaySeed = sanitizeSeed(entry.seed);
            const modifiers = entry.modifiers?.length ? entry.modifiers.join(" / ") : "조항 미기록";
            return `
              <article class="${entry.won ? "won" : "lost"}">
                <header>
                  <strong>${entry.date || "날짜 미기록"} · ${entry.won ? "계약 완수" : "계약 실패"}</strong>
                  <span>${entry.difficulty}</span>
                </header>
                <p>${modifiers}</p>
                  <small>층 ${entry.floors} · 보스 ${entry.bossesDefeated} · ${buildConceptText(entry.build, "주력 미기록")}</small>
                ${replaySeed ? `<button data-action="replay-seed" data-id="${replaySeed}" data-difficulty="${entry.difficultyId ?? 0}">계약 시드 재도전</button>` : ""}
              </article>
            `;
          })
          .join("") || "<p class=\"empty-record\">아직 완료한 일일 계약이 없습니다.</p>"}
      </div>
    </section>
  `;
}

function renderDifficultyLadder(records) {
  return `
    <div class="difficulty-ladder" aria-label="난이도별 진행 기록">
      ${GAME_DATA.difficulties
        .map((difficulty) => {
          const entry = records.difficulties?.[String(difficulty.id)];
          const progress = difficultyProgress(difficulty.id);
          const winRate = entry?.runs ? Math.round((entry.wins / entry.runs) * 100) : 0;
          const replaySeed = sanitizeSeed(entry?.lastSeed ?? "");
          return `
            <article class="${progress.tone}">
              <header>
                <strong>${difficulty.name}</strong>
                <span>${progress.label}</span>
              </header>
              <p>${entry?.runs ? `${entry.runs}런 · 승률 ${winRate}% · 최고 ${entry.bestFloor}층` : "아직 이 수심의 기록이 없습니다."}</p>
              <dl>
                <div><dt>승리</dt><dd>${entry?.wins ?? 0}</dd></div>
                <div><dt>보스</dt><dd>${entry?.bossesKilled ?? 0}</dd></div>
                <div><dt>최대 피해</dt><dd>${entry?.bestDamage ?? 0}</dd></div>
              </dl>
              ${entry?.lastCompletedAt ? `<small>최근 ${entry.lastWon ? "승리" : "패배"} · ${new Date(entry.lastCompletedAt).toLocaleDateString()}</small>` : "<small>기록 없음</small>"}
              ${replaySeed ? `<button data-action="replay-seed" data-id="${replaySeed}" data-difficulty="${difficulty.id}">최근 시드 재도전</button>` : ""}
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderCodex() {
  const cardsByRarity = groupBy(GAME_DATA.cards, (card) => card.rarity);
  const enemiesByTier = groupBy(GAME_DATA.enemies, (enemy) => enemy.tier);
  const relicsByRarity = groupBy(GAME_DATA.relics, (relic) => relic.rarity);
  return `
    <main class="compendium-screen">
      <section class="panel compendium-panel">
        <header class="compendium-header">
          <div>
            <h1>코덱스</h1>
            <p>막힐 때는 덱 방향, 키워드, 적 패턴만 빠르게 확인하세요.</p>
          </div>
          <div class="title-actions">
            ${state.returnScreen === "game" && state.run ? `<button data-action="return-screen">${returnButtonLabel()}</button>` : state.run ? `<button data-action="screen" data-id="game">게임으로</button>` : ""}
            <button data-action="screen" data-id="title">시작 화면</button>
          </div>
        </header>

        <nav class="compendium-tabs" aria-label="코덱스 섹션">
          <a href="#codex-concepts">덱 방향</a>
          <a href="#codex-keywords">키워드</a>
          <a href="#codex-cards">카드</a>
          <a href="#codex-relics">유물</a>
          <a href="#codex-enemies">적과 보스</a>
        </nav>

        ${renderCodexQuickRead()}

        <section id="codex-concepts" class="codex-section">
          <h2>덱 방향</h2>
          <div class="concept-codex-grid">
            ${DECK_AXIS_DEFINITIONS.map((axis) => renderCodexConceptGuide(axis)).join("")}
          </div>
        </section>

        <section id="codex-keywords" class="codex-section">
          <h2>키워드와 상태 효과</h2>
          <div class="keyword-grid">
            ${Object.entries({ ...KEYWORDS, ...statusOnlyDescriptions() })
              .map(
                ([key, description]) => `
                  <article>
                    <h3>${keywordLabel(key)}</h3>
                    <p>${description}</p>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>

        <section id="codex-cards" class="codex-section">
          <h2>카드 ${GAME_DATA.cards.length}장</h2>
          ${["starter", "common", "uncommon", "rare", "special", "curse"]
            .map((rarity) => renderCardCatalogGroup(rarity, cardsByRarity.get(rarity) ?? []))
            .join("")}
        </section>

        <section id="codex-relics" class="codex-section">
          <h2>유물 ${GAME_DATA.relics.length}종</h2>
          ${["starter", "common", "uncommon", "rare"]
            .map((rarity) => renderRelicCatalogGroup(rarity, relicsByRarity.get(rarity) ?? []))
            .join("")}
        </section>

        <section id="codex-enemies" class="codex-section">
          <h2>적과 보스 ${GAME_DATA.enemies.length}종</h2>
          ${["normal", "elite", "boss"]
            .map((tier) => renderEnemyCatalogGroup(tier, enemiesByTier.get(tier) ?? []))
            .join("")}
        </section>
      </section>
    </main>
  `;
}

function renderCodexQuickRead() {
  return `
    <section class="codex-quick-read" aria-label="코덱스 빠른 읽기">
      <header>
        <span>빠른 읽기</span>
        <strong>덱은 셋만 보면 됩니다</strong>
      </header>
      <div>
        <article>
          <b>1</b>
          <strong>무엇을 모을까</strong>
          <small>같은 키워드 카드가 두 장 이상 보이면 방향이 잡힙니다.</small>
        </article>
        <article>
          <b>2</b>
          <strong>무엇이 비었나</strong>
          <small>방어, 마무리, 정화·약화 중 빠진 역할을 찾습니다.</small>
        </article>
        <article>
          <b>3</b>
          <strong>보스가 뭘 요구하나</strong>
          <small>큰 공격, 소환, 해로운 상태 중 하나는 꼭 대비합니다.</small>
        </article>
      </div>
    </section>
  `;
}

function renderCodexConceptGuide(axis) {
  const guide = conceptGuideForAxis(axis.id);
  const cards = GAME_DATA.cards.filter((card) => conceptForCard(card)?.id === axis.id);
  const relics = GAME_DATA.relics.filter((relic) => conceptForRelic(relic.id)?.id === axis.id);
  const flow = codexAxisFlow(axis.id);
  return `
    <article class="concept-codex ${axis.id}">
      <header>
        <span>${axis.keywords.slice(0, 3).map(keywordLabel).join(" · ")}</span>
        <strong>${axis.shortLabel ?? axis.label}</strong>
      </header>
      <div class="concept-codex-loop" aria-label="${axis.shortLabel ?? axis.label} 운용 흐름">
        ${flow.map((item, index) => `
          <span>
            <b>${item.step}</b>
            <em>${item.value}</em>
          </span>
          ${index < flow.length - 1 ? "<i aria-hidden=\"true\"></i>" : ""}
        `).join("")}
      </div>
      <dl class="concept-codex-metrics">
        <div><dt>관련 카드</dt><dd>${cards.length}</dd></div>
        <div><dt>관련 유물</dt><dd>${relics.length}</dd></div>
      </dl>
      <details class="concept-codex-more">
        <summary>기준과 예시 보기</summary>
        <p>${axis.detail}</p>
        <div class="concept-codex-advice">
          <small><b>고를 때</b><span>${guide?.pick ?? "같은 계열의 카드와 유물이 이어질 때"}</span></small>
          <small><b>주의</b><span>${guide?.care ?? "방어와 마무리 피해가 모두 있는지 확인하세요."}</span></small>
        </div>
        <div class="concept-codex-list">
          <span>카드: ${cards.slice(0, 5).map((card) => card.name).join(" / ") || "없음"}</span>
          <span>유물: ${relics.slice(0, 4).map((relic) => relic.name).join(" / ") || "없음"}</span>
        </div>
      </details>
    </article>
  `;
}

function codexAxisFlow(axisId) {
  const flows = {
    charge: [
      { step: "모으기", value: "전하 확보" },
      { step: "쓰기", value: "큰 한 방" },
      { step: "보완", value: "방어" }
    ],
    mark: [
      { step: "모으기", value: "표식" },
      { step: "쓰기", value: "연속 공격" },
      { step: "보완", value: "카드 뽑기" }
    ],
    virus: [
      { step: "모으기", value: "바이러스" },
      { step: "쓰기", value: "약화·취약" },
      { step: "보완", value: "즉시 피해" }
    ],
    ward: [
      { step: "모으기", value: "방어" },
      { step: "쓰기", value: "반격" },
      { step: "보완", value: "마무리" }
    ],
    cycle: [
      { step: "모으기", value: "카드 뽑기" },
      { step: "쓰기", value: "보존·생성" },
      { step: "보완", value: "피해·방어" }
    ],
    risk: [
      { step: "모으기", value: "추가 에너지" },
      { step: "쓰기", value: "한 턴 폭발" },
      { step: "보완", value: "회복" }
    ]
  };
  return flows[axisId] ?? [
    { step: "모으기", value: "키워드" },
    { step: "쓰기", value: "핵심 카드" },
    { step: "보완", value: "빈 역할" }
  ];
}

function renderCardCatalogGroup(rarity, cards) {
  if (!cards.length) return "";
  return `
    <details class="catalog-group">
      <summary>
        <h3>${rarityLabel(rarity)}</h3>
        <span>${cards.length}장</span>
      </summary>
      <div class="catalog-grid card-catalog">
        ${cards.map((card) => renderCardCatalogItem(card)).join("")}
      </div>
    </details>
  `;
}

function renderCardCatalogItem(card) {
  const baseCard = { uid: `codex-${card.id}`, cardId: card.id, upgraded: false, temporary: false, costMod: 0 };
  const upgradedCard = { ...baseCard, uid: `codex-${card.id}-upgraded`, upgraded: true };
  const upgradeable = isUpgradeableCard(baseCard);
  return `
    <article class="catalog-card ${card.type} rarity-${card.rarity}">
      <div class="catalog-card-preview-pair">
        <div>
          <span>기본</span>
          ${renderCard(baseCard, { compact: true })}
        </div>
        <div class="${upgradeable ? "" : "muted"}">
          <span>${upgradeable ? "강화" : "강화 없음"}</span>
          ${upgradeable ? renderCard(upgradedCard, { compact: true }) : `<p class="catalog-no-upgrade">강화해도 달라지는 효과가 없습니다.</p>`}
        </div>
      </div>
      <div class="catalog-card-copy">
        <header>
          <span>${card.cost >= 90 ? "-" : card.cost}</span>
          <strong>${card.name}</strong>
          <em>${typeLabel(card.type)}</em>
        </header>
        <p>${card.text}</p>
        ${card.upgradedText ? `<p class="upgrade-text">강화: ${card.upgradedText}</p>` : ""}
        <div class="card-keywords">${(card.keywords ?? []).map((keyword) => `<span>${keywordLabel(keyword)}</span>`).join("")}</div>
      </div>
    </article>
  `;
}

function renderRelicCatalogGroup(rarity, relics) {
  if (!relics.length) return "";
  return `
    <details class="catalog-group">
      <summary>
        <h3>${rarityLabel(rarity)}</h3>
        <span>${relics.length}종</span>
      </summary>
      <div class="catalog-grid relic-catalog">
        ${relics
          .map(
            (relic) => `
              <article class="catalog-relic">
                ${renderRelic(relic.id)}
                <div>
                  <h4>${relic.name}</h4>
                  <strong>${relic.timing}</strong>
                  <p>${relic.text}</p>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </details>
  `;
}

function renderEnemyCatalogGroup(tier, enemies) {
  if (!enemies.length) return "";
  return `
    <details class="catalog-group">
      <summary>
        <h3>${tierLabel(tier)}</h3>
        <span>${enemies.length}종</span>
      </summary>
      <div class="catalog-grid enemy-catalog">
        ${enemies
          .map(
            (enemy) => `
              <article class="catalog-enemy">
                <header>
                  <h4>${enemy.name}</h4>
                  <span>${enemy.hp[0]}-${enemy.hp[1]} 체력</span>
                </header>
                <p>${enemy.description}</p>
                <ul>
                  ${enemy.moves
                    .map((move) => `<li><strong>${move.label}</strong><span>${move.intent}</span></li>`)
                    .join("")}
                </ul>
              </article>
            `
          )
          .join("")}
      </div>
    </details>
  `;
}

function renderCard(cardInstance, options = {}) {
  const card = effectiveCard(cardInstance);
  const preview = Boolean(options.compact && !options.action);
  const action = options.action ?? (preview ? "" : "play-card");
  const data = action ? `data-action="${action}" data-id="${options.id ?? cardInstance.uid}" data-card-id="${card.id}"` : `data-card-id="${card.id}"`;
  const hardDisabled = action && (options.hardDisabled === true || (action !== "play-card" && options.playable === false));
  const softDisabled = action === "play-card" && options.playable === false && !hardDisabled;
  const disabled = hardDisabled ? "disabled" : "";
  const ariaDisabled = softDisabled ? `aria-disabled="true"` : "";
  const draggable = action === "play-card" && options.playable !== false ? `draggable="true"` : "";
  const rarity = card.rarity === "starter" ? "common" : card.rarity;
  const cost = options.combat ? cardCost(cardInstance, options.combat) : card.cost;
  const tag = action ? "button" : "article";
  const rarityText = rarityLabel(card.rarity);
  const typeText = typeLabel(card.type);
  const upgradedText = cardInstance.upgraded ? "강화됨. " : "";
  const previewAttrs = action ? "" : `tabindex="0" aria-label="${card.name}. ${upgradedText}${rarityText} ${typeText}. ${card.text}"`;
  const playPreview = action === "play-card" && options.run ? cardPlayPreview(options.run, cardInstance) : null;
  const shortcutAttr = action === "play-card" && options.hotkey ? `aria-keyshortcuts="${options.hotkey}"` : "";
  const recommended = options.recommended === true;
  const disabledReason = options.disabledReason ?? "전하 부족";
  const energyClass = action === "play-card" ? (options.playable === false ? "energy-locked" : "energy-ready") : "";
  const recommendationLabel = recommended ? (options.recommendationLabel ?? (action === "play-card" ? "추천" : "")) : "";
  const actionAria = options.ariaLabel
    ? `aria-label="${options.ariaLabel}"`
    : action === "play-card"
      ? `aria-label="${cardPlayAriaLabel(card, cardInstance, cost, playPreview, recommended, options.playable !== false, disabledReason)}"`
      : "";
  const visibleKeywords = (card.keywords ?? []).slice(0, 2);
  const hiddenKeywordCount = Math.max(0, (card.keywords ?? []).length - visibleKeywords.length);
  return `
    <${tag} class="game-card ${card.type} rarity-${rarity} ${cardInstance.upgraded ? "upgraded" : ""} ${options.compact ? "compact" : ""} ${preview ? "preview" : ""} ${recommended ? "recommended" : ""} ${energyClass}" ${data} ${disabled} ${ariaDisabled} ${draggable} ${shortcutAttr} ${actionAria || previewAttrs}>
      <div class="card-cost">${cost >= 90 ? "-" : cost}</div>
      ${options.hotkey ? `<div class="card-hotkey" aria-hidden="true">${options.hotkey}</div>` : ""}
      ${recommendationLabel ? `<em class="card-recommendation">${recommendationLabel}</em>` : ""}
      ${cardInstance.upgraded ? `<span class="card-upgrade-mark" aria-hidden="true">+</span>` : ""}
      <div class="card-identity-strip" aria-hidden="true">
        <span class="card-identity-type" title="${typeText}"><b>${cardTypeIcon(card.type)}</b></span>
        <span class="card-identity-rarity" title="${rarityText}">${cardRarityGlyph(card.rarity)}</span>
      </div>
      ${renderCardArt(card)}
      <div class="card-meta">
        <span class="card-type-mark" title="${typeText}"><b aria-hidden="true">${cardTypeIcon(card.type)}</b><em>${typeText}${cardInstance.upgraded ? "+" : ""}</em></span>
        <span>${rarityText}</span>
      </div>
      <h3 class="card-name">${card.name}</h3>
      <p class="card-rules">${card.text}</p>
      <div class="card-keywords">
        ${visibleKeywords.map((keyword) => `<span>${keywordLabel(keyword)}</span>`).join("")}
        ${hiddenKeywordCount ? `<span>+${hiddenKeywordCount}</span>` : ""}
      </div>
      ${playPreview ? renderCardOutcome(playPreview) : ""}
      <div class="tooltip">
        <div class="tooltip-card-head">
          ${renderCardArt(card)}
          <span class="tooltip-card-copy">
            <strong>${card.name}${cardInstance.upgraded ? "+" : ""}</strong>
            <small class="tooltip-card-meta"><span><b>비용</b> ${cost >= 90 ? "-" : cost}</span><span><b>종류</b> ${typeText}</span><span><b>희귀도</b> ${rarityText}</span></small>
          </span>
        </div>
        <p class="tooltip-rules">${card.text}</p>
        ${playPreview ? renderCardTooltipPreview(playPreview) : ""}
        <div class="tooltip-keywords">
          ${(card.keywords ?? [])
            .map((keyword) => `<small><b>${keywordLabel(keyword)}</b><span> ${keywordTooltipDescription(keyword)}</span></small>`)
            .join("")}
        </div>
      </div>
    </${tag}>
  `;
}

function cardPlayAriaLabel(card, cardInstance, cost, preview, recommended = false, playable = true, disabledReason = "전하 부족") {
  const parts = [
    `${card.name}${cardInstance.upgraded ? "+" : ""}`,
    `비용 ${cost >= 90 ? "사용 불가" : cost}`,
    `${rarityLabel(card.rarity)} ${typeLabel(card.type)}`
  ];
  if (recommended) parts.push("추천 카드");
  parts.push(playable ? "사용 가능" : disabledReason);
  if (preview) parts.push(cardPreviewAriaSummary(preview));
  parts.push(card.text);
  return parts.filter(Boolean).join(". ");
}

function cardPreviewAriaSummary(preview) {
  const chips = cardPreviewChips(preview).slice(0, 3);
  if (!chips.length) return "";
  return `이번 사용: ${chips.map((chip) => chip.label).join(", ")}`;
}

function cardTypeIcon(type) {
  return {
    attack: "✦",
    skill: "⬡",
    power: "◆",
    status: "◎",
    curse: "!"
  }[type] ?? "•";
}

function cardRarityGlyph(rarity) {
  return {
    starter: "•",
    common: "•",
    uncommon: "••",
    rare: "★",
    special: "◆",
    curse: "!"
  }[rarity] ?? "•";
}

function handHotkeyLabel(index) {
  if (index < 0 || index > 9) return "";
  return index === 9 ? "0" : String(index + 1);
}

function renderCardOutcome(preview) {
  const chips = cardPreviewChips(preview).slice(0, 2);
  if (!chips.length) return "";
  const aria = chips.map((chip) => chip.label).join(", ");
  const secondaryClass = chips.length > 1 ? " has-secondary" : "";
  return `
    <div class="card-outcome${secondaryClass}" aria-label="사용 결과 미리보기: ${aria}">
      ${chips
        .map((chip, index) => {
          const visual = cardOutcomeVisual(chip);
          return `<span class="${chip.tone}${index === 0 ? " primary" : ""}" title="${chip.label}"><b aria-hidden="true">${visual.icon}</b><em>${cardCompactOutcomeText(chip, visual)}</em><small class="sr-only">${chip.label}</small></span>`;
        })
        .join("")}
    </div>
  `;
}

function cardOutcomeText(chip, visual) {
  const value = String(visual?.value ?? "").trim();
  if (value) return value;
  const label = String(chip?.label ?? "").trim();
  const number = label.match(/[+-]?\d+/)?.[0];
  return number ?? "•";
}

function cardOutcomeVisual(chip) {
  const label = chip?.label ?? "";
  const tone = chip?.tone ?? "steady";
  const number = label.match(/[+-]?\d+/)?.[0] ?? "";
  if (/처치/.test(label)) return { icon: "✕", value: number || "끝" };
  if (/연타|×/.test(label)) return { icon: "×", value: number ? String(Math.abs(Number(number))) : "×" };
  if (/피해|체력 -|방어 -/.test(label)) return { icon: "✦", value: number ? `-${Math.abs(Number(number))}` : "×" };
  if (/방어/.test(label)) return { icon: "⬡", value: number ? `+${Math.abs(Number(number))}` : "+" };
  if (/뽑기/.test(label)) return { icon: "▤", value: number ? `+${Math.abs(Number(number))}` : "+" };
  if (/에너지|전하/.test(label)) return { icon: "⚡", value: signedVisualValue(label, number) || "+" };
  if (/회복|정화/.test(label)) return { icon: "+", value: number ? `+${Math.abs(Number(number))}` : "+" };
  if (/생성|강화|비용|버림|소멸/.test(label)) return { icon: "◇", value: number ? signedVisualValue(label, number) || number : "•" };
  if (/약화|취약|바이러스|표식|집중|상태/.test(label) || tone === "status") return { icon: "◎", value: number ? signedVisualValue(label, number) || number : "!" };
  if (tone === "warn") return { icon: "!", value: number ? `-${Math.abs(Number(number))}` : "!" };
  if (tone === "relic") return { icon: "◆", value: number || "•" };
  return { icon: "•", value: number || "•" };
}

function signedVisualValue(label, number) {
  if (!number) return "";
  const absolute = Math.abs(Number(number));
  if (label.includes("-")) return `-${absolute}`;
  if (label.includes("+")) return `+${absolute}`;
  return String(absolute);
}

function renderCardTooltipPreview(preview) {
  const chips = cardPreviewChips(preview);
  if (!chips.length) return "";
  const visibleChips = chips.slice(0, 4);
  const hiddenChipCount = Math.max(0, chips.length - visibleChips.length);
  const target = cardPreviewTargetText(preview);
  return `
    <div class="tooltip-preview">
      <strong>이번 사용</strong>
      <small class="tooltip-preview-summary">${target.replace(/^대상: /, "대상 ")} · 사용 후 ⚡${Math.max(0, preview.energyAfter)}</small>
      <div>
        ${visibleChips
          .map((chip) => {
            const visual = cardOutcomeVisual(chip);
            return `<span class="${chip.tone}" title="${chip.label}"><b aria-hidden="true">${visual.icon}</b><em>${cardTooltipChipText(chip, visual)}</em></span>`;
          })
          .join("")}
        ${hiddenChipCount ? `<span class="control">+${hiddenChipCount}</span>` : ""}
      </div>
    </div>
  `;
}

function cardTooltipChipText(chip, visual) {
  let chipText = String(chip?.label ?? "").replace(/\s+/g, " ").trim();
  if (!chipText) return cardOutcomeText(chip, visual);
  if (chipText.startsWith("광역 ")) chipText = `전체 ${chipText.slice(3)}`;
  if (chipText.startsWith("잔향 x")) chipText = `잔향 ×${chipText.slice(4)}`;
  return chipText
    .replace(/ · /g, " / ");
}

function cardPreviewTargetText(preview) {
  const hitsEnemy =
    preview.damage > 0 ||
    preview.blockedDamage > 0 ||
    preview.statuses?.some((status) => status.scope === "enemy" || status.scope === "allEnemies");
  if (preview.targetMode === "all" || preview.statuses?.some((status) => status.scope === "allEnemies")) return "대상: 모든 적";
  if (hitsEnemy && preview.targetName) return `대상: ${preview.targetName}`;
  if (combatPreviewAffectsSelf(preview)) return "대상: 나";
  return preview.targetName ? `대상: ${preview.targetName}` : "대상 없음";
}

function cardPreviewChips(preview) {
  const chips = [];
  for (const warning of preview.warnings ?? []) chips.push({ label: warning, tone: "warn" });
  if (preview.repeats > 1) chips.push({ label: `잔향 x${preview.repeats}`, tone: "relic" });
  if (preview.damage > 0 || preview.blockedDamage > 0) {
    const prefix = preview.targetMode === "all" ? "광역 " : "";
    const label = preview.damage > 0 ? `${prefix}피해 ${preview.damage}${preview.blockedDamage ? ` · 방어 -${preview.blockedDamage}` : ""}` : `${prefix}방어 -${preview.blockedDamage}`;
    chips.push({ label, tone: "damage" });
  }
  if (preview.block > 0) chips.push({ label: `방어 +${preview.block}`, tone: "block" });
  if (preview.draw > 0) chips.push({ label: `뽑기 +${preview.draw}`, tone: "resource" });
  if (preview.charge > 0) chips.push({ label: `전하 +${preview.charge}`, tone: "resource" });
  if (preview.chargeSpent > 0) chips.push({ label: `전하 -${preview.chargeSpent}`, tone: "resource" });
  if (preview.energyDelta !== -preview.cost) chips.push({ label: `에너지 ${signed(preview.energyDelta)}`, tone: "resource" });
  if (preview.focus > 0) chips.push({ label: `집중 +${preview.focus}`, tone: "status" });
  for (const status of aggregatePreviewStatuses(preview.statuses).slice(0, 3)) {
    chips.push({ label: `${status.scopeLabel} ${keywordLabel(status.status)} ${signed(status.amount)}`, tone: status.amount > 0 ? "status" : "warn" });
  }
  if (preview.generated > 0) chips.push({ label: `생성 ${preview.generated}장`, tone: "resource" });
  if (preview.discarded > 0) chips.push({ label: `버림 ${preview.discarded}장`, tone: "resource" });
  if (preview.exhausted > 0) chips.push({ label: `소멸 ${preview.exhausted}장`, tone: "resource" });
  if (preview.upgraded > 0) chips.push({ label: `강화 ${preview.upgraded}장`, tone: "resource" });
  if (preview.discounted > 0) chips.push({ label: `비용 감소 ${preview.discounted}장`, tone: "resource" });
  if (preview.cleansed > 0) chips.push({ label: `정화 ${preview.cleansed}`, tone: "block" });
  if (preview.heal > 0) chips.push({ label: `회복 +${preview.heal}`, tone: "block" });
  if (preview.hpLoss > 0) chips.push({ label: `체력 -${preview.hpLoss}`, tone: "warn" });
  if (preview.gold > 0) chips.push({ label: `크레딧 +${preview.gold}`, tone: "resource" });
  if (preview.maxEnergy > 0) chips.push({ label: `최대 에너지 +${preview.maxEnergy}`, tone: "resource" });
  if (preview.maxHpLoss > 0) chips.push({ label: `최대 체력 -${preview.maxHpLoss}`, tone: "warn" });
  for (const condition of preview.conditions ?? []) chips.push({ label: conditionLabel(condition), tone: condition.met ? "status" : "warn" });
  for (const relicId of preview.relics ?? []) chips.push({ label: `유물: ${RELIC_BY_ID[relicId]?.name ?? relicId}`, tone: "relic" });
  return chips;
}

function aggregatePreviewStatuses(statuses = []) {
  const labels = { self: "자신", enemy: "대상", allEnemies: "모든 적" };
  const totals = new Map();
  for (const item of statuses) {
    const key = `${item.scope}:${item.status}`;
    const current = totals.get(key) ?? { scope: item.scope, scopeLabel: labels[item.scope] ?? "대상", status: item.status, amount: 0 };
    current.amount += item.amount;
    totals.set(key, current);
  }
  return [...totals.values()].filter((item) => item.amount !== 0);
}

function conditionLabel(condition) {
  if (condition.type === "enemyStatus") return `${keywordLabel(condition.status)} 조건 ${condition.met ? "충족" : "미충족"}`;
  if (condition.type === "playerBlock") return `방어 조건 ${condition.met ? "충족" : "미충족"}`;
  if (condition.type === "attackCount") return `${condition.count}번째 공격 ${condition.met ? "충족" : "아직"}`;
  return condition.met ? "조건 충족" : "조건 미충족";
}

function signed(value) {
  return value > 0 ? `+${value}` : `${value}`;
}

function renderCardArt(card) {
  const seed = visualSeed(`${card.id}:${card.art}:${card.name}`);
  const motif = cardArtMotif(card);
  const atlasCell = cardArtAtlasCell(card, motif, seed);
  const sigilCell = cardArtSigilCell(card, motif);
  return `
    <div class="card-art art-${card.art} motif-${motif}" data-art-id="${card.id}" data-art-key="${card.art}" data-art-signature="${cardArtSignature(card, seed)}" data-atlas-cell="${atlasCell}" data-sigil-cell="${sigilCell}" style="${cardArtStyle(card, seed, atlasCell, sigilCell)}" aria-hidden="true">
      <span class="card-art-image"></span>
      <span class="card-art-depth"></span>
      <span class="card-art-sigil"></span>
    </div>
  `;
}

function cardArtMotif(card) {
  const keywords = new Set(card.keywords ?? []);
  if (card.type === "curse") return "curse";
  if (keywords.has("virus") || keywords.has("vulnerable") || keywords.has("weak")) return "virus";
  if (keywords.has("charge") || keywords.has("focus")) return "charge";
  if (keywords.has("block") || keywords.has("counter") || keywords.has("plated")) return "ward";
  if (keywords.has("exhaust") || keywords.has("temporary") || keywords.has("retain")) return "cycle";
  if (card.type === "power") return "power";
  if (card.type === "attack") return "strike";
  return "tide";
}

function cardArtSignature(card, seed) {
  return `${card.art}-${card.type}-${seed.toString(36).slice(0, 5)}`;
}

function cardArtAtlasCell(card, motif, seed) {
  if (CARD_ILLUSTRATION_CELLS[card.art]) return card.art;
  if (CARD_ART_EXACT_ATLAS[card.art]) return CARD_ART_EXACT_ATLAS[card.art];
  const candidates = CARD_ART_ATLAS_MOTIFS[motif] ?? CARD_ART_ATLAS_FALLBACK;
  const offset = card.rarity === "rare" ? 1 : card.type === "curse" ? 2 : 0;
  return candidates[(seed + offset) % candidates.length] ?? CARD_ART_ATLAS_FALLBACK[seed % CARD_ART_ATLAS_FALLBACK.length];
}

function cardArtSigilCell(card, motif) {
  const priority = ["power", "charge", "focus", "virus", "mark", "block", "counter", "plated", "temporary", "exhaust", "retain", "weak", "vulnerable", "frail", "damage"];
  for (const keyword of priority) {
    if (card.keywords?.includes(keyword) && CARD_ART_SIGIL_CELLS[keyword]) return CARD_ART_SIGIL_CELLS[keyword];
  }
  if (card.type === "curse") return "statusSkull";
  if (card.type === "attack") return "cardStrike";
  if (card.type === "power") return "cardPower";
  if (motif === "ward") return "cardWard";
  if (motif === "cycle") return "statusHourglass";
  return "cardDiver";
}

function cardArtStyle(card, seed, atlasCell, sigilCell) {
  const baseHue = CARD_ART_TYPE_HUES[card.type] ?? 188;
  const hue = wrapHue(baseHue + (seed % 56) - 28);
  const accent = wrapHue(hue + 34 + ((seed >>> 7) % 62));
  const x = 18 + ((seed >>> 3) % 64);
  const y = 16 + ((seed >>> 9) % 60);
  const tilt = -24 + ((seed >>> 15) % 49);
  const scale = 0.86 + (((seed >>> 21) % 18) / 100);
  const atlas = cardIllustrationPosition(atlasCell);
  const sigil = atlasPosition(sigilCell);
  const sigilRotate = ((seed >>> 19) % 13) - 6;
  return `--art-hue:${hue}; --art-accent:${accent}; --art-x:${x}%; --art-y:${y}%; --art-tilt:${tilt}deg; --art-scale:${scale}; --art-atlas-x:${atlas.x}; --art-atlas-y:${atlas.y}; --sigil-atlas-x:${sigil.x}; --sigil-atlas-y:${sigil.y}; --sigil-rotate:${sigilRotate}deg;`;
}

function cardIllustrationPosition(cellName) {
  const [column, row] = CARD_ILLUSTRATION_CELLS[cellName] ?? CARD_ILLUSTRATION_CELLS.lance ?? [0, 0];
  const x = CARD_ART_ATLAS_COLUMNS <= 1 ? 0 : (column / (CARD_ART_ATLAS_COLUMNS - 1)) * 100;
  const y = CARD_ART_ATLAS_ROWS <= 1 ? 0 : (row / (CARD_ART_ATLAS_ROWS - 1)) * 100;
  return { x: `${Number(x.toFixed(4))}%`, y: `${Number(y.toFixed(4))}%` };
}

function rewardDeckShift(run, cardId) {
  const card = effectiveCard({ cardId, upgraded: false });
  const previewCard = { uid: `preview-${cardId}`, cardId, upgraded: false, temporary: false, costMod: 0 };
  const before = deckAnalysis(run);
  const afterRun = { ...run, player: { ...run.player, deck: [...run.player.deck, previewCard] } };
  const after = deckAnalysis(afterRun);
  const insight = rewardCardInsight(run, cardId);
  const concept = conceptForCard(card, run);
  const beforeAxis = rewardAxisShortLabel(before.primary);
  const afterAxis = rewardAxisShortLabel(after.primary.score > 0 ? after.primary : concept);
  const beforeHasAxis = before.primary.score > 0;
  const beforeCost = averageDeckCost(run.player.deck);
  const afterCost = averageDeckCost(afterRun.player.deck);
  const beforeCostText = beforeCost.toFixed(1);
  const afterCostText = afterCost.toFixed(1);
  const duplicateCount = run.player.deck.filter((item) => item.cardId === cardId).length;
  const roleLabel = rewardCardRoleLabel(card);
  const axisChanged = before.primary.score > 0 && after.primary.score > 0 && before.primary.id !== after.primary.id;
  const reinforcesAxis = concept?.id && before.primary.score > 0 && concept.id === before.primary.id;
  let tone = insight.tone === "warning" ? "warning" : "steady";
  let title = "선택지 추가";
  let detail = `${roleLabel} 역할을 한 장 보탭니다.`;

  if (duplicateCount >= 2 && insight.tone === "warning") {
    tone = "warning";
    title = "중복 확인";
    detail = `${withSubjectParticle(card.name)} ${duplicateCount + 1}장째입니다. 정말 필요한 역할인지 한 번 더 보세요.`;
  } else if (!beforeHasAxis && concept) {
    tone = "pivot";
    title = "첫 방향 제안";
    detail = `${afterAxis} 쪽으로 덱의 첫 축을 만들 수 있습니다.`;
  } else if (axisChanged && concept) {
    tone = "pivot";
    title = "새 방향 열기";
    detail = `${beforeAxis}에 더해 ${afterAxis}도 노릴 수 있습니다.`;
  } else if (insight.tone === "strong" || reinforcesAxis) {
    tone = "strong";
    title = "주력 강화";
    detail = `${afterAxis} 쪽 선택을 더 선명하게 만듭니다.`;
  } else if (afterCost > beforeCost + 0.25) {
    tone = "warning";
    title = "비용 확인";
    detail = `${afterAxis}에 보탬은 있지만 손패가 조금 무거워집니다.`;
  } else if (insight.tone === "pivot" || card.cost === 0 || cardSupportsFlow(card)) {
    tone = "pivot";
    title = "템포 확보";
    detail = `${roleLabel} 역할을 가볍게 추가합니다.`;
  } else if (["마무리 보강", "방어 보강", "정화·약화 보강", "카드 찾기 보강"].includes(insight.label)) {
    tone = "strong";
    title = "빈 역할 보강";
    detail = insight.detail.split(".")[0] + ".";
  }

  const costTone = afterCost > beforeCost + 0.25 ? "warn" : afterCost < beforeCost - 0.15 ? "strong" : "steady";
  const sizeTone = after.total >= 26 ? "warn" : "steady";
  const duplicateTone = duplicateCount >= 2 ? "warn" : duplicateCount === 0 ? "strong" : "steady";
  return {
    cardName: card.name,
    tone,
    title,
    detail,
    beforeAxis,
    afterAxis,
    beforeSize: before.total,
    afterSize: after.total,
    beforeCostText,
    afterCostText,
    chips: [
      { tone: sizeTone, label: `${before.total}→${after.total}장` },
      { tone: costTone, label: `비용 ${beforeCostText}→${afterCostText}` },
      { tone: duplicateTone, label: duplicateCount ? `${duplicateCount + 1}장째` : roleLabel }
    ]
  };
}

function rewardAxisShortLabel(axis) {
  if (!axis?.id || axis.score <= 0) return "방향 탐색";
  return {
    charge: "전하 모아 쓰기",
    mark: "표식 연타",
    virus: "바이러스 운영",
    ward: "막고 반격",
    cycle: "카드 다시 쓰기",
    risk: "체력 내고 행동"
  }[axis.id] ?? axis.label ?? "방향 탐색";
}

function rewardCardRoleLabel(card) {
  if (cardCoversBossDefensePair(card)) return "방어 묶음";
  if (cardSupportsBurstDefense(card)) return "큰 방어";
  if (cardSupportsSustainedDefense(card)) return "연속 방어";
  if (cardSupportsStatusControl(card)) return "상태 관리";
  if (cardSupportsDefense(card)) return "방어";
  if (cardSupportsFlow(card)) return "카드 찾기";
  if (cardSupportsFinish(card)) return "마무리";
  if (card.type === "power") return "지속 효과";
  return typeLabel(card.type);
}

function rewardCardInsight(run, cardId) {
  const card = effectiveCard({ cardId, upgraded: false });
  const analysis = deckAnalysis(run);
  const deckCounts = deckKeywordCounts(run);
  const matchingKeywords = (card.keywords ?? [])
    .filter((keyword) => (deckCounts.get(keyword) ?? 0) > 0)
    .sort((left, right) => (deckCounts.get(right) ?? 0) - (deckCounts.get(left) ?? 0));
  const relicHint = RELIC_SYNERGY_HINTS.find((hint) => run.player.relics.includes(hint.id) && hint.keywords.some((keyword) => card.keywords?.includes(keyword)));
  const concept = conceptForCard(card, run);
  const axis = buildAxisForCard(card, concept);
  const keywordScore = matchingKeywords.reduce((total, keyword) => total + Math.min(3, deckCounts.get(keyword) ?? 0), 0);
  const score = keywordScore + (relicHint ? 2 : 0);
  const duplicateCount = run.player.deck.filter((item) => item.cardId === cardId).length;
  const roleNeed = rewardRoleNeed(run, card);

  if (score >= 5) {
    return addConcept({
      tone: "strong",
      label: "강하게 맞물림",
      detail: `${matchingKeywords.slice(0, 2).map(keywordLabel).join(", ")} 카드가 많습니다. ${relicHint?.text ?? axis}`
    }, concept);
  }
  if (matchingKeywords.length > 0 && score >= 2) {
    return addConcept({
      tone: "steady",
      label: "현재 덱에 맞음",
      detail: `${matchingKeywords.slice(0, 2).map(keywordLabel).join(", ")} 카드와 함께 쓰기 좋습니다. ${relicHint?.text ?? axis}`
    }, concept);
  }
  if (relicHint) {
    return addConcept({
      tone: "relic",
      label: "보유 유물에 맞음",
      detail: relicHint.text
    }, concept);
  }
  if (roleNeed) {
    return addConcept({
      tone: "strong",
      label: roleNeed.label,
      detail: `${roleNeed.detail} ${axis}`
    }, concept);
  }
  if (analysis.total >= 24 && score < 2 && card.rarity !== "rare") {
    return addConcept({
      tone: "warning",
      label: "받지 않기와 비교",
      detail: `${axis} 지금 덱과 맞지 않으면 ${analysis.total + 1}장 덱은 무겁습니다.`
    }, concept);
  }
  if (duplicateCount >= 2 && score < 4) {
    return addConcept({
      tone: "warning",
      label: "중복 주의",
      detail: `${card.name} ${duplicateCount}장 보유. 같은 역할이 충분하면 받지 않기도 좋습니다.`
    }, concept);
  }
  if (card.rarity === "rare") {
    return addConcept({
      tone: "pivot",
      label: "새 방향 후보",
      detail: `${axis} 희귀 카드라 주력을 바꿀 수 있습니다.`
    }, concept);
  }
  if (card.cost === 0) {
    return addConcept({
      tone: "pivot",
      label: "가벼운 선택",
      detail: `${axis} 비용 0이라 손패 정리에 부담이 적습니다.`
    }, concept);
  }
  return addConcept({
    tone: "neutral",
    label: "새 도구",
    detail: `${axis} 비어 있는 역할이면 선택 가치가 있습니다.`
  }, concept);
}

function rewardRoleNeed(run, card) {
  const bossNeed = rewardBossPreparationNeed(run, card);
  if (bossNeed) return bossNeed;
  const cards = run.player.deck.map(effectiveCard);
  const attacks = cards.filter((item) => item.type === "attack").length;
  const skills = cards.filter((item) => item.type === "skill").length;
  const finishers = cards.filter(cardSupportsFinish).length;
  const defenses = cards.filter(cardSupportsDefense).length;
  const cleaners = cards.filter(cardSupportsStatusControl).length;
  const flow = cards.filter(cardSupportsFlow).length;
  if (card.type === "attack" && (attacks < 4 || finishers < 5)) {
    return { label: "마무리 보강", detail: "엘리트와 보스를 끝낼 공격이 부족합니다." };
  }
  if (card.type === "skill" && defenses < 4 && cardSupportsDefense(card)) {
    return { label: "방어 보강", detail: "큰 공격 턴을 넘길 방어가 부족합니다." };
  }
  if (cardSupportsStatusControl(card) && cleaners < 2) {
    return { label: "정화·약화 보강", detail: "바이러스와 취약이 쌓이는 전투에 대비합니다." };
  }
  if (cardSupportsFlow(card) && flow < 3) {
    return { label: "카드 찾기 보강", detail: "핵심 카드를 더 빨리 다시 봅니다." };
  }
  return null;
}

function rewardBossPreparationNeed(run, card) {
  const readiness = runProgressBrief(run).readiness;
  const weak = new Set(
    readiness?.metrics
      ?.filter((metric) => metric.tone === "danger" || metric.tone === "warning")
      .map((metric) => metric.label) ?? []
  );
  if (!weak.size) return null;
  if (weak.has("큰 방어") && weak.has("연속 방어") && cardCoversBossDefensePair(card)) {
    return { label: "보스 대비 방어 묶음", detail: "문 낙하를 막고 레퀴엠까지 이어 받을 큰 방어와 보존 방어를 함께 보탭니다.", scoreBonus: 30 };
  }
  if (weak.has("연속 방어") && cardSupportsSustainedDefense(card)) {
    return { label: "보스 대비 연속 방어", detail: "문 낙하 뒤 레퀴엠까지 이어 받을 보존, 도금, 가벼운 방어 수단입니다.", scoreBonus: 24 };
  }
  if (weak.has("큰 방어") && cardSupportsBurstDefense(card)) {
    return { label: "보스 대비 큰 방어", detail: "문 낙하와 레퀴엠을 넘길 방어, 약화, 도금 수단입니다.", scoreBonus: 20 };
  }
  if (weak.has("정화·약화") && cardSupportsStatusControl(card)) {
    return { label: "보스 대비 정화", detail: "다가오는 보스가 해로운 상태를 많이 남깁니다.", scoreBonus: 16 };
  }
  if (weak.has("방어") && cardSupportsDefense(card)) {
    return { label: "보스 대비 방어", detail: "큰 공격 턴을 버틸 방어 카드가 부족합니다.", scoreBonus: 14 };
  }
  if (weak.has("마무리") && cardSupportsFinish(card)) {
    return { label: "보스 마무리 보강", detail: "보스 체력을 끝낼 피해 수단이 부족합니다.", scoreBonus: 12 };
  }
  if (weak.has("카드 뽑기") && cardSupportsFlow(card)) {
    return { label: "보스전 카드 찾기", detail: "필요한 카드를 다시 볼 수단이 부족합니다.", scoreBonus: 8 };
  }
  return null;
}

function rewardComparisonChips(run, cardId) {
  const card = effectiveCard({ cardId, upgraded: false });
  const deck = run.player.deck;
  const beforeCost = averageDeckCost(deck);
  const afterCost = averageDeckCost([...deck, { uid: -1, cardId, upgraded: false, temporary: false, costMod: 0 }]);
  const duplicateCount = deck.filter((item) => item.cardId === cardId).length;
  const typeCount = deck.filter((item) => effectiveCard(item).type === card.type).length;
  const roleTone = typeCount <= 2 ? "strong" : typeCount >= 8 ? "warn" : "steady";
  const beforeCostText = beforeCost.toFixed(1);
  const afterCostText = afterCost.toFixed(1);
  const costLabel = beforeCostText === afterCostText ? `비용 ${beforeCostText} 유지` : `비용 ${beforeCostText}→${afterCostText}`;
  return [
    { tone: "steady", label: `덱 +1장` },
    { tone: afterCost > beforeCost + 0.25 ? "warn" : afterCost < beforeCost - 0.15 ? "strong" : "steady", label: costLabel },
    { tone: duplicateCount > 1 ? "warn" : duplicateCount === 1 ? "steady" : "strong", label: duplicateCount ? `중복 ${duplicateCount + 1}` : "신규" },
    { tone: roleTone, label: `${typeLabel(card.type)} +1` }
  ];
}

function rewardTakeVsSkip(run, cardId) {
  const card = effectiveCard({ cardId, upgraded: false });
  const insight = rewardCardInsight(run, cardId);
  const shift = rewardDeckShift(run, cardId);
  const skip = skipRewardInsight(run);
  const score = rewardCardRecommendationScore(run, cardId);
  const scoreTone = score >= 76 ? "strong" : score < 54 ? "warn" : "steady";
  const skipTone = ["strong", "warning"].includes(skip.tone) ? "warn" : "steady";
  const sizeTone = shift.afterSize >= 26 ? "warn" : "steady";
  const chips = [
    { tone: scoreTone, label: `선택 ${Math.round(score)}` },
    { tone: skipTone, label: rewardSkipCompactLabel(skip) },
    { tone: sizeTone, label: `덱 ${shift.beforeSize}→${shift.afterSize}` }
  ];
  const roleLabel = rewardCardRoleLabel(card);
  const skipShort = skipInsightShortDetail(skip);

  if (skip.tone === "strong" && score < 76) {
    return {
      tone: "warning",
      title: "스킵과 먼저 비교",
      detail: `${skipShort} ${roleLabel} 역할이 확실하지 않으면 덱 +1장은 부담입니다.`,
      chips
    };
  }
  if (skip.tone === "warning" && score < 66) {
    return {
      tone: "warning",
      title: "저주와 덱 부담 확인",
      detail: `${skipShort} 이 카드가 바로 쓰일 때만 받는 편이 안전합니다.`,
      chips
    };
  }
  if (insight.tone === "strong" || score >= 82) {
    return {
      tone: "strong",
      title: "받을 이유가 더 큼",
      detail: `${rewardInsightShortLabel(insight)}라서 덱 ${shift.afterSize}장 부담을 이깁니다.`,
      chips
    };
  }
  if (shift.tone === "warning") {
    return {
      tone: "warning",
      title: "비용과 중복 확인",
      detail: `${shift.detail} 지금 손패가 무겁다면 넘기는 선택도 봅니다.`,
      chips
    };
  }
  if (skip.tone === "pivot") {
    return {
      tone: "pivot",
      title: "주력 정하기 후보",
      detail: `${rewardConceptPhrase(insight.concept?.label ?? roleLabel)}을 밀 계획이면 받습니다.`,
      chips
    };
  }
  return {
    tone: "steady",
    title: "역할을 채우면 선택",
    detail: `${skipShort} 그래도 ${roleLabel} 역할이 비었으면 받을 만합니다.`,
    chips
  };
}

function rewardSkipCompactLabel(insight) {
  if (insight.tone === "strong") return "스킵 유리";
  if (insight.tone === "warning") return "스킵 주의";
  if (insight.tone === "steady") return "스킵 가능";
  return "스킵 낮음";
}

function rewardRecommendedCardId(run) {
  const cards = run.reward?.cards ?? [];
  let best = { cardId: null, score: -Infinity };
  for (const cardId of cards) {
    const score = rewardCardRecommendationScore(run, cardId);
    if (score > best.score) best = { cardId, score };
  }
  const skip = skipRewardInsight(run);
  if (skip.tone === "strong" && best.score < 76) return null;
  if (skip.tone === "warning" && best.score < 66) return null;
  return best.cardId;
}

function rewardCardRecommendationScore(run, cardId) {
  const card = effectiveCard({ cardId, upgraded: false });
  const insight = rewardCardInsight(run, cardId);
  const chips = rewardComparisonChips(run, cardId);
  const bossNeed = rewardBossPreparationNeed(run, card);
  const toneScore = { strong: 82, steady: 66, relic: 64, pivot: 58, neutral: 34, warning: 16 };
  let score = toneScore[insight.tone] ?? 30;
  if (bossNeed) score += bossNeed.scoreBonus ?? 0;
  if (card.rarity === "rare") score += 7;
  if (card.cost === 0) score += 4;
  for (const chip of chips) {
    if (chip.tone === "strong") score += 7;
    if (chip.tone === "warn") score -= 7;
  }
  const duplicateCount = run.player.deck.filter((item) => item.cardId === cardId).length;
  if (duplicateCount >= 2) score -= 10;
  return score;
}

function rewardSkipRecommended(run, recommendedCardId) {
  if (recommendedCardId) return false;
  return ["strong", "warning"].includes(skipRewardInsight(run).tone);
}

function rewardRecommendedRelicId(run, choices = rewardRelicChoices(run.reward)) {
  let best = { relicId: null, score: -Infinity };
  for (const relicId of choices) {
    const score = rewardRelicRecommendationScore(run, relicId);
    if (score > best.score) best = { relicId, score };
  }
  return best.relicId;
}

function rewardRelicRecommendationScore(run, relicId) {
  const insight = rewardRelicInsight(run, relicId);
  const toneScore = { strong: 86, steady: 68, combat: 62, economy: 58, passive: 50, relic: 64, pivot: 56 };
  let score = toneScore[insight.tone] ?? 44;
  const relic = RELIC_BY_ID[relicId];
  if (/전투 시작|턴 시작|카드 사용/.test(relic?.timing ?? "")) score += 5;
  if (insight.concept) score += 3;
  return score;
}

function rewardRelicChoices(reward) {
  return reward?.relicChoices?.length ? reward.relicChoices : [];
}

function rewardRelicInsight(run, relicId) {
  const relic = RELIC_BY_ID[relicId];
  const timingTone = relicTimingTone(relic?.timing);
  const link = relicRunInsight(relicId, run);
  const hint = RELIC_SYNERGY_HINTS.find((entry) => entry.id === relicId);
  const concept = conceptForRelic(relicId, run);
  const deckMatches = hint
    ? run.player.deck.filter((cardInstance) => {
        const card = effectiveCard(cardInstance);
        return hint.keywords.some((keyword) => card.keywords?.includes(keyword));
      }).length
    : 0;
  if (deckMatches >= 3) {
    return addConcept({
      tone: "strong",
      label: "현재 핵심 카드와 잘 맞음",
      detail: link
    }, concept);
  }
  if (deckMatches > 0) {
    return addConcept({
      tone: "steady",
      label: "현재 덱에 맞음",
      detail: link
    }, concept);
  }
  if (timingTone === "economy") {
    return addConcept({
      tone: "economy",
      label: "장기 성장",
      detail: `${relic.timing} 시점에 크레딧, 보상, 정비 선택을 넓힙니다.`
    }, concept);
  }
  if (timingTone === "combat") {
    return addConcept({
      tone: "combat",
      label: "선택지 변화",
      detail: `${relic.timing} 시점에 카드 선택을 바꿉니다. ${link}`
    }, concept);
  }
  return addConcept({
    tone: "passive",
    label: "새 승리 수단",
    detail: link || "현재 덱에 없는 역할을 열어 다음 보상 선택의 가치를 바꿉니다."
  }, concept);
}

function skipRewardInsight(run) {
  const analysis = deckAnalysis(run);
  if (analysis.total >= 26) {
    return {
      tone: "strong",
      label: "이번엔 받지 않아도 좋음",
      detail: `현재 ${analysis.total}장 덱입니다. 보상을 받지 않으면 핵심 카드를 더 자주 뽑고 제거 가치도 올라갑니다.`
    };
  }
  if (analysis.curses > 0) {
    return {
      tone: "warning",
      label: "확장 주의",
      detail: `저주 ${analysis.curses}장이 있어 불필요한 카드를 더하면 핵심 카드를 늦게 봅니다.`
    };
  }
  if (analysis.primary.score >= 5) {
    return {
      tone: "steady",
      label: "지금 덱 유지",
      detail: `${analysis.primary.label} 카드가 보입니다. 지금 덱에 보태지지 않으면 받지 않는 것도 좋은 선택입니다.`
    };
  }
  return {
    tone: "pivot",
    label: "주력 정하기",
    detail: "전하, 표식, 바이러스, 반격 중 하나를 골라 같은 키워드가 붙은 보상을 이어서 고르세요."
  };
}

function averageDeckCost(cardInstances) {
  const costs = cardInstances.map((item) => effectiveCard(item).cost).filter((cost) => cost < 90);
  if (!costs.length) return 0;
  return costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
}

function deckKeywordCounts(run) {
  const counts = new Map();
  for (const cardInstance of run.player.deck) {
    const card = effectiveCard(cardInstance);
    counts.set(card.type, (counts.get(card.type) ?? 0) + 1);
    for (const keyword of card.keywords ?? []) counts.set(keyword, (counts.get(keyword) ?? 0) + 1);
  }
  return counts;
}

function buildAxisForCard(card, concept = conceptForCard(card)) {
  if (concept) return concept.detail;
  const keywords = new Set(card.keywords ?? []);
  if (keywords.has("charge") || keywords.has("focus")) return "전하로 큰 턴을 만듭니다.";
  if (keywords.has("virus")) return "바이러스로 매 턴 체력을 깎습니다.";
  if (keywords.has("mark")) return "표식 뒤 연타 피해를 키웁니다.";
  if (keywords.has("block") || keywords.has("counter") || keywords.has("plated")) return "막고 되받는 힘을 보탭니다.";
  if (keywords.has("exhaust") || keywords.has("temporary") || keywords.has("retain")) return "필요한 카드를 다시 찾습니다.";
  if (keywords.has("weak") || keywords.has("vulnerable") || keywords.has("frail")) return "적의 위험한 턴을 낮춥니다.";
  if (keywords.has("power") || card.type === "power") return "전투 내내 남는 효과입니다.";
  if (card.type === "attack") return "마무리 피해를 보탭니다.";
  if (card.type === "skill") return "방어와 손패 정리를 보탭니다.";
  return "덱의 빈 역할을 채웁니다.";
}

function renderRelic(relicId, large = false, active = false, run = null) {
  const relic = RELIC_BY_ID[relicId];
  if (!relic) return "";
  const rarity = rarityLabel(relic.rarity);
  const insight = relicRunInsight(relicId, run);
  const activeText = active ? "방금 발동. " : "";
  const aria = `${relic.name}. ${activeText}${rarity} 유물. ${relic.timing}. ${relic.text}${insight ? ` ${insight}` : ""}`;
  return `
    <span class="relic relic-${relic.rarity} ${large ? "large" : ""} ${active ? "active" : ""}" title="${relic.name}: ${relic.text}" aria-label="${aria}">
      <span class="relic-icon icon-${relic.icon}"></span>
      ${large ? `
        <span class="relic-copy">
          <span class="relic-name">${relic.name}</span>
          <small><b>${rarity}</b> · ${relic.timing}</small>
          <small>${relic.text}</small>
          ${insight ? `<small class="relic-link">${insight}</small>` : ""}
        </span>
      ` : ""}
      ${relicTooltip(relic, rarity, insight, active)}
    </span>
  `;
}

function relicTooltip(relic, rarity, insight, active = false) {
  return `
    <span class="relic-tooltip">
      <strong>${relic.name}${active ? " · 발동" : ""}</strong>
      <small>${rarity} · ${relic.timing}</small>
      <span>${relic.text}</span>
      ${insight ? `<em>${insight}</em>` : ""}
    </span>
  `;
}

function relicRunInsight(relicId, run) {
  const hint = RELIC_SYNERGY_HINTS.find((entry) => entry.id === relicId);
  if (!hint) return run ? "현재 런에서 자동으로 조건을 감시합니다." : "";
  if (!run) return `${hint.keywords.slice(0, 2).map(keywordLabel).join(", ")} 카드와 연결됩니다.`;
  const matchingCards = run.player.deck.filter((cardInstance) => {
    const card = effectiveCard(cardInstance);
    return hint.keywords.some((keyword) => card.keywords?.includes(keyword));
  });
  const labels = hint.keywords.slice(0, 2).map(keywordLabel).join(", ");
  if (matchingCards.length) return `현재 덱: ${labels} 카드 ${matchingCards.length}장과 연결.`;
  return `다음 보상에서 ${labels} 카드를 더 높게 보세요.`;
}

function relicTimingTone(timing = "") {
  if (/상점|보상|획득|엘리트/.test(timing)) return "economy";
  if (/전투|턴|카드|공격|방어|상태|소멸|지속/.test(timing)) return "combat";
  return "passive";
}

function renderStatuses(statuses = {}) {
  const entries = Object.entries(statuses).filter(([, value]) => value > 0);
  if (!entries.length) return `<div class="status-row empty">상태 없음</div>`;
  const summary = statusSummaryText(statuses);
  const visibleEntries = entries.length > 4 ? entries.slice(0, 3) : entries;
  const hiddenEntries = entries.slice(visibleEntries.length);
  return `<div class="status-row" aria-label="상태 효과: ${summary}">${visibleEntries
    .map(([key, value]) => {
      const label = keywordLabel(key);
      const description = keywordDescription(key);
      const tone = PLAYER_HARMFUL_STATUSES.includes(key) ? "harmful" : "beneficial";
      return `<span class="status-chip status-${key} ${tone}" tabindex="0" title="${label} ${value}. ${description}" aria-label="${label} ${value}" data-status-key="${key}" data-status-label="${label} ${value}" data-status-description="${description}"><i class="${statusIconClass(key)}" aria-hidden="true"></i><strong>${value}</strong></span>`;
    })
    .join("")}${hiddenEntries.length ? renderStatusMoreChip(hiddenEntries) : ""}</div>`;
}

function renderStatusMoreChip(entries = []) {
  const label = `추가 상태 +${entries.length}`;
  const detail = entries.map(([key, value]) => `${keywordLabel(key)} ${value}: ${keywordDescription(key)}`).join(" / ");
  return `<span class="status-chip status-more" tabindex="0" title="${label}. ${detail}" aria-label="${label}. ${detail}" data-status-key="more" data-status-label="${label}" data-status-description="${detail}"><i class="${statusIconClass("more")}" aria-hidden="true"></i><strong>${entries.length}</strong></span>`;
}

function statusSummaryText(statuses = {}) {
  const entries = Object.entries(statuses).filter(([, value]) => value > 0);
  return entries.length ? entries.map(([key, value]) => `${keywordLabel(key)} ${value}`).join(", ") : "상태 없음";
}

function statusSummarySentence(statuses = {}) {
  const summary = statusSummaryText(statuses);
  return summary === "상태 없음" ? "상태 효과 없음." : `상태 효과: ${summary}.`;
}

function renderLog(run) {
  return `
    <aside class="combat-log">
      ${run.log
        .slice(-8)
        .reverse()
        .map((entry) => `<p class="${entry.tone}">${entry.text}</p>`)
        .join("")}
    </aside>
  `;
}

function playerHealthBar(run) {
  const forecast = enemyIntentForecast(run);
  const hpLoss = Math.max(0, Number(forecast?.hpLoss ?? 0));
  if (hpLoss <= 0) return healthBar(run.player.hp, run.player.maxHp);
  const hpAfter = Math.max(0, run.player.hp - hpLoss);
  const maxHp = Math.max(1, run.player.maxHp);
  const hpLossPercent = Math.max(0, Math.min(100, (Math.min(hpLoss, run.player.hp) / maxHp) * 100));
  const hpAfterPercent = Math.max(0, Math.min(100, (hpAfter / maxHp) * 100));
  return healthBar(run.player.hp, run.player.maxHp, {
    className: "incoming-health-loss",
    style: `--incoming-hp-after:${hpAfterPercent}%;--incoming-hp-loss:${hpLossPercent}%;`,
    attrs: `data-incoming-result="-${hpLoss}" data-incoming-after="${hpAfter}"`,
    ariaLabel: `체력 ${run.player.hp}/${run.player.maxHp}. 턴 종료 시 예상 손실 ${hpLoss}, 남은 체력 ${hpAfter}.`
  });
}

function healthBar(hp, maxHp, options = {}) {
  const percent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const className = ["health-bar", options.className].filter(Boolean).join(" ");
  const attrs = options.attrs ? ` ${options.attrs}` : "";
  const style = options.style ? ` style="${options.style}"` : "";
  const ariaLabel = options.ariaLabel ?? `체력 ${hp}/${maxHp}`;
  return `
    <div class="${className}" aria-label="${ariaLabel}"${style}${attrs}>
      <span style="width:${percent}%"></span>
      <strong>${hp}/${maxHp}</strong>
    </div>
  `;
}

function combatPileDefinition(id) {
  return COMBAT_PILE_DEFINITIONS.find((pileDef) => pileDef.id === id) ?? COMBAT_PILE_DEFINITIONS[0];
}

function combatPileCards(combat, id) {
  const pileDef = combatPileDefinition(id);
  const cards = [...(combat[pileDef.property] ?? [])];
  if (id === "draw") return cards.reverse();
  if (id === "discard" || id === "exhaust") return cards.reverse();
  return cards;
}

function combatPileSummary(cards) {
  if (!cards.length) return { averageCost: "0.0", upgraded: 0, primaryType: "없음" };
  const effectiveCards = cards.map(effectiveCard);
  const playableCosts = effectiveCards.map((card) => card.cost).filter((cost) => cost < 90);
  const averageCost = playableCosts.length ? (playableCosts.reduce((sum, cost) => sum + cost, 0) / playableCosts.length).toFixed(1) : "-";
  const upgraded = cards.filter((card) => card.upgraded).length;
  const typeCounts = new Map();
  effectiveCards.forEach((card) => typeCounts.set(card.type, (typeCounts.get(card.type) ?? 0) + 1));
  const [type, count] = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { averageCost, upgraded, primaryType: `${typeLabel(type)} ${count}` };
}

function combatDrawPreview(cards) {
  const nextCards = cards.slice(0, 3).map((card) => effectiveCard(card).name);
  return `
    <div class="pile-next">
      <dt>다음 카드</dt>
      <dd>${nextCards.length ? nextCards.join(" / ") : "버림 더미를 섞을 차례"}</dd>
    </div>
  `;
}

function nodeLegend(type, label) {
  return `<span class="legend-item ${type}" title="${label}" aria-label="${label}"><i>${nodeIcon(type)}</i>${label}</span>`;
}

function nodeTypeLabel(type) {
  return {
    combat: "전투",
    elite: "엘리트",
    event: "이벤트",
    shop: "상점",
    rest: "휴식",
    boss: "보스"
  }[type];
}

function nodeRiskReward(type) {
  return {
    combat: { reward: "안정적인 카드 보상", risk: "표준 전투. 핵심 카드를 천천히 모읍니다." },
    elite: { reward: "유물 확정과 많은 크레딧", risk: "강한 적입니다. 체력과 핵심 카드가 부족하면 위험합니다." },
    event: { reward: "위험을 감수하는 특수 선택", risk: "체력, 크레딧, 저주를 대가로 큰 보상을 노립니다." },
    shop: { reward: "카드 구매, 제거, 강화 정비", risk: "크레딧이 부족하면 휴식보다 얻는 것이 적을 수 있습니다." },
    rest: { reward: "회복, 강화, 카드 제거", risk: "한 가지 정비만 고를 수 있습니다." },
    boss: { reward: "구역 돌파와 대형 보상", risk: "현재 덱에 부족한 방어, 피해, 정화·약화가 바로 드러납니다." }
  }[type] ?? { reward: "알 수 없는 신호", risk: "경로 정보를 확인하세요." };
}

function routeRewardShortLabel(type) {
  return {
    combat: "카드 보상",
    elite: "유물 + 크레딧",
    event: "특수 선택",
    shop: "구매 · 제거",
    rest: "회복 · 강화",
    boss: "구역 보스"
  }[type] ?? "경로 확인";
}

function routeRiskLevel(type, scout = null) {
  if (type === "boss" && scout?.missing?.length) return scout.missing.slice(0, 2).join(" · ");
  return {
    combat: "위험 보통",
    elite: "위험 높음",
    event: "변수 큼",
    shop: "정비",
    rest: "안전",
    boss: "보스"
  }[type] ?? "정보 부족";
}

function routeDecisionRiskText(node, detail, scout) {
  if (node.type === "elite" && scout?.detail) return firstSentence(scout.detail);
  if (node.type === "boss" && scout?.detail) return firstSentence(scout.detail);
  return firstSentence(detail.risk);
}

function firstSentence(text = "") {
  return cleanRouteLabel(text).split(".")[0];
}

function runProgressBrief(run) {
  const currentNode = run.currentNodeId ? run.map.flat().find((node) => node.id === run.currentNodeId) : null;
  const activeNodes = run.map.flat().filter((node) => run.availableNodeIds.includes(node.id));
  const referenceNode = currentNode ?? activeNodes[0] ?? run.map.flat().find((node) => node.row + 1 >= run.stats.floors) ?? run.map[0]?.[0];
  const row = referenceNode?.row ?? Math.max(0, run.stats.floors - 1);
  const act = referenceNode?.act ?? rowToAct(row);
  const actStart = (act - 1) * 7;
  const bossRow = act * 7 - 1;
  const boss = bossForAct(act);
  const stepsIntoAct = Math.max(0, Math.min(6, row - actStart));
  const progress = Math.round((stepsIntoAct / 6) * 100);
  const distance = Math.max(0, bossRow - row);
  const nextTypes = [...new Set(activeNodes.map((node) => nodeTypeLabel(node.type)).filter(Boolean))];
  const phaseText = run.phase === "map" ? "경로 선택" : phaseBriefLabel(run.phase);
  const nextText = run.phase === "map" && nextTypes.length ? `다음: ${nextTypes.slice(0, 3).join(" / ")}` : `현재: ${phaseText}`;
  const bossText = boss ? `보스: ${boss.name}` : "보스 미확인";
  const tone = distance <= 1 || run.phase === "combat" && currentNode?.type === "boss" ? "danger" : activeNodes.some((node) => node.type === "elite") ? "warning" : "steady";
  return {
    tone,
    progress,
    actLabel: `${act}막 · ${actName(act)}`,
    title: runStageTitle(run, distance, boss, stepsIntoAct),
    detail: boss?.mechanic ?? "지금 덱이 무엇으로 이기는지 정하고, 다음 보스가 요구하는 방어·피해·정화·약화를 준비하세요.",
    bossText,
    distanceText: distance === 0 ? "보스층" : `보스까지 ${distance}층`,
    nextText,
    act,
    distance,
    boss,
    readiness: boss && distance <= 3 ? bossReadiness(run, boss, distance) : null
  };
}

function bossReadiness(run, boss, distance) {
  const cards = run.player.deck.map(effectiveCard);
  const bossText = boss?.mechanic ?? "";
  const hpRatio = run.player.hp / Math.max(1, run.player.maxHp);
  const defenseCards = cards.filter((card) => cardSupportsDefense(card)).length;
  const burstDefenseCards = cards.filter((card) => cardSupportsBurstDefense(card)).length;
  const sustainedDefenseCards = cards.filter((card) => cardSupportsSustainedDefense(card)).length;
  const finishCards = cards.filter((card) => cardSupportsFinish(card)).length;
  const statusCards = cards.filter((card) => cardSupportsStatusControl(card)).length;
  const flowCards = cards.filter((card) => cardSupportsFlow(card)).length;
  const requirements = bossReadinessRequirements(run, boss, distance, cards);
  const defenseMetrics = requirements.finalBoss
    ? [
        readinessMetric("큰 방어", `${burstDefenseCards}/${requirements.burstDefense.steady}장`, countReadinessTone(burstDefenseCards, requirements.burstDefense)),
        readinessMetric("연속 방어", `${sustainedDefenseCards}/${requirements.sustainedDefense.steady}장`, countReadinessTone(sustainedDefenseCards, requirements.sustainedDefense))
      ]
    : [
        readinessMetric("방어", `${defenseCards}/${requirements.defense.steady}장`, countReadinessTone(defenseCards, requirements.defense))
      ];
  const metrics = [
    readinessMetric("체력", `${run.player.hp}/${run.player.maxHp}`, bossHpReadinessTone(hpRatio, requirements.hp)),
    ...defenseMetrics,
    readinessMetric("마무리", `${finishCards}/${requirements.finish.steady}장`, countReadinessTone(finishCards, requirements.finish)),
    readinessMetric("정화·약화", `${statusCards}/${requirements.status.steady}장`, countReadinessTone(statusCards, requirements.status)),
    readinessMetric("카드 뽑기", `${flowCards}/${requirements.flow.steady}장`, countReadinessTone(flowCards, requirements.flow))
  ];
  const weakLabels = metrics.filter((metric) => metric.tone === "danger" || metric.tone === "warning").map((metric) => metric.label);
  const tone = metrics.some((metric) => metric.tone === "danger") ? "danger" : weakLabels.length >= 2 ? "warning" : "strong";
  const distanceText = distance === 0 ? `${boss.name} 전투 중` : `${boss.name}까지 ${distance}층`;
  const action = bossReadinessAction(weakLabels, requirements, distance);
  const detail = weakLabels.length
    ? `먼저 보강할 것: ${weakLabels.slice(0, 3).join(", ")}. ${action}`
    : "생존과 마무리 수단이 고르게 갖춰져 있습니다.";
  return {
    tone,
    title: distanceText,
    detail,
    action,
    metrics
  };
}

function bossReadinessRequirements(run, boss, distance, cards = run.player.deck.map(effectiveCard)) {
  const bossText = boss?.mechanic ?? "";
  const finalBoss = boss?.id === "last_gate_choir" || boss?.act >= 3;
  const lateBoss = boss?.act >= 2;
  const close = distance <= 1;
  const difficulty = Number(run.difficulty ?? 0);
  const deckSize = cards.length;
  const needsStatusControl = /바이러스|취약|약화|균열/.test(bossText);
  const extraPressure = (finalBoss ? 2 : lateBoss ? 1 : 0) + (close ? 1 : 0) + (difficulty >= 4 ? 1 : 0);
  const defenseSteady = 4 + Math.min(3, extraPressure);
  const burstDefenseSteady = finalBoss ? (close ? 3 : 2) : 1;
  const sustainedDefenseSteady = finalBoss ? (close ? 4 : 3) : Math.max(2, defenseSteady - 2);
  const finishSteady = 5 + Math.min(3, extraPressure);
  const flowSteady = deckSize >= 26 ? 5 : deckSize >= 22 || finalBoss ? 4 : 3;
  const statusSteady = needsStatusControl ? (finalBoss ? 3 : 2) : 1;
  return {
    hp: {
      strong: finalBoss ? 0.78 : lateBoss ? 0.72 : 0.68,
      steady: finalBoss ? 0.58 : lateBoss ? 0.52 : 0.48,
      danger: finalBoss ? 0.38 : 0.32
    },
    defense: { strong: defenseSteady + 2, steady: defenseSteady, danger: Math.max(2, defenseSteady - 3) },
    burstDefense: { strong: burstDefenseSteady + 1, steady: burstDefenseSteady, danger: Math.max(0, burstDefenseSteady - 2) },
    sustainedDefense: { strong: sustainedDefenseSteady + 1, steady: sustainedDefenseSteady, danger: Math.max(1, sustainedDefenseSteady - 2) },
    finish: { strong: finishSteady + 2, steady: finishSteady, danger: Math.max(3, finishSteady - 3) },
    status: { strong: statusSteady + 1, steady: statusSteady, danger: needsStatusControl ? 1 : 0 },
    flow: { strong: flowSteady + 1, steady: flowSteady, danger: Math.max(1, flowSteady - 2) },
    finalBoss,
    close,
    deckSize
  };
}

function bossHpReadinessTone(hpRatio, requirement) {
  if (hpRatio >= requirement.strong) return "strong";
  if (hpRatio >= requirement.steady) return "steady";
  if (hpRatio >= requirement.danger) return "warning";
  return "danger";
}

function countReadinessTone(count, requirement) {
  if (count >= requirement.strong) return "strong";
  if (count >= requirement.steady) return "steady";
  if (count <= requirement.danger) return "danger";
  return "warning";
}

function bossReadinessAction(weakLabels, requirements, distance) {
  if (!weakLabels.length) return "지금 흐름을 유지하고 보스전에서는 2단계 전환 전 손패를 아끼세요.";
  if (weakLabels.includes("체력")) return "다음 선택은 회복이나 안전 경로를 먼저 보세요.";
  if (weakLabels.includes("큰 방어") && weakLabels.includes("연속 방어")) return "문 낙하를 막을 큰 방어와 레퀴엠을 이어 받을 보존, 도금, 약화를 함께 챙기세요.";
  if (weakLabels.includes("연속 방어")) return "문 낙하 뒤 레퀴엠까지 버틸 도금, 약화, 가벼운 방어를 먼저 챙기세요.";
  if (weakLabels.includes("큰 방어")) return "문 낙하와 레퀴엠을 넘길 큰 방어, 약화, 도금 카드를 먼저 챙기세요.";
  if (weakLabels.includes("방어")) return "방어, 약화, 도금 카드나 방어 유물을 우선하세요.";
  if (weakLabels.includes("정화·약화")) return "정화 카드나 적을 약화시키는 카드를 한 장 더 찾으세요.";
  if (weakLabels.includes("카드 뽑기") || requirements.deckSize >= 26) return "제거, 카드 뽑기, 보존 카드로 필요한 카드를 더 자주 보세요.";
  if (weakLabels.includes("마무리")) return distance === 0 ? "2단계 전환 전에 큰 피해 카드를 남겨 두세요." : "큰 피해, 표식, 바이러스처럼 보스를 끝낼 수단을 챙기세요.";
  return "상점, 휴식, 보상에서 빈 역할 하나만 분명히 채우세요.";
}

function readinessMetric(label, value, tone) {
  return { label, value, tone };
}

function bossReadinessMissing(readiness) {
  return readiness?.metrics
    ?.filter((metric) => metric.tone === "danger" || metric.tone === "warning")
    .map((metric) => metric.label) ?? [];
}

function cardSupportsBurstDefense(card) {
  const profile = cardDefenseProfile(card);
  return profile.block >= 11 || profile.weak >= 1 || profile.plated >= 2;
}

function cardSupportsSustainedDefense(card) {
  const profile = cardDefenseProfile(card);
  const cost = card.cost ?? 99;
  return (
    profile.plated >= 2 ||
    profile.weak >= 1 ||
    card.retain && profile.block >= 6 ||
    cost <= 1 && profile.block >= 5 ||
    cardEffects(card).some((effect) => effect.op === "gainStatus" && effect.target === "self" && effect.status === "nextEnergy")
  );
}

function cardCoversBossDefensePair(card) {
  const profile = cardDefenseProfile(card);
  const carriesDefense = profile.plated >= 2 || profile.weak >= 1 || card.retain && profile.block >= 6 || cardEffects(card).some((effect) => effect.op === "gainStatus" && effect.target === "self" && effect.status === "nextEnergy");
  return cardSupportsBurstDefense(card) && carriesDefense;
}

function cardDefenseProfile(card) {
  const profile = { block: 0, weak: 0, plated: 0 };
  for (const effect of cardEffects(card)) {
    if (effect.op === "block") profile.block += effect.amount ?? 0;
    if (effect.op === "blockPerHand") profile.block += (effect.amount ?? 0) * 5;
    if (effect.op === "gainStatus" && effect.target === "self" && effect.status === "plated") profile.plated += effect.amount ?? 0;
    if (effect.op === "apply" && effect.status === "weak" && ["enemy", "allEnemies"].includes(effect.target)) profile.weak += effect.amount ?? 0;
  }
  return profile;
}

function cardSupportsDefense(card) {
  return (
    card.type === "skill" && (card.keywords?.includes("block") || cardEffects(card).some((effect) => ["block", "blockPerHand"].includes(effect.op))) ||
    card.keywords?.some((keyword) => ["block", "counter", "plated", "weak"].includes(keyword)) ||
    cardEffects(card).some((effect) => effect.op === "gainStatus" && ["counter", "plated"].includes(effect.status))
  );
}

function cardSupportsFinish(card) {
  return (
    card.type === "attack" ||
    card.keywords?.some((keyword) => ["damage", "mark", "vulnerable", "charge", "virus"].includes(keyword)) ||
    cardEffects(card).some((effect) => ["damage", "damageByCharge", "damagePerExhaust", "spendChargeDamage"].includes(effect.op))
  );
}

function cardSupportsStatusControl(card) {
  return (
    cardEffects(card).some((effect) => effect.op === "cleanse" || effect.op === "heal") ||
    card.keywords?.some((keyword) => ["weak", "vulnerable", "frail", "plated"].includes(keyword))
  );
}

function cardSupportsFlow(card) {
  return (
    card.retain ||
    card.exhaust ||
    card.cost === 0 ||
    card.keywords?.some((keyword) => ["retain", "exhaust", "temporary", "charge", "focus"].includes(keyword)) ||
    cardEffects(card).some((effect) => ["draw", "gainEnergy", "generate", "discountRandomHand", "resetHand"].includes(effect.op))
  );
}

function cardEffects(card) {
  return collectNestedEffects(card.effects ?? []);
}

function collectNestedEffects(effects) {
  const output = [];
  for (const effect of effects) {
    output.push(effect);
    if (effect.effects) output.push(...collectNestedEffects(effect.effects));
  }
  return output;
}

function rowToAct(row) {
  if (row < 7) return 1;
  if (row < 14) return 2;
  return 3;
}

function actName(act) {
  return {
    1: "침수 인덱스",
    2: "녹슨 커런트",
    3: "마지막 문"
  }[act] ?? "미확인 구역";
}

function phaseBriefLabel(phase) {
  return {
    combat: "전투",
    map: "경로 선택",
    reward: "보상 선택",
    event: "이벤트",
    shop: "상점 정비",
    rest: "휴식 정비"
  }[phase] ?? "탐사";
}

function runStageTitle(run, distance, boss, stepsIntoAct = 0) {
  if (run.phase === "combat" && distance === 0) return `${boss?.name ?? "보스"}전`;
  if (distance <= 1) return "보스 전 정비";
  if (distance <= 3) return "보스 준비";
  if (stepsIntoAct <= 0) return "첫 전투 선택";
  if (stepsIntoAct <= 2) return "주력 고르기";
  return "덱 빈틈 채우기";
}

function routeStrategicPreview(run, node) {
  if (node.type === "boss") {
    const boss = bossForAct(node.act);
    const readiness = boss ? bossReadiness(run, boss, 0) : null;
    const missing = bossReadinessMissing(readiness);
    const detail = missing.length
      ? `${boss?.mechanic ?? "보스전입니다."} 지금 부족: ${missing.slice(0, 3).join(", ")}.`
      : `${boss?.mechanic ?? "보스전입니다."} 지금 덱은 생존과 마무리 수단이 고르게 갖춰졌습니다.`;
    return {
      tone: readiness?.tone ?? "danger",
      label: boss?.name ?? "보스 정보",
      detail,
      missing
    };
  }
  if (node.type === "elite") {
    const names = routeEnemyNames("elite", node.act).slice(0, 3).join(" / ");
    const readiness = eliteReadiness(run, node);
    return {
      tone: readiness.tone,
      label: readiness.label,
      detail: `${names} · ${readiness.shortDetail ?? readiness.detail}`
    };
  }
  if (node.type === "combat") {
    const names = routeEnemyNames("normal", node.act).slice(0, 3).join(" / ");
    return {
      tone: "steady",
      label: "적 후보",
      detail: names
    };
  }
  if (node.type === "shop") {
    const prices = shopServicePrices(run);
    const usefulService = run.player.gold >= prices.remove ? "제거 가능" : run.player.gold >= prices.heal ? "회복/저가 구매 가능" : "크레딧 부족";
    return {
      tone: run.player.gold >= prices.remove ? "strong" : "steady",
      label: `크레딧 ${run.player.gold}`,
      detail: `${usefulService} · 제거 ${prices.remove} / 강화 ${prices.upgrade} / 회복 ${prices.heal}`
    };
  }
  if (node.type === "rest") {
    const healAmount = restHealAmount(run);
    const missingHp = run.player.maxHp - run.player.hp;
    const upgradeText = hasUpgradeableCards(run) ? "강화 후보 있음" : "강화 후보 없음";
    return {
      tone: missingHp > healAmount ? "strong" : "steady",
      label: "세이프룸",
      detail: `회복 +${healAmount} · ${upgradeText} · 카드 제거 가능`
    };
  }
  if (node.type === "event") {
    const remaining = Math.max(0, GAME_DATA.events.length - (run.seenEventIds?.length ?? 0));
    return {
      tone: "event",
      label: "이벤트",
      detail: `남은 이벤트 ${remaining} · 대가를 보고 선택`
    };
  }
  return { tone: "steady", label: "정보 없음", detail: "다른 경로를 선택하거나 다음 층에서 확인하세요." };
}

function eliteReadiness(run, node) {
  const analysis = deckAnalysis(run);
  const cards = run.player.deck.map(effectiveCard);
  const hpRatio = run.player.hp / Math.max(1, run.player.maxHp);
  const defenseCards = cards.filter((card) => cardSupportsDefense(card)).length;
  const finishCards = cards.filter((card) => cardSupportsFinish(card)).length;
  const firstElite = node.act === 1 && run.stats.elitesKilled === 0;
  const difficulty = Number(run.difficulty ?? 0);
  const highPressure = firstElite && difficulty >= 2;
  const hpNeed = firstElite ? (highPressure ? 0.82 : 0.72) : 0.62;
  const defenseNeed = highPressure ? 5 : 4;
  const finishNeed = highPressure ? 6 : 5;
  const styleNeed = highPressure ? 5 : 4;
  const weak = [];
  if (hpRatio < hpNeed) weak.push("체력");
  if (defenseCards < defenseNeed) weak.push("방어");
  if (finishCards < finishNeed) weak.push("마무리");
  if (analysis.primary.score < styleNeed) weak.push("주력");
  const metrics = `체력 ${Math.round(hpRatio * 100)}%, 방어 ${defenseCards}장, 마무리 ${finishCards}장.`;
  if (weak.length >= 3 || hpRatio < 0.45) {
    return {
      tone: "danger",
      label: firstElite ? "첫 엘리트 위험" : "엘리트 위험",
      detail: `${metrics} 부족: ${weak.slice(0, 3).join(", ")}. 유물 보상보다 생존을 먼저 보세요.`,
      shortDetail: `부족: ${weak.slice(0, 3).join(", ")}.`
    };
  }
  if (weak.length) {
    return {
      tone: "warning",
      label: firstElite ? "첫 엘리트 점검" : "엘리트 점검",
      detail: `${metrics} 부족: ${weak.slice(0, 3).join(", ")}. 유물은 크지만 다른 길과 비교하세요.`,
      shortDetail: `부족: ${weak.slice(0, 3).join(", ")}.`
    };
  }
  return {
    tone: "strong",
    label: firstElite ? "첫 엘리트 도전 가능" : "엘리트 도전 가능",
    detail: `${metrics} ${analysis.primary.label} 카드가 충분해 유물 보상을 노려도 됩니다.`,
    shortDetail: `${analysis.primary.label} 카드가 충분합니다.`
  };
}

function bossForAct(act) {
  return GAME_DATA.enemies.find((enemy) => enemy.tier === "boss" && enemy.act === act);
}

function routeEnemyNames(tier, act) {
  return routeEnemyIds(tier, act)
    .map((id) => GAME_DATA.enemies.find((enemy) => enemy.id === id)?.name)
    .filter(Boolean);
}

function routeEnemyIds(tier, act) {
  return enemyIdsForNode(tier === "elite" ? "elite" : "combat", act);
}

function routeConnectionSummary(run, node) {
  const nextLabels = routeBranchLabels(run, node);
  if (!nextLabels.length) return "다음: 최종 분기";
  return `다음: ${nextLabels.slice(0, 3).join(" · ")}${nextLabels.length > 3 ? ` 외 ${nextLabels.length - 3}` : ""}`;
}

function routeBranchSummaryText(run, node) {
  const immediateLabels = routeBranchLabels(run, node);
  const lookaheadLabels = routeLookaheadBranchLabels(run, node);
  const labels = lookaheadLabels.length ? lookaheadLabels : immediateLabels;
  if (!labels.length) return "마지막 분기";
  const prefix = immediateLabels.every((label) => label === "전투") && labels.some((label) => label !== "전투") ? "곧" : "이후";
  return `${prefix} ${labels.slice(0, 2).join(" · ")}${labels.length > 2 ? ` 외 ${labels.length - 2}` : ""}`;
}

function routeBranchLabels(run, node) {
  const allNodes = run.map?.flat?.() ?? [];
  return [
    ...new Set(
      (node.connections ?? [])
        .map((id) => nodeTypeLabel(allNodes.find((item) => item.id === id)?.type))
        .filter(Boolean)
    )
  ];
}

function routeLookaheadBranchLabels(run, node, maxDepth = 3) {
  const allNodes = run.map?.flat?.() ?? [];
  const nodeById = Object.fromEntries(allNodes.map((item) => [item.id, item]));
  const labels = [];
  const seen = new Set();
  let frontier = [...(node.connections ?? [])];
  for (let depth = 1; depth <= maxDepth && frontier.length; depth += 1) {
    const next = [];
    for (const id of frontier) {
      const nextNode = nodeById[id];
      if (!nextNode || seen.has(nextNode.id)) continue;
      seen.add(nextNode.id);
      const label = nodeTypeLabel(nextNode.type);
      if (label) labels.push(label);
      next.push(...(nextNode.connections ?? []));
    }
    frontier = next;
  }
  const unique = [...new Set(labels)];
  const nonCombat = unique.filter((label) => label !== "전투");
  return nonCombat.length ? nonCombat : unique;
}

function routePathLabel(run, node) {
  if (node.type !== "combat") return routeDirectPathLabel(node);
  const branchLabels = routeLookaheadBranchLabels(run, node);
  const primary = routePrimaryBranchLabel(branchLabels);
  return primary;
}

function routeDirectPathLabel(node) {
  if (node.type === "elite") return "엘리트전";
  if (node.type === "event") return "이벤트";
  if (node.type === "shop") return "상점";
  if (node.type === "rest") return "세이프룸";
  if (node.type === "boss") return "보스전";
  return nodeTypeLabel(node.type) ?? "경로";
}

function routePrimaryBranchLabel(branchLabels = []) {
  const priority = [
    ["엘리트", "엘리트 노림"],
    ["상점", "상점 쪽"],
    ["휴식", "휴식 쪽"],
    ["이벤트", "이벤트 쪽"],
    ["보스", "보스 앞"],
    ["전투", "전투 중심"]
  ];
  return priority.find(([label]) => branchLabels.includes(label))?.[1] ?? "전투 중심";
}

function routeFocusSummary(run, node, routeAdvice, scout, previewing) {
  if (!previewing && routeAdvice?.recommendedNodeId === node.id) {
    return routeAdvice.title === "보상과 위험 비교" ? "현재 체력과 크레딧 기준 추천" : routeAdvice.title;
  }
  if (node.type === "combat") return routeBranchSummaryText(run, node);
  return scout.label;
}

function renderRouteTrail(run, node) {
  const labels = routeLookaheadBranchLabels(run, node).slice(0, 3);
  if (!labels.length) return "";
  return `
    <span class="route-trail" aria-hidden="true">
      ${labels.map((label) => `<i class="${routeTypeFromLabel(label)}" title="${label}">${nodeIcon(routeTypeFromLabel(label))}</i>`).join("")}
    </span>
  `;
}

function routeTypeFromLabel(label) {
  return {
    전투: "combat",
    엘리트: "elite",
    이벤트: "event",
    상점: "shop",
    휴식: "rest",
    보스: "boss"
  }[label] ?? "combat";
}

function routeNodeTitle(run, node) {
  const detail = nodeRiskReward(node.type);
  const scout = routeStrategicPreview(run, node);
  return cleanRouteLabel(`${node.row + 1}층 ${routePathLabel(run, node)}. ${detail.reward}. ${scout.label}: ${scout.detail}. ${routeConnectionSummary(run, node)}`);
}

function cleanRouteLabel(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\.\s*\./g, ".")
    .trim();
}

function nodeIcon(type) {
  const safeType = ["combat", "elite", "event", "shop", "rest", "boss"].includes(type) ? type : "combat";
  return `<span class="node-icon node-icon-${safeType}" aria-hidden="true"></span>`;
}

function typeLabel(type) {
  return {
    attack: "공격",
    skill: "기술",
    power: "동조",
    curse: "저주",
    status: "상태"
  }[type] ?? type;
}

function keywordLabel(keyword) {
  return STATUS_LABELS[keyword] ?? {
    damage: "피해",
    block: "방어",
    charge: "전하",
    focus: "집중",
    retain: "보존",
    exhaust: "소멸",
    temporary: "임시",
    power: "동조",
    attack: "공격",
    skill: "기술"
  }[keyword] ?? keyword;
}

function statusIconClass(keyword) {
  const safeKey = [
    "vulnerable",
    "weak",
    "frail",
    "virus",
    "mark",
    "strength",
    "focus",
    "charge",
    "counter",
    "plated",
    "fragile",
    "echo",
    "deepIndex",
    "choir",
    "contagion",
    "pearlEngine",
    "nextEnergy",
    "mirror",
    "haste",
    "more"
  ].includes(keyword)
    ? keyword
    : "more";
  return `status-icon status-icon-${safeKey}`;
}

function keywordDescription(keyword) {
  return KEYWORDS[keyword] ?? statusOnlyDescriptions()[keyword] ?? `${keywordLabel(keyword)}: 전투 중 수치가 높을수록 영향이 커지는 상태입니다.`;
}

function keywordTooltipDescription(keyword) {
  const label = keywordLabel(keyword);
  const description = keywordDescription(keyword);
  return description.replace(new RegExp(`^${escapeRegExp(label)}[:：]\\s*`), "");
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rarityLabel(rarity) {
  return {
    starter: "시작 카드",
    common: "일반",
    uncommon: "고급",
    rare: "희귀",
    special: "생성/특수",
    curse: "저주"
  }[rarity] ?? rarity;
}

function tierLabel(tier) {
  return {
    normal: "일반 적",
    elite: "엘리트",
    boss: "보스"
  }[tier] ?? tier;
}

function groupBy(values, picker) {
  const groups = new Map();
  for (const value of values) {
    const key = picker(value);
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  return groups;
}

function statusOnlyDescriptions() {
  return {
    strength: "증폭: 공격 피해가 수치만큼 증가합니다.",
    deepIndex: "딥 인덱스: 턴 시작에 뽑는 카드 수를 늘리는 동조 상태입니다.",
    choir: "성가 회로: 기술 사용 때마다 모든 적에게 피해를 줍니다.",
    contagion: "감염 커런트: 내 턴 시작마다 모든 적에게 바이러스를 부여합니다.",
    pearlEngine: "진주 엔진: 충분한 전하를 보유한 채 턴을 시작하면 에너지를 얻습니다.",
    nextEnergy: "예비 에너지: 다음 턴 시작에 추가 에너지를 제공합니다.",
    haste: "가속: 카드를 빨리 다시 보고 추가 행동을 얻는 보조 상태입니다."
  };
}

function loadRun() {
  const result = loadRunFromStorage(browserStorage());
  saveRecoveryNotice = result.notice;
  return result.run;
}

function saveRun(run) {
  const result = saveRunToStorage(browserStorage(), run);
  if (result.notice) state.saveNotice = result.notice;
}

function loadSettings() {
  return loadSettingsFromStorage(browserStorage());
}

function saveSettings() {
  if (!saveSettingsToStorage(browserStorage(), state.settings)) {
    state.saveNotice = tabOnlyStorageNotice("설정");
    return false;
  }
  clearTabOnlyStorageNotice("설정");
  return true;
}

function applySettings() {
  document.documentElement.style.setProperty("--text-scale", textScale());
  document.documentElement.style.setProperty("--motion-scale", motionScale());
  document.body.style.setProperty("--text-scale", textScale());
  document.body.style.setProperty("--motion-scale", motionScale());
  document.body.classList.toggle("high-contrast", Boolean(state.settings.highContrast));
}

function motionScale() {
  const value = Number(state.settings.motionSpeed);
  return Number.isFinite(value) ? clamp(value, 0.45, 1.6) : 1;
}

function textScale() {
  const value = Number(state.settings.textScale);
  return Number.isFinite(value) ? clamp(value, 0.9, 1.18) : 1;
}

function updateSettingReadouts() {
  app.querySelectorAll("[data-setting-value]").forEach((output) => {
    output.textContent = formatSettingValue(output.dataset.settingValue);
  });
}

function refreshSettingsSaveNotice() {
  const holder = app.querySelector("[data-settings-save-notice]");
  if (holder) holder.innerHTML = renderSaveRecoveryNotice();
}

function formatSettingValue(key) {
  const raw = state.settings[key];
  const value = Number(raw);
  if (key === "volume") return `${Math.round(effectVolume() * 100)}%`;
  if (key === "musicVolume") return `${Math.round(musicVolume() * 100)}%`;
  if (key === "motionSpeed") return `${motionScale().toFixed(1)}x`;
  if (key === "textScale") return `${Math.round(textScale() * 100)}%`;
  return String(raw ?? "");
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  if (minutes <= 0) return `${remainingSeconds}초`;
  return `${minutes}분 ${String(remainingSeconds).padStart(2, "0")}초`;
}

function formatSavedAt(timestamp) {
  const savedAt = Number(timestamp) || 0;
  if (!savedAt) return "저장 시각 없음";
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - savedAt) / 1000));
  if (elapsedSeconds < 10) return "방금 저장됨";
  if (elapsedSeconds < 60) return `${elapsedSeconds}초 전 저장`;
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}분 전 저장`;
  return new Date(savedAt).toLocaleString();
}

function summaryBuildNote(summary) {
  const tags = summary.build ?? [];
  if (hasBuildConcept(tags, "charge")) return "전하를 모아 한 번에 쓰는 덱이었습니다. 다음에는 비용 감소와 카드 뽑기를 더 섞으면 큰 턴을 더 자주 만들 수 있습니다.";
  if (hasBuildConcept(tags, "virus")) return "바이러스와 약화로 버틴 덱이었습니다. 방어와 약화 카드를 더하면 긴 보스전에서 안정성이 올라갑니다.";
  if (hasBuildConcept(tags, "ward")) return "막고 되받아치는 덱이었습니다. 취약 부여를 더하면 반격 피해가 크게 뛰어오릅니다.";
  if (hasBuildConcept(tags, "mark")) return "표식을 남기고 연달아 공격한 덱이었습니다. 덱을 얇게 유지하면 핵심 공격을 더 자주 다시 볼 수 있습니다.";
  if (hasBuildConcept(tags, "cycle")) return "필요한 카드를 다시 찾는 덱이었습니다. 보존 카드가 붙으면 선택지가 더 안정됩니다.";
  if (hasBuildConcept(tags, "risk")) return "대가를 내고 더 행동하는 덱이었습니다. 체력과 회복 수단을 함께 관리하면 큰 턴을 더 안정적으로 만들 수 있습니다.";
  return "이번 기록은 다음 런의 기준선입니다. 덱 크기, 유물 수, 보스 처치 기록을 비교하며 다른 주력을 시도해 보세요.";
}

function summaryBuildShortNote(summary) {
  const tags = summary.build ?? [];
  if (hasBuildConcept(tags, "charge")) return "전하를 모으고 한 턴에 크게 씁니다.";
  if (hasBuildConcept(tags, "virus")) return "지속 피해가 쌓일 시간을 벌어야 합니다.";
  if (hasBuildConcept(tags, "ward")) return "막은 뒤 반격으로 되돌려줍니다.";
  if (hasBuildConcept(tags, "mark")) return "표식을 남기고 여러 번 때립니다.";
  if (hasBuildConcept(tags, "cycle")) return "필요한 카드를 빠르게 다시 찾습니다.";
  if (hasBuildConcept(tags, "risk")) return "체력을 대가로 더 크게 움직입니다.";
  return "첫 보상에서 전하, 표식, 바이러스, 반격 중 하나를 정하세요.";
}

function loadRecords() {
  return normalizeRecords(readBrowserJson(RECORDS_KEY, defaultRecords()));
}

function saveRecords() {
  if (!writeBrowserJson(RECORDS_KEY, state.records)) {
    state.saveNotice = tabOnlyStorageNotice("기록");
    return false;
  }
  clearTabOnlyStorageNotice("기록");
  return true;
}

function recordSummary(run) {
  state.records = recordRunSummary(state.records, run);
  saveRecords();
}

function readBrowserJson(key, fallback) {
  try {
    const storage = browserStorage();
    const raw = storage?.getItem?.(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeBrowserJson(key, value) {
  try {
    const storage = browserStorage();
    if (!storage?.setItem) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function tabOnlyStorageNotice(scope) {
  return {
    tone: "danger",
    recovered: false,
    title: `${scope} 저장 불가`,
    detail: "브라우저 저장소를 사용할 수 없어 이번 탭에서만 유지됩니다. 저장 권한을 허용하면 이어하기와 기록 보존이 안정적으로 동작합니다."
  };
}

function clearTabOnlyStorageNotice(scope) {
  if (state.saveNotice?.title === `${scope} 저장 불가`) state.saveNotice = null;
}

const MUSIC_GAIN_SCALE = 0.35;
const MUSIC_DEFAULT_BRIDGE_EVERY = 96;
const MUSIC_DUCK_MIN_RATIO = 0.54;
const MUSIC_DUCK_RELEASE_SECONDS = 0.42;
const MUSIC_DUCK_ATTACK_SECONDS = 0.026;

function effectVolume() {
  const value = Number(state.settings.volume);
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
}

function musicVolume() {
  const value = Number(state.settings.musicVolume);
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
}

function audioOutputEnabled() {
  return effectVolume() > 0 || musicVolume() > 0;
}

function ensureAudio() {
  if (!audioOutputEnabled()) {
    stopMusic();
    return;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  if (!state.audio) state.audio = new AudioContext();
  if (state.audio.state === "suspended" && state.audio.resume) {
    state.audio.resume().then(() => {
      if (state.audio?.state === "running") syncMusic();
    }).catch(() => {});
    return;
  }
  if (state.audio.state === "running") syncMusic();
}

function playTone(kind) {
  if (!state.audio || state.audio.state !== "running" || effectVolume() <= 0) return;
  const now = state.audio.currentTime;
  const cue = SOUND_CUES[kind] ?? SOUND_CUES.button;
  duckMusicForCue(cue, now);
  cue.notes.forEach((note, index) => {
    const offset = index * cue.stagger;
    playOscillator(note, now + offset, cue.duration, cue.type, cue.gain);
  });
  if (cue.noise) playNoise(now, cue.noise);
}

const BOSS_MUSIC_THEME_BY_ID = {
  the_cataloger: { normal: "boss_cataloger", phase2: "boss_cataloger_phase2" },
  drowned_algorithm: { normal: "boss_algorithm", phase2: "boss_algorithm_phase2" },
  last_gate_choir: { normal: "boss_lastgate", phase2: "boss_lastgate_phase2" }
};

const MUSIC_THEMES = {
  menu: {
    bpm: 64,
    root: 50,
    wave: "sine",
    gain: 0.038,
    bass: [0, -5, -7, -5],
    pattern: [0, null, 7, null, 10, null, 7, null, 3, null, 5, null, 7, null, 10, null],
    chords: [[0, 7, 12], [3, 10, 15]],
    variation: [12, 10, 7, 5],
    variationEvery: 64,
    variationGain: 0.1
  },
  explore: {
    bpm: 72,
    root: 45,
    wave: "triangle",
    gain: 0.034,
    bass: [0, -7, -5, -10],
    pattern: [0, null, 5, 7, null, 10, 7, null, 3, null, 7, null, 12, 10, null, 5],
    chords: [[0, 5, 12], [-2, 5, 10]],
    variation: [12, 10, 7, 5, 3],
    variationEvery: 48,
    variationGain: 0.11
  },
  combat: {
    bpm: 94,
    root: 43,
    wave: "triangle",
    gain: 0.042,
    bass: [0, 0, -5, -7],
    pattern: [0, 3, null, 7, 10, null, 7, 3, 0, null, 5, 7, null, 10, 12, null],
    chords: [[0, 7, 10], [-5, 2, 7]],
    pulse: 0.012,
    variation: [12, 7, 10, 3, 0],
    variationEvery: 32,
    variationWave: "square",
    variationGain: 0.13,
    bridge: [0, 3, 7, 12, 15, 12],
    bridgeEvery: 96,
    bridgeWave: "triangle"
  },
  boss: {
    bpm: 108,
    root: 38,
    wave: "sawtooth",
    gain: 0.034,
    bass: [0, -1, -5, -8],
    pattern: [0, null, 1, 7, null, 8, 7, 1, 0, null, -1, 5, 7, null, 8, 12],
    chords: [[0, 6, 13], [-1, 5, 12]],
    pulse: 0.018,
    variation: [0, -1, 7, 8, 13],
    variationEvery: 32,
    variationWave: "sawtooth",
    variationGain: 0.14,
    bridge: [0, 7, 13, 8, 5, -1],
    bridgeEvery: 96,
    transition: [0, -1, 7, 13]
  },
  boss_cataloger: {
    bpm: 106,
    root: 39,
    wave: "triangle",
    gain: 0.035,
    bass: [0, -5, -1, -7],
    pattern: [0, 2, null, 7, 11, null, 7, 2, 0, null, 5, 7, null, 11, 14, null],
    chords: [[0, 7, 11], [2, 8, 14]],
    pulse: 0.014,
    motif: [0, 2, 7, 11],
    motifEvery: 16,
    motifWave: "square",
    motifGain: 0.2,
    variation: [11, 7, 2, 14, 11],
    variationEvery: 48,
    variationWave: "triangle",
    variationGain: 0.14
  },
  boss_cataloger_phase2: {
    bpm: 116,
    root: 40,
    wave: "square",
    gain: 0.037,
    bass: [0, 0, -1, -5],
    pattern: [0, 2, 7, null, 11, 14, 11, 7, 2, null, 8, 11, null, 14, 16, 11],
    chords: [[0, 6, 11], [2, 8, 14]],
    pulse: 0.019,
    motif: [0, 7, 2, 11, 14],
    motifEvery: 12,
    motifWave: "square",
    motifGain: 0.22,
    variation: [14, 11, 7, 2, 16, 14],
    variationEvery: 24,
    variationWave: "square",
    variationGain: 0.16
  },
  boss_algorithm: {
    bpm: 102,
    root: 36,
    wave: "sawtooth",
    gain: 0.034,
    bass: [0, -2, -5, -6],
    pattern: [0, null, 6, null, -1, 5, null, 11, 0, null, -2, 4, null, 6, 9, null],
    chords: [[0, 6, 11], [-2, 4, 9]],
    pulse: 0.016,
    motif: [0, 6, -1, 11],
    motifEvery: 16,
    motifWave: "sawtooth",
    motifGain: 0.18,
    variation: [11, 6, -1, 4],
    variationEvery: 40,
    variationWave: "sawtooth",
    variationGain: 0.13
  },
  boss_algorithm_phase2: {
    bpm: 112,
    root: 35,
    wave: "sawtooth",
    gain: 0.037,
    bass: [0, -1, -6, -8],
    pattern: [0, 6, null, 11, -1, null, 5, 11, 0, -2, 4, null, 9, 11, 6, null],
    chords: [[0, 6, 11], [-1, 5, 12]],
    pulse: 0.021,
    motif: [0, 11, 6, -1, -6],
    motifEvery: 12,
    motifWave: "sawtooth",
    motifGain: 0.2,
    variation: [11, 6, -1, -6, 5],
    variationEvery: 24,
    variationWave: "sawtooth",
    variationGain: 0.16
  },
  boss_lastgate: {
    bpm: 110,
    root: 37,
    wave: "triangle",
    gain: 0.038,
    bass: [0, -7, -5, -12],
    pattern: [0, null, 7, 12, null, 15, 12, 7, -2, null, 5, 10, null, 14, 10, 5],
    chords: [[0, 7, 12], [-2, 5, 10], [-5, 2, 9]],
    pulse: 0.018,
    motif: [0, 7, 12, 15, 19],
    motifEvery: 16,
    motifWave: "sine",
    motifGain: 0.2,
    variation: [19, 15, 12, 7, 24],
    variationEvery: 40,
    variationWave: "sine",
    variationGain: 0.15,
    bridge: [0, 7, 12, 19, 24, 19, 12],
    bridgeEvery: 80,
    bridgeWave: "sine",
    transition: [0, 7, 12, 19]
  },
  boss_lastgate_phase2: {
    bpm: 122,
    root: 38,
    wave: "sawtooth",
    gain: 0.041,
    bass: [0, -5, -8, -12],
    pattern: [0, 7, 12, null, 15, 19, 15, 12, -1, 6, 11, null, 14, 18, 14, 11],
    chords: [[0, 6, 13], [-1, 6, 11], [-5, 2, 9]],
    pulse: 0.025,
    motif: [0, 12, 7, 19, 15, 24],
    motifEvery: 8,
    motifWave: "sawtooth",
    motifGain: 0.24,
    variation: [24, 19, 15, 12, 7, 0],
    variationEvery: 24,
    variationWave: "sawtooth",
    variationGain: 0.18,
    bridge: [0, 6, 13, 19, 24, 31, 24, 19],
    bridgeEvery: 72,
    bridgeWave: "sawtooth",
    transition: [0, 6, 13, 24],
    transitionGain: 0.12,
    filterFrequency: 1260
  },
  reward: {
    bpm: 70,
    root: 52,
    wave: "sine",
    gain: 0.04,
    bass: [0, -5, 3, -7],
    pattern: [0, 7, 12, null, 15, 12, 7, null, 3, 10, 15, null, 14, 10, 7, null],
    chords: [[0, 7, 12], [3, 7, 15]],
    variation: [12, 15, 19, 17],
    variationEvery: 48,
    variationGain: 0.12
  },
  victory: {
    bpm: 78,
    root: 55,
    wave: "sine",
    gain: 0.048,
    bass: [0, 5, 7, 12],
    pattern: [0, 4, 7, 12, 16, null, 12, 7, 5, 9, 12, 17, null, 16, 12, 7],
    chords: [[0, 7, 12], [5, 9, 16]],
    variation: [12, 16, 19, 24],
    variationEvery: 32,
    variationGain: 0.14,
    bridge: [0, 7, 12, 16, 24, 28],
    bridgeEvery: 64
  },
  defeat: {
    bpm: 54,
    root: 41,
    wave: "triangle",
    gain: 0.038,
    bass: [0, -2, -5, -7],
    pattern: [0, null, -2, null, -5, null, -7, null, -5, null, -2, null, 0, null, null, null],
    chords: [[0, 3, 7], [-5, -2, 3]],
    variation: [-5, -2, 0, -7],
    variationEvery: 48,
    variationGain: 0.1,
    bridge: [0, -2, -5, -7, -12],
    bridgeEvery: 96,
    filterFrequency: 980
  }
};

const SOUND_CUES = {
  attackCard: { notes: [220, 147], type: "sawtooth", duration: 0.12, stagger: 0.018, gain: 0.044, noise: 0.03 },
  block: { notes: [196, 294], type: "triangle", duration: 0.14, stagger: 0.035, gain: 0.045 },
  button: { notes: [330], type: "triangle", duration: 0.09, stagger: 0, gain: 0.035 },
  card: { notes: [392, 523, 659], type: "triangle", duration: 0.12, stagger: 0.028, gain: 0.045 },
  craft: { notes: [262, 330, 392], type: "sine", duration: 0.18, stagger: 0.05, gain: 0.04 },
  damage: { notes: [164, 110], type: "sawtooth", duration: 0.12, stagger: 0.025, gain: 0.04, noise: 0.035 },
  danger: { notes: [130, 92], type: "sawtooth", duration: 0.18, stagger: 0.04, gain: 0.05, noise: 0.025 },
  debuff: { notes: [277, 196, 185], type: "sawtooth", duration: 0.15, stagger: 0.032, gain: 0.035, noise: 0.018 },
  drawCard: { notes: [392, 440, 523], type: "triangle", duration: 0.08, stagger: 0.018, gain: 0.03, noise: 0.01 },
  energy: { notes: [523, 659], type: "square", duration: 0.09, stagger: 0.022, gain: 0.032 },
  enemyAttack: { notes: [130, 98], type: "sawtooth", duration: 0.16, stagger: 0.02, gain: 0.05, noise: 0.04 },
  enemyBuff: { notes: [185, 247, 277], type: "triangle", duration: 0.18, stagger: 0.045, gain: 0.035 },
  enemyGuard: { notes: [164, 220], type: "triangle", duration: 0.15, stagger: 0.032, gain: 0.04 },
  event: { notes: [247, 370, 494], type: "sine", duration: 0.16, stagger: 0.06, gain: 0.035 },
  finish: { notes: [196, 392, 784], type: "sawtooth", duration: 0.22, stagger: 0.05, gain: 0.052, noise: 0.028 },
  heal: { notes: [330, 440, 660], type: "sine", duration: 0.18, stagger: 0.052, gain: 0.038 },
  lose: { notes: [147, 123, 98], type: "sawtooth", duration: 0.32, stagger: 0.12, gain: 0.055, noise: 0.025 },
  bossPhase: { notes: [98, 196, 294, 392, 587], type: "sawtooth", duration: 0.28, stagger: 0.055, gain: 0.06, noise: 0.045 },
  powerCard: { notes: [196, 392, 587, 784], type: "square", duration: 0.18, stagger: 0.04, gain: 0.034 },
  relic: { notes: [523, 784], type: "triangle", duration: 0.2, stagger: 0.06, gain: 0.04 },
  remove: { notes: [220, 165, 110], type: "triangle", duration: 0.16, stagger: 0.035, gain: 0.038, noise: 0.012 },
  reward: { notes: [330, 440, 660], type: "sine", duration: 0.2, stagger: 0.055, gain: 0.045 },
  skillCard: { notes: [247, 370, 494], type: "triangle", duration: 0.14, stagger: 0.032, gain: 0.04 },
  shop: { notes: [294, 370], type: "triangle", duration: 0.13, stagger: 0.04, gain: 0.036 },
  start: { notes: [220, 330, 440], type: "triangle", duration: 0.18, stagger: 0.055, gain: 0.045 },
  status: { notes: [277, 415, 554], type: "triangle", duration: 0.16, stagger: 0.035, gain: 0.034 },
  summon: { notes: [147, 196, 247], type: "triangle", duration: 0.2, stagger: 0.05, gain: 0.04, noise: 0.015 },
  turnDanger: { notes: [196, 130, 98], type: "sawtooth", duration: 0.22, stagger: 0.045, gain: 0.048, noise: 0.02 },
  turnGuard: { notes: [247, 330], type: "triangle", duration: 0.13, stagger: 0.035, gain: 0.035 },
  turnPass: { notes: [294, 392], type: "sine", duration: 0.12, stagger: 0.035, gain: 0.03 },
  turnPressure: { notes: [220, 185, 247], type: "triangle", duration: 0.17, stagger: 0.04, gain: 0.038 },
  win: { notes: [392, 523, 659, 880], type: "sine", duration: 0.28, stagger: 0.09, gain: 0.055 }
};

function soundCueFor(action, run) {
  if (!run) return action === "delete-save" ? "danger" : action === "start" ? "start" : "button";
  if (run.phase === "summary") return run.summary?.won ? "win" : "lose";
  if (action === "play-card" && activeCombatVictoryCoda(run)) return "finish";
  if (action === "select-enemy" || action === "cycle-enemy") return "button";
  if (action === "play-card") return combatFxSoundCue();
  if (action === "end-turn" && state.combatFx?.kind === "enemy-action") return combatFxSoundCue();
  if (action === "reward-card") return "reward";
  if (action === "reward-relic") return "relic";
  if (action === "skip-reward") return "button";
  if (action === "shop-card") return "shop";
  if (action === "shop-relic") return "relic";
  if (action === "shop-heal") return "heal";
  if (action === "shop-remove") return "remove";
  if (action === "shop-upgrade") return "craft";
  if (action === "deck-select") return deckSelectionSoundCue();
  if (action === "rest") return choicePulseSoundCue(action) ?? "craft";
  if (action === "event-option") return choicePulseSoundCue(action) ?? "event";
  if (action === "enter-node") return "start";
  const tone = run.log.at(-1)?.tone;
  if (tone === "damage" || tone === "enemy") return "damage";
  if (tone === "block") return "block";
  if (tone === "buff") return "powerCard";
  if (tone === "warn") return "danger";
  if (tone === "relic") return "relic";
  if (tone === "reward") return "reward";
  if (tone === "shop") return "shop";
  if (tone === "event") return "event";
  if (tone === "deck" || tone === "rest") return "craft";
  return "button";
}

function soundCueForEndTurn(run) {
  const preview = combatEndTurnPreview(run);
  if (preview.tone === "danger") return "turnDanger";
  if (preview.tone === "warning" || preview.tone === "setup") return "turnPressure";
  if (preview.tone === "guarded") return "turnGuard";
  return "turnPass";
}

function combatFxSoundCue(fx = state.combatFx) {
  if (!fx) return "card";
  if (fx.kind === "enemy-action") return enemyActionSoundCue(fx);
  return combatCardSoundCue(fx);
}

function combatCardSoundCue(fx = state.combatFx) {
  if (!fx) return "card";
  if (fx.lethal) return "finish";
  if ((fx.selfHeal ?? 0) > 0 || fx.chips?.some((chip) => chip.tone === "heal")) return "heal";
  if (fx.tone === "damage") return fx.cardType === "attack" ? "attackCard" : "damage";
  if (fx.tone === "block" || fx.tone === "guarded") return fx.cardType === "skill" ? "skillCard" : "block";
  if (fx.tone === "resource") {
    if (fx.cardType === "power") return "powerCard";
    if (fx.chips?.some((chip) => /카드|뽑|생성/.test(chip.label ?? ""))) return "drawCard";
    return "energy";
  }
  if (fx.tone === "status" || fx.tone === "control") {
    if (fx.targetMode === "enemy" || fx.targetMode === "all-enemies") return "debuff";
    return fx.cardType === "power" ? "powerCard" : "status";
  }
  if (fx.cardType === "attack") return "attackCard";
  if (fx.cardType === "skill") return "skillCard";
  if (fx.cardType === "power") return "powerCard";
  return "card";
}

function enemyActionSoundCue(fx = state.combatFx) {
  if (!fx) return "damage";
  if ((fx.selfHpLoss ?? 0) > 0 || fx.tone === "enemy") return "enemyAttack";
  if (fx.tone === "warn") return "debuff";
  if (fx.tone === "summon") return "summon";
  if ((fx.enemyHeal ?? 0) > 0) return "heal";
  if ((fx.enemyBlockGain ?? 0) > 0 || fx.tone === "block" || fx.tone === "guarded") return "enemyGuard";
  if (fx.tone === "status") return "enemyBuff";
  return "damage";
}

function choicePulseSoundCue(action, pulse = state.choicePulse) {
  if (!pulse?.id?.includes(`-${action}`)) return null;
  if (pulse.chips?.some((chip) => chip.tone === "warn" || chip.tone === "cost")) return "danger";
  if (pulse.chips?.some((chip) => chip.tone === "heal")) return "heal";
  if (pulse.chips?.some((chip) => chip.tone === "relic")) return "relic";
  if (pulse.chips?.some((chip) => /제거|덱 -\d/.test(chip.label ?? ""))) return "remove";
  if (pulse.tone === "craft") return "craft";
  if (pulse.tone === "event") return "event";
  if (pulse.tone === "shop") return "shop";
  return null;
}

function deckSelectionSoundCue(run = state.run) {
  const mode = run?.selector?.mode;
  if (mode === "remove") return "remove";
  if (mode === "upgrade") return "craft";
  return choicePulseSoundCue("deck-select") ?? "craft";
}

function bossPhaseCue(run) {
  if (run?.phase !== "combat") return null;
  const boss = activeCombatBoss(run);
  if (!boss || (boss.enemy.phase ?? 1) < 2 || !isFreshBossPhaseLog(run, boss.template)) return null;
  const key = `${run.id}:${boss.enemy.uid}:${boss.enemy.phase}`;
  return state.lastBossPhaseCue === key ? null : key;
}

function isFreshBossPhaseLog(run, template) {
  const lastEntry = run?.log?.at(-1);
  return Boolean(lastEntry?.tone === "enemy" && lastEntry.text.includes(template?.phaseName ?? "2단계") && lastEntry.text.includes("진입"));
}

function syncMusic() {
  const themeName = currentMusicTheme();
  document.body.dataset.musicTheme = themeName ?? "silent";
  if (!state.audio) return;
  if (musicVolume() <= 0 || !themeName) {
    stopMusic();
    return;
  }
  if (state.music?.themeName !== themeName) startMusicTheme(themeName);
  else updateMusicGain();
}

function currentMusicTheme() {
  if (state.screen !== "game" || !state.run) return "menu";
  if (state.run.phase === "combat") {
    return currentBossMusicTheme(state.run) ?? "combat";
  }
  if (state.run.phase === "reward" || state.run.phase === "shop") return "reward";
  if (state.run.phase === "summary") return state.run.summary?.won ? "victory" : "defeat";
  return "explore";
}

function currentBossMusicTheme(run) {
  const boss = run.combat?.enemies?.find((enemy) => GAME_DATA.enemies.find((item) => item.id === enemy.templateId)?.tier === "boss");
  if (!boss && run.combat?.type !== "boss") return null;
  const theme = BOSS_MUSIC_THEME_BY_ID[boss?.templateId];
  if (!theme) return "boss";
  return (boss.phase ?? 1) >= 2 ? theme.phase2 : theme.normal;
}

function startMusicTheme(themeName) {
  stopMusic();
  const theme = MUSIC_THEMES[themeName];
  if (!theme || !state.audio || state.audio.state !== "running") return;
  const now = state.audio.currentTime;
  const gain = state.audio.createGain();
  const filter = state.audio.createBiquadFilter();
  const compressor = state.audio.createDynamicsCompressor?.();
  const filterFrequency = theme.filterFrequency ?? (theme.wave === "sawtooth" ? 1040 : 1480);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(musicGainFor(theme), now + 1.2);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.max(420, filterFrequency * 0.58), now);
  filter.frequency.exponentialRampToValueAtTime(filterFrequency, now + 1.4);
  filter.Q.setValueAtTime(theme.filterQ ?? 0.72, now);
  gain.connect(filter);
  if (compressor) {
    compressor.threshold.setValueAtTime(-27, now);
    compressor.knee.setValueAtTime(18, now);
    compressor.ratio.setValueAtTime(3.2, now);
    compressor.attack.setValueAtTime(0.018, now);
    compressor.release.setValueAtTime(0.18, now);
    filter.connect(compressor);
    compressor.connect(state.audio.destination);
  } else {
    filter.connect(state.audio.destination);
  }
  state.music = {
    theme,
    themeName,
    gain,
    filter,
    compressor,
    duckUntil: 0,
    duckRatio: 1,
    nextTime: now + 0.08,
    step: 0,
    timer: null
  };
  playMusicTransition(theme, now + 0.12);
  scheduleMusic();
  state.music.timer = window.setInterval(scheduleMusic, 180);
}

function stopMusic() {
  if (!state.music) return;
  const music = state.music;
  if (music.timer) window.clearInterval(music.timer);
  if (music.gain && state.audio) {
    const now = state.audio.currentTime;
    music.gain.gain.cancelScheduledValues(now);
    music.gain.gain.setTargetAtTime(0.0001, now, 0.12);
    window.setTimeout(() => {
      music.gain?.disconnect();
      music.filter?.disconnect();
      music.compressor?.disconnect();
    }, 700);
  }
  state.music = null;
}

function updateMusicGain() {
  if (!state.music || !state.audio) return;
  const now = state.audio.currentTime;
  const duckRatio = currentMusicDuckRatio(now);
  state.music.gain.gain.cancelScheduledValues(now);
  state.music.gain.gain.setTargetAtTime(musicGainFor(state.music.theme, duckRatio), now, 0.08);
  if (duckRatio < 1) {
    state.music.gain.gain.setTargetAtTime(musicGainFor(state.music.theme), state.music.duckUntil, 0.18);
  }
}

function musicGainFor(theme, duckRatio = 1) {
  const baseGain = musicVolume() * MUSIC_GAIN_SCALE * theme.gain;
  return Math.max(0.0001, baseGain * duckRatio);
}

function currentMusicDuckRatio(now = state.audio?.currentTime ?? 0) {
  if (!state.music || now >= (state.music.duckUntil ?? 0)) return 1;
  return clamp(state.music.duckRatio ?? 1, MUSIC_DUCK_MIN_RATIO, 1);
}

function duckMusicForCue(cue, start = state.audio?.currentTime ?? 0) {
  if (!state.audio || !state.music?.gain || musicVolume() <= 0) return;
  const now = state.audio.currentTime;
  const ratio = musicDuckRatioForCue(cue);
  if (ratio >= 0.995) return;
  const lastNoteOffset = (cue.notes.length - 1) * (cue.stagger ?? 0);
  const releaseAt = Math.max(state.music.duckUntil ?? 0, start + lastNoteOffset + cue.duration + MUSIC_DUCK_RELEASE_SECONDS);
  const activeRatio = now < (state.music.duckUntil ?? 0) ? Math.min(state.music.duckRatio ?? 1, ratio) : ratio;
  state.music.duckUntil = releaseAt;
  state.music.duckRatio = activeRatio;
  state.music.gain.gain.cancelScheduledValues(now);
  state.music.gain.gain.setTargetAtTime(musicGainFor(state.music.theme, activeRatio), Math.max(now, start), MUSIC_DUCK_ATTACK_SECONDS);
  state.music.gain.gain.setTargetAtTime(musicGainFor(state.music.theme), releaseAt, 0.18);
}

function musicDuckRatioForCue(cue) {
  const noteWeight = Math.min(0.18, Math.max(0, cue.notes.length - 1) * 0.045);
  const gainWeight = Math.min(0.28, (cue.gain ?? 0) * 4.2);
  const noiseWeight = Math.min(0.2, (cue.noise ?? 0) * 4.8);
  const durationWeight = Math.min(0.12, (cue.duration ?? 0) * 0.28);
  return clamp(1 - noteWeight - gainWeight - noiseWeight - durationWeight, MUSIC_DUCK_MIN_RATIO, 1);
}

function scheduleMusic() {
  const music = state.music;
  if (!music || !state.audio) return;
  const theme = music.theme;
  const beatLength = 60 / theme.bpm;
  const horizon = state.audio.currentTime + 0.78;
  while (music.nextTime < horizon) {
    const phraseStep = music.step;
    const step = phraseStep % theme.pattern.length;
    const note = theme.pattern[step];
    const chord = theme.chords[Math.floor(music.step / 8) % theme.chords.length];
    if (step % 4 === 0) playMusicVoice(midiToFrequency(theme.root - 12 + theme.bass[Math.floor(music.step / 4) % theme.bass.length]), music.nextTime, beatLength * 1.8, "sine", 0.74, -0.18);
    if (step % 8 === 0) playMusicChord(chord.map((offset) => midiToFrequency(theme.root + offset)), music.nextTime, beatLength * 5.2, theme.wave, 0.34);
    if (note !== null) playMusicVoice(midiToFrequency(theme.root + note), music.nextTime, beatLength * 0.82, theme.wave, 0.62, step % 4 < 2 ? 0.2 : -0.2);
    playMusicMotif(theme, music.nextTime, beatLength, phraseStep);
    playMusicVariation(theme, music.nextTime, beatLength, phraseStep);
    playMusicBridge(theme, music.nextTime, beatLength, phraseStep);
    if (theme.pulse && phraseStep % 2 === 0) playMusicPulse(music.nextTime, theme.pulse);
    music.nextTime += beatLength;
    music.step += 1;
  }
}

function playMusicTransition(theme, start) {
  const intervals = theme.transition ?? [0, 7, 12, 19];
  intervals.forEach((offset, index) => {
    playMusicVoice(
      midiToFrequency(theme.root + offset),
      start + index * 0.055,
      0.34 + index * 0.045,
      theme.transitionWave ?? theme.motifWave ?? theme.wave,
      (theme.transitionGain ?? 0.09) / Math.sqrt(intervals.length),
      index % 2 === 0 ? -0.22 : 0.22
    );
  });
}

function playMusicMotif(theme, start, beatLength, step) {
  if (!theme.motif?.length || step % (theme.motifEvery ?? 16) !== 0) return;
  theme.motif.forEach((offset, index) => {
    playMusicVoice(
      midiToFrequency(theme.root + offset),
      start + index * beatLength * 0.18,
      beatLength * 0.42,
      theme.motifWave ?? theme.wave,
      (theme.motifGain ?? 0.18) / Math.sqrt(theme.motif.length),
      index % 2 === 0 ? 0.34 : -0.34
    );
  });
}

function playMusicVariation(theme, start, beatLength, step) {
  if (!theme.variation?.length || step === 0 || step % (theme.variationEvery ?? 48) !== 0) return;
  theme.variation.forEach((offset, index) => {
    playMusicVoice(
      midiToFrequency(theme.root + offset),
      start + index * beatLength * 0.22,
      beatLength * 0.52,
      theme.variationWave ?? theme.motifWave ?? theme.wave,
      (theme.variationGain ?? 0.12) / Math.sqrt(theme.variation.length),
      index % 2 === 0 ? -0.28 : 0.28
    );
  });
}

function playMusicBridge(theme, start, beatLength, step) {
  const bridge = theme.bridge ?? theme.variation?.slice().reverse();
  const every = theme.bridgeEvery ?? Math.max(MUSIC_DEFAULT_BRIDGE_EVERY, (theme.variationEvery ?? 48) * 2);
  if (!bridge?.length || step === 0 || step % every !== 0) return;
  bridge.forEach((offset, index) => {
    const pan = index % 3 === 0 ? -0.34 : index % 3 === 1 ? 0 : 0.34;
    playMusicVoice(
      midiToFrequency(theme.root + offset),
      start + index * beatLength * 0.3,
      beatLength * 0.78,
      theme.bridgeWave ?? theme.variationWave ?? theme.wave,
      (theme.bridgeGain ?? 0.16) / Math.sqrt(bridge.length),
      pan
    );
  });
}

function playMusicChord(frequencies, start, duration, type, amount) {
  frequencies.forEach((frequency, index) => playMusicVoice(frequency, start + index * 0.012, duration, type, amount / frequencies.length, (index - 1) * 0.16));
}

function playMusicVoice(frequency, start, duration, type, amount, pan = 0) {
  if (!state.audio || !state.music) return;
  const oscillator = state.audio.createOscillator();
  const gain = state.audio.createGain();
  const filter = state.audio.createBiquadFilter();
  const panner = state.audio.createStereoPanner?.();
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.type = type;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(type === "sawtooth" ? 880 : 1400, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, amount), start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(filter);
  filter.connect(gain);
  if (panner) {
    panner.pan.setValueAtTime(pan, start);
    gain.connect(panner);
    panner.connect(state.music.gain);
  } else {
    gain.connect(state.music.gain);
  }
  oscillator.start(start);
  oscillator.stop(start + duration + 0.04);
}

function playMusicPulse(start, amount) {
  if (!state.audio || !state.music) return;
  const sampleRate = state.audio.sampleRate;
  const buffer = state.audio.createBuffer(1, Math.floor(sampleRate * 0.035), sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / data.length, 2);
  }
  const source = state.audio.createBufferSource();
  const gain = state.audio.createGain();
  const filter = state.audio.createBiquadFilter();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(360, start);
  gain.gain.setValueAtTime(amount, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.04);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(state.music.gain);
  source.start(start);
}

function midiToFrequency(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function playOscillator(frequency, start, duration, type, volume) {
  const oscillator = state.audio.createOscillator();
  const gain = state.audio.createGain();
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.type = type;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(effectVolume() * volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(state.audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playNoise(start, volume) {
  const sampleRate = state.audio.sampleRate;
  const buffer = state.audio.createBuffer(1, Math.floor(sampleRate * 0.09), sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
  }
  const source = state.audio.createBufferSource();
  const gain = state.audio.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(effectVolume() * volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
  source.connect(gain);
  gain.connect(state.audio.destination);
  source.start(start);
}
