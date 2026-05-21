import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const qaDir = resolve(root, "qa");
const baseUrl = process.env.QA_URL ?? "http://127.0.0.1:4210/dist/";
const chromePath = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = Number(process.env.QA_CHROME_PORT ?? 9339);
const profileDir = resolve("/private/tmp", `deep-signal-qa-chrome-${port}`);

await mkdir(qaDir, { recursive: true });
await rm(profileDir, { recursive: true, force: true });

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--hide-scrollbars",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  "about:blank"
], {
  stdio: ["ignore", "ignore", "pipe"]
});
const chromeStderr = [];
let chromeExit = null;

chrome.stderr.on("data", (chunk) => {
  chromeStderr.push(String(chunk));
  if (chromeStderr.length > 18) chromeStderr.shift();
});

chrome.on("exit", (code, signal) => {
  chromeExit = { code, signal };
});

const cleanup = async () => {
  if (!chrome.killed) chrome.kill("SIGTERM");
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
};

process.on("SIGINT", () => {
  cleanup().finally(() => process.exit(130));
});

try {
  await waitForChrome();
  const cdp = await connectToPage();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await setViewport(cdp, 1280, 720);

  await navigate(cdp, baseUrl);
  await capture(cdp, "browser-qa-title-refreshed.png");

  await clickText(cdp, "게임 정보");
  await waitForSelector(cdp, ".about-panel");
  await assertAboutReleaseInfo(cdp);
  await capture(cdp, "browser-qa-about-refreshed.png");

  await navigate(cdp, baseUrl);
  await clickText(cdp, "설정");
  await waitForText(cdp, "접근성");
  await assertSettingsAudioUx(cdp);
  await capture(cdp, "browser-qa-settings-refreshed.png");

  await navigate(cdp, baseUrl);
  await clickText(cdp, "코덱스");
  await waitForText(cdp, "카드");
  await assertCodexConceptUx(cdp);
  await capture(cdp, "browser-qa-codex-refreshed.png");

  await navigate(cdp, baseUrl);
  await clickText(cdp, "가이드");
  await waitForSelector(cdp, ".guide-playbook");
  await assertGuidePlaybookUx(cdp);
  await capture(cdp, "browser-qa-guide-refreshed.png");

  await stageRecordsFixture(cdp);
  await navigate(cdp, baseUrl);
  await clickText(cdp, "기록");
  await waitForSelector(cdp, ".records-career");
  await assertRecordsDecisionUx(cdp);
  await capture(cdp, "browser-qa-records-refreshed.png");
  await clearRecords(cdp);

  await stageActInterludeFixture(cdp);
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".map-layout .act-interlude.is-new");
  await capture(cdp, "browser-qa-act-interlude-refreshed.png");
  await assertActInterludeSingleUse(cdp);
  await clearSavedRun(cdp);

  await stageEventFixture(cdp);
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".event-layout");
  await assertEventSceneUx(cdp);
  await capture(cdp, "browser-qa-event-refreshed.png");
  await clickSelector(cdp, ".event-choice");
  await waitForSelector(cdp, ".map-layout");
  await waitForSelector(cdp, ".choice-result-pulse");
  await assertChoicePulseNextStep(cdp);
  await capture(cdp, "browser-qa-choice-pulse-next-step.png");
  await clearSavedRun(cdp);

  await stageNodeFixture(cdp, "shop", "qa-shop-scene");
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".shop-layout");
  await hoverSelector(cdp, ".shop-item:not(.sold)");
  await assertShopFocusUx(cdp);
  await capture(cdp, "browser-qa-shop-refreshed.png");
  await clearSavedRun(cdp);

  await stageNodeFixture(cdp, "rest", "qa-rest-scene");
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".rest-layout");
  await assertRestSceneProductionArt(cdp);
  await capture(cdp, "browser-qa-rest-refreshed.png");
  await clearSavedRun(cdp);

  await stageRewardFixture(cdp);
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".reward-layout");
  await waitForSelector(cdp, ".reward-choice-stage.with-relics");
  await hoverSelector(cdp, ".reward-option .game-card[data-action='reward-card']");
  await waitForSelector(cdp, ".reward-choice-stage.preview-active");
  await assertRewardDecisionUx(cdp);
  await capture(cdp, "browser-qa-reward-relics-refreshed.png");
  await assertRewardSelectionProgress(cdp);
  await capture(cdp, "browser-qa-reward-card-selected.png");
  await clearSavedRun(cdp);

  await stageSummaryFixture(cdp, "lost");
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".summary-layout");
  await assertSummaryActionsVisible(cdp);
  await waitForText(cdp, "문 낙하를 맞을 체력이 남지 않았습니다");
  await waitForText(cdp, "보스 전 회복·단타 방어 챙기기");
  await capture(cdp, "browser-qa-summary-lost-refreshed.png");
  await clearSavedRun(cdp);

  await stageSummaryFixture(cdp, "won");
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".summary-layout");
  await assertSummaryActionsVisible(cdp);
  await capture(cdp, "browser-qa-summary-won-refreshed.png");
  await clearSavedRun(cdp);

  await navigate(cdp, baseUrl);
  await clickText(cdp, "새 런 시작");
  await waitForSelector(cdp, ".map-layout");
  await assertMapRouteUx(cdp);
  await capture(cdp, "browser-qa-map-refreshed.png");
  await hoverSelector(cdp, ".route-card[data-action='enter-node']");
  await waitForSelector(cdp, ".map-connections path.route-previewed");
  await assertMapPreviewFocus(cdp);
  await capture(cdp, "browser-qa-map-route-preview.png");

  await stageFinalBossReadinessFixture(cdp);
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".map-layout");
  await waitForText(cdp, "연속 방어");
  await assertFinalBossReadinessUx(cdp);
  await capture(cdp, "browser-qa-final-boss-readiness.png");
  await clearSavedRun(cdp);

  await stageFinalBossSelectorFixture(cdp);
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".deck-modal");
  await assertFinalBossSelectorUx(cdp);
  await capture(cdp, "browser-qa-final-boss-selector.png");
  await clearSavedRun(cdp);

  await stageDesktopHandReadabilityFixture(cdp);
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".combat-board");
  await assertCombatRiskSingleSource(cdp);
  await assertCombatRouteBeacon(cdp);
  await assertCombatPileDockCompact(cdp);
  await assertDesktopHandReadability(cdp);
  await capture(cdp, "browser-qa-combat-refreshed.png");
  await hoverSelector(cdp, ".hand-zone .game-card[data-action='play-card']:not(:disabled)", { x: 0.5, y: 0.18 });
  await waitForSelector(cdp, ".card-portal-tooltip:not([hidden])");
  await waitForSelector(cdp, ".combat-card-preview-rail:not([hidden])");
  await assertCardHoverLayout(cdp);
  await assertCardOutcomeReadability(cdp);
  await capture(cdp, "browser-qa-combat-card-hover.png");
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4, button: "none" });
  await wait(120);
  await clickSelector(cdp, ".hand-zone .game-card[data-action='play-card']:not(:disabled)");
  await waitForSelector(cdp, ".combat-action-fx");
  await assertCardPlayFxSource(cdp);
  await capture(cdp, "browser-qa-card-play-fx.png");
  await clearSavedRun(cdp);

  await stageIncomingDamageFixture(cdp);
  await navigate(cdp, qaUrl("end-turn-risk-preview"));
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".combat-board.enemy-aiming-danger");
  await assertIncomingHealthProjection(cdp);
  await capture(cdp, "browser-qa-end-turn-risk-preview.png");
  await hoverSelector(cdp, ".hand-zone .game-card[data-action='play-card'][data-id='7501']", { x: 0.5, y: 0.18 });
  await assertIncomingHealthProjectionPreview(cdp);
  await capture(cdp, "browser-qa-end-turn-risk-block-preview.png");
  await clearSavedRun(cdp);

  await stageIncomingKillPreventionFixture(cdp);
  await navigate(cdp, qaUrl("end-turn-risk-kill-preview"));
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".combat-board.enemy-aiming-danger");
  await wait(1000);
  await hoverSelector(cdp, ".hand-zone .game-card[data-action='play-card'][data-id='7552']", { x: 0.5, y: 0.18 });
  await triggerHoverSelector(cdp, ".hand-zone .game-card[data-action='play-card'][data-id='7552']");
  await waitForSelector(cdp, ".player-stand.preview-threat-reduced .health-bar.preview-incoming-health");
  await assertIncomingHealthProjectionKillPreview(cdp);
  await capture(cdp, "browser-qa-end-turn-risk-kill-preview.png");
  await clearSavedRun(cdp);

  await stageAttackFxFixture(cdp);
  await navigate(cdp, qaUrl("card-attack-hover"));
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".combat-board");
  await wait(1000);
  await hoverSelector(cdp, ".hand-zone .game-card[data-action='play-card'][data-id='7601']", { x: 0.5, y: 0.18 });
  await triggerHoverSelector(cdp, ".hand-zone .game-card[data-action='play-card'][data-id='7601']");
  await waitForSelector(cdp, ".combat-aim-line.damage:not([hidden])");
  await assertAttackCardHoverTarget(cdp);
  await capture(cdp, "browser-qa-card-attack-hover.png");
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4, button: "none" });
  await wait(120);
  await clickSelector(cdp, ".hand-zone .game-card[data-action='play-card'][data-id='7601']");
  await waitForSelector(cdp, ".combat-action-fx.fx-damage.fx-enemy.fx-source-player");
  await assertAttackCardPlayFx(cdp);
  await capture(cdp, "browser-qa-card-attack-fx.png");
  await clearSavedRun(cdp);

  await stageEnergyLockedHandFixture(cdp);
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".combat-board");
  await assertEnergyLockedHandUx(cdp);
  await wait(950);
  await hoverSelector(cdp, ".hand-zone .game-card.energy-locked[aria-disabled='true']", { x: 0.5, y: 0.18 });
  await assertEnergyLockedHandHover(cdp);
  await capture(cdp, "browser-qa-combat-energy-locked.png");
  await clearSavedRun(cdp);

  const victoryCodaEvidence = await captureVictoryCodaFlow(cdp);

  await stageBossFixture(cdp);
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".combat-board.boss-fight");
  await assertBossStatusStrip(cdp);
  await capture(cdp, "browser-qa-boss-status-strip.png");
  await clearSavedRun(cdp);

  await stageStatusTooltipFixture(cdp);
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".combat-board");
  await assertStatusTooltipUx(cdp);
  await capture(cdp, "browser-qa-combat-status-tooltip.png");
  await assertIntentTooltipUx(cdp);
  await capture(cdp, "browser-qa-combat-intent-tooltip.png");
  await clearSavedRun(cdp);

  const groupedEnemyFx = await captureGroupedEnemyFx(cdp);
  const turnAndVictoryEvidence = await writeTurnAndVictoryEvidence(groupedEnemyFx, victoryCodaEvidence);

  await stageMobileCombatFixture(cdp);
  await navigate(cdp, baseUrl);
  await setViewport(cdp, 390, 844, true);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".combat-board");
  await assertMobileCombatTouchUx(cdp);
  await capture(cdp, "browser-qa-mobile-combat-refreshed.png");
  await clearSavedRun(cdp);

  await stageMobileCombatFixture(cdp);
  await navigate(cdp, baseUrl);
  await setViewport(cdp, 820, 1180, true);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".combat-board");
  await assertTabletCombatUx(cdp);
  await capture(cdp, "browser-qa-tablet-combat-refreshed.png");
  await clearSavedRun(cdp);

  await navigate(cdp, baseUrl);
  await waitForSelector(cdp, ".title-screen");
  await wait(250);
  await capture(cdp, "browser-qa-mobile-refreshed.png");

  const summary = await evaluate(cdp, `(() => ({
    title: document.title,
    phase: document.querySelector(".game-screen")?.className ?? "",
    titleScreen: Boolean(document.querySelector(".title-screen")),
    combatBoard: Boolean(document.querySelector(".combat-board")),
    rewardCount: document.querySelectorAll(".reward-layout").length,
    choicePulseCount: document.querySelectorAll(".choice-result-pulse").length,
    transitionCount: document.querySelectorAll(".phase-transition").length,
    text: document.body.innerText.slice(0, 500)
  }))()`);
  console.log(JSON.stringify({ ok: true, reachedReward: turnAndVictoryEvidence.rewardReachedAfterVictory, groupedEnemyFx, victoryCoda: victoryCodaEvidence, summary }, null, 2));
} finally {
  await cleanup();
}

async function waitForChrome() {
  const url = `http://127.0.0.1:${port}/json/version`;
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await wait(120);
  }
  const stderr = chromeStderr.join("").trim();
  const sandboxHint = /MachPortRendezvousServer|bootstrap_check_in|Permission denied/.test(stderr)
    ? "Chrome이 macOS 샌드박스의 Mach 포트 권한에 막혀 시작되지 않았습니다. Codex 앱의 Browser 연결을 복구하거나, 이 스크립트를 로컬 터미널처럼 브라우저 권한이 있는 환경에서 실행해야 합니다."
    : "Chrome 원격 디버깅 포트가 열리지 않았습니다. CHROME_PATH, QA_CHROME_PORT, 실행 권한을 확인하세요.";
  throw new Error([
    "Chrome remote debugging endpoint did not become ready.",
    `Endpoint: ${url}`,
    chromeExit ? `Chrome exit: code=${chromeExit.code ?? "null"} signal=${chromeExit.signal ?? "null"}` : "Chrome exit: still running or not reported",
    `Hint: ${sandboxHint}`,
    stderr ? `Chrome stderr tail:\n${stderr}` : "Chrome stderr tail: <empty>"
  ].join("\n"));
}

async function connectToPage() {
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = tabs.find((tab) => tab.type === "page") ?? tabs[0];
  if (!page?.webSocketDebuggerUrl) throw new Error("No Chrome page target found.");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: resolveCall, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolveCall(message.result ?? {});
  });
  await new Promise((resolveCall, reject) => {
    socket.addEventListener("open", resolveCall, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return {
    send(method, params = {}) {
      const callId = ++id;
      socket.send(JSON.stringify({ id: callId, method, params }));
      return new Promise((resolveCall, reject) => {
        pending.set(callId, { resolve: resolveCall, reject });
        setTimeout(() => {
          if (!pending.has(callId)) return;
          pending.delete(callId);
          reject(new Error(`CDP timeout: ${method}`));
        }, 15000);
      });
    }
  };
}

async function navigate(cdp, url) {
  await cdp.send("Page.navigate", { url });
  await waitForReady(cdp);
}

function qaUrl(label) {
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}qa=${encodeURIComponent(label)}`;
}

async function waitForReady(cdp) {
  await waitFor(cdp, `document.readyState === "complete" && document.body && document.body.innerText.length > 20`, 12000);
}

async function setViewport(cdp, width, height, mobile = false) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile
  });
}

async function capture(cdp, file) {
  await wait(220);
  await waitForVisibleTransitionToFinish(cdp);
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false
  });
  await writeFile(resolve(qaDir, file), Buffer.from(result.data, "base64"));
}

async function waitForVisibleTransitionToFinish(cdp) {
  const hasVisibleTransition = await evaluate(cdp, `Boolean(document.querySelector(".phase-transition:not(.phase-combat)"))`);
  if (hasVisibleTransition) await wait(1450);
}

async function assertCodexConceptUx(cdp) {
  const evidence = await evaluate(cdp, `(() => {
    const quickRead = document.querySelector(".codex-quick-read");
    const conceptCards = [...document.querySelectorAll(".concept-codex")];
    const loops = [...document.querySelectorAll(".concept-codex-loop")];
    const loopSteps = loops.map((loop) => [...loop.querySelectorAll("b")].map((item) => item.innerText.trim()).join(" / "));
    const firstConcept = conceptCards[0]?.getBoundingClientRect();
    const quickBox = quickRead?.getBoundingClientRect();
    const metrics = [...document.querySelectorAll(".concept-codex-metrics")];
    const text = document.body.innerText;
    const firstViewportCards = conceptCards.filter((card) => card.getBoundingClientRect().top < window.innerHeight).length;
    const noOverflow = document.documentElement.scrollWidth <= window.innerWidth + 2;
    return {
      ok: Boolean(
        quickRead &&
        conceptCards.length >= 6 &&
        loops.length >= 6 &&
        metrics.length >= 6 &&
        loopSteps.every((step) => step.includes("모으기") && step.includes("쓰기") && step.includes("보완")) &&
        text.includes("덱은 셋만 보면 됩니다") &&
        text.includes("덱 방향") &&
        firstViewportCards >= 3 &&
        quickBox &&
        quickBox.top >= 0 &&
        firstConcept &&
        firstConcept.top > quickBox.bottom &&
        noOverflow
      ),
      conceptCards: conceptCards.length,
      loops: loops.length,
      metrics: metrics.length,
      loopSteps,
      firstViewportCards,
      noOverflow
    };
  })()`);
  if (!evidence.ok) {
    throw new Error(`Codex concept UX failed: ${JSON.stringify(evidence)}`);
  }
}

async function assertRecordsDecisionUx(cdp) {
  const evidence = await evaluate(cdp, `(() => {
    const rail = document.querySelector(".records-goal-rail");
    const steps = [...document.querySelectorAll(".records-goal-step")];
    const chips = [...document.querySelectorAll(".records-goal-chips i")];
    const indexes = [...document.querySelectorAll(".records-goal-index")].map((item) => item.innerText.trim()).join("");
    const replayButton = document.querySelector(".records-goal-step button[data-action='replay-seed']");
    const railBox = rail?.getBoundingClientRect();
    const stepBoxes = steps.map((step) => step.getBoundingClientRect());
    const noOverflow = document.documentElement.scrollWidth <= window.innerWidth + 2;
    const firstViewportFit = Boolean(railBox && railBox.top >= 0 && railBox.bottom <= window.innerHeight + 80);
    const readableSteps = stepBoxes.every((box) => box.width >= 250 && box.height <= 180);
    const text = document.body.innerText;
    return {
      ok: Boolean(
        rail &&
        steps.length === 3 &&
        chips.length >= 6 &&
        indexes === "123" &&
        replayButton &&
        text.includes("방금 막힌 지점에서 바로 바꿀 선택만 추렸습니다") &&
        text.includes("시드") &&
        text.includes("먼저") &&
        firstViewportFit &&
        readableSteps &&
        noOverflow
      ),
      steps: steps.length,
      chips: chips.length,
      indexes,
      firstViewportFit,
      readableSteps,
      noOverflow
    };
  })()`);
  if (!evidence.ok) {
    throw new Error(`Records decision UX failed: ${JSON.stringify(evidence)}`);
  }
}

async function assertGuidePlaybookUx(cdp) {
  const evidence = await evaluate(cdp, `(() => {
    const playbook = document.querySelector(".guide-playbook");
    const steps = [...document.querySelectorAll(".guide-flow article")];
    const stepChips = [...document.querySelectorAll(".guide-flow-chips i")];
    const conceptLoops = [...document.querySelectorAll(".guide-concept-loop")];
    const playbookBox = playbook?.getBoundingClientRect();
    const noOverflow = document.documentElement.scrollWidth <= window.innerWidth + 2;
    const text = document.body.innerText;
    const visibleConcepts = [...document.querySelectorAll(".guide-concept-card")]
      .filter((card) => card.getBoundingClientRect().top < window.innerHeight).length;
    return {
      ok: Boolean(
        playbook &&
        steps.length === 3 &&
        stepChips.length >= 6 &&
        conceptLoops.length >= 6 &&
        text.includes("한 번에 하나만 정하세요") &&
        text.includes("같은 키워드 두 장") &&
        text.includes("덱 방향은 카드 설명보다 흐름으로 먼저 읽습니다") &&
        playbookBox &&
        playbookBox.top >= 0 &&
        playbookBox.bottom <= window.innerHeight &&
        visibleConcepts >= 3 &&
        noOverflow
      ),
      steps: steps.length,
      stepChips: stepChips.length,
      conceptLoops: conceptLoops.length,
      visibleConcepts,
      noOverflow,
      playbookBottom: playbookBox ? Math.round(playbookBox.bottom) : null
    };
  })()`);
  if (!evidence.ok) {
    throw new Error(`Guide playbook UX failed: ${JSON.stringify(evidence)}`);
  }
}

async function clickText(cdp, text) {
  const rect = await evaluate(cdp, `(text => {
    const button = [...document.querySelectorAll("button")].find((item) => item.innerText.includes(text) && !item.disabled);
    if (!button) return null;
    const box = button.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  })(${JSON.stringify(text)})`);
  if (!rect) throw new Error(`Button not found: ${text}`);
  await dispatchClick(cdp, rect.x, rect.y);
  await wait(350);
}

async function clickSelector(cdp, selector) {
  const rect = await evaluate(cdp, `(selector => {
    const target = document.querySelector(selector);
    if (!target || target.disabled) return null;
    const box = target.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  })(${JSON.stringify(selector)})`);
  if (!rect) throw new Error(`Selector not found: ${selector}`);
  await dispatchClick(cdp, rect.x, rect.y);
  await wait(450);
}

async function stageActInterludeFixture(cdp) {
  await evaluate(cdp, `(async () => {
    const { newRun } = await import("./src/engine/game.js");
    const run = newRun({ seed: "qa-act-interlude", difficulty: 1 });
    const bossNode = run.map.flat().find((item) => item.type === "boss" && item.act === 1);
    if (!bossNode) throw new Error("QA fixture boss node not found");
    bossNode.completed = true;
    run.phase = "map";
    run.currentNodeId = null;
    run.currentRow = bossNode.row + 1;
    run.stats.floors = bossNode.row + 1;
    run.availableNodeIds = bossNode.connections.length ? bossNode.connections : run.map[bossNode.row + 1].map((item) => item.id);
    run.player.hp = 46;
    run.player.gold = 118;
    run.reward = null;
    run.combat = null;
    run.event = null;
    run.shop = null;
    run.selector = null;
    run.lastInterlude = {
      type: "act-transition",
      fromAct: 1,
      toAct: 2,
      floor: bossNode.row + 1,
      bossName: "대분류자 칼리스",
      nextBossName: "침몰 알고리즘",
      recovery: 34,
      recovered: 24,
      hpAfter: 46,
      maxHp: run.player.maxHp,
      at: Date.now()
    };
    run.log.push({ text: "1막 보스를 격파하고 더 깊은 구역으로 진입합니다.", tone: "rest" });
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, interlude: run.lastInterlude };
  })()`);
}

async function stageEventFixture(cdp) {
  await evaluate(cdp, `(async () => {
    const { newRun } = await import("./src/engine/game.js");
    const { EVENTS } = await import("./src/data/events.js");
    const run = newRun({ seed: "qa-event-scene", difficulty: 1 });
    const eventDefinition = EVENTS.find((event) => event.id === "pressure_gate") ?? EVENTS.find((event) => event.choices?.length >= 2) ?? EVENTS[0];
    const node = run.map.flat().find((item) => item.type === "event") ?? run.map.flat()[0];
    run.phase = "event";
    run.currentRow = node?.row ?? 3;
    run.stats.floors = Math.max(run.stats.floors, (node?.row ?? 3) + 1);
    run.currentNodeId = node?.id ?? "qa-event";
    run.availableNodeIds = [];
    run.reward = null;
    run.combat = null;
    run.shop = null;
    run.selector = null;
    run.event = { eventId: eventDefinition.id, chosen: null };
    run.log.push({ text: eventDefinition.name + " 발견.", tone: "event" });
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return eventDefinition.id;
  })()`);
}

async function stageNodeFixture(cdp, type, seed) {
  await evaluate(cdp, `(async () => {
    const { newRun, enterNode } = await import("./src/engine/game.js");
    const run = newRun({ seed: ${JSON.stringify(seed)}, difficulty: 1 });
    const node = run.map.flat().find((item) => item.type === ${JSON.stringify(type)});
    if (!node) throw new Error("QA fixture node not found: ${type}");
    run.availableNodeIds = [node.id];
    enterNode(run, node.id);
    if (${JSON.stringify(type)} === "shop") {
      run.player.gold = Math.max(run.player.gold, 240);
    }
    if (${JSON.stringify(type)} === "rest") {
      run.player.hp = Math.max(1, Math.min(run.player.maxHp - 18, 54));
    }
    run.reward = null;
    run.combat = null;
    run.selector = null;
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, nodeId: run.currentNodeId };
  })()`);
}

async function stageBossFixture(cdp) {
  await evaluate(cdp, `(async () => {
    const { newRun, enterNode } = await import("./src/engine/game.js");
    const { ENEMY_BY_ID } = await import("./src/data/enemies.js");
    const run = newRun({ seed: "qa-boss-status", difficulty: 1 });
    const node = run.map.flat().find((item) => item.type === "boss" && item.act === 2) ?? run.map.flat().find((item) => item.type === "boss");
    if (!node) throw new Error("QA boss fixture node not found");
    run.availableNodeIds = [node.id];
    enterNode(run, node.id);
    if (!run.combat?.enemies?.length) throw new Error("QA boss fixture combat not started");
    const boss = run.combat.enemies.find((enemy) => ENEMY_BY_ID[enemy.templateId]?.tier === "boss") ?? run.combat.enemies[0];
    const template = ENEMY_BY_ID[boss.templateId];
    const threshold = Math.max(1, Math.floor(boss.maxHp * (template.phaseAt ?? 0.5)));
    boss.hp = Math.min(boss.hp, threshold);
    boss.phase = 2;
    boss.nextMove = template.moves.find((move) => move.phase === 2) ?? boss.nextMove;
    run.player.hp = Math.min(run.player.maxHp, 78);
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, boss: boss.name, bossPhase: boss.phase, bossHp: boss.hp, nextMove: boss.nextMove?.id };
  })()`);
}

async function stageFinalBossReadinessFixture(cdp) {
  await evaluate(cdp, `(async () => {
    const { newRun } = await import("./src/engine/game.js");
    const run = newRun({ seed: "qa-final-boss-readiness", difficulty: 4 });
    const boss = run.map.flat().find((item) => item.type === "boss" && item.act === 3);
    if (!boss) throw new Error("QA final boss readiness node not found");
    run.phase = "map";
    run.currentNodeId = null;
    run.currentRow = boss.row;
    run.availableNodeIds = [boss.id];
    run.stats.floors = boss.row + 1;
    run.player.hp = Math.min(run.player.maxHp, 48);
    run.player.deck = run.player.deck.filter((card) => !["floodgate", "null_pin"].includes(card.cardId));
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, boss: boss.id, hp: run.player.hp, deck: run.player.deck.length };
  })()`);
}

async function stageFinalBossSelectorFixture(cdp) {
  await evaluate(cdp, `(async () => {
    const { newRun } = await import("./src/engine/game.js");
    const run = newRun({ seed: "qa-final-boss-selector", difficulty: 4 });
    const rest = run.map.flat().find((item) => item.type === "rest" && item.act === 3);
    if (!rest) throw new Error("QA final boss selector rest node not found");
    run.phase = "rest";
    run.currentNodeId = rest.id;
    run.currentRow = rest.row;
    run.availableNodeIds = [];
    run.stats.floors = rest.row + 1;
    run.player.hp = Math.min(run.player.maxHp, 56);
    run.player.gold = 120;
    run.player.deck = [
      { uid: 9101, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 },
      { uid: 9102, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 },
      { uid: 9103, cardId: "tide_ward", upgraded: false, temporary: false, costMod: 0 },
      { uid: 9104, cardId: "memory_sift", upgraded: false, temporary: false, costMod: 0 },
      { uid: 9105, cardId: "null_pin", upgraded: false, temporary: false, costMod: 0 },
      { uid: 9106, cardId: "pale_firewall", upgraded: false, temporary: false, costMod: 0 },
      { uid: 9107, cardId: "rill_cut", upgraded: false, temporary: false, costMod: 0 },
      { uid: 9108, cardId: "cleanse_cache", upgraded: false, temporary: false, costMod: 0 },
      { uid: 9109, cardId: "silt_needle", upgraded: false, temporary: false, costMod: 0 },
      { uid: 9110, cardId: "brass_knuckle", upgraded: false, temporary: false, costMod: 0 },
      { uid: 9111, cardId: "drift_scan", upgraded: false, temporary: false, costMod: 0 },
      { uid: 9112, cardId: "undertow_kick", upgraded: false, temporary: false, costMod: 0 }
    ];
    run.selector = { mode: "upgrade", context: "rest", after: "completeNode" };
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, selector: run.selector.mode, node: rest.id, deck: run.player.deck.length };
  })()`);
}

async function stageRewardFixture(cdp) {
  await evaluate(cdp, `(async () => {
    const { newRun } = await import("./src/engine/game.js");
    const run = newRun({ seed: "qa-reward-relics", difficulty: 1 });
    const node = run.map.flat().find((item) => item.type === "elite") ?? run.map.flat().find((item) => item.type === "combat");
    run.phase = "reward";
    run.currentNodeId = node?.id ?? "qa-reward";
    run.currentRow = node?.row ?? 2;
    run.stats.floors = Math.max(run.stats.floors, (node?.row ?? 2) + 1);
    run.player.hp = Math.min(run.player.maxHp, 74);
    run.player.gold = 132;
    run.player.deck.push(
      { uid: run.nextUid++, cardId: "signal_jab", upgraded: true, temporary: false, costMod: 0 },
      { uid: run.nextUid++, cardId: "coral_guard", upgraded: false, temporary: false, costMod: 0 },
      { uid: run.nextUid++, cardId: "archive_dust", upgraded: false, temporary: false, costMod: 0 }
    );
    run.reward = {
      cards: ["drift_scan", "null_bloom", "oath_of_the_deep"],
      gold: 28,
      relicId: null,
      relicChoices: ["recursive_key", "cracked_anchor", "coral_seal"],
      selectedCardId: null,
      cardSkipped: false,
      selectedRelicId: null,
      sourceType: "elite"
    };
    run.combat = null;
    run.event = null;
    run.shop = null;
    run.selector = null;
    run.log.push({ text: "엘리트 전투 승리. 보상을 선택하세요.", tone: "reward" });
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, cards: run.reward.cards.length, relics: run.reward.relicChoices.length };
  })()`);
}

async function stageStatusTooltipFixture(cdp) {
  await evaluate(cdp, `(async () => {
    const { newRun, enterNode } = await import("./src/engine/game.js");
    const run = newRun({ seed: "qa-status-tooltip", difficulty: 1 });
    const node = run.map.flat().find((item) => item.type === "combat");
    if (!node) throw new Error("QA status fixture combat node not found");
    run.availableNodeIds = [node.id];
    enterNode(run, node.id);
    if (!run.combat?.enemies?.length) throw new Error("QA status fixture combat not started");
    run.player.statuses.charge = 3;
    run.player.statuses.vulnerable = 1;
    run.combat.enemies[0].statuses.virus = 4;
    run.combat.enemies[0].statuses.mark = 2;
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, statuses: run.player.statuses, enemyStatuses: run.combat.enemies[0].statuses };
  })()`);
}

async function stageEnergyLockedHandFixture(cdp) {
  await evaluate(cdp, `(async () => {
    const { newRun, enterNode } = await import("./src/engine/game.js");
    const run = newRun({ seed: "qa-energy-locked-hand", difficulty: 0 });
    const node = run.map.flat().find((item) => item.type === "combat");
    if (!node) throw new Error("QA energy locked fixture combat node not found");
    run.availableNodeIds = [node.id];
    enterNode(run, node.id);
    if (!run.combat?.enemies?.length) throw new Error("QA energy locked fixture combat not started");
    run.combat.turn = "player";
    run.combat.energy = 0;
    run.combat.hand = [
      { uid: 7701, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7702, cardId: "tide_ward", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7703, cardId: "memory_sift", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7704, cardId: "null_pin", upgraded: false, temporary: false, costMod: 0 }
    ];
    run.combat.drawPile = [];
    run.combat.discardPile = [];
    run.combat.exhaustPile = [];
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, energy: run.combat.energy, hand: run.combat.hand.length };
  })()`);
}

async function stageDesktopHandReadabilityFixture(cdp) {
  await evaluate(cdp, `(async () => {
    const { newRun, enterNode } = await import("./src/engine/game.js");
    const run = newRun({ seed: "qa-desktop-hand-readability", difficulty: 0 });
    const node = run.map.flat().find((item) => item.type === "combat");
    if (!node) throw new Error("QA desktop hand fixture combat node not found");
    run.availableNodeIds = [node.id];
    enterNode(run, node.id);
    if (!run.combat?.enemies?.length) throw new Error("QA desktop hand fixture combat not started");
    run.combat.turn = "player";
    run.combat.maxEnergy = 3;
    run.combat.energy = 3;
    run.combat.hand = [
      { uid: 7651, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7652, cardId: "tide_ward", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7653, cardId: "memory_sift", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7654, cardId: "null_pin", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7655, cardId: "rill_cut", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7656, cardId: "signal_jab", upgraded: false, temporary: false, costMod: 0 }
    ];
    run.combat.drawPile = [
      { uid: 7661, cardId: "coral_guard", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7662, cardId: "drift_scan", upgraded: false, temporary: false, costMod: 0 }
    ];
    run.combat.discardPile = [];
    run.combat.exhaustPile = [];
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, energy: run.combat.energy, hand: run.combat.hand.length };
  })()`);
}

async function stageAttackFxFixture(cdp) {
  await evaluate(cdp, `(async () => {
    const { newRun, enterNode } = await import("./src/engine/game.js");
    const run = newRun({ seed: "qa-card-attack-fx", difficulty: 0 });
    const node = run.map.flat().find((item) => item.type === "combat");
    if (!node) throw new Error("QA attack FX fixture combat node not found");
    run.availableNodeIds = [node.id];
    enterNode(run, node.id);
    if (!run.combat?.enemies?.length) throw new Error("QA attack FX fixture combat not started");
    const target = run.combat.enemies.find((enemy) => enemy.hp > 0) ?? run.combat.enemies[0];
    target.hp = Math.min(target.maxHp, Math.max(18, target.hp));
    target.block = 0;
    target.statuses = {};
    run.combat.selectedEnemyUid = target.uid;
    run.combat.turn = "player";
    run.combat.maxEnergy = 3;
    run.combat.energy = 3;
    run.combat.hand = [
      { uid: 7601, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7602, cardId: "null_pin", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7603, cardId: "tide_ward", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7604, cardId: "memory_sift", upgraded: false, temporary: false, costMod: 0 }
    ];
    run.combat.drawPile = [
      { uid: 7611, cardId: "rill_cut", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7612, cardId: "signal_jab", upgraded: false, temporary: false, costMod: 0 }
    ];
    run.combat.discardPile = [];
    run.combat.exhaustPile = [];
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, target: target.name, targetHp: target.hp, hand: run.combat.hand.map((card) => card.cardId) };
  })()`);
}

async function stageIncomingDamageFixture(cdp) {
  await evaluate(cdp, `(async () => {
    const { newRun, enterNode } = await import("./src/engine/game.js");
    const run = newRun({ seed: "qa-end-turn-risk-preview", difficulty: 0 });
    const node = run.map.flat().find((item) => item.type === "combat");
    if (!node) throw new Error("QA incoming damage fixture combat node not found");
    run.availableNodeIds = [node.id];
    enterNode(run, node.id);
    if (!run.combat?.enemies?.length) throw new Error("QA incoming damage fixture combat not started");
    run.player.hp = run.player.maxHp;
    run.player.block = 0;
    run.combat.turn = "player";
    run.combat.maxEnergy = 3;
    run.combat.energy = 3;
    run.combat.enemies = run.combat.enemies.slice(0, 2);
    run.combat.enemies.forEach((enemy, index) => {
      enemy.block = 0;
      enemy.statuses = {};
      enemy.nextMove = index === 0
        ? { id: "qa_pressure_slam", label: "압력 강타", intent: "공격 18", type: "attack", damage: 18 }
        : { id: "qa_follow_cut", label: "추격 베기", intent: "공격 10", type: "attack", damage: 10 };
    });
    run.combat.hand = [
      { uid: 7501, cardId: "tide_ward", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7502, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7503, cardId: "memory_sift", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7504, cardId: "null_pin", upgraded: false, temporary: false, costMod: 0 }
    ];
    run.combat.drawPile = [];
    run.combat.discardPile = [];
    run.combat.exhaustPile = [];
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, hp: run.player.hp, enemies: run.combat.enemies.map((enemy) => enemy.nextMove.intent) };
  })()`);
}

async function stageIncomingKillPreventionFixture(cdp) {
  await evaluate(cdp, `(async () => {
    const { newRun, enterNode } = await import("./src/engine/game.js");
    const run = newRun({ seed: "qa-end-turn-risk-kill-preview", difficulty: 0 });
    const node = run.map.flat().find((item) => item.type === "combat");
    if (!node) throw new Error("QA incoming kill fixture combat node not found");
    run.availableNodeIds = [node.id];
    enterNode(run, node.id);
    if (!run.combat?.enemies?.length) throw new Error("QA incoming kill fixture combat not started");
    if (run.combat.enemies.length < 2) {
      const base = run.combat.enemies[0];
      run.combat.enemies.push({
        ...base,
        uid: base.uid + 9000,
        name: base.name + " 잔상",
        hp: base.maxHp,
        block: 0,
        statuses: {},
        nextMove: null
      });
    }
    run.player.hp = run.player.maxHp;
    run.player.block = 0;
    run.player.statuses = {};
    run.combat.turn = "player";
    run.combat.maxEnergy = 3;
    run.combat.energy = 3;
    run.combat.enemies = run.combat.enemies.slice(0, 2);
    run.combat.enemies.forEach((enemy, index) => {
      enemy.block = 0;
      enemy.statuses = {};
      enemy.maxHp = Math.max(enemy.maxHp ?? 1, index === 0 ? 6 : 12);
      enemy.hp = index === 0 ? 6 : Math.min(enemy.maxHp, Math.max(10, enemy.hp));
      enemy.nextMove = index === 0
        ? { id: "qa_lethal_pressure", label: "압박", intent: "공격 18", type: "attack", damage: 18 }
        : { id: "qa_leftover_cut", label: "추격", intent: "공격 10", type: "attack", damage: 10 };
    });
    run.combat.selectedEnemyUid = run.combat.enemies[0].uid;
    run.combat.hand = [
      { uid: 7552, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7551, cardId: "tide_ward", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7553, cardId: "memory_sift", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7554, cardId: "null_pin", upgraded: false, temporary: false, costMod: 0 }
    ];
    run.combat.drawPile = [];
    run.combat.discardPile = [];
    run.combat.exhaustPile = [];
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, selected: run.combat.selectedEnemyUid, hp: run.player.hp, enemies: run.combat.enemies.map((enemy) => ({ hp: enemy.hp, intent: enemy.nextMove.intent })) };
  })()`);
}

async function stageVictoryCodaFixture(cdp) {
  await evaluate(cdp, `(async () => {
    const { newRun, enterNode } = await import("./src/engine/game.js");
    const run = newRun({ seed: "qa-victory-coda", difficulty: 0 });
    const node = run.map.flat().find((item) => item.type === "combat");
    if (!node) throw new Error("QA victory coda fixture combat node not found");
    run.availableNodeIds = [node.id];
    enterNode(run, node.id);
    if (!run.combat?.enemies?.length) throw new Error("QA victory coda fixture combat not started");
    const enemy = run.combat.enemies[0];
    run.combat.enemies = [enemy];
    enemy.hp = 1;
    enemy.block = 0;
    enemy.statuses = {};
    run.combat.selectedEnemyUid = enemy.uid;
    run.combat.turn = "player";
    run.combat.maxEnergy = 3;
    run.combat.energy = 3;
    run.combat.hand = [{ uid: 7901, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 }];
    run.combat.drawPile = [];
    run.combat.discardPile = [];
    run.combat.exhaustPile = [];
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, enemy: enemy.name, enemyHp: enemy.hp, hand: run.combat.hand.length };
  })()`);
}

async function stageMobileCombatFixture(cdp) {
  await evaluate(cdp, `(async () => {
    const { newRun, enterNode } = await import("./src/engine/game.js");
    const run = newRun({ seed: "qa-mobile-combat-touch", difficulty: 0 });
    const node = run.map.flat().find((item) => item.type === "combat");
    if (!node) throw new Error("QA mobile combat fixture node not found");
    run.availableNodeIds = [node.id];
    enterNode(run, node.id);
    if (!run.combat?.enemies?.length) throw new Error("QA mobile combat fixture combat not started");
    run.combat.turn = "player";
    run.combat.maxEnergy = 3;
    run.combat.energy = 3;
    run.combat.hand = [
      { uid: 7801, cardId: "pulse_lance", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7802, cardId: "tide_ward", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7803, cardId: "memory_sift", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7804, cardId: "null_pin", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7805, cardId: "rill_cut", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7806, cardId: "signal_jab", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7807, cardId: "coral_guard", upgraded: false, temporary: false, costMod: 0 }
    ];
    run.combat.drawPile = [
      { uid: 7811, cardId: "archive_dust", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7812, cardId: "drift_scan", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7813, cardId: "current_siphon", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7814, cardId: "floodgate", upgraded: false, temporary: false, costMod: 0 }
    ];
    run.combat.discardPile = [
      { uid: 7821, cardId: "static_psalm", upgraded: false, temporary: false, costMod: 0 },
      { uid: 7822, cardId: "brass_knuckle", upgraded: false, temporary: false, costMod: 0 }
    ];
    run.combat.exhaustPile = [
      { uid: 7831, cardId: "emergency_seal", upgraded: false, temporary: false, costMod: 0 }
    ];
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, energy: run.combat.energy, hand: run.combat.hand.length };
  })()`);
}

async function captureGroupedEnemyFx(cdp) {
  const fixture = await stageGroupedEnemyFxFixture(cdp);
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".combat-board");
  await clickSelector(cdp, "[data-action='end-turn']");
  await waitForSelector(cdp, ".combat-action-fx.fx-enemy-action");
  const evidence = await evaluate(cdp, `(() => {
    const fx = document.querySelector(".combat-action-fx.fx-enemy-action");
    const actor = fx?.querySelector(".fx-actor-echo");
    const chipText = [...(fx?.querySelectorAll(".fx-chip-row i") ?? [])].map((chip) => chip.innerText.replace(/\\s+/g, " ").trim()).join(" ");
    const beamStyle = fx ? getComputedStyle(fx, "::before") : null;
    const visibleSparkCount = [...document.querySelectorAll(".entity-hit-sparks i")]
      .filter((spark) => getComputedStyle(spark).display !== "none").length;
    const fixtureHasMultiHit = ${JSON.stringify(fixture)}.enemies.some((enemy) => /[x×]\\d/.test(enemy.intent));
    const handCards = [...document.querySelectorAll(".hand-zone .game-card[data-action='play-card']")];
    const handLabels = handCards.map((card) => card.getAttribute("aria-label") ?? "");
    const endTurn = document.querySelector(".end-turn");
    const endTurnText = endTurn?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    return {
      fixture: ${JSON.stringify(fixture)},
      grouped: fx?.classList.contains("fx-grouped") ?? false,
      actorCount: actor?.getAttribute("data-actor-count") ?? "",
      hitCount: actor?.getAttribute("data-hit-count") ?? "",
      actorTitle: actor?.getAttribute("title") ?? "",
      moveName: actor?.querySelector("strong")?.innerText ?? "",
      actorName: actor?.querySelector("em")?.innerText ?? "",
      chipText,
      fixtureHasMultiHit,
      duplicateFxCount: document.querySelectorAll(".combat-action-fx.fx-enemy-action").length,
      duplicatedBeamHidden: beamStyle?.display === "none",
      visibleSparkCount,
      lockedBoard: document.querySelector(".combat-board")?.classList.contains("turn-locked") ?? false,
      endTurnText,
      endTurnAria: endTurn?.getAttribute("aria-label") ?? "",
      endTurnClass: endTurn?.className ?? "",
      handCardCount: handCards.length,
      disabledHandCards: handCards.filter((card) => card.disabled).length,
      lockedHandLabels: handLabels.filter((label) => /상대 턴에는 사용할 수 없음/.test(label)).length,
      unlockedHandLabels: handLabels.filter((label) => /사용 가능/.test(label)).length
    };
  })()`);
  if (
    !evidence.grouped ||
    !evidence.actorCount ||
    !evidence.duplicatedBeamHidden ||
    evidence.visibleSparkCount > 1 ||
    !evidence.lockedBoard ||
    !/상대 턴/.test(evidence.endTurnText) ||
    !/상대 턴 진행 중/.test(evidence.endTurnAria) ||
    evidence.disabledHandCards !== evidence.handCardCount ||
    evidence.lockedHandLabels !== evidence.handCardCount ||
    evidence.unlockedHandLabels !== 0 ||
    (evidence.fixtureHasMultiHit && (!evidence.hitCount || !evidence.chipText.includes("×")))
  ) {
    throw new Error(`Grouped enemy FX missing: ${JSON.stringify(evidence)}`);
  }
  await writeFile(resolve(qaDir, "browser-qa-enemy-grouped-fx.json"), JSON.stringify(evidence, null, 2));
  await capture(cdp, "browser-qa-enemy-grouped-fx.png");
  await waitForSelector(cdp, ".combat-turn-cue.player");
  const playerCueEvidence = await evaluate(cdp, `(() => {
    const cue = document.querySelector(".combat-turn-cue.player");
    const endTurn = document.querySelector(".end-turn");
    const handCards = [...document.querySelectorAll(".hand-zone .game-card[data-action='play-card']")];
    const handLabels = handCards.map((card) => card.getAttribute("aria-label") ?? "");
    return {
      cueText: cue?.innerText.replace(/\\s+/g, " ").trim() ?? "",
      endTurnText: endTurn?.innerText.replace(/\\s+/g, " ").trim() ?? "",
      endTurnAria: endTurn?.getAttribute("aria-label") ?? "",
      endTurnClass: endTurn?.className ?? "",
      handCardCount: handCards.length,
      disabledHandCards: handCards.filter((card) => card.disabled).length,
      readyHandLabels: handLabels.filter((label) => /내 턴을 준비하는 중/.test(label)).length,
      enemyTurnHandLabels: handLabels.filter((label) => /상대 턴에는 사용할 수 없음/.test(label)).length
    };
  })()`);
  if (
    !/내 턴/.test(playerCueEvidence.cueText) ||
    !/내 턴/.test(playerCueEvidence.endTurnText) ||
    /상대 턴/.test(playerCueEvidence.endTurnText) ||
    !/내 턴 준비 중/.test(playerCueEvidence.endTurnAria) ||
    !/turn-player-ready/.test(playerCueEvidence.endTurnClass) ||
    playerCueEvidence.disabledHandCards !== playerCueEvidence.handCardCount ||
    playerCueEvidence.readyHandLabels !== playerCueEvidence.handCardCount ||
    playerCueEvidence.enemyTurnHandLabels !== 0
  ) {
    throw new Error(`Player turn cue button mismatch: ${JSON.stringify(playerCueEvidence)}`);
  }
  await capture(cdp, "browser-qa-turn-player-cue-minimal.png");
  await clearSavedRun(cdp);
  return evidence;
}

async function writeTurnAndVictoryEvidence(groupedEnemyFx, victoryCodaEvidence) {
  const evidence = {
    enemyTurnFxCountWas: Number(groupedEnemyFx.duplicateFxCount ?? 0),
    enemyTurnGrouped: Boolean(groupedEnemyFx.grouped),
    enemyTurnDuplicated: Number(groupedEnemyFx.duplicateFxCount ?? 0) !== 1,
    enemyTurnSparkCount: Number(groupedEnemyFx.visibleSparkCount ?? 0),
    enemyTurnLockedHand: groupedEnemyFx.disabledHandCards === groupedEnemyFx.handCardCount,
    victoryOverlayDuplicated: Boolean(victoryCodaEvidence.victoryOverlayDuplicated),
    rewardReachedAfterVictory: Boolean(victoryCodaEvidence.rewardReachedAfterVictory),
    rewardSurfaceCountAfterVictory: Number(victoryCodaEvidence.rewardSurfaceCountAfterVictory ?? 0),
    codaActionText: victoryCodaEvidence.codaActionText ?? "",
    codaEnemyHeight: Number(victoryCodaEvidence.codaEnemyHeight ?? 0),
    checkedAt: new Date().toISOString()
  };
  if (
    evidence.enemyTurnFxCountWas !== 1 ||
    evidence.enemyTurnDuplicated ||
    evidence.enemyTurnSparkCount > 1 ||
    !evidence.enemyTurnLockedHand ||
    evidence.victoryOverlayDuplicated ||
    !evidence.rewardReachedAfterVictory ||
    evidence.rewardSurfaceCountAfterVictory !== 1
  ) {
    throw new Error(`Turn and victory evidence failed: ${JSON.stringify(evidence)}`);
  }
  await writeFile(resolve(qaDir, "browser-qa-combat-turn-and-victory-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

async function assertEnergyLockedHandUx(cdp) {
  const evidence = await evaluate(cdp, `(() => {
    const board = document.querySelector(".combat-board");
    const cards = [...document.querySelectorAll(".hand-zone .game-card[data-action='play-card']")];
    const paidCards = cards.filter((card) => !/제로 핀/.test(card.getAttribute("aria-label") ?? ""));
    const zeroPin = cards.find((card) => /제로 핀/.test(card.getAttribute("aria-label") ?? ""));
    const softLockedPaidCards = paidCards.filter((card) => card.getAttribute("aria-disabled") === "true");
    const hardDisabledCards = cards.filter((card) => card.disabled);
    const energyText = document.querySelector(".combat-energy-panel")?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const labels = cards.map((card) => card.getAttribute("aria-label") ?? "");
    const paidReasons = paidCards.map((card) => card.getAttribute("aria-label") ?? "");
    const ok =
      Boolean(board) &&
      !board.classList.contains("turn-locked") &&
      cards.length === 4 &&
      paidCards.length === 3 &&
      softLockedPaidCards.length === paidCards.length &&
      hardDisabledCards.length === 0 &&
      Boolean(zeroPin) &&
      zeroPin.getAttribute("aria-disabled") !== "true" &&
      !zeroPin.disabled &&
      paidReasons.every((label) => /전하 부족/.test(label)) &&
      labels.some((label) => /사용 가능/.test(label)) &&
      /0\\s*\\/\\s*3/.test(energyText);
    return {
      ok,
      cardCount: cards.length,
      paidCardCount: paidCards.length,
      softLockedPaidCards: softLockedPaidCards.length,
      hardDisabledCards: hardDisabledCards.length,
      zeroPinPlayable: Boolean(zeroPin && zeroPin.getAttribute("aria-disabled") !== "true" && !zeroPin.disabled),
      paidReasons,
      labels,
      energyText,
      turnLocked: board?.classList.contains("turn-locked") ?? false
    };
  })()`);
  if (!evidence.ok) {
    throw new Error(`Energy locked hand UX failed: ${JSON.stringify(evidence)}`);
  }
  await writeFile(resolve(qaDir, "browser-qa-combat-energy-locked.json"), JSON.stringify(evidence, null, 2));
}

async function assertEnergyLockedHandHover(cdp) {
  const evidence = await evaluate(cdp, `(() => {
    const tooltip = document.querySelector(".card-portal-tooltip:not([hidden])");
    const rail = document.querySelector(".combat-card-preview-rail:not([hidden])");
    const card = document.querySelector(".hand-zone .game-card.energy-locked[aria-disabled='true']");
    const portal = document.querySelector(".card-portal-tooltip");
    const previewRail = document.querySelector(".combat-card-preview-rail");
    const appRoot = document.querySelector("#app");
    const tooltipBox = tooltip?.getBoundingClientRect();
    const cardBox = card?.getBoundingClientRect();
    const hitTarget = cardBox ? document.elementFromPoint(cardBox.left + cardBox.width * 0.5, cardBox.top + cardBox.height * 0.18) : null;
    const railText = rail?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const cardRaised =
      Boolean(cardBox) &&
      cardBox.top >= 0 &&
      cardBox.bottom <= window.innerHeight - 4 &&
      cardBox.height <= 286;
    const tooltipReadable =
      Boolean(tooltipBox) &&
      tooltipBox.left >= 2 &&
      tooltipBox.top >= 2 &&
      tooltipBox.right <= window.innerWidth - 2 &&
      tooltipBox.bottom <= window.innerHeight - 2 &&
      tooltipBox.width >= 276 &&
      tooltipBox.height <= 240 &&
      Boolean(tooltip?.querySelector(".tooltip-rules")?.innerText.trim());
    const ok =
      Boolean(card) &&
      Boolean(tooltip) &&
      Boolean(rail) &&
      tooltipReadable &&
      cardRaised &&
      /사용 불가|전하 부족|전하/.test(railText);
    return {
      ok,
      railText,
      tooltipReadable,
      cardRaised,
      cardDisabled: card?.disabled ?? null,
      cardAriaDisabled: card?.getAttribute("aria-disabled") ?? "",
      cardHasTooltip: Boolean(card?.querySelector(".tooltip")),
      appContainsCard: Boolean(card && appRoot?.contains(card)),
      focused: document.activeElement === card,
      activeElement: document.activeElement?.className ?? document.activeElement?.tagName ?? "",
      combatFxCount: document.querySelectorAll(".combat-action-fx").length,
      boardClass: document.querySelector(".combat-board")?.className ?? "",
      portalHidden: portal?.hidden ?? null,
      portalTextLength: portal?.innerText?.length ?? 0,
      previewRailHidden: previewRail?.hidden ?? null,
      previewRailTextLength: previewRail?.innerText?.length ?? 0,
      hitTargetClass: hitTarget?.className ?? hitTarget?.tagName ?? "",
      hitTargetText: hitTarget?.textContent?.replace(/\\s+/g, " ").trim().slice(0, 80) ?? "",
      cardBox: cardBox ? { top: Math.round(cardBox.top), bottom: Math.round(cardBox.bottom), height: Math.round(cardBox.height) } : null,
      tooltipBox: tooltipBox ? { left: Math.round(tooltipBox.left), top: Math.round(tooltipBox.top), right: Math.round(tooltipBox.right), bottom: Math.round(tooltipBox.bottom), width: Math.round(tooltipBox.width) } : null
    };
  })()`);
  if (!evidence.ok) {
    throw new Error(`Energy locked hand hover failed: ${JSON.stringify(evidence)}`);
  }
}

async function assertStatusTooltipUx(cdp) {
  await hoverSelector(cdp, ".status-row:not(.empty) .status-chip");
  await waitForSelector(cdp, ".status-portal-tooltip:not([hidden])");
  const result = await evaluate(cdp, `(() => {
    const chip = document.querySelector(".status-row:not(.empty) .status-chip");
    const tooltip = document.querySelector(".status-portal-tooltip:not([hidden])");
    const icon = tooltip?.querySelector(".status-tooltip-icon");
    const title = tooltip?.querySelector("strong")?.innerText.trim() ?? "";
    const detail = tooltip?.querySelector("small")?.innerText.trim() ?? "";
    const box = tooltip?.getBoundingClientRect();
    const style = tooltip ? getComputedStyle(tooltip) : null;
    const pseudoDisplay = chip ? getComputedStyle(chip, "::after").display : "";
    const withinViewport = Boolean(box && box.left >= 0 && box.top >= 0 && box.right <= window.innerWidth && box.bottom <= window.innerHeight);
    const ok =
      Boolean(chip) &&
      Boolean(tooltip) &&
      Boolean(icon) &&
      chip.getAttribute("tabindex") === "0" &&
      title.length >= 2 &&
      detail.length >= 8 &&
      pseudoDisplay === "none" &&
      withinViewport &&
      Number(style?.zIndex ?? 0) > 1000;
    return {
      ok,
      title,
      detail,
      tabindex: chip?.getAttribute("tabindex") ?? "",
      pseudoDisplay,
      withinViewport,
      zIndex: style?.zIndex ?? "",
      tooltipCount: document.querySelectorAll(".status-portal-tooltip:not([hidden])").length
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Status tooltip UX failed: ${JSON.stringify(result)}`);
  }
}

async function assertIntentTooltipUx(cdp) {
  await hoverSelector(cdp, ".enemy-card .intent");
  await waitForSelector(cdp, ".intent-portal-tooltip:not([hidden])");
  const result = await evaluate(cdp, `(() => {
    const intent = document.querySelector(".enemy-card .intent");
    const tooltip = document.querySelector(".intent-portal-tooltip:not([hidden])");
    const icon = tooltip?.querySelector(".intent-tooltip-icon");
    const title = tooltip?.querySelector("strong")?.innerText.trim() ?? "";
    const detail = tooltip?.querySelector("small")?.innerText.trim() ?? "";
    const chips = [...(tooltip?.querySelectorAll("i") ?? [])].map((chip) => chip.innerText.replace(/\\s+/g, " ").trim());
    const box = tooltip?.getBoundingClientRect();
    const style = tooltip ? getComputedStyle(tooltip) : null;
    const withinViewport = Boolean(box && box.left >= 0 && box.top >= 0 && box.right <= window.innerWidth && box.bottom <= window.innerHeight);
    const ok =
      Boolean(intent) &&
      Boolean(tooltip) &&
      Boolean(icon) &&
      title.length >= 2 &&
      detail.length >= 8 &&
      chips.length >= 1 &&
      withinViewport &&
      Number(style?.zIndex ?? 0) > 1000;
    return { ok, title, detail, chips, withinViewport, zIndex: style?.zIndex ?? "", tooltipCount: document.querySelectorAll(".intent-portal-tooltip:not([hidden])").length };
  })()`);
  if (!result.ok) {
    throw new Error(`Intent tooltip UX failed: ${JSON.stringify(result)}`);
  }
}

async function stageGroupedEnemyFxFixture(cdp) {
  return await evaluate(cdp, `(async () => {
    const { newRun, enterNode } = await import("./src/engine/game.js");
    const { ENEMY_BY_ID } = await import("./src/data/enemies.js");
    let picked = null;
    for (let index = 0; index < 240; index += 1) {
      const run = newRun({ seed: "qa-grouped-enemy-fx-" + index, difficulty: 0 });
      const node = run.map.flat().find((item) => item.type === "combat");
      run.availableNodeIds = [node.id];
      enterNode(run, node.id);
      if ((run.combat?.enemies?.length ?? 0) >= 2) {
        picked = run;
        break;
      }
    }
    if (!picked) throw new Error("two-enemy combat fixture not found");
    picked.player.hp = picked.player.maxHp;
    picked.player.block = 0;
    for (const enemy of picked.combat.enemies) {
      const template = ENEMY_BY_ID[enemy.templateId];
      enemy.nextMove = template.moves.find((move) => move.damage || move.applyToPlayer?.length) ?? template.moves[0];
    }
    picked.updatedAt = Date.now();
    const payload = JSON.stringify(picked);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return {
      enemies: picked.combat.enemies.map((enemy) => ({ name: enemy.name, intent: enemy.nextMove.intent }))
    };
  })()`);
}

async function stageSummaryFixture(cdp, outcome) {
  const won = outcome === "won";
  const route = summaryFixtureRouteLiteral(won, !won);
  await evaluate(cdp, `(async () => {
    const { newRun } = await import("./src/engine/game.js");
    const run = newRun({ seed: ${JSON.stringify(`qa-summary-${outcome}`)}, difficulty: ${won ? 2 : 1} });
    const extraCards = [
      ["signal_jab", true],
      ["archive_dust", true],
      ["wire_reef", false],
      ["battery_cathedral", false],
      ["redaction_blade", false],
      ["coral_guard", true],
      ["rill_cut", false]
    ];
    for (const [cardId, upgraded] of extraCards) {
      run.player.deck.push({ uid: run.nextUid++, cardId, upgraded, temporary: false, costMod: 0 });
    }
    run.player.relics = ["salted_compass", "cracked_anchor", "mnemonic_shell", "salvaged_lens", "map_of_silt", "diver_medal"].slice(0, ${won ? 6 : 4});
    run.player.hp = ${won ? 41 : 0};
    run.player.gold = ${won ? 164 : 77};
    const route = ${route};
    run.stats = {
      ...run.stats,
      floors: ${won ? 21 : 21},
      fights: ${won ? 13 : 13},
      elitesKilled: ${won ? 4 : 3},
      cardsAdded: ${won ? 11 : 7},
      cardsRemoved: ${won ? 3 : 1},
      enemiesKilled: ${won ? 29 : 27},
      damageDealt: ${won ? 1184 : 1108},
      damageTaken: ${won ? 116 : 172},
      bossesKilled: ${won ? 3 : 2},
      relicsFound: run.player.relics.length
    };
    run.phase = "summary";
    run.combat = null;
    run.reward = null;
    run.event = null;
    run.shop = null;
    run.selector = null;
    run.currentNodeId = null;
    run.summary = {
      won: ${won},
      reason: ${JSON.stringify(won ? "마지막 문 성가대를 넘어 심해 코어를 회수했습니다." : "마지막 문 성가대의 문 낙하를 버티지 못했습니다.")},
      seed: run.seed,
      difficultyId: ${won ? 2 : 1},
      difficulty: ${JSON.stringify(won ? "무광층" : "냉수층")},
      durationSeconds: ${won ? 3184 : 1438},
      floors: ${won ? 21 : 21},
      bossesDefeated: ${won ? 3 : 2},
      killedBosses: ${won ? JSON.stringify(["대분류자 칼리스", "침몰 알고리즘", "마지막 문 성가대"]) : JSON.stringify(["대분류자 칼리스", "침몰 알고리즘"])},
      hp: ${won ? 41 : 0},
      maxHp: run.player.maxHp,
      fights: ${won ? 13 : 13},
      elitesKilled: ${won ? 4 : 3},
      cardsAdded: ${won ? 11 : 7},
      cardsRemoved: ${won ? 3 : 1},
      deckSize: run.player.deck.length,
      relics: run.player.relics.length,
      gold: run.player.gold,
      killed: ${won ? 29 : 27},
      damageDealt: ${won ? 1184 : 1108},
      damageTaken: ${won ? 116 : 172},
      finalCombat: ${won ? "null" : JSON.stringify(summaryFinalBossFixture())},
      route,
      build: ${won ? JSON.stringify(["mark", "ward", "cycle"]) : JSON.stringify(["virus", "ward"])}
    };
    run.log.push({ text: run.summary.won ? "런 승리." : "패배: " + run.summary.reason, tone: "system" });
    run.updatedAt = Date.now();
    const payload = JSON.stringify(run);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
    return { phase: run.phase, won: run.summary.won };
  })()`);
}

async function stageRecordsFixture(cdp) {
  const wonRoute = summaryFixtureRouteLiteral(true);
  const lostRoute = summaryFixtureRouteLiteral(false);
  await evaluate(cdp, `(() => {
    const now = Date.now();
    const records = {
      runs: 8,
      wins: 3,
      losses: 5,
      bestFloor: 21,
      bossesKilled: 7,
      bestDamage: 1240,
      builds: { mark: 4, ward: 3, virus: 2, charge: 1 },
      bosses: { "대분류자 칼리스": 5, "침몰 알고리즘": 2, "마지막 문 성가대": 1 },
      difficulties: {
        "0": { id: 0, name: "표층", runs: 2, wins: 2, losses: 0, bestFloor: 21, bossesKilled: 6, bestDamage: 980, lastSeed: "qa-records-clear", lastCompletedAt: now - 86400000, lastWon: true },
        "1": { id: 1, name: "냉수층", runs: 4, wins: 1, losses: 3, bestFloor: 21, bossesKilled: 1, bestDamage: 1240, lastSeed: "qa-records-lost", lastCompletedAt: now - 3600000, lastWon: false },
        "2": { id: 2, name: "무광층", runs: 2, wins: 0, losses: 2, bestFloor: 14, bossesKilled: 0, bestDamage: 704, lastSeed: "qa-records-pressure", lastCompletedAt: now - 172800000, lastWon: false }
      },
      dailyContracts: {
        runs: 3,
        wins: 1,
        bestFloor: 21,
        history: [
          { id: "daily-a", completedAt: now - 3600000, date: "2026-05-18", won: false, seed: "daily-2026-05-18-d1", difficultyId: 1, difficulty: "냉수층", floors: 12, bossesDefeated: 1, modifiers: ["희박 산소", "정전 아카이브"], build: ["virus", "ward"] },
          { id: "daily-b", completedAt: now - 90000000, date: "2026-05-17", won: true, seed: "daily-2026-05-17-d1", difficultyId: 1, difficulty: "냉수층", floors: 21, bossesDefeated: 3, modifiers: ["짧은 보상", "거친 해류"], build: ["mark", "ward"] }
        ]
      },
      history: [
        {
          id: "qa-record-lost",
          completedAt: now - 3600000,
          won: false,
          reason: "대분류자 칼리스의 큰 공격을 막지 못했습니다.",
          seed: "qa-records-lost",
          difficultyId: 1,
          difficulty: "냉수층",
          challenge: null,
          durationSeconds: 1588,
          floors: 12,
          bossesDefeated: 1,
          killedBosses: ["대분류자 칼리스"],
          deckSize: 26,
          relics: 4,
          gold: 77,
          hp: 0,
          maxHp: 92,
          cardsAdded: 12,
          cardsRemoved: 1,
          damageDealt: 704,
          damageTaken: 152,
          route: ${lostRoute},
          build: ["virus", "ward"]
        },
        {
          id: "qa-record-won",
          completedAt: now - 86400000,
          won: true,
          reason: "심해 코어를 회수했습니다.",
          seed: "qa-records-clear",
          difficultyId: 0,
          difficulty: "표층",
          challenge: null,
          durationSeconds: 3024,
          floors: 21,
          bossesDefeated: 3,
          killedBosses: ["대분류자 칼리스", "침몰 알고리즘", "마지막 문 성가대"],
          deckSize: 20,
          relics: 7,
          gold: 188,
          hp: 38,
          maxHp: 92,
          cardsAdded: 9,
          cardsRemoved: 3,
          damageDealt: 1240,
          damageTaken: 112,
          route: ${wonRoute},
          build: ["mark", "ward", "cycle"]
        }
      ]
    };
    localStorage.setItem("abyssalArchive.records.v1", JSON.stringify(records));
    return records.history.length;
  })()`);
}

function summaryFixtureRouteLiteral(won, finalBossLoss = false) {
  const route = won
    ? {
        totalFloors: 21,
        elites: 4,
        events: 4,
        shops: 2,
        rests: 3,
        bosses: 3,
        acts: [
          { act: 1, floors: 7, combat: 4, elite: 1, event: 1, shop: 0, rest: 1, boss: 1, lastFloor: 7, stoppedAt: { floor: 7, type: "boss", completed: true }, boss: "defeated" },
          { act: 2, floors: 7, combat: 3, elite: 2, event: 1, shop: 1, rest: 1, boss: 1, lastFloor: 14, stoppedAt: { floor: 14, type: "boss", completed: true }, boss: "defeated" },
          { act: 3, floors: 7, combat: 3, elite: 1, event: 2, shop: 1, rest: 1, boss: 1, lastFloor: 21, stoppedAt: { floor: 21, type: "boss", completed: true }, boss: "defeated" }
        ]
      }
    : finalBossLoss
      ? {
          totalFloors: 21,
          elites: 3,
          events: 4,
          shops: 2,
          rests: 3,
          bosses: 2,
          acts: [
            { act: 1, floors: 7, combat: 4, elite: 1, event: 1, shop: 0, rest: 1, boss: 1, lastFloor: 7, stoppedAt: { floor: 7, type: "boss", completed: true }, boss: "defeated" },
            { act: 2, floors: 7, combat: 3, elite: 1, event: 1, shop: 1, rest: 1, boss: 1, lastFloor: 14, stoppedAt: { floor: 14, type: "boss", completed: true }, boss: "defeated" },
            { act: 3, floors: 7, combat: 3, elite: 1, event: 2, shop: 1, rest: 1, boss: 1, lastFloor: 21, stoppedAt: { floor: 21, type: "boss", completed: false }, boss: "reached" }
          ]
        }
    : {
        totalFloors: 12,
        elites: 1,
        events: 3,
        shops: 1,
        rests: 2,
        bosses: 1,
        acts: [
          { act: 1, floors: 7, combat: 4, elite: 1, event: 1, shop: 0, rest: 1, boss: 1, lastFloor: 7, stoppedAt: { floor: 7, type: "boss", completed: true }, boss: "defeated" },
          { act: 2, floors: 5, combat: 2, elite: 0, event: 2, shop: 1, rest: 1, boss: 0, lastFloor: 12, stoppedAt: { floor: 12, type: "combat", completed: false }, boss: "unseen" },
          { act: 3, floors: 0, combat: 0, elite: 0, event: 0, shop: 0, rest: 0, boss: 0, lastFloor: 0, stoppedAt: null, boss: "unseen" }
        ]
      };
  return JSON.stringify(route);
}

function summaryFinalBossFixture() {
  return {
    type: "boss",
    turn: 13,
    enemyCount: 2,
    bossId: "last_gate_choir",
    bossName: "마지막 문 성가대",
    bossHp: 92,
    bossMaxHp: 350,
    bossBlock: 0,
    bossPhase: 2,
    bossMove: "gate_slam",
    bossIntent: "공격 21",
    focusEnemyId: "last_gate_choir",
    focusEnemyName: "마지막 문 성가대",
    focusEnemyTier: "boss",
    playerHp: 0,
    playerBlock: 0,
    playerStatuses: { virus: 1 },
    forecast: {
      incomingDamage: 25,
      blockedDamage: 0,
      hpLoss: 25,
      incomingStatuses: [],
      enemyBlock: 0,
      enemyHealing: 0,
      enemyBuffs: [],
      summons: 0,
      attackIntents: 1
    }
  };
}

async function clearRecords(cdp) {
  await evaluate(cdp, `(() => {
    localStorage.removeItem("abyssalArchive.records.v1");
    return true;
  })()`);
}

async function clearSavedRun(cdp) {
  await evaluate(cdp, `(() => {
    localStorage.removeItem("abyssalArchive.save.v1");
    localStorage.removeItem("abyssalArchive.save.backup.v1");
    return true;
  })()`);
}

async function dispatchClick(cdp, x, y) {
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none"
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1
  });
}

async function hoverSelector(cdp, selector, ratio = { x: 0.5, y: 0.5 }) {
  const rect = await evaluate(cdp, `(selector => {
    const target = document.querySelector(selector);
    if (!target) return null;
    const box = target.getBoundingClientRect();
    return { left: box.left, top: box.top, width: box.width, height: box.height };
  })(${JSON.stringify(selector)})`);
  if (!rect) throw new Error(`Selector not found for hover: ${selector}`);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 4,
    y: 4,
    button: "none"
  });
  await wait(80);
  const x = rect.left + rect.width * ratio.x;
  const y = rect.top + rect.height * ratio.y;
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none"
  });
  await wait(300);
}

async function triggerHoverSelector(cdp, selector) {
  const evidence = await evaluate(cdp, `(selector => {
    const target = document.querySelector(selector);
    if (!target) return { ok: false, reason: "missing-target" };
    const box = target.getBoundingClientRect();
    const options = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height * 0.18,
      relatedTarget: document.body
    };
    target.focus?.({ preventScroll: true });
    target.dispatchEvent(new FocusEvent("focusin", { bubbles: true, composed: true, relatedTarget: document.body }));
    target.dispatchEvent(new PointerEvent("pointerover", { ...options, pointerType: "mouse", pointerId: 1 }));
    target.dispatchEvent(new PointerEvent("pointermove", { ...options, pointerType: "mouse", pointerId: 1 }));
    target.dispatchEvent(new MouseEvent("mouseover", options));
    target.dispatchEvent(new MouseEvent("mousemove", options));
    const previewActive = Boolean(document.querySelector(".combat-board.preview-active"));
    return {
      ok: previewActive,
      previewActive,
      activeElement: document.activeElement === target,
      cardClass: target.className,
      cardAria: target.getAttribute("aria-label") ?? "",
      previewRailHidden: document.querySelector(".combat-card-preview-rail")?.hidden ?? null,
      tooltipHidden: document.querySelector(".card-portal-tooltip")?.hidden ?? null,
      targetCount: document.querySelectorAll(".enemy-card.preview-target").length,
      aimHidden: document.querySelector(".combat-aim-line")?.hidden ?? null,
      boardClass: document.querySelector(".combat-board")?.className ?? "",
      handCount: document.querySelectorAll(".hand-zone .game-card[data-action='play-card']").length
    };
  })(${JSON.stringify(selector)})`);
  if (!evidence.ok) throw new Error(`Hover activation failed: ${JSON.stringify({ selector, evidence })}`);
  await wait(180);
}

async function assertCardHoverLayout(cdp) {
  const result = await evaluate(cdp, `(() => {
    const tooltip = document.querySelector(".card-portal-tooltip:not([hidden])");
    if (!tooltip) return { ok: false, reason: "missing-tooltip" };
    const box = tooltip.getBoundingClientRect();
    const margin = 2;
    const withinViewport = box.left >= margin && box.top >= margin && box.right <= window.innerWidth - margin && box.bottom <= window.innerHeight - margin;
    const recommendedCard = document.querySelector(".hand-zone .game-card.recommended");
    const recommendedBadge = recommendedCard?.querySelector(".card-recommendation");
    const recommendedTitle = recommendedCard?.querySelector(".card-name");
    const recommendedBox = recommendedCard?.getBoundingClientRect();
    const badgeBox = recommendedBadge?.getBoundingClientRect();
    const titleBox = recommendedTitle?.getBoundingClientRect();
    const previewBoardActive = Boolean(document.querySelector(".combat-board.preview-active"));
    const previewingCard = document.querySelector(".hand-zone .game-card.previewing-card");
    const previewingCardBox = previewingCard?.getBoundingClientRect();
    const dimmedCards = [...document.querySelectorAll(".hand-zone .game-card[data-action='play-card']:not(.previewing-card)")].filter((card) => Number(getComputedStyle(card).opacity) < 0.7).length;
    const keywordText = tooltip.querySelector(".tooltip-keywords span");
    const rulesText = tooltip.querySelector(".tooltip-rules");
    const previewRail = document.querySelector(".combat-card-preview-rail:not([hidden])");
    const previewRailText = previewRail?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const tooltipPreview = tooltip.querySelector(".tooltip-preview");
    const tooltipPreviewHidden = !tooltipPreview || getComputedStyle(tooltipPreview).display === "none";
    const previewRailReadable = Boolean(
      previewRail &&
      /사용 가능|사용 불가|피해|방어|전하|표식|바이러스|취약|약화|⚡/.test(previewRailText)
    );
    const tooltipReadable =
      box.width >= 276 &&
      box.height <= 240 &&
      Boolean(rulesText && rulesText.getBoundingClientRect().height >= 18) &&
      (!keywordText || getComputedStyle(keywordText).whiteSpace === "normal") &&
      tooltipPreviewHidden &&
      previewRailReadable;
    const hoverCardStable = Boolean(
      previewingCardBox &&
      previewingCardBox.top >= 0 &&
      previewingCardBox.bottom <= window.innerHeight - 4 &&
      previewingCardBox.height <= 286
    );
    const badgeInsideCard = !recommendedCard || Boolean(badgeBox && recommendedBox && badgeBox.left >= recommendedBox.left && badgeBox.right <= recommendedBox.right && badgeBox.top >= recommendedBox.top && badgeBox.bottom <= recommendedBox.bottom);
    const badgeClearTitle = !recommendedCard || Boolean(badgeBox && titleBox && (badgeBox.bottom <= titleBox.top || badgeBox.top >= titleBox.bottom || badgeBox.right <= titleBox.left || badgeBox.left >= titleBox.right));
    const panels = [...document.querySelectorAll(".combat-play-panel, .target-assist, .combat-card-preview-rail:not([hidden])")];
    const overlaps = panels
      .map((panel) => {
        const panelBox = panel.getBoundingClientRect();
        const overlap = box.right > panelBox.left && box.left < panelBox.right && box.bottom > panelBox.top && box.top < panelBox.bottom;
        return overlap ? panel.className : null;
      })
      .filter(Boolean);
    const combatantOverlaps = [...document.querySelectorAll(".player-sprite, .player-plate, .enemy-sprite, .enemy-intent-lane, .enemy-card .combatant-plate")]
      .map((combatant) => {
        const combatantBox = combatant.getBoundingClientRect();
        const overlap = box.right > combatantBox.left && box.left < combatantBox.right && box.bottom > combatantBox.top && box.top < combatantBox.bottom;
        return overlap ? combatant.className : null;
      })
      .filter(Boolean);
    const selfPreview = Boolean(document.querySelector(".player-stand.preview-self"));
    const selfBlockPreview = document.querySelector(".player-stand.preview-self .block-readout.preview-block[data-preview-result]");
    const selfBlockResult = selfBlockPreview?.getAttribute("data-preview-result") ?? "";
    const selfBlockAfter = selfBlockPreview?.querySelector("strong")?.getAttribute("data-preview-after") ?? "";
    const selfBlockStyle = selfBlockPreview ? getComputedStyle(selfBlockPreview) : null;
    const selfBlockProjectionOk = Boolean(selfBlockPreview && /^\\+\\d+/.test(selfBlockResult) && Number(selfBlockAfter) > 0 && selfBlockStyle?.display !== "none");
    const selfUtilityProjectionOk = selfPreview && /뽑기|전하|회복|정화|비용|⚡/.test(previewRailText);
    const selfProjectionOk = !selfPreview || selfBlockProjectionOk || selfUtilityProjectionOk;
    const enemyPreview = Boolean(document.querySelector(".enemy-card.preview-target"));
    const aimLine = document.querySelector(".combat-aim-line");
    const aimLineHidden = !aimLine || aimLine.hidden || getComputedStyle(aimLine).display === "none";
    const aimLineMatchesTarget = selfPreview ? aimLineHidden : enemyPreview ? !aimLineHidden : true;
    return {
      ok: withinViewport && tooltipReadable && hoverCardStable && overlaps.length === 0 && combatantOverlaps.length === 0 && badgeInsideCard && badgeClearTitle && aimLineMatchesTarget && selfProjectionOk && previewBoardActive && Boolean(previewingCard) && dimmedCards >= 1,
      withinViewport,
      tooltipReadable,
      hoverCardStable,
      badgeInsideCard,
      badgeClearTitle,
      tooltipPreviewHidden,
      previewRailReadable,
      previewRailText,
      previewBoardActive,
      previewingCard: Boolean(previewingCard),
      dimmedCards,
      selfPreview,
      selfBlockResult,
      selfBlockAfter,
      selfBlockProjectionOk,
      selfUtilityProjectionOk,
      selfProjectionOk,
      enemyPreview,
      aimLineHidden,
      aimLineMatchesTarget,
      overlaps,
      combatantOverlaps,
      box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height },
      previewingCardBox: previewingCardBox
        ? { left: previewingCardBox.left, top: previewingCardBox.top, right: previewingCardBox.right, bottom: previewingCardBox.bottom, width: previewingCardBox.width, height: previewingCardBox.height }
        : null
    };
  })()`);
  if (!result.ok) throw new Error(`Card hover layout failed: ${JSON.stringify(result)}`);
}

async function assertCardOutcomeReadability(cdp) {
  const result = await evaluate(cdp, `(() => {
    const cleanText = (element) => element?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const handOutcomeNodes = [...document.querySelectorAll(".hand-zone .game-card[data-action='play-card'] .card-outcome .primary em")];
    const rail = document.querySelector(".combat-card-preview-rail:not([hidden])");
    const railEffectNodes = [...(rail?.querySelectorAll(".preview-effect-icons em") ?? [])];
    const outcomeTexts = handOutcomeNodes.map(cleanText).filter(Boolean);
    const railEffectTexts = railEffectNodes.map(cleanText).filter(Boolean);
    const outcomeFits = handOutcomeNodes.map((item) => ({
      text: cleanText(item),
      fit: item.scrollWidth <= item.clientWidth + 2,
      width: Math.round(item.clientWidth),
      scrollWidth: Math.round(item.scrollWidth)
    }));
    const railEffectsFit = railEffectNodes.map((item) => ({
      text: cleanText(item),
      fit: item.scrollWidth <= item.clientWidth + 2,
      width: Math.round(item.clientWidth),
      scrollWidth: Math.round(item.scrollWidth)
    }));
    const railText = cleanText(rail);
    const semanticPattern = /(피해|방어|뽑기|전하|정화|회복|처치|표식|바이러스|취약|약화|집중|생성|버림|소멸|강화|비용|효과)/;
    const bareNumberPattern = /^[+−-]?\\d+$/;
    const hasReadableHand =
      outcomeTexts.length >= 6 &&
      outcomeTexts.some((text) => /피해\\s*\\d+/.test(text)) &&
      outcomeTexts.some((text) => /방어\\s*\\d+/.test(text)) &&
      outcomeTexts.some((text) => /뽑기\\s*\\d+/.test(text)) &&
      outcomeTexts.every((text) => semanticPattern.test(text) && !bareNumberPattern.test(text)) &&
      outcomeFits.every((item) => item.fit);
    const hasReadableRail =
      Boolean(rail) &&
      /전하\\s*\\d+/.test(railText) &&
      railEffectTexts.length >= 1 &&
      railEffectTexts.every((text) => semanticPattern.test(text) && !bareNumberPattern.test(text)) &&
      railEffectsFit.every((item) => item.fit);
    return {
      ok: hasReadableHand && hasReadableRail,
      outcomeTexts,
      outcomeFits,
      railText,
      railEffectTexts,
      railEffectsFit,
      hasReadableHand,
      hasReadableRail
    };
  })()`);
  if (!result.ok) throw new Error(`Card outcome readability failed: ${JSON.stringify(result)}`);
  await writeFile(resolve(qaDir, "browser-qa-card-outcome-readability.json"), `${JSON.stringify(result, null, 2)}\n`);
}

async function assertMobileCombatTouchUx(cdp) {
  const evidence = await evaluate(cdp, `(() => {
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        top: Math.round(box.top),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
        height: Math.round(box.height)
      };
    };
    const overlaps = (left, right, gap = 0) => {
      if (!left || !right) return false;
      return left.right + gap > right.left && left.left < right.right + gap && left.bottom + gap > right.top && left.top < right.bottom + gap;
    };
    const board = document.querySelector(".combat-board");
    const hand = document.querySelector(".hand-zone");
    const cards = [...document.querySelectorAll(".hand-zone .game-card[data-action='play-card']")];
    const endTurn = document.querySelector(".end-turn");
    const resource = document.querySelector(".combat-resource-stack");
    const energy = document.querySelector(".combat-energy-panel");
    const playPanel = document.querySelector(".combat-play-panel");
    const targetAssist = document.querySelector(".target-assist");
    const enemyLine = document.querySelector(".enemy-line");
    const enemies = [...document.querySelectorAll(".enemy-card:not(.dead)")];
    const piles = [...document.querySelectorAll(".combat-pile-dock .pile")];
    const handBox = rect(hand);
    const endBox = rect(endTurn);
    const resourceBox = rect(resource);
    const energyBox = rect(energy);
    const playBox = rect(playPanel);
    const targetBox = rect(targetAssist);
    const enemyLineBox = rect(enemyLine);
    const cardBoxes = cards.map(rect);
    const pileBoxes = piles.map(rect);
    const firstScrollLeft = hand?.scrollLeft ?? 0;
    const canScrollHand = Boolean(hand && hand.scrollWidth > hand.clientWidth + 24);
    if (hand) hand.scrollLeft = hand.scrollWidth;
    const didScrollHand = Boolean(hand && hand.scrollLeft > firstScrollLeft + 8);
    if (hand) hand.scrollLeft = 0;
    const handStyle = hand ? getComputedStyle(hand) : null;
    const cardStyle = cards[0] ? getComputedStyle(cards[0]) : null;
    const maxCardRight = Math.max(0, ...cardBoxes.map((box) => box?.right ?? 0));
    const mobileViewport = window.matchMedia("(max-width: 680px)").matches;
    const noPageOverflow = document.documentElement.scrollWidth <= window.innerWidth + 2;
    const handInViewport = Boolean(handBox && handBox.left >= 0 && handBox.right <= window.innerWidth && handBox.bottom <= window.innerHeight && handBox.height >= 180);
    const cardsReadable = cardBoxes.length >= 7 && cardBoxes.every((box) => box && box.width >= 118 && box.width <= 132 && box.height >= 184 && box.bottom <= window.innerHeight + 2);
    const controlsVisible = Boolean(
      endBox &&
      resourceBox &&
      energyBox &&
      playBox &&
      endBox.width >= 70 &&
      endBox.height >= 70 &&
      endBox.right <= window.innerWidth &&
      endBox.bottom <= window.innerHeight &&
      energyBox.height >= 42 &&
      pileBoxes.length === 4 &&
      pileBoxes.every((box) => box && box.height >= 32)
    );
    const noCriticalOverlap =
      !overlaps(handBox, endBox, 2) &&
      !overlaps(resourceBox, endBox, 2) &&
      !overlaps(playBox, endBox, 2) &&
      !overlaps(playBox, handBox, 6) &&
      (!targetBox || targetBox.width <= 1 || !overlaps(targetBox, handBox, 6));
    const touchRailReady =
      handStyle?.overflowX === "auto" &&
      handStyle?.overscrollBehaviorX === "contain" &&
      (handStyle?.touchAction ?? "").includes("pan-x") &&
      (cardStyle?.touchAction ?? "").includes("pan-x");
    const combatReadable = Boolean(board && enemyLineBox && enemyLineBox.top >= 0 && enemies.length >= 1);
    return {
      ok: mobileViewport && noPageOverflow && handInViewport && canScrollHand && didScrollHand && cardsReadable && controlsVisible && noCriticalOverlap && touchRailReady && combatReadable,
      mobileViewport,
      noPageOverflow,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      handInViewport,
      canScrollHand,
      didScrollHand,
      cardsReadable,
      controlsVisible,
      noCriticalOverlap,
      touchRailReady,
      combatReadable,
      handStyle: {
        overflowX: handStyle?.overflowX ?? "",
        touchAction: handStyle?.touchAction ?? "",
        overscrollBehaviorX: handStyle?.overscrollBehaviorX ?? ""
      },
      cardTouchAction: cardStyle?.touchAction ?? "",
      boxes: { hand: handBox, endTurn: endBox, resource: resourceBox, energy: energyBox, playPanel: playBox, targetAssist: targetBox, enemyLine: enemyLineBox },
      cardCount: cards.length,
      cardBoxes: cardBoxes.slice(0, 3),
      maxCardRight,
      pileBoxes
    };
  })()`);
  if (!evidence.ok) {
    throw new Error(`Mobile combat touch UX failed: ${JSON.stringify(evidence)}`);
  }
  await writeFile(resolve(qaDir, "browser-qa-mobile-combat-refreshed.json"), JSON.stringify(evidence, null, 2));
}

async function assertTabletCombatUx(cdp) {
  const evidence = await evaluate(cdp, `(() => {
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        left: Math.round(box.left),
        top: Math.round(box.top),
        right: Math.round(box.right),
        bottom: Math.round(box.bottom),
        width: Math.round(box.width),
        height: Math.round(box.height)
      };
    };
    const overlaps = (left, right, gap = 0) => {
      if (!left || !right) return false;
      return left.right + gap > right.left && left.left < right.right + gap && left.bottom + gap > right.top && left.top < right.bottom + gap;
    };
    const hand = document.querySelector(".hand-zone");
    const cards = [...document.querySelectorAll(".hand-zone .game-card[data-action='play-card']")];
    const board = document.querySelector(".combat-board");
    const command = document.querySelector(".combat-command-row");
    const resource = document.querySelector(".combat-resource-stack");
    const energy = document.querySelector(".combat-energy-panel");
    const playPanel = document.querySelector(".combat-play-panel");
    const endTurn = document.querySelector(".end-turn");
    const arena = document.querySelector(".arena");
    const enemyLine = document.querySelector(".enemy-line");
    const targetAssist = document.querySelector(".target-assist");
    const playerPlate = document.querySelector(".player-plate");
    const enemyPlates = [...document.querySelectorAll(".enemy-card:not(.dead) .combatant-plate")];
    const piles = [...document.querySelectorAll(".combat-pile-dock .pile")];
    const handBox = rect(hand);
    const commandBox = rect(command);
    const resourceBox = rect(resource);
    const energyBox = rect(energy);
    const playBox = rect(playPanel);
    const endBox = rect(endTurn);
    const arenaBox = rect(arena);
    const enemyLineBox = rect(enemyLine);
    const targetBox = rect(targetAssist);
    const playerPlateBox = rect(playerPlate);
    const enemyPlateBoxes = enemyPlates.map(rect);
    const pileBoxes = piles.map(rect);
    const cardBoxes = cards.map(rect);
    const tabletViewport = window.matchMedia("(min-width: 681px) and (max-width: 1040px)").matches;
    const noPageOverflow = document.documentElement.scrollWidth <= window.innerWidth + 2;
    const firstScrollLeft = hand?.scrollLeft ?? 0;
    const canScrollHand = Boolean(hand && hand.scrollWidth > hand.clientWidth + 24);
    if (hand) hand.scrollLeft = hand.scrollWidth;
    const didScrollHand = Boolean(hand && hand.scrollLeft > firstScrollLeft + 8);
    if (hand) hand.scrollLeft = 0;
    const handStyle = hand ? getComputedStyle(hand) : null;
    const cardStyle = cards[0] ? getComputedStyle(cards[0]) : null;
    const handInViewport = Boolean(handBox && handBox.left >= 0 && handBox.right <= window.innerWidth && handBox.bottom <= window.innerHeight && handBox.height >= 230);
    const cardsReadable = cardBoxes.length >= 7 && cardBoxes.every((box) => box && box.width >= 124 && box.width <= 170 && box.height >= 190 && box.bottom <= window.innerHeight + 2);
    const commandCompact = !commandBox || commandBox.width <= 1 || (commandBox.top >= 0 && commandBox.right <= window.innerWidth);
    const playPanelReady = Boolean(playBox && playBox.width >= 320 && playBox.left >= 0 && playBox.right <= window.innerWidth);
    const controlsVisible = Boolean(
      resourceBox &&
      energyBox &&
      playPanelReady &&
      endBox &&
      commandCompact &&
      resourceBox.width >= 88 &&
      resourceBox.left >= 0 &&
      resourceBox.bottom <= window.innerHeight &&
      energyBox.height >= 48 &&
      endBox.width >= 80 &&
      endBox.height >= 72 &&
      endBox.right <= window.innerWidth &&
      endBox.bottom <= window.innerHeight &&
      pileBoxes.length === 4 &&
      pileBoxes.every((box) => box && box.height >= 32)
    );
    const noCriticalOverlap =
      !overlaps(handBox, endBox, 2) &&
      !overlaps(resourceBox, endBox, 2) &&
      !overlaps(playBox, endBox, 2) &&
      !overlaps(playBox, handBox, 6) &&
      (!targetBox || targetBox.width <= 1 || !overlaps(targetBox, handBox, 6));
    const touchRailReady =
      handStyle?.overflowX === "auto" &&
      handStyle?.overscrollBehaviorX === "contain" &&
      (handStyle?.touchAction ?? "").includes("pan-x") &&
      (cardStyle?.touchAction ?? "").includes("pan-x");
    const combatReadable = Boolean(board && enemyLineBox && enemyLineBox.top >= 0 && enemyLineBox.bottom <= window.innerHeight && document.querySelector(".enemy-card:not(.dead)"));
    const combatantsFramed = Boolean(
      arenaBox &&
      playerPlateBox &&
      playerPlateBox.left >= 8 &&
      playerPlateBox.right <= window.innerWidth - 8 &&
      enemyPlateBoxes.length >= 1 &&
      enemyPlateBoxes.every((box) => box && box.left >= 8 && box.right <= window.innerWidth - 8)
    );
    const arenaUsesVerticalSpace = Boolean(handBox && enemyLineBox && handBox.top - enemyLineBox.bottom <= 300);
    return {
      ok: tabletViewport && noPageOverflow && handInViewport && canScrollHand && didScrollHand && cardsReadable && controlsVisible && noCriticalOverlap && touchRailReady && combatReadable && combatantsFramed && arenaUsesVerticalSpace,
      tabletViewport,
      noPageOverflow,
      scrollWidth: document.documentElement.scrollWidth,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      handInViewport,
      canScrollHand,
      didScrollHand,
      cardsReadable,
      controlsVisible,
      commandCompact,
      playPanelReady,
      noCriticalOverlap,
      touchRailReady,
      combatReadable,
      combatantsFramed,
      arenaUsesVerticalSpace,
      arenaToHandGap: handBox && enemyLineBox ? handBox.top - enemyLineBox.bottom : null,
      handStyle: {
        overflowX: handStyle?.overflowX ?? "",
        touchAction: handStyle?.touchAction ?? "",
        overscrollBehaviorX: handStyle?.overscrollBehaviorX ?? ""
      },
      cardTouchAction: cardStyle?.touchAction ?? "",
      boxes: { hand: handBox, command: commandBox, resource: resourceBox, energy: energyBox, playPanel: playBox, endTurn: endBox, arena: arenaBox, enemyLine: enemyLineBox, playerPlate: playerPlateBox, enemyPlates: enemyPlateBoxes, targetAssist: targetBox },
      cardCount: cards.length,
      cardBoxes: cardBoxes.slice(0, 3),
      pileBoxes
    };
  })()`);
  if (!evidence.ok) {
    throw new Error(`Tablet combat UX failed: ${JSON.stringify(evidence)}`);
  }
  await writeFile(resolve(qaDir, "browser-qa-tablet-combat-refreshed.json"), JSON.stringify(evidence, null, 2));
}

async function assertCombatRiskSingleSource(cdp) {
  const result = await evaluate(cdp, `(() => {
    const command = document.querySelector(".combat-board .combat-command-row");
    const forecast = document.querySelector(".combat-board .forecast-primary");
    const endTurn = document.querySelector(".end-turn");
    const endSmall = endTurn?.querySelector("small");
    const commandStyle = command ? getComputedStyle(command) : null;
    const commandBox = command?.getBoundingClientRect();
    const forecastBox = forecast?.getBoundingClientRect();
    const endBox = endTurn?.getBoundingClientRect();
    const endText = endTurn?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const endTitle = endTurn?.getAttribute("title") ?? "";
    const riskDetail = endTurn?.getAttribute("data-risk-detail") ?? "";
    const riskTone = [...(endTurn?.classList ?? [])].find((item) => item.startsWith("risk-")) ?? "";
    const riskTooltip = endTurn ? getComputedStyle(endTurn, "::before") : null;
    const ring = endTurn ? getComputedStyle(endTurn, "::after") : null;
    const commandHidden =
      Boolean(commandBox && commandBox.width <= 1 && commandBox.height <= 1) &&
      commandStyle?.position === "absolute" &&
      commandStyle?.clip !== "auto";
    const forecastHidden = !forecastBox || (forecastBox.width <= 1 && forecastBox.height <= 1);
    const endVisible = Boolean(endBox && endBox.width >= 96 && endBox.height >= 96 && endBox.right <= window.innerWidth && endBox.bottom <= window.innerHeight);
    const ringExpected = riskTone === "risk-danger" || riskTone === "risk-warning" || riskTone === "risk-setup";
    const ringVisible = !ringExpected || (ring?.content !== "none" && Number(ring?.opacity ?? 0) > 0.1);
    const ok =
      commandHidden &&
      forecastHidden &&
      endVisible &&
      Boolean(endSmall) &&
      /턴 종료/.test(endText) &&
      /체력|상태|방어|준비|안전|약화|취약|바이러스|표식|소환|강화/.test(endText) &&
      endTitle.length >= 8 &&
      riskDetail === endTitle &&
      riskTooltip?.content !== "none" &&
      ringVisible;
    return {
      ok,
      commandHidden,
      forecastHidden,
      endVisible,
      endText,
      endTitle,
      riskDetail,
      riskTone,
      tooltipContent: riskTooltip?.content ?? "",
      ringOpacity: ring?.opacity ?? "",
      commandBox: commandBox ? { width: Math.round(commandBox.width), height: Math.round(commandBox.height), clip: commandStyle?.clip ?? "", position: commandStyle?.position ?? "" } : null,
      forecastBox: forecastBox ? { width: Math.round(forecastBox.width), height: Math.round(forecastBox.height) } : null,
      endBox: endBox ? { width: Math.round(endBox.width), height: Math.round(endBox.height), right: Math.round(endBox.right), bottom: Math.round(endBox.bottom) } : null
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Combat risk single source failed: ${JSON.stringify(result)}`);
  }
}

async function assertIncomingHealthProjection(cdp) {
  const result = await evaluate(cdp, `(() => {
    const board = document.querySelector(".combat-board.enemy-aiming-danger");
    const health = document.querySelector(".player-stand .health-bar.incoming-health-loss[data-incoming-result][data-incoming-after]");
    const endTurn = document.querySelector(".end-turn.risk-danger");
    const healthStyle = health ? getComputedStyle(health) : null;
    const lossStyle = health ? getComputedStyle(health, "::after") : null;
    const markerStyle = health ? getComputedStyle(health, "::before") : null;
    const hpText = health?.querySelector("strong")?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const resultText = health?.getAttribute("data-incoming-result") ?? "";
    const hpAfter = Number(health?.getAttribute("data-incoming-after") ?? 0);
    const aria = health?.getAttribute("aria-label") ?? "";
    const endText = endTurn?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const ok =
      Boolean(board) &&
      Boolean(health) &&
      Boolean(endTurn) &&
      /^-\\d+/.test(resultText) &&
      hpAfter > 0 &&
      /턴 종료 시 예상 손실/.test(aria) &&
      /체력 -\\d+/.test(endText) &&
      healthStyle?.borderColor !== "" &&
      lossStyle?.content !== "none" &&
      markerStyle?.content !== "none" &&
      Number(lossStyle?.opacity ?? 0) > 0.1 &&
      /\\d+\\/\\d+/.test(hpText);
    return {
      ok,
      resultText,
      hpAfter,
      aria,
      endText,
      hpText,
      lossOpacity: lossStyle?.opacity ?? "",
      markerContent: markerStyle?.content ?? "",
      healthClass: health?.className ?? ""
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Incoming health projection failed: ${JSON.stringify(result)}`);
  }
}

async function assertIncomingHealthProjectionPreview(cdp) {
  const result = await evaluate(cdp, `(() => {
    const health = document.querySelector(".player-stand.preview-self .health-bar.preview-incoming-health[data-preview-incoming-result][data-preview-prevented]");
    const block = document.querySelector(".player-stand.preview-self .block-readout.preview-block[data-preview-result]");
    const lossStyle = health ? getComputedStyle(health, "::after") : null;
    const badgeStyle = health ? getComputedStyle(health, "::before") : null;
    const baseLoss = Math.abs(Number((health?.getAttribute("data-incoming-result") ?? "0").replace(/[^0-9-]/g, "")));
    const previewLoss = Math.abs(Number((health?.getAttribute("data-preview-incoming-result") ?? "0").replace(/[^0-9-]/g, "")));
    const prevented = Math.abs(Number((health?.getAttribute("data-preview-prevented") ?? "0").replace(/[^0-9-]/g, "")));
    const label = health?.getAttribute("data-preview-incoming-label") ?? "";
    const aria = health?.getAttribute("aria-label") ?? "";
    const ok =
      Boolean(health) &&
      Boolean(block) &&
      baseLoss > previewLoss &&
      prevented > 0 &&
      /방어 후|방어 완료/.test(label) &&
      /예상 손실/.test(aria) &&
      badgeStyle?.content !== "none" &&
      (previewLoss === 0 || Number(lossStyle?.opacity ?? 0) > 0.1);
    return {
      ok,
      baseLoss,
      previewLoss,
      prevented,
      label,
      aria,
      blockResult: block?.getAttribute("data-preview-result") ?? "",
      badgeContent: badgeStyle?.content ?? "",
      lossOpacity: lossStyle?.opacity ?? "",
      healthClass: health?.className ?? ""
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Incoming health projection preview failed: ${JSON.stringify(result)}`);
  }
}

async function assertIncomingHealthProjectionKillPreview(cdp) {
  const result = await evaluate(cdp, `(() => {
    const player = document.querySelector(".player-stand.preview-threat-reduced");
    const health = player?.querySelector(".health-bar.preview-incoming-health[data-preview-incoming-result][data-preview-prevented]");
    const target = document.querySelector(".enemy-card.preview-target.preview-lethal");
    const lossStyle = health ? getComputedStyle(health, "::after") : null;
    const badgeStyle = health ? getComputedStyle(health, "::before") : null;
    const baseLoss = Math.abs(Number((health?.getAttribute("data-incoming-result") ?? "0").replace(/[^0-9-]/g, "")));
    const previewLoss = Math.abs(Number((health?.getAttribute("data-preview-incoming-result") ?? "0").replace(/[^0-9-]/g, "")));
    const prevented = Math.abs(Number((health?.getAttribute("data-preview-prevented") ?? "0").replace(/[^0-9-]/g, "")));
    const label = health?.getAttribute("data-preview-incoming-label") ?? "";
    const aria = health?.getAttribute("aria-label") ?? "";
    const ok =
      Boolean(player) &&
      Boolean(health) &&
      Boolean(target) &&
      baseLoss > previewLoss &&
      prevented > 0 &&
      /처치 후|위험 제거/.test(label) &&
      /적을 처치해/.test(aria) &&
      badgeStyle?.content !== "none" &&
      (previewLoss === 0 || Number(lossStyle?.opacity ?? 0) > 0.1);
    return {
      ok,
      baseLoss,
      previewLoss,
      prevented,
      label,
      aria,
      targetLabel: target?.getAttribute("data-preview-label") ?? "",
      badgeContent: badgeStyle?.content ?? "",
      lossOpacity: lossStyle?.opacity ?? "",
      playerClass: player?.className ?? ""
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Incoming kill projection preview failed: ${JSON.stringify(result)}`);
  }
}

async function assertCombatRouteBeacon(cdp) {
  const result = await evaluate(cdp, `(() => {
    const beacon = document.querySelector(".combat-route-beacon");
    const pips = [...(beacon?.querySelectorAll(".route-pips i") ?? [])];
    const text = beacon?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const label = beacon?.getAttribute("aria-label") ?? "";
    const box = beacon?.getBoundingClientRect();
    const hand = document.querySelector(".hand-zone")?.getBoundingClientRect();
    const combatantBoxes = [
      ...document.querySelectorAll(".player-sprite, .player-plate, .enemy-card .character-sprite, .enemy-plate, .enemy-card .intent")
    ].map((node) => node.getBoundingClientRect()).filter((rect) => rect.width > 1 && rect.height > 1);
    const visible = Boolean(box && box.width >= 168 && box.height >= 58 && box.left >= 0 && box.top >= 0 && box.right <= window.innerWidth);
    const intersects = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    const noCombatantOverlap = Boolean(box) && combatantBoxes.every((combatantBox) => !intersects(box, combatantBox));
    const noHandOverlap = Boolean(box && hand && box.bottom < hand.top - 12);
    const hasPlainProgress = /진행/.test(text) && /\\d막/.test(text) && /\\d층/.test(text) && /(보스까지 \\d층|보스전)/.test(text);
    const hasReward = /카드 선택|유물 획득|특수 보상|정비 기회|휴식|구역 돌파/.test(text);
    const ok = Boolean(beacon) && visible && pips.length === 7 && hasPlainProgress && hasReward && label.includes("현재 위치") && noCombatantOverlap && noHandOverlap;
    return {
      ok,
      text,
      label,
      pips: pips.length,
      visible,
      hasPlainProgress,
      hasReward,
      noCombatantOverlap,
      noHandOverlap,
      box: box ? { left: Math.round(box.left), top: Math.round(box.top), right: Math.round(box.right), bottom: Math.round(box.bottom), width: Math.round(box.width), height: Math.round(box.height) } : null,
      combatantBoxes: combatantBoxes.map((combatantBox) => ({ left: Math.round(combatantBox.left), top: Math.round(combatantBox.top), right: Math.round(combatantBox.right), bottom: Math.round(combatantBox.bottom) })).slice(0, 6)
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Combat route beacon failed: ${JSON.stringify(result)}`);
  }
}

async function assertCardPlayFxSource(cdp) {
  const result = await evaluate(cdp, `(() => {
    const fx = document.querySelector(".combat-action-fx");
    const pulse = fx?.querySelector(".fx-source-pulse");
    const echo = fx?.querySelector(".fx-card-echo, .fx-actor-echo, .fx-card-name");
    const trail = fx?.querySelector(".fx-trail");
    const spark = fx?.querySelector(".fx-trail i");
    const impact = fx?.querySelector(".fx-impact");
    const targetResult = document.querySelector(".enemy-card.fx-hit .entity-result-stack i, .player-stand.fx-target .entity-result-stack i");
    const targetPop = document.querySelector(".enemy-card.fx-hit .entity-damage-pop, .player-stand.fx-target .entity-damage-pop");
    const targetFeedback = targetResult ?? targetPop;
    const boxes = Object.fromEntries(Object.entries({ fx, pulse, echo, trail, spark, impact, targetResult, targetPop, targetFeedback }).map(([key, node]) => {
      const box = node?.getBoundingClientRect?.();
      return [key, box ? { left: Math.round(box.left), top: Math.round(box.top), right: Math.round(box.right), bottom: Math.round(box.bottom), width: Math.round(box.width), height: Math.round(box.height) } : null];
    }));
    const style = pulse ? getComputedStyle(pulse) : null;
    const echoStyle = echo ? getComputedStyle(echo) : null;
    const visible = (box) => Boolean(box && box.width > 4 && box.height > 4 && box.right >= 0 && box.left <= window.innerWidth && box.bottom >= 0 && box.top <= window.innerHeight);
    const ok =
      Boolean(fx) &&
      Boolean(pulse) &&
      Boolean(echo) &&
      Boolean(trail) &&
      Boolean(spark) &&
      Boolean(impact) &&
      Boolean(targetFeedback) &&
      visible(boxes.pulse) &&
      visible(boxes.echo) &&
      visible(boxes.trail) &&
      visible(boxes.impact) &&
      visible(boxes.targetFeedback) &&
      Number(style?.opacity ?? 0) >= 0.05 &&
      Number(echoStyle?.opacity ?? 0) >= 0.05 &&
      /fx-source-player|fx-source-card/.test(fx.className);
    return {
      ok,
      className: fx?.className ?? "",
      pulseOpacity: style?.opacity ?? "",
      echoOpacity: echoStyle?.opacity ?? "",
      boxes
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Card play FX source failed: ${JSON.stringify(result)}`);
  }
}

async function assertAttackCardPlayFx(cdp) {
  const result = await evaluate(cdp, `(() => {
    const board = document.querySelector(".combat-board");
    const fx = document.querySelector(".combat-action-fx.fx-damage.fx-enemy.fx-source-player");
    const pulse = fx?.querySelector(".fx-source-pulse");
    const echo = fx?.querySelector(".fx-card-echo");
    const trail = fx?.querySelector(".fx-trail");
    const spark = fx?.querySelector(".fx-trail i");
    const impact = fx?.querySelector(".fx-impact");
    const hitEnemy = document.querySelector(".enemy-card.fx-hit:not(.fx-defeated)");
    const targetRing = hitEnemy?.querySelector(".entity-impact-ring.damage, .entity-impact-ring.enemy");
    const hitSparks = hitEnemy?.querySelector(".entity-hit-sparks.damage, .entity-hit-sparks.enemy");
    const damagePop = hitEnemy?.querySelector(".entity-damage-pop");
    const resultStack = hitEnemy?.querySelector(".entity-result-stack i.emphasis, .entity-result-stack i.damage");
    const playerSource = document.querySelector(".player-stand .sprite-motion-echo, .player-stand .sprite-ground-burst");
    const boxes = Object.fromEntries(Object.entries({ fx, pulse, echo, trail, spark, impact, hitEnemy, targetRing, hitSparks, damagePop, resultStack, playerSource }).map(([key, node]) => {
      const box = node?.getBoundingClientRect?.();
      return [key, box ? { left: Math.round(box.left), top: Math.round(box.top), right: Math.round(box.right), bottom: Math.round(box.bottom), width: Math.round(box.width), height: Math.round(box.height) } : null];
    }));
    const visible = (box) => Boolean(box && box.width > 3 && box.height > 3 && box.right >= 0 && box.left <= window.innerWidth && box.bottom >= 0 && box.top <= window.innerHeight);
    const damageText = [damagePop?.innerText, resultStack?.innerText].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
    const boardClass = board?.className ?? "";
    const fxClass = fx?.className ?? "";
    const ok =
      Boolean(board) &&
      Boolean(fx) &&
      /fx-active/.test(boardClass) &&
      /fx-tone-damage/.test(boardClass) &&
      /fx-mode-enemy/.test(boardClass) &&
      /fx-damage/.test(fxClass) &&
      /fx-source-player/.test(fxClass) &&
      Boolean(hitEnemy) &&
      Boolean(targetRing) &&
      Boolean(hitSparks) &&
      Boolean(damagePop) &&
      Boolean(playerSource) &&
      /-\\d+/.test(damageText) &&
      visible(boxes.pulse) &&
      visible(boxes.echo) &&
      visible(boxes.trail) &&
      visible(boxes.spark) &&
      visible(boxes.impact) &&
      visible(boxes.hitEnemy) &&
      visible(boxes.targetRing) &&
      visible(boxes.hitSparks) &&
      visible(boxes.damagePop);
    return {
      ok,
      boardClass,
      fxClass,
      damageText,
      combatFxCount: document.querySelectorAll(".combat-action-fx").length,
      hitEnemyCount: document.querySelectorAll(".enemy-card.fx-hit:not(.fx-defeated)").length,
      boxes
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Attack card FX failed: ${JSON.stringify(result)}`);
  }
  await writeFile(resolve(qaDir, "browser-qa-card-attack-fx.json"), `${JSON.stringify(result, null, 2)}\n`);
}

async function assertAttackCardHoverTarget(cdp) {
  const result = await evaluate(cdp, `(() => {
    const card = document.querySelector(".hand-zone .game-card.previewing-card[data-card-id='pulse_lance']");
    const target = document.querySelector(".enemy-card.preview-target.preview-damage");
    const line = document.querySelector(".combat-aim-line.damage.aim-hover:not([hidden])");
    const rail = document.querySelector(".combat-card-preview-rail.damage:not([hidden])");
    const tooltip = document.querySelector(".card-portal-tooltip:not([hidden])");
    const health = target?.querySelector(".health-bar[data-preview-result]");
    const boxes = Object.fromEntries(Object.entries({ card, target, line, rail, tooltip }).map(([key, node]) => {
      const box = node?.getBoundingClientRect?.();
      return [key, box ? { left: Math.round(box.left), top: Math.round(box.top), right: Math.round(box.right), bottom: Math.round(box.bottom), width: Math.round(box.width), height: Math.round(box.height) } : null];
    }));
    const visible = (box) => Boolean(box && box.width > 4 && box.height > 4 && box.right >= 0 && box.left <= window.innerWidth && box.bottom >= 0 && box.top <= window.innerHeight);
    const lineStyle = line ? getComputedStyle(line) : null;
    const lineBefore = line ? getComputedStyle(line, "::before") : null;
    const markerText = target?.getAttribute("data-preview-text") ?? "";
    const railText = rail?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const targetStyle = target ? getComputedStyle(target) : null;
    const healthResult = health?.getAttribute("data-preview-result") ?? "";
    const previewHpLoss = targetStyle?.getPropertyValue("--preview-hp-loss").trim() ?? "";
    const ok =
      Boolean(card) &&
      Boolean(target) &&
      Boolean(line) &&
      Boolean(rail) &&
      Boolean(health) &&
      visible(boxes.card) &&
      visible(boxes.target) &&
      visible(boxes.line) &&
      visible(boxes.rail) &&
      Number(lineStyle?.opacity ?? 0) >= 0.7 &&
      parseFloat(lineBefore?.height ?? "0") >= 2 &&
      parseFloat(previewHpLoss) > 0 &&
      /피해|처치|-\\d+/.test(markerText) &&
      /처치|-\\d+/.test(healthResult) &&
      /피해|사용 가능|⚡/.test(railText);
    return {
      ok,
      markerText,
      healthResult,
      previewHpLoss,
      railText,
      lineOpacity: lineStyle?.opacity ?? "",
      lineBeforeHeight: lineBefore?.height ?? "",
      targetClass: target?.className ?? "",
      lineClass: line?.className ?? "",
      boxes
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Attack card hover target failed: ${JSON.stringify(result)}`);
  }
  await writeFile(resolve(qaDir, "browser-qa-card-attack-hover.json"), `${JSON.stringify(result, null, 2)}\n`);
}

async function assertCombatPileDockCompact(cdp) {
  const resting = await evaluate(cdp, `(() => {
    const dock = document.querySelector(".combat-pile-dock");
    const piles = [...document.querySelectorAll(".combat-pile-dock .pile")];
    const labels = piles.map((pile) => {
      const label = pile.querySelector(".pile-label");
      const style = label ? getComputedStyle(label) : null;
      return {
        text: label?.innerText ?? "",
        opacity: Number(style?.opacity ?? 1),
        position: style?.position ?? "",
        pointerEvents: style?.pointerEvents ?? "",
        aria: pile.getAttribute("aria-label") ?? "",
        title: pile.getAttribute("title") ?? ""
      };
    });
    const boxes = piles.map((pile) => {
      const box = pile.getBoundingClientRect();
      return { width: Math.round(box.width), height: Math.round(box.height) };
    });
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
    const ok =
      Boolean(dock) &&
      piles.length === 4 &&
      labels.every((label) => label.opacity >= 0.85 && label.position === "relative" && label.pointerEvents === "none" && /^(뽑기|손패|버림|소멸)$/.test(label.text) && /더미 \\d+장 보기/.test(label.aria) && /\\d+장/.test(label.title)) &&
      boxes.every((box) => box.width <= 64 && box.height <= 64) &&
      !overflow;
    return { ok, labels, boxes, scrollWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth };
  })()`);
  if (!resting.ok) {
    throw new Error(`Combat pile dock compact state failed: ${JSON.stringify(resting)}`);
  }
  await hoverSelector(cdp, ".combat-pile-dock .pile.has-cards");
  const hovered = await evaluate(cdp, `(() => {
    const pile = document.querySelector(".combat-pile-dock .pile:hover");
    const label = pile?.querySelector(".pile-label");
    const style = label ? getComputedStyle(label) : null;
    const box = label?.getBoundingClientRect();
    const ok =
      Boolean(pile) &&
      Boolean(label) &&
      Number(style?.opacity ?? 0) >= 0.85 &&
      style?.position === "relative" &&
      Boolean(box && box.top >= 0 && box.right <= window.innerWidth && box.left >= 0);
    return {
      ok,
      text: label?.innerText ?? "",
      opacity: style?.opacity ?? "",
      box: box ? { left: Math.round(box.left), top: Math.round(box.top), right: Math.round(box.right), bottom: Math.round(box.bottom) } : null
    };
  })()`);
  if (!hovered.ok) {
    throw new Error(`Combat pile dock hover label failed: ${JSON.stringify(hovered)}`);
  }
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4, button: "none" });
  await wait(120);
}

async function assertDesktopHandReadability(cdp) {
  const result = await evaluate(cdp, `(() => {
    const hand = document.querySelector(".hand-zone");
    const cards = [...document.querySelectorAll(".hand-zone .game-card[data-action='play-card']")];
    const handBox = hand?.getBoundingClientRect();
    const boxes = cards.map((card) => {
      const box = card.getBoundingClientRect();
      return { left: box.left, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    });
    const pairOverlaps = boxes.slice(0, -1).map((box, index) => Math.max(0, box.right - boxes[index + 1].left));
    const maxOverlap = Math.max(0, ...pairOverlaps);
    const minWidth = Math.min(...boxes.map((box) => box.width));
    const maxWidth = Math.max(...boxes.map((box) => box.width));
    const averageWidth = boxes.reduce((sum, box) => sum + box.width, 0) / Math.max(1, boxes.length);
    const desktopViewport = window.matchMedia("(min-width: 1041px)").matches;
    const noPageOverflow = document.documentElement.scrollWidth <= window.innerWidth + 2;
    const handVisible = Boolean(handBox && handBox.left >= 0 && handBox.right <= window.innerWidth && handBox.bottom <= window.innerHeight + 1);
    const sixCardReadability = cards.length < 6 || (minWidth >= 164 && maxOverlap <= 12 && averageWidth < 178);
    const cardFacesVisible = boxes.every((box) => box.height >= 270 && box.bottom <= window.innerHeight + 1);
    const overlaps = (left, right) => Boolean(
      left &&
      right &&
      left.right > right.left &&
      left.left < right.right &&
      left.bottom > right.top &&
      left.top < right.bottom
    );
    const identityTags = cards.map((card) => {
      const cardBox = card.getBoundingClientRect();
      const strip = card.querySelector(".card-identity-strip");
      const type = strip?.querySelector(".card-identity-type");
      const rarity = strip?.querySelector(".card-identity-rarity");
      const cost = card.querySelector(".card-cost");
      const hotkey = card.querySelector(".card-hotkey");
      const art = card.querySelector(".card-art");
      const stripBox = strip?.getBoundingClientRect();
      const artBox = art?.getBoundingClientRect();
      const style = strip ? getComputedStyle(strip) : null;
      return {
        visible: Boolean(stripBox && /flex/.test(style?.display ?? "") && stripBox.width >= 40 && stripBox.height >= 18),
        type: type?.innerText.trim() ?? "",
        typeTitle: type?.getAttribute("title") ?? "",
        rarity: rarity?.innerText.trim() ?? "",
        rarityTitle: rarity?.getAttribute("title") ?? "",
        insideCard: Boolean(stripBox && stripBox.left >= cardBox.left && stripBox.right <= cardBox.right && stripBox.top >= cardBox.top && stripBox.bottom <= cardBox.bottom),
        insideArt: Boolean(stripBox && artBox && stripBox.top >= artBox.top - 2 && stripBox.bottom <= artBox.bottom + 2),
        overlapsCost: overlaps(stripBox, cost?.getBoundingClientRect()),
        overlapsHotkey: overlaps(stripBox, hotkey?.getBoundingClientRect())
      };
    });
    const identityTagsReadable = identityTags.every((item) =>
      item.visible &&
      item.insideCard &&
      item.insideArt &&
      item.type &&
      item.typeTitle &&
      item.rarity &&
      item.rarityTitle &&
      !item.overlapsCost &&
      !item.overlapsHotkey
    );
    const cssVars = {
      width: hand?.style.getPropertyValue("--hand-card-width") ?? "",
      height: hand?.style.getPropertyValue("--hand-card-height") ?? "",
      overlap: hand?.style.getPropertyValue("--hand-overlap") ?? ""
    };
    return {
      ok: desktopViewport && noPageOverflow && handVisible && cardFacesVisible && sixCardReadability && identityTagsReadable,
      desktopViewport,
      noPageOverflow,
      handVisible,
      cardFacesVisible,
      sixCardReadability,
      identityTagsReadable,
      identityTags,
      cardCount: cards.length,
      minWidth: Math.round(minWidth),
      maxWidth: Math.round(maxWidth),
      averageWidth: Math.round(averageWidth),
      maxOverlap: Math.round(maxOverlap),
      cssVars,
      handBox: handBox ? { left: Math.round(handBox.left), right: Math.round(handBox.right), bottom: Math.round(handBox.bottom), width: Math.round(handBox.width) } : null,
      boxes: boxes.map((box) => ({ left: Math.round(box.left), right: Math.round(box.right), width: Math.round(box.width), height: Math.round(box.height) }))
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Desktop hand readability failed: ${JSON.stringify(result)}`);
  }
  await writeFile(resolve(qaDir, "browser-qa-combat-hand-readability.json"), `${JSON.stringify(result, null, 2)}\n`);
}

async function assertSummaryActionsVisible(cdp) {
  const result = await evaluate(cdp, `(() => {
    const panel = document.querySelector(".summary-panel");
    const commandPanel = document.querySelector(".summary-command-panel");
    const actions = document.querySelector(".summary-actions");
    const primary = document.querySelector(".summary-actions .primary");
    const finale = document.querySelector(".summary-finale");
    const finaleStage = document.querySelector(".summary-finale-stage");
    const finaleDiver = document.querySelector(".summary-finale-diver");
    const finaleBoss = document.querySelector(".summary-finale-boss");
    const finaleCore = document.querySelector(".summary-finale-core");
    const verdict = document.querySelector(".summary-verdict") ?? finale;
    const verdictCta = document.querySelector(".summary-verdict-cta") ?? document.querySelector(".summary-finale-brief");
    const prompt = document.querySelector(".summary-replay-prompt");
    const nextRail = document.querySelector(".summary-next-rail");
    const topObjective = document.querySelector(".phase-summary > .top-bar .top-objective");
    const saveStatus = document.querySelector(".phase-summary > .top-bar .save-status");
    const relicRow = document.querySelector(".phase-summary > .top-bar .relic-row-button");
    if (!panel || !commandPanel || !actions || !primary || !verdict || !verdictCta || !prompt || !nextRail) {
      return {
        ok: false,
        reason: "missing-elements",
        hasCommandPanel: Boolean(commandPanel),
        hasVerdictCta: Boolean(verdictCta),
        hasNextRail: Boolean(nextRail),
        actionCount: document.querySelectorAll(".summary-actions button").length
      };
    }
    const viewportH = window.innerHeight;
    const actionsBox = actions.getBoundingClientRect();
    const primaryBox = primary.getBoundingClientRect();
    const verdictBox = verdict.getBoundingClientRect();
    const promptBox = prompt.getBoundingClientRect();
    const nextRailBox = nextRail.getBoundingClientRect();
    const commandBox = commandPanel.getBoundingClientRect();
    const verdictCtaBox = verdictCta.getBoundingClientRect();
    const verdictCtaText = verdictCta.innerText ?? "";
    const finaleStageBox = finaleStage?.getBoundingClientRect();
    const finaleDiverImage = finaleDiver ? getComputedStyle(finaleDiver).backgroundImage : "";
    const finaleBossImage = finaleBoss ? getComputedStyle(finaleBoss).backgroundImage : "";
    const finaleOk = !finale || (
      Boolean(finaleStageBox && finaleStageBox.height >= 160) &&
      finaleDiverImage.includes("player-echo-diver") &&
      finaleBossImage.includes("boss-lastgate") &&
      Boolean(finaleCore) &&
      (finale.innerText ?? "").includes("심해 코어 회수")
    );
    const topObjectiveVisible = Boolean(topObjective && getComputedStyle(topObjective).display !== "none");
    const saveVisible = Boolean(saveStatus && getComputedStyle(saveStatus).display !== "none");
    const relicVisible = Boolean(relicRow && getComputedStyle(relicRow).display !== "none");
    const nextRailItems = document.querySelectorAll(".summary-next-rail li").length;
    const ctaChips = document.querySelectorAll(".summary-verdict-cta-chips i, .summary-finale-chips i").length;
    const actionCount = document.querySelectorAll(".summary-actions button").length;
    const statValues = [...document.querySelectorAll(".summary-verdict-stats dd")].map((item) => item.innerText.replace(/\\s+/g, " ").trim());
    const buildStat = document.querySelector(".summary-verdict-stats div:last-child dd");
    const compactBuildStat = !buildStat || buildStat.innerText.replace(/\\s+/g, " ").trim().length <= 12;
    const summaryKeepAll = [...document.querySelectorAll(".summary-verdict-copy > strong, .summary-verdict-stats dd, .summary-verdict-cta strong, .summary-focus-strip strong, .summary-next-rail li strong, .summary-action-main strong")].every((item) => getComputedStyle(item).wordBreak === "keep-all");
    const visibleSummaryTextFits = [...document.querySelectorAll(".summary-verdict-stats dd, .summary-next-rail li strong, .summary-action-main strong")].every((item) => item.scrollWidth <= item.clientWidth + 2 || getComputedStyle(item).display.includes("box"));
    const ok =
      actionCount >= 2 &&
      nextRailItems === 3 &&
      ctaChips === 3 &&
      compactBuildStat &&
      summaryKeepAll &&
      visibleSummaryTextFits &&
      verdictCtaText.includes("다음 런 브리핑") &&
      finaleOk &&
      !topObjectiveVisible &&
      !saveVisible &&
      !relicVisible &&
      commandBox.bottom <= viewportH &&
      commandBox.height <= 104 &&
      verdictCtaBox.bottom <= viewportH &&
      actionsBox.top >= 0 &&
      actionsBox.bottom <= viewportH &&
      primaryBox.bottom <= viewportH &&
      nextRailBox.bottom <= viewportH &&
      actionsBox.top > verdictBox.top &&
      actionsBox.top < commandBox.top &&
      Math.abs(promptBox.top - nextRailBox.top) <= 4 &&
      promptBox.left < nextRailBox.left;
    return {
      ok,
      actionCount,
      nextRailItems,
      ctaChips,
      statValues,
      compactBuildStat,
      summaryKeepAll,
      visibleSummaryTextFits,
      viewportH,
      top: Math.round(actionsBox.top),
      bottom: Math.round(actionsBox.bottom),
      commandHeight: Math.round(commandBox.height),
      verdictCtaBottom: Math.round(verdictCtaBox.bottom),
      verdictCtaText,
      finale: Boolean(finale),
      finaleOk,
      finaleStageHeight: finaleStageBox ? Math.round(finaleStageBox.height) : 0,
      finaleDiverImage,
      finaleBossImage,
      nextRailBottom: Math.round(nextRailBox.bottom),
      topObjectiveVisible,
      saveVisible,
      relicVisible,
      afterVerdict: actionsBox.top > verdictBox.top,
      beforeCommand: actionsBox.top < commandBox.top,
      promptAlignedWithNextRail: Math.abs(promptBox.top - nextRailBox.top) <= 4,
      promptBeforeNextRail: promptBox.left < nextRailBox.left
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Summary actions not visible in first viewport: ${JSON.stringify(result)}`);
  }
}

async function assertRestSceneProductionArt(cdp) {
  const result = await evaluate(cdp, `(() => {
    const layout = document.querySelector(".rest-layout");
    const art = document.querySelector(".rest-scene-art");
    const props = document.querySelector(".rest-scene-props");
    const floor = document.querySelector(".rest-floor-glow");
    const diver = document.querySelector(".rest-diver-sprite");
    if (!layout || !art || !props || !floor || !diver) {
      return {
        ok: false,
        reason: "missing-elements",
        hasLayout: Boolean(layout),
        hasArt: Boolean(art),
        hasProps: Boolean(props),
        hasFloor: Boolean(floor),
        hasDiver: Boolean(diver)
      };
    }
    const layoutStyle = getComputedStyle(layout);
    const artStyle = getComputedStyle(art);
    const propsStyle = getComputedStyle(props);
    const diverStyle = getComputedStyle(diver);
    const artBox = art.getBoundingClientRect();
    const diverBox = diver.getBoundingClientRect();
    const restBgX = layoutStyle.getPropertyValue("--rest-bg-x").trim();
    const restBgY = layoutStyle.getPropertyValue("--rest-bg-y").trim();
    const ok =
      restBgX.length > 0 &&
      restBgY.length > 0 &&
      artBox.height >= 260 &&
      diverBox.height >= 220 &&
      artStyle.backgroundImage.includes("arena-backdrops") &&
      propsStyle.backgroundImage.includes("arena-props") &&
      diverStyle.backgroundImage.includes("player-echo-diver");
    return {
      ok,
      restBgX,
      restBgY,
      artHeight: Math.round(artBox.height),
      diverHeight: Math.round(diverBox.height),
      artBackground: artStyle.backgroundImage,
      propsBackground: propsStyle.backgroundImage,
      diverBackground: diverStyle.backgroundImage
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Rest scene production art failed: ${JSON.stringify(result)}`);
  }
}

async function assertMapRouteUx(cdp) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 4, y: 4, button: "none" });
  await wait(120);
  const result = await evaluate(cdp, `(() => {
    document.activeElement?.blur?.();
    const recommendedNode = document.querySelector(".map-node.recommended");
    const recommendedCard = document.querySelector(".route-card.recommended");
    const cards = [...document.querySelectorAll(".route-card")];
    const scoutDetails = cards
      .map((card) => {
        const detail = card.querySelector(".route-scout > span");
        return detail ? getComputedStyle(detail).display : "";
      })
      .filter(Boolean);
    const heights = cards.map((card) => Math.round(card.getBoundingClientRect().height));
    const markerContent = recommendedNode ? getComputedStyle(recommendedNode, "::before").content : "";
    const actionMarker = document.querySelector(".route-action");
    const actionBox = actionMarker?.getBoundingClientRect();
    const horizon = document.querySelector(".map-horizon");
    const horizonBox = horizon?.getBoundingClientRect();
    const horizonText = horizon?.innerText ?? "";
    const horizonTags = document.querySelectorAll(".map-horizon-boss i").length;
    const horizonStatus = document.querySelectorAll(".map-horizon-status i").length;
    const focus = document.querySelector(".route-focus-panel");
    const focusBox = focus?.getBoundingClientRect();
    const focusText = focus?.innerText.replace(/\s+/g, " ").trim() ?? "";
    const ok =
      Boolean(recommendedNode) &&
      Boolean(recommendedCard) &&
      Boolean(horizon) &&
      Boolean(focus) &&
      markerContent.includes("추천") &&
      horizonText.includes("보스까지") &&
      horizonTags >= 1 &&
      horizonStatus >= 3 &&
      focusText.includes("추천 경로") &&
      focusText.includes("보상") &&
      focusText.includes("주의") &&
      Boolean(focusBox && focusBox.height <= 132) &&
      cards.length >= 1 &&
      heights.every((height) => height <= 96) &&
      scoutDetails.every((display) => display === "none") &&
      Boolean(actionBox && actionBox.width <= 34) &&
      Boolean(horizonBox && horizonBox.height <= 150 && horizonBox.width <= 290);
    return {
      ok,
      cardCount: cards.length,
      heights,
      markerContent,
      scoutDetails,
      actionWidth: actionBox ? Math.round(actionBox.width) : 0,
      horizonHeight: horizonBox ? Math.round(horizonBox.height) : 0,
      horizonWidth: horizonBox ? Math.round(horizonBox.width) : 0,
      focusHeight: focusBox ? Math.round(focusBox.height) : 0,
      focusText,
      horizonText
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Map route UX failed: ${JSON.stringify(result)}`);
  }
}

async function assertMapPreviewFocus(cdp) {
  const result = await evaluate(cdp, `(() => {
    const previewCard = document.querySelector(".route-card.previewing");
    const focus = document.querySelector(".route-focus-panel");
    const focusText = focus?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const previewId = previewCard?.dataset?.id ?? "";
    const focusId = focus?.dataset?.focusNode ?? "";
    const previewEdges = document.querySelectorAll(".map-connections path.route-previewed").length;
    const ok =
      Boolean(previewCard) &&
      Boolean(focus) &&
      focus.classList.contains("is-previewing") &&
      focusId === previewId &&
      focusText.includes("검토 중") &&
      focusText.includes("보상") &&
      focusText.includes("주의") &&
      focusText.includes("이후") &&
      previewEdges >= 1;
    return { ok, previewId, focusId, focusText, previewEdges, classes: focus?.className ?? "" };
  })()`);
  if (!result.ok) {
    throw new Error(`Map preview focus failed: ${JSON.stringify(result)}`);
  }
}

async function assertAboutReleaseInfo(cdp) {
  const result = await evaluate(cdp, `(() => {
    const text = document.body.innerText;
    const panel = document.querySelector(".about-panel");
    const art = document.querySelector(".about-art-window");
    const flowItems = document.querySelectorAll(".about-flow article").length;
    const releaseBlocks = document.querySelectorAll(".about-release div").length;
    const licenseItems = document.querySelectorAll(".about-license-list li").length;
    const facts = [...document.querySelectorAll(".about-facts dd")].map((item) => Number(item.textContent.trim()));
    const panelBox = panel?.getBoundingClientRect();
    const artBackground = art ? getComputedStyle(art).backgroundImage : "";
    const requiredText = ["핵심 조작", "크레딧", "이용 안내 · 라이선스", "외부 저작권 IP", "상용 이미지", "외부 음악 파일", "UNLICENSED", "npm run dev"];
    const ok =
      Boolean(panel) &&
      Boolean(art) &&
      artBackground.includes("asset-sheet") &&
      flowItems === 5 &&
      releaseBlocks === 2 &&
      licenseItems >= 3 &&
      facts.length === 4 &&
      facts.every((value) => value > 0) &&
      requiredText.every((item) => text.includes(item)) &&
      document.documentElement.scrollWidth <= window.innerWidth + 2 &&
      Boolean(panelBox && panelBox.width <= window.innerWidth);
    return {
      ok,
      flowItems,
      releaseBlocks,
      licenseItems,
      facts,
      hasArt: Boolean(art),
      artBackground,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      text: text.slice(0, 500)
    };
  })()`);
  if (!result.ok) {
    throw new Error(`About release info failed: ${JSON.stringify(result)}`);
  }
}

async function assertSettingsAudioUx(cdp) {
  const result = await evaluate(cdp, `(() => {
    const panel = document.querySelector(".settings-panel");
    const soundGroup = document.querySelector(".settings-group[aria-label='사운드 설정']");
    const effectRange = document.querySelector("input[data-setting='volume']");
    const musicRange = document.querySelector("input[data-setting='musicVolume']");
    const previewSound = document.querySelector("button[data-action='preview-sound']");
    const previewMusic = document.querySelector("button[data-action='preview-music']");
    const outputs = [...document.querySelectorAll("[data-setting-value]")].map((output) => output.textContent.trim());
    const actionBox = document.querySelector(".settings-inline-actions");
    const panelBox = panel?.getBoundingClientRect();
    const actionBoxStyle = actionBox ? getComputedStyle(actionBox) : null;
    const ok =
      Boolean(panel) &&
      Boolean(soundGroup) &&
      effectRange?.getAttribute("aria-label") === "효과음" &&
      musicRange?.getAttribute("aria-label") === "배경음" &&
      Boolean(previewSound) &&
      Boolean(previewMusic) &&
      previewSound?.textContent.includes("미리듣기") &&
      previewMusic?.textContent.includes("배경음") &&
      outputs.some((text) => /%$/.test(text)) &&
      actionBoxStyle?.display === "flex" &&
      document.documentElement.scrollWidth <= window.innerWidth + 2 &&
      Boolean(panelBox && panelBox.width <= window.innerWidth);
    return {
      ok,
      effectValue: effectRange?.value ?? null,
      musicValue: musicRange?.value ?? null,
      previewSound: previewSound?.textContent.trim() ?? "",
      previewMusic: previewMusic?.textContent.trim() ?? "",
      outputs,
      actionDisplay: actionBoxStyle?.display ?? "",
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Settings audio UX failed: ${JSON.stringify(result)}`);
  }
}

async function assertShopFocusUx(cdp) {
  const result = await evaluate(cdp, `(() => {
    const layout = document.querySelector(".shop-layout");
    const activeItem = document.querySelector(".shop-item:hover, .shop-item:focus-within");
    const activeLine = activeItem?.querySelector(".shop-buy-line");
    const activeDetail = activeLine?.querySelector("small");
    const dimmedCards = [...document.querySelectorAll(".shop-cards .shop-item:not(:hover):not(:focus-within)")].filter((item) => Number(getComputedStyle(item).opacity) < 0.55).length;
    const activeStyle = activeItem ? getComputedStyle(activeItem) : null;
    const detailStyle = activeDetail ? getComputedStyle(activeDetail) : null;
    const sections = [...document.querySelectorAll(".shop-section")];
    const serviceMetrics = [...document.querySelectorAll(".shop-service-metrics")];
    const serviceMetricText = serviceMetrics.map((row) => row.textContent.trim()).join(" ");
    const serviceMetricsInside = serviceMetrics.every((row) => {
      const button = row.closest(".shop-service");
      if (!button) return false;
      const rowBox = row.getBoundingClientRect();
      const buttonBox = button.getBoundingClientRect();
      return rowBox.left >= buttonBox.left - 1 && rowBox.right <= buttonBox.right + 1 && rowBox.bottom <= buttonBox.bottom + 1;
    });
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
    const ok =
      Boolean(layout) &&
      Boolean(activeItem) &&
      Boolean(activeLine) &&
      Boolean(activeDetail) &&
      dimmedCards >= 1 &&
      detailStyle.display !== "none" &&
      activeStyle.transform !== "none" &&
      sections.length >= 3 &&
      serviceMetrics.length >= 3 &&
      /남음/.test(serviceMetricText) &&
      /덱 -1장/.test(serviceMetricText) &&
      serviceMetricsInside &&
      !overflow;
    return {
      ok,
      hasLayout: Boolean(layout),
      hasActiveItem: Boolean(activeItem),
      dimmedCards,
      detailDisplay: detailStyle?.display ?? "",
      activeTransform: activeStyle?.transform ?? "",
      sections: sections.length,
      serviceMetrics: serviceMetrics.length,
      serviceMetricText,
      serviceMetricsInside,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Shop focus UX failed: ${JSON.stringify(result)}`);
  }
}

async function assertActInterludeSingleUse(cdp) {
  const fresh = await evaluate(cdp, `(() => ({
    count: document.querySelectorAll(".act-interlude").length,
    fresh: document.querySelectorAll(".act-interlude.is-new").length,
    active: document.querySelectorAll(".act-interlude.is-active").length,
    compact: document.querySelectorAll(".act-interlude.is-compact").length,
    dismiss: document.querySelectorAll("[data-action='dismiss-act-interlude']").length,
    oneShot: document.querySelector(".act-interlude")?.dataset?.oneShot === "true",
    key: document.querySelector(".act-interlude")?.dataset?.interludeKey ?? "",
    savedDismissed: (() => {
      try {
        return JSON.parse(localStorage.getItem("abyssalArchive.save.v1") ?? "{}")?.lastInterlude?.dismissed === true;
      } catch {
        return false;
      }
    })(),
    savedAckRequired: (() => {
      try {
        return JSON.parse(localStorage.getItem("abyssalArchive.save.v1") ?? "{}")?.lastInterlude?.ackRequired === false;
      } catch {
        return false;
      }
    })()
  }))()`);
  if (fresh.count !== 1 || fresh.fresh !== 1 || fresh.dismiss !== 0 || !fresh.oneShot || !fresh.savedDismissed || !fresh.savedAckRequired) {
    throw new Error(`Act interlude initial state failed: ${JSON.stringify(fresh)}`);
  }
  await clickSelector(cdp, "[data-action='open-relics']");
  await waitForSelector(cdp, ".relic-modal");
  await clickSelector(cdp, "[data-action='close-relics']");
  await waitForSelector(cdp, ".map-layout");
  const hiddenAfterReturn = await evaluate(cdp, `(() => ({
    count: document.querySelectorAll(".act-interlude").length,
    fresh: document.querySelectorAll(".act-interlude.is-new").length,
    active: document.querySelectorAll(".act-interlude.is-active").length,
    compact: document.querySelectorAll(".act-interlude.is-compact").length,
    dismiss: document.querySelectorAll("[data-action='dismiss-act-interlude']").length,
    map: Boolean(document.querySelector(".map-layout")),
    savedAckRequired: (() => {
      try {
        return JSON.parse(localStorage.getItem("abyssalArchive.save.v1") ?? "{}")?.lastInterlude?.ackRequired === false;
      } catch {
        return false;
      }
    })(),
    savedDismissed: (() => {
      try {
        return JSON.parse(localStorage.getItem("abyssalArchive.save.v1") ?? "{}")?.lastInterlude?.dismissed === true;
      } catch {
        return false;
      }
    })()
  }))()`);
  if (hiddenAfterReturn.count !== 0 || hiddenAfterReturn.dismiss !== 0 || !hiddenAfterReturn.map || !hiddenAfterReturn.savedAckRequired || !hiddenAfterReturn.savedDismissed) {
    throw new Error(`Act interlude one-shot return state failed: ${JSON.stringify(hiddenAfterReturn)}`);
  }
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".map-layout");
  const persistedSeen = await evaluate(cdp, `(() => ({
    count: document.querySelectorAll(".act-interlude").length,
    active: document.querySelectorAll(".act-interlude.is-active").length,
    compact: document.querySelectorAll(".act-interlude.is-compact").length,
    map: Boolean(document.querySelector(".map-layout")),
    savedSeen: (() => {
      try {
        return Number.isFinite(JSON.parse(localStorage.getItem("abyssalArchive.save.v1") ?? "{}")?.lastInterlude?.seenAt);
      } catch {
        return false;
      }
    })(),
    savedAckRequired: (() => {
      try {
        return JSON.parse(localStorage.getItem("abyssalArchive.save.v1") ?? "{}")?.lastInterlude?.ackRequired === false;
      } catch {
        return false;
      }
    })(),
    savedDismissed: (() => {
      try {
        return JSON.parse(localStorage.getItem("abyssalArchive.save.v1") ?? "{}")?.lastInterlude?.dismissed === true;
      } catch {
        return false;
      }
    })()
  }))()`);
  if (persistedSeen.count !== 0 || persistedSeen.active !== 0 || persistedSeen.compact !== 0 || !persistedSeen.map || !persistedSeen.savedSeen || !persistedSeen.savedAckRequired || !persistedSeen.savedDismissed) {
    throw new Error(`Act interlude persisted one-shot failed: ${JSON.stringify(persistedSeen)}`);
  }
  await evaluate(cdp, `(() => {
    const raw = localStorage.getItem("abyssalArchive.save.v1");
    if (!raw) throw new Error("saved run missing");
    const save = JSON.parse(raw);
    const key = save.lastInterlude?.presentationKey;
    if (!key) throw new Error("interlude key missing");
    save.lastInterlude.dismissed = false;
    save.lastInterlude.ackRequired = true;
    save.lastInterlude.seenAt = null;
    save.lastInterlude.dismissedAt = null;
    save.lastInterlude.at = Date.now() + 7777;
    save.runFlags ??= {};
    save.runFlags.seenActInterludes ??= [];
    if (!save.runFlags.seenActInterludes.includes(key)) save.runFlags.seenActInterludes.push(key);
    const payload = JSON.stringify(save);
    localStorage.setItem("abyssalArchive.save.v1", payload);
    localStorage.setItem("abyssalArchive.save.backup.v1", payload);
  })()`);
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".map-layout");
  const duplicateGuard = await evaluate(cdp, `(() => {
    const save = JSON.parse(localStorage.getItem("abyssalArchive.save.v1") ?? "{}");
    const key = save.lastInterlude?.presentationKey ?? "";
    return {
      count: document.querySelectorAll(".act-interlude").length,
      active: document.querySelectorAll(".act-interlude.is-active").length,
      fresh: document.querySelectorAll(".act-interlude.is-new").length,
      map: Boolean(document.querySelector(".map-layout")),
      savedDismissed: save.lastInterlude?.dismissed === true,
      savedAckRequired: save.lastInterlude?.ackRequired === false,
      runFlagSeen: Array.isArray(save.runFlags?.seenActInterludes) && save.runFlags.seenActInterludes.includes(key)
    };
  })()`);
  if (duplicateGuard.count !== 0 || duplicateGuard.active !== 0 || duplicateGuard.fresh !== 0 || !duplicateGuard.map || !duplicateGuard.savedDismissed || !duplicateGuard.savedAckRequired || !duplicateGuard.runFlagSeen) {
    throw new Error(`Act interlude duplicate guard failed: ${JSON.stringify(duplicateGuard)}`);
  }
  await capture(cdp, "browser-qa-act-interlude-one-shot.png");
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".map-layout");
  const persisted = await evaluate(cdp, `(() => ({
    count: document.querySelectorAll(".act-interlude").length,
    map: Boolean(document.querySelector(".map-layout")),
    savedDismissed: (() => {
      try {
        return JSON.parse(localStorage.getItem("abyssalArchive.save.v1") ?? "{}")?.lastInterlude?.dismissed === true;
      } catch {
        return false;
      }
    })()
  }))()`);
  if (persisted.count !== 0 || !persisted.map || !persisted.savedDismissed) {
    throw new Error(`Act interlude persisted dismissal failed: ${JSON.stringify(persisted)}`);
  }
}

async function assertBossStatusStrip(cdp) {
  const result = await evaluate(cdp, `(() => {
    const strip = document.querySelector(".boss-status-strip");
    const boss = document.querySelector(".enemy-card:has(.enemy-sprite.tier-boss)");
    const phaseTwoSprite = document.querySelector(".enemy-sprite.tier-boss.phase-two");
    const phaseTwoArt = phaseTwoSprite?.querySelector(".enemy-sprite-art");
    const spriteKey = phaseTwoSprite?.dataset.sprite ?? "";
    const phaseTwoSpriteImage = phaseTwoArt ? getComputedStyle(phaseTwoArt).backgroundImage : "";
    const expectedPhaseTwoImage = spriteKey ? \`boss-\${spriteKey}-phase2.png\` : "";
    const meter = strip?.querySelector(".boss-status-meter");
    const intent = strip?.querySelector("small");
    const objective = strip?.querySelector(".boss-objective");
    const stripBox = strip?.getBoundingClientRect();
    const bossBox = boss?.getBoundingClientRect();
    const objectiveBox = objective?.getBoundingClientRect();
    const meterBox = meter?.getBoundingClientRect();
    const intentBox = intent?.getBoundingClientRect();
    const handBox = document.querySelector(".hand-zone")?.getBoundingClientRect();
    const playerPlateBox = document.querySelector(".boss-fight .player-plate")?.getBoundingClientRect();
    const playerSpriteBox = document.querySelector(".boss-fight .player-sprite")?.getBoundingClientRect();
    const style = strip ? getComputedStyle(strip) : null;
    const text = strip?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const aria = strip?.getAttribute("aria-label") ?? "";
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
    const overlaps = (a, b) => Boolean(a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top));
    const playerVitalsClearHand = Boolean(
      handBox &&
      playerPlateBox &&
      playerSpriteBox &&
      playerPlateBox.bottom <= handBox.top - 10 &&
      playerSpriteBox.bottom <= handBox.top - 6
    );
    const ok =
      Boolean(strip) &&
      Boolean(boss) &&
      Boolean(meter) &&
      Boolean(intent) &&
      Boolean(objective) &&
      text.includes("보스") &&
      text.includes("본체 처치") &&
      /2단계|레퀴엠|충돌|폭주|문/.test(text) &&
      aria.includes("보스 본체를 쓰러뜨리면 전투가 끝납니다") &&
      aria.includes("현재 의도") &&
      aria.includes("전환 체력") &&
      Boolean(phaseTwoSprite) &&
      Boolean(expectedPhaseTwoImage && phaseTwoSpriteImage.includes(expectedPhaseTwoImage)) &&
      Boolean(stripBox && stripBox.top >= 0 && stripBox.bottom < window.innerHeight * 0.36 && stripBox.width <= 424 && stripBox.height <= 88) &&
      (!bossBox || stripBox.bottom < bossBox.bottom) &&
      style?.pointerEvents === "none" &&
      !overlaps(objectiveBox, meterBox) &&
      !overlaps(objectiveBox, intentBox) &&
      playerVitalsClearHand &&
      !overflow;
    return {
      ok,
      text,
      aria,
      hasStrip: Boolean(strip),
      hasBoss: Boolean(boss),
      hasPhaseTwoSprite: Boolean(phaseTwoSprite),
      spriteKey,
      phaseTwoSpriteImage,
      expectedPhaseTwoImage,
      hasMeter: Boolean(meter),
      hasIntent: Boolean(intent),
      hasObjective: Boolean(objective),
      stripTop: stripBox ? Math.round(stripBox.top) : null,
      stripBottom: stripBox ? Math.round(stripBox.bottom) : null,
      stripWidth: stripBox ? Math.round(stripBox.width) : null,
      stripHeight: stripBox ? Math.round(stripBox.height) : null,
      bossBottom: bossBox ? Math.round(bossBox.bottom) : null,
      objectiveBox: objectiveBox ? { x: Math.round(objectiveBox.x), y: Math.round(objectiveBox.y), width: Math.round(objectiveBox.width), height: Math.round(objectiveBox.height) } : null,
      meterBox: meterBox ? { x: Math.round(meterBox.x), y: Math.round(meterBox.y), width: Math.round(meterBox.width), height: Math.round(meterBox.height) } : null,
      intentBox: intentBox ? { x: Math.round(intentBox.x), y: Math.round(intentBox.y), width: Math.round(intentBox.width), height: Math.round(intentBox.height) } : null,
      playerVitalsClearHand,
      handTop: handBox ? Math.round(handBox.top) : null,
      playerPlateBox: playerPlateBox ? { top: Math.round(playerPlateBox.top), bottom: Math.round(playerPlateBox.bottom), width: Math.round(playerPlateBox.width), height: Math.round(playerPlateBox.height) } : null,
      playerSpriteBox: playerSpriteBox ? { top: Math.round(playerSpriteBox.top), bottom: Math.round(playerSpriteBox.bottom), width: Math.round(playerSpriteBox.width), height: Math.round(playerSpriteBox.height) } : null,
      pointerEvents: style?.pointerEvents ?? "",
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Boss status strip failed: ${JSON.stringify(result)}`);
  }
}

async function assertFinalBossReadinessUx(cdp) {
  const result = await evaluate(cdp, `(() => {
    const horizon = document.querySelector(".map-horizon");
    const horizonText = horizon?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const tags = [...document.querySelectorAll(".map-horizon-boss i")].map((item) => item.innerText.replace(/\\s+/g, " ").trim());
    const serialDefense = tags.find((text) => text.includes("연속 방어"));
    const ok =
      Boolean(horizon) &&
      horizonText.includes("마지막 문 성가대") &&
      horizonText.includes("연속 방어") &&
      horizonText.includes("보스층") &&
      Boolean(serialDefense);
    return {
      ok,
      horizonText,
      tags,
      hasHorizon: Boolean(horizon)
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Final boss readiness failed: ${JSON.stringify(result)}`);
  }
}

async function assertFinalBossSelectorUx(cdp) {
  const result = await evaluate(cdp, `(() => {
    const modal = document.querySelector(".deck-modal");
    const brief = document.querySelector(".selector-brief.with-boss");
    const bossBrief = document.querySelector(".selector-boss-brief");
    const focus = document.querySelector(".selector-focus");
    const recommended = document.querySelector(".deck-select-option.recommended");
    const metricRows = [...document.querySelectorAll(".deck-choice-metrics")];
    const modalText = modal?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const focusText = focus?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const bossText = bossBrief?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const recommendedText = recommended?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const metricText = metricRows.map((row) => row.innerText.replace(/\\s+/g, " ").trim()).join(" ");
    const metricChipsFit = metricRows.every((row) => [...row.querySelectorAll("i")].every((chip) => chip.scrollWidth <= chip.clientWidth + 2));
    const modalBox = modal?.getBoundingClientRect();
    const modalFits = modalBox ? modalBox.width <= window.innerWidth && modalBox.height <= window.innerHeight : false;
    const ok =
      Boolean(modal) &&
      modal?.classList.contains("selector-modal") &&
      Boolean(brief) &&
      bossText.includes("보스 대비") &&
      bossText.includes("연속 방어") &&
      focusText.includes("보스 대비") &&
      focusText.includes("마지막 문") &&
      recommendedText.includes("창백한 방화벽") &&
      metricRows.length >= 5 &&
      metricText.includes("선택 확정") &&
      /비용|덱/.test(metricText) &&
      metricChipsFit &&
      modalFits;
    return { ok, modalText, bossText, focusText, recommendedText, metricText, metricRows: metricRows.length, metricChipsFit, modalFits };
  })()`);
  if (!result.ok) {
    throw new Error(`Final boss selector failed: ${JSON.stringify(result)}`);
  }
}

async function assertEventSceneUx(cdp) {
  const result = await evaluate(cdp, `(() => {
    const layout = document.querySelector(".event-layout");
    const illustration = document.querySelector(".event-illustration");
    const set = document.querySelector(".event-scene-set");
    const diver = document.querySelector(".event-diver-sprite");
    const mainProp = document.querySelector(".event-scene-prop.main");
    const sideProp = document.querySelector(".event-scene-prop.side");
    const floor = document.querySelector(".event-scene-floor");
    const marker = document.querySelector(".event-scene-marker");
    const brief = document.querySelector(".event-scene-brief");
    const choices = [...document.querySelectorAll(".event-choice")];
    const outcomes = [...document.querySelectorAll(".event-choice-outcome")];
    if (!layout || !illustration || !set || !diver || !mainProp || !sideProp || !floor || !marker || !brief || choices.length < 2) {
      return {
        ok: false,
        reason: "missing-elements",
        hasLayout: Boolean(layout),
        hasIllustration: Boolean(illustration),
        hasSet: Boolean(set),
        hasDiver: Boolean(diver),
        hasMainProp: Boolean(mainProp),
        hasSideProp: Boolean(sideProp),
        hasFloor: Boolean(floor),
        hasMarker: Boolean(marker),
        hasBrief: Boolean(brief),
        choiceCount: choices.length
      };
    }
    const illustrationStyle = getComputedStyle(illustration);
    const diverStyle = getComputedStyle(diver);
    const propStyle = getComputedStyle(mainProp);
    const sideStyle = getComputedStyle(sideProp);
    const illustrationBox = illustration.getBoundingClientRect();
    const diverBox = diver.getBoundingClientRect();
    const propBox = mainProp.getBoundingClientRect();
    const briefBox = brief.getBoundingClientRect();
    const recommended = document.querySelectorAll(".event-choice.recommended").length;
    const choiceHeights = choices.map((choice) => Math.round(choice.getBoundingClientRect().height));
    const ok =
      illustrationBox.height >= 300 &&
      diverBox.height >= 108 &&
      propBox.width >= 150 &&
      briefBox.bottom <= illustrationBox.bottom &&
      recommended === 1 &&
      outcomes.length >= 1 &&
      choiceHeights.every((height) => height <= 132) &&
      illustrationStyle.backgroundImage.includes("event-backdrops") &&
      diverStyle.backgroundImage.includes("player-sprite") &&
      propStyle.backgroundImage.includes("arena-props") &&
      sideStyle.backgroundImage.includes("arena-props");
    return {
      ok,
      illustrationHeight: Math.round(illustrationBox.height),
      diverHeight: Math.round(diverBox.height),
      propWidth: Math.round(propBox.width),
      recommended,
      outcomes: outcomes.length,
      choiceHeights,
      illustrationBackground: illustrationStyle.backgroundImage,
      diverBackground: diverStyle.backgroundImage,
      propBackground: propStyle.backgroundImage
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Event scene UX failed: ${JSON.stringify(result)}`);
  }
}

async function assertChoicePulseNextStep(cdp) {
  const result = await evaluate(cdp, `(() => {
    const pulse = document.querySelector(".choice-result-pulse");
    const chipTexts = [...(pulse?.querySelectorAll("i") ?? [])].map((chip) => chip.innerText.trim());
    const text = pulse?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const box = pulse?.getBoundingClientRect();
    const nextChip = chipTexts.includes("다음 경로 선택");
    const withinViewport = Boolean(box && box.width > 0 && box.height > 0 && box.left >= 0 && box.right <= window.innerWidth + 2 && box.top >= 0);
    const compact = chipTexts.length <= 4;
    return { ok: Boolean(pulse) && nextChip && withinViewport && compact, text, chipTexts, withinViewport, compact };
  })()`);
  if (!result.ok) {
    throw new Error(`Choice pulse next step failed: ${JSON.stringify(result)}`);
  }
}

async function playUntilReward(cdp) {
  let capturedCoda = false;
  const seenCodaIds = new Set();
  for (let step = 0; step < 80; step += 1) {
    const state = await evaluate(cdp, `(() => ({
      phase: document.querySelector(".game-screen")?.className ?? "",
      reward: Boolean(document.querySelector(".reward-layout")),
      coda: Boolean(document.querySelector(".combat-victory-coda")),
      codaId: document.querySelector(".combat-victory-coda")?.dataset?.codaId ?? "",
      codaEnemyCount: document.querySelectorAll(".combat-victory-coda.quick .victory-coda-enemy").length,
      codaEnemyMaxHeight: Math.max(0, ...[...document.querySelectorAll(".combat-victory-coda.quick .victory-coda-enemy")].map((enemy) => Math.round(enemy.getBoundingClientRect().height))),
      codaRewardCount: document.querySelectorAll(".combat-victory-coda.quick .victory-coda-rewards i").length,
      codaDismissCount: document.querySelectorAll(".combat-victory-coda.quick [data-action='dismiss-victory-coda']").length,
      codaTopBarVisible: Boolean(document.querySelector(".phase-combat-victory > .top-bar")),
      combat: Boolean(document.querySelector(".combat-board")),
      hand: document.querySelectorAll("[data-action='play-card']:not(:disabled)").length
    }))()`);
    if (state.reward) return true;
    if (state.coda) {
      if (state.codaId) seenCodaIds.add(state.codaId);
      if (seenCodaIds.size > 1) throw new Error(`Victory coda duplicated before reward: ${JSON.stringify([...seenCodaIds])}`);
      if (state.codaEnemyCount < 1 || state.codaRewardCount < 1) {
        throw new Error(`Victory coda lacks combat payoff: ${JSON.stringify(state)}`);
      }
      if (state.codaEnemyMaxHeight < 108 || state.codaDismissCount !== 1) {
        throw new Error(`Victory coda lacks clear payoff control: ${JSON.stringify(state)}`);
      }
      if (state.codaTopBarVisible) {
        throw new Error(`Victory coda should hide regular HUD: ${JSON.stringify(state)}`);
      }
      if (!capturedCoda) {
        await capture(cdp, "browser-qa-victory-coda.png");
        capturedCoda = true;
      }
      const hasDismiss = await evaluate(cdp, `Boolean(document.querySelector("[data-action='dismiss-victory-coda']"))`);
      if (hasDismiss) await clickSelector(cdp, "[data-action='dismiss-victory-coda']");
      else await wait(1700);
      continue;
    }
    if (!state.combat) return false;
    const action = await evaluate(cdp, `(() => {
      const cards = [...document.querySelectorAll("[data-action='play-card']:not(:disabled)")];
      const attack = cards.find((card) => /피해|공격|표식|바이러스/.test(card.innerText));
      const card = attack ?? cards[0] ?? null;
      if (card) {
        card.click();
        return "card";
      }
      const end = document.querySelector("[data-action='end-turn']");
      if (end && !end.disabled) {
        end.click();
        return "end";
      }
      return "none";
    })()`);
    await wait(action === "end" ? 4300 : 720);
  }
  return Boolean(await evaluate(cdp, `Boolean(document.querySelector(".reward-layout"))`));
}

async function captureVictoryCodaFlow(cdp) {
  await stageVictoryCodaFixture(cdp);
  await navigate(cdp, baseUrl);
  await clickText(cdp, "이어하기");
  await waitForSelector(cdp, ".combat-board");
  await clickSelector(cdp, ".hand-zone .game-card[data-action='play-card']:not(:disabled)");
  await waitForSelector(cdp, ".combat-victory-coda.quick");
  await wait(860);
  const codaEvidence = await assertVictoryCodaUx(cdp);
  await capture(cdp, "browser-qa-victory-coda.png");
  await clickSelector(cdp, "[data-action='dismiss-victory-coda']");
  await waitForSelector(cdp, ".reward-layout");
  const rewardEvidence = await assertSingleRewardSurface(cdp);
  await assertRewardDecisionUx(cdp);
  await capture(cdp, "browser-qa-reward-refreshed.png");
  await capture(cdp, "browser-qa-reward-post-victory-refreshed.png");
  await clearSavedRun(cdp);
  return {
    rewardReachedAfterVictory: true,
    victoryOverlayDuplicated: codaEvidence.codaCount !== 1 || rewardEvidence.victoryCodas !== 0,
    codaId: codaEvidence.codaId,
    codaActionText: codaEvidence.actionText,
    codaEnemyHeight: codaEvidence.enemyHeight,
    codaSpriteHeight: codaEvidence.spriteHeight,
    rewardSurfaceCountAfterVictory: rewardEvidence.rewardLayouts,
    rewardSkipChoices: rewardEvidence.rewardSkipChoices
  };
}

async function assertVictoryCodaUx(cdp) {
  const result = await evaluate(cdp, `(() => {
    const coda = document.querySelector(".combat-victory-coda.quick");
    const enemy = coda?.querySelector(".victory-coda-enemy");
    const enemySprite = enemy?.querySelector(".enemy-sprite");
    const summary = coda?.querySelector(".victory-coda-summary");
    const rewards = coda?.querySelector(".victory-coda-rewards");
    const action = coda?.querySelector("[data-action='dismiss-victory-coda']");
    const actionHint = coda?.querySelector(".victory-coda-actions small");
    const boxes = [coda, enemy, enemySprite, summary, rewards, action].map((item) => item?.getBoundingClientRect?.() ?? null);
    const [codaBox, enemyBox, spriteBox, summaryBox, rewardsBox, actionBox] = boxes;
    const visible = (box) => Boolean(box && box.width > 0 && box.height > 0 && box.top >= -2 && box.bottom <= window.innerHeight + 2);
    const order =
      Boolean(enemyBox && summaryBox && rewardsBox && actionBox) &&
      enemyBox.top < summaryBox.top &&
      summaryBox.bottom <= rewardsBox.top + 4 &&
      rewardsBox.bottom <= actionBox.top + 8;
    const actionStyle = action ? getComputedStyle(action) : null;
    const ok =
      Boolean(coda) &&
      coda?.dataset?.codaId &&
      visible(codaBox) &&
      visible(enemyBox) &&
      visible(spriteBox) &&
      visible(actionBox) &&
      (enemyBox?.height ?? 0) >= 108 &&
      (spriteBox?.height ?? 0) >= 78 &&
      order &&
      actionStyle?.opacity !== "0" &&
      action?.innerText?.includes("보상 확인") &&
      actionHint?.innerText?.includes("자동 이동") &&
      document.querySelectorAll(".combat-victory-coda").length === 1 &&
      document.querySelectorAll(".reward-layout").length === 0 &&
      document.querySelectorAll(".phase-transition").length === 0;
    return {
      ok,
      hasCoda: Boolean(coda),
      codaId: coda?.dataset?.codaId ?? "",
      enemyHeight: Math.round(enemyBox?.height ?? 0),
      spriteHeight: Math.round(spriteBox?.height ?? 0),
      order,
      actionText: action?.innerText?.replace(/\\s+/g, " ").trim() ?? "",
      actionOpacity: actionStyle?.opacity ?? "",
      actionHint: actionHint?.innerText?.replace(/\\s+/g, " ").trim() ?? "",
      codaCount: document.querySelectorAll(".combat-victory-coda").length,
      rewardCount: document.querySelectorAll(".reward-layout").length,
      transitionCount: document.querySelectorAll(".phase-transition").length,
      boxes: {
        coda: codaBox ? { top: Math.round(codaBox.top), bottom: Math.round(codaBox.bottom), width: Math.round(codaBox.width), height: Math.round(codaBox.height) } : null,
        enemy: enemyBox ? { top: Math.round(enemyBox.top), bottom: Math.round(enemyBox.bottom), width: Math.round(enemyBox.width), height: Math.round(enemyBox.height) } : null,
        sprite: spriteBox ? { top: Math.round(spriteBox.top), bottom: Math.round(spriteBox.bottom), width: Math.round(spriteBox.width), height: Math.round(spriteBox.height) } : null,
        action: actionBox ? { top: Math.round(actionBox.top), bottom: Math.round(actionBox.bottom), width: Math.round(actionBox.width), height: Math.round(actionBox.height) } : null
      }
    };
  })()`);
  if (!result.ok) throw new Error(`Victory coda UX failed: ${JSON.stringify(result)}`);
  return result;
}

async function assertSingleRewardSurface(cdp) {
  const result = await evaluate(cdp, `(() => ({
    rewardLayouts: document.querySelectorAll(".reward-layout").length,
    victoryCodas: document.querySelectorAll(".combat-victory-coda").length,
    phaseTransitions: document.querySelectorAll(".phase-transition").length,
    choicePulses: document.querySelectorAll(".choice-result-pulse").length,
    rewardActionBars: document.querySelectorAll(".reward-action-bar").length,
    rewardReadinessPanels: document.querySelectorAll(".reward-readiness").length,
    rewardSkipChoices: document.querySelectorAll(".reward-skip-choice").length
  }))()`);
  const ok = result.rewardLayouts === 1 && result.victoryCodas === 0 && result.phaseTransitions === 0 && result.choicePulses <= 1 && result.rewardActionBars === 0 && result.rewardReadinessPanels === 0 && result.rewardSkipChoices === 1;
  if (!ok) throw new Error(`Reward surface duplicated: ${JSON.stringify(result)}`);
  return result;
}

async function assertRewardDecisionUx(cdp) {
  const result = await evaluate(cdp, `(() => {
    const reward = document.querySelector(".reward-layout");
    const heading = document.querySelector(".reward-copy h2");
    const sourceChip = document.querySelector(".reward-source-chip");
    const flow = document.querySelector(".reward-flow");
    const flowTitle = flow?.querySelector(".reward-flow-copy strong");
    const flowDetail = flow?.querySelector(".reward-flow-copy small");
    const flowSteps = [...(flow?.querySelectorAll(".reward-flow-steps span") ?? [])];
    const skip = document.querySelector(".reward-skip-choice");
    const skipLabel = skip?.querySelector(":scope > span");
    const stage = document.querySelector(".reward-choice-stage");
    const spotlightArt = document.querySelector(".reward-spotlight-card-art");
    const spotlightArtImage = spotlightArt?.querySelector(".card-art-image");
    const spotlightArtBackground = spotlightArtImage ? getComputedStyle(spotlightArtImage).backgroundImage : "";
    const relicChoices = [...document.querySelectorAll(".reward-relic-choice")];
    const collapsedRelicEffects = relicChoices.filter((choice) => getComputedStyle(choice.querySelector(".reward-relic-effect")).display === "none").length;
    const relicChoiceHeights = relicChoices.map((choice) => Math.round(choice.getBoundingClientRect().height));
    const pickLines = [...document.querySelectorAll(".reward-pick-line")];
    const metricRows = [...document.querySelectorAll(".reward-pick-metrics")];
    const metricRowTexts = metricRows.map((row) => row.innerText.replace(/\\s+/g, " ").trim());
    const metricChipCounts = metricRows.map((row) => row.querySelectorAll("i").length);
    const metricRowsCompact = metricRows.every((row) => row.getBoundingClientRect().height <= 24);
    const metricChipsFit = metricRows.every((row) => [...row.querySelectorAll("i")].every((chip) => chip.scrollWidth <= chip.clientWidth + 2));
    const expandedPickLines = pickLines.filter((line) => getComputedStyle(line.querySelector("small")).display !== "none").length;
    const visibleDetailButtons = [...document.querySelectorAll(".reward-option-detail")].filter((detail) => {
      const style = getComputedStyle(detail);
      return style.opacity !== "0" && style.pointerEvents !== "none";
    }).length;
    if (!reward || !heading || !sourceChip || !flow || !flowTitle || !flowDetail || !skip || !skipLabel || !stage || !spotlightArt) {
      return {
        ok: false,
        reason: "missing-elements",
        hasReward: Boolean(reward),
        hasHeading: Boolean(heading),
        hasSourceChip: Boolean(sourceChip),
        hasFlow: Boolean(flow),
        hasFlowTitle: Boolean(flowTitle),
        hasFlowDetail: Boolean(flowDetail),
        hasSkip: Boolean(skip),
        hasSkipLabel: Boolean(skipLabel),
        hasStage: Boolean(stage),
        hasSpotlightArt: Boolean(spotlightArt)
      };
    }
    const viewportH = window.innerHeight;
    const flowBox = flow.getBoundingClientRect();
    const skipBox = skip.getBoundingClientRect();
    const skipLabelBox = skipLabel.getBoundingClientRect();
    const skipExpandedByState = skip.classList.contains("recommended") || skip.classList.contains("selected");
    const skipCompact = skipExpandedByState ? skipLabelBox.width >= 64 : skipBox.width <= 54 && skipLabelBox.width <= 4;
    const stageBox = stage.getBoundingClientRect();
    const skipText = skip.innerText.replace(/\\s+/g, " ").trim();
    const flowText = flow.innerText.replace(/\\s+/g, " ").trim();
    const flowTitleText = flowTitle.innerText.replace(/\\s+/g, " ").trim();
    const flowDetailText = flowDetail.innerText.replace(/\\s+/g, " ").trim();
    const headingText = heading.innerText.replace(/\\s+/g, " ").trim();
    const sourceText = sourceChip.innerText.replace(/\\s+/g, " ").trim();
    const previewStageActive = stage.classList.contains("preview-active");
    const previewingOptions = document.querySelectorAll(".reward-option.previewing").length;
    const dimmedOptions = [...document.querySelectorAll(".reward-option:not(.previewing):not(.selected)")].filter((option) => Number(getComputedStyle(option).opacity) < 0.65).length;
    const ok =
      headingText === "보상 선택" &&
      /보상/.test(sourceText) &&
      !/(전투 승리|엘리트 격파|보스 격파)/.test(headingText) &&
      skipText.includes("카드 받지 않기") &&
      flowTitleText.includes("카드") &&
      /고르|넘기/.test(flowDetailText) &&
      flowText.includes("경로") &&
      flowSteps.length >= 2 &&
      flowSteps.filter((step) => step.classList.contains("active")).length === 1 &&
      skipBox.height >= 32 &&
      skipCompact &&
      pickLines.length >= 3 &&
      metricRows.length === pickLines.length &&
      metricChipCounts.every((count) => count === 2) &&
      metricRowTexts.every((text) => /→/.test(text) && /비용/.test(text)) &&
      metricRowsCompact &&
      metricChipsFit &&
      expandedPickLines <= 1 &&
      visibleDetailButtons <= 1 &&
      (relicChoices.length === 0 || collapsedRelicEffects === relicChoices.length) &&
      relicChoiceHeights.every((height) => height <= 94) &&
      previewStageActive &&
      previewingOptions === 1 &&
      dimmedOptions >= 1 &&
      (spotlightArt.classList.contains("empty") || spotlightArtBackground.includes("card-illustrations")) &&
      flowBox.top >= 0 &&
      flowBox.bottom <= viewportH &&
      flowBox.bottom < stageBox.top;
    return {
      ok,
      headingText,
      sourceText,
      skipText,
      flowText,
      flowTitleText,
      flowDetailText,
      flowStepCount: flowSteps.length,
      skipHeight: Math.round(skipBox.height),
      skipWidth: Math.round(skipBox.width),
      skipLabelWidth: Math.round(skipLabelBox.width),
      skipExpandedByState,
      pickLineCount: pickLines.length,
      pickMetricRows: metricRows.length,
      metricChipCounts,
      metricRowTexts,
      metricRowsCompact,
      metricChipsFit,
      expandedPickLines,
      visibleDetailButtons,
      relicChoices: relicChoices.length,
      collapsedRelicEffects,
      relicChoiceHeights,
      previewStageActive,
      previewingOptions,
      dimmedOptions,
      spotlightArtBackground,
      flowTop: Math.round(flowBox.top),
      flowBottom: Math.round(flowBox.bottom),
      stageTop: Math.round(stageBox.top),
      viewportH
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Reward decision UX failed: ${JSON.stringify(result)}`);
  }
  await hoverSelector(cdp, ".reward-skip-choice");
  const skipHover = await evaluate(cdp, `(() => {
    const skip = document.querySelector(".reward-skip-choice:hover");
    const label = skip?.querySelector(":scope > span");
    const small = skip?.querySelector("small");
    const box = skip?.getBoundingClientRect();
    const labelBox = label?.getBoundingClientRect();
    const smallStyle = small ? getComputedStyle(small) : null;
    const ok = Boolean(skip) && Boolean(box && box.width >= 180) && Boolean(labelBox && labelBox.width >= 64) && smallStyle?.opacity !== "0";
    return {
      ok,
      width: box ? Math.round(box.width) : 0,
      labelWidth: labelBox ? Math.round(labelBox.width) : 0,
      smallOpacity: smallStyle?.opacity ?? "",
      text: skip?.innerText.replace(/\\s+/g, " ").trim() ?? ""
    };
  })()`);
  if (!skipHover.ok) {
    throw new Error(`Reward skip compact hover failed: ${JSON.stringify(skipHover)}`);
  }
  const hasRelics = result.relicChoices > 0;
  if (hasRelics) {
    await hoverSelector(cdp, ".reward-relic-choice");
    const relicHover = await evaluate(cdp, `(() => {
      const choice = document.querySelector(".reward-relic-choice:hover");
      const effect = choice?.querySelector(".reward-relic-effect");
      const style = effect ? getComputedStyle(effect) : null;
      const box = effect?.getBoundingClientRect();
      const ok = Boolean(choice) && Boolean(effect) && style?.display !== "none" && Boolean(box && box.height > 10 && box.bottom <= window.innerHeight);
      return {
        ok,
        text: effect?.innerText ?? "",
        display: style?.display ?? "",
        box: box ? { height: Math.round(box.height), bottom: Math.round(box.bottom) } : null
      };
    })()`);
    if (!relicHover.ok) {
      throw new Error(`Reward relic hover detail failed: ${JSON.stringify(relicHover)}`);
    }
    await hoverSelector(cdp, ".reward-option .game-card[data-action='reward-card']");
    await waitForSelector(cdp, ".reward-choice-stage.preview-active");
  }
}

async function assertRewardSelectionProgress(cdp) {
  await clickSelector(cdp, ".reward-option .game-card[data-action='reward-card']");
  await waitForSelector(cdp, ".reward-option.selected");
  const result = await evaluate(cdp, `(() => {
    const selected = document.querySelector(".reward-option.selected");
    const selectedStamp = selected?.querySelector(".reward-selected-stamp");
    const selectedStampText = selectedStamp?.innerText ?? "";
    const selectedPickDetail = selected?.querySelector(".reward-pick-line small");
    const selectedPickExpanded = selectedPickDetail ? getComputedStyle(selectedPickDetail).display !== "none" : false;
    const selectedDetailButton = selected?.querySelector(".reward-option-detail");
    const selectedDetailButtonVisible = selectedDetailButton ? getComputedStyle(selectedDetailButton).opacity === "1" : false;
    const flow = document.querySelector(".reward-flow");
    const flowText = flow?.innerText.replace(/\\s+/g, " ").trim() ?? "";
    const flowState = flow?.dataset?.state ?? "";
    const stage = document.querySelector(".reward-choice-stage.with-relics");
    const stageCardReady = stage?.classList.contains("card-ready") ?? false;
    const dimmedUnselectedCards = [...document.querySelectorAll(".reward-option:not(.selected)")].filter((option) => Number(getComputedStyle(option).opacity) < 0.5).length;
    const relicFocus = document.querySelector(".reward-relic-choices");
    const relicFocusColor = relicFocus ? getComputedStyle(relicFocus).borderTopColor : "";
    const relicSelected = document.querySelector(".reward-relic-choice.selected");
    const selectedBox = selected?.getBoundingClientRect();
    const flowBox = flow?.getBoundingClientRect();
    const ok =
      Boolean(selected) &&
      Boolean(stage) &&
      Boolean(flow) &&
      stageCardReady &&
      dimmedUnselectedCards >= 1 &&
      !relicSelected &&
      selectedStampText.includes("선택됨") &&
      selectedPickExpanded &&
      selectedDetailButtonVisible &&
      flowState === "relic" &&
      flowText.includes("유물 선택") &&
      flowText.includes("경로") &&
      Boolean(selectedBox && selectedBox.width >= 160) &&
      Boolean(flowBox && flowBox.bottom <= window.innerHeight);
    return {
      ok,
      selectedStampText,
      selectedPickExpanded,
      selectedDetailButtonVisible,
      flowText,
      flowState,
      stageCardReady,
      dimmedUnselectedCards,
      relicFocusColor,
      relicSelected: Boolean(relicSelected),
      selectedWidth: selectedBox ? Math.round(selectedBox.width) : 0,
      flowBottom: flowBox ? Math.round(flowBox.bottom) : 0,
      viewportH: window.innerHeight
    };
  })()`);
  if (!result.ok) {
    throw new Error(`Reward selection progress failed: ${JSON.stringify(result)}`);
  }
}

async function waitForSelector(cdp, selector) {
  await waitFor(cdp, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, 12000);
}

async function waitForText(cdp, text) {
  await waitFor(cdp, `document.body.innerText.includes(${JSON.stringify(text)})`, 12000);
}

async function waitFor(cdp, expression, timeout) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(cdp, expression)) return;
    await wait(120);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime evaluation failed.");
  }
  return result.result?.value;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
