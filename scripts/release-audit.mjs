import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AUDIO_MIX_SOURCE_FILES,
  BALANCE_SOURCE_FILES,
  BROWSER_QA_SOURCE_FILES,
  KOREAN_COPY_SOURCE_FILES,
  RELEASE_PLAYTEST_SOURCE_FILES,
  buildBrowserQaManifest,
  sourceFingerprint
} from "./report-fingerprints.mjs";
import { CARDS, REWARD_CARD_IDS, STARTER_DECK } from "../src/data/cards.js";
import { CHARACTER, DIFFICULTIES } from "../src/data/character.js";
import { ENEMIES, NORMAL_ENEMY_IDS, ELITE_ENEMY_IDS, BOSS_IDS } from "../src/data/enemies.js";
import { EVENTS } from "../src/data/events.js";
import { RELICS, REWARD_RELIC_IDS } from "../src/data/relics.js";
import { contentCounts, newRun } from "../src/engine/game.js";

const root = resolve(import.meta.dirname, "..");
const qaDir = resolve(root, "qa");
const reportPath = resolve(qaDir, "release-audit.json");

const checks = [];

function record(id, label, ok, detail, evidence = {}) {
  checks.push({ id, label, ok: Boolean(ok), detail, evidence });
}

function auditComparable(report) {
  return JSON.stringify({ ...report, generatedAt: null });
}

async function writeAuditReportIfChanged(report) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  try {
    const existing = JSON.parse(await readFile(reportPath, "utf8"));
    if (auditComparable(existing) === auditComparable(report)) return { written: false };
  } catch {
    // Missing or unreadable reports should be replaced with the latest audit result.
  }
  await writeFile(reportPath, serialized);
  return { written: true };
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function pngSize(path) {
  try {
    const buffer = await readFile(path);
    const signature = buffer.subarray(0, 8).toString("hex");
    if (signature !== "89504e470d0a1a0a") return null;
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
  } catch {
    return null;
  }
}

async function newestMtime(paths) {
  const times = await Promise.all(
    paths.map(async (path) => {
      try {
        return (await stat(path)).mtimeMs;
      } catch {
        return 0;
      }
    })
  );
  return Math.max(0, ...times);
}

async function browserQaFreshness(qaFiles, requiredBrowserQa) {
  const sourcePaths = BROWSER_QA_SOURCE_FILES.map((file) => resolve(root, file));
  const sourceMtime = await newestMtime(sourcePaths);
  const manifestPath = resolve(qaDir, "browser-qa-manifest.json");
  const storedManifest = JSON.parse(await readFile(manifestPath, "utf8").catch(() => "null"));
  const currentManifest = await buildBrowserQaManifest({ root, qaDir });
  const files = qaFiles.filter((file) => /^browser-qa-.+\.png$/.test(file)).sort();
  const metadata = await Promise.all(
    files.map(async (file) => {
      const fileStat = await stat(resolve(qaDir, file));
      return {
        file,
        mtime: fileStat.mtime.toISOString(),
        fresh: fileStat.mtimeMs >= sourceMtime
      };
    })
  );
  const storedFiles = new Map((storedManifest?.files ?? []).map((item) => [item.file, item]));
  const manifestSourceFresh = storedManifest?.sourceFingerprint === currentManifest.sourceFingerprint;
  const manifestFileFresh = new Set(
    currentManifest.files
      .filter((item) => storedFiles.get(item.file)?.sha256 === item.sha256)
      .map((item) => item.file)
  );
  const hasManifest = Boolean(storedManifest?.sourceFingerprint && storedManifest?.files);
  const freshFiles = hasManifest
    ? files.filter((file) => manifestSourceFresh && manifestFileFresh.has(file))
    : metadata.filter((item) => item.fresh).map((item) => item.file);
  const requiredFresh = requiredBrowserQa.map((item) => ({
    id: item.id,
    matched: freshFiles.filter((file) => item.match.test(file))
  }));
  return {
    sourceFreshAfter: new Date(sourceMtime).toISOString(),
    sourceFingerprint: currentManifest.sourceFingerprint,
    manifestSourceFresh,
    manifestFileCount: storedManifest?.fileCount ?? 0,
    fileCount: metadata.length,
    freshCount: freshFiles.length,
    staleCount: metadata.length - freshFiles.length,
    freshFiles,
    requiredFresh,
    missingRequired: requiredFresh.filter((item) => item.matched.length === 0).map((item) => item.id)
  };
}

function unexpectedQaArtifacts(qaFiles) {
  const allowedExact = new Set([
    "audio-mix-report.json",
    "balance-long-report.json",
    "balance-report.json",
    "card-illustrations-sheet.png",
    "combatants-safe-regenerated-sheet.png",
    "korean-copy-report.json",
    "release-audit.json",
    "release-playtest-report.json"
  ]);
  return qaFiles
    .filter((file) => !allowedExact.has(file))
    .filter((file) => !/^browser-qa-.+\.(json|png)$/.test(file))
    .sort();
}

function pngDimensions(buffer) {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function uniqueIds(items) {
  const ids = items.map((item) => item.id);
  return new Set(ids).size === ids.length;
}

function collectEffects(effects = []) {
  const collected = [];
  for (const effect of effects) {
    collected.push(effect);
    if (effect.effects) collected.push(...collectEffects(effect.effects));
  }
  return collected;
}

function cardMatchesAxis(card, axis) {
  const keywords = new Set(card.keywords ?? []);
  const effects = new Set(collectEffects(card.effects ?? []).map((effect) => effect.op));
  return axis.keywords.some((keyword) => keywords.has(keyword)) || axis.effects.some((effect) => effects.has(effect));
}

function axisCoverage() {
  const axes = [
    { id: "charge", label: "전하", keywords: ["charge", "focus"], effects: ["gainCharge", "gainFocus", "damageByCharge", "spendChargeDamage", "chargePerEnemy"] },
    { id: "mark", label: "표식", keywords: ["mark", "damage"], effects: ["damage"] },
    { id: "virus", label: "바이러스", keywords: ["virus", "weak", "vulnerable", "frail"], effects: ["apply", "cleanse"] },
    { id: "ward", label: "방어/반격", keywords: ["block", "counter", "plated"], effects: ["block", "blockPerHand"] },
    { id: "cycle", label: "덱 순환", keywords: ["exhaust", "temporary", "retain"], effects: ["draw", "generate", "discardRandom", "resetHand", "exhaustRandomHand", "discountRandomHand", "upgradeRandomHand"] },
    { id: "risk", label: "고위험 보상", keywords: ["fragile"], effects: ["gainEnergy", "gainMaxEnergy", "loseHp", "loseMaxHp", "gainGold"] }
  ];
  return axes.map((axis) => ({
    ...axis,
    cards: CARDS.filter((card) => cardMatchesAxis(card, axis)).length,
    rewardCards: CARDS.filter((card) => REWARD_CARD_IDS.includes(card.id) && cardMatchesAxis(card, axis)).length
  }));
}

function routeHasOptionalEliteFork(run) {
  for (let act = 1; act <= 3; act += 1) {
    const rowBeforeElite = (act - 1) * 7 + 3;
    const eliteRow = rowBeforeElite + 1;
    for (const node of run.map[rowBeforeElite]) {
      const connectedTypes = node.connections.map((id) => run.map[eliteRow].find((candidate) => candidate.id === id)?.type).filter(Boolean);
      if (connectedTypes.includes("elite") && !connectedTypes.some((type) => type !== "elite")) return false;
    }
  }
  return true;
}

function auditRatio(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100) / 100;
}

function finalBossGuidanceBounds(report) {
  const rewardGuidance = report.finalBossAnalysis?.rewardGuidance ?? {};
  const reserveSignals = report.finalBossAnalysis?.reserveSignals ?? {};
  const chosen = rewardGuidance.chosen ?? 0;
  const defenseWithoutNeedShare = auditRatio(rewardGuidance.defenseWithoutDefenseMissing ?? 0, chosen);
  return {
    samples: rewardGuidance.samples ?? 0,
    chosen,
    defensiveShare: rewardGuidance.defensiveShare ?? 0,
    defenseWhileFinishMissing: rewardGuidance.defenseWhileFinishMissing ?? 0,
    defenseWithoutDefenseMissing: rewardGuidance.defenseWithoutDefenseMissing ?? 0,
    defenseWithoutNeedShare,
    reserveReached: reserveSignals.reached ?? 0,
    signalRunRate: reserveSignals.signalRunRate ?? 0,
    averageSignalsPerReached: reserveSignals.averageSignalsPerReached ?? 0,
    maxSignalsPerRun: reserveSignals.maxSignalsPerRun ?? 0,
    phasePushSignals: reserveSignals.phasePushSignals ?? 0,
    nearPhaseSignals: reserveSignals.nearPhaseSignals ?? 0
  };
}

function finalBossGuidanceWithinBounds(evidence, minimumSamples) {
  return evidence.samples >= minimumSamples &&
    evidence.defensiveShare <= 0.62 &&
    evidence.defenseWhileFinishMissing === 0 &&
    evidence.defenseWithoutNeedShare <= 0.08 &&
    evidence.reserveReached >= Math.floor(minimumSamples * 0.5) &&
    evidence.signalRunRate >= 0.55 &&
    evidence.signalRunRate <= 0.95 &&
    evidence.averageSignalsPerReached >= 0.6 &&
    evidence.averageSignalsPerReached <= 1.6 &&
    evidence.maxSignalsPerRun <= 4;
}

function playableArchetypeCoverage(report, { minimumRuns, minimumAverageFloors = 15, minimumWinRate = 0.18, minimumPrimaryMatchRate = 0.35 } = {}) {
  return (report.archetypeCoverage ?? [])
    .filter((entry) => entry.tag !== "unguided")
    .map((entry) => ({
      ...entry,
      playable:
        entry.runs >= minimumRuns &&
        entry.averageFloors >= minimumAverageFloors &&
        entry.winRate >= minimumWinRate &&
        entry.primaryMatchRate >= minimumPrimaryMatchRate
    }));
}

async function main() {
  const counts = contentCounts();
  const mainSource = await readFile(resolve(root, "src/main.js"), "utf8");
  const styleSource = await readFile(resolve(root, "src/styles.css"), "utf8");
  const indexSource = await readFile(resolve(root, "index.html"), "utf8");
  const faviconSource = await readFile(resolve(root, "public/assets/favicon.svg"), "utf8");
  const readme = await readFile(resolve(root, "README.md"), "utf8");
  const buildSource = await readFile(resolve(root, "scripts/build.mjs"), "utf8");
  const captureSource = await readFile(resolve(root, "scripts/capture-browser-qa.mjs"), "utf8");
  const cardArtScriptSource = await readFile(resolve(root, "scripts/rebuild-card-illustrations.py"), "utf8");
  const combatantScriptSource = await readFile(resolve(root, "scripts/rebuild-combatants.py"), "utf8");
  const cardUiIconScriptSource = await readFile(resolve(root, "scripts/generate-card-ui-icons.py"), "utf8").catch(() => "");
  const hudIconScriptSource = await readFile(resolve(root, "scripts/generate-hud-icons.py"), "utf8").catch(() => "");
  const mapNodeIconScriptSource = await readFile(resolve(root, "scripts/generate-map-node-icons.py"), "utf8").catch(() => "");
  const relicIconScriptSource = await readFile(resolve(root, "scripts/generate-relic-icons.py"), "utf8").catch(() => "");
  const resourceIconScriptSource = await readFile(resolve(root, "scripts/generate-resource-icons.py"), "utf8").catch(() => "");
  const shopServiceIconScriptSource = await readFile(resolve(root, "scripts/generate-shop-service-icons.py"), "utf8").catch(() => "");
  const statusIconScriptSource = await readFile(resolve(root, "scripts/generate-status-icons.py"), "utf8").catch(() => "");
  const titleIdentityScriptSource = await readFile(resolve(root, "scripts/generate-title-identity.py"), "utf8").catch(() => "");
  const titleMarkPng = await pngSize(resolve(root, "public/assets/deep-signal-mark.png"));
  const diverEmblemPng = await pngSize(resolve(root, "public/assets/echo-diver-emblem.png"));
  const deployWorkflowSource = await readFile(resolve(root, ".github/workflows/deploy-pages.yml"), "utf8").catch(() => "");
  const testSource = `${await readFile(resolve(root, "tests/engine.test.mjs"), "utf8")}\n${await readFile(resolve(root, "tests/content-integrity.test.mjs"), "utf8")}`;
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const balance = JSON.parse(await readFile(resolve(root, "qa/balance-report.json"), "utf8"));
  const longBalance = JSON.parse(await readFile(resolve(root, "qa/balance-long-report.json"), "utf8"));
  const balanceSourceFingerprint = await sourceFingerprint(BALANCE_SOURCE_FILES, { root });
  const audioMixReportPath = resolve(root, "qa/audio-mix-report.json");
  const audioMixReport = JSON.parse(await readFile(audioMixReportPath, "utf8").catch(() => "null"));
  const koreanCopyReportPath = resolve(root, "qa/korean-copy-report.json");
  const koreanCopyReport = JSON.parse(await readFile(koreanCopyReportPath, "utf8").catch(() => "null"));
  const playtestReportPath = resolve(root, "qa/release-playtest-report.json");
  const playtestReport = JSON.parse(await readFile(playtestReportPath, "utf8").catch(() => "null"));
  const titleIdentityQa = JSON.parse(await readFile(resolve(root, "qa/browser-qa-title-identity.json"), "utf8").catch(() => "null"));
  const mobileCombatQa = JSON.parse(await readFile(resolve(root, "qa/browser-qa-mobile-combat-refreshed.json"), "utf8").catch(() => "null"));
  const tabletCombatQa = JSON.parse(await readFile(resolve(root, "qa/browser-qa-tablet-combat-refreshed.json"), "utf8").catch(() => "null"));
  const enemyDensityQa = JSON.parse(await readFile(resolve(root, "qa/browser-qa-enemy-density-readability.json"), "utf8").catch(() => "null"));
  const groupedEnemyFxQa = JSON.parse(await readFile(resolve(root, "qa/browser-qa-enemy-grouped-fx.json"), "utf8").catch(() => "null"));
  const sourceMtime = await newestMtime(AUDIO_MIX_SOURCE_FILES.map((file) => resolve(root, file)));
  const audioMixSourceFingerprint = await sourceFingerprint(AUDIO_MIX_SOURCE_FILES, { root });
  const audioMixReportMtime = await newestMtime([audioMixReportPath]);
  const koreanCopySourceMtime = await newestMtime(KOREAN_COPY_SOURCE_FILES.map((file) => resolve(root, file)));
  const koreanCopySourceFingerprint = await sourceFingerprint(KOREAN_COPY_SOURCE_FILES, { root });
  const koreanCopyReportMtime = await newestMtime([koreanCopyReportPath]);
  const playtestSourceMtime = await newestMtime(RELEASE_PLAYTEST_SOURCE_FILES.map((file) => resolve(root, file)));
  const playtestSourceFingerprint = await sourceFingerprint(RELEASE_PLAYTEST_SOURCE_FILES, { root });
  const playtestReportMtime = await newestMtime([playtestReportPath]);
  const qaFiles = await readdir(qaDir).catch(() => []);
  const atlas = await readFile(resolve(root, "public/assets/sprite-atlas.png"));
  const cardAtlas = await readFile(resolve(root, "public/assets/card-illustrations.png"));
  const cardAtlasSize = pngDimensions(cardAtlas);
  const arenaAtlas = await readFile(resolve(root, "public/assets/arena-backdrops.png"));
  const arenaProps = await readFile(resolve(root, "public/assets/arena-props.png"));
  const eventBackdrops = await readFile(resolve(root, "public/assets/event-backdrops.png"));
  const eventBackdropSize = pngDimensions(eventBackdrops);
  const cardUiIcons = await readFile(resolve(root, "public/assets/card-ui-icons.png"));
  const cardUiIconSize = pngDimensions(cardUiIcons);
  const hudIcons = await readFile(resolve(root, "public/assets/hud-icons.png"));
  const hudIconSize = pngDimensions(hudIcons);
  const mapNodeIcons = await readFile(resolve(root, "public/assets/map-node-icons.png"));
  const mapNodeIconSize = pngDimensions(mapNodeIcons);
  const relicIcons = await readFile(resolve(root, "public/assets/relic-icons.png"));
  const relicIconSize = pngDimensions(relicIcons);
  const resourceIcons = await readFile(resolve(root, "public/assets/resource-icons.png"));
  const resourceIconSize = pngDimensions(resourceIcons);
  const shopServiceIcons = await readFile(resolve(root, "public/assets/shop-service-icons.png"));
  const shopServiceIconSize = pngDimensions(shopServiceIcons);
  const statusIcons = await readFile(resolve(root, "public/assets/status-icons.png"));
  const statusIconSize = pngDimensions(statusIcons);
  const enemyPortraits = await readFile(resolve(root, "public/assets/enemy-portraits.png"));
  const combatSprites = await readFile(resolve(root, "public/assets/combat-sprites.png"));
  const playerCombatant = await readFile(resolve(root, "public/assets/combatants/player-echo-diver.png"));
  const catalogerCombatant = await readFile(resolve(root, "public/assets/combatants/boss-cataloger.png"));
  const algorithmCombatant = await readFile(resolve(root, "public/assets/combatants/boss-algorithm.png"));
  const lastGateCombatant = await readFile(resolve(root, "public/assets/combatants/boss-lastgate.png"));
  const catalogerPhaseTwoCombatant = await readFile(resolve(root, "public/assets/combatants/boss-cataloger-phase2.png"));
  const algorithmPhaseTwoCombatant = await readFile(resolve(root, "public/assets/combatants/boss-algorithm-phase2.png"));
  const lastGatePhaseTwoCombatant = await readFile(resolve(root, "public/assets/combatants/boss-lastgate-phase2.png"));
  const bailiffCombatant = await readFile(resolve(root, "public/assets/combatants/elite-bailiff.png"));
  const engineCombatant = await readFile(resolve(root, "public/assets/combatants/elite-engine.png"));
  const knightCombatant = await readFile(resolve(root, "public/assets/combatants/elite-knight.png"));
  const cantorCombatant = await readFile(resolve(root, "public/assets/combatants/elite-cantor.png"));
  const colossusCombatant = await readFile(resolve(root, "public/assets/combatants/elite-colossus.png"));
  const enemyCombatants = await Promise.all([...new Set(ENEMIES.map((enemy) => enemy.sprite))].map((sprite) => readFile(resolve(root, `public/assets/combatants/enemy-${sprite}.png`))));
  const combatantDimensions = [playerCombatant, catalogerCombatant, algorithmCombatant, lastGateCombatant, catalogerPhaseTwoCombatant, algorithmPhaseTwoCombatant, lastGatePhaseTwoCombatant, bailiffCombatant, engineCombatant, knightCombatant, cantorCombatant, colossusCombatant, ...enemyCombatants].map(pngDimensions);
  const axes = axisCoverage();
  const relicTimings = new Set(RELICS.map((relic) => relic.timing));
  const bossPhases = ENEMIES.filter((enemy) => enemy.tier === "boss").every((enemy) => enemy.phaseAt > 0 && enemy.phaseAt < 1 && enemy.phaseName && enemy.moves.some((move) => move.phase === 2));
  const run = newRun({ seed: "release-audit-route", difficulty: 0 });
  const hardest = balance.byDifficulty?.find((entry) => entry.difficulty === Math.max(...balance.byDifficulty.map((entry) => entry.difficulty))) ?? null;
  const easiest = balance.byDifficulty?.find((entry) => entry.difficulty === 0) ?? null;
  const longDifficulties = longBalance.byDifficulty ?? [];
  const longEasiest = longDifficulties.find((entry) => entry.difficulty === 0) ?? null;
  const longHardest = longDifficulties.find((entry) => entry.difficulty === Math.max(...longDifficulties.map((entry) => entry.difficulty))) ?? null;
  const requiredBrowserQa = [
    { id: "title", match: /browser-qa-title/ },
    { id: "about", match: /browser-qa-about/ },
    { id: "combat", match: /browser-qa-combat|browser-qa-responsive-combat/ },
    { id: "card-hover", match: /browser-qa-combat-card-hover/ },
    { id: "card-attack-hover", match: /browser-qa-card-attack-hover/ },
    { id: "card-attack-fx", match: /browser-qa-card-attack-fx/ },
    { id: "energy-locked-card", match: /browser-qa-combat-energy-locked/ },
    { id: "status-tooltip", match: /browser-qa-combat-status-tooltip/ },
    { id: "intent-tooltip", match: /browser-qa-combat-intent-tooltip/ },
    { id: "enemy-density-readability", match: /browser-qa-enemy-density-readability/ },
    { id: "victory-coda", match: /browser-qa-victory-coda/ },
    { id: "boss-status-strip", match: /browser-qa-boss-status-strip/ },
    { id: "map", match: /browser-qa-map/ },
    { id: "act-interlude", match: /browser-qa-act-interlude-refreshed/ },
    { id: "act-interlude-one-shot", match: /browser-qa-act-interlude-one-shot/ },
    { id: "final-boss-readiness", match: /browser-qa-final-boss-readiness/ },
    { id: "final-boss-finisher-reserve", match: /browser-qa-final-boss-finisher-reserve/ },
    { id: "final-boss-selector", match: /browser-qa-final-boss-selector/ },
    { id: "reward", match: /browser-qa-reward/ },
    { id: "reward-card-selected", match: /browser-qa-reward-card-selected/ },
    { id: "reward-relics", match: /browser-qa-reward-relics/ },
    { id: "event", match: /browser-qa-event/ },
    { id: "choice-pulse-next-step", match: /browser-qa-choice-pulse-next-step/ },
    { id: "shop", match: /browser-qa-shop/ },
    { id: "rest", match: /browser-qa-rest/ },
    { id: "summary-lost", match: /browser-qa-summary-lost/ },
    { id: "summary-won", match: /browser-qa-summary-won/ },
    { id: "records", match: /browser-qa-records/ },
    { id: "settings", match: /browser-qa-settings/ },
    { id: "delete-save", match: /browser-qa-delete-save/ },
    { id: "abandon-run", match: /browser-qa-abandon/ },
    { id: "mobile", match: /browser-qa-mobile/ },
    { id: "mobile-combat", match: /browser-qa-mobile-combat/ },
    { id: "tablet-combat", match: /browser-qa-tablet-combat/ },
    { id: "codex", match: /browser-qa-codex/ }
  ];
  const browserQa = await browserQaFreshness(qaFiles, requiredBrowserQa);
  const debugQaFiles = qaFiles.filter((file) => /(^|[-_])debug([-_.]|$)/i.test(file));
  const unexpectedQaFiles = unexpectedQaArtifacts(qaFiles);
  const requiredReleaseInfo = ["핵심 조작", "크레딧", "이용 안내 · 라이선스", "외부 저작권 IP", "상용 이미지", "외부 음악 파일"];
  const requiredFlowDocs = ["새 런 시작", "전투", "보상 선택", "맵 이동", "상점", "휴식", "보스전", "승리/패배", "이어하기", "저장 삭제 확인", "런 포기 확인", "콘솔 오류 없음"];
  const requiredFlowTests = [
    "assisted full-run smoke reaches the final summary without dead phases",
    "shop, rest, final boss victory, and defeat flows are reachable",
    "abandon run ends safely with a replayable summary",
    "save slots recover the newest backup after an interrupted primary write",
    "run summary surfaces replay-relevant build evidence"
  ];

  record("scripts", "로컬 실행/빌드/테스트 명령", ["dev", "start", "test", "build", "audio:mix", "copy:audit", "playtest", "balance", "balance:long", "assets:cards", "assets:card-ui", "assets:combatants", "assets:events", "assets:hud", "assets:map", "assets:relics", "assets:resources", "assets:shop", "assets:statuses", "assets:title"].every((key) => packageJson.scripts?.[key]), "package.json에 기본 실행, 빌드, 테스트, 문구 검수, 플레이테스트, 밸런스와 에셋 재생성 명령이 있어야 합니다.", packageJson.scripts);
  record("content-counts", "콘텐츠 최소 수량", counts.cards >= 60 && counts.rewardCards >= 60 && counts.relics >= 30 && counts.normalEnemies >= 15 && counts.eliteEnemies >= 5 && counts.bosses >= 3 && counts.events >= 20 && counts.difficulties >= 5, "카드/유물/적/보스/이벤트/난이도 수량이 목표치를 넘어야 합니다.", counts);
  record("no-debug-qa-artifacts", "디버그 검증 산출물 없음", debugQaFiles.length === 0, "출시 후보 검증 폴더에는 debug 이름의 임시 스크린샷이나 리포트가 남지 않아야 합니다.", { debugQaFiles });
  record("qa-artifact-hygiene", "QA 산출물 허용 목록", unexpectedQaFiles.length === 0, "qa 폴더에는 자동 리포트, browser-qa 증거, 에셋 검수 시트만 남아야 합니다.", { unexpectedQaFiles });
  record("unique-content", "콘텐츠 ID 중복 없음", [CARDS, RELICS, ENEMIES, EVENTS].every(uniqueIds), "카드, 유물, 적, 이벤트 ID는 모두 고유해야 합니다.");
  record("character", "완성 캐릭터와 시작 덱", CHARACTER.name && CHARACTER.starterRelic && STARTER_DECK.length >= 10 && CHARACTER.mechanics.length >= 3, "캐릭터는 이름, 시작 유물, 시작 덱, 고유 메커니즘 설명을 가져야 합니다.", { name: CHARACTER.name, starterDeck: STARTER_DECK.length, mechanics: CHARACTER.mechanics });
  record("build-axes", "4개 이상의 덱 방향 축", axes.filter((axis) => axis.rewardCards >= 4).length >= 4, "보상 카드 기준으로 최소 4개 이상의 빌드 축이 실제 카드 풀에 있어야 합니다.", axes);
  record("relic-timings", "유물 발동 시점 다양성", relicTimings.size >= 6 && REWARD_RELIC_IDS.length >= 30, "유물은 여러 발동 시점을 가져야 하며 보상 풀에 충분히 들어 있어야 합니다.", { timingCount: relicTimings.size, timings: [...relicTimings], rewardRelics: REWARD_RELIC_IDS.length });
  record("enemy-boss-patterns", "적/보스 패턴 완성도", bossPhases && NORMAL_ENEMY_IDS.length >= 15 && ELITE_ENEMY_IDS.length >= 5 && BOSS_IDS.length >= 3, "보스는 단계 전환과 2단계 행동을 가져야 하고 적 풀이 충분해야 합니다.", { normal: NORMAL_ENEMY_IDS.length, elite: ELITE_ENEMY_IDS.length, bosses: BOSS_IDS.length });
  record("events", "이벤트 선택지 리스크/보상", EVENTS.length >= 20 && EVENTS.every((event) => event.choices?.length >= 2 && event.choices.every((choice) => choice.label && choice.detail && Array.isArray(choice.effects))), "모든 이벤트는 2개 이상의 설명 있는 선택지를 가져야 합니다.", { events: EVENTS.length });
  record("route-choice", "첫 엘리트 강제 방지", routeHasOptionalEliteFork(run), "각 막의 첫 엘리트 직전에는 비엘리트 대안 경로가 남아야 합니다.");
  record("screens", "필수 화면과 안내", ["새 런 시작", "이어하기", "설정", "게임 정보", "기록", "코덱스", "가이드"].every((text) => mainSource.includes(text)), "시작, 이어하기, 설정, 정보, 기록, 코덱스, 가이드 화면이 노출되어야 합니다.");
  record("settings-accessibility", "접근성/설정 항목", ["volume", "musicVolume", "preview-sound", "preview-music", "motionSpeed", "textScale", "highContrast", "tacticalAdvisor"].every((key) => mainSource.includes(key)), "효과음/배경음 조절과 미리듣기, 애니메이션, 텍스트 크기, 고대비, 플레이 힌트 설정이 있어야 합니다.");
  record(
    "danger-dialog-keyboard-safety",
    "위험 행동 확인 키보드 안전",
    ["activeConfirmationDialog", "activeManagedDialog", "closePendingConfirmation", "focusPendingDialogControl", "trapDialogFocus", "data-dialog-initial-focus"].every((text) => mainSource.includes(text)) &&
      mainSource.includes('event.key === "Escape"') &&
      mainSource.includes("closePendingConfirmation()"),
    "새 런 덮어쓰기, 저장 삭제, 런 포기 확인은 안전한 버튼에 초기 포커스를 두고 Tab/Esc 키보드 흐름을 막지 않아야 합니다."
  );
  record(
    "selector-dialog-keyboard-safety",
    "강화/제거 선택 키보드 안전",
    ["activeDeckSelectorDialog", "selector-modal", 'role="dialog"', 'aria-modal="true"', 'data-dialog-initial-focus data-action="deck-cancel"'].every((text) => mainSource.includes(text)),
    "강화/제거 카드 선택 모달은 모달 역할, 안전한 취소 초기 포커스, Tab 순환 관리 대상이어야 합니다."
  );
  record(
    "mobile-touch-targeting",
    "모바일/태블릿 대상 전환 조작",
    ["renderTargetSwitcher", "cycle-enemy", "cycleCombatTarget"].every((text) => mainSource.includes(text)) &&
      [".target-switcher", ".target-switch-button", "touch-action: manipulation"].every((text) => styleSource.includes(text)) &&
      readme.includes("터치 대상 전환") &&
      mobileCombatQa?.targetSwitchReady &&
      tabletCombatQa?.targetSwitchReady,
    "작은 화면 전투에는 손가락으로 이전/다음 적을 바꾸는 버튼과 최신 브라우저 검증 증거가 있어야 합니다.",
    {
      mobile: {
        targetSwitchReady: mobileCombatQa?.targetSwitchReady ?? false,
        targetSwitchSelection: mobileCombatQa?.targetSwitchSelection ?? null,
        targetSwitchText: mobileCombatQa?.targetSwitchText ?? ""
      },
      tablet: {
        targetSwitchReady: tabletCombatQa?.targetSwitchReady ?? false,
        targetSwitchSelection: tabletCombatQa?.targetSwitchSelection ?? null,
        targetSwitchText: tabletCombatQa?.targetSwitchText ?? ""
      }
    }
  );
  record("music-variation", "음악 루프 변주와 믹싱", ["playMusicMotif", "playMusicVariation", "playMusicBridge", "playMusicTransition", "variationEvery", "bridgeEvery", "createDynamicsCompressor", "boss_lastgate_phase2", "duckMusicForCue", "musicDuckRatioForCue"].every((text) => mainSource.includes(text)), "배경음은 보스 모티프, 긴 간격의 변주/브리지 프레이즈, 테마 전환 프레이즈, 덕킹, 기본 믹싱 버스를 가져야 합니다.");
  record(
    "audio-mix-report",
    "효과음/배경음 믹스 리포트",
    Boolean(audioMixReport?.ok) &&
      (audioMixReport.sourceFingerprint ? audioMixReport.sourceFingerprint === audioMixSourceFingerprint : audioMixReportMtime >= sourceMtime) &&
      audioMixReport.checks?.every((check) => check.ok) &&
      audioMixReport.gain?.duckMinRatio >= 0.5 &&
      audioMixReport.gain?.maxCueGain <= 0.065,
    "효과음과 배경음의 상대 볼륨, 덕킹, 믹스 버스 검증 리포트가 최신이어야 합니다.",
    {
      checkedAt: audioMixReport?.checkedAt,
      sourceFreshAfter: new Date(sourceMtime).toISOString(),
      sourceFingerprint: audioMixSourceFingerprint,
      reportMtime: audioMixReportMtime ? new Date(audioMixReportMtime).toISOString() : null,
      gain: audioMixReport?.gain,
      checks: audioMixReport?.checks
    }
  );
  record(
    "release-playtest-report",
    "출시 플레이테스트 리포트",
    Boolean(playtestReport?.ok) &&
      (playtestReport.sourceFingerprint ? playtestReport.sourceFingerprint === playtestSourceFingerprint : playtestReportMtime >= playtestSourceMtime) &&
      playtestReport.scenarios?.length >= 2 &&
      playtestReport.scenarios.every((scenario) => Object.values(scenario.checks ?? {}).every(Boolean)) &&
      playtestReport.scenarios.some((scenario) =>
        scenario.id === "surface-full-clear" &&
        scenario.won === true &&
        scenario.floors >= 21 &&
        scenario.bossesDefeated >= 3 &&
        ["combat", "event", "shop", "rest", "elite", "boss"].every((type) => scenario.routeTypes?.includes(type))
      ) &&
      playtestReport.scenarios.some((scenario) =>
        scenario.id === "deep-final-boss-loss" &&
        scenario.won === false &&
        scenario.floors >= 21 &&
        scenario.finalBoss?.bossPhase === 2 &&
        /쓰러졌습니다/.test(scenario.reason ?? "")
      ) &&
      playtestReport.persistence?.id === "save-reload-recovery" &&
      Object.values(playtestReport.persistence?.checks ?? {}).every(Boolean) &&
      /백업/.test(playtestReport.persistence?.recovered?.noticeTitle ?? "") &&
      /이어하기/.test(playtestReport.persistence?.recovered?.noticeDetail ?? "") &&
      playtestReport.settings?.id === "settings-persistence" &&
      Object.values(playtestReport.settings?.checks ?? {}).every(Boolean) &&
      playtestReport.settings?.reloaded?.highContrast === true &&
      playtestReport.settings?.reloaded?.tacticalAdvisor === false &&
      playtestReport.safety?.id === "danger-confirmations" &&
      Object.values(playtestReport.safety?.checks ?? {}).every(Boolean) &&
      playtestReport.safety?.summary?.abandoned === true &&
      /탐사를 중단/.test(playtestReport.safety?.summary?.reason ?? ""),
    "고정 시드 출시 플레이테스트는 표층 완주, 최심층 최종 보스 패배, 새로고침 뒤 이어하기와 백업 복구, 설정 저장과 재로드, 런 포기 요약을 재현해야 합니다.",
    {
      sourceFreshAfter: new Date(playtestSourceMtime).toISOString(),
      sourceFingerprint: playtestSourceFingerprint,
      reportMtime: playtestReportMtime ? new Date(playtestReportMtime).toISOString() : null,
      summary: playtestReport?.summary ?? null,
      scenarios: playtestReport?.scenarios?.map((scenario) => ({
        id: scenario.id,
        seed: scenario.seed,
        difficultyName: scenario.difficultyName,
        won: scenario.won,
        floors: scenario.floors,
        routeTypes: scenario.routeTypes,
        reason: scenario.reason
      })) ?? [],
      persistence: {
        id: playtestReport?.persistence?.id ?? null,
        seed: playtestReport?.persistence?.seed ?? null,
        savedPhase: playtestReport?.persistence?.savedPhase ?? null,
        recovered: playtestReport?.persistence?.recovered ?? null,
        checks: playtestReport?.persistence?.checks ?? null
      },
      settings: {
        id: playtestReport?.settings?.id ?? null,
        key: playtestReport?.settings?.key ?? null,
        reloaded: playtestReport?.settings?.reloaded ?? null,
        checks: playtestReport?.settings?.checks ?? null
      },
      safety: {
        id: playtestReport?.safety?.id ?? null,
        summary: playtestReport?.safety?.summary ?? null,
        checks: playtestReport?.safety?.checks ?? null
      }
    }
  );
  record("save-records", "저장/이어하기/기록 코드", ["loadRunFromStorage", "saveRunToStorage", "deleteSavedRun", "recordRunSummary"].every((text) => mainSource.includes(text)), "로컬 저장, 삭제, 기록 집계 코드가 연결되어야 합니다.");
  record(
    "art-assets",
    "PNG 스프라이트/배경 아틀라스",
    [atlas, cardAtlas, arenaAtlas, arenaProps, eventBackdrops, cardUiIcons, hudIcons, mapNodeIcons, relicIcons, resourceIcons, shopServiceIcons, statusIcons, enemyPortraits, combatSprites, playerCombatant, catalogerCombatant, algorithmCombatant, lastGateCombatant, catalogerPhaseTwoCombatant, algorithmPhaseTwoCombatant, lastGatePhaseTwoCombatant, bailiffCombatant, engineCombatant, knightCombatant, cantorCombatant, colossusCombatant, ...enemyCombatants].every((asset) => asset.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") &&
      cardAtlasSize?.width === 2880 &&
      cardAtlasSize?.height === 2304 &&
      eventBackdropSize?.width === 2304 &&
      eventBackdropSize?.height === 864 &&
      cardUiIconSize?.width === 1792 &&
      cardUiIconSize?.height === 128 &&
      hudIconSize?.width === 256 &&
      hudIconSize?.height === 128 &&
      mapNodeIconSize?.width === 768 &&
      mapNodeIconSize?.height === 128 &&
      relicIconSize?.width === 3712 &&
      relicIconSize?.height === 128 &&
      resourceIconSize?.width === 640 &&
      resourceIconSize?.height === 128 &&
      shopServiceIconSize?.width === 384 &&
      shopServiceIconSize?.height === 128 &&
      statusIconSize?.width === 2560 &&
      statusIconSize?.height === 128 &&
      combatantDimensions.every((size) => size?.width === 1024 && size?.height === 1536) &&
      ["sprite-atlas.png", "card-illustrations.png", "arena-backdrops.png", "arena-props.png", "event-backdrops.png", "card-ui-icons.png", "hud-icons.png", "map-node-icons.png", "relic-icons.png", "resource-icons.png", "shop-service-icons.png", "status-icons.png", "enemy-portraits.png", "combat-sprites.png", "combatants/player-echo-diver.png"].every((asset) => styleSource.includes(asset)) &&
      styleSource.includes("card-illustrations.png?v=20260521-cardart4") &&
      ["combatants/boss-cataloger.png", "combatants/boss-algorithm.png", "combatants/boss-lastgate.png", "combatants/boss-cataloger-phase2.png", "combatants/boss-algorithm-phase2.png", "combatants/boss-lastgate-phase2.png", "combatants/elite-bailiff.png", "combatants/elite-engine.png", "combatants/elite-knight.png", "combatants/elite-cantor.png", "combatants/elite-colossus.png", "combatants/enemy-${template.sprite}.png", "--enemy-sprite-image"].every((asset) => mainSource.includes(asset)) &&
      ["sprite-motion-echo", "sprite-ground-burst", "sprite-action-echo-player", "sprite-action-echo-enemy", "sprite-hit-echo", "sprite-ground-collapse", "--sprite-shift-x"].every((token) => styleSource.includes(token) || mainSource.includes(token)) &&
      ["draw_identity_motif", "identity_strength", "draw_small_runes"].every((token) => cardArtScriptSource.includes(token)) &&
      ["PHASE_TWO_OUTPUTS", "compose_phase_two_sprite", "draw_lastgate_phase", "SPRITE_FRAME_OVERRIDES", "frame_for"].every((token) => combatantScriptSource.includes(token)) &&
      mainSource.includes("ENEMY_SPRITE_POSES") &&
      mainSource.includes("data-atlas-cell") &&
      mainSource.includes("data-portrait-cell"),
    "카드/적/전투 배경 아트는 PNG 아틀라스와 아틀라스 셀, 카드별 전경 모티프, 적별 포즈 보정, 보스 2단계 전용 PNG, 스프라이트 동작 피드백을 사용해야 합니다.",
    { spriteBytes: atlas.length, cardBytes: cardAtlas.length, cardAtlasSize, arenaBytes: arenaAtlas.length, arenaPropBytes: arenaProps.length, eventBackdropBytes: eventBackdrops.length, eventBackdropSize, cardUiIconBytes: cardUiIcons.length, cardUiIconSize, hudIconBytes: hudIcons.length, hudIconSize, mapNodeIconBytes: mapNodeIcons.length, mapNodeIconSize, relicIconBytes: relicIcons.length, relicIconSize, resourceIconBytes: resourceIcons.length, resourceIconSize, shopServiceIconBytes: shopServiceIcons.length, shopServiceIconSize, statusIconBytes: statusIcons.length, statusIconSize, enemyPortraitBytes: enemyPortraits.length, combatSpriteBytes: combatSprites.length, combatantCanvas: combatantDimensions[0], playerCombatantBytes: playerCombatant.length, catalogerCombatantBytes: catalogerCombatant.length, algorithmCombatantBytes: algorithmCombatant.length, lastGateCombatantBytes: lastGateCombatant.length, catalogerPhaseTwoCombatantBytes: catalogerPhaseTwoCombatant.length, algorithmPhaseTwoCombatantBytes: algorithmPhaseTwoCombatant.length, lastGatePhaseTwoCombatantBytes: lastGatePhaseTwoCombatant.length, bailiffCombatantBytes: bailiffCombatant.length, engineCombatantBytes: engineCombatant.length, knightCombatantBytes: knightCombatant.length, cantorCombatantBytes: cantorCombatant.length, colossusCombatantBytes: colossusCombatant.length, enemyCombatants: enemyCombatants.length }
  );
  record(
    "relic-raster-icons",
    "유물 래스터 아이콘",
    relicIconSize?.width === 3712 &&
      relicIconSize?.height === 128 &&
      mainSource.includes('class="relic-icon icon-${relic.icon}"') &&
      !mainSource.includes("data-glyph") &&
      !mainSource.includes("relicIconGlyph") &&
      styleSource.includes("relic-icons.png") &&
      styleSource.includes("background-size: 2900% 100%") &&
      relicIconScriptSource.includes('"hourglass"') &&
      relicIconScriptSource.includes('"weight"'),
    "유물 표식은 문자 glyph가 아니라 29셀 PNG 스프라이트에서 가져와야 합니다.",
    { relicIconSize, relicIconBytes: relicIcons.length }
  );
  record(
    "map-raster-node-icons",
    "맵 노드 래스터 아이콘",
    mapNodeIconSize?.width === 768 &&
      mapNodeIconSize?.height === 128 &&
      mainSource.includes('class="node-icon node-icon-${safeType}"') &&
      !mainSource.includes('<svg class="node-icon') &&
      styleSource.includes("map-node-icons.png") &&
      styleSource.includes("background-size: 600% 100%") &&
      mapNodeIconScriptSource.includes('TYPES = ["combat", "elite", "event", "shop", "rest", "boss"]'),
    "지도와 경로 카드의 노드 표식은 인라인 SVG가 아니라 6셀 PNG 스프라이트에서 가져와야 합니다.",
    { mapNodeIconSize, mapNodeIconBytes: mapNodeIcons.length }
  );
  record(
    "hud-raster-icons",
    "상단 HUD 래스터 아이콘",
    hudIconSize?.width === 256 &&
      hudIconSize?.height === 128 &&
      mainSource.includes('class="hud-icon hud-icon-deck"') &&
      mainSource.includes('class="hud-icon hud-icon-settings"') &&
      mainSource.includes('aria-label="덱 ${run.player.deck.length}장 보기"') &&
      !styleSource.includes('content: "▤') &&
      !styleSource.includes('content: "⚙"') &&
      styleSource.includes("hud-icons.png") &&
      styleSource.includes("background-size: 200% 100%") &&
      hudIconScriptSource.includes('ICONS = ["deck", "settings"]'),
    "상단 덱/설정 버튼은 문자 glyph가 아니라 2셀 PNG 스프라이트에서 가져와야 합니다.",
    { hudIconSize, hudIconBytes: hudIcons.length }
  );
  record(
    "topbar-brand-raster-button",
    "런 상단 브랜드 래스터 버튼",
    mainSource.includes('aria-label="시작 화면으로 돌아가기"') &&
      mainSource.includes('class="brand-button-mark" aria-hidden="true"') &&
      mainSource.includes('class="brand-button-label">딥 시그널') &&
      styleSource.includes(".top-bar .brand-button") &&
      styleSource.includes("flex: 0 0 44px") &&
      styleSource.includes(".brand-button-mark") &&
      styleSource.includes("deep-signal-mark.png?v=20260523-title2") &&
      styleSource.includes("color: transparent") &&
      styleSource.includes(".phase-shop > .top-bar") &&
      styleSource.includes('.phase-shop > .top-bar .hud-stat:nth-of-type(n + 3)') &&
      captureSource.includes("usesBrandRasterButton") &&
      captureSource.includes("compactTopBar"),
    "상점처럼 상단 정보가 많은 화면에서도 브랜드 텍스트나 난이도 표시가 세로로 깨지지 않도록, 런 상단 바는 전용 래스터 마크와 압축된 필수 정보로 표시되어야 합니다."
  );
  record(
    "card-ui-raster-icons",
    "카드/전투 효과 래스터 아이콘",
    cardUiIconSize?.width === 1792 &&
      cardUiIconSize?.height === 128 &&
      mainSource.includes("function cardUiIconClass(key)") &&
      mainSource.includes("function cardTypeIconClass(type)") &&
      mainSource.includes("function cardOutcomeIconClass(visual = {})") &&
      mainSource.includes('class="${cardOutcomeIconClass(visual)}" aria-hidden="true"') &&
      mainSource.includes('class="${enemyIntentIconClass(move)}" aria-hidden="true"') &&
      !mainSource.includes("function cardTypeIcon(type)") &&
      !mainSource.includes("function enemyIntentIconLabel") &&
      !styleSource.includes('content: "⚡"') &&
      styleSource.includes("card-ui-icons.png") &&
      styleSource.includes("background-size: 1400% 100%") &&
      cardUiIconScriptSource.includes('ICONS = ["attack", "skill", "power", "status", "curse", "damage", "block", "draw", "energy", "heal", "card", "relic", "warn", "generic"]'),
    "카드 타입, 카드 효과 칩, 전투 예고, 적 의도, 피해 팝업은 문자 기호가 아니라 14셀 PNG 스프라이트에서 가져와야 합니다.",
    { cardUiIconSize, cardUiIconBytes: cardUiIcons.length }
  );
  record(
    "shop-service-raster-icons",
    "상점 정비 래스터 아이콘",
    shopServiceIconSize?.width === 384 &&
      shopServiceIconSize?.height === 128 &&
      mainSource.includes('class="shop-service-icon shop-service-icon-${service}"') &&
      ["heal", "remove", "upgrade"].every((service) => styleSource.includes(`.shop-service-icon-${service}`)) &&
      !mainSource.includes("function shopServiceGlyph") &&
      styleSource.includes("shop-service-icons.png") &&
      styleSource.includes("background-size: 300% 100%") &&
      shopServiceIconScriptSource.includes('ICONS = ["heal", "remove", "upgrade"]'),
    "상점의 회복/제거/강화 정비 버튼은 문자 기호가 아니라 3셀 PNG 스프라이트에서 가져와야 합니다.",
    { shopServiceIconSize, shopServiceIconBytes: shopServiceIcons.length }
  );
  record(
    "status-raster-icons",
    "상태 효과 래스터 아이콘",
    statusIconSize?.width === 2560 &&
      statusIconSize?.height === 128 &&
      mainSource.includes("function statusIconClass(keyword)") &&
      mainSource.includes('data-status-key="more"') &&
      !mainSource.includes("function statusIcon(keyword)") &&
      styleSource.includes("status-icons.png") &&
      styleSource.includes("background-size: 2000% 100%") &&
      statusIconScriptSource.includes('"vulnerable"') &&
      statusIconScriptSource.includes('"haste"') &&
      statusIconScriptSource.includes('"more"'),
    "상태 효과 칩과 상태 툴팁은 문자 glyph가 아니라 20셀 PNG 스프라이트에서 가져와야 합니다.",
    { statusIconSize, statusIconBytes: statusIcons.length }
  );
  record(
    "resource-raster-icons",
    "전투 자원 래스터 아이콘",
    resourceIconSize?.width === 640 &&
      resourceIconSize?.height === 128 &&
      mainSource.includes('class="combat-energy-mark ${resourceIconClass("energy")}"') &&
      mainSource.includes('class="pile-icon ${resourceIconClass(id)}"') &&
      mainSource.includes("function resourceIconClass(id)") &&
      !mainSource.includes("function combatPileIcon(id)") &&
      !mainSource.includes('<span aria-hidden="true">⚡</span>') &&
      styleSource.includes("resource-icons.png") &&
      styleSource.includes("background-size: 500% 100%") &&
      resourceIconScriptSource.includes('ICONS = ["energy", "draw", "hand", "discard", "exhaust"]'),
    "에너지와 전투 더미 아이콘은 문자 glyph가 아니라 5셀 PNG 스프라이트에서 가져와야 합니다.",
    { resourceIconSize, resourceIconBytes: resourceIcons.length }
  );
  record("no-card-enemy-svg-placeholders", "카드/적 SVG 플레이스홀더 없음", !/\\.card-art-svg|\\.enemy-sprite svg|<svg class=\"card-art|<svg class=\"enemy/.test(styleSource + mainSource), "카드와 적 아트는 임시 SVG 플레이스홀더가 아니어야 합니다.");
  record(
    "enemy-silhouette-depth",
    "적 실루엣/전투 FX 초점",
    mainSource.includes('class="enemy-silhouette-glow"') &&
      mainSource.includes('class="enemy-sprite-rim"') &&
      styleSource.includes(".enemy-silhouette-glow") &&
      styleSource.includes(".enemy-sprite-rim") &&
      styleSource.includes(".combat-board.fx-active .enemy-card:not(.fx-source):not(.fx-hit):not(.fx-target):not(.fx-defeated) .enemy-sprite-art") &&
      enemyDensityQa?.silhouetteReady &&
      enemyDensityQa?.fxFocusReady &&
      enemyDensityQa?.silhouetteLayers?.length >= 4 &&
      enemyDensityQa.silhouetteLayers.every((item) => item.hasGlow && item.hasRim && item.glowVisible && item.rimVisible && item.artHasDepthFilter),
    "4체 조우에서는 적별 실루엣 레이어가 확인되어야 하고, 전투 FX 중 비참여 적은 실제 브라우저 QA에서 감쇠되어야 합니다.",
    {
      silhouetteReady: enemyDensityQa?.silhouetteReady ?? false,
      fxFocusReady: enemyDensityQa?.fxFocusReady ?? false,
      fxFocusSample: enemyDensityQa?.fxFocusSample ?? null,
      layers: enemyDensityQa?.silhouetteLayers ?? []
    }
  );
  record(
    "enemy-turn-fx-single-line",
    "상대 턴 공격 FX 단일화",
    styleSource.includes(".combat-board.fx-active .enemy-intent-lane") &&
      !/\.combat-board\.turn-cue-enemy:not\(\.fx-active\) \.enemy-card[\s\S]*animation:\s*enemy-turn-step/.test(styleSource) &&
      !/\.combat-board\.turn-cue-enemy:not\(\.fx-active\) \.enemy-card\.intent-attack-player \.enemy-sprite \.sprite-ground-burst/.test(styleSource) &&
      groupedEnemyFxQa?.duplicateFxCount === 1 &&
      groupedEnemyFxQa?.attackTrailCount === 1 &&
      groupedEnemyFxQa?.visibleIntentLaneCount === 0 &&
      groupedEnemyFxQa?.singleResolvedAttackCue &&
      groupedEnemyFxQa?.preFx?.preFxEnemyActionClean &&
      groupedEnemyFxQa?.visibleSparkCount === 0 &&
      groupedEnemyFxQa?.visiblePlayerImpactRingCount === 0,
    "상대 턴 실제 공격 중에는 예고선, 피격 보조선, 턴 전환 모션이 실제 공격 궤적을 복제해 보이지 않아야 합니다.",
    {
      duplicateFxCount: groupedEnemyFxQa?.duplicateFxCount ?? null,
      attackTrailCount: groupedEnemyFxQa?.attackTrailCount ?? null,
      visibleIntentLaneCount: groupedEnemyFxQa?.visibleIntentLaneCount ?? null,
      visibleSparkCount: groupedEnemyFxQa?.visibleSparkCount ?? null,
      visiblePlayerImpactRingCount: groupedEnemyFxQa?.visiblePlayerImpactRingCount ?? null,
      preFxEnemyActionClean: groupedEnemyFxQa?.preFx?.preFxEnemyActionClean ?? false,
      singleResolvedAttackCue: groupedEnemyFxQa?.singleResolvedAttackCue ?? false
    }
  );
  record(
    "title-raster-identity-assets",
    "타이틀 핵심 마크 래스터 자산",
    titleMarkPng?.width >= 256 &&
      titleMarkPng?.height >= 256 &&
      diverEmblemPng?.width >= 256 &&
      diverEmblemPng?.height >= 256 &&
      mainSource.includes("./public/assets/deep-signal-mark.png") &&
      mainSource.includes("./public/assets/echo-diver-emblem.png") &&
      styleSource.includes("deep-signal-mark.png") &&
      titleIdentityScriptSource.includes("draw_deep_signal_mark") &&
      titleIdentityScriptSource.includes("draw_echo_diver_emblem") &&
      titleIdentityQa?.ok === true,
    "시작 화면의 브랜드 마크와 캐릭터 엠블럼은 약어 텍스트나 SVG 플레이스홀더가 아니라 재생성 가능한 PNG 게임 자산이어야 합니다.",
    { titleMarkPng, diverEmblemPng, titleIdentityQa }
  );
  record("korean-copy", "한국어 우선 카피", !/(장서관|맥동 창|상태 대응을 시험|초반 빌드 선언|덱 순환 압박|Slay the Spire 클론)/.test(mainSource + readme), "사용자에게 보이는 주요 카피에 어색한 번역투와 클론 표현이 없어야 합니다.");
  record(
    "korean-copy-report",
    "한국어 문구 검수 리포트",
    Boolean(koreanCopyReport?.ok) &&
      (koreanCopyReport.sourceFingerprint ? koreanCopyReport.sourceFingerprint === koreanCopySourceFingerprint : koreanCopyReportMtime >= koreanCopySourceMtime) &&
      koreanCopyReport.summary?.violations === 0 &&
      koreanCopyReport.summary?.missingRequired === 0 &&
      koreanCopyReport.checks?.titleCopy?.awkwardCopyGone === true &&
      koreanCopyReport.checks?.titleCopy?.copyReady === true,
    "qa/korean-copy-report.json은 최신 사용자 노출 문구를 검사하고 어색한 번역투, 영어 우선 표현, 필수 용어 누락이 없음을 증명해야 합니다.",
    {
      generatedAt: koreanCopyReport?.generatedAt ?? null,
      sourceFreshAfter: new Date(koreanCopySourceMtime).toISOString(),
      sourceFingerprint: koreanCopySourceFingerprint,
      reportMtime: koreanCopyReportMtime ? new Date(koreanCopyReportMtime).toISOString() : null,
      summary: koreanCopyReport?.summary ?? null,
      titleCopy: koreanCopyReport?.checks?.titleCopy ?? null
    }
  );
  record("distribution-polish", "배포 기본 메타와 에셋 경로", indexSource.includes('rel="icon"') && indexSource.includes("./public/assets/favicon.svg") && indexSource.includes("theme-color") && faviconSource.includes("<svg") && !styleSource.includes('url("./public/assets/'), "정적 배포에서 favicon과 주요 CSS 에셋 경로가 404를 만들지 않아야 합니다.", { favicon: "./public/assets/favicon.svg" });
  const hasPagesWorkflow =
    deployWorkflowSource.includes("branches: [main]") &&
    deployWorkflowSource.includes("npm test") &&
    deployWorkflowSource.includes("npm run copy:audit") &&
    deployWorkflowSource.includes("npm run build") &&
    deployWorkflowSource.includes("npm run audit") &&
    deployWorkflowSource.includes("pages: write") &&
    deployWorkflowSource.includes("id-token: write") &&
    deployWorkflowSource.includes("actions/configure-pages@v6") &&
    deployWorkflowSource.includes("actions/upload-pages-artifact@v5") &&
    deployWorkflowSource.includes("actions/deploy-pages@v5") &&
    deployWorkflowSource.includes("path: dist");
  record(
    "pages-deploy-workflow",
    "GitHub Pages 배포 준비",
    hasPagesWorkflow && readme.includes("https://kibak812.github.io/deep-signal/") && readme.includes("Pages artifact") && readme.includes("npm run copy:audit") && readme.includes("npm run audit") && buildSource.includes(".nojekyll"),
    "GitHub Actions가 테스트, 한국어 문구 검수, 빌드, 출시 감사를 통과한 dist 폴더를 Pages artifact로 게시할 수 있어야 합니다.",
    { workflow: ".github/workflows/deploy-pages.yml", mode: "github-actions-pages", publishDir: "dist" }
  );
  record("dist-build", "정적 빌드 산출물", await exists(resolve(root, "dist/index.html")) && await exists(resolve(root, "dist/.nojekyll")) && await exists(resolve(root, "dist/src/main.js")) && await exists(resolve(root, "dist/public/assets/sprite-atlas.png")), "dist 폴더에 정적 실행 산출물과 GitHub Pages용 .nojekyll 파일이 있어야 합니다.");
  const rewardGuidance = balance.finalBossAnalysis?.rewardGuidance;
  const reserveSignals = balance.finalBossAnalysis?.reserveSignals;
  const longRewardGuidance = longBalance.finalBossAnalysis?.rewardGuidance;
  const longReserveSignals = longBalance.finalBossAnalysis?.reserveSignals;
  const finalBossGuidance = finalBossGuidanceBounds(balance);
  const longFinalBossGuidance = finalBossGuidanceBounds(longBalance);
  const playableBuilds = playableArchetypeCoverage(balance, { minimumRuns: 18 });
  const longPlayableBuilds = playableArchetypeCoverage(longBalance, { minimumRuns: 36 });
  record(
    "balance-report",
    "밸런스 리포트 안정성",
    balance.totals?.runs >= 108 &&
      balance.sourceFingerprint === balanceSourceFingerprint &&
      balance.totals?.problemRuns === 0 &&
      balance.totals?.winRate >= 0.25 &&
      balance.totals?.winRate <= 0.75 &&
      easiest?.winRate >= 0.45 &&
      hardest?.winRate <= 0.45 &&
      rewardGuidance?.samples >= 120 &&
      rewardGuidance?.defensiveShare <= 0.72 &&
      rewardGuidance?.defenseWhileFinishMissing === 0 &&
      reserveSignals?.reached >= 80 &&
      reserveSignals?.averageSignalsPerReached <= 2.4 &&
      reserveSignals?.maxSignalsPerRun <= 5,
    "밸런스 자동 플레이는 진행 불가가 없고, 전체/입문/최상위 난이도 승률과 최종 보스 보상/마무리 안내 지표가 허용 범위에 있어야 합니다.",
    { sourceFingerprint: balanceSourceFingerprint, totals: balance.totals, easiest, hardest, rewardGuidance, reserveSignals }
  );
  record(
    "balance-long-report",
    "장시간 밸런스 리포트",
    longBalance.totals?.runs >= 216 &&
      longBalance.sourceFingerprint === balanceSourceFingerprint &&
      longBalance.config?.seedCount >= 36 &&
      longBalance.totals?.problemRuns === 0 &&
      longBalance.totals?.winRate >= 0.25 &&
      longBalance.totals?.winRate <= 0.75 &&
      longEasiest?.winRate >= 0.45 &&
      longHardest?.winRate >= 0.2 &&
      longHardest?.winRate <= 0.45 &&
      longHardest?.averageFloors >= 16 &&
      longBalance.byDifficulty?.every((entry) => entry.problemRuns === 0) &&
      longRewardGuidance?.samples >= 240 &&
      longRewardGuidance?.defensiveShare <= 0.72 &&
      longRewardGuidance?.defenseWhileFinishMissing === 0 &&
      longReserveSignals?.reached >= 160 &&
      longReserveSignals?.averageSignalsPerReached <= 2.4 &&
      longReserveSignals?.maxSignalsPerRun <= 5,
    "장시간 자동 플레이도 진행 불가 없이 전체 승률 허용 범위 안에 있어야 하며, 최상위 난이도와 최종 보스 보상/마무리 안내 지표가 안정적이어야 합니다.",
    { sourceFingerprint: balanceSourceFingerprint, config: longBalance.config, totals: longBalance.totals, byDifficulty: longBalance.byDifficulty, easiest: longEasiest, hardest: longHardest, rewardGuidance: longRewardGuidance, reserveSignals: longReserveSignals }
  );
  record(
    "build-diversity-playtest",
    "자동 플레이 빌드 다양성",
    playableBuilds.filter((entry) => entry.playable).length >= 4 &&
      longPlayableBuilds.filter((entry) => entry.playable).length >= 4 &&
      (longBalance.primaryBuilds ?? []).filter((entry) => entry.runs >= 24).length >= 4,
    "밸런스 자동 플레이는 최소 4개 이상의 덱 방향을 의도적으로 샘플링하고, 각 방향이 충분한 도달층/승률/주력 일치율을 보여야 합니다.",
    {
      baseline: playableBuilds,
      long: longPlayableBuilds,
      primaryBuilds: longBalance.primaryBuilds,
      bounds: {
        baselineMinimumRuns: 18,
        longMinimumRuns: 36,
        minimumAverageFloors: 15,
        minimumWinRate: 0.18,
        minimumPrimaryMatchRate: 0.35,
        longPrimaryRuns: 24
      }
    }
  );
  record(
    "final-boss-guidance-bounds",
    "최종 보스 추천/경고 피로도",
    finalBossGuidanceWithinBounds(finalBossGuidance, 120) &&
      finalBossGuidanceWithinBounds(longFinalBossGuidance, 240),
    "마지막 문 직전 추천은 방어만 과하게 밀지 않아야 하고, 마무리 보존 경고는 부족하지도 과하지도 않은 빈도로 관측되어야 합니다.",
    {
      baseline: finalBossGuidance,
      long: longFinalBossGuidance,
      bounds: {
        defensiveShareMax: 0.62,
        defenseWithoutNeedShareMax: 0.08,
        signalRunRateRange: [0.55, 0.95],
        averageSignalsPerReachedRange: [0.6, 1.6],
        maxSignalsPerRunMax: 4
      }
    }
  );
  record(
    "credits-license",
    "크레딧/라이선스 안내",
    packageJson.license === "UNLICENSED" && requiredReleaseInfo.every((text) => mainSource.includes(text)) && readme.includes("크레딧") && readme.includes("이용 안내·라이선스"),
    "게임 정보 화면과 README에는 조작, 크레딧, 이용 안내, 저작권 안내가 명확히 들어 있어야 합니다.",
    { license: packageJson.license, requiredReleaseInfo }
  );
  record(
    "verified-flow-coverage",
    "끝까지 플레이 검증 근거",
    requiredFlowDocs.every((text) => readme.includes(text)) && requiredFlowTests.every((text) => testSource.includes(text)),
    "README와 자동 테스트에는 새 런, 전투, 보상, 맵, 상점, 휴식, 보스, 승패, 저장 복구 검증 근거가 남아야 합니다.",
    { requiredFlowDocs, requiredFlowTests }
  );
  record(
    "browser-qa-artifacts",
    "최신 브라우저 검증 산출물",
    requiredBrowserQa.every((item) => browserQa.freshFiles.some((file) => item.match.test(file))) && browserQa.freshFiles.length >= 8 && browserQa.staleCount === 0,
    "qa 폴더에는 현재 소스 변경 이후 다시 찍은 전투, 맵, 보상, 승리 연출, 보스 상태, 설정, 모바일, 코덱스 등 핵심 화면 브라우저 스크린샷만 남아야 합니다.",
    {
      required: requiredBrowserQa.map((item) => item.id),
      ...browserQa
    }
  );
  record("docs", "README 산출물 설명", ["실행", "구현 범위", "주요 시스템", "검증한 플로우", "검증 산출물", "출시 전 우선순위"].every((section) => readme.includes(`## ${section}`)), "README는 실행 방법, 콘텐츠 목록, 시스템 설명, 검증 플로우, 검증 산출물, 남은 우선순위를 포함해야 합니다.");

  const failed = checks.filter((check) => !check.ok);
  const passed = checks.length - failed.length;
  const report = {
    generatedAt: new Date().toISOString(),
    ok: failed.length === 0,
    passed,
    failed: failed.length,
    total: checks.length,
    summary: {
      passed,
      failed: failed.length,
      total: checks.length
    },
    checks
  };
  await mkdir(qaDir, { recursive: true });
  const reportWrite = await writeAuditReportIfChanged(report);

  if (failed.length) {
    console.error(`Release audit failed: ${failed.length}/${checks.length}`);
    for (const check of failed) console.error(`- ${check.id}: ${check.label} — ${check.detail}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Release audit passed: ${checks.length}/${checks.length}`);
  console.log(`${reportWrite.written ? "Wrote" : "Report unchanged at"} ${reportPath}`);
}

await main();
