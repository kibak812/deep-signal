import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { simulateRun } from "./balance-runner.mjs";

const DEFAULT_REPORT_PATH = "qa/release-playtest-report.json";
const SCENARIOS = [
  {
    id: "surface-full-clear",
    label: "표층 전체 완주",
    seed: "release-candidate-d0",
    difficulty: 0,
    expectedWon: true,
    minFloors: 21,
    requiredRouteTypes: ["combat", "event", "shop", "rest", "elite", "boss"]
  },
  {
    id: "deep-final-boss-loss",
    label: "최심층 최종 보스 패배",
    seed: "balance-01-d0-d5",
    difficulty: 5,
    expectedWon: false,
    minFloors: 21,
    requiredRouteTypes: ["combat", "event", "shop", "rest", "boss"]
  }
];

function routeTypes(route) {
  return [...new Set(route.map((entry) => entry.split(":")[1]).filter(Boolean))];
}

function routeCounts(route) {
  return route.reduce((counts, entry) => {
    const type = entry.split(":")[1] ?? "unknown";
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
}

function compactFinalBoss(snapshot) {
  if (!snapshot) return null;
  return {
    turn: snapshot.turn,
    playerHp: snapshot.playerHp,
    playerBlock: snapshot.playerBlock,
    incomingDamage: snapshot.incomingDamage,
    bossHp: snapshot.bossHp,
    bossMaxHp: snapshot.bossMaxHp,
    bossPhase: snapshot.bossPhase,
    bossMove: snapshot.bossMove,
    bossIntent: snapshot.bossIntent,
    hand: snapshot.hand,
    roles: snapshot.roles
  };
}

function scenarioReport(scenario) {
  const result = simulateRun({ seed: scenario.seed, difficulty: scenario.difficulty });
  const types = routeTypes(result.route);
  const checks = {
    reachedSummary: result.phase === "summary",
    noProblems: result.problems.length === 0,
    expectedOutcome: result.won === scenario.expectedWon,
    traversedEnoughFloors: result.floors >= scenario.minFloors,
    requiredRouteCoverage: scenario.requiredRouteTypes.every((type) => types.includes(type)),
    hasReadableReason: typeof result.reason === "string" && result.reason.length >= 8,
    hasBuildEvidence: Array.isArray(result.build) && result.build.length >= 1,
    hasRoleEvidence: Object.keys(result.roleProfile ?? {}).length >= 4
  };
  if (!scenario.expectedWon) {
    checks.defeatDebriefEvidence = Boolean(result.finalBoss) && /쓰러졌습니다/.test(result.reason);
  } else {
    checks.fullClearEvidence = result.bossesDefeated >= 3 && /심해 코어/.test(result.reason);
  }
  return {
    id: scenario.id,
    label: scenario.label,
    seed: scenario.seed,
    difficulty: scenario.difficulty,
    difficultyName: result.difficultyName,
    won: result.won,
    phase: result.phase,
    floors: result.floors,
    bossesDefeated: result.bossesDefeated,
    hp: result.hp,
    maxHp: result.maxHp,
    deckSize: result.deckSize,
    relics: result.relics,
    fights: result.fights,
    elites: result.elites,
    damageDealt: result.damageDealt,
    damageTaken: result.damageTaken,
    reason: result.reason,
    route: result.route,
    routeTypes: types,
    routeCounts: routeCounts(result.route),
    build: result.build,
    roleProfile: result.roleProfile,
    finalBoss: compactFinalBoss(result.finalBoss),
    steps: result.steps,
    problems: result.problems,
    checks
  };
}

function reportComparable(report) {
  return JSON.stringify({ ...report, generatedAt: null });
}

async function writeReportIfChanged(report, reportPath) {
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  try {
    const existing = JSON.parse(await readFile(reportPath, "utf8"));
    if (reportComparable(existing) === reportComparable(report)) return false;
  } catch {
    // Missing or invalid reports should be replaced.
  }
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, serialized);
  return true;
}

function parseCliArgs() {
  const options = { reportPath: DEFAULT_REPORT_PATH };
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--report") {
      options.reportPath = argv[++index];
      continue;
    }
    if (arg.startsWith("--report=")) {
      options.reportPath = arg.slice("--report=".length);
      continue;
    }
    throw new Error(`Unknown playtest option: ${arg}`);
  }
  if (!options.reportPath) throw new Error("--report requires a path.");
  return options;
}

async function main() {
  const options = parseCliArgs();
  const scenarios = SCENARIOS.map(scenarioReport);
  const failed = scenarios.flatMap((scenario) =>
    Object.entries(scenario.checks)
      .filter(([, ok]) => !ok)
      .map(([check]) => `${scenario.id}:${check}`)
  );
  const report = {
    generatedAt: new Date().toISOString(),
    ok: failed.length === 0,
    summary: {
      scenarios: scenarios.length,
      failed: failed.length,
      wins: scenarios.filter((scenario) => scenario.won).length,
      defeats: scenarios.filter((scenario) => !scenario.won).length,
      requiredRouteTypes: [...new Set(SCENARIOS.flatMap((scenario) => scenario.requiredRouteTypes))]
    },
    scenarios
  };
  const written = await writeReportIfChanged(report, options.reportPath);
  if (!report.ok) {
    console.error(`Release playtest failed: ${failed.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Release playtest passed: ${scenarios.length}/${scenarios.length}`);
  console.log(`${written ? "Wrote" : "Report unchanged at"} ${options.reportPath}`);
}

await main();
