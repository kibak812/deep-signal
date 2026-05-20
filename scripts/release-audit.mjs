import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
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

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
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
  const sourcePaths = [
    resolve(root, "index.html"),
    resolve(root, "src/main.js"),
    resolve(root, "src/styles.css"),
    resolve(root, "src/engine/game.js"),
    resolve(root, "src/data/cards.js"),
    resolve(root, "src/data/enemies.js"),
    resolve(root, "src/data/events.js"),
    resolve(root, "src/data/relics.js"),
    resolve(root, "public/assets/favicon.svg")
  ];
  const sourceMtime = await newestMtime(sourcePaths);
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
  const freshFiles = metadata.filter((item) => item.fresh).map((item) => item.file);
  const requiredFresh = requiredBrowserQa.map((item) => ({
    id: item.id,
    matched: freshFiles.filter((file) => item.match.test(file))
  }));
  return {
    sourceFreshAfter: new Date(sourceMtime).toISOString(),
    files: metadata,
    freshFiles,
    staleFiles: metadata.filter((item) => !item.fresh).map((item) => item.file),
    requiredFresh
  };
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

async function main() {
  const counts = contentCounts();
  const mainSource = await readFile(resolve(root, "src/main.js"), "utf8");
  const styleSource = await readFile(resolve(root, "src/styles.css"), "utf8");
  const indexSource = await readFile(resolve(root, "index.html"), "utf8");
  const faviconSource = await readFile(resolve(root, "public/assets/favicon.svg"), "utf8");
  const readme = await readFile(resolve(root, "README.md"), "utf8");
  const testSource = `${await readFile(resolve(root, "tests/engine.test.mjs"), "utf8")}\n${await readFile(resolve(root, "tests/content-integrity.test.mjs"), "utf8")}`;
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const balance = JSON.parse(await readFile(resolve(root, "qa/balance-report.json"), "utf8"));
  const qaFiles = await readdir(qaDir).catch(() => []);
  const atlas = await readFile(resolve(root, "public/assets/sprite-atlas.png"));
  const cardAtlas = await readFile(resolve(root, "public/assets/card-illustrations.png"));
  const cardAtlasSize = pngDimensions(cardAtlas);
  const arenaAtlas = await readFile(resolve(root, "public/assets/arena-backdrops.png"));
  const arenaProps = await readFile(resolve(root, "public/assets/arena-props.png"));
  const eventBackdrops = await readFile(resolve(root, "public/assets/event-backdrops.png"));
  const eventBackdropSize = pngDimensions(eventBackdrops);
  const enemyPortraits = await readFile(resolve(root, "public/assets/enemy-portraits.png"));
  const combatSprites = await readFile(resolve(root, "public/assets/combat-sprites.png"));
  const playerCombatant = await readFile(resolve(root, "public/assets/combatants/player-echo-diver.png"));
  const catalogerCombatant = await readFile(resolve(root, "public/assets/combatants/boss-cataloger.png"));
  const algorithmCombatant = await readFile(resolve(root, "public/assets/combatants/boss-algorithm.png"));
  const lastGateCombatant = await readFile(resolve(root, "public/assets/combatants/boss-lastgate.png"));
  const bailiffCombatant = await readFile(resolve(root, "public/assets/combatants/elite-bailiff.png"));
  const engineCombatant = await readFile(resolve(root, "public/assets/combatants/elite-engine.png"));
  const knightCombatant = await readFile(resolve(root, "public/assets/combatants/elite-knight.png"));
  const cantorCombatant = await readFile(resolve(root, "public/assets/combatants/elite-cantor.png"));
  const colossusCombatant = await readFile(resolve(root, "public/assets/combatants/elite-colossus.png"));
  const enemyCombatants = await Promise.all([...new Set(ENEMIES.map((enemy) => enemy.sprite))].map((sprite) => readFile(resolve(root, `public/assets/combatants/enemy-${sprite}.png`))));
  const combatantDimensions = [playerCombatant, catalogerCombatant, algorithmCombatant, lastGateCombatant, bailiffCombatant, engineCombatant, knightCombatant, cantorCombatant, colossusCombatant, ...enemyCombatants].map(pngDimensions);
  const axes = axisCoverage();
  const relicTimings = new Set(RELICS.map((relic) => relic.timing));
  const bossPhases = ENEMIES.filter((enemy) => enemy.tier === "boss").every((enemy) => enemy.phaseAt > 0 && enemy.phaseAt < 1 && enemy.phaseName && enemy.moves.some((move) => move.phase === 2));
  const run = newRun({ seed: "release-audit-route", difficulty: 0 });
  const hardest = balance.byDifficulty?.find((entry) => entry.difficulty === Math.max(...balance.byDifficulty.map((entry) => entry.difficulty))) ?? null;
  const easiest = balance.byDifficulty?.find((entry) => entry.difficulty === 0) ?? null;
  const requiredBrowserQa = [
    { id: "title", match: /browser-qa-title/ },
    { id: "about", match: /browser-qa-about/ },
    { id: "combat", match: /browser-qa-combat|browser-qa-responsive-combat/ },
    { id: "card-hover", match: /browser-qa-combat-card-hover/ },
    { id: "energy-locked-card", match: /browser-qa-combat-energy-locked/ },
    { id: "map", match: /browser-qa-map/ },
    { id: "reward", match: /browser-qa-reward/ },
    { id: "reward-relics", match: /browser-qa-reward-relics/ },
    { id: "event", match: /browser-qa-event/ },
    { id: "shop", match: /browser-qa-shop/ },
    { id: "rest", match: /browser-qa-rest/ },
    { id: "summary-lost", match: /browser-qa-summary-lost/ },
    { id: "summary-won", match: /browser-qa-summary-won/ },
    { id: "records", match: /browser-qa-records/ },
    { id: "settings", match: /browser-qa-settings/ },
    { id: "mobile", match: /browser-qa-mobile/ },
    { id: "mobile-combat", match: /browser-qa-mobile-combat/ },
    { id: "codex", match: /browser-qa-codex/ }
  ];
  const browserQa = await browserQaFreshness(qaFiles, requiredBrowserQa);
  const requiredReleaseInfo = ["핵심 조작", "크레딧", "이용 안내 · 라이선스", "외부 저작권 IP", "상용 이미지", "외부 음악 파일"];
  const requiredFlowDocs = ["새 런 시작", "전투", "보상 선택", "맵 이동", "상점", "휴식", "보스전", "승리/패배", "이어하기", "저장 삭제 확인", "콘솔 오류 없음"];
  const requiredFlowTests = [
    "assisted full-run smoke reaches the final summary without dead phases",
    "shop, rest, final boss victory, and defeat flows are reachable",
    "save slots recover the newest backup after an interrupted primary write",
    "run summary surfaces replay-relevant build evidence"
  ];

  record("scripts", "로컬 실행/빌드/테스트 명령", ["dev", "start", "test", "build", "balance", "assets:cards", "assets:combatants", "assets:events"].every((key) => packageJson.scripts?.[key]), "package.json에 기본 실행, 빌드, 테스트, 밸런스 명령이 있어야 합니다.", packageJson.scripts);
  record("content-counts", "콘텐츠 최소 수량", counts.cards >= 60 && counts.rewardCards >= 60 && counts.relics >= 30 && counts.normalEnemies >= 15 && counts.eliteEnemies >= 5 && counts.bosses >= 3 && counts.events >= 20 && counts.difficulties >= 5, "카드/유물/적/보스/이벤트/난이도 수량이 목표치를 넘어야 합니다.", counts);
  record("unique-content", "콘텐츠 ID 중복 없음", [CARDS, RELICS, ENEMIES, EVENTS].every(uniqueIds), "카드, 유물, 적, 이벤트 ID는 모두 고유해야 합니다.");
  record("character", "완성 캐릭터와 시작 덱", CHARACTER.name && CHARACTER.starterRelic && STARTER_DECK.length >= 10 && CHARACTER.mechanics.length >= 3, "캐릭터는 이름, 시작 유물, 시작 덱, 고유 메커니즘 설명을 가져야 합니다.", { name: CHARACTER.name, starterDeck: STARTER_DECK.length, mechanics: CHARACTER.mechanics });
  record("build-axes", "4개 이상의 덱 방향 축", axes.filter((axis) => axis.rewardCards >= 4).length >= 4, "보상 카드 기준으로 최소 4개 이상의 빌드 축이 실제 카드 풀에 있어야 합니다.", axes);
  record("relic-timings", "유물 발동 시점 다양성", relicTimings.size >= 6 && REWARD_RELIC_IDS.length >= 30, "유물은 여러 발동 시점을 가져야 하며 보상 풀에 충분히 들어 있어야 합니다.", { timingCount: relicTimings.size, timings: [...relicTimings], rewardRelics: REWARD_RELIC_IDS.length });
  record("enemy-boss-patterns", "적/보스 패턴 완성도", bossPhases && NORMAL_ENEMY_IDS.length >= 15 && ELITE_ENEMY_IDS.length >= 5 && BOSS_IDS.length >= 3, "보스는 단계 전환과 2단계 행동을 가져야 하고 적 풀이 충분해야 합니다.", { normal: NORMAL_ENEMY_IDS.length, elite: ELITE_ENEMY_IDS.length, bosses: BOSS_IDS.length });
  record("events", "이벤트 선택지 리스크/보상", EVENTS.length >= 20 && EVENTS.every((event) => event.choices?.length >= 2 && event.choices.every((choice) => choice.label && choice.detail && Array.isArray(choice.effects))), "모든 이벤트는 2개 이상의 설명 있는 선택지를 가져야 합니다.", { events: EVENTS.length });
  record("route-choice", "첫 엘리트 강제 방지", routeHasOptionalEliteFork(run), "각 막의 첫 엘리트 직전에는 비엘리트 대안 경로가 남아야 합니다.");
  record("screens", "필수 화면과 안내", ["새 런 시작", "이어하기", "설정", "게임 정보", "기록", "코덱스", "가이드"].every((text) => mainSource.includes(text)), "시작, 이어하기, 설정, 정보, 기록, 코덱스, 가이드 화면이 노출되어야 합니다.");
  record("settings-accessibility", "접근성/설정 항목", ["volume", "musicVolume", "preview-sound", "preview-music", "motionSpeed", "textScale", "highContrast", "tacticalAdvisor"].every((key) => mainSource.includes(key)), "효과음/배경음 조절과 미리듣기, 애니메이션, 텍스트 크기, 고대비, 플레이 힌트 설정이 있어야 합니다.");
  record("music-variation", "음악 루프 변주", ["playMusicMotif", "playMusicVariation", "variationEvery", "boss_lastgate_phase2"].every((text) => mainSource.includes(text)), "배경음은 보스 모티프와 긴 간격의 변주 프레이즈를 가져야 합니다.");
  record("save-records", "저장/이어하기/기록 코드", ["loadRunFromStorage", "saveRunToStorage", "deleteSavedRun", "recordRunSummary"].every((text) => mainSource.includes(text)), "로컬 저장, 삭제, 기록 집계 코드가 연결되어야 합니다.");
  record(
    "art-assets",
    "PNG 스프라이트/배경 아틀라스",
    [atlas, cardAtlas, arenaAtlas, arenaProps, eventBackdrops, enemyPortraits, combatSprites, playerCombatant, catalogerCombatant, algorithmCombatant, lastGateCombatant, bailiffCombatant, engineCombatant, knightCombatant, cantorCombatant, colossusCombatant, ...enemyCombatants].every((asset) => asset.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") &&
      cardAtlasSize?.width === 2880 &&
      cardAtlasSize?.height === 2304 &&
      eventBackdropSize?.width === 2304 &&
      eventBackdropSize?.height === 864 &&
      combatantDimensions.every((size) => size?.width === 1024 && size?.height === 1536) &&
      ["sprite-atlas.png", "card-illustrations.png", "arena-backdrops.png", "arena-props.png", "event-backdrops.png", "enemy-portraits.png", "combat-sprites.png", "combatants/player-echo-diver.png"].every((asset) => styleSource.includes(asset)) &&
      ["combatants/boss-cataloger.png", "combatants/boss-algorithm.png", "combatants/boss-lastgate.png", "combatants/elite-bailiff.png", "combatants/elite-engine.png", "combatants/elite-knight.png", "combatants/elite-cantor.png", "combatants/elite-colossus.png", "combatants/enemy-${template.sprite}.png", "--enemy-sprite-image"].every((asset) => mainSource.includes(asset)) &&
      mainSource.includes("data-atlas-cell") &&
      mainSource.includes("data-portrait-cell"),
    "카드/적/전투 배경 아트는 PNG 아틀라스와 아틀라스 셀을 사용해야 합니다.",
    { spriteBytes: atlas.length, cardBytes: cardAtlas.length, cardAtlasSize, arenaBytes: arenaAtlas.length, arenaPropBytes: arenaProps.length, eventBackdropBytes: eventBackdrops.length, eventBackdropSize, enemyPortraitBytes: enemyPortraits.length, combatSpriteBytes: combatSprites.length, combatantCanvas: combatantDimensions[0], playerCombatantBytes: playerCombatant.length, catalogerCombatantBytes: catalogerCombatant.length, algorithmCombatantBytes: algorithmCombatant.length, lastGateCombatantBytes: lastGateCombatant.length, bailiffCombatantBytes: bailiffCombatant.length, engineCombatantBytes: engineCombatant.length, knightCombatantBytes: knightCombatant.length, cantorCombatantBytes: cantorCombatant.length, colossusCombatantBytes: colossusCombatant.length, enemyCombatants: enemyCombatants.length }
  );
  record("no-card-enemy-svg-placeholders", "카드/적 SVG 플레이스홀더 없음", !/\\.card-art-svg|\\.enemy-sprite svg|<svg class=\"card-art|<svg class=\"enemy/.test(styleSource + mainSource), "카드와 적 아트는 임시 SVG 플레이스홀더가 아니어야 합니다.");
  record("korean-copy", "한국어 우선 카피", !/(장서관|맥동 창|상태 대응을 시험|초반 빌드 선언|덱 순환 압박|Slay the Spire 클론)/.test(mainSource + readme), "사용자에게 보이는 주요 카피에 어색한 번역투와 클론 표현이 없어야 합니다.");
  record("distribution-polish", "배포 기본 메타와 에셋 경로", indexSource.includes('rel="icon"') && indexSource.includes("./public/assets/favicon.svg") && indexSource.includes("theme-color") && faviconSource.includes("<svg") && !styleSource.includes('url("./public/assets/'), "정적 배포에서 favicon과 주요 CSS 에셋 경로가 404를 만들지 않아야 합니다.", { favicon: "./public/assets/favicon.svg" });
  record("dist-build", "정적 빌드 산출물", await exists(resolve(root, "dist/index.html")) && await exists(resolve(root, "dist/src/main.js")) && await exists(resolve(root, "dist/public/assets/sprite-atlas.png")), "dist 폴더에 정적 실행 산출물이 있어야 합니다.");
  record("balance-report", "밸런스 리포트 안정성", balance.totals?.runs >= 108 && balance.totals?.problemRuns === 0 && balance.totals?.winRate >= 0.25 && balance.totals?.winRate <= 0.7 && easiest?.winRate >= 0.45 && hardest?.winRate <= 0.45, "밸런스 자동 플레이는 진행 불가가 없고, 전체/입문/최상위 난이도 승률이 허용 범위에 있어야 합니다.", { totals: balance.totals, easiest, hardest });
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
    "최신 브라우저 QA 산출물",
    requiredBrowserQa.every((item) => browserQa.freshFiles.some((file) => item.match.test(file))) && browserQa.freshFiles.length >= 8,
    "qa 폴더에는 현재 소스 변경 이후 다시 찍은 전투, 맵, 보상, 설정, 모바일, 코덱스 등 핵심 화면 브라우저 스크린샷이 있어야 합니다.",
    {
      required: requiredBrowserQa.map((item) => item.id),
      ...browserQa
    }
  );
  record("docs", "README 산출물 설명", ["실행", "구현 범위", "주요 시스템", "검증한 플로우", "검증 산출물", "출시 전 우선순위"].every((section) => readme.includes(`## ${section}`)), "README는 실행 방법, 콘텐츠 목록, 시스템 설명, 검증 플로우, 검증 산출물, 남은 우선순위를 포함해야 합니다.");

  const failed = checks.filter((check) => !check.ok);
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      passed: checks.length - failed.length,
      failed: failed.length,
      total: checks.length
    },
    checks
  };
  await mkdir(qaDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (failed.length) {
    console.error(`Release audit failed: ${failed.length}/${checks.length}`);
    for (const check of failed) console.error(`- ${check.id}: ${check.label} — ${check.detail}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Release audit passed: ${checks.length}/${checks.length}`);
  console.log(`Wrote ${reportPath}`);
}

await main();
